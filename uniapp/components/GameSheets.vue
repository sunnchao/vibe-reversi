<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { GameMove, SkillKey } from '../../src/friends/game';
import { sharedAvatar } from '../../src/friends/rooms';
import { avatarStorageKey, MOTION_FEEDBACK_AVAILABLE } from '../lib/platform';
import { getWechatCloud } from '../lib/room-client';
import type { useReversi } from '../lib/use-reversi';
import AppIcon from './AppIcon.vue';
import BottomSheet from './BottomSheet.vue';
import ChessBoard from './ChessBoard.vue';
import PlayerAvatar from './PlayerAvatar.vue';

defineOptions({ options: { styleIsolation: 'shared', virtualHost: true } });
const props = defineProps<{ vm: ReturnType<typeof useReversi> }>();
const vm = props.vm;
const state = vm.state;
const activeRecord = computed(() => vm.activeRecord.value);
const replayBoard = computed(() => vm.replayBoard.value);
const detailSkill = computed(() => vm.SKILLS[state.skillDetail]);
const title = computed(() => state.sheet === 'skill-detail'
  ? detailSkill.value.name
  : state.sheet ? vm.SHEET_TITLES[state.sheet] : '');
const skillKeys: SkillKey[] = ['bomb', 'insight', 'charge'];
const skillOptions = skillKeys.map(key => ({ key, ...vm.SKILLS[key] }));
const demoCells = Array.from({ length: 9 }, (_, index) => index);
const demoTargets = [1, 3, 5, 7];
// #ifndef MP-WEIXIN
let vibrationDescription = '落子、导航与技能点按时轻振';
// #ifdef H5
vibrationDescription = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
  ? '落子、导航与技能点按时轻振' : '当前浏览器不支持振动，保留开关偏好';
// #endif
// #endif
const settingOptions = [
  { key: 'sound', label: '落子音效', description: '棋子落下与技能发动的声音' },
  // #ifndef MP-WEIXIN
  { key: 'effects', label: '界面动效', description: '切页、落子与技能反馈' },
  { key: 'vibration', label: '轻触振动', description: vibrationDescription },
  // #endif
] as const;
const rules = [
  '标准开局为中央两黑两白，黑棋先行。只能在夹住至少一枚敌子的空格落子。',
  '沿横、竖、斜八个方向，被己方棋子夹住的连续敌子全部翻转。',
  '没有合法落点时自动让手；双方都不能落子时结束。终局棋子多的一方获胜。',
  '趣味技能局从各 3\u00A0点能量开始，每次落子获得 1\u00A0点，上限 6\u00A0点。技能不允许在非法格落子。',
];
const moveLog = computed(() => (activeRecord.value ?? state.game)?.history ?? []);
const replayMax = computed(() => activeRecord.value?.history.length ?? 0);
const replayMove = computed(() => vm.replayMove.value ?? null);
const replayScore = computed(() => vm.replayScore.value);
const replayDescription = computed(() => replayMove.value
  ? `${replayMove.value.color === 1 ? '黑棋' : '白棋'} ${vm.coord(replayMove.value.i)} · 翻 ${flips(replayMove.value)} 子${skillSuffix(replayMove.value)}`
  : '黑棋先行 · 中央四子已就位');
const replayLogTarget = ref('');
watch(() => [state.sheet, state.sheetOpen, state.replayAt] as const, async ([sheet, open, at]) => {
  if (sheet !== 'replay' || !open) { replayLogTarget.value = ''; return; }
  replayLogTarget.value = '';
  await nextTick();
  if (sheet === state.sheet && open) replayLogTarget.value = at > 0 ? `replay-move-${at}` : 'replay-move-1';
}, { immediate: true });
const isResultShare = computed(() => state.sheet === 'share-result');
const replaceCopy = computed(() => {
  if (state.replaceAction === 'room') return {
    description: '创建好友棋桌会结束尚未完成的棋局，不计入战绩。',
    label: '创建好友棋桌', action: 'confirm-create',
  };
  if (state.replaceAction === 'chapter') return {
    description: '开始章节练习会结束当前尚未完成的棋局，不计入战绩。',
    label: '开始章节练习', action: 'confirm-replace',
  };
  return state.screen === 'join' ? {
    description: '加入好友棋桌会结束当前尚未完成的棋局，不计入战绩。',
    label: '加入好友棋桌', action: 'confirm-replace',
  } : {
    description: '开始新一局会结束当前尚未完成的棋局，不计入战绩。',
    label: '开始新一局', action: 'confirm-replace',
  };
});
const dialog = computed(() => {
  if (state.sheet === 'pause') return {
    title: '先歇一会儿？', copy: '当前棋局会保留，回到首页后可以继续。',
    cancel: '继续下棋', confirm: '回到首页', cancelId: 'resume-match', confirmId: 'sheet-pause-home',
    danger: false, confirmAction: vm.pauseHome,
  };
  if (state.sheet === 'resign') return {
    title: '这一局，先让一步？', copy: '认输后按当前实盘比分生成棋谱，对手获胜。',
    cancel: '再想一手', confirm: '确认认输', cancelId: 'keep-playing', confirmId: 'sheet-confirm-resign',
    danger: true, confirmAction: vm.resign,
  };
  if (state.sheet === 'leave') return {
    title: '收起这张棋桌？', copy: `离开后，${state.color === 1 ? '邀请会失效，好友也会收到离席提示' : '房主会收到离席提示'}。`,
    cancel: '继续等候', confirm: '离开棋桌', cancelId: 'keep-room', confirmId: 'sheet-leave-room',
    danger: true, confirmAction: () => vm.leaveRoom(),
  };
  if (state.sheet === 'replace-game') return {
    title: '先收好当前这一局？', copy: replaceCopy.value.description,
    cancel: '继续当前棋局', confirm: replaceCopy.value.label, cancelId: 'keep-game', confirmId: `sheet-${replaceCopy.value.action}`,
    danger: true, confirmAction: vm.confirmReplace,
  };
  if (state.sheet === 'exit') return {
    title: '收起小程序？', copy: state.room ? '离开后好友可能需要等待重连，未完成的棋局可能无法恢复。' : '未完成的棋局可能无法恢复，确定收起吗？',
    cancel: '继续下棋', confirm: '收起', cancelId: 'keep-miniapp', confirmId: 'sheet-confirm-exit',
    danger: false, confirmAction: vm.minimize,
  };
  return null;
});
const sheetKind = computed(() => state.sheet === 'more' ? 'actions' : dialog.value ? 'dialog' : 'sheet');
function flips(move: GameMove) { return (move.flips?.length ?? 0) + (move.extra?.length ?? 0); }
function skillSuffix(move: GameMove) { return move.skill ? ` · ${vm.SKILLS[move.skill].name}` : ''; }
function onVolume(event: { detail: { value: number } }) { vm.setVolume(event.detail.value); }
function inputValue(event: Event | { detail?: { value?: string } }) {
  const detail = 'detail' in event ? event.detail : undefined;
  if (detail && typeof detail.value === 'string') return detail.value;
  const target = (event as Event).target as HTMLInputElement | null;
  return target?.value ?? '';
}
function onNickname(event: Event | { detail?: { value?: string } }) { vm.setProfile({ name: inputValue(event) }); }
// #ifdef MP-WEIXIN
const avatarUploading = ref(false);
async function onChooseAvatar(event: { detail?: { avatarUrl?: string } }) {
  const url = event.detail?.avatarUrl;
  if (!url || avatarUploading.value) return;
  avatarUploading.value = true;
  try {
    const cloud = getWechatCloud();
    if (!cloud?.uploadFile) throw new Error('avatar upload unavailable');
    const result = await cloud.uploadFile({
      cloudPath: `avatars/${avatarStorageKey()}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.jpg`,
      filePath: url,
    });
    const avatar = sharedAvatar(result?.fileID);
    if (!avatar.startsWith('cloud://')) throw new Error('avatar upload returned no file ID');
    vm.setProfile({ avatar });
    vm.toast('头像已更新。');
  } catch {
    const avatarPreview = await new Promise<string>(resolve => {
      try {
        uni.saveFile({
          tempFilePath: url,
          success: result => resolve(result.savedFilePath || url),
          fail: () => resolve(url),
        });
      } catch { resolve(url); }
    });
    vm.setProfile({ avatarPreview });
    vm.toast('新头像仅在本机预览，请重试上传。');
  } finally {
    avatarUploading.value = false;
  }
}
// #endif
function onReplay(event: { detail: { value: number } }) { vm.replaySet(event.detail.value); }
function jumpFromLog(at: number) { vm.replaySet(at); vm.closeSheet(); }
function sliderKey(event: KeyboardEvent, kind: 'volume' | 'replay') {
  const volume = kind === 'volume';
  if (volume ? !state.settings.sound : !replayMax.value) return;
  const max = volume ? 100 : replayMax.value;
  const current = volume ? state.settings.volume : state.replayAt;
  const step = volume ? 5 : 1;
  const delta = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step, PageDown: -step * 10, PageUp: step * 10 }[event.key];
  if (delta === undefined && event.key !== 'Home' && event.key !== 'End') return;
  event.preventDefault(); event.stopPropagation();
  const value = event.key === 'Home' ? 0 : event.key === 'End' ? max : Math.max(0, Math.min(max, current + delta!));
  if (volume) vm.setVolume(value); else vm.replaySet(value);
}
</script>

<template>
  <BottomSheet :open="state.sheetOpen" :name="state.sheet ?? ''" :title="title" :kind="sheetKind"
    :footer="state.sheet === 'settings' ? '收好设置' : ''"
    @close="vm.closeSheet" @key="vm.replayKey" @footer="vm.closeSheet">
    <template v-if="state.sheet === 'more'">
      <view class="action-list">
        <button role="button" tabindex="0" hover-class="none" data-od-id="more-settings" @click="vm.openSheet('settings')">设置与偏好</button>
        <button role="button" tabindex="0" hover-class="none" data-od-id="more-rules" @click="vm.openSheet('rules')">对弈规则</button>
        <button role="button" tabindex="0" hover-class="none" data-od-id="more-home" @click="vm.menuHome">回到棋桌</button>
      </view>
      <button role="button" tabindex="0" hover-class="none" class="action-cancel" data-od-id="close-more" @click="vm.closeSheet">取消</button>
    </template>
    <template v-else-if="dialog">
      <view class="dialog-title">{{ dialog.title }}</view>
      <view class="dialog-copy">{{ dialog.copy }}</view>
      <view class="dialog-actions">
        <button role="button" tabindex="0" hover-class="none" :data-od-id="dialog.cancelId" @click="vm.closeSheet">{{ dialog.cancel }}</button>
        <button role="button" :tabindex="state.busy ? -1 : 0" hover-class="none" class="dialog-confirm" :class="{ danger: dialog.danger }"
          :disabled="state.busy" :data-od-id="dialog.confirmId" @click="dialog.confirmAction()">{{ dialog.confirm }}</button>
      </view>
      <button v-if="state.sheet === 'pause' && state.room" role="button" :tabindex="state.busy ? -1 : 0" hover-class="none" class="text-btn game-sheets-full" :disabled="state.busy" data-od-id="leave-match-room" @click="vm.openSheet('leave')">离开这张棋桌</button>
    </template>
    <template v-else-if="state.sheet === 'settings'">
      <view class="settings-section-label">我的棋手名片</view>
      <view class="profile-card" data-od-id="profile-card">
        <view class="profile-face">
          <PlayerAvatar :src="vm.localAvatar.value" image-class="profile-avatar">
            <view class="stone profile-stone" aria-hidden="true" />
          </PlayerAvatar>
          <view class="profile-badge" aria-hidden="true">{{ vm.profile.name ? vm.profile.name.slice(0, 1) : '弈' }}</view>
        </view>
        <view class="profile-copy">
          <text class="strong">{{ vm.profile.name || '未设置昵称' }}</text>
          <!-- #ifdef MP-WEIXIN -->
          <text class="small-text">{{ vm.avatarLocalOnly.value ? '新头像仅本机可见，请重试上传' : '与同桌棋友显示昵称和头像' }}</text>
          <!-- #endif -->
          <!-- #ifndef MP-WEIXIN -->
          <text class="small-text">好友入座后，双方都能看到这个名字</text>
          <!-- #endif -->
        </view>
        <!-- #ifdef MP-WEIXIN -->
        <button role="button" :tabindex="avatarUploading ? -1 : 0" :disabled="avatarUploading" hover-class="none" class="profile-change" open-type="chooseAvatar" aria-label="更换头像" data-od-id="choose-avatar" @chooseavatar="onChooseAvatar">{{ avatarUploading ? '上传中…' : '换头像' }}</button>
        <!-- #endif -->
      </view>
      <label class="profile-field">
        <text class="profile-field-label">昵称</text>
        <!-- #ifdef MP-WEIXIN -->
        <input class="profile-input" type="nickname" :value="vm.profile.name" placeholder="点这里填写昵称" :maxlength="24" aria-label="昵称" data-od-id="nickname-input" @input="onNickname" @blur="onNickname" />
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <input class="profile-input" :value="vm.profile.name" placeholder="点这里填写昵称" :maxlength="24" aria-label="昵称" data-od-id="nickname-input" @input="onNickname" @blur="onNickname" />
        <!-- #endif -->
      </label>
      <view class="settings-section-label">{{ MOTION_FEEDBACK_AVAILABLE ? '声音与反馈' : '声音' }}</view>
      <view v-for="setting in settingOptions" :key="setting.key" class="settings-row">
        <view><text class="strong">{{ setting.label }}</text><text class="small-text">{{ setting.description }}</text></view>
        <button tabindex="0" hover-class="none" class="toggle" role="switch" :aria-checked="state.settings[setting.key]" :aria-label="setting.label"
          data-action="setting" :data-key="setting.key" :data-od-id="`setting-${setting.key}`" @click="vm.toggleSetting(setting.key)"><view class="text" /></button>
      </view>
      <view class="volume-control">
        <view class="volume-label"><text>音效音量</text><text id="volume-value">{{ state.settings.volume }}%</text></view>
        <slider id="volume" class="game-sheets-range" :min="0" :max="100" :step="5" :value="state.settings.volume"
          :disabled="!state.settings.sound" active-color="#244d3e" background-color="#bbb4a2" block-color="#bb9250" :block-size="16"
          role="slider" :tabindex="state.settings.sound ? 0 : -1" aria-label="音效音量" :aria-disabled="!state.settings.sound" :aria-valuemin="0" :aria-valuemax="100" :aria-valuenow="state.settings.volume" data-od-id="volume-control" @keydown="sliderKey($event, 'volume')" @changing="onVolume" @change="onVolume" />
      </view>
      <view v-if="MOTION_FEEDBACK_AVAILABLE" class="p setting-note">{{ vm.reducedMotion() ? '已跟随系统「减少动态效果」设置。' : '支持系统「减少动态效果」，偏好保存在此设备。' }}</view>
    </template>

    <template v-else-if="state.sheet === 'skills'">
      <view class="p">技能仍需配合合法落子。点开一张招式，先看清再出手。</view>
      <button role="button" tabindex="0" hover-class="none" v-for="skill in skillOptions" :key="skill.key" class="skill-card" :class="{ 'tap-control': state.tap === `skill-${skill.key}` }" data-action="skill-detail"
        :data-skill="skill.key" :data-od-id="`skill-option-${skill.key}`" @click="vm.selectSkill(skill.key)">
        <view class="text skill-symbol"><AppIcon :name="skill.icon" :size="22" /></view>
        <view class="text skill-copy"><text class="strong">{{ skill.name }}</text><text class="small-text">{{ skill.cost ? `${skill.cost} 点能量` : '每局一次' }} · {{ skill.short }}</text></view>
        <text class="text skill-arrow" :class="{ selected: skill.key === state.selectedSkill }">{{ skill.key === state.selectedSkill ? '已装配' : '详情' }} ›</text>
      </button>
    </template>

    <template v-else-if="state.sheet === 'skill-detail'">
      <view class="skill-detail-line"><text class="text">{{ detailSkill.cost ? `消耗 ${detailSkill.cost} 点能量` : '不消耗能量' }}</text><text class="text">{{ state.skillDetail === 'charge' ? '每局一次' : '趣味技能局' }}</text></view>
      <view v-if="state.skillDetail === 'bomb'" class="skill-demo" role="img" aria-label="中间落黑子，十字方向相邻的白子会翻转">
        <view v-for="cell in demoCells" :key="cell" class="text" :class="{ target: demoTargets.includes(cell) }">
          <view v-if="cell === 4 || demoTargets.includes(cell)" class="i stone" :class="{ white: cell !== 4 }" />
        </view>
      </view>
      <view v-else class="game-sheets-detail-icon"><view class="text skill-symbol game-sheets-large-symbol"><AppIcon :name="detailSkill.icon" :size="22" /></view></view>
      <view class="p skill-description">{{ detailSkill.detail }}</view>
      <view class="p help-copy">{{ detailSkill.limit }}。{{ state.skillDetail === 'bomb' ? '普通翻子与额外翻子会合并计分。' : '' }}</view>
      <button role="button" tabindex="0" hover-class="none" class="btn primary" :class="{ 'tap-control': state.tap === 'equip' }" data-action="equip" :data-skill="state.skillDetail" data-od-id="sheet-equip" @click="vm.equipSkill(state.skillDetail)">装配{{ detailSkill.name }}</button>
      <button role="button" tabindex="0" hover-class="none" class="text-btn game-sheets-return" data-action="skills" data-od-id="sheet-skill-list" @click="vm.openSheet('skills')">返回全部技能</button>
    </template>

    <template v-else-if="state.sheet === 'rules'">
      <view class="list rules-steps game-sheets-rules">
        <view v-for="(rule, index) in rules" :key="index" class="list-item"><text class="game-sheets-rule-number">0{{ index + 1 }}</text><text>{{ rule }}</text></view>
      </view>
      <view class="p help-copy">棋盘光点是合法落点，朱砂小印标记上一手；方框是「洞察一步」的建议。</view>
      <button role="button" tabindex="0" hover-class="none" class="btn primary" data-action="close-sheet" data-od-id="sheet-close-sheet" @click="vm.closeSheet">明白了，入座</button>
    </template>

    <template v-else-if="state.sheet === 'log'">
      <template v-if="moveLog.length">
        <scroll-view scroll-y class="list move-log" :style="{ height: `${Math.min(moveLog.length * 26.4, 300)}px` }">
          <view v-for="(move, index) in moveLog" :key="index" class="list-item game-sheets-log-item">
            <button v-if="state.sheetReturn === 'replay'" role="button" tabindex="0" hover-class="none" class="game-sheets-log-jump" :class="{ current: state.replayAt === index + 1 }" :data-od-id="`log-jump-${index + 1}`" :aria-current="state.replayAt === index + 1 ? 'true' : undefined" @click="jumpFromLog(index + 1)">
              <text class="game-sheets-move-number">{{ index + 1 }}.</text><text class="mv">{{ move.color === 1 ? '黑' : '白' }} {{ vm.coord(move.i) }}</text><text class="text">翻 {{ flips(move) }} 子{{ skillSuffix(move) }}</text>
            </button>
            <template v-else>
              <text class="game-sheets-move-number">{{ index + 1 }}.</text><text class="mv">{{ move.color === 1 ? '黑' : '白' }} {{ vm.coord(move.i) }}</text><text class="text">翻 {{ flips(move) }} 子{{ skillSuffix(move) }}</text>
            </template>
          </view>
        </scroll-view>
        <view class="p help-copy">{{ state.sheetReturn === 'replay' ? `共 ${moveLog.length} 手，点一行回到那一手。` : `共 ${moveLog.length} 手，按落子先后记录。` }}</view>
      </template>
      <view v-else class="p game-sheets-empty-log">还没有落子，第一手由黑棋开始。</view>
    </template>

    <template v-else-if="state.sheet === 'replay'">
      <view class="replay">
        <ChessBoard id="replay-board" :board="replayBoard" kind="replay" :last="replayMove?.i ?? -1" :effects="false" />
        <view class="replay-status" aria-live="polite" aria-atomic="true">
          <text id="replay-title" class="strong">{{ state.replayAt ? `第 ${String(state.replayAt).padStart(2, '0')} 手` : '开局' }}</text>
          <text id="replay-detail" class="text">{{ replayDescription }}</text>
          <text id="replay-score" class="text replay-score">黑 {{ replayScore.black }} · 白 {{ replayScore.white }}</text>
        </view>
        <slider id="replay-range" class="replay-range game-sheets-range" :min="0" :max="Math.max(1, replayMax)" :step="1" :value="state.replayAt" :disabled="!replayMax"
          active-color="#244d3e" background-color="#bbb4a2" block-color="#bb9250" :block-size="16" aria-label="回看进度"
          role="slider" :tabindex="replayMax ? 0 : -1" :aria-disabled="!replayMax" :aria-valuemin="0" :aria-valuemax="replayMax" :aria-valuenow="state.replayAt" :aria-valuetext="state.replayAt ? `第 ${state.replayAt} 手，共 ${replayMax} 手` : '开局'" @keydown="sliderKey($event, 'replay')" @changing="onReplay" @change="onReplay" />
        <view class="replay-steps" role="group" aria-label="回看控制">
          <button role="button" :tabindex="state.replayAt === 0 ? -1 : 0" hover-class="none" class="btn secondary" :disabled="state.replayAt === 0" data-action="replay-first" data-od-id="replay-first" @click="vm.replaySet(0)">开局</button>
          <button role="button" :tabindex="state.replayAt === 0 ? -1 : 0" hover-class="none" class="btn secondary" :disabled="state.replayAt === 0" data-action="replay-prev" data-od-id="replay-prev" @click="vm.replaySet(state.replayAt - 1)">上一手</button>
          <button role="button" :tabindex="state.replayAt === replayMax ? -1 : 0" hover-class="none" class="btn secondary" :disabled="state.replayAt === replayMax" data-action="replay-next" data-od-id="replay-next" @click="vm.replaySet(state.replayAt + 1)">下一手</button>
          <button role="button" :tabindex="state.replayAt === replayMax ? -1 : 0" hover-class="none" class="btn secondary" :disabled="state.replayAt === replayMax" data-action="replay-last" data-od-id="replay-last" @click="vm.replaySet(replayMax)">终局</button>
        </view>
        <view class="replay-log-head"><text class="text">落子记录</text><text class="text">点一行，跳到那一手</text></view>
        <scroll-view id="replay-log" scroll-y class="list replay-log" :style="{ height: `${Math.min(replayMax * 44, 132)}px` }" :scroll-into-view="replayLogTarget">
          <view v-for="(move, index) in activeRecord?.history ?? []" :id="`replay-move-${index + 1}`" :key="index" class="list-item">
            <button role="button" hover-class="none" data-action="replay-goto" :data-index="index + 1" :data-od-id="`replay-move-${index + 1}`" :tabindex="-1"
              :aria-current="state.replayAt === index + 1 ? 'true' : undefined" @click="vm.replaySet(index + 1)">
              <text class="text no">{{ String(index + 1).padStart(2, '0') }}</text><text class="text mv">{{ move.color === 1 ? '黑' : '白' }} {{ vm.coord(move.i) }}</text><text class="text fl">翻 {{ flips(move) }} 子{{ skillSuffix(move) }}</text>
            </button>
          </view>
        </scroll-view>
        <button role="button" tabindex="0" hover-class="none" class="text-btn replay-log-link" data-od-id="replay-open-log" @click="vm.openSheet('log')">查看落子记录（{{ replayMax }} 手）</button>
      </view>
    </template>

    <template v-else-if="state.sheet === 'share-room' || state.sheet === 'share-result'">
      <view class="share-preview" data-od-id="share-preview-card">
        <ChessBoard v-if="isResultShare && activeRecord" :board="activeRecord.board" kind="result" />
        <image v-else class="image" src="/static/reversi-table.jpg" mode="widthFix" aria-label="翻盘棋的木框绿呢棋桌" />
        <view><text class="strong">{{ isResultShare && activeRecord ? `黑棋 ${activeRecord.black} : ${activeRecord.white} 白棋` : '来翻盘棋，和我对弈' }}</text><text class="small-text">{{ isResultShare && activeRecord ? `${activeRecord.history.length} 手 · ${vm.recordMode(activeRecord)}` : `房间 ${state.room?.code ?? '------'} · 好友棋桌` }}</text></view>
      </view>
      <!-- #ifdef MP-WEIXIN -->
      <view class="honest-note"><text class="strong">邀请微信好友</text><view class="p">点击分享会打开微信转发面板，由你选择好友发送。{{ isResultShare ? '也可以复制本局回顾，留给下次相逢。' : '好友也可以输入房间号加入棋桌。' }}</view></view>
      <button role="button" tabindex="0" hover-class="none" class="btn primary" open-type="share" data-od-id="sheet-native-share"><AppIcon name="share" tone="ivory" :size="18" />{{ isResultShare ? '分享这一局' : '邀请微信好友' }}</button>
      <button role="button" tabindex="0" hover-class="none" class="btn secondary game-sheets-share-copy" :class="{ copied: state.copied }" :data-action="isResultShare ? 'copy-result' : 'copy-room'" :data-od-id="isResultShare ? 'sheet-copy-result' : 'sheet-copy-room'" @click="vm.copyInvite(isResultShare)">{{ state.copied ? '已复制，可粘贴' : isResultShare ? '复制本局回顾' : '复制邀请文案' }}</button>
      <!-- #endif -->
      <!-- #ifndef MP-WEIXIN -->
      <view class="honest-note"><text class="strong">微信交接预览</text><view class="p">当前没有打开微信，也没有发送消息。你可以复制{{ isResultShare ? '本局回顾' : '邀请文案' }}，再自行粘贴分享。{{ isResultShare ? '' : '跨设备邀请请使用好友设备可访问的棋桌地址，例如同一局域网地址；好友可通过邀请链接或房间号加入。' }}</view></view>
      <button role="button" tabindex="0" hover-class="none" class="btn primary" :class="{ copied: state.copied }" :data-action="isResultShare ? 'copy-result' : 'copy-room'" :data-od-id="isResultShare ? 'sheet-copy-result' : 'sheet-copy-room'" @click="vm.copyInvite(isResultShare)">{{ state.copied ? '已复制，可粘贴' : isResultShare ? '复制本局回顾' : '复制邀请文案' }}</button>
      <!-- #endif -->
      <button role="button" tabindex="0" hover-class="none" class="text-btn game-sheets-return" data-action="close-sheet" data-od-id="share-return" @click="vm.closeSheet">{{ isResultShare ? '收好这一局' : '返回等待好友' }}</button>
    </template>

    <template v-else-if="state.sheet === 'copy-manually'">
      <view class="p">当前未能自动复制，请长按下方文案选择复制。</view>
      <text class="text game-sheets-manual-copy" selectable user-select aria-label="可手动复制的文案" data-od-id="manual-copy">{{ state.manualText }}</text>
      <button role="button" tabindex="0" hover-class="none" class="btn primary" data-action="close-sheet" data-od-id="sheet-close-sheet" @click="vm.closeSheet">回到棋桌</button>
    </template>
  </BottomSheet>
</template>

<style>
.game-sheets-range { width: calc(100% - 28px); min-height: 44px; margin: 0 14px; box-sizing: border-box; }
.game-sheets-return { width: 100%; margin-top: 8px; }
.game-sheets-full { width: 100%; }
.game-sheets-detail-icon { display: flex; justify-content: center; padding: 20px; }
.game-sheets-large-symbol { width: 68px; height: 68px; }
.game-sheets-rules .list-item::before { content: none; }
.game-sheets-rule-number { min-width: 20px; flex-shrink: 0; font-family: var(--display); color: var(--muted); }
.reversi-app .move-log { padding-left: 0; }
.reversi-app .game-sheets-log-item { display: flex; align-items: baseline; gap: 10px; }
.reversi-app .game-sheets-move-number { position: static; left: auto; width: auto; min-width: 20px; text-align: right; font: 10px var(--mono); color: var(--muted); }
.reversi-app .game-sheets-log-item .mv { font-weight: 600; }
.reversi-app .move-log .game-sheets-log-item .text { margin-left: auto; color: var(--muted); white-space: nowrap; }
.reversi-app .game-sheets-log-jump { width: 100%; display: flex; align-items: baseline; gap: 10px; text-align: left; min-height: 44px; padding: 6px 0; font-size: 12px; }
.reversi-app .game-sheets-log-jump.current { box-shadow: inset 2px 0 0 var(--accent); }
.reversi-app .settings-section-label { margin: 14px 0 8px; font-size: 10px; letter-spacing: .1em; color: var(--muted); }
.reversi-app .settings-section-label:first-child { margin-top: 2px; }
.reversi-app .profile-card { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--border); background: var(--surface); margin: 0 0 8px; }
.reversi-app .profile-face { position: relative; display: grid; place-items: center; width: 52px; height: 52px; flex: none; }
.reversi-app .profile-avatar { width: 52px; height: 52px; border-radius: 50%; border: 1px solid var(--border); object-fit: cover; }
.reversi-app .profile-stone { width: 48px; }
.reversi-app .profile-badge {
  position: absolute;
  right: -2px;
  bottom: -2px;
  min-width: 18px;
  height: 18px;
  padding: 0 3px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  border: 1px solid var(--accent);
  background: var(--ivory);
  color: var(--accent-ink);
  font: 10px/1 var(--display);
}
.reversi-app .profile-copy { min-width: 0; flex: 1; }
.reversi-app .profile-copy .strong { display: block; font: 600 15px/1.5 var(--display); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.reversi-app .profile-copy .small-text { display: block; font-size: 10px; line-height: 1.6; color: var(--muted); margin-top: 2px; }
.reversi-app .profile-change {
  flex: none;
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--bg);
  color: var(--fg);
  font-size: 11px;
}
.reversi-app .profile-change:active { background: var(--hover); }
.reversi-app .profile-field { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.reversi-app .profile-field-label { flex: none; font-size: 12px; color: var(--muted); }
.reversi-app .profile-input { flex: 1; min-width: 0; min-height: 44px; padding: 0 12px; border: 1px solid var(--border); background: var(--surface); font-size: 13px; }
.reversi-app .profile-input:focus { border-color: var(--fg); }
.reversi-app .skill-card .skill-arrow.selected { color: var(--accent-ink); font-weight: 600; }
/* Keep the trailing label on the title line instead of floating between two lines of copy. */
.reversi-app .skill-card { align-items: flex-start; }
.reversi-app .skill-card .skill-symbol { margin-top: 2px; }
.reversi-app .skill-card .skill-copy { flex: 1; min-width: 0; }
.reversi-app .skill-card .skill-arrow { align-self: flex-start; padding-top: 3px; }
@media (max-height: 700px) {
  .reversi-app .game-sheets-detail-icon { padding: 10px 0 6px; }
  .reversi-app .game-sheets-large-symbol { width: 52px; height: 52px; }
  .reversi-app .skill-description { margin: 10px 0 12px; line-height: 1.8; }
}
.reversi-app .rules-steps .list-item { text-wrap: pretty; }
.reversi-app .replay-log-link { display: none; width: 100%; margin-top: 4px; }
@media (max-height: 680px) {
  .reversi-app .replay-log-head, .reversi-app .replay-log { display: none; }
  .reversi-app .replay-log-link { display: flex; }
}
.game-sheets-empty-log { padding: 30px 0; }
.game-sheets-share-copy { margin-top: 8px; }
.game-sheets-manual-copy { display: block; width: 100%; min-height: 160px; padding: 12px; margin: 16px 0; border: 1px solid var(--border); background: var(--surface); font: 12px/1.8 var(--body); white-space: pre-wrap; -webkit-user-select: text; user-select: text; }
.reversi-app .share-preview .result-board { width: 80px; margin: 0; padding: 3px; gap: 1px; }
.reversi-app .share-preview .result-board .stone { width: 82%; }
</style>
