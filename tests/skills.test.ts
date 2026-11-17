import { describe, it, expect } from 'vitest';
import {
  Piece,
  createEmptyBoard,
  createGame,
  selectSkill,
  applyBoardAction,
  canUseSkill,
  useWaitSkill,
  respondToWaitSkill,
  useUndoSkill,
  getValidMoves,
  countPieces,
} from '../src/core';
import { ENERGY_CONFIG, SKILLS_CONFIG } from '../src/config/skills';

describe('阶段 3：能量与六大技能系统单元测试', () => {
  describe('能量系统规则', () => {
    it('每回合初 +10，每翻 1 子 +1，单回合获取上限 +18，总能量上限 60', () => {
      // 1. 开局黑方初始 0，回合初自动 +10
      const game = createGame({
        blackInitialEnergy: 0,
        whiteInitialEnergy: 55,
      });
      expect(game.players[Piece.Black].energy).toBe(10);

      // 2. 构造黑方单步翻转 12 颗白子的棋盘，验证单回合翻子额外加成最多 +8（即 10 + 8 = 18）
      game.board = createEmptyBoard();
      // 在 (0,0) 落黑子，向右翻 6 子，向下翻 6 子（共 12 子）
      for (let i = 1; i <= 6; i++) {
        game.board[0][i] = Piece.White;
        game.board[i][0] = Piece.White;
      }
      game.board[0][7] = Piece.Black;
      game.board[7][0] = Piece.Black;
      // 留一颗白子给白方下回合有合法落子
      game.board[4][4] = Piece.White;
      game.board[4][5] = Piece.Black;

      const res = applyBoardAction(game, 0, 0);
      expect(res.ok).toBe(true);
      // 原本 10 能量，翻了 12 子，受单回合 +18 上限约束，本回合翻子最多 +8 -> 黑方能量 = 18
      expect(res.state.players[Piece.Black].energy).toBe(ENERGY_CONFIG.maxGainPerTurn);

      // 白方原本 55 能量，轮到白方回合初 +10 受上限 60 约束 -> 白方能量 = 60
      expect(res.state.players[Piece.White].energy).toBe(ENERGY_CONFIG.maxEnergy);
    });
  });

  describe('技能 1：炸弹子 (bomb)', () => {
    it('1.1 正常生效：落子后除常规夹子翻转外，十字四方向各多翻 1 格对方棋子（不连锁）', () => {
      let state = createGame({
        blackSkills: ['bomb'],
        blackInitialEnergy: 30, // +10 后 40
      });
      state.board = createEmptyBoard();
      // 黑方在 (3,3) 落子：向右夹住 (3,4)=白, (3,5)=黑
      state.board[3][4] = Piece.White;
      state.board[3][5] = Piece.Black;
      // 在 (3,3) 的上 (2,3)、下 (4,3)、左 (3,2) 各放一颗白子（常规不形成夹子），并在 (1,3) 放白子验证不连锁
      state.board[2][3] = Piece.White;
      state.board[1][3] = Piece.White;
      state.board[4][3] = Piece.White;
      state.board[3][2] = Piece.White;
      // 留白方合法落子
      state.board[7][7] = Piece.White;

      const sel = selectSkill(state, 'bomb');
      expect(sel.ok).toBe(true);
      const act = applyBoardAction(sel.state, 3, 3);
      expect(act.ok).toBe(true);
      state = act.state;

      // 常规翻转 (3,4)，十字炸翻 (2,3), (4,3), (3,2)
      expect(state.board[3][4]).toBe(Piece.Black);
      expect(state.board[2][3]).toBe(Piece.Black);
      expect(state.board[4][3]).toBe(Piece.Black);
      expect(state.board[3][2]).toBe(Piece.Black);
      // (1,3) 不连锁，仍为白子
      expect(state.board[1][3]).toBe(Piece.White);
    });

    it('1.2 边界格：在角落 (0,0) 释放炸弹子，越界方向自动跳过不报错', () => {
      let state = createGame({
        blackSkills: ['bomb'],
        blackInitialEnergy: 30,
      });
      state.board = createEmptyBoard();
      // (0,0) 向右夹 (0,1)=白, (0,2)=黑；下方 (1,0)=白（无夹子但会被十字炸翻）
      state.board[0][1] = Piece.White;
      state.board[0][2] = Piece.Black;
      state.board[1][0] = Piece.White;
      state.board[4][4] = Piece.White;

      state = selectSkill(state, 'bomb').state;
      const act = applyBoardAction(state, 0, 0);
      expect(act.ok).toBe(true);
      expect(act.state.board[0][1]).toBe(Piece.Black);
      expect(act.state.board[1][0]).toBe(Piece.Black);
    });

    it('1.3 与金身子冲突：炸弹子十字波及到对方的金身子时，金身子不会被炸翻', () => {
      let state = createGame({
        blackSkills: ['bomb'],
        blackInitialEnergy: 30,
      });
      state.board = createEmptyBoard();
      state.board[3][4] = Piece.White;
      state.board[3][5] = Piece.Black;
      // 上方 (2,3) 是白方金身子，下方 (4,3) 是白方普通子
      state.board[2][3] = Piece.White;
      state.shielded[2][3] = true;
      state.board[4][3] = Piece.White;

      state = selectSkill(state, 'bomb').state;
      const act = applyBoardAction(state, 3, 3);
      expect(act.ok).toBe(true);
      // (2,3) 金身子保持白色不翻，(4,3) 普通白子被炸翻为黑色
      expect(act.state.board[2][3]).toBe(Piece.White);
      expect(act.state.board[4][3]).toBe(Piece.Black);
    });
  });

  describe('技能 2：金身子 (shield)', () => {
    it('2.1 正常生效：指定己方棋子获得金身，扣除 20 能量后本回合仍可正常落子', () => {
      let state = createGame({
        blackSkills: ['shield'],
        blackInitialEnergy: 20, // +10 = 30
      });
      state = selectSkill(state, 'shield').state;
      // 指定黑方初始子 (3,4) 为金身子
      const shieldRes = applyBoardAction(state, 3, 4);
      expect(shieldRes.ok).toBe(true);
      state = shieldRes.state;
      expect(state.shielded[3][4]).toBe(true);
      expect(state.players[Piece.Black].energy).toBe(10);
      // 仍是黑方回合，继续正常落子 (2,3)
      expect(state.currentPlayer).toBe(Piece.Black);
      const moveRes = applyBoardAction(state, 2, 3);
      expect(moveRes.ok).toBe(true);
      expect(moveRes.state.currentPlayer).toBe(Piece.White);
    });

    it('2.2 边界/取消：选金身子后点击空格或对方棋子，自动取消选择且不扣能量', () => {
      let state = createGame({
        blackSkills: ['shield'],
        blackInitialEnergy: 20, // 30
      });
      state = selectSkill(state, 'shield').state;
      const badClick = applyBoardAction(state, 3, 3); // (3,3) 是白子
      expect(badClick.ok).toBe(false);
      expect(badClick.state.selectedSkill).toBeNull();
      expect(badClick.state.players[Piece.Black].energy).toBe(30);
    });

    it('2.3 阻断夹子线：被金身子阻断的夹子线不成立，合法落子计算自动排除该线', () => {
      const state = createGame({
        blackSkills: ['shield'],
        whiteSkills: ['shield'],
      });
      // 初始黑方给 (3,4) 加上金身并落子 (2,3) 翻 (3,3)
      state.shielded[4][3] = true; // 给黑子 (4,3) 加金身
      // 若白方想在 (5,3) 落子向上夹 (4,3)，因为 (4,3) 是金身子，该方向夹子线被阻断不成立！
      const whiteMoves = getValidMoves(state.board, Piece.White, state.shielded);
      expect(whiteMoves.some((m) => m.row === 5 && m.col === 3)).toBe(false);
    });
  });

  describe('技能 3：偷天换日 (steal)', () => {
    it('3.1 正常生效：指定对方一颗普通子直接变色，不触发连锁翻转，消耗本回合行动', () => {
      let state = createGame({
        blackSkills: ['steal'],
        blackInitialEnergy: 40, // +10 = 50
      });
      state.board = createEmptyBoard();
      // (0,0)=黑, (0,1)=白, (0,2)=白, (0,3)=空
      // 若黑把 (0,2) 偷天换日变成黑，中间的 (0,1) 虽然夹在 (0,0) 和 (0,2) 之间，但按规则「变色后不重新结算任何线」！
      state.board[0][0] = Piece.Black;
      state.board[0][1] = Piece.White;
      state.board[0][2] = Piece.White;
      state.board[4][4] = Piece.White;
      state.board[4][5] = Piece.Black;

      state = selectSkill(state, 'steal').state;
      const res = applyBoardAction(state, 0, 2);
      expect(res.ok).toBe(true);
      expect(res.state.board[0][2]).toBe(Piece.Black);
      // (0,1) 不触发连锁翻转，仍为白子！
      expect(res.state.board[0][1]).toBe(Piece.White);
    });

    it('3.2 边界保护：对方场上仅剩 1 颗棋子时不可发动偷天换日直接清零对手', () => {
      const state = createGame({
        blackSkills: ['steal'],
        blackInitialEnergy: 40,
      });
      state.board = createEmptyBoard();
      state.board[3][3] = Piece.Black;
      state.board[3][4] = Piece.White; // 唯一一颗白子

      const check = canUseSkill(state, Piece.Black, 'steal');
      expect(check.usable).toBe(false);
    });

    it('3.3 与金身子冲突：不能选择对方的金身子进行偷天换日', () => {
      let state = createGame({
        blackSkills: ['steal'],
        blackInitialEnergy: 40,
      });
      // 将白子 (3,3) 设为金身子，(4,4) 为普通白子
      state.shielded[3][3] = true;
      state = selectSkill(state, 'steal').state;

      // 点击金身白子 (3,3) 被拒绝并取消选择，不扣能量
      const failRes = applyBoardAction(state, 3, 3);
      expect(failRes.ok).toBe(false);
      expect(failRes.state.board[3][3]).toBe(Piece.White);
      expect(failRes.state.players[Piece.Black].energy).toBe(50);
    });
  });

  describe('技能 4：连落双子 (double)', () => {
    it('4.1 正常生效：本回合连续落 2 子，第一子落后对方不插回合，第二子落下才轮到对方', () => {
      // 先让黑走一步、白走一步，使得场上有多颗白子，避免开局连落 2 子直接把 2 颗初始白子全部吃光触发 WIPEOUT 终局
      let state = createGame({
        blackSkills: ['double'],
        blackInitialEnergy: 45,
      });
      state = applyBoardAction(state, 2, 3).state; // 黑落 (2,3)
      state = applyBoardAction(state, 2, 2).state; // 白落 (2,2)
      state = applyBoardAction(state, 3, 2).state; // 黑落 (3,2)
      state = applyBoardAction(state, 2, 4).state; // 白落 (2,4)，此时场上有足够多白子

      state.players[Piece.Black].energy = 55;
      state = selectSkill(state, 'double').state;

      const step1Moves = getValidMoves(state.board, Piece.Black, state.shielded);
      const step1 = applyBoardAction(state, step1Moves[0].row, step1Moves[0].col);
      expect(step1.ok).toBe(true);
      state = step1.state;
      // 此时仍是黑方回合，且处于 doubleStep === 2
      expect(state.currentPlayer).toBe(Piece.Black);
      expect(state.selectedSkill).toEqual({ skillId: 'double', doubleStep: 2 });

      const step2Moves = getValidMoves(state.board, Piece.Black, state.shielded);
      expect(step2Moves.length).toBeGreaterThan(0);
      const step2 = applyBoardAction(state, step2Moves[0].row, step2Moves[0].col);
      expect(step2.ok).toBe(true);
      expect(step2.state.currentPlayer).toBe(Piece.White);
      expect(step2.state.selectedSkill).toBeNull();
    });

    it('4.2 边界退费：第一子落下后若无合法点可落第二子，则第二子作废并自动退还一半能量 (+25)', () => {
      let state = createGame({
        blackSkills: ['double'],
        blackInitialEnergy: 40, // +10 = 50
      });
      state.board = createEmptyBoard();
      // 构造黑方只有唯一一步 (0,0) 夹 (0,1)=白 到 (0,2)=黑；且 (7,7)=白, (7,6)=黑（白有合法点 (7,5)，但黑落完 (0,0) 后无第 2 个合法点）
      state.board[0][1] = Piece.White;
      state.board[0][2] = Piece.Black;
      state.board[7][7] = Piece.White;
      state.board[7][6] = Piece.Black;

      state = selectSkill(state, 'double').state;
      const res = applyBoardAction(state, 0, 0);
      expect(res.ok).toBe(true);
      // 50 扣 50 = 0，翻 1 子 +1，第二子无合法点退还 25 -> 最终黑方能量 = 26
      expect(res.state.players[Piece.Black].energy).toBe(
        1 + Math.floor(SKILLS_CONFIG.double.cost * ENERGY_CONFIG.doubleSkillRefundRatio)
      );
      expect(
        res.state.lastEvents.some((e) => e.type === 'DOUBLE_STEP_2_REFUNDED')
      ).toBe(true);
      // 回合已自动切给白方
      expect(res.state.currentPlayer).toBe(Piece.White);
    });

    it('4.3 与金身子/Pass 冲突：无合法落子时连落双子置灰不可选', () => {
      const state = createGame({
        blackSkills: ['double'],
        blackInitialEnergy: 50,
      });
      state.board = createEmptyBoard();
      state.board[0][0] = Piece.Black;
      state.board[7][7] = Piece.White;

      const check = canUseSkill(state, Piece.Black, 'double');
      expect(check.usable).toBe(false);
    });
  });

  describe('技能 5：求你等我 (wait)', () => {
    it('5.1 正常生效（人机/同屏默认同意）：扣 5 能量换取 +20 能量（净增 +15）并跳过回合', () => {
      const state = createGame({
        mode: 'local2p',
        blackSkills: ['wait'],
        blackInitialEnergy: 0, // +10 = 10
      });
      const res = useWaitSkill(state);
      expect(res.ok).toBe(true);
      // 10 - 5 + 20 = 25
      expect(res.state.players[Piece.Black].energy).toBe(25);
      expect(res.state.players[Piece.Black].skillUses.wait).toBe(1);
      expect(res.state.currentPlayer).toBe(Piece.White);
    });

    it('5.2 联机模式拒绝流转：对方拒绝则不扣能量、不计次数，本回合继续正常落子', () => {
      let state = createGame({
        mode: 'online',
        blackSkills: ['wait'],
        blackInitialEnergy: 0, // 10
      });
      const reqRes = useWaitSkill(state);
      expect(reqRes.ok).toBe(true);
      state = reqRes.state;
      expect(state.pendingWaitRequest).toEqual({ requester: Piece.Black });

      // 对方点击拒绝
      const rejectRes = respondToWaitSkill(state, false);
      expect(rejectRes.ok).toBe(true);
      state = rejectRes.state;
      expect(state.pendingWaitRequest).toBeNull();
      expect(state.players[Piece.Black].energy).toBe(10);
      expect(state.players[Piece.Black].skillUses.wait).toBe(0);
      expect(state.currentPlayer).toBe(Piece.Black);
    });

    it('5.3 次数上限边界：每局最多使用 2 次，第 3 次不可用', () => {
      let state = createGame({
        mode: 'local2p',
        blackSkills: ['wait'],
        whiteSkills: ['wait'],
      });
      // 黑第 1 次
      state = useWaitSkill(state).state;
      // 白落子
      state = applyBoardAction(state, 2, 4).state;
      // 黑第 2 次
      state = useWaitSkill(state).state;
      // 白落子
      const wMoves = getValidMoves(state.board, Piece.White, state.shielded);
      state = applyBoardAction(state, wMoves[0].row, wMoves[0].col).state;

      // 黑尝试第 3 次：被拒绝
      expect(state.players[Piece.Black].skillUses.wait).toBe(2);
      const check3 = canUseSkill(state, Piece.Black, 'wait');
      expect(check3.usable).toBe(false);
    });
  });

  describe('技能 6：悔棋时光 (undo)', () => {
    it('6.1 正常生效：撤销自己上一步及对方的回应，回到自己上回合状态并扣 25 能量', () => {
      let state = createGame({
        mode: 'local2p',
        blackSkills: ['undo'],
        blackInitialEnergy: 20, // +10 = 30
      });
      const initialBoard = JSON.stringify(state.board);

      // 黑走 (2,3)，白走 (2,2)
      state = applyBoardAction(state, 2, 3).state;
      state = applyBoardAction(state, 2, 2).state;
      expect(state.currentPlayer).toBe(Piece.Black);
      expect(JSON.stringify(state.board)).not.toBe(initialBoard);

      const energyBeforeUndo = state.players[Piece.Black].energy;
      const undoRes = useUndoSkill(state);
      expect(undoRes.ok).toBe(true);
      state = undoRes.state;

      // 棋盘完全回到黑方第 1 步落子前
      expect(JSON.stringify(state.board)).toBe(initialBoard);
      expect(state.currentPlayer).toBe(Piece.Black);
      expect(state.players[Piece.Black].energy).toBe(energyBeforeUndo - 25);
      expect(state.players[Piece.Black].skillUses.undo).toBe(1);
    });

    it('6.2 边界与次数限制：开局第 1 步无可悔棋；每局最多用 1 次', () => {
      let state = createGame({
        mode: 'local2p',
        blackSkills: ['undo'],
        blackInitialEnergy: 30,
      });
      // 第 1 步尚无历史步，不可用
      expect(canUseSkill(state, Piece.Black, 'undo').usable).toBe(false);

      state = applyBoardAction(state, 2, 3).state;
      state = applyBoardAction(state, 2, 2).state;
      state = useUndoSkill(state).state;

      // 再走一轮后尝试第 2 次使用 undo -> 不可用
      state = applyBoardAction(state, 2, 3).state;
      state = applyBoardAction(state, 2, 2).state;
      expect(canUseSkill(state, Piece.Black, 'undo').usable).toBe(false);
    });

    it('6.3 联机模式禁用：online 模式下悔棋时光不可用', () => {
      let state = createGame({
        mode: 'online',
        blackSkills: ['undo'],
        blackInitialEnergy: 30,
      });
      state = applyBoardAction(state, 2, 3).state;
      state = applyBoardAction(state, 2, 2).state;
      const check = canUseSkill(state, Piece.Black, 'undo');
      expect(check.usable).toBe(false);
      expect(check.reason).toContain('联机模式禁用');
    });
  });

  describe('阶段 3 综合验收：两人同屏完整打完一局，六大技能全部各用一次无异常', () => {
    it('双人同屏对局中依次触发 shield / wait / undo / bomb / steal / double 并顺利打到终局', () => {
      // 黑方带：shield, bomb, undo；白方带：wait, steal, double（双方合计 6 大技能各带 3 个）
      let state = createGame({
        mode: 'local2p',
        blackSkills: ['shield', 'bomb', 'undo'],
        whiteSkills: ['wait', 'steal', 'double'],
        blackInitialEnergy: 50,
        whiteInitialEnergy: 50,
      });

      // 先正常下 2 回合展开局面，避免开局 2 颗白子被连续吃光
      state = applyBoardAction(state, 2, 3).state;
      state = applyBoardAction(state, 2, 2).state;
      state = applyBoardAction(state, 3, 2).state;
      state = applyBoardAction(state, 2, 4).state;

      // 1. 黑方使用「金身子 (shield)」给己方一颗棋子加护盾，再正常落一子
      state.players[Piece.Black].energy = 60;
      state = selectSkill(state, 'shield').state;
      let ownBlackPos = { row: -1, col: -1 };
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (state.board[r][c] === Piece.Black && !state.shielded[r][c]) {
            ownBlackPos = { row: r, col: c };
          }
        }
      }
      state = applyBoardAction(state, ownBlackPos.row, ownBlackPos.col).state;
      expect(state.shielded[ownBlackPos.row][ownBlackPos.col]).toBe(true);
      const bMoveAfterShield = getValidMoves(state.board, Piece.Black, state.shielded)[0];
      state = applyBoardAction(state, bMoveAfterShield.row, bMoveAfterShield.col).state;

      // 2. 白方使用「求你等我 (wait)」跳过回合涨能量
      expect(state.currentPlayer).toBe(Piece.White);
      state = useWaitSkill(state).state;
      expect(state.players[Piece.White].skillUses.wait).toBe(1);

      // 3. 轮回黑方：先普通落一子，白方普通落一子，然后黑方使用「悔棋时光 (undo)」
      const bMove1 = getValidMoves(state.board, Piece.Black, state.shielded)[0];
      state = applyBoardAction(state, bMove1.row, bMove1.col).state;
      const wMove1 = getValidMoves(state.board, Piece.White, state.shielded)[0];
      state = applyBoardAction(state, wMove1.row, wMove1.col).state;
      // 补充黑方能量以发动 undo + bomb
      state.players[Piece.Black].energy = 60;
      const undoRes = useUndoSkill(state);
      expect(undoRes.ok).toBe(true);
      state = undoRes.state;
      expect(state.players[Piece.Black].skillUses.undo).toBe(1);

      // 4. 黑方使用「炸弹子 (bomb)」落子
      state = selectSkill(state, 'bomb').state;
      const bMoveBomb = getValidMoves(state.board, Piece.Black, state.shielded)[0];
      state = applyBoardAction(state, bMoveBomb.row, bMoveBomb.col).state;
      expect(state.players[Piece.Black].skillUses.bomb).toBe(1);

      // 5. 白方使用「偷天换日 (steal)」把黑方一颗非金身子变白
      state.players[Piece.White].energy = 60;
      state = selectSkill(state, 'steal').state;
      // 找一颗非金身黑子
      let targetBlack = { row: -1, col: -1 };
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (state.board[r][c] === Piece.Black && !state.shielded[r][c]) {
            targetBlack = { row: r, col: c };
          }
        }
      }
      state = applyBoardAction(state, targetBlack.row, targetBlack.col).state;
      expect(state.players[Piece.White].skillUses.steal).toBe(1);

      // 黑方走一步普通落子
      const bNext = getValidMoves(state.board, Piece.Black, state.shielded)[0];
      state = applyBoardAction(state, bNext.row, bNext.col).state;

      // 6. 白方使用「连落双子 (double)」连续落 2 子
      state.players[Piece.White].energy = 60;
      state = selectSkill(state, 'double').state;
      const wDouble1 = getValidMoves(state.board, Piece.White, state.shielded)[0];
      state = applyBoardAction(state, wDouble1.row, wDouble1.col).state;
      if (state.selectedSkill?.doubleStep === 2) {
        const wDouble2 = getValidMoves(state.board, Piece.White, state.shielded)[0];
        state = applyBoardAction(state, wDouble2.row, wDouble2.col).state;
      }
      expect(state.players[Piece.White].skillUses.double).toBe(1);

      // 继续自动下完剩余步数直到终局
      let steps = 0;
      while (!state.isGameOver && steps < 150) {
        steps++;
        const moves = getValidMoves(state.board, state.currentPlayer, state.shielded);
        if (moves.length > 0) {
          state = applyBoardAction(state, moves[0].row, moves[0].col).state;
        }
      }

      expect(state.isGameOver).toBe(true);
      const finalCounts = countPieces(state.board);
      expect(finalCounts.black + finalCounts.white + finalCounts.empty).toBe(64);
    });
  });
});
