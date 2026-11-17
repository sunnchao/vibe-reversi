/**
 * 人机 AI 引擎：
 * - L1 贪心：选翻子最多的点（新手关，偶尔故意漏角）
 * - L2 位置权重：用经典位置权重表（角 >> 边 > 内圈，角旁格为负分）+ 翻子数
 * - L3 搜索：Negamax + Alpha-Beta，深度 4–6，评估 = 位置权重 + 行动力（合法点差）+ 子数差（终局期权重调高）；技能纳入决策（能量够且收益大时才放）
 */

import { SkillId } from '../config/skills';
import { AILevel } from '../config/stages';
import { AI_EVAL_WEIGHTS, POSITION_WEIGHTS } from '../config/weights';
import {
  applyBoardAction,
  canUseSkill,
  cloneBoard,
  countPieces,
  GameState,
  getOpponent,
  getSkillTargets,
  getValidMoves,
  passTurn,
  Piece,
  PlayerColor,
  Position,
  selectSkill,
  useWaitSkill,
  ValidMove,
} from '../core';

export interface AIDecision {
  actionType: 'move' | 'skill' | 'pass';
  skillId?: SkillId;
  position?: Position;
  /** 若是金身子，选定护盾目标后本回合紧接着的落子位置；若是连落双子，第 2 子的落子位置 */
  followUpPosition?: Position;
}

function isCorner(row: number, col: number): boolean {
  return (row === 0 || row === 7) && (col === 0 || col === 7);
}

function isEdge(row: number, col: number): boolean {
  return row === 0 || row === 7 || col === 0 || col === 7;
}

/**
 * 综合局面评估函数（从 player 视角返回得分）
 * 评估 = 位置权重 + 行动力（合法点差）+ 子数差（终局期权重调高）+ 金身子护角奖励
 */
export function evaluateBoard(
  board: Piece[][],
  shielded: boolean[][],
  player: PlayerColor
): number {
  const opponent = getOpponent(player);
  const counts = countPieces(board);
  const myCount = player === Piece.Black ? counts.black : counts.white;
  const oppCount = opponent === Piece.Black ? counts.black : counts.white;

  if (myCount === 0) return -100000;
  if (oppCount === 0) return 100000;
  if (counts.empty === 0) {
    return (myCount - oppCount) * 1000;
  }

  // 1. 位置权重 + 金身子护盾加分
  let posScore = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p === Piece.Empty) continue;
      let w = POSITION_WEIGHTS[r][c];
      if (shielded[r][c]) {
        if (isCorner(r, c)) w += AI_EVAL_WEIGHTS.shieldCornerBonus;
        else if (isEdge(r, c)) w += AI_EVAL_WEIGHTS.shieldEdgeBonus;
        else w += 15;
      }
      if (p === player) posScore += w;
      else posScore -= w;
    }
  }

  // 2. 行动力（合法落子点数量差）
  const myMoves = getValidMoves(board, player, shielded);
  const oppMoves = getValidMoves(board, opponent, shielded);
  if (myMoves.length === 0 && oppMoves.length === 0) {
    return (myCount - oppCount) * 1000;
  }
  const mobilityScore =
    (myMoves.length - oppMoves.length) * AI_EVAL_WEIGHTS.mobilityMultiplier;

  // 3. 子数差（开局中局权重低，终局期 empty <= 14 权重调高）
  const isLateGame = counts.empty <= 14;
  const pieceWeight = isLateGame
    ? AI_EVAL_WEIGHTS.pieceDiffLate
    : AI_EVAL_WEIGHTS.pieceDiffEarly;
  const pieceDiffScore = (myCount - oppCount) * pieceWeight;

  return (
    posScore * AI_EVAL_WEIGHTS.positionMultiplier +
    mobilityScore +
    pieceDiffScore
  );
}

/**
 * 轻量棋盘模拟落子（用于 Negamax 高速搜索，不克隆完整历史快照）
 */
function fastApplyMove(
  board: Piece[][],
  color: PlayerColor,
  move: ValidMove
): Piece[][] {
  const next = cloneBoard(board);
  next[move.row][move.col] = color;
  for (const pos of move.flips) {
    next[pos.row][pos.col] = color;
  }
  return next;
}

/**
 * Negamax + Alpha-Beta 剪枝搜索
 */
function negamax(
  board: Piece[][],
  shielded: boolean[][],
  color: PlayerColor,
  depth: number,
  alpha: number,
  beta: number,
  passedLastTurn: boolean,
  deadlineMs: number
): number {
  if (depth <= 0 || Date.now() >= deadlineMs) {
    return evaluateBoard(board, shielded, color);
  }

  const moves = getValidMoves(board, color, shielded);
  const opponent = getOpponent(color);

  if (moves.length === 0) {
    if (passedLastTurn) {
      const counts = countPieces(board);
      const myCount = color === Piece.Black ? counts.black : counts.white;
      const oppCount = opponent === Piece.Black ? counts.black : counts.white;
      return (myCount - oppCount) * 1000;
    }
    return -negamax(
      board,
      shielded,
      opponent,
      depth - 1,
      -beta,
      -alpha,
      true,
      deadlineMs
    );
  }

  // 启发式走法排序（优先搜索角落与高权重格，大幅提升 Alpha-Beta 剪枝效率）
  moves.sort(
    (a, b) =>
      POSITION_WEIGHTS[b.row][b.col] +
      b.flips.length * 2 -
      (POSITION_WEIGHTS[a.row][a.col] + a.flips.length * 2)
  );

  let bestScore = -Infinity;
  for (const move of moves) {
    const nextBoard = fastApplyMove(board, color, move);
    const score = -negamax(
      nextBoard,
      shielded,
      opponent,
      depth - 1,
      -beta,
      -alpha,
      false,
      deadlineMs
    );
    if (score > bestScore) {
      bestScore = score;
    }
    if (score > alpha) {
      alpha = score;
    }
    if (alpha >= beta) {
      break; // Beta 剪枝
    }
  }

  return bestScore;
}

/**
 * L1 贪心策略：选翻子最多的点（新手关，故意漏掉角落且偶尔送角旁格，方便新手体验翻盘）
 */
function chooseL1Move(moves: ValidMove[]): ValidMove {
  const nonCornerMoves = moves.filter((m) => !isCorner(m.row, m.col));
  const candidatePool = nonCornerMoves.length > 0 ? nonCornerMoves : moves;

  // 优先选角旁格或单纯翻子最多的格（新手关 AI 只看眼前翻子数，不防角落）
  let best = candidatePool[0];
  let bestFlips = -1;
  for (const m of candidatePool) {
    // 若是 X-square / C-square（负权重格），L1 反而觉得它好（更容易让给玩家角落）
    const bonus = POSITION_WEIGHTS[m.row][m.col] < 0 ? 2 : 0;
    const score = m.flips.length + bonus;
    if (score > bestFlips) {
      bestFlips = score;
      best = m;
    }
  }
  return best;
}

/**
 * L2 位置权重策略：经典位置权重表 + 翻子数（一步静态评估，不含多步行动力深搜）
 */
function chooseL2Move(moves: ValidMove[]): ValidMove {
  let best = moves[0];
  let bestScore = -Infinity;

  for (const m of moves) {
    const score = POSITION_WEIGHTS[m.row][m.col] + m.flips.length * 3;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

/**
 * L3 Negamax + Alpha-Beta 搜索选点（深度 4–5，保证单步耗时 < 500ms）
 */
function chooseL3Move(
  board: Piece[][],
  shielded: boolean[][],
  color: PlayerColor,
  moves: ValidMove[],
  depth = 4,
  timeBudgetMs = 350
): { move: ValidMove; score: number } {
  const deadlineMs = Date.now() + timeBudgetMs;
  const opponent = getOpponent(color);

  const orderedMoves = [...moves].sort(
    (a, b) =>
      POSITION_WEIGHTS[b.row][b.col] +
      b.flips.length * 2 -
      (POSITION_WEIGHTS[a.row][a.col] + a.flips.length * 2)
  );

  let bestMove = orderedMoves[0];
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;

  for (const move of orderedMoves) {
    const nextBoard = fastApplyMove(board, color, move);
    const score = -negamax(
      nextBoard,
      shielded,
      opponent,
      depth - 1,
      -beta,
      -alpha,
      false,
      deadlineMs
    );
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (score > alpha) {
      alpha = score;
    }
  }

  return { move: bestMove, score: bestScore };
}

/**
 * AI 技能决策：当 AI 携带技能、能量足够且使用技能带来的局面收益显著高于普通落子时释放技能
 */
function evaluateAISkillDecision(
  state: GameState,
  level: AILevel,
  baseMove: ValidMove,
  baseScore: number
): AIDecision | null {
  if (level === 'L1') return null; // L1 新手关不用技能

  const player = state.currentPlayer;
  const equipped = state.players[player].equippedSkills;
  if (equipped.length === 0) return null;

  // 1. 若己方占据了角落且尚未加金身，优先给角落加「金身子 (shield)」
  if (canUseSkill(state, player, 'shield').usable) {
    const shieldTargets = getSkillTargets(state, player, 'shield');
    const cornerTarget = shieldTargets.find((t) => isCorner(t.row, t.col));
    const edgeTarget = shieldTargets.find((t) => isEdge(t.row, t.col));
    const chosenShield = cornerTarget ?? (level.startsWith('L3') ? edgeTarget : undefined);
    if (chosenShield) {
      return {
        actionType: 'skill',
        skillId: 'shield',
        position: chosenShield,
        followUpPosition: { row: baseMove.row, col: baseMove.col },
      };
    }
  }

  // 2. 若可以使用「偷天换日 (steal)」直接抢占对方已占的角落
  if (canUseSkill(state, player, 'steal').usable) {
    const stealTargets = getSkillTargets(state, player, 'steal');
    const cornerSteal = stealTargets.find((t) => isCorner(t.row, t.col));
    if (cornerSteal) {
      return {
        actionType: 'skill',
        skillId: 'steal',
        position: cornerSteal,
      };
    }
  }

  // 3. 若可以使用「连落双子 (double)」，模拟连落 2 子的收益
  if (canUseSkill(state, player, 'double').usable) {
    const selState = selectSkill(state, 'double').state;
    const step1Res = applyBoardAction(selState, baseMove.row, baseMove.col);
    if (step1Res.ok && step1Res.state.selectedSkill?.doubleStep === 2) {
      const step2Moves = getValidMoves(
        step1Res.state.board,
        player,
        step1Res.state.shielded
      );
      if (step2Moves.length > 0) {
        const bestStep2 = chooseL2Move(step2Moves);
        const step2Res = applyBoardAction(
          step1Res.state,
          bestStep2.row,
          bestStep2.col
        );
        if (step2Res.ok) {
          const doubleScore = evaluateBoard(
            step2Res.state.board,
            step2Res.state.shielded,
            player
          );
          if (doubleScore > baseScore + 45) {
            return {
              actionType: 'skill',
              skillId: 'double',
              position: { row: baseMove.row, col: baseMove.col },
              followUpPosition: { row: bestStep2.row, col: bestStep2.col },
            };
          }
        }
      }
    }
  }

  // 4. 若可以使用「炸弹子 (bomb)」，找能额外炸翻最多对方棋子且综合分更高的落子点
  if (canUseSkill(state, player, 'bomb').usable) {
    const validMoves = getValidMoves(state.board, player, state.shielded);
    let bestBombPos: Position | null = null;
    let bestBombScore = baseScore + 28; // 至少比普通落子高出阈值才放炸弹

    for (const m of validMoves) {
      const selState = selectSkill(state, 'bomb').state;
      const bombRes = applyBoardAction(selState, m.row, m.col);
      if (bombRes.ok) {
        const score = evaluateBoard(
          bombRes.state.board,
          bombRes.state.shielded,
          player
        );
        if (score > bestBombScore) {
          bestBombScore = score;
          bestBombPos = { row: m.row, col: m.col };
        }
      }
    }

    if (bestBombPos) {
      return {
        actionType: 'skill',
        skillId: 'bomb',
        position: bestBombPos,
      };
    }
  }

  return null;
}

/**
 * 计算 AI 当前回合的完整决策
 */
export function computeAIDecision(state: GameState, level: AILevel): AIDecision {
  const player = state.currentPlayer;

  // 若正处于连落双子第 2 步
  if (state.selectedSkill?.skillId === 'double' && state.selectedSkill.doubleStep === 2) {
    const moves = getValidMoves(state.board, player, state.shielded);
    if (moves.length === 0) {
      return { actionType: 'pass' };
    }
    const move =
      level === 'L1'
        ? chooseL1Move(moves)
        : level === 'L2' || level === 'L2_PLUS'
        ? chooseL2Move(moves)
        : chooseL3Move(state.board, state.shielded, player, moves, 4).move;
    return {
      actionType: 'move',
      position: { row: move.row, col: move.col },
    };
  }

  const validMoves = getValidMoves(state.board, player, state.shielded);

  // 无合法落子时：若可用「求你等我」则优先换取 +20 能量，否则 pass
  if (validMoves.length === 0) {
    if (level !== 'L1' && canUseSkill(state, player, 'wait').usable) {
      return { actionType: 'skill', skillId: 'wait' };
    }
    return { actionType: 'pass' };
  }

  // 计算基础最优落子
  let baseMove: ValidMove;
  let baseScore: number;

  if (level === 'L1') {
    baseMove = chooseL1Move(validMoves);
    baseScore = evaluateBoard(state.board, state.shielded, player);
  } else if (level === 'L2' || level === 'L2_PLUS') {
    baseMove = chooseL2Move(validMoves);
    const nextBoard = fastApplyMove(state.board, player, baseMove);
    baseScore = evaluateBoard(nextBoard, state.shielded, player);
  } else {
    const searchDepth = level === 'L3_BOSS' ? 5 : 4;
    const res = chooseL3Move(
      state.board,
      state.shielded,
      player,
      validMoves,
      searchDepth,
      350
    );
    baseMove = res.move;
    baseScore = res.score;
  }

  // 评估是否释放技能
  const skillDecision = evaluateAISkillDecision(state, level, baseMove, baseScore);
  if (skillDecision) {
    return skillDecision;
  }

  return {
    actionType: 'move',
    position: { row: baseMove.row, col: baseMove.col },
  };
}

/**
 * 将 AI 的一步决策直接作用到 GameState 上并返回更新后的 GameState
 */
export function executeAITurn(state: GameState, level: AILevel): GameState {
  if (state.isGameOver) return state;

  const decision = computeAIDecision(state, level);
  let current = state;

  if (decision.actionType === 'pass') {
    const res = passTurn(current);
    return res.state;
  }

  if (decision.actionType === 'skill' && decision.skillId) {
    if (decision.skillId === 'wait') {
      return useWaitSkill(current).state;
    }

    const sel = selectSkill(current, decision.skillId);
    if (sel.ok && decision.position) {
      current = sel.state;
      const act1 = applyBoardAction(
        current,
        decision.position.row,
        decision.position.col
      );
      if (act1.ok) {
        current = act1.state;
        // 若是金身子（仍需落子）或连落双子（需落第 2 子）
        if (
          !current.isGameOver &&
          current.currentPlayer === state.currentPlayer &&
          decision.followUpPosition
        ) {
          const act2 = applyBoardAction(
            current,
            decision.followUpPosition.row,
            decision.followUpPosition.col
          );
          if (act2.ok) {
            current = act2.state;
          }
        }
        return current;
      }
    }
  }

  if (decision.position) {
    const res = applyBoardAction(
      current,
      decision.position.row,
      decision.position.col
    );
    return res.state;
  }

  return current;
}
