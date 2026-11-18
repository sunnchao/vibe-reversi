import { afterEach, describe, expect, it } from 'vitest';
import { createPreviewServer } from '../src/preview-server';
import type { Server } from 'node:http';

describe('同 Wi-Fi 邀请预览服务', () => {
  let server: Server | null = null;

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    server = null;
  });

  it('不同浏览器标签获得不同棋手身份，分享房号可加入并双向读到最新棋盘', async () => {
    server = createPreviewServer({ root: process.cwd(), stateDir: null });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('preview server failed to bind');
    const origin = `http://127.0.0.1:${address.port}`;
    const post = (player: string, data: Record<string, unknown>) => fetch(`${origin}/api/reversi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Preview-Player': player },
      body: JSON.stringify(data),
    }).then((response) => response.json()) as Promise<{ ok: boolean; error?: string; playerColor?: number; data?: any }>;

    const host = await post('preview-host-tab-1', { action: 'createRoom', nickname: '房主', equippedSkills: ['bomb'] });
    expect(host.ok).toBe(true);
    expect(host.data.status).toBe('waiting');
    const guest = await post('preview-guest-tab-2', { action: 'joinRoom', roomId: host.data.roomId, nickname: '好友', equippedSkills: ['shield'] });
    expect(guest.ok).toBe(true);
    expect(guest.data.playerColor).toBeUndefined();
    expect(guest.data.gameState.currentPlayer).toBe(1);

    const move = await post('preview-host-tab-1', { action: 'submitMove', roomId: host.data.roomId, actionType: 'move', row: 2, col: 3 });
    expect(move.ok).toBe(true);
    const guestSync = await post('preview-guest-tab-2', { action: 'syncState', roomId: host.data.roomId });
    expect(guestSync.ok).toBe(true);
    expect(guestSync.playerColor).toBe(2);
    expect(guestSync.data.room.gameState.board[2][3]).toBe(1);
    expect(guestSync.data.room.revision).toBeGreaterThan(0);

    const badCoordinate = await post('preview-host-tab-1', { action: 'submitMove', roomId: host.data.roomId, actionType: 'move', row: 80, col: 2 });
    expect(badCoordinate.ok).toBe(false);
    expect(badCoordinate.error).toContain('坐标');

    const config = await fetch(`${origin}/api/config`).then((response) => response.json()) as { shareOrigin: string };
    expect(config.shareOrigin).toContain(`:${address.port}`);
  });

  it('第三位棋手不能挤入房间，已结束房间不能重开给新邀请', async () => {
    server = createPreviewServer({ root: process.cwd(), stateDir: null });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('preview server failed to bind');
    const origin = `http://127.0.0.1:${address.port}`;
    const post = async (player: string, data: Record<string, unknown>) => {
      const response = await fetch(`${origin}/api/reversi`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Preview-Player': player }, body: JSON.stringify(data),
      });
      return response.json() as Promise<{ ok: boolean; error?: string; data?: any }>;
    };
    const host = await post('preview-host-tab-a', { action: 'createRoom' });
    const guest = await post('preview-guest-tab-b', { action: 'joinRoom', roomId: host.data!.roomId });
    const stranger = await post('preview-stranger-tab-c', { action: 'joinRoom', roomId: host.data!.roomId });
    expect(guest.ok).toBe(true);
    expect(stranger.ok).toBe(false);
    const exit = await post('preview-host-tab-a', { action: 'submitMove', roomId: host.data!.roomId, actionType: 'surrender' });
    expect(exit.data!.status).toBe('finished');
    const late = await post('preview-stranger-tab-c', { action: 'joinRoom', roomId: host.data!.roomId });
    expect(late.ok).toBe(false);
  });
});
