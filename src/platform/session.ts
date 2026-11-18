import { ROOM_STORAGE_KEY } from '../config/runtime';

export function storeActiveRoom(roomId: string | null): void {
  try {
    const g = globalThis as unknown as {
      wx?: { setStorageSync?: (key: string, value: string) => void };
      localStorage?: Storage;
    };
    const data = roomId ? JSON.stringify({ roomId, expires: Date.now() + 30 * 60 * 1000 }) : '';
    if (g.wx?.setStorageSync) g.wx.setStorageSync(ROOM_STORAGE_KEY, data);
    else g.localStorage?.setItem(ROOM_STORAGE_KEY, data);
  } catch {}
}

export function readActiveRoom(): string | null {
  try {
    const g = globalThis as unknown as { wx?: { getStorageSync?: (key: string) => string }; localStorage?: Storage };
    const raw = g.wx?.getStorageSync?.(ROOM_STORAGE_KEY) ?? g.localStorage?.getItem(ROOM_STORAGE_KEY);
    const value = raw ? JSON.parse(raw) as { roomId: string; expires: number } : null;
    return value && /^\d{6}$/.test(value.roomId) && value.expires > Date.now() ? value.roomId : null;
  } catch { return null; }
}
