import { describe, it, expect, vi } from 'vitest';
import { GameApp, PageId } from '../src/ui';
import { Piece, getBiggestComebackMove } from '../src/core';
import { OnlineRoomClient } from '../src/net';

function createMockCanvasContext(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    createRadialGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'center',
    textBaseline: 'middle',
  } as unknown as CanvasRenderingContext2D;
}

describe('Open Design UI、十页导航、动画与结算战绩分享验收测试', () => {
  it('1. 十个页面渲染与按钮热区导航流转无异常', () => {
    const app = new GameApp();
    const ctx = createMockCanvasContext();
    const W = 375;
    const H = 812;

    const allPages: PageId[] = [
      'home',
      'mode_select',
      'skill_select',
      'match',
      'online_room',
      'join_room',
      'result',
      'codex',
      'records',
      'chapters',
    ];

    for (const page of allPages) {
      app.navigateTo(page);
      expect(app.currentPage).toBe(page);
      app.render(ctx, W, H, 1000);
      expect(app.hitBoxes.length).toBeGreaterThan(0);
    }

    // 从主页点击「开始游戏」进入模式选择页
    app.navigateTo('home');
    app.render(ctx, W, H, 1000);
    const startBtn = app.hitBoxes.find((b) => b.id === 'btn_start');
    expect(startBtn).toBeDefined();
    app.handlePointerTap(startBtn!.x + 10, startBtn!.y + 10, W, H);
    expect(app.currentPage).toBe('mode_select');
  });

  it('2. 三大核心动画验证：翻子翻转动画、炸弹子爆炸帧、终局子数滚动结算', () => {
    const app = new GameApp();
    app.startMatch('local2p');

    // 黑方拥有足够能量释放炸弹子
    app.gameState.players[Piece.Black].energy = 60;
    app.handleSkillButtonClick('bomb');
    expect(app.gameState.selectedSkill?.skillId).toBe('bomb');

    // 点击合法格 (2,3) 触发落子 + 炸弹子爆炸事件
    app.handleBoardCellClick(2, 3);
    expect(app.anim.flipItems.length).toBeGreaterThan(0);
    expect(app.anim.bombExplosions.length).toBe(1);

    // 验证翻子动画中期 scaleX 处于 (0, 1) 缩放区间
    const firstFlip = app.anim.flipItems[0];
    const midState = app.anim.getPieceFlipState(
      firstFlip.row,
      firstFlip.col,
      Piece.Black,
      firstFlip.startTimeMs + firstFlip.durationMs * 0.4
    );
    expect(midState.isAnimating).toBe(true);
    expect(midState.scaleX).toBeLessThan(1);

    // 验证终局子数滚动结算从 0 递增到目标子数
    app.anim.startScoreRoll(42, 22, 2000);
    const rollStart = app.anim.getRolledScores(42, 22, 2000);
    expect(rollStart.black).toBe(0);
    const rollMid = app.anim.getRolledScores(42, 22, 2450);
    expect(rollMid.black).toBeGreaterThan(10);
    expect(rollMid.black).toBeLessThan(42);
    const rollEnd = app.anim.getRolledScores(42, 22, 3000);
    expect(rollEnd).toEqual({ black: 42, white: 22, progress: 1 });
  });

  it('3. 阶段 6 结算与分享验收：自动计算本局最大翻盘步并生成分享卡片', async () => {
    const app = new GameApp();
    app.startMatch('local2p');

    // 第 1 步：黑落 (2,3) 翻 1 子
    app.handleBoardCellClick(2, 3);
    await new Promise((resolve) => setTimeout(resolve, 310));
    // 第 2 步：白落 (2,2) 翻 1 子
    app.handleBoardCellClick(2, 2);
    await new Promise((resolve) => setTimeout(resolve, 310));
    // 第 3 步：黑给足能量释放炸弹子落 (3,2) 翻多子
    app.gameState.players[Piece.Black].energy = 60;
    app.handleSkillButtonClick('bomb');
    app.handleBoardCellClick(3, 2);

    const biggest = getBiggestComebackMove(app.gameState);
    expect(biggest).not.toBeNull();
    expect(biggest!.flippedCount).toBeGreaterThanOrEqual(2);
    expect(biggest!.skillId).toBe('bomb');

    // 生成战绩分享卡
    const sharePayload = app.generateSharePayload();
    expect(sharePayload.title).toContain('技能黑白棋');
    expect(sharePayload.highlightStepText).toContain('炸弹子');
    expect(app.shareCardNotice).toContain('本局战绩');
  });

  it('关卡只开放至最高通关关卡的下一关，误触离开对局会先确认', () => {
    const app = new GameApp();
    app.progress.maxClearedStage = 0;
    app.startMatch('ai', 2);
    expect(app.currentPage).toBe('home');

    app.startMatch('local2p');
    const ctx = createMockCanvasContext();
    app.render(ctx, 375, 812, 1000);
    const exit = app.hitBoxes.find((box) => box.id === 'btn_match_exit')!;
    app.handlePointerTap(exit.x + 5, exit.y + 5, 375, 812);
    expect(app.activeDialog).toBe('exit');

    app.render(ctx, 375, 812, 1001);
    const cancel = app.hitBoxes.find((box) => box.id === 'dialog_cancel')!;
    app.handlePointerTap(cancel.x + 5, cancel.y + 5, 375, 812);
    expect(app.currentPage).toBe('match');
    expect(app.activeDialog).toBeNull();
  });

  it('好友房必须输入有效号码，并在另一位棋手加入后自动进入对局', async () => {
    const host = new GameApp();
    host.onlineClient = new OnlineRoomClient('ui-flow-host', '房主');
    host.navigateTo('online_room');
    const ctx = createMockCanvasContext();
    host.render(ctx, 390, 844, 2000);
    const create = host.hitBoxes.find((box) => box.id === 'btn_create_room')!;
    host.handlePointerTap(create.x + 5, create.y + 5, 390, 844);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(host.currentRoom).not.toBeNull();

    const guest = new GameApp();
    guest.onlineClient = new OnlineRoomClient('ui-flow-guest', '好友');
    guest.navigateTo('online_room');
    for (const digit of host.currentRoom!.roomId) guest.handleKeyInput(digit);
    expect(guest.handleKeyInput('Enter')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(guest.currentPage).toBe('match');
    expect(host.currentPage).toBe('match');

    host.handleBoardCellClick(2, 3);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(guest.gameState.currentPlayer).toBe(Piece.White);
    await new Promise((resolve) => setTimeout(resolve, 310));
    guest.handleBoardCellClick(2, 2);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(host.gameState.currentPlayer).toBe(Piece.Black);

    const previousHostGames = host.progress.totalGames;
    const previousGuestGames = guest.progress.totalGames;
    host.activeDialog = 'surrender';
    host.render(ctx, 390, 844);
    const confirm = host.hitBoxes.find((box) => box.id === 'dialog_confirm')!;
    host.handlePointerTap(confirm.x + 5, confirm.y + 5, 390, 844);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(host.currentPage).toBe('result');
    expect(guest.currentPage).toBe('result');
    expect(host.progress.totalGames).toBe(previousHostGames + 1);
    expect(guest.progress.totalGames).toBe(previousGuestGames + 1);
    expect(host.progress.records.some((record) => record.mode === 'online')).toBe(true);
    expect(guest.progress.records.some((record) => record.mode === 'online')).toBe(true);

    host.onlineClient.stopWatch();
    guest.onlineClient.stopWatch();
  });

  it('窄屏上的各页面操作热区都保留在 568px 可视范围内', () => {
    const app = new GameApp();
    const ctx = createMockCanvasContext();
    const pages: PageId[] = [
      'home',
      'mode_select',
      'skill_select',
      'match',
      'online_room',
      'join_room',
      'result',
      'codex',
      'records',
      'chapters',
    ];
    for (const [width, height] of [[320, 568], [284, 532]]) {
      for (const page of pages) {
        app.navigateTo(page);
        if (page === 'match') app.startMatch('local2p');
        app.render(ctx, width, height, 3000);
        expect(app.hitBoxes.length).toBeGreaterThan(0);
        expect(app.hitBoxes.every((box) => box.y >= 0 && box.y + box.h <= height)).toBe(true);
      }
    }
  });

  it('技能图鉴详情可以关闭，AI 等待翻子动画后才应手', () => {
    const app = new GameApp();
    const ctx = createMockCanvasContext();
    app.navigateTo('codex');
    app.render(ctx, 320, 568);
    const item = app.hitBoxes.find((box) => box.id === 'codex_skill_shield')!;
    app.handlePointerTap(item.x + 4, item.y + 4, 320, 568);
    expect(app.skillDetail).toBe('shield');
    app.render(ctx, 320, 568);
    app.handleKeyInput('Escape');
    expect(app.skillDetail).toBeNull();
    expect(app.currentPage).toBe('codex');

    app.startMatch('ai', 1);
    app.handleBoardCellClick(2, 3);
    expect(app.gameState.currentPlayer).toBe(Piece.White);
    app.render(ctx, 375, 812, Date.now() + 1000);
    expect(app.gameState.currentPlayer).toBe(Piece.Black);
    expect(app.gameState.moveHistory).toHaveLength(2);
  });

  it('主界面和对局内都能开关音效/特效，并写入玩家偏好', () => {
    const app = new GameApp();
    const ctx = createMockCanvasContext();
    app.render(ctx, 390, 844);
    const settings = app.hitBoxes.find((box) => box.id === 'btn_settings')!;
    app.handlePointerTap(settings.x + 2, settings.y + 2, 390, 844);
    app.render(ctx, 390, 844);
    const sound = app.hitBoxes.find((box) => box.id === 'settings_sound')!;
    app.handlePointerTap(sound.x + 2, sound.y + 2, 390, 844);
    expect(app.preferences.sound).toBe(false);
    app.handleKeyInput('Escape');
    expect(app.settingsOpen).toBe(false);

    app.startMatch('local2p');
    app.render(ctx, 390, 844);
    const matchSettings = app.hitBoxes.find((box) => box.id === 'btn_match_settings')!;
    app.handlePointerTap(matchSettings.x + 2, matchSettings.y + 2, 390, 844);
    expect(app.settingsOpen).toBe(true);
    app.render(ctx, 390, 844);
    expect(app.hitBoxes.some((box) => box.id === 'settings_restart')).toBe(true);
    expect(app.hitBoxes.some((box) => box.id === 'settings_surrender')).toBe(true);
    app.dispose();
  });

  it('经典黑白会关闭双方技能，技能规则仍保留默认招式', () => {
    const app = new GameApp();
    app.ruleVariant = 'classic';
    app.startMatch('local2p');
    expect(app.gameState.players[Piece.Black].equippedSkills).toEqual([]);
    expect(app.gameState.players[Piece.White].equippedSkills).toEqual([]);

    app.ruleVariant = 'skills';
    app.startMatch('local2p');
    expect(app.gameState.players[Piece.Black].equippedSkills.length).toBeGreaterThan(0);
    expect(app.gameState.players[Piece.White].equippedSkills.length).toBeGreaterThan(0);
  });
});
