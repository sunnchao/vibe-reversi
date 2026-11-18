/// <reference types="@dcloudio/types" />
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { transformSync } from 'esbuild';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeGame } from '../src/friends/game';
import type { FriendRequest, FriendResponse, FriendRoom } from '../src/friends/rooms';
import type { FriendRoomClient } from '../uniapp/lib/room-client';

const require = createRequire(import.meta.url);
const { initPreContext, preJs } = require('@dcloudio/uni-cli-shared/dist/preprocess/index.js') as {
  initPreContext(platform: string): void;
  preJs(source: string, filename: string): string;
};
const filename = resolve('uniapp/lib/room-client.ts');
const source = readFileSync(filename, 'utf8');
const clients: FriendRoomClient[] = [];
const create: FriendRequest = { action: 'friends', op: 'create' };
interface HttpRequest {
  url: string; method: string; timeout: number; data: FriendRequest;
  header: Record<string, string>;
  success(response: { statusCode: number; data: unknown }): void;
  fail(): void;
}
const http = vi.fn((_options: HttpRequest) => {});

// Use the same conditional compiler as the real uni-app build. Without it,
// Vitest would always enter the first (WeChat) branch and never exercise H5.
function clientClass(platform: 'h5' | 'mp-weixin' | 'app', options: { env?: string; apiBase?: string; dev?: boolean } = {}) {
  initPreContext(platform);
  const { code } = transformSync(preJs(source, filename), {
    loader: 'ts', format: 'cjs', target: 'es2020',
    define: {
      'import.meta.env.DEV': JSON.stringify(options.dev ?? false),
      'import.meta.env.VITE_FRIENDS_API_BASE': JSON.stringify(options.apiBase ?? ''),
    },
  });
  const module = { exports: {} };
  const dependencies = (name: string) => {
    if (name === '../../src/config/runtime') return { WECHAT_CLOUD_ENV: options.env ?? 'test-env' };
    if (name === './platform') return { previewIdentity: () => 'preview-player-test' };
    throw new Error(`Unexpected dependency: ${name}`);
  };
  new Function('require', 'module', 'exports', code)(dependencies, module, module.exports);
  return (module.exports as { FriendRoomClient: new () => FriendRoomClient }).FriendRoomClient;
}
function makeClient(Client = clientClass('h5')) {
  const client = new Client(); clients.push(client); return client;
}
function reply(statusCode: number, data: unknown) { http.mockImplementationOnce(options => options.success({ statusCode, data })); }
function room(): FriendRoom {
  const now = Date.now();
  return { code: '123456', hostId: 'host', guestId: 'guest', phase: 'playing', rev: 1,
    created: now, updated: now, expires: now + 600000, hostSeen: now, guestSeen: now, game: makeGame('room') };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  http.mockReset();
  vi.stubGlobal('uni', { request: http });
  vi.stubGlobal('wx', undefined);
});
afterEach(() => {
  clients.splice(0).forEach(client => client.stop());
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('FriendRoomClient H5 transport', () => {
  it('posts the request with its per-tab player identity to the same-origin service', async () => {
    const client = makeClient(); const response = { ok: true, room: room(), color: 1 };
    reply(200, response);
    expect(await client.request(create)).toEqual(response);
    expect(http).toHaveBeenCalledWith(expect.objectContaining({
      url: '/api/friends', method: 'POST', timeout: 10000, data: create,
      header: { 'Content-Type': 'application/json', 'X-Preview-Player': 'preview-player-test' },
    }));
  });

  it('uses the configured service base and removes trailing slashes', async () => {
    const client = makeClient(clientClass('h5', { apiBase: ' https://friends.example.test/preview/// ' }));
    reply(200, { ok: false, error: '邀请已过期' });
    expect(await client.request(create)).toEqual({ ok: false, error: '邀请已过期' });
    expect(http.mock.calls[0][0].url).toBe('https://friends.example.test/preview/api/friends');
  });

  it.each([
    [404, { error: 'not found' }],
    [200, '<!doctype html><html>static fallback</html>'],
    [200, null],
  ])('explains an unconnected static host without developer commands (%s)', async (status, data) => {
    const client = makeClient(); reply(status as number, data);
    const response = await client.request(create);
    expect(response.ok).toBe(false);
    expect(response.error).toContain('当前静态预览页暂未连接联机服务');
    expect(response.error).not.toMatch(/npm run|VITE_|开发提示/);
  });

  it('only appends local setup instructions in development', async () => {
    const client = makeClient(clientClass('h5', { dev: true })); reply(404, 'Not found');
    expect((await client.request(create)).error).toContain('npm run dev:h5');
  });

  it.each([[503, { ok: true }], [200, { unexpected: true }]])('handles server errors and incompatible JSON (%s)', async (status, data) => {
    const client = makeClient(); reply(status, data);
    expect(await client.request(create)).toEqual({ ok: false, error: '棋桌服务暂不可用，请稍后重试。' });
  });

  it('returns a recoverable message for network failure', async () => {
    const client = makeClient(); http.mockImplementationOnce(options => options.fail());
    expect(await client.request(create)).toEqual({ ok: false, error: '棋桌连接中断，请检查网络后重试。' });
  });
});

describe('FriendRoomClient WeChat transport', () => {
  it('rejects a missing cloud environment without calling the SDK', async () => {
    const cloud = { init: vi.fn(), callFunction: vi.fn() }; vi.stubGlobal('wx', { cloud });
    const client = makeClient(clientClass('mp-weixin', { env: '' }));
    expect((await client.request(create)).error).toContain('配置微信云环境');
    expect(cloud.init).not.toHaveBeenCalled(); expect(cloud.callFunction).not.toHaveBeenCalled();
    expect(http).not.toHaveBeenCalled();
  });

  it('explains a missing wx.cloud API', async () => {
    const client = makeClient(clientClass('mp-weixin'));
    expect((await client.request(create)).error).toContain('配置微信云环境');
    expect(http).not.toHaveBeenCalled();
  });

  it('initializes the shared SDK only once, including across client instances', async () => {
    const response = { ok: true, room: room(), color: 1 };
    const cloud = { init: vi.fn(), callFunction: vi.fn().mockResolvedValue({ result: response }) };
    vi.stubGlobal('wx', { cloud });
    const Client = clientClass('mp-weixin'); const first = makeClient(Client); const second = makeClient(Client);
    expect(await first.request(create)).toEqual(response);
    await first.request(create); await second.request(create);
    expect(cloud.init).toHaveBeenCalledTimes(1);
    expect(cloud.init).toHaveBeenCalledWith({ env: 'test-env', traceUser: true });
    expect(cloud.callFunction).toHaveBeenCalledTimes(3);
    expect(cloud.callFunction).toHaveBeenCalledWith({ name: 'reversiRoom', data: create });
    expect(http).not.toHaveBeenCalled();
  });

  it.each([undefined, null, { ok: 'yes' }, { data: {} }])('rejects unexpected cloud-function result %s', async result => {
    vi.stubGlobal('wx', { cloud: { init: vi.fn(), callFunction: vi.fn().mockResolvedValue({ result }) } });
    const client = makeClient(clientClass('mp-weixin'));
    expect((await client.request(create)).error).toContain('云函数需要更新');
  });

  it('recovers from SDK initialization failure and retries initialization next time', async () => {
    const cloud = { init: vi.fn().mockImplementationOnce(() => { throw new Error('offline'); }),
      callFunction: vi.fn().mockResolvedValue({ result: { ok: false, error: '邀请已过期' } }) };
    vi.stubGlobal('wx', { cloud }); const client = makeClient(clientClass('mp-weixin'));
    expect((await client.request(create)).error).toContain('暂时无法连接');
    expect(await client.request(create)).toEqual({ ok: false, error: '邀请已过期' });
    expect(cloud.init).toHaveBeenCalledTimes(2);
  });

  it('handles rejected cloud requests without losing the initialized SDK', async () => {
    const cloud = { init: vi.fn(), callFunction: vi.fn().mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ result: { ok: true } }) };
    vi.stubGlobal('wx', { cloud }); const client = makeClient(clientClass('mp-weixin'));
    expect((await client.request(create)).error).toContain('暂时无法连接');
    expect(await client.request(create)).toEqual({ ok: true });
    expect(cloud.init).toHaveBeenCalledTimes(1);
  });
});

describe('FriendRoomClient polling lifecycle', () => {
  it('polls after 900ms, then 1500ms, and reports reconnecting followed by connected', async () => {
    const client = makeClient(); const current = room();
    const request = vi.spyOn(client, 'request').mockResolvedValueOnce({ ok: false, error: 'offline' })
      .mockResolvedValue({ ok: true, room: current, color: 2 });
    const onRoom = vi.fn(); const onStatus = vi.fn(); client.watch(current.code, onRoom, onStatus);
    await vi.advanceTimersByTimeAsync(899); expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledWith({ action: 'friends', op: 'sync', code: current.code });
    expect(onStatus).toHaveBeenLastCalledWith('reconnecting', 'offline'); expect(onRoom).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1499); expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(onStatus.mock.calls.map(call => call[0])).toEqual(['reconnecting', 'connected']);
    expect(onRoom).toHaveBeenCalledWith(current, 2);
    await vi.advanceTimersByTimeAsync(1500); expect(request).toHaveBeenCalledTimes(3);
    client.stop(); await vi.advanceTimersByTimeAsync(10000); expect(request).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('discards a response that arrives after stop and does not schedule another poll', async () => {
    const client = makeClient(); const pending = deferred<FriendResponse>();
    vi.spyOn(client, 'request').mockReturnValueOnce(pending.promise);
    const onRoom = vi.fn(); const onStatus = vi.fn(); client.watch('123456', onRoom, onStatus);
    await vi.advanceTimersByTimeAsync(900); client.stop();
    pending.resolve({ ok: true, room: room() }); await vi.advanceTimersByTimeAsync(0);
    expect(onRoom).not.toHaveBeenCalled(); expect(onStatus).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('carries the current name and avatar on every polling sync', async () => {
    const client = makeClient(); const current = room();
    const request = vi.spyOn(client, 'request').mockResolvedValue({ ok: true, room: current, color: 1 });
    const profile = vi.fn(() => ({ name: '阿黑', avatar: 'https://example.test/a.png' }));
    client.watch(current.code, vi.fn(), vi.fn(), profile);
    await vi.advanceTimersByTimeAsync(900);
    expect(request).toHaveBeenLastCalledWith({
      action: 'friends', op: 'sync', code: current.code,
      name: '阿黑', avatar: 'https://example.test/a.png',
    });
    await vi.advanceTimersByTimeAsync(1500);
    expect(profile).toHaveBeenCalledTimes(2);
    client.stop();
  });

  it('ignores the previous generation when watch restarts while a sync is in flight', async () => {
    const client = makeClient(); const pending = deferred<FriendResponse>(); const current = { ...room(), code: '654321' };
    const request = vi.spyOn(client, 'request').mockReturnValueOnce(pending.promise)
      .mockResolvedValue({ ok: true, room: current });
    const staleRoom = vi.fn(); const staleStatus = vi.fn(); const onRoom = vi.fn(); const onStatus = vi.fn();
    client.watch('123456', staleRoom, staleStatus); await vi.advanceTimersByTimeAsync(900);
    client.watch(current.code, onRoom, onStatus);
    pending.resolve({ ok: false, error: 'old request failed' }); await vi.advanceTimersByTimeAsync(0);
    expect(staleRoom).not.toHaveBeenCalled(); expect(staleStatus).not.toHaveBeenCalled();
    expect(onStatus).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(900);
    expect(request).toHaveBeenLastCalledWith({ action: 'friends', op: 'sync', code: current.code });
    expect(onRoom).toHaveBeenCalledTimes(1); expect(onRoom).toHaveBeenCalledWith(current, undefined);
    expect(onStatus).toHaveBeenCalledWith('connected'); expect(vi.getTimerCount()).toBe(1);
  });

  it('does not restart polling if the room callback stops the watch', async () => {
    const client = makeClient(); vi.spyOn(client, 'request').mockResolvedValue({ ok: true, room: room() });
    client.watch('123456', () => client.stop(), vi.fn());
    await vi.advanceTimersByTimeAsync(900); expect(vi.getTimerCount()).toBe(0);
  });
});
