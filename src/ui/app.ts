/**
 * 7 大页面状态机、Canvas 2D 渲染器与点击热区控制器
 *
 * 页面清单（严格固定 7 个页面，不膨胀）：
 * 1. home：主页（开始游戏、技能图鉴入口、我的进度；一句口号 + 一个翻盘动图做视觉钩子）
 * 2. mode_select：模式选择（人机挑战 20 关 / 双人同屏 / 好友联机）
 * 3. skill_select：选技能页（6 选 3，每个技能一句话说明+消耗；有关卡锁定时置灰显示解锁条件）
 * 4. match：对局页（棋盘、双方头像/子数、能量条、3 个技能按钮、回合提示、认输/重开）
 * 5. online_room：好友房（创建房 6 位房间号+复制/分享按钮、加入房输房间号、等待页双方头像/技能预览/准备状态）
 * 6. result：结算页（胜负、子数比分、本局最大翻盘步高亮、再来一局/分享战绩）
 * 7. codex：技能图鉴页（6 技能说明 + 能量规则，同时充当新手教程）
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
  loadLocalProgress,
  OnlineRoomClient,
  recordStageWin,
  RoomDocument,
  saveLocalProgress,
  UserProgress,
} from '../net';
import { AnimationManager } from './animations';
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
  | 'result'
  | 'codex';

export interface HitBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  onClick: () => void;
}

export class GameApp {
  public currentPage: PageId = 'home';
  public targetMode: GameMode = 'ai';
  public selectedStageId = 1;
  public progress: UserProgress;
  public gameState: GameState;
  public anim: AnimationManager;
  public hitBoxes: HitBox[] = [];

  // 好友房联机状态
  public onlineClient: OnlineRoomClient;
  public guestSimClient: OnlineRoomClient; // 用于单机一键模拟好友加入测试
  public currentRoom: RoomDocument | null = null;
  public inputRoomCode = '';
  public shareCardNotice = '';

  constructor() {
    this.progress = loadLocalProgress();
    this.anim = new AnimationManager();
    this.onlineClient = new OnlineRoomClient('wx_player_host', '我方棋手');
    this.guestSimClient = new OnlineRoomClient('wx_player_guest', '受邀好友');
    this.gameState = createGame({
      mode: 'local2p',
      blackSkills: this.progress.equippedSkills,
    });
  }

  /**
   * 跳转到指定页面
   */
  navigateTo(page: PageId): void {
    this.currentPage = page;
    this.shareCardNotice = '';
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
      this.anim.showToast(`🔒 通关第 ${cfg.unlockStage} 关解锁【${cfg.name}】`);
      return false;
    }

    const maxSlots =
      this.targetMode === 'ai'
        ? getStageConfig(this.selectedStageId).playerSkillSlots
        : MAX_EQUIPPED_SKILLS;

    const current = [...this.progress.equippedSkills];
    const idx = current.indexOf(skillId);
    if (idx >= 0) {
      if (current.length <= 1) {
        this.anim.showToast('至少保留 1 个携带技能');
        return false;
      }
      current.splice(idx, 1);
    } else {
      if (current.length >= maxSlots) {
        current.shift();
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
    this.targetMode = mode;
    this.selectedStageId = stageId;

    if (mode === 'ai') {
      const stage = getStageConfig(stageId);
      const equipped = this.progress.equippedSkills.slice(
        0,
        stage.playerSkillSlots
      );
      this.gameState = createGame({
        mode: 'ai',
        stageId,
        blackSkills: equipped,
        whiteSkills: stage.aiSkills,
        blackInitialEnergy: stage.playerInitialEnergy,
        whiteInitialEnergy: stage.aiInitialEnergy,
      });
    } else if (mode === 'local2p') {
      const equipped = this.progress.equippedSkills.slice(0, 3);
      this.gameState = createGame({
        mode: 'local2p',
        blackSkills: equipped,
        whiteSkills: equipped,
        blackInitialEnergy: 10,
        whiteInitialEnergy: 10,
      });
    } else {
      // 联机模式：若已有房间状态则使用房间内 gameState
      if (this.currentRoom?.gameState) {
        this.gameState = this.currentRoom.gameState;
      } else {
        this.gameState = createGame({
          mode: 'online',
          blackSkills: this.progress.equippedSkills.slice(0, 3),
          whiteSkills: ['bomb', 'shield', 'wait'],
        });
      }
    }

    this.anim.consumeEvents(this.gameState.lastEvents);
    this.navigateTo('match');
  }

  /**
   * 处理对局页点击技能按钮
   */
  handleSkillButtonClick(skillId: SkillId): void {
    if (this.gameState.isGameOver) return;
    const player = this.gameState.currentPlayer;

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
      const res = useWaitSkill(this.gameState);
      if (!res.ok) {
        this.anim.showToast(res.reason ?? '无法使用该技能');
        return;
      }
      this.gameState = res.state;
      this.anim.consumeEvents(this.gameState.lastEvents);
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
      this.anim.consumeEvents(this.gameState.lastEvents);
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
    if (this.gameState.isGameOver) return;
    if (
      this.gameState.mode === 'ai' &&
      this.gameState.currentPlayer === Piece.White
    ) {
      return; // AI 回合禁止玩家点棋盘
    }

    const res = applyBoardAction(this.gameState, row, col);
    this.gameState = res.state;
    if (!res.ok) {
      if (res.reason) {
        this.anim.showToast(res.reason);
      }
      return;
    }

    this.anim.consumeEvents(this.gameState.lastEvents);
    this.checkPostTurnFlow();
  }

  /**
   * 检查回合后流转：AI 自动应答、终局自动结算与跳转
   */
  checkPostTurnFlow(): void {
    if (this.gameState.isGameOver) {
      this.onGameFinished();
      return;
    }

    // 若是人机模式且轮到白方（AI），执行 AI 行动
    if (
      this.gameState.mode === 'ai' &&
      this.gameState.currentPlayer === Piece.White &&
      !this.gameState.isGameOver
    ) {
      const stage = getStageConfig(this.selectedStageId);
      let safety = 0;
      while (
        !this.gameState.isGameOver &&
        this.gameState.currentPlayer === Piece.White &&
        safety < 6
      ) {
        safety++;
        this.gameState = executeAITurn(this.gameState, stage.aiLevel);
        this.anim.consumeEvents(this.gameState.lastEvents);
      }
      if (this.gameState.isGameOver) {
        this.onGameFinished();
      }
    }
  }

  private onGameFinished(): void {
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
      this.progress.totalGames += 1;
      if (this.gameState.winner === Piece.Black) {
        this.progress.totalWins += 1;
      }
      if (maxFlip > this.progress.biggestFlipRecord) {
        this.progress.biggestFlipRecord = maxFlip;
      }
      saveLocalProgress(this.progress);
    }
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
    const roomQuery = this.currentRoom ? `roomId=${this.currentRoom.roomId}` : 'from=share';

    const title =
      flipNum >= 4
        ? `明明只剩几个子，我一步狂翻 ${flipNum} 子惊天逆转！敢来挑战吗？`
        : `《技能黑白棋·翻盘棋》比分 ${counts.black}:${counts.white}，快来一决高下！`;

    const highlightStepText = biggest
      ? `第 ${biggest.stepIndex} 步 · ${biggest.description}`
      : '本局稳扎稳打拿下胜利';

    this.shareCardNotice = `✅ 已拉起微信好友分享卡片：「${title}」`;
    this.anim.showToast('📤 战绩分享卡已生成，好友点击可直接进入小游戏！');

    const g = globalThis as unknown as {
      wx?: {
        shareAppMessage?: (opts: { title: string; query: string }) => void;
      };
    };
    if (g.wx && typeof g.wx.shareAppMessage === 'function') {
      try {
        g.wx.shareAppMessage({ title, query: roomQuery });
      } catch {
        // ignore
      }
    }

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
    screenHeight: number
  ): boolean {
    // 1. 先检查当前页面注册的按钮 HitBoxes（从上层到下层逆序匹配）
    for (let i = this.hitBoxes.length - 1; i >= 0; i--) {
      const box = this.hitBoxes[i];
      if (
        px >= box.x &&
        px <= box.x + box.w &&
        py >= box.y &&
        py <= box.y + box.h
      ) {
        box.onClick();
        return true;
      }
    }

    // 2. 若在对局页，检查是否点击在 8x8 棋盘内
    if (this.currentPage === 'match') {
      const rect = computeBoardRect(screenWidth, screenHeight);
      const coord = pixelToBoardCoord(px, py, rect);
      if (coord) {
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
      onClick: () => void;
    }
  ): void {
    const bg = options.disabled ? '#2a2f3a' : options.bg ?? '#eab308';
    const color = options.disabled ? '#6b7280' : options.color ?? '#0f172a';
    const fontSize = options.fontSize ?? 15;

    ctx.save();
    ctx.fillStyle = bg;
    this.roundRect(ctx, x, y, w, h, 10);
    ctx.fill();

    if (options.border) {
      ctx.strokeStyle = options.border;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.fillStyle = color;
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (options.subLabel) {
      ctx.fillText(label, x + w / 2, y + h / 2 - 8);
      ctx.font = `${Math.max(10, fontSize - 4)}px -apple-system, sans-serif`;
      ctx.fillStyle = options.disabled ? '#6b7280' : '#cbd5e1';
      ctx.fillText(options.subLabel, x + w / 2, y + h / 2 + 10);
    } else {
      ctx.fillText(label, x + w / 2, y + h / 2);
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

  /**
   * 渲染主入口：根据 currentPage 绘制对应页面
   */
  render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    nowMs = Date.now()
  ): void {
    this.hitBoxes = [];
    this.anim.cleanup(nowMs);

    // 全局深色质感背景
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(1, '#1e293b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

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
      case 'result':
        this.renderResultPage(ctx, width, height, nowMs);
        break;
      case 'codex':
        this.renderCodexPage(ctx, width, height);
        break;
    }

    // 顶部浮动提示 Toast
    if (this.anim.toastMessage) {
      ctx.save();
      const tw = Math.min(width - 32, 330);
      const tx = (width - tw) / 2;
      const ty = 52;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      this.roundRect(ctx, tx, ty, tw, 36, 18);
      ctx.fill();
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 13px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.anim.toastMessage.text, width / 2, ty + 18);
      ctx.restore();
    }
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
    ctx.save();
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 28px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('技能黑白棋 · 翻盘棋', w / 2, h * 0.14);

    // 口号钩子
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 15px -apple-system, sans-serif';
    ctx.fillText('“明明只剩 3 个子，一步全翻回来！”', w / 2, h * 0.19);

    // 翻盘动态演示视觉钩子（5颗棋子循环上演炸弹+连翻动效）
    const demoY = h * 0.31;
    const demoW = Math.min(w - 48, 300);
    const demoX = (w - demoW) / 2;
    ctx.fillStyle = '#064e3b';
    this.roundRect(ctx, demoX, demoY - 42, demoW, 84, 14);
    ctx.fill();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.stroke();

    const cycle = (nowMs % 3000) / 3000; // 3秒一次翻盘循环
    for (let i = 0; i < 5; i++) {
      const cx = demoX + 35 + i * ((demoW - 70) / 4);
      const flipMoment = 0.2 + i * 0.12;
      const isFlippedToBlack = cycle >= flipMoment;
      const localScale =
        Math.abs(cycle - flipMoment) < 0.08
          ? Math.max(0.15, Math.abs(Math.cos(((cycle - flipMoment) / 0.08) * Math.PI)))
          : 1;

      ctx.save();
      ctx.translate(cx, demoY);
      ctx.scale(localScale, 1);
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fillStyle = isFlippedToBlack ? '#111827' : '#f8fafc';
      ctx.fill();
      ctx.strokeStyle = isFlippedToBlack ? '#facc15' : '#94a3b8';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // 我的进度卡片
    const cardW = Math.min(w - 48, 300);
    const cardX = (w - cardW) / 2;
    const cardY = h * 0.44;
    ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
    this.roundRect(ctx, cardX, cardY, cardW, 74, 12);
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px -apple-system, sans-serif';
    ctx.fillText(
      `我的进度：已通关 ${this.progress.maxClearedStage}/20 关 ｜ 胜场 ${this.progress.totalWins}`,
      w / 2,
      cardY + 26
    );
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(
      `单步最大翻盘记录：${this.progress.biggestFlipRecord} 子 ｜ 称号：${
        this.progress.titles[this.progress.titles.length - 1]
      }`,
      w / 2,
      cardY + 50
    );
    ctx.restore();

    // 按钮区
    const btnW = Math.min(w - 64, 260);
    const btnX = (w - btnW) / 2;
    this.registerButton(ctx, 'btn_start', btnX, h * 0.6, btnW, 52, '🎮 开始游戏', {
      bg: '#eab308',
      color: '#0f172a',
      fontSize: 18,
      onClick: () => this.navigateTo('mode_select'),
    });

    this.registerButton(
      ctx,
      'btn_codex',
      btnX,
      h * 0.69,
      btnW,
      46,
      '📖 技能图鉴 & 能量规则',
      {
        bg: '#334155',
        color: '#f8fafc',
        border: '#475569',
        onClick: () => this.navigateTo('codex'),
      }
    );

    this.registerButton(
      ctx,
      'btn_quick_skills',
      btnX,
      h * 0.77,
      btnW,
      46,
      '⚡ 配置携带技能 (6选3)',
      {
        bg: '#1e293b',
        color: '#38bdf8',
        border: '#0284c7',
        onClick: () => {
          this.targetMode = 'local2p';
          this.navigateTo('skill_select');
        },
      }
    );
  }

  /**
   * 页面 2：模式选择（人机挑战 20 关 / 双人同屏 / 好友联机）
   */
  private renderModeSelectPage(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ): void {
    this.registerButton(ctx, 'btn_back_home', 16, 16, 72, 34, '← 返回', {
      bg: '#334155',
      color: '#f8fafc',
      fontSize: 13,
      onClick: () => this.navigateTo('home'),
    });

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 22px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('选择对战模式', w / 2, 38);

    const cardW = Math.min(w - 40, 320);
    const cardX = (w - cardW) / 2;

    // 1. 人机挑战 + 关卡切换器
    const stageCfg = getStageConfig(this.selectedStageId);
    ctx.fillStyle = '#1e293b';
    this.roundRect(ctx, cardX, 74, cardW, 145, 12);
    ctx.fill();
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#fef08a';
    ctx.font = 'bold 16px -apple-system, sans-serif';
    ctx.fillText(`🤖 人机闯关（共 20 关）`, w / 2, 98);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '14px -apple-system, sans-serif';
    ctx.fillText(`${stageCfg.name} [${stageCfg.aiLevel}]`, w / 2, 122);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px -apple-system, sans-serif';
    ctx.fillText(stageCfg.subtitle, w / 2, 142);

    this.registerButton(ctx, 'stage_prev', cardX + 14, 160, 68, 38, '上一关', {
      bg: '#334155',
      color: '#f8fafc',
      fontSize: 13,
      onClick: () => {
        this.selectedStageId =
          this.selectedStageId > 1 ? this.selectedStageId - 1 : 20;
      },
    });

    this.registerButton(
      ctx,
      'btn_mode_ai',
      cardX + 92,
      160,
      cardW - 184,
      38,
      '进入选技开战',
      {
        bg: '#eab308',
        color: '#0f172a',
        fontSize: 14,
        onClick: () => {
          this.targetMode = 'ai';
          this.navigateTo('skill_select');
        },
      }
    );

    this.registerButton(
      ctx,
      'stage_next',
      cardX + cardW - 82,
      160,
      68,
      38,
      '下一关',
      {
        bg: '#334155',
        color: '#f8fafc',
        fontSize: 13,
        onClick: () => {
          this.selectedStageId =
            this.selectedStageId < 20 ? this.selectedStageId + 1 : 1;
        },
      }
    );

    // 2. 双人同屏
    this.registerButton(
      ctx,
      'btn_mode_local2p',
      cardX,
      245,
      cardW,
      72,
      '👥 双人同屏对战',
      {
        bg: '#0284c7',
        color: '#f8fafc',
        fontSize: 18,
        subLabel: '面对面同机博弈 · 六大逆转技能全开',
        onClick: () => {
          this.targetMode = 'local2p';
          this.navigateTo('skill_select');
        },
      }
    );

    // 3. 好友房联机
    this.registerButton(
      ctx,
      'btn_mode_online',
      cardX,
      340,
      cardW,
      72,
      '🌐 好友房联机对战',
      {
        bg: '#059669',
        color: '#f8fafc',
        fontSize: 18,
        subLabel: '6位房间号邀好友 · 云端防作弊同步',
        onClick: () => {
          this.targetMode = 'online';
          this.navigateTo('online_room');
        },
      }
    );

    // 关卡列表速览
    ctx.fillStyle = '#64748b';
    ctx.font = '12px -apple-system, sans-serif';
    ctx.fillText(
      `首通奖励：${stageCfg.rewardTitle}（共 ${STAGES_CONFIG.length} 关可自由挑战）`,
      w / 2,
      445
    );
  }

  /**
   * 页面 3：选技能页（6 选 3，每个技能一句话说明+消耗；有关卡锁定时置灰显示解锁条件）
   */
  private renderSkillSelectPage(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ): void {
    this.registerButton(ctx, 'btn_back_mode', 16, 16, 72, 34, '← 返回', {
      bg: '#334155',
      color: '#f8fafc',
      fontSize: 13,
      onClick: () => this.navigateTo('mode_select'),
    });

    const maxSlots =
      this.targetMode === 'ai'
        ? getStageConfig(this.selectedStageId).playerSkillSlots
        : MAX_EQUIPPED_SKILLS;

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 20px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`选择携带技能 (已选 ${this.progress.equippedSkills.length}/${maxSlots})`, w / 2, 36);

    const cardW = Math.min(w - 32, 340);
    const cardX = (w - cardW) / 2;
    let startY = 64;
    const itemH = Math.min(68, Math.floor((h - 155) / 6) - 6);

    for (const skillId of ALL_SKILL_IDS) {
      const cfg = SKILLS_CONFIG[skillId];
      const isUnlocked =
        this.progress.unlockedSkills.includes(skillId) ||
        this.progress.maxClearedStage >= cfg.unlockStage;
      const isEquipped = this.progress.equippedSkills.includes(skillId);

      const subText = isUnlocked
        ? cfg.shortDesc
        : `🔒 通关第 ${cfg.unlockStage} 关解锁（${cfg.shortDesc}）`;

      this.registerButton(
        ctx,
        `skill_item_${skillId}`,
        cardX,
        startY,
        cardW,
        itemH,
        `${isEquipped ? '✅ ' : ''}${cfg.name}  [消耗 ${cfg.cost} 能量]`,
        {
          bg: !isUnlocked ? '#1e293b' : isEquipped ? '#065f46' : '#334155',
          border: isEquipped ? '#34d399' : '#475569',
          color: !isUnlocked ? '#64748b' : '#f8fafc',
          fontSize: 14,
          subLabel: subText,
          onClick: () => this.toggleSkillEquip(skillId),
        }
      );

      startY += itemH + 8;
    }

    this.registerButton(
      ctx,
      'btn_confirm_start_match',
      cardX,
      h - 68,
      cardW,
      48,
      '🔥 确认技能 · 立即开局',
      {
        bg: '#eab308',
        color: '#0f172a',
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

    // 顶部退出/重开/认输按钮栏
    this.registerButton(ctx, 'btn_match_exit', 12, 12, 64, 30, '← 退出', {
      bg: '#334155',
      color: '#f8fafc',
      fontSize: 12,
      onClick: () => this.navigateTo('mode_select'),
    });

    this.registerButton(
      ctx,
      'btn_match_restart',
      w - 144,
      12,
      62,
      30,
      '重开',
      {
        bg: '#334155',
        color: '#f8fafc',
        fontSize: 12,
        onClick: () => this.startMatch(state.mode, this.selectedStageId),
      }
    );

    this.registerButton(
      ctx,
      'btn_match_surrender',
      w - 74,
      12,
      62,
      30,
      '认输',
      {
        bg: '#7f1d1d',
        color: '#fecaca',
        fontSize: 12,
        onClick: () => {
          this.gameState = surrenderGame(this.gameState, Piece.Black);
          this.anim.consumeEvents(this.gameState.lastEvents);
          this.onGameFinished();
          this.navigateTo('result');
        },
      }
    );

    // 顶部双方头像、子数、能量条面板
    const panelY = 50;
    const panelW = w - 24;
    ctx.save();
    ctx.fillStyle = '#1e293b';
    this.roundRect(ctx, 12, panelY, panelW, 68, 12);
    ctx.fill();

    // 黑方信息（左）
    ctx.fillStyle =
      state.currentPlayer === Piece.Black ? '#facc15' : '#cbd5e1';
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`⚫ 黑方: ${counts.black} 子`, 24, panelY + 24);
    ctx.fillStyle = '#38bdf8';
    ctx.font = '12px -apple-system, sans-serif';
    ctx.fillText(
      `能量 ${bPlayer.energy}/${ENERGY_CONFIG.maxEnergy}`,
      24,
      panelY + 46
    );

    // 白方信息（右）
    const whiteLabel =
      state.mode === 'ai'
        ? `⚪ AI(${getStageConfig(this.selectedStageId).aiLevel}): ${counts.white} 子`
        : `⚪ 白方: ${counts.white} 子`;
    ctx.fillStyle =
      state.currentPlayer === Piece.White ? '#facc15' : '#cbd5e1';
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(whiteLabel, w - 24, panelY + 24);
    ctx.fillStyle = '#38bdf8';
    ctx.font = '12px -apple-system, sans-serif';
    ctx.fillText(
      `能量 ${wPlayer.energy}/${ENERGY_CONFIG.maxEnergy}`,
      w - 24,
      panelY + 46
    );

    // 中央当前回合提示
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fef08a';
    ctx.font = 'bold 14px -apple-system, sans-serif';
    const turnText = state.isGameOver
      ? '🏁 对局结束'
      : state.currentPlayer === Piece.Black
      ? '👉 黑方思考中'
      : '👉 白方思考中';
    ctx.fillText(turnText, w / 2, panelY + 34);
    ctx.restore();

    // 8×8 棋盘渲染
    const rect = computeBoardRect(w, h);
    ctx.save();
    ctx.fillStyle = '#065f46';
    this.roundRect(ctx, rect.x - 6, rect.y - 6, rect.size + 12, rect.size + 12, 10);
    ctx.fill();
    ctx.strokeStyle = '#047857';
    ctx.lineWidth = 3;
    ctx.stroke();

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

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cx = rect.x + c * rect.cellSize;
        const cy = rect.y + r * rect.cellSize;

        ctx.fillStyle = (r + c) % 2 === 0 ? '#047857' : '#065f46';
        ctx.fillRect(cx, cy, rect.cellSize, rect.cellSize);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx, cy, rect.cellSize, rect.cellSize);

        const key = `${r},${c}`;
        const center = boardCoordToPixelCenter(r, c, rect);
        const piece = state.board[r][c];

        // 技能目标高亮圈
        if (skillTargetSet.has(key)) {
          ctx.beginPath();
          ctx.arc(center.cx, center.cy, rect.cellSize * 0.42, 0, Math.PI * 2);
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
        // 合法落子提示绿点
        else if (piece === Piece.Empty && validSet.has(key)) {
          ctx.beginPath();
          ctx.arc(center.cx, center.cy, rect.cellSize * 0.14, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(167, 243, 208, 0.65)';
          ctx.fill();
        }

        // 渲染棋子（结合翻子动画 scaleX）
        if (piece !== Piece.Empty) {
          const flipAnim = this.anim.getPieceFlipState(r, c, piece, nowMs);
          const radius = rect.cellSize * 0.38;

          ctx.save();
          ctx.translate(center.cx, center.cy);
          ctx.scale(flipAnim.scaleX, 1);

          ctx.beginPath();
          ctx.arc(0, 0, radius, 0, Math.PI * 2);
          ctx.fillStyle =
            flipAnim.displayColor === Piece.Black ? '#0f172a' : '#f8fafc';
          ctx.fill();
          ctx.strokeStyle =
            flipAnim.displayColor === Piece.Black ? '#475569' : '#cbd5e1';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // 金身子金色光环护盾标识
          if (state.shielded[r][c]) {
            ctx.beginPath();
            ctx.arc(0, 0, radius + 3, 0, Math.PI * 2);
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 3;
            ctx.stroke();
          }

          ctx.restore();
        }
      }
    }

    // 动画 2：渲染炸弹子十字爆炸特效帧
    for (const bomb of this.anim.bombExplosions) {
      const progress = Math.min(
        1,
        Math.max(0, (nowMs - bomb.startTimeMs) / bomb.durationMs)
      );
      const centerPx = boardCoordToPixelCenter(
        bomb.center.row,
        bomb.center.col,
        rect
      );
      ctx.save();
      ctx.strokeStyle = `rgba(249, 115, 22, ${1 - progress})`;
      ctx.lineWidth = 5 * (1 - progress * 0.5);
      ctx.beginPath();
      ctx.arc(
        centerPx.cx,
        centerPx.cy,
        rect.cellSize * (0.3 + progress * 1.4),
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // 底部 3 个技能按钮栏（无合法落子时：只能用求你等我或 pass，炸弹/双子自动置灰）
    const activePState = state.players[activePlayer];
    const skills = activePState.equippedSkills.slice(0, 3);
    const btnY = rect.y + rect.size + 18;
    const gap = 10;
    const btnW = Math.floor((w - 24 - gap * 2) / 3);

    skills.forEach((skillId, idx) => {
      const cfg = SKILLS_CONFIG[skillId];
      const check = canUseSkill(state, activePlayer, skillId);
      const isSelected = state.selectedSkill?.skillId === skillId;
      const bx = 12 + idx * (btnW + gap);

      this.registerButton(
        ctx,
        `match_skill_${skillId}`,
        bx,
        btnY,
        btnW,
        54,
        `${cfg.name} (${cfg.cost})`,
        {
          bg: isSelected ? '#eab308' : '#1e293b',
          border: isSelected ? '#fef08a' : '#38bdf8',
          color: isSelected ? '#0f172a' : '#f8fafc',
          fontSize: 13,
          subLabel: check.usable
            ? isSelected
              ? '点击取消'
              : '点击发动'
            : check.reason ?? '不可用',
          disabled: !check.usable && !isSelected,
          onClick: () => this.handleSkillButtonClick(skillId),
        }
      );
    });

    // 若当前无合法落子，额外显示醒目的「跳过回合 (Pass)」按钮
    if (!state.isGameOver && validMoves.length === 0) {
      this.registerButton(
        ctx,
        'btn_match_pass',
        (w - 180) / 2,
        btnY + 64,
        180,
        40,
        '⏭️ 无子可下 · 跳过回合',
        {
          bg: '#f59e0b',
          color: '#0f172a',
          fontSize: 14,
          onClick: () => {
            const pRes = passTurn(this.gameState);
            if (pRes.ok) {
              this.gameState = pRes.state;
              this.anim.consumeEvents(this.gameState.lastEvents);
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
        '✅ 同意等TA',
        {
          bg: '#10b981',
          color: '#0f172a',
          fontSize: 13,
          onClick: () => {
            const r = respondToWaitSkill(this.gameState, true);
            if (r.ok) {
              this.gameState = r.state;
              this.anim.consumeEvents(this.gameState.lastEvents);
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
        '❌ 拒绝请求',
        {
          bg: '#ef4444',
          color: '#f8fafc',
          fontSize: 13,
          onClick: () => {
            const r = respondToWaitSkill(this.gameState, false);
            if (r.ok) {
              this.gameState = r.state;
              this.anim.consumeEvents(this.gameState.lastEvents);
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
        '🏆 查看终局结算 & 最大翻盘步',
        {
          bg: '#eab308',
          color: '#0f172a',
          fontSize: 15,
          onClick: () => this.navigateTo('result'),
        }
      );
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
    this.registerButton(ctx, 'btn_back_mode_from_room', 16, 16, 72, 34, '← 返回', {
      bg: '#334155',
      color: '#f8fafc',
      fontSize: 13,
      onClick: () => this.navigateTo('mode_select'),
    });

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 22px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('好友房联机对战', w / 2, 38);

    const cardW = Math.min(w - 40, 320);
    const cardX = (w - cardW) / 2;

    if (!this.currentRoom) {
      this.registerButton(
        ctx,
        'btn_create_room',
        cardX,
        90,
        cardW,
        56,
        '🏠 创建 6 位好友房',
        {
          bg: '#10b981',
          color: '#0f172a',
          fontSize: 17,
          subLabel: '生成 6 位房间号并分享给微信好友',
          onClick: async () => {
            const res = await this.onlineClient.createRoom(
              this.progress.equippedSkills
            );
            if (res.ok && res.data) {
              this.currentRoom = res.data;
              this.inputRoomCode = res.data.roomId;
              this.anim.showToast(`房间创建成功：${res.data.roomId}`);
            }
          },
        }
      );

      this.registerButton(
        ctx,
        'btn_join_room',
        cardX,
        170,
        cardW,
        56,
        `🔑 输入房间号加入 ${this.inputRoomCode ? `(${this.inputRoomCode})` : ''}`,
        {
          bg: '#0284c7',
          color: '#f8fafc',
          fontSize: 16,
          subLabel: '输入好友发来的 6 位数字房间号',
          onClick: async () => {
            if (!this.inputRoomCode) {
              const created = await this.onlineClient.createRoom(
                this.progress.equippedSkills
              );
              if (created.ok && created.data) {
                this.inputRoomCode = created.data.roomId;
              }
            }
            const res = await this.guestSimClient.joinRoom(
              this.inputRoomCode,
              ['bomb', 'shield', 'wait']
            );
            if (res.ok && res.data) {
              this.currentRoom = res.data;
              this.startMatch('online');
            } else {
              this.anim.showToast(res.error ?? '加入失败');
            }
          },
        }
      );
    } else {
      // 等待页：展示 6 位房间号、复制/分享按钮、双方头像、技能预览与准备状态
      ctx.fillStyle = '#1e293b';
      this.roundRect(ctx, cardX, 75, cardW, 210, 14);
      ctx.fill();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 24px -apple-system, sans-serif';
      ctx.fillText(`房间号：${this.currentRoom.roomId}`, w / 2, 112);

      ctx.fillStyle = '#f8fafc';
      ctx.font = '14px -apple-system, sans-serif';
      ctx.fillText(
        `⚫ 房主：${this.currentRoom.hostInfo.nickname} [已准备]`,
        w / 2,
        150
      );
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px -apple-system, sans-serif';
      ctx.fillText(
        `携带技能：${this.currentRoom.hostInfo.equippedSkills
          .map((id) => SKILLS_CONFIG[id].name)
          .join(' / ')}`,
        w / 2,
        172
      );

      const guestText = this.currentRoom.guestInfo
        ? `⚪ 房客：${this.currentRoom.guestInfo.nickname} [已准备]`
        : '⚪ 房客：等待好友加入中...';
      ctx.fillStyle = this.currentRoom.guestInfo ? '#34d399' : '#fbbf24';
      ctx.font = '14px -apple-system, sans-serif';
      ctx.fillText(guestText, w / 2, 212);

      this.registerButton(
        ctx,
        'btn_copy_share_room',
        cardX,
        305,
        cardW,
        48,
        '📋 复制房间号 & 分享给微信好友',
        {
          bg: '#eab308',
          color: '#0f172a',
          fontSize: 15,
          onClick: () => {
            this.anim.showToast(`已复制房间号 ${this.currentRoom?.roomId} 并唤起分享`);
          },
        }
      );

      this.registerButton(
        ctx,
        'btn_sim_friend_join',
        cardX,
        368,
        cardW,
        48,
        '🚀 模拟好友加入并立即开局',
        {
          bg: '#10b981',
          color: '#0f172a',
          fontSize: 15,
          onClick: async () => {
            if (!this.currentRoom) return;
            const res = await this.guestSimClient.joinRoom(
              this.currentRoom.roomId,
              ['bomb', 'shield', 'wait']
            );
            if (res.ok && res.data) {
              this.currentRoom = res.data;
              this.startMatch('online');
            }
          },
        }
      );
    }
    void h;
  }

  /**
   * 页面 6：结算页（胜负、子数比分滚动动画、本局最大翻盘步高亮、再来一局/分享战绩）
   */
  private renderResultPage(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    nowMs: number
  ): void {
    const counts = countPieces(this.gameState.board);
    const rolled = this.anim.getRolledScores(
      counts.black,
      counts.white,
      nowMs
    );
    const biggest = getBiggestComebackMove(this.gameState);

    const title =
      this.gameState.winner === Piece.Black
        ? '🏆 黑方获胜 · 惊天翻盘！'
        : this.gameState.winner === Piece.White
        ? '⚪ 白方获胜 · 棋高一着！'
        : '🤝 势均力敌 · 平局收场！';

    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 24px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, w / 2, h * 0.14);

    // 动画 3：终局子数滚动结算面板
    const cardW = Math.min(w - 40, 320);
    const cardX = (w - cardW) / 2;
    ctx.fillStyle = '#1e293b';
    this.roundRect(ctx, cardX, h * 0.2, cardW, 100, 14);
    ctx.fill();
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 34px -apple-system, sans-serif';
    ctx.fillText(`⚫ ${rolled.black}  :  ${rolled.white} ⚪`, w / 2, h * 0.2 + 54);

    // 本局最大翻盘步高亮卡片（自动算：单步翻子最多的一步）
    const hlY = h * 0.38;
    ctx.fillStyle = '#064e3b';
    this.roundRect(ctx, cardX, hlY, cardW, 96, 14);
    ctx.fill();
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#6ee7b7';
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.fillText('🔥 本局最大翻盘步高亮 (MVP Step)', w / 2, hlY + 26);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 16px -apple-system, sans-serif';
    if (biggest) {
      ctx.fillText(
        `单步狂翻 ${biggest.flippedCount} 子！`,
        w / 2,
        hlY + 52
      );
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '12px -apple-system, sans-serif';
      ctx.fillText(biggest.description, w / 2, hlY + 76);
    } else {
      ctx.fillText('本局无翻子记录', w / 2, hlY + 56);
    }

    if (this.shareCardNotice) {
      ctx.fillStyle = '#38bdf8';
      ctx.font = '12px -apple-system, sans-serif';
      ctx.fillText(this.shareCardNotice, w / 2, h * 0.57);
    }

    // 再来一局 & 分享战绩按钮
    this.registerButton(
      ctx,
      'btn_result_rematch',
      cardX,
      h * 0.62,
      cardW,
      50,
      '🔄 再来一局',
      {
        bg: '#eab308',
        color: '#0f172a',
        fontSize: 17,
        onClick: () => this.startMatch(this.gameState.mode, this.selectedStageId),
      }
    );

    this.registerButton(
      ctx,
      'btn_result_share',
      cardX,
      h * 0.71,
      cardW,
      50,
      '📤 分享翻盘战绩给好友',
      {
        bg: '#10b981',
        color: '#0f172a',
        fontSize: 16,
        onClick: () => {
          this.generateSharePayload();
        },
      }
    );

    this.registerButton(
      ctx,
      'btn_result_home',
      cardX,
      h * 0.8,
      cardW,
      44,
      '🏠 返回主页',
      {
        bg: '#334155',
        color: '#f8fafc',
        fontSize: 15,
        onClick: () => this.navigateTo('home'),
      }
    );
  }

  /**
   * 页面 7：技能图鉴页（6 技能说明 + 能量规则，同时充当新手教程）
   */
  private renderCodexPage(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ): void {
    this.registerButton(ctx, 'btn_back_home_from_codex', 16, 16, 72, 34, '← 返回', {
      bg: '#334155',
      color: '#f8fafc',
      fontSize: 13,
      onClick: () => this.navigateTo('home'),
    });

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 20px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('技能图鉴 & 能量规则（新手指南）', w / 2, 36);

    const cardW = Math.min(w - 28, 348);
    const cardX = (w - cardW) / 2;

    // 能量规则说明框
    ctx.fillStyle = '#1e293b';
    this.roundRect(ctx, cardX, 58, cardW, 64, 10);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 13px -apple-system, sans-serif';
    ctx.fillText(
      `⚡ 能量规则：每回合初 +${ENERGY_CONFIG.turnStartGain} ｜ 每翻1子 +${ENERGY_CONFIG.perFlipGain} (单回合上限 +${ENERGY_CONFIG.maxGainPerTurn})`,
      w / 2,
      80
    );
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '12px -apple-system, sans-serif';
    ctx.fillText(
      `总能量上限 ${ENERGY_CONFIG.maxEnergy}；落子前点选技能，点空白处可无损取消`,
      w / 2,
      104
    );

    // 六大技能详情列表
    let y = 132;
    const boxH = Math.min(76, Math.floor((h - 148) / 6) - 6);
    for (const id of ALL_SKILL_IDS) {
      const cfg = SKILLS_CONFIG[id];
      ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
      this.roundRect(ctx, cardX, y, cardW, boxH, 8);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.fillStyle = '#facc15';
      ctx.font = 'bold 13px -apple-system, sans-serif';
      ctx.fillText(
        `【${cfg.name}】 消耗: ${cfg.cost}  ${
          cfg.maxUsesPerGame ? `(限 ${cfg.maxUsesPerGame} 次/局)` : ''
        }`,
        cardX + 12,
        y + 20
      );

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.fillText(cfg.shortDesc, cardX + 12, y + 40);

      y += boxH + 6;
    }
  }
}
