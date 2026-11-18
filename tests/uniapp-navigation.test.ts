/// <reference types="@dcloudio/types" />
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { transformSync } from 'esbuild';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { getLegalIndices, makeGame, playMove, recordFromGame, resignGame } from '../src/friends/game';
import type { FriendResponse, FriendRoom } from '../src/friends/rooms';
import { createFeedback, DEFAULT_PREFERENCES, exitApplication, extractRoomCode, loadPreferences } from '../uniapp/lib/platform';
import { useReversi, type ReversiViewModel } from '../uniapp/lib/use-reversi';

const roomClient = vi.hoisted(() => ({ request: vi.fn(), watch: vi.fn(), stop: vi.fn() }));
vi.mock('../uniapp/lib/room-client', () => ({
  FriendRoomClient: class {
    request = roomClient.request;
    watch = roomClient.watch;
    stop = roomClient.stop;
  },
}));

const models: ReversiViewModel[] = [];
const feedbacks: ReturnType<typeof createFeedback>[] = [];
let storage: Map<string, unknown>;
let vibrate: ReturnType<typeof vi.fn>;
let nativeVibrate: ReturnType<typeof vi.fn>;
let focus: ReturnType<typeof vi.fn>;
let audio: { src: string; volume: number; play: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
type MotionListener = (event: { matches: boolean }) => void;
let media: { matches: boolean; addEventListener: (name: string, listener: MotionListener) => void; removeEventListener: (name: string, listener: MotionListener) => void };
let motionListeners: Set<MotionListener>;

function model() { const vm = useReversi(); models.push(vm); return vm; }
function localStorageMock() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function inviteRoom(phase: 'waiting' | 'playing' = 'playing'): FriendRoom {
  const now = Date.now();
  return {
    code: '123456', hostId: 'host', guestId: 'guest', phase, rev: 1,
    created: now, updated: now, expires: now + 600000, hostSeen: now, guestSeen: now,
    game: makeGame('room'),
  };
}
function seatedRoom(vm: ReversiViewModel, phase: 'waiting' | 'playing' = 'playing') {
  const room = inviteRoom(phase);
  vm.state.room = room; vm.state.game = room.game; vm.state.color = 1;
  vm.navigate(phase === 'playing' ? 'game' : 'room'); vm.show();
  const watch = roomClient.watch.mock.calls[roomClient.watch.mock.calls.length - 1];
  return {
    room,
    onRoom: watch[1] as (room: FriendRoom, color?: 1 | 2) => void,
    onStatus: watch[2] as (status: 'connected' | 'reconnecting', error?: string) => void,
  };
}
function motion(reduced: boolean) {
  media.matches = reduced;
  motionListeners.forEach(listener => listener({ matches: reduced }));
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-17T12:00:00Z'));
  roomClient.request.mockReset().mockResolvedValue({ ok: false, error: '请求未完成' });
  roomClient.watch.mockReset(); roomClient.stop.mockReset();
  storage = new Map(); vibrate = vi.fn(); nativeVibrate = vi.fn(); focus = vi.fn();
  audio = { src: '', volume: 0, play: vi.fn(), stop: vi.fn(), destroy: vi.fn() };
  motionListeners = new Set();
  media = {
    matches: false,
    addEventListener: vi.fn((_name, listener) => motionListeners.add(listener)),
    removeEventListener: vi.fn((_name, listener) => motionListeners.delete(listener)),
  };
  vi.stubGlobal('uni', {
    getStorageSync: (key: string) => storage.get(key) ?? '',
    setStorageSync: vi.fn((key: string, value: unknown) => storage.set(key, JSON.parse(JSON.stringify(value)))),
    removeStorageSync: (key: string) => storage.delete(key),
    createInnerAudioContext: vi.fn(() => audio), vibrateShort: nativeVibrate,
  });
  vi.stubGlobal('localStorage', localStorageMock()); vi.stubGlobal('sessionStorage', localStorageMock());
  vi.stubGlobal('navigator', { vibrate }); vi.stubGlobal('window', {}); vi.stubGlobal('wx', undefined);
  vi.stubGlobal('document', { querySelector: vi.fn(() => ({ tabIndex: -1, focus })) });
  vi.stubGlobal('matchMedia', vi.fn(() => media));
});
afterEach(async () => {
  models.splice(0).forEach(vm => vm.dispose());
  feedbacks.splice(0).forEach(feedback => feedback.destroy());
  await nextTick();
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('uni-app navigation and confirmations', () => {
  it('starts on a tab root and leaves home unchanged on Back', async () => {
    const vm = model();
    expect(vm.isTabScreen.value).toBe(true);
    expect(vm.TITLES).toMatchObject({ home: '翻盘棋', chapters: '翻盘入门' });
    vm.onScroll(78); vm.back(); await nextTick();
    expect(vm.state).toMatchObject({ screen: 'home', nav: '', scrollCurrent: 78 });
    expect(focus).not.toHaveBeenCalled();
  });

  it('moves between tabs but repeated current-tab taps keep scroll and page focus', async () => {
    const vm = model(); vm.tapTab('records'); await nextTick();
    expect(vm.state).toMatchObject({ screen: 'records', nav: 'tab', tap: 'tab-records' });
    expect(vm.isTabScreen.value).toBe(true);
    vm.onScroll(240); const focused = focus.mock.calls.length;
    vm.tapTab('records'); await nextTick();
    expect(vm.state).toMatchObject({ nav: 'tab', scrollCurrent: 240, tap: 'tab-records' });
    expect(focus).toHaveBeenCalledTimes(focused);
    expect(vibrate.mock.calls).toEqual([[8], [8]]);
    vm.tapTab('chapters'); expect(vm.state.nav).toBe('tab');
  });

  it('holds the outgoing screen for one short transition window', () => {
    const vm = model();
    vm.tapTab('records');
    expect(vm.state).toMatchObject({ screen: 'records', nav: 'tab', leaving: 'home' });
    vi.advanceTimersByTime(239);
    expect(vm.state.leaving).toBe('home');
    vi.advanceTimersByTime(1);
    expect(vm.state.leaving).toBeNull();
  });

  it('drops the outgoing page immediately when motion is disabled', () => {
    const vm = model();
    vm.navigate('modes');
    expect(vm.state.leaving).toBe('home');
    vm.toggleSetting('effects');
    expect(vm.state.leaving).toBeNull();
    vm.back();
    expect(vm.state.leaving).toBeNull();
    vm.toggleSetting('effects');
    motion(true);
    vm.navigate('records');
    expect(vm.state.leaving).toBeNull();
  });

  it('uses depth for push/pop and returns Join to the entry route', () => {
    const vm = model(); vm.homePlay();
    expect(vm.state).toMatchObject({ screen: 'modes', nav: 'push' });
    expect(vm.isTabScreen.value).toBe(false);
    vm.navigate('join'); vm.back();
    expect(vm.state).toMatchObject({ screen: 'modes', nav: 'pop' });
    vm.back(); expect(vm.state).toMatchObject({ screen: 'home', nav: 'pop' });
    vm.navigate('join'); vm.back(); expect(vm.state.screen).toBe('home');
    vm.start('local'); vm.navigate('result'); expect(vm.state.nav).toBe('push');
    vm.back(); expect(vm.state).toMatchObject({ screen: 'home', nav: 'pop' });
  });

  it('returns a historical result to records at the saved scroll and clears its context', async () => {
    const vm = model(); const record = recordFromGame(resignGame(makeGame('local'), 1), 1);
    vm.setScreen('records'); vm.onScroll(435); vm.openRecord(record);
    expect(vm.state).toMatchObject({ screen: 'result', nav: 'push', returnScreen: 'records' });
    vm.back(); await nextTick();
    expect(vm.state).toMatchObject({ screen: 'records', nav: 'pop', scrollCurrent: 435, scrollTop: 435, record: null, returnScreen: null });
    vm.openRecord(record); vm.tapTab('chapters');
    expect(vm.state).toMatchObject({ screen: 'chapters', record: null, returnScreen: null });
  });

  it('makes Back and menu Home confirm an unfinished game without losing the game', async () => {
    const vm = model(); vm.start('local'); await vm.sendMove(19);
    const game = vm.state.game;
    vm.back(); expect(vm.state).toMatchObject({ screen: 'game', sheet: 'pause', sheetOpen: true });
    vm.closeSheet(); vm.more(); vm.menuHome();
    expect(vm.state).toMatchObject({ screen: 'game', sheet: 'pause', sheetOpen: true });
    expect(vm.state.game).toBe(game);
    vm.pauseHome(); expect(vm.state).toMatchObject({ screen: 'home', sheetOpen: false, nav: 'pop' });
    vm.homePlay(); expect(vm.state.screen).toBe('game'); expect(vm.state.game).toBe(game);
  });

  it('confirms room leave and stays seated if the server rejects it', async () => {
    const vm = model(); const { room } = seatedRoom(vm, 'waiting');
    vm.more(); vm.menuHome();
    expect(vm.state).toMatchObject({ screen: 'room', sheet: 'leave', sheetOpen: true });
    expect(roomClient.request).not.toHaveBeenCalled();
    vm.closeSheet(); vm.back(); expect(vm.state.sheet).toBe('leave');
    roomClient.request.mockResolvedValueOnce({ ok: false, error: '暂时无法离席' }).mockResolvedValueOnce({ ok: true, room });
    expect(await vm.leaveRoom()).toBe(false);
    expect(vm.state.room?.code).toBe(room.code); expect(vm.state.sheetOpen).toBe(true);
    roomClient.request.mockResolvedValueOnce({ ok: true, room: { ...room, phase: 'closed', rev: 2 } });
    expect(await vm.leaveRoom()).toBe(true);
    expect(vm.state).toMatchObject({ room: null, game: null, screen: 'home', nav: 'pop', sheetOpen: false });
  });

  it('uses menu Home directly after a finished or historical game', () => {
    const vm = model(); vm.start('local'); vm.state.game = resignGame(vm.state.game!, 1); vm.navigate('result');
    vm.more(); vm.menuHome();
    expect(vm.state).toMatchObject({ screen: 'home', sheetOpen: false, record: null, returnScreen: null });
    expect(vm.state.game?.over).toBe(true);
  });

  it('gives an honest 2400ms browser exit message and confirms an active game first', async () => {
    const vm = model(); const browserWxExit = vi.fn(); vi.stubGlobal('wx', { exitMiniProgram: browserWxExit });
    vm.requestExit(); await nextTick();
    expect(vm.state).toMatchObject({ screen: 'home', sheetOpen: false, tap: 'exit' });
    expect(vm.state.toast).toContain('浏览器'); expect(vm.state.toast).not.toMatch(/已收起|已退出|保留|下次.*继续/);
    expect(browserWxExit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2399); expect(vm.state.toast).not.toBe('');
    vi.advanceTimersByTime(1); expect(vm.state.toast).toBe('');
    vm.start('local'); const game = vm.state.game; vm.requestExit();
    expect(vm.state).toMatchObject({ screen: 'game', sheet: 'exit', sheetOpen: true, toast: '' });
    vm.closeSheet(); expect(vm.state.game).toBe(game);
    vm.requestExit(); vm.minimize();
    expect(vm.state.sheetOpen).toBe(false); expect(vm.state.game).toBe(game); expect(vm.state.toast).toContain('网页版');
  });

  it('calls verified native exit synchronously and reports unsupported or failed exits', () => {
    vi.stubGlobal('window', undefined);
    const failure = vi.fn(); const exit = vi.fn(); const canIUse = vi.fn(() => true);
    vi.stubGlobal('wx', { exitMiniProgram: exit, canIUse });
    exitApplication(failure);
    expect(exit).toHaveBeenCalledTimes(1); expect(canIUse).toHaveBeenCalledWith('exitMiniProgram');
    expect(failure).not.toHaveBeenCalled();
    exit.mock.calls[0][0].fail(); expect(failure).toHaveBeenCalledWith(expect.stringContaining('暂未退出'));
    canIUse.mockReturnValue(false); exitApplication(failure);
    expect(exit).toHaveBeenCalledTimes(1); expect(failure).toHaveBeenLastCalledWith(expect.stringContaining('不支持主动退出'));
  });
});

describe('uni-app room and application lifecycle', () => {
  it('stops the AI and clock in the background and resumes them on show', async () => {
    const vm = model(); vm.selectVariant('classic'); vm.start('ai'); vm.show();
    await vm.sendMove(19); vi.advanceTimersByTime(700);
    expect(vm.state.thinking).toBe(true);
    const pausedNow = vm.state.now; const stops = roomClient.stop.mock.calls.length;
    vm.hide();
    expect(vm.state).toMatchObject({ visible: false, thinking: false });
    expect(roomClient.stop).toHaveBeenCalledTimes(stops + 1);
    expect(audio.stop).toHaveBeenCalled();
    vi.advanceTimersByTime(10000);
    expect(vm.state.game?.history).toHaveLength(1); expect(vm.state.now).toBe(pausedNow);
    vm.show(); expect(vm.state).toMatchObject({ visible: true, thinking: true });
    vi.advanceTimersByTime(550); expect(vm.state.game?.history).toHaveLength(2);
    vi.advanceTimersByTime(1000); expect(vm.state.now).toBeGreaterThan(pausedNow);
  });

  it('stops room polling while hidden and starts a fresh watch on return', () => {
    const vm = model(); const { room } = seatedRoom(vm);
    const watches = roomClient.watch.mock.calls.length; const stops = roomClient.stop.mock.calls.length;
    vm.hide(); const pausedNow = vm.state.now;
    vi.advanceTimersByTime(15000);
    expect(roomClient.stop).toHaveBeenCalledTimes(stops + 1);
    expect(roomClient.watch).toHaveBeenCalledTimes(watches);
    expect(vm.canPlay.value).toBe(false); expect(vm.state.now).toBe(pausedNow);
    vm.show();
    expect(roomClient.watch).toHaveBeenCalledTimes(watches + 1);
    expect(roomClient.watch).toHaveBeenLastCalledWith(room.code, expect.any(Function), expect.any(Function), expect.any(Function));
    expect(vm.state.now).toBe(Date.now());
    const onRoom = roomClient.watch.mock.calls[watches][1] as (value: FriendRoom) => void;
    onRoom({ ...room, rev: 2, hostSeen: Date.now(), guestSeen: Date.now() });
    expect(vm.canPlay.value).toBe(true);
  });

  it('sends the latest display profile on every room poll', () => {
    const vm = model(); seatedRoom(vm, 'waiting');
    const profile = roomClient.watch.mock.calls.at(-1)?.[3] as () => Record<string, string>;
    expect(profile()).toEqual({});
    vm.setProfile({ name: '阿黑', avatar: 'https://example.test/avatar.png' });
    expect(profile()).toEqual({ name: '阿黑', avatar: 'https://example.test/avatar.png' });
  });

  it('previews a failed avatar upload locally and keeps the last shared avatar for peers', () => {
    const vm = model();
    const { onRoom, room } = seatedRoom(vm, 'waiting');
    const payload = roomClient.watch.mock.calls.at(-1)?.[3] as () => Record<string, string>;
    vm.setProfile({ avatar: 'https://tmp/old-local-avatar.png' });
    expect(payload()).toEqual({});
    onRoom({ ...room, guestAvatar: 'wxfile://temp/guest.png' });
    expect(vm.seatProfile(2).avatar).toBe('');

    const avatar = 'cloud://example-env.example-bucket/avatars/host.jpg';
    vm.setProfile({ avatar });
    vm.setProfile({ avatarPreview: 'wxfile://store/new-avatar.png' });
    expect(vm.avatarLocalOnly.value).toBe(true);
    expect(vm.seatProfile(1).avatar).toBe('wxfile://store/new-avatar.png');
    expect(payload()).toEqual({ avatar });
    expect(model().localAvatar.value).toBe('wxfile://store/new-avatar.png');
    vm.setProfile({ avatar: 'cloud://example-env.example-bucket/avatars/new.jpg' });
    expect(vm.avatarLocalOnly.value).toBe(false);
    expect(vm.profile.avatarPreview).toBe('');
  });

  it('locks the board at the current 12-second heartbeat boundary and recovers after sync', async () => {
    const vm = model(); const { room, onRoom } = seatedRoom(vm);
    expect(vm.peerConnected.value).toBe(true); expect(vm.canPlay.value).toBe(true);
    vi.advanceTimersByTime(11999); expect(vm.peerConnected.value).toBe(true);
    vi.advanceTimersByTime(1);
    expect(vm.peerConnected.value).toBe(false); expect(vm.canPlay.value).toBe(false);
    expect(vm.turnText.value).toContain('连接暂停');
    await vm.sendMove(19); expect(roomClient.request).not.toHaveBeenCalled();
    onRoom({ ...room, rev: 2, guestSeen: Date.now(), hostSeen: Date.now() });
    expect(vm.peerConnected.value).toBe(true); expect(vm.canPlay.value).toBe(true);
  });

  it('opens result and records the server disconnect verdict once', () => {
    const vm = model(); const { room, onRoom } = seatedRoom(vm);
    const finished: FriendRoom = { ...room, phase: 'finished', rev: 2, game: resignGame(room.game, 2, 'disconnect') };
    vm.openSheet('log'); onRoom(finished);
    expect(vm.state).toMatchObject({ screen: 'result', sheetOpen: false });
    expect(vm.activeRecord.value).toMatchObject({ reason: 'disconnect', winner: 1 });
    expect(vm.reasonLabel(vm.activeRecord.value!)).toBe('掉线判定');
    onRoom(finished);
    expect(vm.state.records).toHaveLength(1); expect(vm.state.totals.games).toBe(1);
  });

  it('joins a shared roomId on cold start and remembers the active room', async () => {
    const room = inviteRoom('waiting');
    roomClient.request.mockResolvedValueOnce({ ok: true, room, color: 2 });
    const vm = model(); await vm.load({ roomId: room.code });
    expect(roomClient.request.mock.calls).toEqual([[{ action: 'friends', op: 'join', code: room.code }]]);
    expect(vm.state).toMatchObject({ screen: 'room', color: 2, busy: false, mode: 'room' });
    expect(sessionStorage.getItem('fanpan.active-room')).toBe(room.code);
    expect(roomClient.watch).toHaveBeenCalledWith(room.code, expect.any(Function), expect.any(Function), expect.any(Function));
  });

  it('returns the host to their own room instead of joining as a guest', async () => {
    const room = { ...inviteRoom('waiting'), guestId: null };
    roomClient.request.mockResolvedValueOnce({ ok: true, room, color: 1 });
    const vm = model(); vm.navigate('join'); vm.setJoinCode(room.code); await vm.joinRoom();
    expect(roomClient.request).toHaveBeenCalledTimes(1);
    expect(vm.state).toMatchObject({ screen: 'room', color: 1, busy: false, mode: 'room' });
    expect(vm.state.room).toMatchObject({ hostId: 'host', guestId: null });
    expect(vm.state.toast).toContain('回到你开的这张棋桌');
    expect(vm.shareMessage().path).toBe(`/pages/index/index?roomId=${room.code}`);
  });

  it('handles a warm invite and returns an already seated player without a new join', async () => {
    const room = { ...inviteRoom('waiting'), guestId: null };
    const vm = model(); vm.show(); vm.hide();
    roomClient.request.mockResolvedValueOnce({ ok: true, room, color: 1 });
    await vm.show(room.code);
    expect(vm.state).toMatchObject({ screen: 'room', color: 1 });
    expect(vm.state.room?.guestId).toBeNull();
    vm.navigate('home'); vm.hide(); vm.show();
    expect(vm.state.screen).toBe('home');
    vm.hide(); await vm.show(room.code);
    expect(vm.state.screen).toBe('room');
    expect(roomClient.request.mock.calls).toEqual([[{ action: 'friends', op: 'join', code: room.code }]]);
  });

  it('keeps an ongoing game when a different invitation opens', async () => {
    const vm = model();
    const { room } = seatedRoom(vm);
    vm.hide(); await vm.show('987654');
    expect(vm.state).toMatchObject({ screen: 'game', room });
    expect(roomClient.request).not.toHaveBeenCalled();

    const local = model(); local.start('local'); await local.sendMove(19);
    const game = local.state.game;
    local.hide(); await local.show('987654');
    expect(local.state).toMatchObject({ screen: 'join', sheet: 'replace-game', sheetOpen: true, joinCode: '987654' });
    expect(local.state.game).toBe(game);
    expect(roomClient.request).not.toHaveBeenCalled();
    roomClient.request.mockResolvedValueOnce({ ok: true, room: { ...room, code: '987654' }, color: 2 });
    await local.confirmReplace();
    expect(local.state).toMatchObject({ screen: 'game', sheetOpen: false, color: 2 });
  });

  it('prefers a shared roomId over an older remembered room and restores an active game', async () => {
    sessionStorage.setItem('fanpan.active-room', '654321');
    const room = inviteRoom();
    roomClient.request.mockResolvedValueOnce({ ok: true, room, color: 2 });
    const vm = model(); await vm.load({ roomId: room.code });
    expect(roomClient.request.mock.calls).toEqual([[{ action: 'friends', op: 'join', code: room.code }]]);
    expect(vm.state).toMatchObject({ screen: 'game', color: 2, busy: false });
    expect(sessionStorage.getItem('fanpan.active-room')).toBe(room.code);
  });

  it('restores a remembered room when launched without an invite', async () => {
    const room = inviteRoom('waiting'); sessionStorage.setItem('fanpan.active-room', room.code);
    roomClient.request.mockResolvedValueOnce({ ok: true, room, color: 1 });
    const vm = model(); await vm.load();
    expect(vm.state).toMatchObject({ screen: 'room', color: 1, busy: false });
    expect(vm.state.room?.code).toBe(room.code);
    expect(sessionStorage.getItem('fanpan.active-room')).toBe(room.code);
  });

  it('clears a stale remembered invitation after the server rejects it', async () => {
    sessionStorage.setItem('fanpan.active-room', '123456');
    roomClient.request.mockResolvedValueOnce({ ok: false, error: '你没有入座这张棋桌' });
    const vm = model(); await vm.load();
    expect(vm.state).toMatchObject({ screen: 'join', room: null, busy: false, joinError: '你没有入座这张棋桌' });
    expect(roomClient.request.mock.calls).toEqual([[{ action: 'friends', op: 'sync', code: '123456' }]]);
    expect(sessionStorage.getItem('fanpan.active-room')).toBeNull();
    expect(roomClient.watch).not.toHaveBeenCalled();
  });

  it('ignores malformed shared room numbers without a request', async () => {
    const vm = model(); await vm.load({ roomId: '12345x' });
    expect(vm.state.screen).toBe('home'); expect(roomClient.request).not.toHaveBeenCalled();
  });

  it('extracts a six-digit code from an invite and fills it from the clipboard', async () => {
    expect(extractRoomCode('好友邀请：房间号 784662，10 分钟内有效')).toBe('784662');
    expect(extractRoomCode('房间号 78466')).toBe('');
    const getClipboardData = vi.fn((options: UniNamespace.GetClipboardDataOptions) => options.success?.({ data: '房间号 784662' }));
    vi.stubGlobal('uni', { ...uni, getClipboardData });
    const vm = model(); vm.navigate('join');
    await vm.pasteJoinCode();
    expect(vm.state.joinCode).toBe('784662');
    expect(vm.state.toast).toContain('已填入房间号 784662');
  });

  it('opens manual invite copying after clipboard failure', async () => {
    const vm = model(); seatedRoom(vm, 'waiting');
    vi.stubGlobal('location', { origin: 'https://preview.example.test', pathname: '/' });
    const setClipboardData = vi.fn((options: UniNamespace.SetClipboardDataOptions) => options.fail?.({ errMsg: 'setClipboardData:fail' }));
    vi.stubGlobal('uni', { ...uni, setClipboardData });
    await vm.copyInvite();
    expect(setClipboardData).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.stringContaining('房间号：123456'), showToast: false,
    }));
    expect(vm.state).toMatchObject({ copied: false, sheet: 'copy-manually', sheetOpen: true });
    expect(vm.state.manualText).toContain('https://preview.example.test/#/?roomId=123456');
    expect(vm.state.toast).not.toContain('已复制');
  });
});

describe('uni-app tap and move feedback', () => {
  it('ignores enabled motion and haptics saved by an earlier WeChat build', () => {
    const require = createRequire(import.meta.url);
    const { initPreContext, preJs } = require('@dcloudio/uni-cli-shared/dist/preprocess/index.js');
    const path = 'uniapp/lib/platform.ts';
    initPreContext('mp-weixin');
    const source = preJs(readFileSync(path, 'utf8'), path);
    const compiled = transformSync(source, { loader: 'ts', format: 'cjs' }).code;
    const module = { exports: {} };
    new Function('module', 'exports', compiled)(module, module.exports);
    const wechat = module.exports as typeof import('../uniapp/lib/platform');

    storage.set('fanpan.settings', { effects: true, vibration: true, sound: true, volume: 40 });
    expect(wechat.loadPreferences()).toEqual({ effects: false, vibration: false, sound: true, volume: 40 });
    const feedback = wechat.createFeedback(() => ({ ...wechat.loadPreferences(), vibration: true }));
    feedbacks.push(feedback);
    feedback.tap();
    feedback.play(true);
    vi.advanceTimersByTime(100);
    expect(nativeVibrate).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.volume).toBe(.4);
  });

  it('defaults vibration on and preserves an explicitly saved false', () => {
    expect(DEFAULT_PREFERENCES.vibration).toBe(true); expect(loadPreferences().vibration).toBe(true);
    storage.set('fanpan.settings', { vibration: false, sound: false, effects: false, volume: 20 });
    expect(loadPreferences()).toEqual({ vibration: false, sound: false, effects: false, volume: 20 });
    const vm = model(); vm.tapTab('home'); expect(vibrate).not.toHaveBeenCalled();
  });

  it('replays the same tap without replacing the control and expires after 320ms', async () => {
    const vm = model(); vm.tapControl('more'); await nextTick();
    const first = vm.state.tapKey; expect(vm.state.tap).toBe('more');
    vi.advanceTimersByTime(200); vm.tapControl('more');
    expect(vm.state.tap).toBe(''); expect(vm.state.tapKey).toBeGreaterThan(first);
    await nextTick(); expect(vm.state.tap).toBe('more');
    vi.advanceTimersByTime(319); expect(vm.state.tap).toBe('more');
    vi.advanceTimersByTime(1); expect(vm.state.tap).toBe('');
    expect(vibrate.mock.calls).toEqual([[8], [8]]);
  });

  it('keeps only the newest queued pulse and clears it when effects or reduced motion change', async () => {
    const vm = model(); vm.tapControl('undo'); vm.tapControl('skills'); await nextTick();
    expect(vm.state.tap).toBe('skills');
    vm.toggleSetting('effects'); expect(vm.state.tap).toBe('');
    vm.tapControl('more'); await nextTick(); expect(vm.state.tap).toBe('');
    vm.toggleSetting('effects'); vm.tapControl('more'); await nextTick();
    motion(true); expect(vm.state.tap).toBe('');
    vm.tapControl('exit'); await nextTick(); expect(vm.state.tap).toBe('');
    expect(vibrate.mock.calls).toEqual([[8], [8], [8], [8], [8]]);
    motion(false); vm.toggleSetting('vibration'); vm.tapControl('skills'); await nextTick();
    expect(vm.state.tap).toBe('skills'); expect(vibrate).toHaveBeenCalledTimes(5);
  });

  it('pulses skill detail, equip, use and enabled undo exactly once each', async () => {
    const vm = model(); vm.start('local'); vm.undo();
    expect(vibrate).not.toHaveBeenCalled();
    vm.selectSkill('charge'); await nextTick(); expect(vm.state.tap).toBe('skill-charge');
    vm.equipSkill(); await nextTick(); expect(vm.state.tap).toBe('equip');
    await vm.useSkill(); await nextTick(); expect(vm.state.tap).toBe('use-skill'); expect(vm.state.armed).toBe('charge');
    expect(vibrate.mock.calls).toEqual([[8], [8], [8]]);
    vi.advanceTimersByTime(240); expect(vm.state.tap).toBe('');
    await vm.sendMove(19); vi.advanceTimersByTime(700); vibrate.mockClear();
    vm.undo(); await nextTick();
    expect(vm.state.game?.history).toHaveLength(0); expect(vm.state.tap).toBe('undo');
    expect(vibrate.mock.calls).toEqual([[8]]);
    vi.advanceTimersByTime(240); expect(vm.state.tap).toBe('');
    vm.undo(); expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('does not vibrate or pulse disabled, spent, classic or locked skill use', async () => {
    const vm = model(); vm.start('local'); vm.state.game!.energies[1] = 0;
    await vm.useSkill(); expect(vibrate).not.toHaveBeenCalled();
    vm.state.selectedSkill = 'charge'; vm.state.game!.chargeUsed[1] = true;
    await vm.useSkill(); expect(vibrate).not.toHaveBeenCalled();
    vm.state.game!.chargeUsed[1] = false; vm.state.game!.variant = 'classic';
    await vm.useSkill(); expect(vibrate).not.toHaveBeenCalled();
    vm.state.game!.variant = 'skills'; vm.state.locked = true;
    await vm.useSkill(); await nextTick(); expect(vm.state.tap).toBe(''); expect(vibrate).not.toHaveBeenCalled();
  });

  it('only haptics a legal human move, with no duplicate placement buzz and sound independent', async () => {
    const vm = model(); vm.start('local');
    await vm.sendMove(0); expect(vibrate).not.toHaveBeenCalled(); expect(audio.play).not.toHaveBeenCalled();
    await vm.sendMove(19); expect(vibrate.mock.calls).toEqual([[8]]); expect(audio.play).toHaveBeenCalledTimes(1);
    await vm.sendMove(26); expect(vibrate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(700); vm.toggleSetting('vibration');
    await vm.sendMove(vm.legal.value[0]); expect(vibrate).toHaveBeenCalledTimes(1); expect(audio.play).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(700); vm.toggleSetting('vibration'); vm.toggleSetting('sound'); vm.toggleSetting('effects');
    await vm.sendMove(vm.legal.value[0]); expect(vibrate.mock.calls).toEqual([[8], [8]]); expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it('retains 12ms for AI moves and the bomb rhythm after the human tap', async () => {
    const vm = model(); vm.selectVariant('classic'); vm.start('ai'); await vm.sendMove(19);
    vi.advanceTimersByTime(700 + 550);
    expect(vm.state.game?.history).toHaveLength(2); expect(vibrate.mock.calls).toEqual([[8], [12]]);
    vm.stopAI(); vm.start('local'); vm.selectVariant('skills'); vm.state.game!.variant = 'skills';
    vm.state.armed = 'bomb'; vibrate.mockClear(); await vm.sendMove(19);
    expect(vibrate.mock.calls).toEqual([[8], [[15, 35, 20]]]); expect(audio.src).toContain('bomb.mp3');
  });

  it.each(['watch-first', 'request-first'] as const)('does not double-buzz the human room echo (%s), but buzzes remote moves', async order => {
    const vm = model(); const { room, onRoom } = seatedRoom(vm);
    const move = playMove(room.game, 19, 1).game;
    const moved = { ...room, rev: 2, game: move };
    const pending = deferred<FriendResponse>(); roomClient.request.mockReturnValueOnce(pending.promise);
    const sent = vm.sendMove(19); expect(vibrate.mock.calls).toEqual([[8]]);
    if (order === 'watch-first') onRoom(moved);
    pending.resolve({ ok: true, room: moved, color: 1 }); await sent;
    if (order === 'request-first') onRoom(moved);
    expect(vibrate.mock.calls).toEqual([[8]]); expect(audio.play).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(700);
    const remote = playMove(move, getLegalIndices(move)[0], 2).game;
    onRoom({ ...moved, rev: 3, game: remote });
    expect(vibrate.mock.calls).toEqual([[8], [12]]); expect(audio.play).toHaveBeenCalledTimes(2);
    onRoom(moved); expect(vm.state.room?.rev).toBe(3); expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid room attempts before sending or haptics and retains room bomb feedback', async () => {
    const vm = model(); const { room } = seatedRoom(vm);
    await vm.sendMove(0); expect(roomClient.request).not.toHaveBeenCalled(); expect(vibrate).not.toHaveBeenCalled();
    vm.state.armed = 'bomb'; vm.state.game!.energies[1] = 2;
    await vm.sendMove(19); expect(roomClient.request).not.toHaveBeenCalled(); expect(vibrate).not.toHaveBeenCalled();
    vm.state.game!.energies[1] = 3;
    const bomb = playMove(vm.state.game!, 19, 1, 'bomb').game;
    roomClient.request.mockResolvedValueOnce({ ok: true, room: { ...room, rev: 2, game: bomb } });
    await vm.sendMove(19); expect(vibrate.mock.calls).toEqual([[8], [[15, 35, 20]]]);
  });

  it('cannot resurrect a closed room from an outstanding move response or stale watch', async () => {
    const vm = model(); const { room, onRoom, onStatus } = seatedRoom(vm);
    const pending = deferred<FriendResponse>(); roomClient.request.mockReturnValueOnce(pending.promise);
    const sent = vm.sendMove(19);
    onStatus('reconnecting', '房主已收起棋桌');
    expect(vm.state).toMatchObject({ room: null, game: null, screen: 'home', busy: false });
    const moved = { ...room, rev: 2, game: playMove(room.game, 19, 1).game };
    pending.resolve({ ok: true, room: moved }); await sent; onRoom(moved);
    expect(vm.state).toMatchObject({ room: null, game: null, screen: 'home', busy: false });
    expect(vibrate.mock.calls).toEqual([[8]]);
  });

  it('ignores a repair sync after disposal and clears all timers and motion listeners', async () => {
    const vm = model(); const { room } = seatedRoom(vm);
    const repair = deferred<FriendResponse>();
    roomClient.request.mockResolvedValueOnce({ ok: false, error: '版本已更新' }).mockReturnValueOnce(repair.promise);
    const sent = vm.sendMove(19); await vi.advanceTimersByTimeAsync(0);
    expect(roomClient.request).toHaveBeenCalledTimes(2);
    vm.tapControl('more'); vm.toast('检查'); vm.dispose();
    repair.resolve({ ok: true, room: { ...room, rev: 2, game: playMove(room.game, 19, 1).game } });
    await sent; await nextTick();
    expect(vm.state.game?.history).toHaveLength(0); expect(vm.state.tap).toBe('');
    expect(vi.getTimerCount()).toBe(0); expect(motionListeners.size).toBe(0);
    expect(audio.play).not.toHaveBeenCalled();
  });

  it('uses native light haptics without claiming custom duration and cancels pending bomb pulses on destroy', () => {
    vi.stubGlobal('navigator', undefined);
    const preferences = { ...DEFAULT_PREFERENCES, sound: false };
    const feedback = createFeedback(() => preferences); feedbacks.push(feedback);
    feedback.tap(); feedback.play();
    expect(nativeVibrate).toHaveBeenCalledTimes(2);
    expect(nativeVibrate).toHaveBeenLastCalledWith({ type: 'light', fail: expect.any(Function) });
    feedback.play(true); vi.advanceTimersByTime(49); expect(nativeVibrate).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(1); expect(nativeVibrate).toHaveBeenCalledTimes(4);
    feedback.play(true); feedback.destroy(); vi.advanceTimersByTime(50);
    expect(nativeVibrate).toHaveBeenCalledTimes(5); expect(vi.getTimerCount()).toBe(0);
    preferences.vibration = false; feedback.tap(); expect(nativeVibrate).toHaveBeenCalledTimes(5);
  });

  it('keeps sound working in an H5 browser without a vibration API', () => {
    vi.stubGlobal('navigator', {});
    const feedback = createFeedback(() => ({ ...DEFAULT_PREFERENCES })); feedbacks.push(feedback);
    expect(() => { feedback.tap(); feedback.play(); }).not.toThrow();
    expect(nativeVibrate).not.toHaveBeenCalled(); expect(audio.play).toHaveBeenCalledTimes(1);
  });
});
