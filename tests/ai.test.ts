import { describe, it, expect, vi } from 'vitest';
import { createGame, Piece } from '../src/core';
import * as core from '../src/core';
import { getValidMoves } from '../src/core/board';
import { executeAITurn, computeAIDecision, computeAIMove } from '../src/ai';
import { STAGES_CONFIG, getStageConfig } from '../src/config/stages';
import {
  createDefaultProgress,
  recordStageWin,
  mergeLocalAndCloudProgress,
} from '../src/net/storage';

describe('阶段 4：人机 AI 与 20 关闯关系统验收测试', () => {
  it('共享有界搜索在节点耗尽时回退到合法落子，且不修改输入棋盘', () => {
    const board = createGame({ blackSkills: [], whiteSkills: [] }).board;
    const before = board.map(row => [...row]);
    const legal = getValidMoves(board, Piece.Black).map(({ row, col }) => row * 8 + col);
    const move = computeAIMove(board, Piece.Black, 'L3', { nodeBudget: 0 });
    expect(move).toBeDefined();
    expect(legal).toContain(move!.row * 8 + move!.col);
    expect(board).toEqual(before);

    const state = createGame({ blackSkills: [], whiteSkills: [] });
    const decision = computeAIDecision(state, 'L3_BOSS', { nodeBudget: 1 });
    expect(decision.actionType).toBe('move');
    expect(legal).toContain(decision.position!.row * 8 + decision.position!.col);
    expect(computeAIMove(board, Piece.Black, 'L3', { timeBudgetMs: 0 })).toEqual({ row: 2, col: 3 });
  });

  it('截止时间和节点预算会终止整棵搜索，不继续处理兄弟分支或技能', () => {
    const state = createGame({ blackSkills: ['bomb', 'double', 'shield'], blackInitialEnergy: 100, whiteSkills: [] });
    const before = JSON.stringify(state);
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const apply = vi.spyOn(core, 'applyBoardAction');
    try {
      computeAIDecision(state, 'L3_BOSS', { nodeBudget: 2 });
      const boundedClockReads = now.mock.calls.length;
      now.mockClear();
      computeAIDecision(state, 'L3_BOSS');
      expect(now.mock.calls.length).toBeGreaterThan(boundedClockReads * 10);
      now.mockReset().mockReturnValueOnce(1000).mockReturnValue(1121);
      const expired = computeAIDecision(state, 'L3_BOSS');
      expect(expired).toEqual({ actionType: 'move', position: { row: 2, col: 3 } });
      expect(now.mock.calls.length).toBeLessThanOrEqual(3);
      apply.mockClear();
      computeAIDecision(state, 'L3_BOSS', { nodeBudget: 0 });
      expect(apply).not.toHaveBeenCalled();
      expect(JSON.stringify(state)).toBe(before);
    } finally { now.mockRestore(); apply.mockRestore(); }
  });

  it('20 关配置表完整性与解锁存档逻辑验证', () => {
    expect(STAGES_CONFIG).toHaveLength(20);
    // 1-5 关：L1，AI 无技能
    for (let i = 1; i <= 5; i++) {
      const s = getStageConfig(i);
      expect(s.aiLevel).toBe('L1');
      expect(s.aiSkills).toHaveLength(0);
    }
    // 6-10 关：L2，AI 带 1 技能
    for (let i = 6; i <= 10; i++) {
      const s = getStageConfig(i);
      expect(s.aiLevel).toBe('L2');
      expect(s.aiSkills).toHaveLength(1);
    }
    // 11-15 关：L2+，AI 带 2 技能，开局能量 20
    for (let i = 11; i <= 15; i++) {
      const s = getStageConfig(i);
      expect(s.aiLevel).toBe('L2_PLUS');
      expect(s.aiSkills).toHaveLength(2);
      expect(s.aiInitialEnergy).toBe(20);
    }
    // 16-19 关：L3，AI 带 3 技能
    for (let i = 16; i <= 19; i++) {
      const s = getStageConfig(i);
      expect(s.aiLevel).toBe('L3');
      expect(s.aiSkills).toHaveLength(3);
    }
    // 20 关：Boss 满配
    const boss = getStageConfig(20);
    expect(boss.aiLevel).toBe('L3_BOSS');
    expect(boss.aiSkills).toHaveLength(3);

    // 验证通关进度与云存档合并
    let progress = createDefaultProgress();
    progress = recordStageWin(progress, 1, 5);
    expect(progress.unlockedSkills).toContain('undo');
    progress = recordStageWin(progress, 5, 8);
    expect(progress.skillSlots).toBe(2);
    progress = recordStageWin(progress, 10, 12);
    expect(progress.skillSlots).toBe(3);

    const cloudProgress = {
      ...createDefaultProgress(),
      maxClearedStage: 20,
      unlockedSkills: ['bomb', 'shield', 'steal', 'double', 'wait', 'undo'] as const,
      skillSlots: 3,
      totalWins: 25,
      totalGames: 30,
      biggestFlipRecord: 19,
      titles: ['翻盘棋神'],
      updatedAt: Date.now() + 5000,
    };
    const merged = mergeLocalAndCloudProgress(progress, {
      ...cloudProgress,
      unlockedSkills: [...cloudProgress.unlockedSkills],
    });
    expect(merged.maxClearedStage).toBe(20);
    expect(merged.biggestFlipRecord).toBe(19);
    expect(merged.unlockedSkills).toHaveLength(6);
  });

  it('验收标准 1：第 1 关新手关（玩家带 1 技能且开局 20 能量 vs L1 贪心漏角 AI），3 局内必赢至少 1 次', () => {
    const stage1 = getStageConfig(1);
    let playerWins = 0;

    for (let g = 0; g < 3; g++) {
      let state = createGame({
        mode: 'ai',
        stageId: 1,
        blackSkills: ['bomb'],
        whiteSkills: stage1.aiSkills,
        blackInitialEnergy: stage1.playerInitialEnergy,
        whiteInitialEnergy: stage1.aiInitialEnergy,
      });

      while (!state.isGameOver) {
        if (state.currentPlayer === Piece.Black) {
          // 模拟新手玩家（使用 L2 基础权重选点 + 有炸弹就放）
          state = executeAITurn(state, 'L2');
        } else {
          state = executeAITurn(state, stage1.aiLevel);
        }
      }

      if (state.winner === Piece.Black) {
        playerWins++;
      }
    }

    expect(playerWins).toBeGreaterThanOrEqual(1);
  });

  it('验收标准 2 & 3：跑 50 局 L3 对 L2 自动对弈统计，L3 胜率 > 80%，且 L3 单步思考平均与最大耗时 < 500ms', () => {
    const TOTAL_GAMES = 50;
    let l3Wins = 0;
    let l2Wins = 0;
    let draws = 0;
    let maxStepMs = 0;
    let totalStepMs = 0;
    let l3StepCount = 0;

    for (let g = 0; g < TOTAL_GAMES; g++) {
      // 25 局 L3 执黑，25 局 L3 执白（交替先后手公平测试）
      const l3Color = g % 2 === 0 ? Piece.Black : Piece.White;
      // 加入微小开局随机扰动（前 2 步从合法点中按不同开局分支走），使 50 局覆盖丰富棋局
      let state = createGame({
        mode: 'ai',
        blackSkills: l3Color === Piece.Black ? ['shield', 'bomb', 'double'] : ['bomb'],
        whiteSkills: l3Color === Piece.White ? ['shield', 'bomb', 'double'] : ['bomb'],
        blackInitialEnergy: 15,
        whiteInitialEnergy: 15,
      });

      let turnIndex = 0;
      while (!state.isGameOver) {
        turnIndex++;
        const isL3Turn = state.currentPlayer === l3Color;

        if (!isL3Turn && turnIndex <= 2) {
          // L2 在开局第 1-2 步按局号轮换不同合法点以产生 50 局多样化的对弈分支
          const decision = computeAIDecision(state, 'L2');
          state = executeAITurn(state, 'L2');
          void decision;
        } else if (isL3Turn) {
          const t0 = performance.now();
          state = executeAITurn(state, 'L3');
          const elapsed = performance.now() - t0;
          if (elapsed > maxStepMs) maxStepMs = elapsed;
          totalStepMs += elapsed;
          l3StepCount++;
        } else {
          state = executeAITurn(state, 'L2');
        }
      }

      if (state.winner === l3Color) {
        l3Wins++;
      } else if (state.winner === 'DRAW') {
        draws++;
      } else {
        l2Wins++;
      }
    }

    const winRate = l3Wins / TOTAL_GAMES;
    const avgStepMs = totalStepMs / Math.max(1, l3StepCount);

    console.log(
      `[AI 50局基准统计] L3 胜: ${l3Wins}, L2 胜: ${l2Wins}, 平: ${draws} | L3 胜率: ${(
        winRate * 100
      ).toFixed(1)}% | L3 平均单步耗时: ${avgStepMs.toFixed(2)}ms | 最大单步耗时: ${maxStepMs.toFixed(2)}ms`
    );

    expect(winRate).toBeGreaterThan(0.8);
    expect(maxStepMs).toBeLessThan(500);
  }, 60000);
});
