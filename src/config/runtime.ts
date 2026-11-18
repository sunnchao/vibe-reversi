declare const __WECHAT_CLOUD_ENV__: string | undefined;

export const WECHAT_CLOUD_ENV = typeof __WECHAT_CLOUD_ENV__ === 'string' ? __WECHAT_CLOUD_ENV__ : '';
export const ROOM_STORAGE_KEY = 'reversi.active-room';
export const PLAYER_STORAGE_KEY = 'reversi.browser-player';

let browserShareOrigin = '';
export function setBrowserShareOrigin(origin: string): void {
  try { browserShareOrigin = new URL(origin).origin; } catch { browserShareOrigin = ''; }
}
export function getBrowserShareOrigin(): string {
  return browserShareOrigin || (typeof location !== 'undefined' ? location.origin : '');
}
