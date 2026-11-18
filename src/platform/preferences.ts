export interface GamePreferences {
  sound: boolean;
  effects: boolean;
  vibration: boolean;
  volume: number;
}

const KEY = 'reversi.audio.options';

export function loadPreferences(): GamePreferences {
  const defaults: GamePreferences = { sound: true, effects: true, vibration: false, volume: 0.55 };
  try {
    const g = globalThis as unknown as {
      wx?: { getStorageSync?: (key: string) => unknown };
      localStorage?: Storage;
      matchMedia?: (query: string) => { matches: boolean };
    };
    defaults.effects = !g.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const raw = g.wx?.getStorageSync?.(KEY) ?? g.localStorage?.getItem(KEY);
    const saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!saved || typeof saved !== 'object') return defaults;
    return {
      sound: typeof saved.sound === 'boolean' ? saved.sound : defaults.sound,
      effects: typeof saved.effects === 'boolean' ? saved.effects : defaults.effects,
      vibration: typeof saved.vibration === 'boolean' ? saved.vibration : defaults.vibration,
      volume: typeof saved.volume === 'number' && Number.isFinite(saved.volume)
        ? Math.max(0, Math.min(1, saved.volume))
        : defaults.volume,
    };
  } catch {
    return defaults;
  }
}

export function savePreferences(preferences: GamePreferences): void {
  try {
    const g = globalThis as unknown as {
      wx?: { setStorageSync?: (key: string, value: string) => void };
      localStorage?: Storage;
    };
    const value = JSON.stringify(preferences);
    if (g.wx?.setStorageSync) g.wx.setStorageSync(KEY, value);
    else g.localStorage?.setItem(KEY, value);
  } catch {
    // A restricted storage environment must not prevent playing.
  }
}
