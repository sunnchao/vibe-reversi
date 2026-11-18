/// <reference types="vite/client" />
import type { FriendRequest, FriendResponse, FriendRoom } from '../../src/friends/rooms';
import { WECHAT_CLOUD_ENV } from '../../src/config/runtime';
import { previewIdentity } from './platform';

interface CloudApi {
  init(options: { env: string; traceUser: boolean }): void;
  callFunction(options: { name: string; data: FriendRequest }): Promise<{ result: FriendResponse }>;
  uploadFile?(options: { cloudPath: string; filePath: string }): Promise<{ fileID?: string }>;
}
// The SDK is shared by every room client in the same mini-program runtime.
const initializedCloudApis = new WeakSet<CloudApi>();

export function getWechatCloud(): CloudApi | undefined {
  // #ifdef MP-WEIXIN
  const cloud = (globalThis as unknown as { wx?: { cloud?: CloudApi } }).wx?.cloud;
  if (WECHAT_CLOUD_ENV && cloud) {
    if (!initializedCloudApis.has(cloud)) {
      cloud.init({ env: WECHAT_CLOUD_ENV, traceUser: true });
      initializedCloudApis.add(cloud);
    }
    return cloud;
  }
  // #endif
}

export class FriendRoomClient {
  private identity = previewIdentity();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  async request(request: FriendRequest): Promise<FriendResponse> {
    // #ifdef MP-WEIXIN
    try {
      const cloud = getWechatCloud();
      if (!cloud) return { ok: false, error: '好友联机需要配置微信云环境，可先体验独自练习与同屏切磋。' };
      const response = await cloud.callFunction({ name: 'reversiRoom', data: request });
      if (!response.result || typeof response.result.ok !== 'boolean') return { ok: false, error: '好友房云函数需要更新，请部署当前版本。' };
      return response.result;
    } catch { return { ok: false, error: '暂时无法连接棋桌，请检查网络和云函数配置。' }; }
    // #endif
    // #ifdef H5
    const apiBase = (import.meta.env.VITE_FRIENDS_API_BASE || '').trim().replace(/\/+$/, '');
    const unavailable = '当前静态预览页暂未连接联机服务，请使用微信小程序或本地联机预览体验好友对战';
    const developmentHelp = import.meta.env.DEV
      ? '（开发提示：运行 npm run dev:h5 或 npm run preview:h5，或配置 VITE_FRIENDS_API_BASE。）' : '';
    return new Promise(resolve => uni.request({
      url: `${apiBase}/api/friends`, method: 'POST', timeout: 10000, data: request,
      header: { 'Content-Type': 'application/json', 'X-Preview-Player': this.identity },
      success: response => {
        const data = response.data as FriendResponse;
        if (response.statusCode === 404 || typeof data !== 'object' || data === null) {
          resolve({ ok: false, error: unavailable + developmentHelp });
        } else if (response.statusCode === 200 && typeof data.ok === 'boolean') {
          resolve(data);
        } else {
          resolve({ ok: false, error: '棋桌服务暂不可用，请稍后重试。' });
        }
      },
      fail: () => resolve({ ok: false, error: '棋桌连接中断，请检查网络后重试。' }),
    }));
    // #endif
    // #ifndef H5 || MP-WEIXIN
    return { ok: false, error: '当前端支持独自练习和同屏切磋，好友房请使用微信小程序或 H5。' };
    // #endif
  }
  watch(
    code: string,
    onRoom: (room: FriendRoom, color?: 1 | 2) => void,
    onStatus: (status: 'connected' | 'reconnecting', error?: string) => void,
    profile?: () => { name?: string; avatar?: string },
  ) {
    this.stop();
    const generation = this.generation;
    const poll = async () => {
      // Sync carries the display profile as well: a player who edits their
      // name/avatar after creating a room should reach the other seat too.
      const response = await this.request({ action: 'friends', op: 'sync', code, ...(profile?.() ?? {}) });
      if (generation !== this.generation) return;
      if (response.ok && response.room) { onStatus('connected'); onRoom(response.room, response.color); }
      else onStatus('reconnecting', response.error);
      if (generation === this.generation) this.timer = setTimeout(poll, 1500);
    };
    this.timer = setTimeout(poll, 900);
  }
  stop() { this.generation++; clearTimeout(this.timer); }
}
