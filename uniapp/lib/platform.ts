export interface Preferences { sound: boolean; effects: boolean; vibration: boolean; volume: number }
export const MOTION_FEEDBACK_AVAILABLE = (() => {
  // #ifndef MP-WEIXIN
  return true;
  // #endif
  return false;
})();
export const DEFAULT_PREFERENCES: Preferences = {
  sound: true, effects: MOTION_FEEDBACK_AVAILABLE, vibration: MOTION_FEEDBACK_AVAILABLE, volume: 65,
};
export function uid() { return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`; }
export function read<T>(key: string, fallback: T): T {
  try {
    // Accept the prototype's original plain JSON as well as uni-app's storage envelope.
    // #ifdef H5
    const raw = localStorage.getItem(key);
    if (raw) {
      const value = JSON.parse(raw);
      return (value && typeof value === 'object' && 'data' in value && 'type' in value ? value.data : value) ?? fallback;
    }
    // #endif
    const value = uni.getStorageSync(key);
    return value === '' || value == null ? fallback : typeof value === 'string' ? JSON.parse(value) : value;
  } catch { return fallback; }
}
export function write(key: string, value: unknown) {
  try { uni.setStorageSync(key, value); return true; } catch { return false; }
}
export function remove(key: string) { try { uni.removeStorageSync(key); } catch {} }
export function loadPreferences(): Preferences {
  const saved = read<Partial<Preferences>>('fanpan.settings', {});
  return {
    sound: saved?.sound !== false,
    effects: MOTION_FEEDBACK_AVAILABLE && saved?.effects !== false,
    vibration: MOTION_FEEDBACK_AVAILABLE && saved?.vibration !== false,
    volume: Math.max(0, Math.min(100, Number(saved?.volume ?? DEFAULT_PREFERENCES.volume) || 0)),
  };
}
export function reducedMotion() {
  // #ifdef H5
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // #endif
  // #ifndef H5
  return false;
  // #endif
}
export function watchReducedMotion(onChange: (reduced: boolean) => void) {
  // #ifdef H5
  if (typeof matchMedia === 'function') {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const listener = (event: MediaQueryListEvent) => onChange(event.matches);
    media.addEventListener?.('change', listener);
    return () => media.removeEventListener?.('change', listener);
  }
  // #endif
  return () => {};
}
export function exitApplication(onUnavailable: (message: string) => void) {
  // wx.exitMiniProgram requires a user click (WeChat base library 2.17.3+).
  // Keep this call synchronous; a browser's wx JS SDK is not a mini-program runtime.
  // #ifdef MP-WEIXIN
  const wx = (globalThis as unknown as { wx?: {
    canIUse?: (api: string) => boolean;
    exitMiniProgram?: (options: { fail: () => void }) => void;
  } }).wx;
  if (typeof window === 'undefined' && wx?.exitMiniProgram && wx.canIUse?.('exitMiniProgram') !== false) {
    try {
      wx.exitMiniProgram({ fail: () => onUnavailable('暂未退出，请使用微信右上角胶囊收起。') });
      return;
    } catch { /* Fall through to instructions for the supported environment. */ }
  }
  // #endif
  // #ifdef H5
  if (typeof window !== 'undefined') {
    onUnavailable('当前为网页版，请通过浏览器切换或关闭页面。');
    return;
  }
  // #endif
  onUnavailable('当前环境不支持主动退出，请使用微信右上角胶囊收起。');
}
export function previewIdentity() {
  // #ifdef H5
  // Identity must survive tabs: opening your own invite link must still be you, not a new guest.
  // A window opened explicitly as "another player" keeps a per-tab identity instead.
  try {
    const peer = typeof location !== 'undefined' && /[?&#]peer=1(?:&|$)/.test(location.hash || location.search);
    if (peer) {
      const key = 'fanpan.uni.peer';
      let value = sessionStorage.getItem(key);
      if (!value) { value = uid(); sessionStorage.setItem(key, value); }
      return value;
    }
    const key = 'fanpan.uni.identity';
    let value = localStorage.getItem(key);
    if (!value) { value = uid(); localStorage.setItem(key, value); }
    return value;
  } catch {}
  // #endif
  return uid();
}
export interface PlayerProfile { name: string; avatar: string; avatarPreview: string }
const emptyProfile: PlayerProfile = { name: '', avatar: '', avatarPreview: '' };
export function readProfile(): PlayerProfile {
  const saved = read<Partial<PlayerProfile>>('fanpan.profile', {});
  return {
    name: typeof saved?.name === 'string' ? saved.name.slice(0, 24) : '',
    avatar: typeof saved?.avatar === 'string' ? saved.avatar.slice(0, 2048) : '',
    avatarPreview: typeof saved?.avatarPreview === 'string' ? saved.avatarPreview.slice(0, 2048) : '',
  };
}
export function writeProfile(profile: PlayerProfile) {
  return write('fanpan.profile', {
    name: profile.name.slice(0, 24),
    avatar: profile.avatar.slice(0, 2048),
    avatarPreview: profile.avatarPreview.slice(0, 2048),
  });
}
export function emptyPlayerProfile() { return emptyProfile; }
/**
 * A stable, non-personal prefix for this player's uploaded avatars. Upload
 * names also carry a timestamp so a changed avatar is not served from a stale
 * CDN cache under the old file ID.
 */
export function avatarStorageKey() {
  const saved = read('fanpan.avatar-key', '');
  if (typeof saved === 'string' && /^[a-z0-9_-]{8,80}$/i.test(saved)) return saved;
  const key = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  write('fanpan.avatar-key', key);
  return key;
}
export function roomLink(code: string) {
  // #ifdef H5
  return `${location.origin}${location.pathname}#/?roomId=${code}`;
  // #endif
  // #ifndef H5
  return `房间号：${code}`;
  // #endif
}
export function peerLink(code: string) {
  // #ifdef H5
  const base = `${location.origin}${location.pathname}#/?roomId=${code}`;
  return `${base}&peer=1`;
  // #endif
  // #ifndef H5
  return `房间号：${code}`;
  // #endif
}
export function openPeer(code: string) {
  // #ifdef H5
  window.open(peerLink(code), '_blank', 'noopener,noreferrer');
  // #endif
}
export function copyText(text: string): Promise<boolean> {
  return new Promise(resolve => uni.setClipboardData({ data: text, showToast: false, success: () => resolve(true), fail: () => resolve(false) }));
}
export function extractRoomCode(text: string) {
  const match = String(text ?? '').match(/(?:^|\D)(\d{6})(?=\D|$)/);
  return match?.[1] ?? '';
}
export function readText(): Promise<string> {
  const fallback = () => new Promise<string>(resolve => {
    try {
      uni.getClipboardData({
        showToast: false,
        success: result => resolve(typeof result.data === 'string' ? result.data : ''),
        fail: () => resolve(''),
      });
    } catch { resolve(''); }
  });
  // #ifdef H5
  if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
    try {
      return navigator.clipboard.readText().then(value => value ?? '').catch(fallback);
    } catch { return fallback(); }
  }
  // #endif
  return fallback();
}
export function createFeedback(getPreferences: () => Preferences) {
  let audio: ReturnType<typeof uni.createInnerAudioContext> | null = null;
  let destroyed = false;
  const hapticTimers = new Set<ReturnType<typeof setTimeout>>();
  function vibrate(pattern: number | number[]) {
    if (!MOTION_FEEDBACK_AVAILABLE || destroyed || !getPreferences().vibration) return;
    // #ifdef H5
    if (typeof navigator !== 'undefined') {
      try { navigator.vibrate?.(pattern); } catch { /* Vibration is optional. */ }
      return;
    }
    // #endif
    // #ifndef H5 || MP-WEIXIN
    // Native short haptics expose intensity, not exact 8/12/20ms durations.
    // Preserve the bomb's two pulses and pause using the available light haptic.
    const pulse = () => {
      if (destroyed || !getPreferences().vibration) return;
      try { uni.vibrateShort({ type: 'light', fail: () => {} }); } catch {}
    };
    pulse();
    if (Array.isArray(pattern)) {
      const timer = setTimeout(() => { hapticTimers.delete(timer); pulse(); }, pattern[0] + pattern[1]);
      hapticTimers.add(timer);
    }
    // #endif
  }
  function tap() { vibrate(8); }
  function play(bomb = false, placementHaptic = true) {
    if (destroyed) return;
    const preferences = getPreferences();
    if (bomb || placementHaptic) vibrate(bomb ? [15, 35, 20] : 12);
    if (!preferences.sound || !preferences.volume) return;
    try {
      audio ??= uni.createInnerAudioContext();
      audio.stop();
      audio.src = `/static/audio/${bomb ? 'bomb' : 'place'}.mp3`;
      audio.volume = preferences.volume / 100;
      audio.play();
    } catch { /* Unsupported sound never interrupts a legal move. */ }
  }
  return {
    tap, play, suspend: () => audio?.stop(),
    destroy: () => {
      destroyed = true;
      hapticTimers.forEach(clearTimeout); hapticTimers.clear();
      audio?.destroy(); audio = null;
    },
  };
}
export function dateLabel(at: number, withTime = false) {
  const d = new Date(at), two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getMonth() + 1)}/${two(d.getDate())}${withTime ? ` ${two(d.getHours())}:${two(d.getMinutes())}` : ''}`;
}
