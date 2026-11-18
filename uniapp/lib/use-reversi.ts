import { computed, nextTick, reactive, watch } from 'vue';
import {
  SKILLS, DIFFICULTIES, makeGame, getLegalIndices, scores, coord, chooseMove,
  playMove, applyInsight, undoGame, resignGame, recordFromGame, replayStates,
  type FriendGame, type MatchRecord, type Color, type Mode, type Difficulty,
  type Variant, type SkillKey,
} from '../../src/friends/game';
import { sharedAvatar, type FriendRoom, type FriendRequest } from '../../src/friends/rooms';
import { FriendRoomClient } from './room-client';
import { MOTION_FEEDBACK_AVAILABLE, read, write, remove, loadPreferences, reducedMotion, watchReducedMotion, exitApplication, createFeedback, copyText, readText, extractRoomCode, roomLink, openPeer, dateLabel, readProfile, writeProfile, type PlayerProfile } from './platform';

type TabScreen = 'home' | 'records' | 'chapters';
type Screen = TabScreen | 'modes' | 'game' | 'room' | 'join' | 'result';
type Sheet = 'settings' | 'skills' | 'skill-detail' | 'rules' | 'log' | 'replay' | 'share-room' | 'share-result' | 'resign' | 'pause' | 'leave' | 'replace-game' | 'copy-manually' | 'more' | 'exit';
const SCREEN_DEPTH: Record<Screen, number> = { home: 0, records: 0, chapters: 0, modes: 1, game: 2, room: 2, join: 2, result: 3 };
const TITLES: Record<Screen, string> = { home: '翻盘棋', modes: '开一局', game: '黑白对弈', room: '好友棋桌', join: '加入棋桌', result: '落子成谱', records: '我的棋谱', chapters: '翻盘入门' };
const SHEET_TITLES: Record<Sheet, string> = { settings: '设置', skills: '一手棋，一招变。', 'skill-detail': '', rules: '一页读懂黑白棋', log: '这一局的棋路', replay: '逐手回看', 'share-room': '把这一局，捎给好友。', 'share-result': '把这一局，留给下次。', resign: '这一局，先让一步？', pause: '先歇一会儿？', leave: '收起这张棋桌？', 'replace-game': '先收好当前这一局？', 'copy-manually': '手动复制文案', more: '更多', exit: '收起小程序？' };
export const CHAPTERS = [
  { name: '初识翻转', description: '夹住第一枚棋子，认识八个方向。', numeral: '一', diff: 'easy' as Difficulty },
  { name: '守住四角', description: '读懂角点的分量，与进阶对手切磋。', numeral: '二', diff: 'normal' as Difficulty },
  { name: '终盘有数', description: '与高手走完一局，练习收官判断。', numeral: '三', diff: 'hard' as Difficulty },
];
function validRecords(value: unknown): MatchRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(r => r && typeof r.id === 'string' && Array.isArray(r.board) && r.board.length === 64
    && r.board.every((v: unknown) => v === 0 || v === 1 || v === 2) && Array.isArray(r.history)
    && r.history.every((m: MatchRecord['history'][number]) => m && Number.isInteger(m.i) && m.i >= 0 && m.i < 64 && (m.color === 1 || m.color === 2) && Array.isArray(m.flips) && Array.isArray(m.extra))
    && ['ai', 'room', 'local'].includes(r.mode) && ['easy', 'normal', 'hard'].includes(r.diff)
    && (r.myColor === 1 || r.myColor === 2) && Number.isFinite(r.black) && Number.isFinite(r.white)).slice(0, 40);
}
function rememberedRoom(value?: string | null): string {
  // #ifdef H5
  try {
    if (value === null) sessionStorage.removeItem('fanpan.active-room');
    else if (value) sessionStorage.setItem('fanpan.active-room', value);
    return sessionStorage.getItem('fanpan.active-room') || '';
  } catch { return ''; }
  // #endif
  // #ifndef H5
  if (value === null) remove('fanpan.active-room');
  else if (value) write('fanpan.active-room', value);
  return read('fanpan.active-room', '');
  // #endif
}

export function useReversi() {
  const roomClient = new FriendRoomClient();
  const savedRecords = validRecords(read('fanpan.records', []));
  const rawTotals = read('fanpan.totals', { games: 0, wins: 0, draws: 0 });
  const safeTotal = (key: 'games' | 'wins' | 'draws') => Math.max(0, Number(rawTotals?.[key]) || 0);
  const chapters = read<unknown>('fanpan.chapters', []);
  const state = reactive({
    screen: 'home' as Screen, nav: '' as '' | 'push' | 'pop' | 'tab', tap: '', tapKey: 0,
    mode: 'room' as Mode, difficulty: 'easy' as Difficulty,
    variant: 'skills' as Variant, game: null as FriendGame | null, room: null as FriendRoom | null,
    color: 1 as Color, connection: 'connected' as 'connected' | 'reconnecting', busy: false,
    locked: false, thinking: false, insightPending: false, visible: true, now: Date.now(),
    selectedSkill: 'bomb' as SkillKey, armed: null as SkillKey | null, hint: -1,
    settings: loadPreferences(), sheet: null as Sheet | null, sheetOpen: false, sheetReturn: null as Sheet | null, skillDetail: 'bomb' as SkillKey,
    toast: '', joinCode: '', joinError: '', manualText: '',
    records: savedRecords, totals: { games: safeTotal('games'), wins: safeTotal('wins'), draws: safeTotal('draws') },
    chaptersDone: Array.isArray(chapters) ? chapters.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < 3) : [],
    record: null as MatchRecord | null, returnScreen: null as Screen | null,
    replayAt: 0, replay: [] as number[][], scrollTop: 0, scrollCurrent: 0, restoreScroll: 0,
    leaving: null as Screen | null,
    replaceAction: 'room' as 'room' | 'start' | 'chapter', replaceChapter: 0,
    effect: null as { index: number; bomb: boolean; key: number } | null, changed: [] as number[],
    copied: false, soundPlaying: false,
  });
  const isTabScreen = computed(() => SCREEN_DEPTH[state.screen] === 0);
  const profile = reactive<PlayerProfile>(readProfile());
  const localAvatar = computed(() => profile.avatarPreview || profile.avatar);
  const avatarLocalOnly = computed(() => !!localAvatar.value && (!!profile.avatarPreview || !sharedAvatar(profile.avatar)));
  function profilePayload(): { name?: string; avatar?: string } {
    const avatar = sharedAvatar(profile.avatar);
    return {
      ...(profile.name ? { name: profile.name } : {}),
      ...(avatar ? { avatar } : {}),
    };
  }
  function setProfile(next: Partial<PlayerProfile>) {
    if (typeof next.name === 'string') profile.name = next.name.slice(0, 24);
    if (typeof next.avatar === 'string') {
      profile.avatar = next.avatar.slice(0, 2048);
      profile.avatarPreview = '';
    }
    if (typeof next.avatarPreview === 'string') profile.avatarPreview = next.avatarPreview.slice(0, 2048);
    writeProfile(profile);
  }
  const legal = computed(() => state.game ? getLegalIndices(state.game) : []);
  const score = computed(() => state.game ? scores(state.game.board) : { black: 2, white: 2 });
  const myColor = computed<Color>(() => state.room ? state.color : 1);
  const activeColor = computed<Color>(() => state.game?.mode === 'local' ? state.game.turn : myColor.value);
  const peerConnected = computed(() => !state.room || !!state.room.guestId && state.connection === 'connected'
    && state.now - (state.color === 1 ? state.room.guestSeen : state.room.hostSeen) < 12000);
  const canPlay = computed(() => {
    const g = state.game;
    if (!g || g.over || state.busy || state.locked || state.thinking || state.insightPending || !state.visible) return false;
    return g.mode === 'local' || g.mode === 'ai' && g.turn === 1 || g.mode === 'room'
      && state.room?.phase === 'playing' && peerConnected.value && g.turn === state.color;
  });
  const energy = computed(() => state.game?.energies[activeColor.value] ?? 0);
  const activeRecord = computed(() => state.record ?? state.records.find(r => r.id === state.game?.id) ?? null);
  const replayBoard = computed(() => state.replay[state.replayAt] ?? []);
  const replayMove = computed(() => activeRecord.value?.history[state.replayAt - 1]);
  const replayScore = computed(() => scores(replayBoard.value));
  const roomCode = computed(() => state.room?.code ?? '------');
  const selected = computed(() => SKILLS[state.selectedSkill]);
  function seatProfile(color: Color) {
    const room = state.room;
    const name = color === 1 ? room?.hostName : room?.guestName;
    const avatar = color === 1 ? room?.hostAvatar : room?.guestAvatar;
    const mine = color === myColor.value;
    return {
      name: (mine && profile.name.trim()) || name || '',
      avatar: (mine && localAvatar.value) || sharedAvatar(avatar),
    };
  }
  const skillUsed = computed(() => state.selectedSkill === 'charge' ? state.game?.chargeUsed[activeColor.value]
    : state.selectedSkill === 'insight' && state.game?.revealed?.color === activeColor.value);
  const skillDisabled = computed(() => !canPlay.value || energy.value < selected.value.cost || !!skillUsed.value);
  const skillLabel = computed(() => state.insightPending ? '洞察中…' : state.armed ? '取消瞄准' : skillUsed.value ? '已使用' : energy.value < selected.value.cost ? '能量不足' : '发动');
  const boardHint = computed(() => state.game?.revealed?.color === activeColor.value ? state.game.revealed.i : state.hint);
  const turnText = computed(() => {
    const g = state.game;
    if (!g) return '棋桌已备好';
    if (g.over) return '对局结束';
    if (g.mode === 'room' && !peerConnected.value) return '连接暂停，等待好友…';
    if (g.mode === 'local') return `${g.turn === 1 ? '黑棋' : '白棋'}落子`;
    return g.turn === myColor.value ? '轮到你落子' : g.mode === 'ai' ? '对手正在思考…' : '等待好友落子';
  });
  const moveFeedback = computed(() => {
    const m = state.game?.history[state.game.history.length - 1];
    return m ? `${coord(m.i)} · 翻转 ${m.flips.length + m.extra.length} 子${m.skill === 'bomb' ? ' · 十字爆破' : ''}` : '光点处可落子 · 黑棋先行';
  });
  const gameHint = computed(() => state.insightPending ? '正在洞察当前局面，请稍候…' : state.armed === 'bomb' ? '十字已瞄准 · 在任意光点处落子' : state.armed === 'charge' ? '蓄势已备好 · 下一手额外获得 2 点能量' : boardHint.value >= 0 ? '方框标记为建议落点，仍由你决定。' : '先夹住对方，再翻为己方。');
  const roomStatus = computed(() => state.connection === 'reconnecting' ? '正在重新连接棋桌…' : !state.room?.guestId ? '等待好友加入…'
    : !peerConnected.value ? '好友暂时离线，等待重连…' : state.color === 1 ? '好友已入座，可以开局。' : '已连接，等待房主开始。');
  const roomExpiry = computed(() => {
    if (!state.room) return '';
    if (state.room.phase === 'playing') return '对局进行中 · 房间保持开放';
    const left = state.room.expires - state.now;
    return left <= 0 ? '邀请已过期 · 已入座棋友仍可继续' : left < 60000 ? '邀请有效 · 不到 1 分钟' : `邀请有效 · 还剩 ${Math.ceil(left / 60000)} 分钟`;
  });
  const roomMainLabel = computed(() => state.room && !state.room.guestId && state.room.expires <= state.now ? '重新开一张桌'
    : state.room?.guestId && state.color === 1 ? state.game?.over ? '再开一局' : '开始这一局' : '邀请微信好友');
  const settings = state.settings;
  const scrollMemory: Partial<Record<Screen, number>> = {};
  const recorded = new Set(savedRecords.map(r => r.id));
  const feedback = createFeedback(() => state.settings);
  let aiTimer: ReturnType<typeof setTimeout> | undefined;
  let moveTimer: ReturnType<typeof setTimeout> | undefined;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let soundTimer: ReturnType<typeof setTimeout> | undefined;
  let tapTimer: ReturnType<typeof setTimeout> | undefined;
  let leaveTimer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let insightGeneration = 0;
  let insightTimer: ReturnType<typeof setTimeout> | undefined;
  let releaseInsightWait: (() => void) | undefined;
  let roomGeneration = 0;
  let pendingRoomRequest: { op: FriendRequest['op'] } | null = null;
  let pendingRoomMove: { gameId: string; at: number; index: number; color: Color; skill: SkillKey | null } | null = null;
  let joinReturnScreen: 'home' | 'modes' = 'home';
  let clock: ReturnType<typeof setInterval> | undefined;
  let disposed = false;
  const stopEffectsWatch = watch(() => state.settings.effects, enabled => { if (!enabled) clearMotion(); }, { flush: 'sync' });
  const stopMotionWatch = watchReducedMotion(reduced => { if (reduced) clearMotion(); });

  function toast(message: string) {
    if (disposed) return;
    state.toast = message; clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { state.toast = ''; }, 2400);
  }
  function clearTap() { clearTimeout(tapTimer); state.tap = ''; state.tapKey++; }
  function clearMotion() { clearTap(); clearTimeout(leaveTimer); state.leaving = null; }
  function tapControl(id: string) {
    if (disposed || !MOTION_FEEDBACK_AVAILABLE) return;
    feedback.tap(); clearTap();
    if (!state.settings.effects || reducedMotion()) return;
    const key = state.tapKey;
    // Let Vue remove the previous class before replaying the same control's pulse.
    nextTick(() => {
      if (disposed || key !== state.tapKey || !state.settings.effects || reducedMotion()) return;
      // #ifdef H5
      // A Vue flush can remove and restore a class before the browser styles a frame.
      // Resolve the cleared state so a rapid repeated tap starts a new CSS animation.
      void document.querySelector<HTMLElement>('#phone')?.offsetWidth;
      // #endif
      state.tap = id;
      tapTimer = setTimeout(() => { if (key === state.tapKey) state.tap = ''; }, id.startsWith('tab-') || id === 'more' || id === 'exit' ? 320 : 240);
    });
  }
  function tapTab(screen: TabScreen) { tapControl(`tab-${screen}`); setScreen(screen); }
  function more() { tapControl('more'); openSheet('more'); }
  function menuHome() { closeSheet(); confirmHome(); }
  function requestExit() {
    tapControl('exit');
    if (state.screen === 'game' && state.game && !state.game.over) openSheet('exit');
    else minimize();
  }
  function minimize() { closeSheet(); exitApplication(toast); }
  function stopAI() { generation++; clearTimeout(aiTimer); state.thinking = false; }
  function cancelInsight() {
    insightGeneration++; clearTimeout(insightTimer); insightTimer = undefined;
    const release = releaseInsightWait; releaseInsightWait = undefined; release?.();
    if (pendingRoomRequest?.op === 'insight') {
      pendingRoomRequest = null; state.busy = false;
    }
    state.insightPending = false;
  }
  function waitForInsightFrame() {
    // Vue commits the pending label first; a short task boundary also lets the host draw it.
    return new Promise<void>(resolve => {
      releaseInsightWait = resolve;
      insightTimer = setTimeout(() => { releaseInsightWait = undefined; insightTimer = undefined; resolve(); }, 32);
    });
  }
  function navDirection(next: Screen, previous: Screen): 'push' | 'pop' | 'tab' {
    const depth = SCREEN_DEPTH[next], from = SCREEN_DEPTH[previous];
    if (depth === 0 && from === 0) return 'tab';
    return depth < from ? 'pop' : 'push';
  }
  function navigate(screen: Screen, restore = false) {
    if (disposed || screen === state.screen) return;
    if (screen !== 'game') cancelInsight();
    const previous = state.screen;
    scrollMemory[previous] = state.scrollCurrent;
    if (screen === 'join') joinReturnScreen = state.screen === 'modes' ? 'modes' : 'home';
    state.nav = navDirection(screen, previous);
    if (screen !== 'game') stopAI();
    state.screen = screen; state.scrollCurrent = restore ? scrollMemory[screen] ?? 0 : 0;
    state.scrollTop = state.scrollCurrent + 0.1;
    // #ifndef MP-WEIXIN
    clearTimeout(leaveTimer);
    state.leaving = state.settings.effects && !reducedMotion() ? previous : null;
    if (state.leaving) leaveTimer = setTimeout(() => { state.leaving = null; }, 240);
    // #endif
    nextTick(() => {
      if (disposed || state.screen !== screen) return;
      state.scrollTop = state.scrollCurrent;
      // #ifdef H5
      const target = document.querySelector<HTMLElement>(`#screen-${screen} .h1`) ?? document.querySelector<HTMLElement>(`#screen-${screen}`);
      if (target) { target.tabIndex = -1; target.focus({ preventScroll: true }); }
      // #endif
    });
    if (screen === 'game') scheduleAI();
  }
  function onScroll(top: number) { state.scrollCurrent = top; }
  function openSheet(sheet: Sheet) {
    // The short-screen review hides its log; opening it is a drill-down, not a replacement.
    state.sheetReturn = sheet === 'log' && state.sheetOpen && state.sheet === 'replay' ? 'replay' : null;
    state.copied = false; state.sheet = sheet; state.sheetOpen = true;
  }
  function closeSheet() {
    const back = state.sheetReturn;
    state.sheetReturn = null;
    if (back) { state.sheet = back; state.sheetOpen = true; return; }
    state.sheetOpen = false;
  }
  // Leave the whole sheet stack; used when the sheet's job is done and the screen changes.
  function closeSheets() { state.sheetReturn = null; state.sheetOpen = false; }
  function resetVisuals() { cancelInsight(); clearTimeout(moveTimer); state.locked = false; state.armed = null; state.hint = -1; state.changed = []; state.effect = null; }
  function start(mode: Mode = state.mode, chapter: number | null = null) {
    stopAI(); resetVisuals(); state.record = null; state.returnScreen = null;
    state.game = makeGame(mode, state.difficulty, chapter === null ? state.variant : 'classic', chapter);
    navigate('game');
  }
  function needsReplacement() { return !!state.room || !!state.game && !state.game.over && state.game.history.length > 0; }
  function startMode() {
    if (state.mode === 'room') { requestRoom(); return; }
    if (needsReplacement()) { state.replaceAction = 'start'; openSheet('replace-game'); return; }
    start();
  }
  function homePlay() { if (state.game && !state.game.over) navigate(state.room && state.room.phase !== 'playing' ? 'room' : 'game'); else navigate('modes'); }
  function friends() { if (state.room) navigate(state.room.phase === 'playing' ? 'game' : 'room'); else { state.mode = 'room'; navigate('modes'); } }
  function selectMode(mode: Mode) { state.mode = mode; }
  function selectDifficulty(diff: Difficulty) { state.difficulty = diff; }
  function selectVariant(variant: Variant) { state.variant = variant; }
  function recordGame() {
    if (!state.game?.over || recorded.has(state.game.id)) return;
    const record = recordFromGame(state.game, myColor.value);
    recorded.add(record.id); state.records.unshift(record); state.records = state.records.slice(0, 40);
    state.totals.games++;
    if (record.winner === record.myColor) state.totals.wins++;
    if (!record.winner) state.totals.draws++;
    const saved = write('fanpan.records', state.records); write('fanpan.totals', state.totals);
    if (!saved) toast('此设备暂时无法保存棋谱，本局仍可回看。');
    if (record.chapter !== null && !state.chaptersDone.includes(record.chapter)) {
      state.chaptersDone.push(record.chapter); write('fanpan.chapters', state.chaptersDone);
    }
  }
  function playFeedback(index: number, bomb: boolean, before: number[], human = false) {
    if (!state.game) return;
    state.changed = state.game.board.flatMap((v, i) => v !== before[i] ? [i] : []);
    state.effect = { index, bomb, key: Date.now() };
    state.soundPlaying = state.settings.sound && state.settings.volume > 0;
    clearTimeout(soundTimer); soundTimer = setTimeout(() => { state.soundPlaying = false; }, 650);
    feedback.play(bomb, !human); state.locked = true; clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      state.locked = false; state.changed = []; state.effect = null;
      if (state.game?.over && state.screen === 'game' && !state.record) { closeSheets(); navigate('result'); }
      else scheduleAI();
    }, state.settings.effects && !reducedMotion() ? 700 : 100);
  }
  function acceptRoom(room: FriendRoom, color?: Color) {
    if (disposed || state.room && room.code === state.room.code && room.rev < state.room.rev) return;
    if (room.phase === 'closed') { clearRoom(); navigate('home'); closeSheets(); toast('房主已收起棋桌，请重新约一局。'); return; }
    const previous = state.game;
    const newGame = previous?.id !== room.game.id;
    state.color = color ?? state.color; state.room = room; state.now = Date.now();
    state.game = room.game; state.connection = 'connected'; rememberedRoom(room.code);
    if (newGame) { stopAI(); resetVisuals(); }
    const moved = !!previous && !newGame && room.game.history.length > previous.history.length;
    if (newGame || moved || previous?.revealed?.i !== room.game.revealed?.i) { state.armed = null; state.hint = -1; }
    if (moved) {
      const m = room.game.history[room.game.history.length - 1];
      const human = pendingRoomMove?.gameId === room.game.id && pendingRoomMove.at === room.game.history.length - 1
        && pendingRoomMove.index === m.i && pendingRoomMove.color === m.color && pendingRoomMove.skill === m.skill;
      playFeedback(m.i, m.skill === 'bomb', previous!.board, human);
    }
    if (room.game.over) {
      recordGame();
      if (state.screen === 'game' && !moved) { closeSheets(); navigate('result'); }
    } else if (room.phase === 'playing' && (state.screen === 'room' || newGame && state.screen === 'result' && !state.record)) navigate('game');
    else if (room.phase === 'waiting' && state.screen === 'game') { navigate('room'); toast('好友已离席，棋局暂停。'); }
  }
  function watchRoom() {
    if (!state.room || !state.visible || disposed) return;
    const code = state.room.code, id = roomGeneration;
    const current = () => !disposed && id === roomGeneration && state.room?.code === code;
    roomClient.watch(code, (room, color) => { if (current()) acceptRoom(room, color); }, (status, error) => {
      if (!current()) return;
      state.connection = status;
      if (error && /没有入座|未找到|收起/.test(error)) { clearRoom(); navigate('home'); toast(error); }
    }, profilePayload);
  }
  async function roomRequest(op: FriendRequest['op'], extra: Partial<FriendRequest> = {}) {
    if (state.busy || disposed) return null;
    state.busy = true;
    const id = roomGeneration;
    const attempt = { op };
    pendingRoomRequest = attempt;
    const current = () => !disposed && id === roomGeneration && pendingRoomRequest === attempt;
    const request: FriendRequest = { action: 'friends', op, code: state.room?.code, rev: state.room?.rev, ...extra };
    try {
      const response = await roomClient.request(request);
      if (!current()) return null;
      if (!response.ok || !response.room) {
        toast(response.error ?? '棋桌操作未完成。');
        if (state.room) {
          const sync = await roomClient.request({ action: 'friends', op: 'sync', code: state.room.code, ...profilePayload() });
          if (!current() || !sync.ok || !sync.room) return null;
          acceptRoom(sync.room, sync.color);
        }
        return null;
      }
      if (op !== 'leave') acceptRoom(response.room, response.color);
      return response.room;
    } catch (error) {
      if (op !== 'insight') throw error;
      if (current()) toast('洞察连接失败，请重试。');
      return null;
    } finally {
      if (pendingRoomRequest === attempt) {
        pendingRoomRequest = null;
        if (id === roomGeneration) state.busy = false;
      }
    }
  }
  function requestRoom() {
    if (state.room) { navigate(state.room.phase === 'playing' ? 'game' : 'room'); return; }
    if (needsReplacement()) { state.replaceAction = 'room'; openSheet('replace-game'); return; }
    void createRoom();
  }
  async function createRoom() {
    stopAI();
    const room = await roomRequest('create', { variant: state.variant, ...profilePayload() });
    if (room) { resetVisuals(); state.record = null; state.returnScreen = null; state.mode = 'room'; navigate('room'); watchRoom(); }
  }
  function returnToRoom() {
    const room = state.room;
    if (!room) return;
    const screen = room.phase === 'waiting' ? 'room' : room.game.over ? 'result' : 'game';
    if (state.screen === screen && !state.record) return;
    state.record = null;
    state.returnScreen = null;
    closeSheets();
    navigate(screen);
  }
  async function joinRoom() {
    const code = state.joinCode;
    if (disposed || state.busy || !/^\d{6}$/.test(code)) return;
    if (state.room?.code === code) { returnToRoom(); return; }
    if (state.room) { toast('请先离开当前棋桌，再加入新房间。'); return; }
    if (state.game && !state.game.over && state.game.history.length) { state.replaceAction = 'start'; openSheet('replace-game'); return; }
    await connectRoom(code, 'join');
  }
  async function connectRoom(code: string, op: 'join' | 'sync') {
    state.joinError = ''; state.busy = true; stopAI();
    const id = roomGeneration;
    try {
      const response = await roomClient.request({ action: 'friends', op, code, ...profilePayload() });
      if (disposed || id !== roomGeneration) return;
      if (!response.ok || !response.room || !response.color || response.room.phase === 'closed') {
        state.joinError = response.room?.phase === 'closed' ? '房主已收起棋桌' : response.error ?? '暂未找到这张棋桌。';
        return;
      }
      resetVisuals(); state.record = null; state.returnScreen = null;
      acceptRoom(response.room, response.color); state.mode = 'room';
      returnToRoom(); watchRoom();
      if (response.color === 1) toast('回到你开的这张棋桌。');
      else if (response.room.phase === 'waiting') toast('已入座 · 你执白，等待房主开局。');
    } finally { if (id === roomGeneration) state.busy = false; }
  }
  async function startRoom() { const r = await roomRequest(state.game?.over ? 'rematch' : 'start'); if (r) navigate('game'); }
  async function roomMain() {
    if (!state.room || state.busy) return;
    if (!state.room.guestId && state.room.expires <= state.now) { if (await leaveRoom(false)) await createRoom(); }
    else if (state.color === 1 && state.room.guestId) await startRoom();
    else openSheet('share-room');
  }
  function commitLocal(index: number, skill: SkillKey | null, human = false) {
    const g = state.game; if (!g) return;
    const result = playMove(g, index, g.turn, skill);
    if (!result.ok) { if (result.error) toast(result.error); return; }
    if (human) feedback.tap();
    state.game = result.game; state.armed = null; state.hint = -1;
    playFeedback(index, skill === 'bomb', g.board, human);
    if (result.skipped) toast(`${result.skipped === 1 ? '黑棋' : '白棋'}无处落子，自动让手`);
    if (state.game.over) recordGame();
  }
  async function sendMove(index: number) {
    if (!canPlay.value || !state.game || disposed) return;
    if (state.game.mode !== 'room') { commitLocal(index, state.armed, true); return; }
    const game = state.game, skill = state.armed;
    const legalMove = playMove(game, index, state.color, skill);
    if (!legalMove.ok) { if (legalMove.error) toast(legalMove.error); return; }
    // Identify this attempt across request/watch races; only its normal echo skips 12ms.
    const attempt = { gameId: game.id, at: game.history.length, index, color: state.color, skill };
    pendingRoomMove = attempt; feedback.tap();
    try { await roomRequest('move', { index, skill }); }
    finally { if (pendingRoomMove === attempt) pendingRoomMove = null; }
  }
  async function useSkill() {
    if (skillDisabled.value || !state.game || state.game.variant !== 'skills') return;
    tapControl('use-skill');
    const key = state.selectedSkill;
    if (key === 'insight') {
      if (state.insightPending || !state.game) return;
      const game = state.game;
      const color = game.turn;
      const id = ++insightGeneration;
      state.insightPending = true;
      try {
        await waitForInsightFrame();
        if (disposed || id !== insightGeneration || !state.visible || state.game !== game) return;
        if (game.mode === 'room') await roomRequest('insight');
        else {
          const result = applyInsight(game, color);
          if (id !== insightGeneration || state.game !== game) return;
          if (result.ok) { state.game = result.game; state.armed = null; }
          else if (result.error) toast(result.error);
        }
      } catch {
        if (id === insightGeneration && !disposed) toast('洞察未能完成，请重试。');
      } finally {
        if (id === insightGeneration) state.insightPending = false;
      }
      return;
    }
    state.armed = state.armed === key ? null : key; state.hint = -1;
  }
  function scheduleAI() {
    clearTimeout(aiTimer); state.thinking = false;
    const g = state.game;
    if (!g || g.mode !== 'ai' || g.turn !== 2 || g.over || state.screen !== 'game' || state.locked || !state.visible) return;
    state.thinking = true; const id = generation;
    aiTimer = setTimeout(() => {
      if (id !== generation || !state.game || state.screen !== 'game' || !state.visible) return;
      const index = chooseMove(state.game); state.thinking = false;
      if (index < 0) return;
      let skill: SkillKey | null = null;
      if (state.game.variant === 'skills' && state.game.energies[2] >= 3) {
        const basic = playMove(state.game, index, 2);
        const bomb = playMove(state.game, index, 2, 'bomb');
        if (basic.ok && bomb.ok && scores(bomb.game.board).white > scores(basic.game.board).white) skill = 'bomb';
      }
      commitLocal(index, skill);
    }, reducedMotion() ? 180 : 550);
  }
  function undo() {
    if (!state.game || state.game.mode === 'room' || state.game.over || state.locked || state.thinking || !state.game.history.length) return;
    tapControl('undo');
    stopAI(); state.game = undoGame(state.game); resetVisuals(); toast(state.game.mode === 'local' ? '已回到上一手落子前。' : '已回到你上一次落子前。'); scheduleAI();
  }
  async function resign() {
    if (!state.game || state.game.over || state.busy) return;
    stopAI();
    if (state.game.mode === 'room') { const r = await roomRequest('resign'); if (!r) return; }
    else state.game = resignGame(state.game, activeColor.value);
    resetVisuals(); recordGame(); closeSheets(); navigate('result');
  }
  function openRecord(record: MatchRecord, from: Screen = 'records') { state.record = record; state.returnScreen = from; navigate('result'); }
  function recordLabel(r: MatchRecord) { return r.mode === 'local' ? r.winner === 0 ? '和' : r.winner === 1 ? '黑胜' : '白胜' : r.winner === 0 ? '和' : r.winner === r.myColor ? '胜' : '负'; }
  function recordMode(r: MatchRecord) { return `${r.mode === 'ai' ? '独自练习 · ' + DIFFICULTIES[r.diff] : r.mode === 'room' ? '好友棋桌' : '同屏切磋'} / ${r.variant === 'skills' ? '趣味技能' : '经典黑白'}`; }
  function resultTitle(r: MatchRecord) { return r.mode === 'local' && r.winner ? `${r.winner === 1 ? '黑棋' : '白棋'}，漂亮的一局。` : !r.winner ? '棋逢对手，握手言和。' : r.winner === r.myColor ? '好一场翻盘。' : '胜负之外，再会一局。'; }
  function reasonLabel(r: MatchRecord) { return r.reason === 'resign' ? '认输结束' : r.reason === 'disconnect' ? '掉线判定' : '正常终局'; }
  function replayOpen() {
    const record = activeRecord.value; if (!record) return;
    if (!record.history.length) { openSheet('log'); return; }
    state.replay = replayStates(record); state.replayAt = state.replay.length - 1; openSheet('replay');
  }
  function replaySet(index: number) { state.replayAt = Math.max(0, Math.min(state.replay.length - 1, index)); }
  function replayKey(key: string) { replaySet(key === 'Home' ? 0 : key === 'End' ? state.replay.length - 1 : state.replayAt + (key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1)); }
  function confirmHome() {
    if (state.screen === 'game' && state.game && !state.game.over) { openSheet('pause'); return; }
    if (state.screen === 'room' && state.room) { openSheet('leave'); return; }
    state.record = null; state.returnScreen = null; closeSheets(); navigate('home');
  }
  function back() {
    if (state.sheetOpen) { closeSheet(); return; }
    if (state.screen === 'home') return;
    if (state.screen === 'result' && state.returnScreen) { const target = state.returnScreen; state.record = null; state.returnScreen = null; navigate(target, true); return; }
    if (state.screen === 'join') { navigate(joinReturnScreen); return; }
    confirmHome();
  }
  function pauseHome() { closeSheets(); state.record = null; state.returnScreen = null; navigate('home'); }
  function clearRoom() {
    roomGeneration++; pendingRoomMove = null;
    roomClient.stop(); stopAI(); resetVisuals(); state.busy = false;
    state.room = null; state.game = null; state.record = null; state.returnScreen = null; rememberedRoom(null);
  }
  async function leaveRoom(home = true): Promise<boolean> {
    if (state.room) { const left = await roomRequest('leave'); if (!left) return false; }
    clearRoom(); closeSheets(); if (home) navigate('home'); return true;
  }
  async function confirmReplace() {
    if (state.busy) return;
    const action = state.replaceAction;
    if (state.room && !await leaveRoom(false)) return;
    stopAI(); state.game = null; closeSheets();
    if (action === 'room') await createRoom();
    else if (action === 'chapter') launchChapter(state.replaceChapter);
    else if (state.screen === 'join') await joinRoom();
    else start();
  }
  function launchChapter(index: number) { state.difficulty = CHAPTERS[index].diff; start('ai', index); }
  function chapter(index: number) {
    if (index > 0 && !state.chaptersDone.includes(index - 1)) { toast('完成上一章后，这一章会自然开启。'); return; }
    if (needsReplacement()) { state.replaceChapter = index; state.replaceAction = 'chapter'; openSheet('replace-game'); return; }
    launchChapter(index);
  }
  async function again() {
    const record = activeRecord.value; if (!record) return;
    if (state.room && !state.record) { if (state.color === 1) await startRoom(); return; }
    if (record.mode === 'room') { state.mode = 'room'; state.record = null; state.returnScreen = null; navigate('modes'); return; }
    if (state.room) { state.replaceAction = 'start'; state.mode = record.mode; state.difficulty = record.diff; state.variant = record.variant; openSheet('replace-game'); return; }
    state.difficulty = record.diff; state.variant = record.variant; start(record.mode, record.chapter ?? null);
  }
  function toggleSetting(key: 'sound' | 'effects' | 'vibration') {
    if (!MOTION_FEEDBACK_AVAILABLE && key !== 'sound') return;
    state.settings[key] = !state.settings[key]; write('fanpan.settings', state.settings);
    if (key === 'sound' && !state.settings.sound) feedback.suspend();
  }
  function setVolume(value: number) { state.settings.volume = Math.max(0, Math.min(100, value)); write('fanpan.settings', state.settings); if (!value) feedback.suspend(); }
  async function copyInvite(result = false) {
    const r = activeRecord.value;
    const text = result && r ? `翻盘棋 · ${recordLabel(r)}\n黑棋 ${r.black} : ${r.white} 白棋\n${recordMode(r)}\n${r.history.length} 手 · ${reasonLabel(r)}\n下次，再邀你翻盘。`
      : state.room ? `来翻盘棋，和我下一局。\n房间号：${state.room.code}\n${roomLink(state.room.code)}` : '';
    if (!text) return;
    state.copied = await copyText(text);
    if (state.copied) toast(result ? '本局回顾已复制，未发送到微信。' : '邀请文案已复制，未发送到微信。');
    else { state.manualText = text; openSheet('copy-manually'); }
  }
  function share(result = false) { openSheet(result ? 'share-result' : 'share-room'); }
  function selectSkill(key: SkillKey) { tapControl(`skill-${key}`); state.skillDetail = key; openSheet('skill-detail'); }
  function equipSkill(key = state.skillDetail) { tapControl('equip'); cancelInsight(); state.selectedSkill = key; state.armed = null; closeSheet(); toast(`已装配${SKILLS[key].name}，点击「发动」使用。`); }
  function setJoinCode(value: string) { if (state.busy) return; state.joinCode = value.replace(/\D/g, '').slice(0, 6); state.joinError = ''; }
  function roomKey(value: string) { setJoinCode(value === 'clear' ? '' : value === 'delete' ? state.joinCode.slice(0, -1) : state.joinCode + value); }
  async function pasteJoinCode() {
    if (state.busy) return;
    const text = await readText();
    if (disposed) return;
    const code = extractRoomCode(text);
    if (!code) { toast(text ? '这段文字里没有六位房间号。' : '未能读取剪贴板，请手动输入房间号。'); return; }
    setJoinCode(code);
    toast(`已填入房间号 ${code}，确认后入座。`);
  }
  function setScreen(screen: Screen) { if (SCREEN_DEPTH[screen] === 0) { state.record = null; state.returnScreen = null; } navigate(screen); }
  function clockStart() { clearInterval(clock); state.now = Date.now(); clock = setInterval(() => { state.now = Date.now(); }, 1000); }
  function hide() { state.visible = false; cancelInsight(); stopAI(); roomClient.stop(); feedback.suspend(); clearInterval(clock); }
  function show(inviteCode?: string) {
    if (disposed) return;
    state.visible = true; clockStart(); watchRoom(); scheduleAI();
    if (inviteCode) return openInvite(inviteCode);
  }
  async function load(options: Record<string, string | undefined> = {}) {
    const invite = options.roomId || options.room;
    if (invite) { await openInvite(invite); return; }
    const code = rememberedRoom();
    if (disposed || state.busy || state.room || !/^\d{6}$/.test(code)) return;
    state.joinCode = code; navigate('join');
    await connectRoom(code, 'sync');
    if (!disposed && !state.room) rememberedRoom(null);
  }
  async function openInvite(code: string) {
    if (disposed || state.busy || !/^\d{6}$/.test(code)) return;
    if (state.room?.code === code) { returnToRoom(); return; }
    if (state.room) { toast('请先离开当前棋桌，再加入新房间。'); return; }
    closeSheets();
    setJoinCode(code);
    navigate('join');
    await joinRoom();
  }
  function shareMessage() {
    const inviting = !!state.room && (state.screen === 'room' || state.sheetOpen && state.sheet === 'share-room');
    const r = activeRecord.value;
    return {
      title: inviting ? `来翻盘棋，和我下一局 · 房间 ${state.room!.code}` : r ? `翻盘棋 · 黑 ${r.black} : ${r.white} 白，下次再会。` : '黑白之间，总有一手新可能。',
      path: `/pages/index/index${inviting ? '?roomId=' + state.room!.code : ''}`,
      imageUrl: '/static/reversi-table.jpg',
    };
  }
  function dispose() {
    disposed = true; hide(); cancelInsight(); clearTap(); stopEffectsWatch(); stopMotionWatch();
    clearTimeout(moveTimer); clearTimeout(toastTimer); clearTimeout(soundTimer); clearTimeout(leaveTimer); feedback.destroy();
  }
  return {
    state, settings, isTabScreen, legal, score, myColor, activeColor, canPlay, energy, activeRecord, replayBoard, replayMove, replayScore, roomCode,
    peerConnected, selected, skillUsed, skillDisabled, skillLabel, boardHint, turnText, moveFeedback, gameHint, roomStatus, roomExpiry, roomMainLabel,
    SKILLS, DIFFICULTIES, CHAPTERS, coord, dateLabel, roomLink, openPeer, reducedMotion, TITLES, SHEET_TITLES,
    navigate, tapControl, tapTab, more, menuHome, requestExit, minimize, onScroll, openSheet, closeSheet, start, startMode, homePlay, friends, selectMode, selectDifficulty, selectVariant,
    requestRoom, createRoom, joinRoom, startRoom, roomMain, sendMove, useSkill, undo, resign, recordGame, openRecord,
    recordLabel, recordMode, resultTitle, reasonLabel, replayOpen, replaySet, replayKey, scheduleAI, stopAI, back, pauseHome,
    leaveRoom, confirmReplace, chapter, again, toggleSetting, setVolume, copyInvite, share, selectSkill, equipSkill,
    profile, localAvatar, avatarLocalOnly, setProfile, seatProfile,
    setJoinCode, roomKey, pasteJoinCode, setScreen, toast, hide, show, load, shareMessage, dispose,
  };
}
export type ReversiViewModel = ReturnType<typeof useReversi>;
