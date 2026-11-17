import { describe, it, expect, vi } from 'vitest';
import { GameApp, PageId } from '../src/ui';
import { Piece, getBiggestComebackMove } from '../src/core';

function createMockCanvasContext(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    createLinearGradient: vi.fn(() => ({
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

describe('阶段 2 & 6：UI 7 大页面、三大动画与结算战绩分享验收测试', () => {
  it('1. 7 大页面渲染与按钮热区导航流转无异常（不膨胀，严格 7 个页面）', () => {
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
      'result',
      'codex',
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

  it('3. 阶段 6 结算与分享验收：自动计算本局最大翻盘步并生成分享卡片', () => {
    const app = new GameApp();
    app.startMatch('local2p');

    // 第 1 步：黑落 (2,3) 翻 1 子
    app.handleBoardCellClick(2, 3);
    // 第 2 步：白落 (2,2) 翻 1 子
    app.handleBoardCellClick(2, 2);
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
    expect(app.shareCardNotice).toContain('已拉起微信好友分享卡片');
  });
});
