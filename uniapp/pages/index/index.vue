<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { onBackPress, onHide, onLoad, onShow, onShareAppMessage } from '@dcloudio/uni-app';
import AppIcon from '../../components/AppIcon.vue';
import ChessBoard from '../../components/ChessBoard.vue';
import GameSheets from '../../components/GameSheets.vue';
import PlayerAvatar from '../../components/PlayerAvatar.vue';
import { useReversi } from '../../lib/use-reversi';

const model = useReversi();
const vm = reactive(model);
const s = vm.state;
const score = model.score;
const current = model.activeRecord;
const resultBoard = computed(() => current.value?.board ?? s.game?.board ?? Array(64).fill(0));
const resultTitle = computed(() => current.value ? vm.resultTitle(current.value) : '这一局，尚未结束。');
const roomHost = computed(() => !!s.room && vm.myColor === 1);
const roomGuest = computed(() => !!s.room?.guestId);
const roomNeedsAction = computed(() => roomHost.value && (roomGuest.value || !!s.room && s.room.expires <= s.now));
const guestWaitingRematch = computed(() => !!s.room && !s.record && s.color === 2);
const moveCount = computed(() => s.game?.history.length ?? 0);
const turnNumber = computed(() => String(moveCount.value + 1).padStart(2, '0'));
const canUndo = computed(() => !!s.game && !s.game.over && s.game.mode !== 'room' && !!s.game.history.length && !s.locked && !s.thinking);
const statRate = computed(() => s.totals.games ? `${Math.round(s.totals.wins / s.totals.games * 100)}%` : '—');
const noticeLabel = computed(() => s.toast);
const homeGifFailed = ref(false);
const homePhoto = computed(() => !homeGifFailed.value && !vm.reducedMotion()
  ? '/static/reversi-home.gif'
  : '/static/reversi-table.jpg');
const tabs = [
  { screen: 'home', label: '棋桌', icon: 'board' },
  { screen: 'records', label: '棋谱', icon: 'book' },
  { screen: 'chapters', label: '章节', icon: 'chapters' },
] as const;
let native = false;
let touchDevice = false;
// #ifdef H5
touchDevice = typeof matchMedia === 'function' && matchMedia('(hover: none)').matches;
// #endif
// #ifdef MP-WEIXIN
touchDevice = true;
// #endif
const nativeLayout = reactive({ top: 0, capsuleRight: 92, capsuleHeight: 44, height: 0 });
// Short screens keep the mode actions outside the scroll area so they never slip below the fold.
const shortScreen = ref(false);
function measureShortScreen() {
  // #ifdef H5
  shortScreen.value = window.innerHeight <= 700;
  // #endif
  // #ifdef MP-WEIXIN
  shortScreen.value = nativeLayout.height > 0 && nativeLayout.height <= 700;
  // #endif
}
// #ifdef H5
onMounted(() => window.addEventListener('resize', measureShortScreen));
onBeforeUnmount(() => window.removeEventListener('resize', measureShortScreen));
// #endif
// #ifdef MP-WEIXIN
native = true;
const system = uni.getWindowInfo();
const capsule = uni.getMenuButtonBoundingClientRect();
nativeLayout.top = system.statusBarHeight;
nativeLayout.height = system.windowHeight;
nativeLayout.capsuleRight = system.windowWidth - capsule.left + 8;
nativeLayout.capsuleHeight = Math.max(44, capsule.height + (capsule.top - system.statusBarHeight) * 2);
measureShortScreen();
// #endif
const phoneStyle = computed(() => native ? {
  '--native-top': `${nativeLayout.top}px`, '--native-capsule-right': `${nativeLayout.capsuleRight}px`,
  '--native-header': `${nativeLayout.capsuleHeight}px`, '--phone-h': `${nativeLayout.height}px`,
} : {});
const needsProfileHint = computed(() => {
  const mine = vm.seatProfile(vm.myColor);
  return !mine.name || (native && (!mine.avatar || vm.avatarLocalOnly));
});
function roomPlayerName(color: 1 | 2) {
  const name = vm.seatProfile(color).name;
  return name || (color === vm.myColor ? '你' : '好友');
}
function seatInitial(color: 1 | 2) {
  const name = vm.seatProfile(color).name;
  if (name) return name.slice(0, 1);
  return color === vm.myColor ? '你' : '友';
}
function onJoinInput(event: Event | { detail?: { value?: string } }) {
  const value = 'detail' in event && typeof event.detail === 'object' ? event.detail?.value : (event as Event).target && ((event as Event).target as HTMLInputElement).value;
  vm.setJoinCode(value || '');
}
function goJoin() { s.joinCode = ''; s.joinError = ''; vm.navigate('join'); }
function key(value: string) { vm.roomKey(value); }
function onSettings() { vm.openSheet('settings'); }
function startChapter(index: number) { vm.chapter(index); }
type SwipeEvent = { touches?: { clientX: number; clientY: number }[]; changedTouches?: { clientX: number; clientY: number }[] };
let swipe: { x: number; y: number } | null = null;
function swipeStart(event: SwipeEvent) {
  swipe = null;
  if (s.sheetOpen || vm.isTabScreen || event.touches?.length !== 1) return;
  const point = event.touches[0];
  let left = 0;
  // #ifdef H5
  left = document.getElementById('phone')?.getBoundingClientRect().left ?? 0;
  // #endif
  if (point.clientX - left >= 0 && point.clientX - left <= 26) swipe = { x: point.clientX, y: point.clientY };
}
function swipeEnd(event: SwipeEvent) {
  const start = swipe; swipe = null;
  const end = event.changedTouches?.[0];
  if (!start || !end || s.sheetOpen) return;
  const dx = end.clientX - start.x, dy = end.clientY - start.y;
  if (dx > 72 && dx > Math.abs(dy) * 1.3) vm.back();
}
// #ifdef H5
function onKeyboard(event: KeyboardEvent) {
  const target = event.target as HTMLElement;
  const control = target.closest<HTMLElement>('uni-button[role="button"],uni-button[role="switch"],uni-button[role="radio"]');
  if (control && !control.classList.contains('cell') && ['Enter', ' '].includes(event.key)) {
    event.preventDefault();
    if (!event.repeat && !control.hasAttribute('disabled') && control.getAttribute('aria-disabled') !== 'true') control.click();
    return;
  }
  if (s.sheetOpen) return;
  if (event.key === 'Escape') { event.preventDefault(); if (!event.repeat) vm.back(); return; }
  const radio = target.closest<HTMLElement>('[role="radio"]');
  if (radio && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
    const group = radio.closest('[role="radiogroup"]');
    const options = Array.from(group?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []);
    const at = options.indexOf(radio);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (at + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + options.length) % options.length;
    event.preventDefault(); options[next]?.click(); options[next]?.focus(); return;
  }
  if (s.screen !== 'join' || target.closest('input,textarea')) return;
  if (/^\d$/.test(event.key)) { event.preventDefault(); key(event.key); }
  else if (event.key === 'Backspace') { event.preventDefault(); key('delete'); }
  else if (event.key === 'Enter') { event.preventDefault(); void vm.joinRoom(); }
}
// #endif
function action(name: string) {
  if (name === 'home-play') vm.homePlay();
  else if (name === 'create-room') vm.requestRoom();
  else if (name === 'join') goJoin();
  else if (name === 'records') vm.setScreen('records');
  else if (name === 'chapters') vm.setScreen('chapters');
  else if (name === 'modes') vm.setScreen('modes');
  else if (name === 'back') vm.back();
  else if (name === 'settings') onSettings();
  else if (name === 'sound') { vm.toggleSetting('sound'); vm.toast(s.settings.sound ? '落子音效已开启。' : '已静音，安心落子。'); }
  else if (name === 'rules') vm.openSheet('rules');
  else if (name === 'start-mode') vm.startMode();
  else if (name === 'start-room') void vm.startRoom();
  else if (name === 'share-room') vm.share(false);
  else if (name === 'share-result') vm.share(true);
  else if (name === 'copy-room') void vm.copyInvite(false);
  else if (name === 'copy-result') void vm.copyInvite(true);
  else if (name === 'skills') { vm.tapControl('skills'); vm.openSheet('skills'); }
  else if (name === 'skill-bomb') vm.selectSkill('bomb');
  else if (name === 'skill-insight') vm.selectSkill('insight');
  else if (name === 'skill-charge') vm.selectSkill('charge');
  else if (name === 'use-skill') void vm.useSkill();
  else if (name === 'undo') vm.undo();
  else if (name === 'log') vm.openSheet('log');
  else if (name === 'resign') vm.openSheet('resign');
  else if (name === 'join-submit') void vm.joinRoom();
  else if (name === 'leave-room') void vm.leaveRoom();
  else if (name === 'pause-home') vm.pauseHome();
  else if (name === 'records-home') vm.setScreen('home');
  else if (name === 'review') vm.replayOpen();
  else if (name === 'again') void vm.again();
  else if (name === 'home') vm.setScreen('home');
  else if (name === 'friends') vm.friends();
}
onMounted(() => {
  // #ifdef H5
  measureShortScreen();
  document.addEventListener('keydown', onKeyboard);
  // #endif
});
onLoad(options => { void vm.load((options ?? {}) as Record<string, string | undefined>); });
// #ifdef MP-WEIXIN
let firstShow = true;
const shareScenes = [1007, 1008, 1036, 1044];
// #endif
onShow(() => {
  let code: string | undefined;
  // #ifdef MP-WEIXIN
  const entry = firstShow ? undefined : uni.getEnterOptionsSync?.();
  firstShow = false;
  if (entry?.path?.replace(/^\//, '') === 'pages/index/index' && shareScenes.includes(entry.scene)) {
    const room = entry.query?.roomId ?? entry.query?.room;
    if (typeof room === 'string') code = room;
  }
  // #endif
  void vm.show(code);
});
onHide(() => vm.hide());
onBackPress(() => { vm.back(); return true; });
onShareAppMessage(() => vm.shareMessage());
onBeforeUnmount(() => {
  vm.dispose();
  // #ifdef H5
  document.removeEventListener('keydown', onKeyboard);
  // #endif
});
</script>

<template>
  <view class="reversi-app" :class="{ 'effects-off': !s.settings.effects, 'touch-device': touchDevice }">
    <view class="desk" data-od-id="desktop-game-manual">
      <view class="margin-note left" data-od-id="desktop-game-manual">
        <view class="desktop-folio"><text class="text">黑白棋 · 对弈手册</text><text class="text">〇一</text></view>
        <view class="desktop-title">翻盘棋</view>
        <view class="desktop-sub">黑白之间，<text class="line-break">
</text>总有一手新可能。</view>
        <view class="desktop-foot">一方棋盘 · 两位棋友<text class="line-break">
</text>落子有声，输赢有趣。</view>
      </view>
      <view class="phone" :class="{ 'native-phone': native }" :style="phoneStyle" id="phone" data-od-id="main-phone-surface">
        <!-- #ifdef H5 -->
        <view class="statusbar" aria-hidden="true"><text class="status-time">9:41</text><view class="status-icons"><AppIcon name="signal" style="width:14px;height:12px" /><AppIcon name="wifi" style="width:16px;height:12px" /><AppIcon name="battery" style="width:24px;height:12px" /></view></view>
        <!-- #endif -->
        <view class="topbar" :inert="s.sheetOpen || undefined" data-od-id="app-header">
          <button role="button" tabindex="0" hover-class="none" v-if="!vm.isTabScreen" class="nav-back" aria-label="返回" data-od-id="back-button" @click="vm.back()"><AppIcon name="back" /></button>
          <!-- WeChat supplies the system capsule; the free root slot opens app preferences. -->
          <!-- #ifdef MP-WEIXIN -->
          <button role="button" tabindex="0" hover-class="none" v-else class="nav-back native-more" aria-label="更多" aria-haspopup="dialog" data-od-id="more-control" @click="vm.more"><AppIcon name="more" :class="{ 'tap-dots': s.tap === 'more' }" /></button>
          <!-- #endif -->
          <view class="nav-title" :key="s.screen" data-od-id="nav-title">{{ vm.TITLES[s.screen] }}</view>
          <!-- #ifndef MP-WEIXIN -->
          <view class="capsule" role="group" aria-label="小程序菜单">
            <button role="button" tabindex="0" hover-class="none" aria-label="更多" aria-haspopup="dialog" data-od-id="more-control" @click="vm.more"><AppIcon name="more" :class="{ 'tap-dots': s.tap === 'more' }" /></button>
            <view class="i" aria-hidden="true" />
            <button role="button" tabindex="0" hover-class="none" aria-label="收起小程序" data-od-id="exit-control" @click="vm.requestExit"><AppIcon name="capsule-close" :class="{ 'tap-close': s.tap === 'exit' }" /></button>
          </view>
          <!-- #endif -->
        </view>

        <scroll-view class="viewport" :inert="s.sheetOpen || undefined" scroll-y :scroll-top="s.scrollTop" :scroll-with-animation="false" @scroll="vm.onScroll($event.detail.scrollTop)" @touchstart="swipeStart" @touchend="swipeEnd" @touchcancel="swipe = null" data-od-id="game-screens">
          <view class="screen-stack" :data-nav="s.nav">
            <view id="screen-home" v-show="s.screen === 'home' || s.leaving === 'home'" :inert="s.screen !== 'home' || undefined" tabindex="-1" class="screen home" :class="{ active: s.screen === 'home', leaving: s.leaving === 'home' }" aria-label="棋桌首页" data-od-id="home-screen">
              <view class="section-line"><text class="text">闲时一局 · 好友同乐</text><text class="text">棋桌 / 〇一</text></view>
              <view class="intro"><view class="h1 home-title" data-od-id="home-title">落子有声，<text class="line-break">
  </text>翻盘有你。</view><view class="stamp">棋友相逢</view></view>
              <view data-od-id="reversi-table-image">
                <view class="table-photo"><image class="image" :src="homePhoto" width="1100" height="733" mode="widthFix" alt="木框深绿棋盘上，黑棋翻为白棋" @error="homeGifFailed = true" /></view>
                <view class="photo-caption"><text class="text">一方棋盘，等一位老友。</text><text class="text">8 × 8 · 黑白对弈</text></view>
              </view>
              <button role="button" tabindex="0" hover-class="none" class="btn primary" data-od-id="home-play" @click="action('home-play')">{{ s.game && !s.game.over ? '继续这一局' : '开始一局' }}<AppIcon end tone="ivory" name="arrow" /></button>
              <view class="friend-links">
                <button role="button" tabindex="0" hover-class="none" class="text-btn" data-od-id="home-invite" @click="action('create-room')"><AppIcon name="friends" :size="15" />邀请好友</button>
                <button role="button" tabindex="0" hover-class="none" class="text-btn" data-od-id="home-join" @click="action('join')">输入房间号<AppIcon name="arrow" :size="14" /></button>
              </view>
              <view class="record-summary" data-od-id="home-player-record">
                <view><text class="b">{{ s.totals.games }}</text><text class="text">已下对局</text></view>
                <view><text class="b">{{ s.totals.wins }}</text><text class="text">获胜对局</text></view>
                <view><text class="b">{{ statRate }}</text><text class="text">胜率</text></view>
                <button role="button" tabindex="0" hover-class="none" class="icon-btn" aria-label="查看我的棋谱" data-od-id="home-records" @click="action('records')"><AppIcon name="arrow" :size="16" /></button>
              </view>
              <button role="button" tabindex="0" hover-class="none" class="chapter-link" data-od-id="home-chapter" @click="action('chapters')"><text class="chapter-no">一</text><view><text class="strong">初识翻转</text><text class="small-text">从第一手，读懂黑白之间。</text></view><AppIcon name="arrow" :size="17" /></button>
            </view>

            <view id="screen-modes" v-show="s.screen === 'modes' || s.leaving === 'modes'" :inert="s.screen !== 'modes' || undefined" tabindex="-1" class="screen pad" :class="{ active: s.screen === 'modes', leaving: s.leaving === 'modes' }" aria-label="选择对局模式" data-od-id="mode-screen">
              <view class="page-intro"><view class="eyebrow">开局之前</view><view class="h1" data-od-id="mode-title">摆好棋盘，<text class="line-break">
  </text>选位对手。</view></view>
              <view class="mode-list" role="radiogroup" aria-label="对局模式" data-od-id="mode-group">
                <button hover-class="none" class="mode-option" data-od-id="mode-room" :class="{ selected: s.mode === 'room' }" role="radio" :tabindex="s.mode === 'room' ? 0 : -1" :aria-checked="s.mode === 'room'" @click="vm.selectMode('room')"><view class="mode-art"><view class="stone" /><view class="stone white" /></view><view><text class="strong">与好友对弈</text><text class="small-text">开一张棋桌，邀好友来翻盘。</text></view><view class="mode-check" /></button>
                <button hover-class="none" class="mode-option" data-od-id="mode-ai" :class="{ selected: s.mode === 'ai' }" role="radio" :tabindex="s.mode === 'ai' ? 0 : -1" :aria-checked="s.mode === 'ai'" @click="vm.selectMode('ai')"><view class="ai-symbol">弈</view><view><text class="strong">独自练习</text><text class="small-text">不急着赢，先走好下一步。</text></view><view class="mode-check" /></button>
                <button hover-class="none" class="mode-option" data-od-id="mode-local" :class="{ selected: s.mode === 'local' }" role="radio" :tabindex="s.mode === 'local' ? 0 : -1" :aria-checked="s.mode === 'local'" @click="vm.selectMode('local')"><view class="ai-symbol">双</view><view><text class="strong">同屏切磋</text><text class="small-text">共用一台设备，黑白轮流落子。</text></view><view class="mode-check" /></button>
              </view>
              <view v-if="s.mode === 'ai'" class="difficulty-block">
                <view class="field-label">对手强度</view>
                <view class="segmented triple" role="radiogroup" aria-label="对手强度" data-od-id="ai-difficulty">
                  <button hover-class="none" v-for="(label, key) in vm.DIFFICULTIES" :key="key" role="radio" :tabindex="s.difficulty === key ? 0 : -1" :aria-checked="s.difficulty === key" @click="vm.selectDifficulty(key)">{{ label }}</button>
                </view>
              </view>
              <view class="field-label"><text class="text">棋局规则</text><button role="button" tabindex="0" hover-class="none" class="text-btn" @click="action('rules')">怎么玩？</button></view>
              <view class="segmented" role="radiogroup" aria-label="棋局规则" data-od-id="rules-variant">
                <button data-od-id="variant-classic" hover-class="none" role="radio" :tabindex="s.variant === 'classic' ? 0 : -1" :aria-checked="s.variant === 'classic'" @click="vm.selectVariant('classic')">经典黑白</button>
                <button data-od-id="variant-skills" hover-class="none" role="radio" :tabindex="s.variant === 'skills' ? 0 : -1" :aria-checked="s.variant === 'skills'" @click="vm.selectVariant('skills')">趣味技能</button>
              </view>
              <view class="help-copy">{{ s.variant === 'skills' ? '保留合法落子规则，加入蓄能与技能。双方各从 3 点能量开始。' : '标准黑白棋，不使用技能。双方都无处落子时，棋子多者胜。' }}</view>
              <view v-if="!shortScreen" class="mode-footer"><button role="button" tabindex="0" hover-class="none" class="btn primary" data-od-id="mode-start" @click="action('start-mode')">{{ s.mode === 'room' ? '创建好友房' : s.mode === 'ai' ? '开始练习' : '两人入座' }}<AppIcon end tone="ivory" name="arrow" /></button><button role="button" tabindex="0" hover-class="none" class="text-btn" @click="action('join')">已有房间号？直接入座</button></view>
            </view>

            <view id="screen-game" v-show="(s.screen === 'game' || s.leaving === 'game') && s.game" :inert="s.screen !== 'game' || undefined" tabindex="-1" class="screen" :class="{ active: s.screen === 'game', leaving: s.leaving === 'game' }" aria-label="进行中的棋局" data-od-id="active-match-screen">
              <view class="match" :class="{ 'classic-match': s.game?.variant !== 'skills' }">
                <view class="players" data-od-id="match-players">
                  <view class="player left">
                    <PlayerAvatar :src="s.game?.mode === 'room' ? vm.seatProfile(1).avatar : ''" image-class="player-avatar">
                      <view class="stone" />
                    </PlayerAvatar>
                    <view class="player-name"><text class="player-title">{{ s.game?.mode === 'local' ? '黑棋棋友' : s.game?.mode === 'room' ? roomPlayerName(1) : '你' }}</text><text class="small-text">黑棋 · 先手</text></view>
                    <text class="player-score" :key="`black-${score.black}`">{{ score.black }}</text>
                  </view>
                  <view class="vs">对弈</view>
                  <view class="player right">
                    <text class="player-score" :key="`white-${score.white}`">{{ score.white }}</text>
                    <view class="player-name"><text class="player-title">{{ s.game?.mode === 'local' ? '白棋棋友' : s.game?.mode === 'ai' ? '练习棋友' : roomPlayerName(2) }}</text><text class="small-text">白棋 · {{ s.game?.mode === 'ai' ? vm.DIFFICULTIES[s.game.diff] : s.game?.mode === 'local' ? '同屏' : vm.peerConnected ? '已连接' : '等待连接' }}</text></view>
                    <PlayerAvatar :src="s.game?.mode === 'room' ? vm.seatProfile(2).avatar : ''" image-class="player-avatar">
                      <view class="stone white" />
                    </PlayerAvatar>
                  </view>
                </view>
                <view class="turn-line" aria-live="polite" data-od-id="turn-indicator"><view class="strong"><view class="status-dot" :class="{ offline: s.game?.mode === 'room' && !vm.peerConnected, wait: !vm.canPlay }" /><text>{{ vm.turnText }}</text></view><text class="turn-meta">第 {{ turnNumber }} 手{{ vm.canPlay && vm.legal.length ? ` · ${vm.legal.length} 处可落点` : '' }}</text></view>
                <ChessBoard v-if="s.game" :board="s.game.board" :legal="vm.legal" :turn="s.game.turn" :last="s.game.last" :hint="vm.boardHint" :can-play="vm.canPlay" :changed="s.changed" :effects="s.settings.effects && !vm.reducedMotion()" :effect="s.effect" @move="vm.sendMove" />
                <view class="board-caption"><text class="text">{{ vm.moveFeedback }}</text><view class="sound-indicator" :class="{ playing: s.soundPlaying }"><view class="i" /><view class="i" /><view class="i" /><text>{{ s.settings.sound && s.settings.volume > 0 ? '音效已开' : '已静音' }}</text></view></view>
                <view class="match-controls">
                  <view v-if="s.game?.variant === 'skills'" class="energy-row" data-od-id="energy-meter"><text>{{ s.game.mode === 'local' ? (s.game.turn === 1 ? '黑棋' : '白棋') + '能量' : '你的能量' }}</text><view class="energy-pips"><view v-for="n in 6" :key="n" class="i" :class="{ full: n <= vm.energy }" /><text class="energy-value">{{ vm.energy }}/6</text></view><text class="small quiet">每落一子 +1</text></view>
                  <view v-if="s.game?.variant === 'skills'" class="skill-controls">
                    <button role="button" tabindex="0" hover-class="none" class="equipped-skill" :class="{ 'tap-control': s.tap === 'skills' }" data-od-id="equipped-skill" @click="action('skills')"><view class="skill-symbol"><AppIcon :name="vm.selected.icon" /></view><view><text class="strong">{{ vm.selected.name }}</text><text class="small-text">{{ vm.selected.cost ? vm.selected.cost + ' 点能量' : '每局一次' }} · 点击更换</text></view></button>
                    <button role="button" :tabindex="(vm.skillDisabled) ? -1 : 0" hover-class="none" class="btn primary" :class="{ armed: s.armed, 'tap-control': s.tap === 'use-skill' }" :disabled="vm.skillDisabled" :aria-pressed="!!s.armed" data-od-id="activate-skill" @click="action('use-skill')">{{ vm.skillLabel }}</button>
                  </view>
                  <view v-else class="classic-note">经典黑白 · 每一手，只凭棋力。</view>
                  <view class="game-toast" aria-live="polite">{{ vm.gameHint }}</view>
                  <view class="game-tools" role="group" aria-label="对局工具">
                    <button role="button" :tabindex="canUndo ? 0 : -1" hover-class="none" class="text-btn" :class="{ 'tap-control': s.tap === 'undo' }" :disabled="!canUndo" data-od-id="undo-move" @click="action('undo')">
                      <AppIcon name="undo" /><text>悔棋</text>
                    </button>
                    <button role="button" tabindex="0" hover-class="none" class="text-btn" data-od-id="game-log" @click="action('log')">
                      <AppIcon name="book" /><text>棋谱</text>
                    </button>
                    <button role="button" :tabindex="s.game?.over || s.busy ? -1 : 0" hover-class="none" class="text-btn" :disabled="s.game?.over || s.busy" data-od-id="game-resign" @click="action('resign')">
                      <text class="resign-mark" aria-hidden="true">止</text><text>认输</text>
                    </button>
                    <button role="button" tabindex="0" hover-class="none" class="text-btn" data-od-id="game-settings" @click="onSettings">
                      <AppIcon :name="s.settings.sound && s.settings.volume > 0 ? 'sound' : 'mute'" /><text>{{ native ? '声音设置' : '声音与动效' }}</text>
                    </button>
                  </view>
                </view>
              </view>
            </view>

            <view id="screen-room" v-show="(s.screen === 'room' || s.leaving === 'room') && s.room" :inert="s.screen !== 'room' || undefined" tabindex="-1" class="screen pad" :class="{ active: s.screen === 'room', leaving: s.leaving === 'room' }" aria-label="好友邀请房间" data-od-id="friend-room-screen">
              <view class="page-intro room-intro"><view><view class="eyebrow">好友棋桌</view><view class="h1" data-od-id="room-title">好棋，<text class="line-break">
  </text>就等你来。</view></view><view class="stamp">一席待君</view></view>
              <view class="room-paper"><text class="small quiet">房间号</text><view class="room-code" data-od-id="room-six-digit-code">{{ vm.roomCode }}</view><text class="small quiet">{{ vm.roomExpiry }}</text></view>
              <view class="seats">
                <view class="seat">
                  <view class="seat-face">
                    <PlayerAvatar :src="vm.seatProfile(1).avatar" image-class="seat-avatar">
                      <view class="seat-initial" aria-hidden="true">{{ seatInitial(1) }}</view>
                    </PlayerAvatar>
                    <view class="seat-badge" aria-hidden="true" />
                  </view>
                  <text class="strong">{{ vm.seatProfile(1).name || (roomHost ? '你' : '好友') }}</text>
                  <text class="small-text">执黑 · 房主{{ vm.myColor === 1 && vm.seatProfile(1).name ? ' · 你' : '' }}</text>
                </view>
                <view class="seat-divider" />
                <view class="seat" :class="{ waiting: !roomGuest }">
                  <view class="seat-face">
                    <PlayerAvatar :src="roomGuest ? vm.seatProfile(2).avatar : ''" image-class="seat-avatar">
                      <view v-if="roomGuest" class="seat-initial white" aria-hidden="true">{{ seatInitial(2) }}</view>
                      <view v-else class="stone white" />
                    </PlayerAvatar>
                    <view v-if="roomGuest" class="seat-badge white" aria-hidden="true" />
                  </view>
                  <text class="strong">{{ roomGuest ? (vm.seatProfile(2).name || (roomHost ? '好友' : '你')) : (roomHost ? '好友' : '你') }}</text>
                  <text class="small-text">{{ roomGuest ? (vm.myColor === 2 ? (vm.seatProfile(2).name ? '执白 · 你' : '执白 · 已入座') : '执白 · 好友') : '执白 · 等待入座' }}</text>
                </view>
              </view>
              <button v-if="needsProfileHint" role="button" tabindex="0" hover-class="none" class="room-profile-cta" aria-label="设置棋手名片" data-od-id="room-profile-hint" @click="onSettings">
                <AppIcon name="friends" :size="13" />
                <text class="cta-copy">{{ native ? vm.avatarLocalOnly ? '重新上传头像' : '设置昵称与头像' : '设置棋手昵称' }}</text>
                <AppIcon name="arrow" :size="12" />
              </button>
              <view class="room-status" aria-live="polite"><view class="status-dot" :class="{ wait: !roomGuest || s.connection === 'reconnecting' }" /><text>{{ vm.roomStatus }}</text></view>
              <view class="room-actions">
                <button role="button" :tabindex="s.busy || roomHost && roomGuest && !vm.peerConnected ? -1 : 0" hover-class="none" class="btn primary"
                  data-od-id="room-wechat-invite" :disabled="s.busy || roomHost && roomGuest && !vm.peerConnected" @click="vm.roomMain">
                  <AppIcon :name="roomNeedsAction ? 'board' : 'share'" tone="ivory" /><text>{{ vm.roomMainLabel }}</text>
                </button>
                <button role="button" tabindex="0" hover-class="none" class="btn secondary" data-od-id="copy-room-invite" @click="action('copy-room')">复制房间邀请</button>
                <!-- #ifdef H5 -->
                <button role="button" tabindex="0" hover-class="none" v-if="roomHost && !roomGuest" class="text-btn" data-od-id="open-local-peer" @click="vm.openPeer(s.room!.code)">在另一窗口加入<AppIcon name="arrow" :size="14" /></button>
                <!-- #endif -->
              </view>
              <!-- #ifdef MP-WEIXIN -->
              <view v-if="!needsProfileHint || !shortScreen" class="room-note"><text class="b">把棋桌，捎给那位老友。</text><view>好友入座后，由执黑的房主开始这一局。</view></view>
              <!-- #endif -->
              <!-- #ifndef MP-WEIXIN -->
              <view v-if="!needsProfileHint || !shortScreen" class="room-note"><text class="b">邀位好友，各执一色。</text><view>可在另一窗口入座，也可将邀请链接捎给同一网络下的好友。</view></view>
              <!-- #endif -->
            </view>

            <view id="screen-join" v-show="s.screen === 'join' || s.leaving === 'join'" :inert="s.screen !== 'join' || undefined" tabindex="-1" class="screen pad" :class="{ active: s.screen === 'join', leaving: s.leaving === 'join' }" aria-label="输入六位房间号" data-od-id="join-room-screen">
              <view class="page-intro"><view class="eyebrow">赴一场棋约</view><view class="h1" data-od-id="join-title">输入房间号，<text class="line-break">
  </text>即刻入座。</view><view class="p">向好友要一个六位数的棋桌暗号。</view></view>
              <view class="join-digits"><view class="digit-boxes" aria-hidden="true"><text v-for="i in 6" :key="i" class="text" :class="{ next: i === s.joinCode.length + 1, filled: !!s.joinCode[i - 1] }">{{ s.joinCode[i - 1] || '' }}</text></view><input :value="s.joinCode" :disabled="s.busy" type="number" inputmode="none" :maxlength="6" aria-label="六位数字房间号" data-od-id="room-number-input" @input="onJoinInput" @confirm="vm.joinRoom" @keydown.enter.prevent="vm.joinRoom" /></view>
              <view class="join-status"><view class="join-error" :class="{ pending: s.busy, hint: !s.joinError && !s.busy && s.joinCode.length !== 6, ready: !s.joinError && !s.busy && s.joinCode.length === 6 }" role="status">{{ s.joinError || (s.busy ? '正在连接棋桌…' : s.joinCode.length === 6 ? '六位已齐，可以入座。' : s.joinCode.length ? `还差 ${6 - s.joinCode.length} 位数字。` : '也可粘贴好友发来的房间号。') }}</view><button role="button" :tabindex="s.busy ? -1 : 0" hover-class="none" class="join-paste" :disabled="s.busy" aria-label="粘贴房间号" data-od-id="paste-room-code" @click="vm.pasteJoinCode()">粘贴</button></view>
              <view class="keypad" data-od-id="room-number-keypad"><button role="button" :tabindex="(s.busy) ? -1 : 0" hover-class="none" v-for="n in 9" :key="n" :disabled="s.busy" @click="key(String(n))">{{ n }}</button><button role="button" :tabindex="(s.busy) ? -1 : 0" hover-class="none" class="word" :disabled="s.busy" @click="key('clear')">清空</button><button role="button" :tabindex="(s.busy) ? -1 : 0" hover-class="none" :disabled="s.busy" @click="key('0')">0</button><button role="button" :tabindex="(s.busy) ? -1 : 0" hover-class="none" class="word" aria-label="删除一位" :disabled="s.busy" @click="key('delete')">⌫</button></view>
              <button role="button" :tabindex="(s.joinCode.length !== 6 || s.busy) ? -1 : 0" hover-class="none" class="btn primary" :disabled="s.joinCode.length !== 6 || s.busy" data-od-id="join-room-submit" @click="action('join-submit')">{{ s.busy ? '正在连接棋桌…' : '加入棋桌' }}<AppIcon end tone="ivory" name="arrow" /></button>
              <view class="help-copy" style="text-align:center;margin-top:16px">输入好友分享的房间号，在本机或微信小程序中入座。</view>
            </view>

            <view id="screen-result" v-show="s.screen === 'result' || s.leaving === 'result'" :inert="s.screen !== 'result' || undefined" tabindex="-1" class="screen pad" :class="{ active: s.screen === 'result', leaving: s.leaving === 'result' }" aria-label="对局结算" data-od-id="result-screen">
              <template v-if="current">
                <view class="section-line" style="padding:2px 0 13px"><text class="text">一局终了 · 落子成谱</text><text class="text">{{ vm.dateLabel(current.at) }}</text></view>
                <view class="scorecard" data-od-id="result-scorecard">
                  <view class="scorecard-header"><text class="serif">翻盘棋 · 本局棋谱</text><view class="stamp">{{ vm.recordLabel(current) }}</view></view>
                  <view class="h1 result-title" data-od-id="result-title">{{ resultTitle }}</view>
                  <view class="result-scores"><view><text class="b" :key="`result-black-${current.black}`">{{ current.black }}</text><text class="small-text">黑棋{{ current.mode !== 'local' && current.myColor === 1 ? ' · 你' : '' }}</text></view><text class="quiet">:</text><view><text class="b" :key="`result-white-${current.white}`">{{ current.white }}</text><text class="small-text">白棋{{ current.mode !== 'local' && current.myColor === 2 ? ' · 你' : '' }}</text></view></view>
                  <ChessBoard :board="resultBoard" kind="result" :effects="false" />
                  <view class="result-meta"><text>{{ current.history.length }} 手落子</text><text>{{ current.variant === 'skills' ? `发动技能 ${current.skills} 次` : '经典黑白' }}</text><text>{{ vm.reasonLabel(current) }}</text></view>
                  <view class="result-foot">{{ current.reason === 'resign' ? '此局以认输结束，比分为结束时的实盘棋子数。' : '这一局的黑白，留给下一次相逢。' }}</view>
                </view>
                <button role="button" tabindex="0" hover-class="none" class="btn primary" data-od-id="share-result" @click="action('share-result')">分享这一局<AppIcon end tone="ivory" name="share" /></button>
                <view class="two-actions"><button role="button" :tabindex="(guestWaitingRematch || s.busy) ? -1 : 0" hover-class="none" class="btn secondary" :disabled="guestWaitingRematch || s.busy" data-od-id="result-play-again" @click="action('again')">{{ guestWaitingRematch ? '等待房主开局' : '再来一局' }}</button><button role="button" tabindex="0" hover-class="none" class="btn secondary" data-od-id="result-review" @click="action('review')">逐手回看</button></view>
                <button role="button" tabindex="0" hover-class="none" class="text-btn" style="width:100%;margin-top:5px" data-od-id="result-home" @click="action('home')">收好棋子，返回棋桌</button>
              </template>
              <view v-else class="empty-state"><view class="h2">棋局还在进行</view><view class="p">落子之后，棋谱会留在这里。</view><button role="button" tabindex="0" hover-class="none" class="btn primary" @click="action('home-play')">回到棋盘</button></view>
            </view>

            <view id="screen-records" v-show="s.screen === 'records' || s.leaving === 'records'" :inert="s.screen !== 'records' || undefined" tabindex="-1" class="screen pad" :class="{ active: s.screen === 'records', leaving: s.leaving === 'records' }" aria-label="我的棋谱" data-od-id="records-screen">
              <view class="page-intro"><view class="eyebrow">每一局，都算数</view><view class="h1" data-od-id="records-title">我的棋谱</view><view class="p">只记录在这台设备上完成的对局。</view></view>
              <view v-if="!s.records.length" class="empty-state"><view class="empty-stones"><view class="stone" /><view class="stone white" /></view><view class="h2">还没有落子成谱</view><view class="p">完成第一局后，比分与棋路<text class="line-break">
  </text>都会好好留在这里。</view><button role="button" tabindex="0" hover-class="none" class="btn primary" data-od-id="records-first-game" @click="action('modes')">去下一局</button></view>
              <view role="list" v-else class="record-list"><view role="listitem" v-for="record in s.records" :key="record.id" class="list-item"><button role="button" tabindex="0" hover-class="none" class="record-item" :data-od-id="`record-${record.id}`" @click="vm.openRecord(record)"><text class="record-seal">{{ vm.recordLabel(record) }}</text><view>{{ vm.recordMode(record) }}<text class="small-text">{{ vm.dateLabel(record.at, true) }} · {{ record.history.length }} 手{{ record.reason === 'resign' ? ' · 认输' : '' }}</text></view><text class="b">{{ record.black }}:{{ record.white }}</text><AppIcon name="chevron" class="cell-chevron" tone="muted" :size="16" /></button></view></view>
            </view>

            <view id="screen-chapters" v-show="s.screen === 'chapters' || s.leaving === 'chapters'" :inert="s.screen !== 'chapters' || undefined" tabindex="-1" class="screen pad" :class="{ active: s.screen === 'chapters', leaving: s.leaving === 'chapters' }" aria-label="章节练习" data-od-id="chapter-route-screen">
              <view class="page-intro"><view class="eyebrow">翻盘入门 · 三章棋谱</view><view class="h1" data-od-id="chapters-title">棋路，一步步来。</view><view class="p">从夹住第一枚棋子，到守住最后一个角。</view></view>
              <view role="list" class="chapter-list"><view role="listitem" v-for="(item, index) in vm.CHAPTERS" :key="item.name" class="list-item"><button role="button" tabindex="0" hover-class="none" class="chapter-card" :aria-disabled="index > 0 && !s.chaptersDone.includes(index - 1)" :data-od-id="`chapter-${index + 1}`" @click="startChapter(index)"><text class="text">{{ item.numeral }}</text><view><text class="strong">{{ item.name }}</text><text v-if="s.chaptersDone.includes(index)" class="chapter-done">已完成</text><text class="p">{{ index > 0 && !s.chaptersDone.includes(index - 1) ? '完成上一章后开启。' : item.description }}</text></view><AppIcon :name="index > 0 && !s.chaptersDone.includes(index - 1) ? 'lock' : 'chevron'" tone="muted" :size="17" /></button></view></view>
              <button role="button" tabindex="0" hover-class="none" class="text-btn" style="width:100%;margin-top:15px" @click="action('rules')">先读一页对弈规则<AppIcon name="arrow" :size="15" /></button>
            </view>
          </view>
        </scroll-view>

        <view v-if="shortScreen && s.screen === 'modes'" :inert="s.sheetOpen || undefined" class="mode-dock" data-od-id="mode-dock">
          <button role="button" tabindex="0" hover-class="none" class="btn primary" data-od-id="mode-start" @click="action('start-mode')">{{ s.mode === 'room' ? '创建好友房' : s.mode === 'ai' ? '开始练习' : '两人入座' }}<AppIcon end tone="ivory" name="arrow" /></button>
          <button role="button" tabindex="0" hover-class="none" class="text-btn" @click="action('join')">已有房间号？直接入座</button>
        </view>

        <view v-if="vm.isTabScreen" :inert="s.sheetOpen || undefined" class="bottom-nav" aria-label="主导航" data-od-id="main-navigation">
          <button v-for="tab in tabs" :key="tab.screen" role="button" tabindex="0" hover-class="none" :class="{ active: s.screen === tab.screen }"
            :aria-current="s.screen === tab.screen ? 'page' : undefined" :data-od-id="`nav-${tab.screen}`" @click="vm.tapTab(tab.screen)">
            <AppIcon :name="tab.icon" :tone="s.screen === tab.screen ? 'felt' : 'muted'" :class="{ 'tap-tab': s.tap === `tab-${tab.screen}` }" /><text>{{ tab.label }}</text>
          </button>
        </view>
        <GameSheets :vm="model" />
        <view class="toast" :class="{ visible: !!noticeLabel }" role="status" aria-live="polite">{{ noticeLabel }}</view>
        <!-- #ifdef H5 -->
        <view class="home-indicator" aria-hidden="true" />
        <!-- #endif -->
      </view>
      <view class="margin-note right" data-od-id="desktop-playing-guide">
        <view class="desktop-stones"><view class="stone" /><view class="stone white" /></view>
        <view class="manual-title">入座之前</view>
        <view class="manual-step"><text class="text">一</text><view><text class="strong">黑先白后，轮流落子</text><view class="p">夹住对方棋子，横、竖、斜八个方向皆可翻转。</view></view></view>
        <view class="manual-step"><text class="text">二</text><view><text class="strong">邀位好友，各执一色</text><view class="p">创建棋桌，把六位房间号捎给好友，等对方入座。</view></view></view>
        <view class="manual-step"><text class="text">三</text><view><text class="strong">盘未终，皆可翻</text><view class="p">无处落子时自动让手。终局时，棋子更多的一方获胜。</view></view></view>
        <view class="desktop-status"><view class="status-dot" :class="{ offline: s.connection === 'reconnecting' }" /><text>{{ vm.turnText }} · 黑 {{ score.black }} / 白 {{ score.white }}</text></view>
      </view>
    </view>
  </view>
</template>
