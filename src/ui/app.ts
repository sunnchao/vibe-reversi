/**
 * Open Design 十页面状态机、Canvas 2D 渲染器与点击热区控制器
 *
 * 页面清单：
 * 1. home：主页（开始游戏、技能图鉴入口、我的进度；一句口号 + 一个翻盘动图做视觉钩子）
 * 2. mode_select：模式选择（人机挑战 20 关 / 双人同屏 / 好友联机）
 * 3. skill_select：选技能页（6 选 3，每个技能一句话说明+消耗；有关卡锁定时置灰显示解锁条件）
 * 4. match：对局页（棋盘、双方头像/子数、能量条、3 个技能按钮、回合提示、认输/重开）
 * 5. online_room：好友房（创建、等待、分享、刷新与入桌）
 * 6. join_room：输入六位好友房号
 * 7. result：结算页（胜负、终局棋谱、最大翻盘步、分享与回看）
 * 8. codex：技能图鉴页
 * 9. records：本机棋谱
 * 10. chapters：二十关章节路线
 */

import { executeAITurn } from '../ai';
import {
  ALL_SKILL_IDS,
  ENERGY_CONFIG,
  MAX_EQUIPPED_SKILLS,
  SkillId,
  SKILLS_CONFIG,
} from '../config/skills';
import { getStageConfig, STAGES_CONFIG } from '../config/stages';
import {
  applyBoardAction,
  canUseSkill,
  countPieces,
  createGame,
  GameMode,
  GameEvent,
  GameState,
  getBiggestComebackMove,
  getSkillTargets,
  getValidMoves,
  passTurn,
  Piece,
  PlayerColor,
  respondToWaitSkill,
  selectSkill,
  surrenderGame,
  useUndoSkill,
  useWaitSkill,
} from '../core';
import {
  appendMatchRecord,
  loadLocalProgress,
  OnlineRoomClient,
  recordStageWin,
  RoomDocument,
  saveLocalProgress,
  UserProgress,
  ConnectionStatus,
} from '../net';
import { AnimationManager } from './animations';
import { renderBoardEffects, renderCelebration } from './effects';
import { GamePreferences, loadPreferences, savePreferences } from '../platform/preferences';
import { SoundManager, SoundCue } from '../platform/audio';
import { SharePayload, sharePayload } from '../platform/sharing';
import { readActiveRoom, storeActiveRoom } from '../platform/session';
import { WECHAT_CLOUD_ENV } from '../config/runtime';
import {
  boardCoordToPixelCenter,
  computeBoardRect,
  pixelToBoardCoord,
} from './coord';

export type PageId =
  | 'home'
  | 'mode_select'
  | 'skill_select'
  | 'match'
  | 'online_room'
  | 'join_room'
  | 'result'
  | 'codex'
  | 'records'
  | 'chapters';

export interface HitBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  onClick: () => void;
}

const COLORS = {
  paper: '#e9e3d4',
  paperLight: '#f5f0e4',
  ink: '#1d2b25',
  muted: '#69756b',
  line: '#c8c0ae',
  felt: '#244d3e',
  feltLight: '#2d5a48',
  brass: '#bb9250',
  vermilion: '#b94d35',
  white: '#fffaf0',
};

const SKILL_SUMMARIES: Record<SkillId, string> = {
  bomb: '额外翻转十字相邻敌子',
  shield: '保护一子，本局不可翻转',
  steal: '将一颗普通敌子变为己子',
  double: '同一回合连续落下两子',
  wait: '跳过回合，额外获得 20 能量',
  undo: '回到自己的上个回合',
};

function getBrowserPlayerId(): string {
  const g = globalThis as unknown as {
    window?: { sessionStorage?: { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void } };
  };
  try {
    const storage = g.window?.sessionStorage;
    if (storage) {
      const key = 'vibe-reversi-player';
      const existing = storage.getItem(key);
      if (existing) return existing;
      const id = `preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      storage.setItem(key, id);
      return id;
    }
  } catch {
    // Use a stable fallback in runtimes where session storage is unavailable.
  }
  return 'wx_player_host';
}

export class GameApp {
  public currentPage: PageId = 'home';
  public targetMode: GameMode = 'online';
  public ruleVariant: 'skills' | 'classic' = 'skills';
  public selectedStageId = 1;
  public progress: UserProgress;
  public gameState: GameState;
  public anim: AnimationManager;
  public hitBoxes: HitBox[] = [];
  public heroImage: CanvasImageSource | null = null;
  public pointerPosition: { x: number; y: number } | null = null;
  public activeDialog: 'restart' | 'surrender' | 'exit' | null = null;
  public skillDetail: SkillId | 'rules' | null = null;
  public moveLogOpen = false;
  public settingsOpen = false;
  public nativeMenuRect: { left: number; bottom: number } | null = null;
  public preferences: GamePreferences = loadPreferences();
  public sound = new SoundManager(() => this.preferences);

  // 好友房联机状态
  public onlineClient: OnlineRoomClient;
  public currentRoom: RoomDocument | null = null;
  public onlinePlayerColor: PlayerColor = Piece.Black;
  public inputRoomCode = '';
  public shareCardNotice = '';
  public roomRequestPending = false;
  public onlineActionPending = false;
  public connectionStatus: ConnectionStatus = 'connected';
  public opponentDisconnected = false;
  public onlineUnavailableReason = '';
  public shareImageProvider: ((kind: 'invite' | 'result') => string | undefined) | null = null;
  public visible = true;
  private lastShareImages: Partial<Record<'invite' | 'result', string>> = {};
  private recordedFinishedKey: string | null = null;
  private aiMoveAt = 0;
  private presentedRoomRevision = -1;
  private optimisticSignature = '';

  constructor() {
    this.progress = loadLocalProgress();
    this.selectedStageId = Math.min(STAGES_CONFIG.length, Math.max(1, this.progress.maxClearedStage + 1));
    this.anim = new AnimationManager();
    this.onlineClient = new OnlineRoomClient(getBrowserPlayerId(), '我方棋手');
    this.gameState = createGame({
      mode: 'local2p',
      blackSkills: this.progress.equippedSkills,
    });
  }

  /**
   * 跳转到指定页面
   */
  navigateTo(page: PageId): void {
    if (page !== 'online_room' && page !== 'match') this.onlineClient.stopWatch();
    if ((page === 'home' || page === 'mode_select') && this.currentRoom?.status === 'finished') {
      this.currentRoom = null;
      this.inputRoomCode = '';
    }
    if (page === 'online_room' && this.currentRoom) this.watchRoom(this.currentRoom.roomId);
    this.currentPage = page;
    this.shareCardNotice = '';
    this.activeDialog = null;
    this.skillDetail = null;
    this.moveLogOpen = false;
    this.settingsOpen = false;
    this.pointerPosition = null;
    this.anim.toastMessage = null;
  }

  setHeroImage(image: CanvasImageSource | null): void {
    this.heroImage = image;
  }

  setNativeMenuRect(rect: { left: number; bottom: number } | null): void {
    this.nativeMenuRect = rect;
  }

  onBackground(): void {
    this.visible = false;
    this.sound.suspend();
    this.onlineClient.stopWatch();
  }

  async onForeground(query?: Record<string, unknown>): Promise<void> {
    this.visible = true;
    this.sound.resume();
    const roomId = typeof query?.roomId === 'string' && /^\d{6}$/.test(query.roomId) ? query.roomId : null;
    if (roomId && roomId !== this.currentRoom?.roomId) {
      if (this.currentRoom?.status === 'playing') {
        this.anim.showToast('请先结束当前好友对局，再接受新邀请');
        this.watchRoom(this.currentRoom.roomId);
        return;
      }
      if (this.currentRoom?.status === 'waiting') await this.onlineClient.leaveRoom(this.currentRoom.roomId);
      this.currentRoom = null;
      this.inputRoomCode = roomId;
      this.navigateTo('online_room');
      await this.joinEnteredRoom();
      return;
    }
    if (this.currentRoom && (this.currentRoom.status === 'playing' || this.currentRoom.status === 'waiting')) {
      this.watchRoom(this.currentRoom.roomId);
    } else {
      const stored = readActiveRoom();
      if (stored) {
        this.inputRoomCode = stored;
        this.navigateTo('online_room');
        await this.joinEnteredRoom();
      }
    }
  }

  dispose(): void {
    this.onlineClient.stopWatch();
    this.sound.destroy();
  }

  getSharePayload(): SharePayload {
    const activeRoom = this.currentRoom && (this.currentRoom.status === 'waiting' || this.currentRoom.status === 'playing');
    const shareKind = activeRoom ? 'invite' : 'result';
    const counts = countPieces(this.gameState.board);
    return {
      title: activeRoom
        ? `来下一盘翻盘棋，房间号 ${this.currentRoom!.roomId}`
        : `《技能黑白棋·翻盘棋》比分 ${counts.black}:${counts.white}，来下一局。`,
      query: activeRoom ? `roomId=${this.currentRoom!.roomId}` : 'from=share',
      imageUrl: (() => {
        const generated = this.shareImageProvider?.(shareKind);
        if (generated) this.lastShareImages[shareKind] = generated;
        return this.lastShareImages[shareKind] ?? '/assets/reversi-table.jpg';
      })(),
    };
  }

  private async sendShare(payload: SharePayload): Promise<void> {
    try {
      const result = await sharePayload(payload);
      if (result === 'native') this.anim.showToast('已打开系统分享');
      else if (result === 'copied') this.anim.showToast('邀请链接已复制，可发给朋友');
      else if (result === 'menu') this.anim.showToast('点右下角「分享」，或使用微信右上角菜单');
      else if (result === 'unavailable') this.anim.showToast('当前无法分享，请通过预览服务或微信打开');
    } catch {
      this.anim.showToast('分享暂不可用，请稍后重试');
    }
  }

  private rememberRoom(room: RoomDocument): void {
    storeActiveRoom(room.status === 'waiting' || room.status === 'playing' ? room.roomId : null);
  }

  handlePointerMove(px: number, py: number): void {
    this.pointerPosition = { x: px, y: py };
  }

  handleKeyInput(key: string): boolean {
    if (key === 'Escape') {
      if (this.settingsOpen) {
        this.settingsOpen = false;
      } else if (this.moveLogOpen) {
        this.moveLogOpen = false;
      } else if (this.skillDetail) {
        this.skillDetail = null;
      } else if (this.activeDialog) {
        this.activeDialog = null;
      } else if (this.currentPage === 'match') {
        this.activeDialog = 'exit';
      } else if (this.currentPage === 'home') {
        return false;
      } else {
        this.navigateTo(
          this.currentPage === 'codex' ||
          this.currentPage === 'records' ||
          this.currentPage === 'chapters' ||
          this.currentPage === 'mode_select'
            ? 'home'
            : 'mode_select'
        );
      }
      return true;
    }

    if (
      (this.currentPage !== 'online_room' && this.currentPage !== 'join_room') ||
      this.currentRoom
    ) return false;
    if (/^\d$/.test(key)) {
      if (this.inputRoomCode.length < 6) this.inputRoomCode += key;
      return true;
    }
    if (key === 'Backspace') {
      this.inputRoomCode = this.inputRoomCode.slice(0, -1);
      return true;
    }
    if (key === 'Enter' && this.inputRoomCode.length === 6) {
      void this.joinEnteredRoom();
      return true;
    }
    return false;
  }

  private consumeEvents(events: GameEvent[], nowMs = Date.now()): void {
    this.anim.consumeEvents(events, nowMs);
    let cue: SoundCue | null = null;
    if (events.some((event) => event.type === 'BOMB_EXPLODED')) cue = 'bomb';
    else if (events.some((event) => event.type === 'PIECE_STOLEN')) cue = 'steal';
    else if (events.some((event) => event.type === 'SHIELD_APPLIED')) cue = 'shield';
    else if (events.some((event) => event.type === 'UNDO_PERFORMED')) cue = 'undo';
    else if (events.some((event) => event.type === 'DOUBLE_STEP_1_DONE')) cue = 'double';
    else if (events.some((event) => event.type === 'WAIT_RESOLVED' && event.approved)) cue = 'wait';
    else if (events.some((event) => event.type === 'MOVE_PLACED')) cue = 'place';
    if (cue) {
      this.sound.play(cue);
      if (cue === 'place' && events.some((event) => event.type === 'MOVE_PLACED' && event.flipped.length)) {
        this.sound.play('flip', 90);
      }
      if (this.preferences.vibration) {
        const g = globalThis as unknown as { wx?: { vibrateShort?: (options: { type: string }) => void }; navigator?: Navigator };
        if (g.wx?.vibrateShort) g.wx.vibrateShort({ type: 'light' });
        else g.navigator?.vibrate?.(12);
      }
    }
    const end = events.find((event) => event.type === 'GAME_OVER');
    if (end?.type === 'GAME_OVER') {
      const myColor = this.gameState.mode === 'online' ? this.onlinePlayerColor : Piece.Black;
      this.sound.play(end.winner === myColor || this.gameState.mode === 'local2p' ? 'win' : 'lose', 350);
    }
  }

  private async createRoom(): Promise<void> {
    if (this.roomRequestPending) return;
    if (!this.canUseOnlineRooms()) return;
    if (this.currentRoom && (this.currentRoom.status === 'waiting' || this.currentRoom.status === 'playing')) {
      this.navigateTo('online_room');
      this.anim.showToast('先结束或收起当前棋桌，再开新一桌');
      return;
    }
    this.roomRequestPending = true;
    try {
      const res = await this.onlineClient.createRoom(
        this.progress.equippedSkills,
        this.ruleVariant
      );
      if (res.ok && res.data) {
        this.currentRoom = res.data;
        this.onlinePlayerColor = res.playerColor ?? Piece.Black;
        this.inputRoomCode = res.data.roomId;
        this.presentedRoomRevision = res.data.revision;
        this.rememberRoom(res.data);
        this.watchRoom(res.data.roomId);
        this.anim.showToast('房间已创建');
      } else {
        this.anim.showToast(res.error ?? '创建房间失败');
      }
    } catch {
      this.anim.showToast('网络暂不可用，请稍后重试');
    } finally {
      this.roomRequestPending = false;
    }
  }

  private async joinEnteredRoom(): Promise<void> {
    if (this.roomRequestPending) return;
    if (!this.canUseOnlineRooms()) return;
    if (!/^\d{6}$/.test(this.inputRoomCode)) {
      this.anim.showToast('请输入完整的 6 位房间号');
      return;
    }

    this.roomRequestPending = true;
    try {
      const res = await this.onlineClient.joinRoom(
        this.inputRoomCode,
        this.progress.equippedSkills
      );
      if (res.ok && res.data) {
        this.currentRoom = res.data;
        this.onlinePlayerColor = res.playerColor ?? Piece.White;
        this.rememberRoom(res.data);
        this.watchRoom(res.data.roomId);
        this.startMatch('online');
      } else {
        this.anim.showToast(res.error ?? '加入房间失败');
        if (/不存在|失效|已结束|非本房间/.test(res.error ?? '')) storeActiveRoom(null);
      }
    } catch {
      this.anim.showToast('网络暂不可用，请检查连接后重试');
    } finally {
      this.roomRequestPending = false;
    }
  }

  private async refreshRoom(): Promise<void> {
    if (!this.currentRoom || this.roomRequestPending) return;
    this.roomRequestPending = true;
    try {
      const res = await this.onlineClient.joinRoom(
        this.currentRoom.roomId,
        this.progress.equippedSkills
      );
      if (!res.ok || !res.data) {
        this.anim.showToast(res.error ?? '暂时无法刷新房间');
        return;
      }
      this.currentRoom = res.data;
      this.onlinePlayerColor = res.playerColor ?? this.onlinePlayerColor;
      if (res.data.status === 'playing' && res.data.gameState) {
        if (this.currentPage === 'online_room') this.startMatch('online');
        else this.receiveOnlineRoom({ ok: true, data: res.data });
      } else {
        this.anim.showToast('房间状态已更新');
      }
    } catch {
      this.anim.showToast('网络暂不可用，请稍后重试');
    } finally {
      this.roomRequestPending = false;
    }
  }

  private canUseOnlineRooms(): boolean {
    const g = globalThis as unknown as { wx?: { cloud?: { callFunction?: unknown } } };
    if (g.wx && !WECHAT_CLOUD_ENV) {
      this.onlineUnavailableReason = '好友房需要微信云环境。配置后即可创建、加入与分享房间。';
      this.anim.showToast('当前为人机/同屏体验版；配置云环境后开放好友房');
      return false;
    }
    this.onlineUnavailableReason = '';
    return true;
  }

  private watchRoom(roomId: string): void {
    this.onlineClient.watchRoom(roomId, (room) => {
      this.receiveOnlineRoom({ ok: true, data: room });
    }, (status, disconnected) => {
      this.connectionStatus = status;
      if (disconnected !== undefined && disconnected !== this.opponentDisconnected) {
        this.opponentDisconnected = disconnected;
        if (disconnected) this.anim.showToast('对手已离线。你可以等待，或在 90 秒后申请判胜');
        else this.anim.showToast('对手已重新连接');
      }
    });
  }

  private async cancelWaitingRoom(): Promise<void> {
    if (!this.currentRoom || this.roomRequestPending) return;
    this.roomRequestPending = true;
    const roomId = this.currentRoom.roomId;
    this.onlineClient.stopWatch();
    try {
      const response = await this.onlineClient.leaveRoom(roomId);
      if (!response.ok) { this.anim.showToast(response.error ?? '取消失败'); return; }
      this.currentRoom = null;
      this.inputRoomCode = '';
      this.presentedRoomRevision = -1;
      storeActiveRoom(null);
    } catch {
      this.anim.showToast('网络暂不可用，请重试');
    } finally { this.roomRequestPending = false; }
  }

  private async submitOnlineAction(action: {
    actionType: 'move' | 'skill' | 'pass' | 'surrender';
    skillId?: SkillId;
    row?: number;
    col?: number;
  }): Promise<void> {
    const roomId = this.currentRoom?.roomId;
    if (!roomId || this.onlineActionPending) return;
    this.onlineActionPending = true;
    try {
      const response = await this.onlineClient.submitMove({ roomId, ...action });
      if (this.currentRoom?.roomId !== roomId) return;
      if (response.ok && response.data) {
        this.receiveOnlineRoom(response);
        return;
      }
      this.anim.showToast(response.error ?? '操作未能同步');
      const latest = await this.onlineClient.syncState(roomId);
      if (latest.ok && latest.data?.room.gameState) {
        this.currentRoom = latest.data.room;
        this.gameState = latest.data.room.gameState;
      }
    } catch {
      this.anim.showToast('网络连接中断，请稍后重试');
      if (this.currentRoom?.gameState) this.gameState = this.currentRoom.gameState;
    } finally {
      this.onlineActionPending = false;
    }
  }

  private async respondOnlineWait(approved: boolean): Promise<void> {
    const roomId = this.currentRoom?.roomId;
    if (!roomId || this.onlineActionPending) return;
    this.onlineActionPending = true;
    try {
      this.receiveOnlineRoom(await this.onlineClient.respondWaitSkill(roomId, approved));
    } catch {
      this.anim.showToast('网络连接中断，请重试');
    } finally {
      this.onlineActionPending = false;
    }
  }

  private async claimDisconnectWin(): Promise<void> {
    const roomId = this.currentRoom?.roomId;
    if (!roomId || this.onlineActionPending) return;
    this.onlineActionPending = true;
    try {
      const response = await this.onlineClient.syncState(roomId, true);
      if (!response.ok || !response.data) {
        this.anim.showToast(response.error ?? '暂时无法判定断线');
        return;
      }
      this.opponentDisconnected = response.data.opponentDisconnected;
      this.receiveOnlineRoom({ ok: true, data: response.data.room });
      if (!response.data.opponentDisconnected) this.anim.showToast('对方还在线，再等一会儿');
    } catch {
      this.anim.showToast('网络连接中断，暂时无法确认');
    } finally {
      this.onlineActionPending = false;
    }
  }

  private shareRoom(): void {
    if (this.currentRoom) void this.sendShare(this.getSharePayload());
  }

  private confirmDialogAction(): void {
    const action = this.activeDialog;
    this.activeDialog = null;
    if (this.gameState.mode === 'online' && (action === 'surrender' || action === 'exit')) {
      void this.submitOnlineAction({ actionType: 'surrender' });
      return;
    }
    if (action === 'restart') {
      this.startMatch(this.gameState.mode, this.selectedStageId);
    } else if (action === 'surrender') {
      const surrenderer = this.gameState.mode === 'online'
        ? this.onlinePlayerColor
        : this.gameState.currentPlayer;
      this.gameState = surrenderGame(this.gameState, surrenderer);
      this.consumeEvents(this.gameState.lastEvents);
      this.onGameFinished();
      this.navigateTo('result');
    } else if (action === 'exit') {
      this.navigateTo('mode_select');
    }
  }

  /**
   * 在选技能页切换勾选技能（6 选 N，N 取决于当前已解锁槽位数，同屏/联机模式开放 3 槽）
   */
  toggleSkillEquip(skillId: SkillId): boolean {
    const cfg = SKILLS_CONFIG[skillId];
    const isUnlocked =
      this.progress.unlockedSkills.includes(skillId) ||
      this.progress.maxClearedStage >= cfg.unlockStage;
    if (!isUnlocked) {
      this.anim.showToast(`通关第 ${cfg.unlockStage} 关解锁「${cfg.name}」`);
      return false;
    }

    const maxSlots =
      this.targetMode === 'ai'
        ? getStageConfig(this.selectedStageId).playerSkillSlots
        : MAX_EQUIPPED_SKILLS;

    const current = this.progress.equippedSkills.slice(0, maxSlots);
    const idx = current.indexOf(skillId);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      if (current.length >= maxSlots) {
        if (maxSlots === 1) {
          current.length = 0;
        } else {
          this.anim.showToast('招式已选满，请先取消一招');
          return false;
        }
      }
      current.push(skillId);
    }
    this.progress.equippedSkills = current;
    saveLocalProgress(this.progress);
    return true;
  }

  /**
   * 启动对局（人机挑战 / 双人同屏 / 好友联机）
   */
  startMatch(mode: GameMode, stageId = this.selectedStageId): void {
    if (mode === 'ai' && stageId > this.maxOpenStage()) {
      this.anim.showToast(`请先通关第 ${this.maxOpenStage()} 关`);
      return;
    }
    if (mode === 'online' && !this.currentRoom?.gameState) {
      this.navigateTo('online_room');
      this.anim.showToast('好友加入后才能开局');
      return;
    }
    this.targetMode = mode;
    this.selectedStageId = stageId;
    this.recordedFinishedKey = null;
    this.aiMoveAt = 0;
    this.sound.stop();
    this.anim = new AnimationManager();

    if (mode === 'ai') {
      const stage = getStageConfig(stageId);
      const equipped = this.ruleVariant === 'classic'
        ? []
        : this.progress.equippedSkills.slice(0, stage.playerSkillSlots);
      this.gameState = createGame({
        mode: 'ai',
        stageId,
        blackSkills: equipped,
        whiteSkills: this.ruleVariant === 'classic' ? [] : stage.aiSkills,
        blackInitialEnergy: stage.playerInitialEnergy,
        whiteInitialEnergy: stage.aiInitialEnergy,
      });
    } else if (mode === 'local2p') {
      const equipped = this.ruleVariant === 'classic'
        ? []
        : this.progress.equippedSkills.slice(0, 3);
      this.gameState = createGame({
        mode: 'local2p',
        blackSkills: equipped,
        whiteSkills: equipped,
        blackInitialEnergy: 10,
        whiteInitialEnergy: 10,
      });
    } else {
      this.ruleVariant = this.currentRoom!.variant === 'classic' ? 'classic' : 'skills';
      this.gameState = this.currentRoom!.gameState!;
      this.presentedRoomRevision = this.currentRoom!.revision;
      this.optimisticSignature = '';
    }

    if (mode !== 'online') this.consumeEvents(this.gameState.lastEvents);
    this.navigateTo('match');
  }

  /**
   * 处理对局页点击技能按钮
   */
  handleSkillButtonClick(skillId: SkillId): void {
    if (this.gameState.isGameOver || this.onlineActionPending) return;
    if (this.preferences.effects && this.anim.busyUntil() > Date.now()) {
      this.anim.showToast('特效完成后再选招式');
      return;
    }
    const player = this.gameState.currentPlayer;
    if (this.gameState.mode === 'ai' && player === Piece.White) return;
    if (this.gameState.mode === 'online' && player !== this.onlinePlayerColor) return;
    if (this.gameState.mode === 'online' && this.connectionStatus !== 'connected') return;

    // 若已选中同一技能，再次点击取消选择（连落双子第2步除外）
    if (
      this.gameState.selectedSkill?.skillId === skillId &&
      this.gameState.selectedSkill.doubleStep !== 2
    ) {
      this.gameState = selectSkill(this.gameState, null).state;
      return;
    }

    // 无需点击棋盘格的立即触发型技能：求你等我 (wait) / 悔棋时光 (undo)
    if (skillId === 'wait') {
      if (this.gameState.mode === 'online') {
        void this.submitOnlineAction({ actionType: 'skill', skillId: 'wait' });
        return;
      }
      const res = useWaitSkill(this.gameState);
      if (!res.ok) {
        this.anim.showToast(res.reason ?? '无法使用该技能');
        return;
      }
      this.gameState = res.state;
      this.consumeEvents(this.gameState.lastEvents);
      this.checkPostTurnFlow();
      return;
    }

    if (skillId === 'undo') {
      const res = useUndoSkill(this.gameState);
      if (!res.ok) {
        this.anim.showToast(res.reason ?? '无法使用悔棋时光');
        return;
      }
      this.gameState = res.state;
      this.consumeEvents(this.gameState.lastEvents);
      return;
    }

    // 目标型技能（bomb / shield / steal / double）：进入选中高亮状态
    const sel = selectSkill(this.gameState, skillId);
    if (!sel.ok) {
      this.anim.showToast(sel.reason ?? '当前不可选该技能');
      return;
    }
    this.gameState = sel.state;
    const cfg = SKILLS_CONFIG[skillId];
    if (skillId === 'shield') {
      this.anim.showToast(`已选【${cfg.name}】：请点击棋盘上一颗己方棋子`);
    } else if (skillId === 'steal') {
      this.anim.showToast(`已选【${cfg.name}】：请点击棋盘上一颗对方非金身棋子`);
    } else {
      this.anim.showToast(`已选【${cfg.name}】：请点击高亮合法格落子`);
    }
  }

  /**
   * 处理棋盘格子点击 (row, col)
   */
  handleBoardCellClick(row: number, col: number): void {
    if (this.gameState.isGameOver || this.onlineActionPending) return;
    if (this.preferences.effects && this.anim.busyUntil() > Date.now()) {
      this.anim.showToast('棋子还在翻转，请稍候');
      return;
    }
    if (
      this.gameState.mode === 'ai' &&
      this.gameState.currentPlayer === Piece.White
    ) {
      return; // AI 回合禁止玩家点棋盘
    }
    if (this.gameState.mode === 'online' && this.gameState.currentPlayer !== this.onlinePlayerColor) {
      this.anim.showToast('等待对方落子');
      return;
    }
    if (this.gameState.mode === 'online' && this.connectionStatus !== 'connected') {
      this.anim.showToast('正在恢复连接，请稍候');
      return;
    }

    const skillId = this.gameState.selectedSkill?.skillId;
    const res = applyBoardAction(this.gameState, row, col);
    this.gameState = res.state;
    if (!res.ok) {
      if (res.reason) {
        this.anim.showToast(res.reason);
      }
      return;
    }

    this.consumeEvents(this.gameState.lastEvents);
    if (this.gameState.mode === 'online') {
      this.optimisticSignature = this.stateSignature(this.gameState);
      void this.submitOnlineAction({
        actionType: skillId ? 'skill' : 'move',
        skillId,
        row,
        col,
      });
      return;
    }
    this.checkPostTurnFlow();
  }

  private receiveOnlineRoom(response: { ok: boolean; error?: string; data?: RoomDocument }): void {
    if (!response.ok || !response.data) {
      this.anim.showToast(response.error ?? '房间状态同步失败');
      return;
    }
    const room = response.data;
    if (this.currentRoom?.roomId !== room.roomId) this.presentedRoomRevision = -1;
    if (room.revision < this.presentedRoomRevision) return;
    this.currentRoom = room;
    this.rememberRoom(room);
    if (room.status === 'expired') {
      this.currentRoom = null;
      this.onlineClient.stopWatch();
      this.anim.showToast('房间已关闭，请重新创建');
      return;
    }
    if (room.gameState) {
      if (this.currentPage === 'online_room' && room.status === 'playing') {
        this.startMatch('online');
        return;
      }
      if (room.revision === this.presentedRoomRevision) return;
      const nextSignature = this.stateSignature(room.gameState);
      if (this.gameState.mode === 'online' && nextSignature === this.stateSignature(this.gameState)) {
        this.presentedRoomRevision = room.revision;
        return;
      }
      const shouldAnimate = this.gameState.mode === 'online' &&
        nextSignature !== this.optimisticSignature;
      this.gameState = room.gameState;
      this.presentedRoomRevision = room.revision;
      this.optimisticSignature = '';
      if (shouldAnimate) this.consumeEvents(this.gameState.lastEvents);
      if (this.gameState.isGameOver) {
        this.onGameFinished();
        this.navigateTo('result');
      }
    }
  }

  private stateSignature(state: GameState): string {
    return JSON.stringify([state.stepIndex, state.board, state.shielded, state.selectedSkill, state.pendingWaitRequest, state.winner]);
  }

  /**
   * 检查回合后流转：AI 自动应答、终局自动结算与跳转
   */
  checkPostTurnFlow(): void {
    if (this.gameState.isGameOver) {
      this.onGameFinished();
      return;
    }

    // Leave time for the player's flip animation before the computer responds.
    if (
      this.gameState.mode === 'ai' &&
      this.gameState.currentPlayer === Piece.White &&
      !this.gameState.isGameOver
    ) {
      if (!this.aiMoveAt) this.aiMoveAt = Math.max(Date.now() + 500, this.anim.busyUntil() + 100);
    }
  }

  private onGameFinished(): void {
    const endEvent = this.gameState.lastEvents.find((event) => event.type === 'GAME_OVER');
    const finishedKey = `${this.gameState.mode}:${this.gameState.stepIndex}:${this.gameState.winner}:${endEvent?.type === 'GAME_OVER' ? endEvent.reason : 'finished'}`;
    if (this.recordedFinishedKey === finishedKey) return;
    this.recordedFinishedKey = finishedKey;
    const biggest = getBiggestComebackMove(this.gameState);
    const maxFlip = biggest ? biggest.flippedCount : 0;

    if (
      this.gameState.mode === 'ai' &&
      this.gameState.winner === Piece.Black &&
      this.selectedStageId
    ) {
      this.progress = recordStageWin(
        this.progress,
        this.selectedStageId,
        maxFlip
      );
    } else {
      const playerColor = this.gameState.mode === 'online' ? this.onlinePlayerColor : Piece.Black;
      this.progress.totalGames += 1;
      if (this.gameState.winner === playerColor) {
        this.progress.totalWins += 1;
      }
      if (maxFlip > this.progress.biggestFlipRecord) {
        this.progress.biggestFlipRecord = maxFlip;
      }
      saveLocalProgress(this.progress);
    }
    this.progress = appendMatchRecord(this.progress, {
      id: `${this.gameState.mode}-${Date.now()}-${this.gameState.stepIndex}`,
      finishedAt: Date.now(),
      mode: this.gameState.mode,
      black: countPieces(this.gameState.board).black,
      white: countPieces(this.gameState.board).white,
      winner: this.gameState.winner ?? 'DRAW',
      reason: endEvent?.type === 'GAME_OVER' ? endEvent.reason : 'FINISHED',
      steps: this.gameState.stepIndex,
      maxFlip,
    });
  }

  /**
   * 生成战绩分享文案与卡片信息（阶段 6：结算与分享）
   */
  generateSharePayload(): {
    title: string;
    highlightStepText: string;
    query: string;
  } {
    const counts = countPieces(this.gameState.board);
    const biggest = getBiggestComebackMove(this.gameState);
    const flipNum = biggest ? biggest.flippedCount : 0;
    const roomQuery = this.getSharePayload().query;

    const title = `《技能黑白棋·翻盘棋》比分 ${counts.black}:${counts.white}，本局一手最多翻 ${flipNum} 子。`;

    const highlightStepText = biggest
      ? `第 ${biggest.stepIndex} 步 · ${biggest.description}`
      : `本局共 ${this.gameState.stepIndex} 手，未使用翻子技能`;

    this.shareCardNotice = `本局战绩：比分 ${counts.black}:${counts.white} · ${highlightStepText}`;
    void this.sendShare({ ...this.getSharePayload(), title, query: roomQuery });

    return {
      title,
      highlightStepText,
      query: roomQuery,
    };
  }

  /**
   * 处理屏幕像素点击 (px, py, width, height)
   */
  handlePointerTap(
    px: number,
    py: number,
    screenWidth: number,
    screenHeight: number,
    isTouch = false
  ): boolean {
    this.sound.unlock();
    if (isTouch) this.pointerPosition = null;
    if (this.moveLogOpen) {
      const box = this.hitBoxes.find((item) => item.id === 'move_log_close');
      if (box && px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h) {
        this.moveLogOpen = false;
      }
      return true;
    }
    if (this.settingsOpen) {
      const box = this.hitBoxes.find((item) => item.id.startsWith('settings_') &&
        px >= item.x && px <= item.x + item.w && py >= item.y && py <= item.y + item.h);
      if (box) { this.sound.play('tap'); box.onClick(); }
      return true;
    }
    if (this.skillDetail) {
      const closeBox = this.hitBoxes.find((box) => box.id === 'detail_close');
      if (closeBox && px >= closeBox.x && px <= closeBox.x + closeBox.w && py >= closeBox.y && py <= closeBox.y + closeBox.h) {
        this.skillDetail = null;
      }
      return true;
    }
    if (this.activeDialog) {
      const dialogBox = [...this.hitBoxes].reverse().find((box) =>
        box.id.startsWith('dialog_') &&
        px >= box.x && px <= box.x + box.w &&
        py >= box.y && py <= box.y + box.h
      );
      dialogBox?.onClick();
      return true;
    }

    // 1. 先检查当前页面注册的按钮 HitBoxes（从上层到下层逆序匹配）
    for (let i = this.hitBoxes.length - 1; i >= 0; i--) {
      const box = this.hitBoxes[i];
      if (
        px >= box.x &&
        px <= box.x + box.w &&
        py >= box.y &&
        py <= box.y + box.h
      ) {
        if (box.id.startsWith('match_skill_') && this.preferences.effects && this.anim.busyUntil() > Date.now()) return true;
        this.anim.pressedButton = { id: box.id, until: Date.now() + 160 };
        this.sound.play('tap');
        box.onClick();
        return true;
      }
    }

    // 2. 若在对局页，检查是否点击在 8x8 棋盘内
    if (this.currentPage === 'match') {
      const rect = computeBoardRect(screenWidth, screenHeight);
      const coord = pixelToBoardCoord(px, py, rect);
      if (coord) {
        if (this.preferences.effects && this.anim.busyUntil() > Date.now()) return true;
        this.handleBoardCellClick(coord.row, coord.col);
        return true;
      }
      // 点击棋盘外空白处：若已选中技能（非连落双子第2步），取消技能选择且不扣能量
      if (
        this.gameState.selectedSkill &&
        this.gameState.selectedSkill.doubleStep !== 2
      ) {
        this.gameState = selectSkill(this.gameState, null).state;
        this.anim.showToast('已取消技能选择（未扣能量）');
        return true;
      }
    }

    return false;
  }

  private maxOpenStage(): number {
    return Math.min(STAGES_CONFIG.length, Math.max(1, this.progress.maxClearedStage + 1));
  }

  private addHeader(ctx: CanvasRenderingContext2D, w: number, title: string, back: () => void, tag = ''): void {
    this.registerButton(ctx, 'btn_back', 8, 10, 44, 38, '‹', {
      bg: COLORS.paper,
      color: COLORS.ink,
      fontSize: 24,
      onClick: back,
    });
    this.registerButton(ctx, 'btn_header_settings', w - 50, 12, 40, 34, '···', {
      bg: COLORS.paper,
      border: COLORS.line,
      color: COLORS.ink,
      fontSize: 14,
      onClick: () => { this.settingsOpen = true; },
    });
    ctx.save();
    const titleWidth = w - 112;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (tag) {
      ctx.fillStyle = COLORS.vermilion;
      ctx.font = '8px "PingFang SC", sans-serif';
      ctx.fillText(tag, w / 2, 14, titleWidth);
    }
    ctx.fillStyle = COLORS.ink;
    ctx.font = '600 18px "Songti SC", "STSong", serif';
    ctx.fillText(title, w / 2, tag ? 35 : 32, titleWidth);
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(16, 59);
    ctx.lineTo(w - 16, 59);
    ctx.stroke();
    ctx.restore();
  }

  private drawSkillMark(ctx: CanvasRenderingContext2D, skillId: SkillId, x: number, y: number, color: string): void {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.8;
    if (skillId === 'bomb') {
      ctx.beginPath(); ctx.arc(x, y + 2, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 4, y - 6); ctx.lineTo(x + 8, y - 11); ctx.lineTo(x + 11, y - 8); ctx.stroke();
    } else if (skillId === 'shield') {
      ctx.beginPath(); ctx.moveTo(x, y - 11); ctx.lineTo(x + 9, y - 7); ctx.lineTo(x + 7, y + 4); ctx.lineTo(x, y + 11); ctx.lineTo(x - 7, y + 4); ctx.lineTo(x - 9, y - 7); ctx.closePath(); ctx.stroke();
    } else if (skillId === 'steal') {
      ctx.beginPath(); ctx.moveTo(x - 10, y - 5); ctx.lineTo(x + 7, y - 5); ctx.lineTo(x + 3, y - 9); ctx.moveTo(x + 7, y - 5); ctx.lineTo(x + 3, y - 1); ctx.moveTo(x + 10, y + 5); ctx.lineTo(x - 7, y + 5); ctx.lineTo(x - 3, y + 1); ctx.moveTo(x - 7, y + 5); ctx.lineTo(x - 3, y + 9); ctx.stroke();
    } else if (skillId === 'double') {
      ctx.beginPath(); ctx.arc(x - 4, y, 6, 0, Math.PI * 2); ctx.arc(x + 5, y, 6, 0, Math.PI * 2); ctx.stroke();
    } else if (skillId === 'wait') {
      ctx.beginPath(); ctx.moveTo(x - 7, y - 9); ctx.lineTo(x + 7, y - 9); ctx.lineTo(x - 4, y); ctx.lineTo(x + 7, y + 9); ctx.lineTo(x - 7, y + 9); ctx.lineTo(x + 4, y); ctx.closePath(); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(x, y, 8, Math.PI * 0.15, Math.PI * 1.75); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 9, y - 6); ctx.lineTo(x - 2, y - 8); ctx.lineTo(x - 6, y - 2); ctx.fill();
    }
    ctx.restore();
  }

  private drawBrandMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    ctx.save();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, size, size);
    ctx.beginPath();
    ctx.moveTo(x + size / 2, y);
    ctx.lineTo(x + size / 2, y + size);
    ctx.moveTo(x, y + size / 2);
    ctx.lineTo(x + size, y + size / 2);
    ctx.stroke();
    ctx.fillStyle = COLORS.ink;
    ctx.beginPath();
    ctx.arc(x + size * 0.25, y + size * 0.25, size * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.paperLight;
    ctx.strokeStyle = COLORS.ink;
    ctx.beginPath();
    ctx.arc(x + size * 0.75, y + size * 0.75, size * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private renderBottomNav(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    active: 'home' | 'records' | 'friends'
  ): void {
    const navH = 58;
    const y = h - navH;
    const items = [
      ['home', '棋桌', '▦'],
      ['records', '棋谱', '▤'],
      ['friends', '棋友', '♙'],
    ] as const;
    ctx.save();
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(0, y, w, navH);
    ctx.strokeStyle = COLORS.line;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    items.forEach(([id, label, glyph], index) => {
      const itemW = w / 3;
      const x = index * itemW;
      const isActive = id === active;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isActive ? COLORS.ink : COLORS.muted;
      ctx.font = '17px "Songti SC", serif';
      ctx.fillText(glyph, x + itemW / 2, y + 20);
      ctx.font = `${isActive ? '600 ' : ''}10px "PingFang SC", sans-serif`;
      ctx.fillText(label, x + itemW / 2, y + 39);
      if (isActive) {
        ctx.fillStyle = COLORS.vermilion;
        ctx.beginPath();
        ctx.arc(x + itemW / 2 + 22, y + 39, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      this.hitBoxes.push({
        id: `nav_${id}`,
        x,
        y,
        w: itemW,
        h: navH,
        onClick: () => this.navigateTo(
          id === 'friends' ? 'online_room' : id === 'records' ? 'records' : 'home'
        ),
      });
      if (index > 0) {
        ctx.strokeStyle = 'rgba(200, 192, 174, 0.55)';
        ctx.beginPath();
        ctx.moveTo(x, y + 14);
        ctx.lineTo(x, y + navH - 14);
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  private registerButton(
    ctx: CanvasRenderingContext2D,
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    options: {
      bg?: string;
      border?: string;
      color?: string;
      fontSize?: number;
      subLabel?: string;
      disabled?: boolean;
      icon?: SkillId;
      leadingText?: string;
      onClick: () => void;
    }
  ): void {
    const hovered = Boolean(
      this.pointerPosition &&
        this.pointerPosition.x >= x &&
        this.pointerPosition.x <= x + w &&
        this.pointerPosition.y >= y &&
        this.pointerPosition.y <= y + h
    );
    const bg = options.disabled
      ? '#ddd7ca'
      : hovered
      ? options.border ?? COLORS.brass
      : options.bg ?? COLORS.ink;
    const color = options.disabled
      ? '#6f776f'
      : options.color ?? COLORS.paperLight;
    const fontSize = options.fontSize ?? 15;
    const hasLeadingMark = Boolean(options.icon || options.leadingText);
    const labelX = hasLeadingMark ? x + 52 : x + w / 2;
    const textWidth = w - (hasLeadingMark ? 66 : 16);

    ctx.save();
    ctx.fillStyle = bg;
    const pressed = this.preferences.effects && this.anim.pressedButton?.id === id;
    this.roundRect(ctx, x, y + (pressed ? 3 : hovered ? 0 : 1), w, h, 5);
    ctx.fill();

    if (options.border) {
      ctx.strokeStyle = options.border;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.fillStyle = color;
    ctx.font = `600 ${fontSize}px "Songti SC", "STSong", serif`;
    ctx.textAlign = hasLeadingMark ? 'left' : 'center';
    ctx.textBaseline = 'middle';
    if (options.icon) this.drawSkillMark(ctx, options.icon, x + 24, y + h / 2, color);
    else if (options.leadingText) {
      ctx.strokeStyle = options.disabled ? '#aaa494' : options.border ?? COLORS.line;
      ctx.lineWidth = 1;
      this.roundRect(ctx, x + 10, y + h / 2 - 15, 30, 30, 2);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = '600 15px "Songti SC", "STSong", serif';
      ctx.textAlign = 'center';
      ctx.fillText(options.leadingText, x + 25, y + h / 2 + 1);
      ctx.textAlign = 'left';
    }

    if (options.subLabel) {
      ctx.fillText(label, labelX, y + h / 2 - 8, textWidth);
      ctx.font = `${Math.max(10, fontSize - 4)}px "PingFang SC", sans-serif`;
      ctx.fillStyle = options.disabled ? '#969184' : options.color ?? COLORS.paperLight;
      ctx.fillText(options.subLabel, labelX, y + h / 2 + 10, textWidth);
    } else {
      ctx.fillText(label, labelX, y + h / 2, textWidth);
    }
    ctx.restore();

    if (!options.disabled) {
      this.hitBoxes.push({ id, x, y, w, h, onClick: options.onClick });
    }
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  private drawIllustration(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.save();
    this.roundRect(ctx, x, y, w, h, 3);
    ctx.fillStyle = COLORS.felt;
    ctx.fill();
    ctx.clip();
    if (this.heroImage) {
      const image = this.heroImage as CanvasImageSource & { width: number; height: number };
      const scale = Math.max(w / image.width, h / image.height);
      const sourceW = w / scale;
      const sourceH = h / scale;
      ctx.drawImage(this.heroImage, (image.width - sourceW) / 2, (image.height - sourceH) / 2, sourceW, sourceH, x, y, w, h);
    } else {
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(x + 28 + i * (w - 56) / 4, y + h / 2, Math.min(16, h / 4), 0, Math.PI * 2);
        ctx.fillStyle = i % 2 ? COLORS.paperLight : COLORS.ink;
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /**
   * 渲染主入口：根据 currentPage 绘制对应页面
   */
  render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    nowMs = Date.now()
  ): void {
    if (this.currentPage === 'match' && !this.activeDialog && !this.skillDetail && !this.settingsOpen && !this.moveLogOpen && this.aiMoveAt && nowMs >= this.aiMoveAt) {
      this.aiMoveAt = 0;
      if (this.gameState.mode === 'ai' && this.gameState.currentPlayer === Piece.White && !this.gameState.isGameOver) {
        this.gameState = executeAITurn(this.gameState, getStageConfig(this.selectedStageId).aiLevel);
        this.consumeEvents(this.gameState.lastEvents, nowMs);
        this.checkPostTurnFlow();
      }
    }
    this.hitBoxes = [];
    this.anim.cleanup(nowMs);

    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = COLORS.vermilion;
    ctx.fillRect(0, 0, width, 4);
    ctx.fillStyle = 'rgba(29, 43, 37, 0.045)';
    for (let y = 14; y < height; y += 32) {
      ctx.fillRect(0, y, width, 1);
    }

    switch (this.currentPage) {
      case 'home':
        this.renderHomePage(ctx, width, height, nowMs);
        break;
      case 'mode_select':
        this.renderModeSelectPage(ctx, width, height);
        break;
      case 'skill_select':
        this.renderSkillSelectPage(ctx, width, height);
        break;
      case 'match':
        this.renderMatchPage(ctx, width, height, nowMs);
        break;
      case 'online_room':
        this.renderOnlineRoomPage(ctx, width, height);
        break;
      case 'join_room':
        this.renderJoinRoomPage(ctx, width, height);
        break;
      case 'result':
        this.renderResultPage(ctx, width, height, nowMs);
        break;
      case 'codex':
        this.renderCodexPage(ctx, width, height);
        break;
      case 'records':
        this.renderRecordsPage(ctx, width, height);
        break;
      case 'chapters':
        this.renderChaptersPage(ctx, width, height);
        break;
    }

    if (this.activeDialog) this.renderConfirmDialog(ctx, width, height);
    if (this.skillDetail) this.renderSkillDetail(ctx, width, height);
    if (this.settingsOpen) this.renderSettings(ctx, width, height);
    if (this.moveLogOpen) this.renderMoveLog(ctx, width, height);

    // 顶部浮动提示 Toast
    if (this.anim.toastMessage && !this.activeDialog && !this.skillDetail && !this.settingsOpen && !this.moveLogOpen) {
      ctx.save();
      const tw = Math.min(width - 32, 330);
      const tx = (width - tw) / 2;
      const ty = this.currentPage === 'match'
        ? 132
        : this.currentPage === 'online_room'
        ? this.currentRoom ? (height < 640 ? 236 : 220) : 182
        : this.currentPage === 'codex'
        ? height - 124
        : height - 76;
      ctx.fillStyle = COLORS.ink;
      this.roundRect(ctx, tx, ty, tw, 38, 4);
      ctx.fill();
      ctx.strokeStyle = COLORS.brass;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = COLORS.paperLight;
      ctx.font = '13px "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.anim.toastMessage.text, width / 2, ty + 18, tw - 18);
      ctx.restore();
    }
  }

  private renderSettings(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const roomActions = this.currentPage === 'match';
    const boxH = Math.min(roomActions ? 410 : 362, h - 24);
    const boxW = w;
    const x = 0;
    const y = h - boxH;
    ctx.save();
    ctx.fillStyle = 'rgba(18, 30, 25, 0.65)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = COLORS.paperLight;
    this.roundRect(ctx, x, y, boxW, boxH + 14, 16);
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = COLORS.line;
    this.roundRect(ctx, w / 2 - 14, y + 7, 28, 3, 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.ink;
    ctx.font = 'bold 22px "Songti SC", serif';
    ctx.fillText('声音与动效', w / 2, y + 35);
    const rows: Array<[keyof Pick<GamePreferences, 'sound' | 'effects' | 'vibration'>, string, string]> = [
      ['sound', '棋子与技能音效', '清脆落子声，听见每一次翻转'],
      ['effects', '动态特效', '落子回弹、技能粒子与胜局彩屑'],
      ['vibration', '轻触反馈', '落子和技能生效时轻震一下'],
    ];
    rows.forEach(([key, title, desc], i) => {
      const rowY = y + 65 + i * 59;
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.ink;
      ctx.font = '13px "PingFang SC", sans-serif';
      ctx.fillText(title, x + 18, rowY + 9);
      ctx.fillStyle = COLORS.muted;
      ctx.font = '10px "PingFang SC", sans-serif';
      ctx.fillText(desc, x + 18, rowY + 29, boxW - 98);
      this.registerButton(ctx, `settings_${key}`, x + boxW - 72, rowY - 8, 54, 35, this.preferences[key] ? '开启' : '关闭', {
        bg: this.preferences[key] ? COLORS.felt : '#d9d2c2',
        color: this.preferences[key] ? COLORS.white : COLORS.muted,
        fontSize: 12,
        onClick: () => {
          this.preferences[key] = !this.preferences[key];
          savePreferences(this.preferences);
          if (!this.preferences.sound) this.sound.stop();
          else this.sound.play('place');
          if (!this.preferences.effects) {
            this.anim.flipItems = [];
            this.anim.boardEffects = [];
          }
        },
      });
    });
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.ink;
    ctx.font = '12px "PingFang SC", sans-serif';
    ctx.fillText(`音效音量  ${Math.round(this.preferences.volume * 100)}%`, x + 18, y + 255);
    ctx.restore();
    for (const [id, delta, label] of [['down', -0.15, '−'], ['up', 0.15, '+']] as const) {
      this.registerButton(ctx, `settings_volume_${id}`, x + boxW - (id === 'down' ? 112 : 62), y + 235, 44, 36, label, {
        bg: '#ddd6c7', color: COLORS.ink, fontSize: 18,
        onClick: () => {
          this.preferences.volume = Math.max(0, Math.min(1, this.preferences.volume + delta));
          savePreferences(this.preferences);
          this.sound.play('place');
        },
      });
    }
    if (roomActions) {
      const actionW = (boxW - 48) / 2;
      this.registerButton(ctx, 'settings_restart', x + 18, y + 286, actionW, 36, '重新开局', {
        bg: '#ddd6c7', color: COLORS.ink, fontSize: 12,
        onClick: () => { this.settingsOpen = false; this.activeDialog = 'restart'; },
      });
      this.registerButton(ctx, 'settings_surrender', x + 30 + actionW, y + 286, actionW, 36, '认输', {
        bg: COLORS.vermilion, color: COLORS.white, fontSize: 12,
        onClick: () => { this.settingsOpen = false; this.activeDialog = 'surrender'; },
      });
    }
    this.registerButton(ctx, 'settings_close', x + 18, y + (roomActions ? 342 : 292), boxW - 36, 42, '收起设置', {
      bg: COLORS.ink, color: COLORS.paperLight,
      onClick: () => { this.settingsOpen = false; },
    });
  }

  private renderMoveLog(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const boxW = Math.min(w - 24, 360);
    const boxH = Math.min(h - 54, 510);
    const x = (w - boxW) / 2;
    const y = (h - boxH) / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(18, 30, 25, 0.68)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = COLORS.paperLight;
    this.roundRect(ctx, x, y, boxW, boxH, 5);
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.vermilion;
    ctx.font = '9px "PingFang SC", sans-serif';
    ctx.fillText('MOVE LOG / 本局棋谱', x + 18, y + 22);
    ctx.fillStyle = COLORS.ink;
    ctx.font = '600 22px "Songti SC", "STSong", serif';
    ctx.fillText('一步一步，看局面怎样翻转。', x + 18, y + 48, boxW - 36);
    ctx.strokeStyle = COLORS.line;
    ctx.beginPath();
    ctx.moveTo(x + 18, y + 63);
    ctx.lineTo(x + boxW - 18, y + 63);
    ctx.stroke();

    const history = this.gameState.moveHistory;
    if (history.length === 0) {
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.muted;
      ctx.font = '12px "PingFang SC", sans-serif';
      ctx.fillText('还没有落子，棋盘正等着第一手。', w / 2, y + boxH / 2);
    } else {
      const rowH = Math.max(34, Math.min(48, Math.floor((boxH - 110) / Math.min(9, history.length))));
      const visible = history.slice(-Math.min(9, history.length));
      visible.forEach((move, index) => {
        const rowY = y + 74 + index * rowH;
        if (index % 2 === 0) {
          ctx.fillStyle = 'rgba(36, 77, 62, 0.055)';
          ctx.fillRect(x + 12, rowY, boxW - 24, rowH);
        }
        ctx.textAlign = 'left';
        ctx.fillStyle = COLORS.muted;
        ctx.font = '9px "SFMono-Regular", monospace';
        ctx.fillText(String(move.stepIndex).padStart(2, '0'), x + 20, rowY + rowH / 2);
        ctx.fillStyle = move.player === Piece.Black ? COLORS.ink : COLORS.felt;
        ctx.font = '600 12px "PingFang SC", sans-serif';
        const colorLabel = move.player === Piece.Black ? '黑' : '白';
        const coord = move.position
          ? `${String.fromCharCode(65 + move.position.col)}${move.position.row + 1}`
          : '过手';
        ctx.fillText(`${colorLabel} ${coord}`, x + 48, rowY + rowH / 2);
        ctx.fillStyle = COLORS.ink;
        ctx.font = '10px "PingFang SC", sans-serif';
        ctx.fillText(move.description, x + 92, rowY + rowH / 2, boxW - 118);
      });
      if (history.length > visible.length) {
        ctx.textAlign = 'right';
        ctx.fillStyle = COLORS.muted;
        ctx.font = '9px "PingFang SC", sans-serif';
        ctx.fillText(`仅显示最近 ${visible.length} 手 · 共 ${history.length} 手`, x + boxW - 18, y + boxH - 62, boxW - 36);
      }
    }
    ctx.restore();
    this.registerButton(ctx, 'move_log_close', x + 18, y + boxH - 48, boxW - 36, 38, '收好棋谱', {
      bg: COLORS.ink,
      color: COLORS.paperLight,
      fontSize: 13,
      onClick: () => { this.moveLogOpen = false; },
    });
  }

  private renderConfirmDialog(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const titles = {
      restart: ['重新开局？', '当前棋局将被清空。'],
      surrender: ['确认认输？', '这局将立即结束并记录比分。'],
      exit: this.gameState.mode === 'online'
        ? ['离开这场对局？', '离开将按认输结算。']
        : ['离开棋局？', '本局不会保存，返回后需重新开局。'],
    } as const;
    const [title, detail] = titles[this.activeDialog!];
    const boxW = Math.min(w - 40, 310);
    const boxH = 174;
    const x = (w - boxW) / 2;
    const y = (h - boxH) / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(18, 30, 25, 0.56)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = COLORS.paperLight;
    this.roundRect(ctx, x, y, boxW, boxH, 6);
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.ink;
    ctx.font = 'bold 21px "Songti SC", "STSong", serif';
    ctx.fillText(title, w / 2, y + 43);
    ctx.fillStyle = COLORS.muted;
    ctx.font = `${boxW < 300 ? 12 : 13}px "PingFang SC", sans-serif`;
    ctx.fillText(detail, w / 2, y + 78, boxW - 30);
    ctx.restore();

    this.registerButton(ctx, 'dialog_cancel', x + 18, y + 112, boxW / 2 - 27, 42, '再想想', {
      bg: '#d9d2c2',
      color: COLORS.ink,
      onClick: () => { this.activeDialog = null; },
    });
    this.registerButton(ctx, 'dialog_confirm', x + boxW / 2 + 9, y + 112, boxW / 2 - 27, 42, '确认', {
      bg: COLORS.vermilion,
      color: COLORS.white,
      onClick: () => this.confirmDialogAction(),
    });
  }

  private renderSkillDetail(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const id = this.skillDetail!;
    const cfg = id === 'rules'
      ? {
          name: '先学会夹子翻转',
          cost: 0,
          maxUsesPerGame: null,
          allowInOnline: true,
          detailDesc: '黑方先手，双方轮流落子。把新棋子放在金色圆点处，沿横、竖或斜线，与己方已有棋子夹住一段连续敌子，这段棋子就会全部翻转。一次落子可以同时翻转多个方向。无处可下时跳过回合；棋盘填满或双方都无棋可下时，棋子更多的一方获胜。技能能改变局势，先点技能再选棋盘目标。',
        }
      : SKILLS_CONFIG[id];
    const boxW = Math.min(w - 32, 340);
    const boxH = Math.min(h - 36, 456);
    const x = (w - boxW) / 2;
    const y = (h - boxH) / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(18, 30, 25, 0.65)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = COLORS.paperLight;
    this.roundRect(ctx, x, y, boxW, boxH, 5);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.ink;
    ctx.font = 'bold 23px "Songti SC", "STSong", serif';
    ctx.fillText(cfg.name, w / 2, y + 32);
    ctx.fillStyle = COLORS.vermilion;
    ctx.font = '11px "PingFang SC", sans-serif';
    ctx.fillText(id === 'rules' ? '落子夹住敌子，就能翻成自己的颜色' : `${cfg.cost} 能量${cfg.maxUsesPerGame ? `  ·  每局 ${cfg.maxUsesPerGame} 次` : ''}${cfg.allowInOnline ? '' : '  ·  仅离线对局'}`, w / 2, y + 60, boxW - 24);

    const diagramY = y + 82;
    ctx.fillStyle = COLORS.felt;
    this.roundRect(ctx, x + 16, diagramY, boxW - 32, 86, 3);
    ctx.fill();
    const piece = (cx: number, color: string) => {
      ctx.beginPath();
      ctx.arc(cx, diagramY + 43, 17, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#9b947d';
      ctx.lineWidth = 1;
      ctx.stroke();
    };
    if (id === 'rules') {
      piece(w / 2 - 69, COLORS.ink);
      piece(w / 2 - 23, COLORS.paperLight);
      piece(w / 2 + 23, COLORS.paperLight);
      piece(w / 2 + 69, COLORS.ink);
      ctx.strokeStyle = '#e8d3a6';
      ctx.beginPath();
      ctx.arc(w / 2 + 69, diagramY + 43, 21, 0, Math.PI * 2);
      ctx.stroke();
    } else if (id === 'steal') {
      piece(w / 2 - 55, COLORS.paperLight);
      piece(w / 2 + 55, COLORS.ink);
      ctx.fillStyle = '#e8d3a6';
      ctx.font = '25px serif';
      ctx.fillText('→', w / 2, diagramY + 43);
    } else if (id === 'shield') {
      piece(w / 2, COLORS.ink);
      ctx.strokeStyle = '#e8d3a6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(w / 2, diagramY + 43, 25, 0, Math.PI * 2);
      ctx.stroke();
    } else if (id === 'double') {
      piece(w / 2 - 35, COLORS.ink);
      piece(w / 2 + 35, COLORS.ink);
      ctx.fillStyle = COLORS.paperLight;
      ctx.font = '14px serif';
      ctx.fillText('1', w / 2 - 35, diagramY + 43);
      ctx.fillText('2', w / 2 + 35, diagramY + 43);
    } else {
      ctx.save();
      ctx.translate(w / 2, diagramY + 43);
      ctx.scale(2.1, 2.1);
      this.drawSkillMark(ctx, id, 0, 0, '#e8d3a6');
      ctx.restore();
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLORS.ink;
    ctx.font = `${boxW < 300 ? 12 : 13}px "PingFang SC", sans-serif`;
    let line = '';
    let textY = y + 188;
    for (const char of cfg.detailDesc) {
      const next = line + char;
      const lineWidth = ctx.measureText(next).width;
      if (lineWidth > boxW - 36 && line && !/^[，。！？；：、）】」]$/.test(char)) {
        ctx.fillText(line, x + 18, textY);
        textY += boxW < 300 ? 19 : 21;
        line = char;
      } else {
        line = next;
      }
    }
    if (line) ctx.fillText(line, x + 18, textY);
    ctx.restore();
    this.registerButton(ctx, 'detail_close', x + 16, y + boxH - 60, boxW - 32, 44, '明白了', {
      bg: COLORS.ink,
      color: COLORS.paperLight,
      onClick: () => { this.skillDetail = null; },
    });
  }

  /**
   * 页面 1：主页（开始游戏、技能图鉴入口、我的进度；一句口号 + 一个翻盘动图做视觉钩子）
   */
  private renderHomePage(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    nowMs: number
  ): void {
    const compact = h < 640;
    const nativeChrome = Boolean(this.nativeMenuRect);
    const navH = 58;
    const usableBottom = h - navH;

    if (!nativeChrome) {
      this.drawBrandMark(ctx, 20, 16, 24);
      ctx.save();
      ctx.fillStyle = COLORS.ink;
      ctx.font = 'bold 24px "Songti SC", "STSong", serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('翻盘棋', 52, 29);
    }
    this.registerButton(ctx, 'btn_settings', w - 78, nativeChrome ? 8 : 12, 58, 32, '声音', {
      bg: COLORS.paperLight, color: COLORS.ink, border: COLORS.line, fontSize: 11,
      onClick: () => { this.settingsOpen = true; },
    });

    ctx.save();
    const lineY = nativeChrome ? (compact ? 42 : 46) : 57;
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, lineY);
    ctx.lineTo(w - 20, lineY);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.muted;
    ctx.font = '10px "PingFang SC", sans-serif';
    ctx.fillText('闲时一局 · 好友同乐', 20, lineY + 14);
    ctx.textAlign = 'right';
    ctx.fillText('棋桌 / 01', w - 20, lineY + 14);

    const titleY = nativeChrome ? lineY + 50 : lineY + 49;
    ctx.fillStyle = COLORS.ink;
    ctx.font = `600 ${compact ? 27 : 31}px "Songti SC", "STSong", serif`;
    ctx.textAlign = 'left';
    ctx.fillText('落子有声，', 22, titleY);
    ctx.fillText('翻盘有你。', 22, titleY + (compact ? 31 : 36));
    ctx.strokeStyle = COLORS.vermilion;
    ctx.lineWidth = 1;
    this.roundRect(ctx, w - 58, titleY - 16, 28, compact ? 49 : 58, 1);
    ctx.stroke();
    ctx.fillStyle = COLORS.vermilion;
    ctx.font = '9px "Songti SC", serif';
    ctx.textAlign = 'center';
    ctx.fillText('棋友', w - 44, titleY - 2);
    ctx.fillText('相逢', w - 44, titleY + 15);
    ctx.restore();

    const heroX = 20;
    const heroY = titleY + (compact ? 42 : 50);
    const heroW = w - 40;
    const heroH = compact
      ? Math.max(86, Math.min(116, h * 0.21))
      : Math.min(226, Math.max(150, h * 0.29));
    this.drawIllustration(ctx, heroX, heroY, heroW, heroH);
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1;
    this.roundRect(ctx, heroX, heroY, heroW, heroH, 3);
    ctx.stroke();

    const captionY = heroY + heroH + 17;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.muted;
    ctx.font = '10px "PingFang SC", sans-serif';
    ctx.fillText('一方棋盘，等一位老友。', 20, captionY);
    ctx.textAlign = 'right';
    ctx.fillText('8 × 8 · 黑白对弈', w - 20, captionY);
    ctx.restore();

    const btnW = Math.min(w - 40, 330);
    const btnX = (w - btnW) / 2;
    const primaryY = captionY + 13;
    this.registerButton(ctx, 'btn_start', btnX, primaryY, btnW, compact ? 42 : 48, '开始一局', {
      bg: COLORS.felt,
      color: COLORS.white,
      fontSize: compact ? 16 : 18,
      onClick: () => this.navigateTo('mode_select'),
    });
    const friendsY = primaryY + (compact ? 48 : 55);
    const friendH = compact ? 30 : 34;
    ctx.strokeStyle = COLORS.line;
    ctx.beginPath();
    ctx.moveTo(w / 2, friendsY + 5);
    ctx.lineTo(w / 2, friendsY + friendH - 5);
    ctx.stroke();
    this.registerButton(ctx, 'btn_invite_friend', btnX, friendsY, btnW * 0.49, friendH, '邀请好友', {
      bg: COLORS.paper,
      color: COLORS.ink,
      fontSize: 12,
      onClick: () => {
        this.targetMode = 'online';
        this.navigateTo('online_room');
        void this.createRoom();
      },
    });
    this.registerButton(ctx, 'btn_join_friend', btnX + btnW * 0.51, friendsY, btnW * 0.49, friendH, '输入房间号  ›', {
      bg: COLORS.paper,
      color: COLORS.ink,
      fontSize: 12,
      onClick: () => {
        this.targetMode = 'online';
        this.navigateTo('join_room');
      },
    });

    const summaryY = friendsY + friendH + 12;
    const summaryH = compact ? 43 : 56;
    ctx.save();
    ctx.strokeStyle = COLORS.line;
    ctx.beginPath();
    ctx.moveTo(20, summaryY);
    ctx.lineTo(w - 20, summaryY);
    ctx.moveTo(20, summaryY + summaryH);
    ctx.lineTo(w - 20, summaryY + summaryH);
    ctx.stroke();
    const winRate = this.progress.totalGames
      ? `${Math.round(this.progress.totalWins / this.progress.totalGames * 100)}%`
      : '—';
    const summary = [
      [String(this.progress.totalGames), '已下对局'],
      [String(this.progress.totalWins), '获胜对局'],
      [winRate, '胜率'],
    ] as const;
    summary.forEach(([value, label], index) => {
      const centerX = 20 + (w - 40) * (index + 0.5) / 3;
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.ink;
      ctx.font = `600 ${compact ? 17 : 21}px "Songti SC", serif`;
      ctx.fillText(value, centerX, summaryY + (compact ? 17 : 22));
      ctx.fillStyle = COLORS.muted;
      ctx.font = '9px "PingFang SC", sans-serif';
      ctx.fillText(label, centerX, summaryY + (compact ? 33 : 42));
    });
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.ink;
    ctx.font = '18px serif';
    ctx.fillText('›', w - 25, summaryY + summaryH / 2);
    ctx.restore();
    this.hitBoxes.push({
      id: 'btn_records',
      x: 20,
      y: summaryY,
      w: w - 40,
      h: summaryH,
      onClick: () => this.navigateTo('records'),
    });

    const nextStage = getStageConfig(this.maxOpenStage());
    const chapterY = summaryY + summaryH + 7;
    const chapterH = compact ? 42 : 57;
    this.registerButton(ctx, 'btn_chapters', 20, chapterY, w - 40, chapterH, `初识翻转  ·  ${nextStage.name}`, {
      bg: COLORS.paper,
      border: COLORS.line,
      color: COLORS.ink,
      fontSize: compact ? 12 : 14,
      subLabel: compact
        ? `下一站 · 第 ${this.maxOpenStage()} 关`
        : `棋路，一步步来。下一站 · 第 ${this.maxOpenStage()} 关`,
      onClick: () => this.navigateTo('chapters'),
    });
    this.registerButton(ctx, 'btn_codex', w - 88, compact ? lineY + 4 : lineY + 3, 68, 24, '技能图鉴 ›', {
      bg: COLORS.paper,
      color: COLORS.muted,
      fontSize: 9,
      onClick: () => this.navigateTo('codex'),
    });

    if (chapterY + chapterH > usableBottom - 4) {
      // The compact view uses the bottom navigation as the chapter shortcut.
      this.hitBoxes = this.hitBoxes.filter((box) => box.id !== 'btn_codex');
    }
    ctx.save();
    ctx.fillStyle = COLORS.ink;
    ctx.restore();
    this.renderBottomNav(ctx, w, h, 'home');
  }

  /**
   * 页面 2：模式选择（人机挑战 20 关 / 双人同屏 / 好友联机）
   */
  private renderModeSelectPage(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ): void {
    this.addHeader(ctx, w, '开一局', () => this.navigateTo('home'), 'PLAY / 01');
    const compact = h < 640;
    const cardX = 20;
    const cardW = w - 40;
    const maxStage = this.maxOpenStage();
    this.selectedStageId = Math.min(this.selectedStageId, maxStage);
    const firstY = compact ? 145 : 166;
    const modeH = compact ? 55 : 70;
    const modeGap = compact ? 7 : 9;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.muted;
    ctx.font = '10px "PingFang SC", sans-serif';
    ctx.fillText('开局之前', cardX, compact ? 79 : 82);
    ctx.fillStyle = COLORS.ink;
    ctx.font = `600 ${compact ? 23 : 29}px "Songti SC", "STSong", serif`;
    ctx.fillText('摆好棋盘，', cardX, compact ? 106 : 112);
    ctx.fillText('选位对手。', cardX, compact ? 134 : 145);
    ctx.restore();

    const modes = [
      {
        id: 'btn_mode_online' as const,
        mode: 'online' as const,
        mark: '友',
        label: '与好友对弈',
        subtitle: '开一张棋桌，邀好友来翻盘。',
      },
      {
        id: 'btn_mode_ai' as const,
        mode: 'ai' as const,
        mark: '弈',
        label: '独自练习',
        subtitle: `不急着赢，先走好下一步。当前第 ${this.selectedStageId} 关`,
      },
      {
        id: 'btn_mode_local2p' as const,
        mode: 'local2p' as const,
        mark: '双',
        label: '同屏切磋',
        subtitle: '共用一台设备，黑白轮流落子。',
      },
    ] as const;
    let modeY = firstY;
    for (const item of modes) {
      const selected = this.targetMode === item.mode;
      this.registerButton(ctx, item.id, cardX, modeY, cardW, modeH, item.label, {
        bg: selected ? '#dfe3d8' : COLORS.paperLight,
        border: selected ? COLORS.felt : COLORS.line,
        color: COLORS.ink,
        fontSize: compact ? 14 : 16,
        subLabel: item.subtitle,
        leadingText: item.mark,
        onClick: () => { this.targetMode = item.mode; },
      });
      ctx.save();
      ctx.strokeStyle = selected ? COLORS.felt : COLORS.muted;
      ctx.lineWidth = selected ? 2 : 1;
      ctx.beginPath();
      ctx.arc(cardX + cardW - 21, modeY + modeH / 2, 6, 0, Math.PI * 2);
      ctx.stroke();
      if (selected) {
        ctx.fillStyle = COLORS.felt;
        ctx.beginPath();
        ctx.arc(cardX + cardW - 21, modeY + modeH / 2, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      modeY += modeH + modeGap;
    }

    let rulesY = modeY + (compact ? 8 : 16);
    if (this.targetMode === 'ai') {
      ctx.save();
      ctx.fillStyle = COLORS.ink;
      ctx.font = '11px "PingFang SC", sans-serif';
      ctx.fillText('对手强度', cardX, rulesY);
      ctx.restore();
      const difficultyY = rulesY + 8;
      const difficultyGap = 1;
      const difficultyW = (cardW - difficultyGap * 2) / 3;
      const levels = [
        ['入门', 1],
        ['进阶', 5],
        ['高手', 10],
      ] as const;
      levels.forEach(([label, stage], index) => {
        const disabled = stage > maxStage;
        const selected = !disabled && this.selectedStageId >= stage && (index === 2 || this.selectedStageId < levels[index + 1][1]);
        this.registerButton(ctx, `difficulty_${index}`, cardX + index * (difficultyW + difficultyGap), difficultyY, difficultyW, compact ? 30 : 34, label, {
          bg: selected ? COLORS.felt : COLORS.paperLight,
          border: selected ? COLORS.felt : COLORS.line,
          color: selected ? COLORS.white : COLORS.ink,
          fontSize: 11,
          disabled,
          onClick: () => { this.selectedStageId = Math.min(stage, maxStage); },
        });
      });
      rulesY = difficultyY + (compact ? 43 : 47);
    }

    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.ink;
    ctx.font = '11px "PingFang SC", sans-serif';
    ctx.fillText('棋局规则', cardX, rulesY);
    ctx.restore();
    this.registerButton(ctx, 'btn_mode_rules', cardX + cardW - 58, rulesY - 17, 58, 30, '怎么玩？', {
      bg: COLORS.paper,
      color: COLORS.muted,
      fontSize: 10,
      onClick: () => { this.skillDetail = 'rules'; },
    });
    const segmentedY = rulesY + 8;
    const segmentW = cardW / 2;
    this.registerButton(ctx, 'variant_classic', cardX, segmentedY, segmentW, compact ? 32 : 36, '经典黑白', {
      bg: this.ruleVariant === 'classic' ? COLORS.felt : COLORS.paperLight,
      border: COLORS.line,
      color: this.ruleVariant === 'classic' ? COLORS.white : COLORS.ink,
      fontSize: 11,
      onClick: () => { this.ruleVariant = 'classic'; },
    });
    this.registerButton(ctx, 'variant_skills', cardX + segmentW, segmentedY, segmentW, compact ? 32 : 36, '趣味技能', {
      bg: this.ruleVariant === 'skills' ? COLORS.felt : COLORS.paperLight,
      border: COLORS.line,
      color: this.ruleVariant === 'skills' ? COLORS.white : COLORS.ink,
      fontSize: 11,
      onClick: () => { this.ruleVariant = 'skills'; },
    });
    ctx.save();
    ctx.fillStyle = COLORS.muted;
    ctx.font = '9px "PingFang SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(
      this.ruleVariant === 'skills'
        ? '保留合法落子规则，加入蓄能与六种逆转招式。'
        : '标准黑白棋规则，每一手只凭棋力。',
      cardX,
      segmentedY + (compact ? 45 : 51),
      cardW
    );
    ctx.restore();

    const footerY = Math.min(h - 94, segmentedY + (compact ? 61 : 79));
    const startLabel = this.targetMode === 'online'
      ? (this.ruleVariant === 'skills' ? '创建技能好友房' : '创建经典好友房')
      : this.targetMode === 'ai'
      ? `开始第 ${this.selectedStageId} 关`
      : '开始同屏对局';
    this.registerButton(ctx, 'btn_mode_start', cardX, footerY, cardW, compact ? 42 : 48, startLabel, {
      bg: COLORS.felt,
      color: COLORS.white,
      fontSize: compact ? 14 : 16,
      onClick: () => {
        if (this.targetMode === 'online') {
          this.navigateTo('online_room');
          if (this.canUseOnlineRooms()) void this.createRoom();
        } else {
          this.startMatch(this.targetMode, this.selectedStageId);
        }
      },
    });
    this.registerButton(ctx, 'btn_mode_join', cardX, footerY + (compact ? 48 : 55), cardW, 32, '已有房间号？直接入座', {
      bg: COLORS.paper,
      color: COLORS.muted,
      fontSize: 11,
      onClick: () => this.navigateTo('join_room'),
    });
  }

  private renderJoinRoomPage(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ): void {
    this.addHeader(ctx, w, '输入房间号', () => this.navigateTo('mode_select'), 'INVITE / 03');
    const compact = h < 640;
    const cardW = Math.min(w - 40, 340);
    const cardX = (w - cardW) / 2;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.muted;
    ctx.font = '10px "PingFang SC", sans-serif';
    ctx.fillText('赴一场棋约', cardX, compact ? 76 : 82);
    ctx.fillStyle = COLORS.ink;
    ctx.font = `600 ${compact ? 23 : 28}px "Songti SC", "STSong", serif`;
    ctx.fillText('输入房间号，', cardX, compact ? 104 : 113);
    ctx.fillText('即刻入座。', cardX, compact ? 132 : 144);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '10px "PingFang SC", sans-serif';
    ctx.fillText('向好友要一个六位数的棋桌暗号。', cardX, compact ? 153 : 168);
    ctx.restore();

    const slotY = compact ? 169 : 188;
    const slotGap = 7;
    const slotW = (cardW - slotGap * 5) / 6;
    for (let i = 0; i < 6; i++) {
      const x = cardX + i * (slotW + slotGap);
      ctx.fillStyle = COLORS.paperLight;
      this.roundRect(ctx, x, slotY, slotW, compact ? 38 : 44, 2);
      ctx.fill();
      ctx.strokeStyle = this.inputRoomCode.length === i ? COLORS.vermilion : COLORS.line;
      ctx.lineWidth = this.inputRoomCode.length === i ? 1.5 : 1;
      ctx.stroke();
      ctx.fillStyle = COLORS.ink;
      ctx.font = `600 ${compact ? 17 : 20}px "Songti SC", "STSong", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.inputRoomCode[i] ?? '', x + slotW / 2, slotY + (compact ? 19 : 22));
    }

    const keyGap = compact ? 6 : 8;
    const keyW = (cardW - keyGap * 2) / 3;
    const keyH = compact ? 34 : 42;
    const keyStartY = slotY + (compact ? 50 : 58);
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '清空'];
    keys.forEach((key, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      this.registerButton(ctx, `join_key_${key}`, cardX + col * (keyW + keyGap), keyStartY + row * (keyH + keyGap), keyW, keyH, key, {
        bg: key === '⌫' || key === '清空' ? '#ddd6c7' : COLORS.paperLight,
        border: COLORS.line,
        color: COLORS.ink,
        fontSize: key.length > 1 ? 11 : 16,
        onClick: () => {
          if (key === '⌫') this.inputRoomCode = this.inputRoomCode.slice(0, -1);
          else if (key === '清空') this.inputRoomCode = '';
          else if (this.inputRoomCode.length < 6) this.inputRoomCode += key;
        },
      });
    });
    const joinY = keyStartY + 4 * (keyH + keyGap) + 4;
    this.registerButton(ctx, 'btn_join_room_submit', cardX, joinY, cardW, compact ? 42 : 48, this.roomRequestPending ? '正在请房主开门…' : '加入棋桌', {
      bg: COLORS.vermilion,
      color: COLORS.white,
      fontSize: compact ? 14 : 16,
      disabled: this.roomRequestPending || this.inputRoomCode.length !== 6,
      onClick: () => { void this.joinEnteredRoom(); },
    });
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.muted;
    ctx.font = '9px "PingFang SC", sans-serif';
    ctx.fillText('输入完成后按 Enter，或直接点「加入棋桌」。', w / 2, joinY + (compact ? 59 : 70), cardW);
    ctx.restore();
  }

  /**
   * 页面 3：选技能页（6 选 3，每个技能一句话说明+消耗；有关卡锁定时置灰显示解锁条件）
   */
  private renderSkillSelectPage(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ): void {
    this.addHeader(ctx, w, '选好随身招式', () => this.navigateTo('mode_select'), 'PREPARATION / 02');
    const maxSlots =
      this.targetMode === 'ai'
        ? getStageConfig(this.selectedStageId).playerSkillSlots
        : MAX_EQUIPPED_SKILLS;

    const cardW = Math.min(w - 32, 354);
    const cardX = (w - cardW) / 2;
    const equipped = this.progress.equippedSkills.slice(0, maxSlots);
    ctx.save();
    ctx.fillStyle = COLORS.muted;
    ctx.font = '12px "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${equipped.length} / ${maxSlots} 招式已选`, w / 2, 75);
    ctx.restore();

    const startY = 101;
    const itemH = Math.min(86, Math.max(42, Math.floor((h - 222) / 6) - 8));
    let itemY = startY;

    for (const skillId of ALL_SKILL_IDS) {
      const cfg = SKILLS_CONFIG[skillId];
      const isUnlocked =
        this.progress.unlockedSkills.includes(skillId) ||
        this.progress.maxClearedStage >= cfg.unlockStage;
      const isEquipped = equipped.includes(skillId);

      const subText = isUnlocked
        ? SKILL_SUMMARIES[skillId]
        : `通关第 ${cfg.unlockStage} 关后解锁`;

      this.registerButton(
        ctx,
        `skill_item_${skillId}`,
        cardX,
        itemY,
        cardW,
        itemH,
        `${cfg.name}  ·  ${cfg.cost} 能量${isEquipped ? '   已选' : ''}`,
        {
          bg: !isUnlocked ? '#dad4c5' : isEquipped ? COLORS.felt : COLORS.paperLight,
          border: isEquipped ? COLORS.felt : COLORS.line,
          color: !isUnlocked ? '#878679' : isEquipped ? COLORS.white : COLORS.ink,
          fontSize: 14,
          subLabel: subText,
          icon: skillId,
          disabled: !isUnlocked,
          onClick: () => this.toggleSkillEquip(skillId),
        }
      );
      itemY += itemH + 8;
    }

    const buttonY = Math.min(h - 64, itemY + 2);
    this.registerButton(
      ctx,
      'btn_confirm_start_match',
      cardX,
      buttonY,
      cardW,
      48,
      '确认阵容  ·  开始对局',
      {
        bg: COLORS.vermilion,
        color: COLORS.white,
        fontSize: 17,
        onClick: () => this.startMatch(this.targetMode, this.selectedStageId),
      }
    );
  }

  /**
   * 页面 4：对局页（棋盘、双方头像/子数、能量条、3 个技能按钮、回合提示、认输/重开）
   */
  private renderMatchPage(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    nowMs: number
  ): void {
    const state = this.gameState;
    const counts = countPieces(state.board);
    const bPlayer = state.players[Piece.Black];
    const wPlayer = state.players[Piece.White];
    const compactControls = w < 350;
    const systemMenu = Boolean(this.nativeMenuRect);

    this.registerButton(ctx, 'btn_match_exit', compactControls ? 8 : 12, 12, compactControls ? 46 : 62, 30, '离开', {
      bg: COLORS.paperLight,
      border: COLORS.line,
      color: COLORS.ink,
      fontSize: 12,
      onClick: () => { this.activeDialog = 'exit'; },
    });
    this.registerButton(ctx, 'btn_match_log', compactControls ? 58 : 82, 12, compactControls ? 42 : 50, 30, '棋谱', {
      bg: COLORS.paperLight,
      border: COLORS.line,
      color: COLORS.ink,
      fontSize: 12,
      onClick: () => { this.moveLogOpen = true; },
    });
    this.registerButton(ctx, 'btn_match_settings', compactControls ? 104 : w / 2 - 27, 12, compactControls ? 42 : 50, 30, systemMenu ? '更多' : '声效', {
      bg: COLORS.paperLight,
      border: COLORS.line,
      color: COLORS.ink,
      fontSize: 11,
      onClick: () => { this.settingsOpen = true; },
    });

    const restartX = compactControls ? w - 94 : w - 142;
    if (!systemMenu) this.registerButton(
      ctx,
      'btn_match_restart',
      restartX,
      12,
      compactControls ? 42 : 62,
      30,
      '重来',
      {
        bg: COLORS.paperLight,
        border: COLORS.line,
        color: COLORS.ink,
        fontSize: 12,
        disabled: state.isGameOver || state.mode === 'online',
        onClick: () => { this.activeDialog = 'restart'; },
      }
    );

    if (!systemMenu) this.registerButton(
      ctx,
      'btn_match_surrender',
      compactControls ? w - 46 : w - 74,
      12,
      compactControls ? 38 : 62,
      30,
      '认输',
      {
        bg: COLORS.vermilion,
        color: COLORS.white,
        fontSize: 12,
        disabled: state.isGameOver || this.onlineActionPending,
        onClick: () => {
          this.activeDialog = 'surrender';
        },
      }
    );

    // 顶部双方头像、子数、能量条面板
    const panelY = 50;
    const panelW = w - 24;
    ctx.save();
    ctx.fillStyle = COLORS.paperLight;
    this.roundRect(ctx, 12, panelY, panelW, 70, 4);
    ctx.fill();
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;
    ctx.stroke();

    // 两边子数与能量
    const drawMiniStone = (x: number, y: number, color: PlayerColor) => {
      const gradient = ctx.createRadialGradient(x - 2, y - 3, 1, x, y, 8);
      if (color === Piece.Black) {
        gradient.addColorStop(0, '#536159');
        gradient.addColorStop(1, '#111b17');
      } else {
        gradient.addColorStop(0, '#fffdf6');
        gradient.addColorStop(1, '#d2c7b3');
      }
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
    };
    drawMiniStone(20, panelY + 18, Piece.Black);
    drawMiniStone(w - 20, panelY + 18, Piece.White);
    ctx.fillStyle = COLORS.ink;
    ctx.font = '12px "PingFang SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('黑方', 33, panelY + 19);
    ctx.fillStyle = COLORS.ink;
    ctx.font = 'bold 21px "Songti SC", "STSong", serif';
    ctx.fillText(String(counts.black), 33, panelY + 44);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '10px "PingFang SC", sans-serif';
    ctx.fillText(`${bPlayer.energy} 能量`, 61, panelY + 43);
    ctx.fillStyle = '#d8d0bf';
    ctx.fillRect(24, panelY + 56, 76, 4);
    ctx.fillStyle = COLORS.felt;
    ctx.fillRect(24, panelY + 56, 76 * bPlayer.energy / ENERGY_CONFIG.maxEnergy, 4);

    const whiteLabel =
      state.mode === 'ai'
        ? `AI · ${getStageConfig(this.selectedStageId).aiLevel}`
        : '白方';
    ctx.fillStyle = COLORS.ink;
    ctx.font = '12px "PingFang SC", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(whiteLabel, w - 33, panelY + 19);
    ctx.fillStyle = COLORS.ink;
    ctx.font = 'bold 21px "Songti SC", "STSong", serif';
    ctx.fillText(String(counts.white), w - 33, panelY + 44);
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.muted;
    ctx.font = '10px "PingFang SC", sans-serif';
    ctx.fillText(`${wPlayer.energy} 能量`, w - 103, panelY + 43);
    ctx.fillStyle = '#d8d0bf';
    ctx.fillRect(w - 109, panelY + 56, 76, 4);
    ctx.fillStyle = COLORS.felt;
    ctx.fillRect(w - 109, panelY + 56, 76 * wPlayer.energy / ENERGY_CONFIG.maxEnergy, 4);

    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.vermilion;
    ctx.font = 'bold 11px "PingFang SC", sans-serif';
    const turnText = state.isGameOver
      ? '对局结束'
      : state.currentPlayer === Piece.Black
      ? '黑方回合'
      : state.mode === 'ai'
      ? '电脑落子'
      : '白方回合';
    ctx.beginPath();
    ctx.arc(w / 2 - ctx.measureText(turnText).width / 2 - 8, panelY + 26, 3, 0, Math.PI * 2);
    ctx.fillStyle = state.currentPlayer === Piece.Black && !state.isGameOver ? COLORS.felt : COLORS.brass;
    ctx.fill();
    ctx.fillStyle = COLORS.vermilion;
    ctx.fillText(turnText, w / 2, panelY + 30);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '10px "PingFang SC", sans-serif';
    ctx.fillText(`第 ${state.stepIndex} 手`, w / 2, panelY + 47);
    ctx.restore();

    // 8×8 棋盘渲染
    const rect = computeBoardRect(w, h);
    ctx.save();
    ctx.fillStyle = '#9b7048';
    this.roundRect(ctx, rect.x - 8, rect.y - 8, rect.size + 16, rect.size + 16, 3);
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.save();
    ctx.fillStyle = COLORS.paperLight;
    ctx.font = '6px "SFMono-Regular", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let c = 0; c < 8; c++) {
      ctx.fillText(String.fromCharCode(65 + c), rect.x + (c + 0.5) * rect.cellSize, rect.y - 4);
    }
    for (let r = 0; r < 8; r++) {
      ctx.fillText(String(r + 1), rect.x - 4, rect.y + (r + 0.5) * rect.cellSize);
    }
    ctx.restore();

    // 计算当前合法落子点或技能可作用目标格高亮
    const activePlayer = state.currentPlayer;
    const validMoves = getValidMoves(state.board, activePlayer, state.shielded);
    const validSet = new Set(validMoves.map((m) => `${m.row},${m.col}`));
    const skillTargetList = state.selectedSkill
      ? getSkillTargets(state, activePlayer, state.selectedSkill.skillId)
      : [];
    const skillTargetSet = new Set(
      skillTargetList.map((t) => `${t.row},${t.col}`)
    );
    const selectedSkill = state.selectedSkill?.skillId;
    const instructions: Record<SkillId, string> = {
      bomb: '选择金色圆圈处落子，触发十字翻转',
      shield: '选择己方棋子，赋予永久金身',
      steal: '选择对方普通棋子，将它变为己方',
      double: state.selectedSkill?.doubleStep === 2 ? '连续落子：请落下第二子' : '选择第一处落点，本回合连续落两子',
      wait: '申请跳过回合，积攒能量',
      undo: '回到自己上一个回合',
    };
    const helperText = state.isGameOver
      ? '棋局已定，查看本局比分与精彩一手'
      : state.mode === 'online' && this.connectionStatus === 'reconnecting'
      ? '连接中断 · 正在恢复对局'
      : state.mode === 'online' && this.onlineActionPending
      ? '正在同步这一步…'
      : state.mode === 'online' && this.opponentDisconnected
      ? '对方已离线超过 90 秒'
      : state.pendingWaitRequest
      ? state.pendingWaitRequest.requester === this.onlinePlayerColor
        ? '已请求休整，等待对方回应'
        : '对方请求休整一回合，请选择同意或拒绝'
      : selectedSkill
      ? instructions[selectedSkill]
      : `金色圆点可落子  ·  当前有 ${validMoves.length} 处可选`;
    if (rect.y > 180) {
      ctx.fillStyle = COLORS.ink;
      ctx.font = 'bold 16px "Songti SC", "STSong", serif';
      ctx.textAlign = 'center';
      ctx.fillText(state.mode === 'ai' ? getStageConfig(this.selectedStageId).name : state.mode === 'online' ? `好友对弈  ·  ${this.currentRoom?.roomId ?? ''}` : '同桌对弈', w / 2, rect.y - 65, w - 32);
      ctx.fillStyle = COLORS.muted;
      ctx.font = '12px "PingFang SC", sans-serif';
      ctx.fillText(helperText, w / 2, rect.y - 37, w - 32);
    }
    const lastMove = [...state.moveHistory].reverse().find((move) => move.position)?.position;
    const hoverCell = this.pointerPosition
      ? pixelToBoardCoord(this.pointerPosition.x, this.pointerPosition.y, rect)
      : null;
    const canPlay = !state.isGameOver && !this.onlineActionPending &&
      (state.mode !== 'ai' || activePlayer === Piece.Black) &&
      (state.mode !== 'online' || activePlayer === this.onlinePlayerColor);

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cx = rect.x + c * rect.cellSize;
        const cy = rect.y + r * rect.cellSize;

        ctx.fillStyle = (r + c) % 2 === 0 ? COLORS.felt : COLORS.feltLight;
        ctx.fillRect(cx, cy, rect.cellSize, rect.cellSize);
        ctx.strokeStyle = 'rgba(237, 225, 195, 0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx, cy, rect.cellSize, rect.cellSize);

        const key = `${r},${c}`;
        const center = boardCoordToPixelCenter(r, c, rect);
        const piece = state.board[r][c];
        const isTarget = selectedSkill ? skillTargetSet.has(key) : validSet.has(key);
        if (hoverCell?.row === r && hoverCell.col === c && canPlay && isTarget) {
          ctx.fillStyle = 'rgba(232, 211, 166, 0.2)';
          ctx.fillRect(cx + 1, cy + 1, rect.cellSize - 2, rect.cellSize - 2);
        }

        // 技能目标高亮圈
        if (skillTargetSet.has(key)) {
          ctx.beginPath();
          ctx.arc(center.cx, center.cy, rect.cellSize * 0.42, 0, Math.PI * 2);
          ctx.strokeStyle = COLORS.brass;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        // 合法落子提示绿点
        else if (piece === Piece.Empty && validSet.has(key)) {
          ctx.beginPath();
          ctx.arc(center.cx, center.cy, rect.cellSize * 0.14, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(226, 204, 146, 0.86)';
          ctx.fill();
        }

        // 渲染棋子（结合翻子动画 scaleX）
        if (piece !== Piece.Empty) {
          const flipAnim = this.anim.getPieceFlipState(r, c, piece, nowMs);
          const radius = rect.cellSize * 0.38;

          ctx.save();
          ctx.translate(center.cx, center.cy);
          const placeScale = this.preferences.effects ? this.anim.getPlaceScale(r, c, nowMs) : 1;
          ctx.scale(this.preferences.effects ? flipAnim.scaleX * placeScale : 1, placeScale);
          const shownColor = this.preferences.effects ? flipAnim.displayColor : piece;
          const stoneGradient = ctx.createRadialGradient(
            -radius * 0.32, -radius * 0.38, radius * 0.08,
            0, 0, radius
          );
          if (shownColor === Piece.Black) {
            stoneGradient.addColorStop(0, '#536159');
            stoneGradient.addColorStop(0.45, '#1c2924');
            stoneGradient.addColorStop(1, '#0e1713');
          } else {
            stoneGradient.addColorStop(0, '#fffef9');
            stoneGradient.addColorStop(0.5, '#f5efe4');
            stoneGradient.addColorStop(1, '#c9beab');
          }
          ctx.shadowColor = 'rgba(8, 20, 16, 0.35)';
          ctx.shadowBlur = 3;
          ctx.shadowOffsetY = 2;
          ctx.beginPath();
          ctx.arc(0, 0, radius, 0, Math.PI * 2);
          ctx.fillStyle = stoneGradient;
          ctx.fill();
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;
          ctx.strokeStyle =
            shownColor === Piece.Black ? '#4d5d52' : '#c8bea9';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // 金身子金色光环护盾标识
          if (state.shielded[r][c]) {
            ctx.beginPath();
            ctx.arc(0, 0, radius + 3, 0, Math.PI * 2);
            ctx.strokeStyle = COLORS.brass;
            ctx.lineWidth = 2;
            ctx.stroke();
          }

          ctx.restore();
        }
        if (lastMove?.row === r && lastMove.col === c) {
          ctx.beginPath();
          ctx.arc(center.cx, center.cy, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = COLORS.vermilion;
          ctx.fill();
        }
      }
    }

    if (this.preferences.effects) renderBoardEffects(ctx, this.anim, rect, nowMs);
    ctx.restore();

    // 底部 3 个技能按钮栏（无合法落子时：只能用求你等我或 pass，炸弹/双子自动置灰）
    const activePState = state.players[activePlayer];
    const skills = activePState.equippedSkills.slice(0, 3);
    const btnY = rect.y + rect.size + 18;
    const gap = 7;
    const btnW = skills.length
      ? Math.floor((w - 24 - gap * (skills.length - 1)) / skills.length)
      : w - 24;

    if (skills.length === 0) {
      ctx.save();
      ctx.fillStyle = COLORS.muted;
      ctx.font = '12px "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('本局没有携带技能', w / 2, btnY + 27);
      ctx.restore();
    }

    skills.forEach((skillId, idx) => {
      const cfg = SKILLS_CONFIG[skillId];
      const check = canUseSkill(state, activePlayer, skillId);
      const isSelected = state.selectedSkill?.skillId === skillId;
      const bx = 12 + idx * (btnW + gap);
      const aiTurn = state.mode === 'ai' && activePlayer === Piece.White;

      this.registerButton(
        ctx,
        `match_skill_${skillId}`,
        bx,
        btnY,
        btnW,
        54,
        `${cfg.name} · ${cfg.cost}`,
        {
          bg: isSelected ? COLORS.brass : COLORS.ink,
          border: isSelected ? '#8c6b36' : COLORS.ink,
          color: isSelected ? COLORS.ink : COLORS.paperLight,
          fontSize: 12,
          subLabel: check.usable
            ? isSelected
              ? '再次点击取消'
              : '可用'
            : check.reason ?? '不可用',
          disabled:
            (!check.usable && !isSelected) || aiTurn ||
            this.onlineActionPending ||
            (state.mode === 'online' && activePlayer !== this.onlinePlayerColor),
          onClick: () => this.handleSkillButtonClick(skillId),
        }
      );
    });
    if (!state.isGameOver && !state.pendingWaitRequest && validMoves.length > 0) {
      ctx.save();
      ctx.fillStyle = COLORS.muted;
      ctx.font = '11px "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(rect.y > 180 ? '棋子上的朱砂点标记上一手落点' : helperText, w / 2, btnY + 77, w - 24);
      if (this.preferences.sound) {
        const active = this.anim.boardEffects.some((effect) => nowMs - effect.startTimeMs < effect.durationMs);
        ctx.textAlign = 'right';
        ctx.fillStyle = COLORS.felt;
        ctx.font = '9px "PingFang SC", sans-serif';
        ctx.fillText('音效  ●', w - 14, btnY + 77);
        if (active) {
          ctx.fillStyle = COLORS.brass;
          ctx.fillRect(w - 31, btnY + 72, 2, 4);
          ctx.fillRect(w - 27, btnY + 70, 2, 6);
          ctx.fillRect(w - 23, btnY + 73, 2, 3);
        }
      }
      ctx.restore();
    }

    // 若当前无合法落子，额外显示醒目的「跳过回合 (Pass)」按钮
    if (!state.isGameOver && validMoves.length === 0 && !state.pendingWaitRequest) {
      const splitActions = state.mode === 'online' && this.opponentDisconnected;
      const passWidth = splitActions ? Math.floor((w - 36) / 2) : 180;
      this.registerButton(
        ctx,
        'btn_match_pass',
        splitActions ? 12 : (w - passWidth) / 2,
        btnY + 64,
        passWidth,
        40,
        splitActions ? '无子 · 跳过' : '无子可下  ·  结束本回合',
        {
          bg: COLORS.brass,
          color: COLORS.ink,
          fontSize: 14,
          disabled: state.mode === 'online' && activePlayer !== this.onlinePlayerColor,
          onClick: () => {
            if (this.gameState.mode === 'online') {
              void this.submitOnlineAction({ actionType: 'pass' });
              return;
            }
            const pRes = passTurn(this.gameState);
            if (pRes.ok) {
              this.gameState = pRes.state;
              this.consumeEvents(this.gameState.lastEvents);
              this.checkPostTurnFlow();
            }
          },
        }
      );
    }

    // 联机「求你等我」对方请求弹窗（同意/拒绝）
    if (state.pendingWaitRequest) {
      this.registerButton(
        ctx,
        'btn_wait_approve',
        w / 2 - 110,
        btnY + 64,
        100,
        38,
        '同意请求',
        {
          bg: COLORS.felt,
          color: COLORS.white,
          fontSize: 13,
          disabled: this.onlineActionPending || (state.mode === 'online' && state.pendingWaitRequest.requester === this.onlinePlayerColor),
          onClick: () => {
            if (this.gameState.mode === 'online') {
              void this.respondOnlineWait(true);
              return;
            }
            const r = respondToWaitSkill(this.gameState, true);
            if (r.ok) {
              this.gameState = r.state;
              this.consumeEvents(this.gameState.lastEvents);
            }
          },
        }
      );
      this.registerButton(
        ctx,
        'btn_wait_reject',
        w / 2 + 10,
        btnY + 64,
        100,
        38,
        '拒绝请求',
        {
          bg: COLORS.vermilion,
          color: COLORS.white,
          fontSize: 13,
          disabled: this.onlineActionPending || (state.mode === 'online' && state.pendingWaitRequest.requester === this.onlinePlayerColor),
          onClick: () => {
            if (this.gameState.mode === 'online') {
              void this.respondOnlineWait(false);
              return;
            }
            const r = respondToWaitSkill(this.gameState, false);
            if (r.ok) {
              this.gameState = r.state;
              this.consumeEvents(this.gameState.lastEvents);
            }
          },
        }
      );
    }

    // 若对局已结束，显示查看结算页入口
    if (state.isGameOver) {
      this.registerButton(
        ctx,
        'btn_goto_result',
        (w - 220) / 2,
        btnY + 64,
        220,
        44,
        '查看本局棋谱与比分',
        {
          bg: COLORS.vermilion,
          color: COLORS.white,
          fontSize: 15,
          onClick: () => this.navigateTo('result'),
        }
      );
    }
    if (!state.isGameOver && state.mode === 'online' && this.opponentDisconnected) {
      const splitActions = validMoves.length === 0 && !state.pendingWaitRequest;
      const claimWidth = splitActions ? Math.floor((w - 36) / 2) : Math.min(260, w - 32);
      this.registerButton(ctx, 'btn_claim_disconnect', splitActions ? w / 2 + 6 : (w - claimWidth) / 2, btnY + 64, claimWidth, 40, splitActions ? '认定离线' : '结束等待 · 认定对方离线', {
        bg: COLORS.vermilion, color: COLORS.white, fontSize: 13,
        disabled: this.onlineActionPending,
        onClick: () => { void this.claimDisconnectWin(); },
      });
    }
  }

  /**
   * 页面 5：好友房（创建房 6 位房间号+复制/分享按钮、加入房、等待页双方头像/技能预览/准备状态）
   */
  private renderOnlineRoomPage(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ): void {
    this.addHeader(ctx, w, '好友房', () => this.navigateTo('mode_select'), 'INVITE / 03');
    const compact = h < 640;
    const cardW = Math.min(w - 40, 340);
    const cardX = (w - cardW) / 2;

    if (!this.currentRoom) {
      ctx.save();
      ctx.fillStyle = COLORS.muted;
      ctx.font = '10px "PingFang SC", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('好友棋桌', cardX, compact ? 79 : 85);
      ctx.fillStyle = COLORS.ink;
      ctx.font = `600 ${compact ? 24 : 29}px "Songti SC", "STSong", serif`;
      ctx.fillText('好棋，', cardX, compact ? 108 : 120);
      ctx.fillText('就等你来。', cardX, compact ? 137 : 154);
      ctx.strokeStyle = COLORS.vermilion;
      ctx.lineWidth = 1;
      this.roundRect(ctx, w - 59, compact ? 85 : 92, 30, compact ? 55 : 63, 1);
      ctx.stroke();
      ctx.fillStyle = COLORS.vermilion;
      ctx.font = '9px "Songti SC", serif';
      ctx.textAlign = 'center';
      ctx.fillText('一席', w - 44, compact ? 103 : 111);
      ctx.fillText('待君', w - 44, compact ? 120 : 130);
      ctx.fillStyle = COLORS.muted;
      ctx.font = '10px "PingFang SC", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('开一张棋桌，把六位房号捎给朋友。', cardX, compact ? 160 : 180);
      ctx.restore();

      const noteY = compact ? 184 : 211;
      const noteH = compact ? 88 : 124;
      ctx.save();
      ctx.fillStyle = COLORS.felt;
      this.roundRect(ctx, cardX, noteY, cardW, noteH, 4);
      ctx.fill();
      ctx.fillStyle = '#e8d3a6';
      ctx.font = '10px "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('HOSTED GAME', w / 2, noteY + 25);
      ctx.fillStyle = COLORS.white;
      ctx.font = `600 ${compact ? 43 : 58}px "Songti SC", serif`;
      ctx.fillText('— — — — — —', w / 2, noteY + (compact ? 59 : 75), cardW - 28);
      ctx.fillStyle = '#d7e1d6';
      ctx.font = '10px "PingFang SC", sans-serif';
      ctx.fillText('创建后生成房间号 · 好友执白入座', w / 2, noteY + noteH - 16, cardW - 26);
      ctx.restore();

      const createY = noteY + noteH + (compact ? 14 : 22);
      if (this.onlineUnavailableReason) {
        const noticeH = compact ? 66 : 76;
        ctx.save();
        ctx.fillStyle = '#f0e5cf';
        this.roundRect(ctx, cardX, createY, cardW, noticeH, 3);
        ctx.fill();
        ctx.strokeStyle = COLORS.brass;
        ctx.stroke();
        ctx.textAlign = 'left';
        ctx.fillStyle = COLORS.ink;
        ctx.font = '600 11px "PingFang SC", sans-serif';
        ctx.fillText('云环境尚未配置', cardX + 12, createY + 20);
        ctx.fillStyle = COLORS.muted;
        ctx.font = '9px "PingFang SC", sans-serif';
        ctx.fillText('当前可使用人机闯关与同屏对弈。', cardX + 12, createY + 39);
        ctx.fillText('配置后会自动开放好友房。', cardX + 12, createY + 54);
        ctx.restore();
        this.registerButton(ctx, 'btn_online_retry', cardX, createY + noticeH + 10, cardW, 40, '重试连接好友房', {
          bg: COLORS.paperLight,
          border: COLORS.line,
          color: COLORS.ink,
          fontSize: 12,
          onClick: () => {
            if (this.canUseOnlineRooms()) void this.createRoom();
          },
        });
        this.registerButton(ctx, 'btn_offline_play', cardX, createY + noticeH + 58, cardW, 40, '先玩人机闯关', {
          bg: COLORS.felt,
          color: COLORS.white,
          fontSize: 12,
          onClick: () => {
            this.targetMode = 'ai';
            this.navigateTo('mode_select');
          },
        });
        return;
      }
      this.registerButton(ctx, 'btn_create_room', cardX, createY, cardW, compact ? 44 : 50, this.roomRequestPending ? '正在开门…' : '创建好友房', {
        bg: COLORS.felt,
        color: COLORS.white,
        fontSize: compact ? 15 : 17,
        disabled: this.roomRequestPending,
        onClick: () => { void this.createRoom(); },
      });
      this.registerButton(ctx, 'btn_join_room', cardX, createY + (compact ? 50 : 58), cardW, 34, '已有房间号？直接入座  ›', {
        bg: COLORS.paper,
        color: COLORS.muted,
        fontSize: 11,
        onClick: () => this.navigateTo('join_room'),
      });
      return;
    }

    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.muted;
    ctx.font = '10px "PingFang SC", sans-serif';
    ctx.fillText('一席待君', cardX, compact ? 77 : 82);
    ctx.fillStyle = COLORS.ink;
    ctx.font = `600 ${compact ? 21 : 26}px "Songti SC", "STSong", serif`;
    ctx.fillText('好棋，就等你来。', cardX, compact ? 106 : 114);

    const paperY = compact ? 122 : 134;
    const paperH = compact ? 78 : 92;
    ctx.fillStyle = COLORS.paperLight;
    this.roundRect(ctx, cardX, paperY, cardW, paperH, 3);
    ctx.fill();
    ctx.strokeStyle = COLORS.line;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.muted;
    ctx.font = '9px "PingFang SC", sans-serif';
    ctx.fillText('房间号码', w / 2, paperY + 18);
    ctx.fillStyle = COLORS.ink;
    ctx.font = `600 ${compact ? 29 : 36}px "Songti SC", "STSong", serif`;
    ctx.fillText(this.currentRoom.roomId, w / 2, paperY + (compact ? 49 : 58));
    ctx.fillStyle = COLORS.felt;
    ctx.font = '9px "PingFang SC", sans-serif';
    const roomStatus = this.currentRoom.guestInfo
      ? '朋友已加入 · 对局已准备'
      : this.connectionStatus === 'reconnecting'
      ? '连接中断 · 正在重连'
      : this.connectionStatus === 'connecting'
      ? '正在连接房间…'
      : '等待朋友加入';
    ctx.fillText(roomStatus, w / 2, paperY + paperH - 10);

    const seatsY = paperY + paperH + (compact ? 14 : 20);
    const seatH = compact ? 68 : 82;
    ctx.strokeStyle = COLORS.line;
    ctx.beginPath();
    ctx.moveTo(cardX, seatsY);
    ctx.lineTo(cardX + cardW, seatsY);
    ctx.moveTo(cardX, seatsY + seatH);
    ctx.lineTo(cardX + cardW, seatsY + seatH);
    ctx.stroke();
    ctx.fillStyle = COLORS.ink;
    ctx.beginPath();
    ctx.arc(cardX + 18, seatsY + 24, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#a89a82';
    ctx.fillStyle = COLORS.paperLight;
    ctx.beginPath();
    ctx.arc(cardX + cardW - 18, seatsY + 24, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.ink;
    ctx.font = '600 12px "PingFang SC", sans-serif';
    ctx.fillText(this.currentRoom.hostInfo.nickname, cardX + 35, seatsY + 22);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '9px "PingFang SC", sans-serif';
    ctx.fillText('执黑 · 已入座', cardX + 35, seatsY + 39);
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.ink;
    ctx.font = '600 12px "PingFang SC", sans-serif';
    ctx.fillText(this.currentRoom.guestInfo?.nickname ?? '好友', cardX + cardW - 35, seatsY + 22);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '9px "PingFang SC", sans-serif';
    ctx.fillText(this.currentRoom.guestInfo ? '执白 · 已入座' : '执白 · 等待入座', cardX + cardW - 35, seatsY + 39);
    ctx.restore();

    const shareY = seatsY + seatH + (compact ? 15 : 22);
    this.registerButton(ctx, 'btn_copy_share_room', cardX, shareY, cardW, compact ? 44 : 48, '邀请微信好友', {
      bg: COLORS.felt, color: COLORS.white, fontSize: 15,
      onClick: () => this.shareRoom(),
    });
    if (this.currentRoom.status === 'playing' && this.currentRoom.gameState) {
      this.registerButton(ctx, 'btn_room_start_match', cardX, shareY + (compact ? 51 : 58), cardW, compact ? 42 : 46, '开始这一局', {
        bg: COLORS.vermilion, color: COLORS.white, fontSize: 15,
        onClick: () => this.startMatch('online'),
      });
    } else {
      this.registerButton(ctx, 'btn_room_refresh', cardX, shareY + (compact ? 51 : 58), cardW, compact ? 38 : 42, this.roomRequestPending ? '正在刷新…' : '刷新房间状态', {
        bg: COLORS.paperLight, border: COLORS.line, color: COLORS.ink, fontSize: 14,
        disabled: this.roomRequestPending,
        onClick: () => { void this.refreshRoom(); },
      });
      this.registerButton(ctx, 'btn_cancel_room', cardX, shareY + (compact ? 96 : 108), cardW, 34, '收起这张棋桌', {
        bg: COLORS.paper, border: COLORS.line, color: COLORS.muted, fontSize: 13,
        disabled: this.roomRequestPending,
        onClick: () => { void this.cancelWaitingRoom(); },
      });
    }
  }

  /**
   * 页面 6：结算页（胜负、子数比分滚动动画、本局最大翻盘步高亮、再来一局/分享战绩）
   */
  private drawResultBoard(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number
  ): void {
    const boardSize = size - 14;
    const boardX = x + 7;
    const boardY = y + 7;
    const cell = boardSize / 8;
    ctx.save();
    ctx.fillStyle = '#9b7048';
    this.roundRect(ctx, x, y, size, size, 3);
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const cx = boardX + col * cell;
        const cy = boardY + row * cell;
        ctx.fillStyle = (row + col) % 2 === 0 ? COLORS.felt : COLORS.feltLight;
        ctx.fillRect(cx, cy, cell, cell);
        ctx.strokeStyle = 'rgba(237, 225, 195, 0.18)';
        ctx.strokeRect(cx, cy, cell, cell);
        const piece = this.gameState.board[row][col];
        if (piece !== Piece.Empty) {
          const gradient = ctx.createRadialGradient(
            cx + cell * 0.35,
            cy + cell * 0.3,
            1,
            cx + cell / 2,
            cy + cell / 2,
            cell * 0.34
          );
          if (piece === Piece.Black) {
            gradient.addColorStop(0, '#59675e');
            gradient.addColorStop(1, '#111a16');
          } else {
            gradient.addColorStop(0, '#fffef9');
            gradient.addColorStop(1, '#cdc1ac');
          }
          ctx.beginPath();
          ctx.arc(cx + cell / 2, cy + cell / 2, cell * 0.34, 0, Math.PI * 2);
          ctx.fillStyle = gradient;
          ctx.fill();
          ctx.strokeStyle = piece === Piece.Black ? '#4b5b51' : '#bcb29f';
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }
    const lastMove = [...this.gameState.moveHistory].reverse().find((move) => move.position)?.position;
    if (lastMove) {
      ctx.fillStyle = COLORS.vermilion;
      ctx.beginPath();
      ctx.arc(
        boardX + (lastMove.col + 0.5) * cell,
        boardY + (lastMove.row + 0.5) * cell,
        Math.max(1.5, cell * 0.08),
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.restore();
  }

  private renderResultPage(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    nowMs: number
  ): void {
    const counts = countPieces(this.gameState.board);
    const rolled = this.preferences.effects ? this.anim.getRolledScores(
      counts.black,
      counts.white,
      nowMs
    ) : counts;
    const biggest = getBiggestComebackMove(this.gameState);

    const title = this.gameState.winner === Piece.Black
      ? '黑方胜出'
      : this.gameState.winner === Piece.White
      ? '白方胜出'
      : '平局';
    const cardW = Math.min(w - 40, 340);
    const cardX = (w - cardW) / 2;
    const compact = h < 640;
    const boardY = compact ? 72 : 84;
    const boardSize = compact
      ? Math.min(132, cardW - 88)
      : Math.min(184, cardW - 84, h * 0.24);
    const boardX = (w - boardSize) / 2;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.vermilion;
    ctx.font = '10px "PingFang SC", sans-serif';
    ctx.fillText('FINAL SCORE  /  THE LAST MOVE', w / 2, 22);
    ctx.fillStyle = COLORS.ink;
    ctx.font = 'bold 26px "Songti SC", "STSong", serif';
    ctx.fillText(title, w / 2, 51);
    ctx.restore();

    this.drawResultBoard(ctx, boardX, boardY, boardSize);
    const scoreY = boardY + boardSize + (compact ? 10 : 14);
    const scoreH = compact ? 60 : 70;
    ctx.fillStyle = COLORS.paperLight;
    this.roundRect(ctx, cardX, scoreY, cardW, scoreH, 3);
    ctx.fill();
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.ink;
    ctx.font = `600 ${compact ? 25 : 29}px "Songti SC", "STSong", serif`;
    ctx.fillText(`${rolled.black}   :   ${rolled.white}`, w / 2, scoreY + (compact ? 28 : 34));
    ctx.fillStyle = COLORS.muted;
    ctx.font = '10px "PingFang SC", sans-serif';
    ctx.fillText('黑方                 白方', w / 2, scoreY + scoreH - 12);
    ctx.restore();

    const detailY = scoreY + scoreH + 8;
    const detailH = compact ? 52 : 58;
    ctx.fillStyle = COLORS.felt;
    this.roundRect(ctx, cardX, detailY, cardW, detailH, 3);
    ctx.fill();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8d3a6';
    ctx.font = '9px "PingFang SC", sans-serif';
    ctx.fillText('本局最大翻子', w / 2, detailY + 14);
    ctx.fillStyle = COLORS.white;
    ctx.font = `600 ${compact ? 17 : 19}px "Songti SC", "STSong", serif`;
    ctx.fillText(biggest ? `一次翻转 ${biggest.flippedCount} 子` : '没有翻子记录', w / 2, detailY + (compact ? 33 : 36));
    ctx.restore();

    const actionY = detailY + detailH + (this.shareCardNotice ? 25 : 12);
    this.registerButton(ctx, 'btn_result_share', cardX, actionY, cardW, compact ? 42 : 48, '分享这一局', {
      bg: COLORS.vermilion, color: COLORS.white, fontSize: compact ? 14 : 16,
      onClick: () => { this.generateSharePayload(); },
    });
    const secondaryY = actionY + (compact ? 49 : 56);
    const secondaryGap = 8;
    const secondaryW = (cardW - secondaryGap) / 2;
    this.registerButton(ctx, 'btn_result_rematch', cardX, secondaryY, secondaryW, compact ? 38 : 44, this.gameState.mode === 'online' ? '再开好友房' : '再来一局', {
      bg: COLORS.paperLight, border: COLORS.line, color: COLORS.ink, fontSize: compact ? 12 : 14,
      onClick: () => {
        if (this.gameState.mode === 'online') {
          this.onlineClient.stopWatch();
          this.currentRoom = null;
          this.inputRoomCode = '';
          this.navigateTo('online_room');
        } else {
          this.startMatch(this.gameState.mode, this.selectedStageId);
        }
      },
    });
    this.registerButton(ctx, 'btn_result_review', cardX + secondaryW + secondaryGap, secondaryY, secondaryW, compact ? 38 : 44, '回看棋谱', {
      bg: COLORS.paperLight,
      border: COLORS.line,
      color: COLORS.ink,
      fontSize: compact ? 12 : 14,
      onClick: () => {
        this.moveLogOpen = true;
      },
    });
    this.registerButton(ctx, 'btn_result_play_friend', cardX, secondaryY + (compact ? 44 : 51), cardW, compact ? 34 : 38, '邀好友再下一盘', {
      bg: COLORS.felt,
      color: COLORS.white,
      fontSize: compact ? 12 : 13,
      onClick: () => {
        this.onlineClient.stopWatch();
        this.currentRoom = null;
        this.inputRoomCode = '';
        this.targetMode = 'online';
        this.navigateTo('online_room');
      },
    });
    this.registerButton(ctx, 'btn_result_home', cardX, secondaryY + (compact ? 83 : 96), cardW, 32, '收好棋子，返回棋桌', {
      bg: COLORS.paper, color: COLORS.muted, fontSize: compact ? 11 : 12,
      onClick: () => this.navigateTo('home'),
    });
    if (this.shareCardNotice) {
      ctx.save();
      ctx.fillStyle = COLORS.vermilion;
      ctx.font = '9px "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('战绩卡片已准备，可通过微信分享给好友。', w / 2, detailY + detailH + 14, cardW);
      ctx.restore();
    }
    const isMyWin = this.gameState.mode === 'local2p' || this.gameState.winner === (this.gameState.mode === 'online' ? this.onlinePlayerColor : Piece.Black);
    if (this.preferences.effects && isMyWin && this.anim.scoreRoll) {
      renderCelebration(ctx, w, h, this.anim.scoreRoll.startTimeMs, nowMs);
    }
  }

  /**
   * 页面 7：技能图鉴页（6 技能说明 + 能量规则，同时充当新手教程）
   */
  private renderCodexPage(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ): void {
    this.addHeader(ctx, w, '技能图鉴', () => this.navigateTo('home'), 'FIELD NOTES / 04');
    const cardW = Math.min(w - 28, 356);
    const cardX = (w - cardW) / 2;

    ctx.fillStyle = COLORS.felt;
    this.roundRect(ctx, cardX, 80, cardW, 86, 3);
    ctx.fill();
    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e8d3a6';
    ctx.font = '10px "PingFang SC", sans-serif';
    ctx.fillText('ENERGY  /  每回合都在累积', cardX + 14, 101);
    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 16px "Songti SC", "STSong", serif';
    ctx.fillText(`+${ENERGY_CONFIG.turnStartGain} 回合`, cardX + 14, 127);
    ctx.fillStyle = '#d7e1d6';
    ctx.font = '11px "PingFang SC", sans-serif';
    ctx.fillText(`每翻 1 子 +${ENERGY_CONFIG.perFlipGain}  ·  单回合最多 +${ENERGY_CONFIG.maxGainPerTurn}  ·  储量 ${ENERGY_CONFIG.maxEnergy}`, cardX + 14, 149, cardW - 28);
    ctx.restore();

    this.registerButton(ctx, 'codex_rules', cardX + cardW - 96, 87, 82, 24, '基本玩法  ↗', {
      bg: '#19392e',
      color: COLORS.paperLight,
      fontSize: 11,
      onClick: () => { this.skillDetail = 'rules'; },
    });
    let y = 180;
    const boxH = Math.min(64, Math.max(42, Math.floor((h - 270) / 6) - 8));
    for (const id of ALL_SKILL_IDS) {
      const cfg = SKILLS_CONFIG[id];
      this.registerButton(ctx, `codex_skill_${id}`, cardX, y, cardW, boxH, `${cfg.name}  ·  ${cfg.cost} 能量`, {
        bg: COLORS.paperLight,
        border: COLORS.line,
        color: COLORS.ink,
        fontSize: 13,
        subLabel: SKILL_SUMMARIES[id],
        icon: id,
        onClick: () => { this.skillDetail = id; },
      });
      y += boxH + 6;
    }

    this.registerButton(ctx, 'btn_codex_configure', cardX, Math.max(y + 2, h - 62), cardW, 46, '配置携带技能', {
      bg: COLORS.vermilion,
      color: COLORS.white,
      fontSize: 15,
      onClick: () => {
        this.targetMode = 'local2p';
        this.navigateTo('skill_select');
      },
    });
  }

  private renderRecordsPage(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ): void {
    this.addHeader(ctx, w, '我的棋谱', () => this.navigateTo('home'), 'EVERY GAME COUNTS');
    const compact = h < 640;
    const cardW = Math.min(w - 32, 356);
    const cardX = (w - cardW) / 2;
    const records = this.progress.records ?? [];
    const introY = compact ? 78 : 86;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.muted;
    ctx.font = '10px "PingFang SC", sans-serif';
    ctx.fillText('每一局，都算数', cardX, introY);
    ctx.fillStyle = COLORS.ink;
    ctx.font = `600 ${compact ? 20 : 24}px "Songti SC", "STSong", serif`;
    ctx.fillText('留下的每一手，都是棋路。', cardX, introY + (compact ? 24 : 30), cardW);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '10px "PingFang SC", sans-serif';
    ctx.fillText(`${this.progress.totalGames} 局 · ${this.progress.totalWins} 胜 · 最大单步翻 ${this.progress.biggestFlipRecord} 子`, cardX, introY + (compact ? 43 : 53), cardW);
    ctx.restore();

    const listY = introY + (compact ? 56 : 68);
    const rowH = compact ? 48 : 58;
    const gap = compact ? 5 : 7;
    const navY = h - 58;
    const maxRows = Math.max(0, Math.floor((navY - listY - 8) / (rowH + gap)));

    if (records.length === 0) {
      const emptyY = listY + Math.max(28, Math.floor((navY - listY) * 0.24));
      ctx.save();
      ctx.strokeStyle = COLORS.line;
      ctx.lineWidth = 1;
      this.roundRect(ctx, cardX, emptyY, cardW, compact ? 122 : 150, 4);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.ink;
      ctx.font = '18px serif';
      ctx.fillText('●  ○', w / 2, emptyY + 35);
      ctx.font = `600 ${compact ? 16 : 19}px "Songti SC", serif`;
      ctx.fillText('还没有落子成谱', w / 2, emptyY + 67);
      ctx.fillStyle = COLORS.muted;
      ctx.font = '10px "PingFang SC", sans-serif';
      ctx.fillText('完成第一局后，比分与棋路会留在这里。', w / 2, emptyY + 91, cardW - 24);
      ctx.restore();
      this.registerButton(ctx, 'btn_records_first_game', cardX + 16, emptyY + (compact ? 112 : 118), cardW - 32, 40, '去下一局', {
        bg: COLORS.felt,
        color: COLORS.white,
        fontSize: 13,
        onClick: () => this.navigateTo('mode_select'),
      });
    } else {
      records.slice(0, maxRows).forEach((record, index) => {
        const y = listY + index * (rowH + gap);
        const modeText = record.mode === 'ai' ? '人机闯关' : record.mode === 'online' ? '好友对弈' : '同屏切磋';
        const resultText = record.winner === 'DRAW'
          ? '和棋'
          : record.winner === Piece.Black ? '黑胜' : '白胜';
        const date = new Date(record.finishedAt);
        const dateText = `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
        ctx.save();
        ctx.fillStyle = COLORS.paperLight;
        this.roundRect(ctx, cardX, y, cardW, rowH, 3);
        ctx.fill();
        ctx.strokeStyle = COLORS.line;
        ctx.stroke();
        ctx.fillStyle = COLORS.vermilion;
        ctx.fillRect(cardX, y, 3, rowH);
        ctx.textAlign = 'left';
        ctx.fillStyle = COLORS.ink;
        ctx.font = `600 ${compact ? 13 : 15}px "Songti SC", serif`;
        ctx.fillText(`${modeText}  ·  ${resultText}`, cardX + 14, y + (compact ? 17 : 20));
        ctx.fillStyle = COLORS.muted;
        ctx.font = '9px "PingFang SC", sans-serif';
        ctx.fillText(`${dateText} · ${record.steps} 手 · 最大翻 ${record.maxFlip} 子`, cardX + 14, y + rowH - (compact ? 12 : 15));
        ctx.textAlign = 'right';
        ctx.fillStyle = COLORS.ink;
        ctx.font = `600 ${compact ? 16 : 19}px "Songti SC", serif`;
        ctx.fillText(`${record.black} : ${record.white}`, cardX + cardW - 14, y + rowH / 2);
        ctx.restore();
        this.hitBoxes.push({
          id: `record_${record.id}`,
          x: cardX,
          y,
          w: cardW,
          h: rowH,
          onClick: () => this.anim.showToast(`${modeText} · ${resultText} · ${record.steps} 手`),
        });
      });
    }
    this.renderBottomNav(ctx, w, h, 'records');
  }

  private renderChaptersPage(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ): void {
    this.addHeader(ctx, w, '章节练习', () => this.navigateTo('home'), 'CHAPTER ROUTE');
    const compact = h < 640;
    const cardX = 20;
    const cardW = w - 40;
    const introY = compact ? 78 : 86;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.muted;
    ctx.font = '10px "PingFang SC", sans-serif';
    ctx.fillText('翻盘入门 · 二十章棋谱', cardX, introY);
    ctx.fillStyle = COLORS.ink;
    ctx.font = `600 ${compact ? 20 : 26}px "Songti SC", "STSong", serif`;
    ctx.fillText('棋路，一步步来。', cardX, introY + (compact ? 26 : 32));
    ctx.fillStyle = COLORS.muted;
    ctx.font = '10px "PingFang SC", sans-serif';
    ctx.fillText('从夹住第一枚棋子，到守住最后一个角。', cardX, introY + (compact ? 45 : 56), cardW);
    ctx.restore();

    const gridY = introY + (compact ? 59 : 73);
    const columns = 4;
    const gap = compact ? 6 : 8;
    const cellW = (cardW - gap * (columns - 1)) / columns;
    const cellH = compact ? 48 : 57;
    for (let stageId = 1; stageId <= STAGES_CONFIG.length; stageId++) {
      const stage = getStageConfig(stageId);
      const col = (stageId - 1) % columns;
      const row = Math.floor((stageId - 1) / columns);
      const x = cardX + col * (cellW + gap);
      const y = gridY + row * (cellH + gap);
      const open = stageId <= this.maxOpenStage();
      const cleared = stageId <= this.progress.maxClearedStage;
      this.registerButton(ctx, `chapter_stage_${stageId}`, x, y, cellW, cellH, `${stageId}`.padStart(2, '0'), {
        bg: cleared ? COLORS.felt : open ? COLORS.paperLight : '#ddd7ca',
        border: open && !cleared ? COLORS.vermilion : COLORS.line,
        color: cleared ? COLORS.white : open ? COLORS.ink : COLORS.muted,
        fontSize: compact ? 13 : 15,
        subLabel: cleared ? '已通' : open ? '挑战' : '未解锁',
        disabled: !open,
        onClick: () => {
          this.targetMode = 'ai';
          this.selectedStageId = stageId;
          this.startMatch('ai', stageId);
        },
      });
    }

    const nextY = gridY + 5 * (cellH + gap) + (compact ? 2 : 8);
    const nextStage = getStageConfig(this.maxOpenStage());
    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.ink;
    ctx.font = `600 ${compact ? 12 : 14}px "Songti SC", serif`;
    ctx.fillText(`下一站 · ${nextStage.name}`, cardX, nextY + 12, cardW);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '9px "PingFang SC", sans-serif';
    ctx.fillText(`首通奖励 · ${nextStage.rewardTitle}`, cardX, nextY + 30, cardW);
    ctx.restore();
    this.renderBottomNav(ctx, w, h, 'home');
  }
}
