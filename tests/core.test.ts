import { describe, it, expect } from 'vitest';
import {
  computeBoardRect,
  pixelToBoardCoord,
  boardCoordToPixelCenter,
} from '../src/ui/coord';
import {
  Piece,
  createEmptyBoard,
  createInitialBoard,
  getFlipsForCell,
  getValidMoves,
  countPieces,
  createGame,
  applyBoardAction,
  passTurn,
} from '../src/core';

describe('阶段 0：棋盘静态区域与坐标点击换算', () => {
  it('能正确计算棋盘矩形并双向换算像素坐标与行列坐标', () => {
    const rect = computeBoardRect(375, 812);
    expect(rect.size).toBe(rect.cellSize * 8);
    expect(rect.cellSize).toBeGreaterThan(35);

    // 验证 8x8 每个格子中心点击都能精准还原为对应的 (row, col)
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const { cx, cy } = boardCoordToPixelCenter(r, c, rect);
        const grid = pixelToBoardCoord(cx, cy, rect);
        expect(grid).toEqual({ row: r, col: c });
      }
    }

    // 点击棋盘外部返回 null
    expect(pixelToBoardCoord(rect.x - 5, rect.y + 10, rect)).toBeNull();
    expect(pixelToBoardCoord(rect.x + rect.size + 1, rect.y + 10, rect)).toBeNull();
    expect(pixelToBoardCoord(rect.x + 10, rect.y - 1, rect)).toBeNull();
    expect(pixelToBoardCoord(rect.x + 10, rect.y + rect.size + 10, rect)).toBeNull();
  });
});

describe('阶段 1：核心规则引擎 (core 层纯逻辑)', () => {
  it('初始棋盘 8x8，中央 4 子对角交叉（黑白各 2），黑方先手有 4 个合法落子点', () => {
    const board = createInitialBoard();
    const counts = countPieces(board);
    expect(counts).toEqual({ black: 2, white: 2, empty: 60 });

    const blackMoves = getValidMoves(board, Piece.Black);
    expect(blackMoves).toHaveLength(4);
    const coords = blackMoves.map((m) => `${m.row},${m.col}`).sort();
    expect(coords).toEqual(['2,3', '3,2', '4,5', '5,4']);
    for (const m of blackMoves) {
      expect(m.flips).toHaveLength(1);
    }
  });

  it('用例 1：角落落子夹住横/竖/对角线对方棋子', () => {
    const board = createEmptyBoard();
    // 在 (0,0) 角落测试：放置白子 (0,1),(0,2) 和黑子 (0,3)
    board[0][1] = Piece.White;
    board[0][2] = Piece.White;
    board[0][3] = Piece.Black;

    const flips = getFlipsForCell(board, Piece.Black, 0, 0);
    expect(flips).toEqual([
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ]);
  });

  it('用例 2：多方向同时翻子（横+竖+斜三方向同时夹住）', () => {
    const board = createEmptyBoard();
    // 目标落子点 (3,3) 黑子
    // 向右：(3,4)=白, (3,5)=黑
    board[3][4] = Piece.White;
    board[3][5] = Piece.Black;
    // 向下：(4,3)=白, (5,3)=白, (6,3)=黑
    board[4][3] = Piece.White;
    board[5][3] = Piece.White;
    board[6][3] = Piece.Black;
    // 向左上斜线：(2,2)=白, (1,1)=黑
    board[2][2] = Piece.White;
    board[1][1] = Piece.Black;

    const flips = getFlipsForCell(board, Piece.Black, 3, 3);
    expect(flips).toHaveLength(4);
    expect(flips).toEqual(
      expect.arrayContaining([
        { row: 3, col: 4 },
        { row: 4, col: 3 },
        { row: 5, col: 3 },
        { row: 2, col: 2 },
      ])
    );
  });

  it('用例 3：单方无合法点自动 pass，以及双方连续无子可下（连续 pass）触发终局判定', () => {
    // 1. 单方无合法点自动 pass：
    const game1 = createGame({ blackSkills: [], whiteSkills: [] });
    game1.board = createEmptyBoard();
    // 黑在 (0,0) 落子后翻转 (0,1)：此时白子只剩 (0,6) 且周围无黑子，白方无合法点，但黑方在 (0,7) 仍有合法点？
    // 构造：黑落 (0,0) 翻 (0,1) 后，白在 (2,0)，黑在 (2,1)，此时白无法走（因 (2,2) 被封或方向不对），而黑可落 (1,0)？
    // 更简单：黑落 (0,0) 夹 (0,1) 至 (0,2)=黑；同时 (7,7)=白, (7,6)=黑，此时白无法夹黑（因为 (7,5) 为空，白若落 (7,5) 可夹 (7,6)），
    // 若我们把白放在 (7,0)=白，(6,0)=黑，(5,0)=空 -> 白落 (5,0) 可夹 (6,0)。
    // 反过来：如果 (7,0)=黑，(6,0)=白，(5,0)=空 -> 白无合法点，黑有合法点 (5,0)！
    game1.board[0][1] = Piece.White;
    game1.board[0][2] = Piece.Black;
    game1.board[7][0] = Piece.Black;
    game1.board[6][0] = Piece.White;

    const res1 = applyBoardAction(game1, 0, 0);
    expect(res1.ok).toBe(true);
    // 白方在 (0,0) 被黑落子后，白只剩 (6,0)，白无任何合法落子；黑有 (5,0) 合法落子！
    // 因此白方自动 pass，回合直接回到黑方！
    expect(res1.state.currentPlayer).toBe(Piece.Black);
    expect(
      res1.state.lastEvents.some(
        (e) => e.type === 'TURN_PASSED' && e.player === Piece.White
      )
    ).toBe(true);
    expect(res1.state.isGameOver).toBe(false);

    // 2. 双方连续无子可下 → 立即终局：
    const game2 = createGame({ blackSkills: [], whiteSkills: [] });
    game2.board = createEmptyBoard();
    game2.board[0][1] = Piece.White;
    game2.board[0][2] = Piece.Black;
    // 左下角放一颗孤立白子 (7,0)，四周全空，任何一方都无法夹它
    game2.board[7][0] = Piece.White;

    const res2 = applyBoardAction(game2, 0, 0);
    expect(res2.ok).toBe(true);
    expect(res2.state.isGameOver).toBe(true);
    expect(res2.state.winner).toBe(Piece.Black);
    const overEvent = res2.state.lastEvents.find((e) => e.type === 'GAME_OVER');
    expect(overEvent).toBeDefined();
    if (overEvent && overEvent.type === 'GAME_OVER') {
      expect(overEvent.reason).toBe('BOTH_NO_MOVES');
      expect(overEvent.blackCount).toBe(3);
      expect(overEvent.whiteCount).toBe(1);
    }
  });

  it('阶段 1 验收标准：跑通 100 局随机对弈（随机合法落子），无死循环、无非法翻子、终局子数总和正确', () => {
    const TOTAL_GAMES = 100;
    let blackWins = 0;
    let whiteWins = 0;
    let draws = 0;

    for (let g = 0; g < TOTAL_GAMES; g++) {
      let state = createGame({ blackSkills: [], whiteSkills: [] });
      let safetySteps = 0;

      while (!state.isGameOver) {
        safetySteps++;
        expect(safetySteps).toBeLessThan(200); // 绝无死循环

        const validMoves = getValidMoves(state.board, state.currentPlayer, state.shielded);
        if (validMoves.length === 0) {
          const passRes = passTurn(state);
          expect(passRes.ok).toBe(true);
          state = passRes.state;
        } else {
          const randomMove = validMoves[Math.floor(Math.random() * validMoves.length)];
          expect(randomMove.flips.length).toBeGreaterThan(0);

          const prevCounts = countPieces(state.board);
          const moveRes = applyBoardAction(state, randomMove.row, randomMove.col);
          expect(moveRes.ok).toBe(true);
          state = moveRes.state;

          const newCounts = countPieces(state.board);
          // 落 1 子，棋盘总子数必然 +1，空格数必然 -1
          expect(newCounts.black + newCounts.white).toBe(
            prevCounts.black + prevCounts.white + 1
          );
          expect(newCounts.empty).toBe(prevCounts.empty - 1);
        }
      }

      const finalCounts = countPieces(state.board);
      expect(finalCounts.black + finalCounts.white + finalCounts.empty).toBe(64);

      if (finalCounts.black > finalCounts.white) {
        expect(state.winner).toBe(Piece.Black);
        blackWins++;
      } else if (finalCounts.white > finalCounts.black) {
        expect(state.winner).toBe(Piece.White);
        whiteWins++;
      } else {
        expect(state.winner).toBe('DRAW');
        draws++;
      }
    }

    expect(blackWins + whiteWins + draws).toBe(TOTAL_GAMES);
  });
});
