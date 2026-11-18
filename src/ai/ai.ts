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
  DIRECTIONS,
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

export interface AISearchOptions {
  timeBudgetMs?: number;
  nodeBudget?: number;
}

/** Callers may tighten either limit; even invalid/unbounded input cannot disable protection. */
export const AI_SEARCH_LIMITS = Object.freeze({ timeBudgetMs: 120, nodeBudget: 12000 });

interface SearchBudget {
  deadline: number;
  nodeLimit: number;
  nodes: number;
  stopped: boolean;
}

function boundedLimit(value: number | undefined, limit: number): number {
  return value === undefined || !Number.isFinite(value) ? limit : Math.max(0, Math.min(limit, value));
}

function searchBudget(options: AISearchOptions): SearchBudget {
  return {
    deadline: Date.now() + boundedLimit(options.timeBudgetMs, AI_SEARCH_LIMITS.timeBudgetMs),
    nodeLimit: Math.floor(boundedLimit(options.nodeBudget, AI_SEARCH_LIMITS.nodeBudget)),
    nodes: 0,
    stopped: false,
  };
}

function hasBudget(budget: SearchBudget): boolean {
  if (budget.stopped) return false;
  if (budget.nodes >= budget.nodeLimit || Date.now() >= budget.deadline) budget.stopped = true;
  return !budget.stopped;
}

/** Count/copy only completed capture lines, preserving the core's shield-blocking rule. */
function scanFlips(
  board: Piece[][], shielded: boolean[][] | undefined, color: PlayerColor,
  row: number, col: number, flips?: number[], firstOnly = false,
): number {
  if (board[row][col] !== Piece.Empty) return 0;
  const opponent = getOpponent(color);
  let total = 0;
  for (const [dr, dc] of DIRECTIONS) {
    let r = row + dr, c = col + dc, count = 0;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r][c] === opponent) {
      if (shielded?.[r][c]) { count = 0; break; }
      count++; r += dr; c += dc;
    }
    if (!count || r < 0 || r >= 8 || c < 0 || c >= 8 || board[r][c] !== color) continue;
    if (firstOnly) return 1;
    total += count;
    if (flips) {
      for (let step = 1; step <= count; step++) flips.push((row + step * dr) * 8 + col + step * dc);
    }
  }
  return total;
}

function countLegalMoves(board: Piece[][], shielded: boolean[][], color: PlayerColor): number {
  let count = 0;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) count += scanFlips(board, shielded, color, row, col, undefined, true);
  }
  return count;
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
  let myCount = 0, oppCount = 0;
  // Count pieces and positional weights in one pass, without a temporary count object.
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
      if (p === player) { myCount++; posScore += w; }
      else { oppCount++; posScore -= w; }
    }
  }

  if (myCount === 0) return -100000;
  if (oppCount === 0) return 100000;
  const empty = 64 - myCount - oppCount;
  if (empty === 0) return (myCount - oppCount) * 1000;

  // Mobility only needs counts, not arrays of moves, capture lines and positions.
  const myMoves = countLegalMoves(board, shielded, player);
  const oppMoves = countLegalMoves(board, shielded, opponent);
  if (myMoves === 0 && oppMoves === 0) return (myCount - oppCount) * 1000;
  const mobilityScore = (myMoves - oppMoves) * AI_EVAL_WEIGHTS.mobilityMultiplier;

  // 3. 子数差（开局中局权重低，终局期 empty <= 14 权重调高）
  const isLateGame = empty <= 14;
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

interface SearchPly {
  moves: number[];
  weights: number[];
  flips: number[];
}

/** Reuse one set of numeric buffers per ply, rather than allocate ValidMove trees. */
function orderedIndices(board: Piece[][], shielded: boolean[][], color: PlayerColor, ply: SearchPly) {
  const { moves, weights } = ply;
  moves.length = weights.length = 0;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const count = scanFlips(board, shielded, color, row, col);
      if (!count) continue;
      const weight = POSITION_WEIGHTS[row][col] + count * 2;
      let at = moves.length;
      while (at > 0 && weight > weights[at - 1]) {
        moves[at] = moves[at - 1]; weights[at] = weights[at - 1]; at--;
      }
      moves[at] = row * 8 + col; weights[at] = weight;
    }
  }
}

function applySearchMove(board: Piece[][], shielded: boolean[][], color: PlayerColor, index: number, flips: number[]) {
  flips.length = 0;
  scanFlips(board, shielded, color, index >> 3, index % 8, flips);
  board[index >> 3][index % 8] = color;
  for (const i of flips) board[i >> 3][i % 8] = color;
}

function undoSearchMove(board: Piece[][], color: PlayerColor, index: number, flips: number[]) {
  board[index >> 3][index % 8] = Piece.Empty;
  const opponent = getOpponent(color);
  for (const i of flips) board[i >> 3][i % 8] = opponent;
}

/** null aborts the entire search; incomplete branches must never compete with scored roots. */
function negamax(
  board: Piece[][],
  shielded: boolean[][],
  color: PlayerColor,
  depth: number,
  alpha: number,
  beta: number,
  passedLastTurn: boolean,
  budget: SearchBudget,
  plies: SearchPly[],
  plyIndex: number,
): number | null {
  if (!hasBudget(budget)) return null;
  budget.nodes++;
  if (depth <= 0) return evaluateBoard(board, shielded, color);

  const ply = plies[plyIndex];
  orderedIndices(board, shielded, color, ply);
  const opponent = getOpponent(color);
  if (!ply.moves.length) {
    if (passedLastTurn) {
      let difference = 0;
      for (const row of board) for (const piece of row) {
        if (piece === color) difference++; else if (piece === opponent) difference--;
      }
      return difference * 1000;
    }
    const score = negamax(board, shielded, opponent, depth - 1, -beta, -alpha, true, budget, plies, plyIndex + 1);
    return score === null ? null : -score;
  }

  let bestScore = -Infinity;
  for (const index of ply.moves) {
    if (!hasBudget(budget)) return null;
    applySearchMove(board, shielded, color, index, ply.flips);
    const child = negamax(board, shielded, opponent, depth - 1, -beta, -alpha, false, budget, plies, plyIndex + 1);
    undoSearchMove(board, color, index, ply.flips);
    if (child === null) return null;
    const score = -child;
    if (score > bestScore) bestScore = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
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

/** Fixed-depth alpha-beta with a legal heuristic fallback and a whole-search cutoff. */
function chooseL3Move(
  board: Piece[][],
  shielded: boolean[][],
  color: PlayerColor,
  moves: ValidMove[],
  depth: number,
  budget: SearchBudget,
): { move: ValidMove; score?: number } {
  let bestMove = chooseL2Move(moves);
  if (!hasBudget(budget)) return { move: bestMove };
  const opponent = getOpponent(color);
  const orderedMoves = [...moves].sort((a, b) =>
    POSITION_WEIGHTS[b.row][b.col] + b.flips.length * 2 -
    (POSITION_WEIGHTS[a.row][a.col] + a.flips.length * 2));
  // Clone only once; every branch restores this private board before stopping/returning.
  const working = cloneBoard(board);
  const plies: SearchPly[] = Array.from({ length: depth }, () => ({ moves: [], weights: [], flips: [] }));
  const rootFlips: number[] = [];
  let bestScore = -Infinity, alpha = -Infinity;
  for (const move of orderedMoves) {
    if (!hasBudget(budget)) break;
    const index = move.row * 8 + move.col;
    applySearchMove(working, shielded, color, index, rootFlips);
    const child = negamax(working, shielded, opponent, depth - 1, -Infinity, -alpha, false, budget, plies, 0);
    undoSearchMove(working, color, index, rootFlips);
    if (child === null) break;
    const score = -child;
    if (score > bestScore) { bestScore = score; bestMove = move; }
    if (score > alpha) alpha = score;
  }
  return { move: bestMove, score: bestScore === -Infinity ? undefined : bestScore };
}

function chooseBaseMove(
  board: Piece[][], shielded: boolean[][], color: PlayerColor, moves: ValidMove[],
  level: AILevel, budget: SearchBudget,
): { move: ValidMove; score?: number } {
  if (!hasBudget(budget)) return { move: moves[0] };
  if (level === 'L1') return { move: chooseL1Move(moves) };
  if (level === 'L2' || level === 'L2_PLUS') return { move: chooseL2Move(moves) };
  return chooseL3Move(board, shielded, color, moves, level === 'L3_BOSS' ? 5 : 4, budget);
}

const NO_SHIELDS: boolean[][] = Array.from({ length: 8 }, () => Array(8).fill(false));

/** Shared skill-free entry used by the production uniapp, without constructing a legacy GameState. */
export function computeAIMove(
  board: Piece[][], color: PlayerColor, level: AILevel, options: AISearchOptions = {},
): Position | undefined {
  const budget = searchBudget(options);
  const moves = getValidMoves(board, color);
  if (!moves.length) return undefined;
  const move = chooseBaseMove(board, NO_SHIELDS, color, moves, level, budget).move;
  return { row: move.row, col: move.col };
}

/**
 * AI 技能决策：当 AI 携带技能、能量足够且使用技能带来的局面收益显著高于普通落子时释放技能
 */
function evaluateAISkillDecision(
  state: GameState,
  level: AILevel,
  baseMove: ValidMove,
  baseScore: number,
  budget: SearchBudget,
): AIDecision | null {
  if (level === 'L1' || !hasBudget(budget)) return null; // L1 新手关不用技能

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
  if (!hasBudget(budget)) return null;
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
  if (!hasBudget(budget)) return null;
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
  if (!hasBudget(budget)) return null;
  if (canUseSkill(state, player, 'bomb').usable) {
    const validMoves = getValidMoves(state.board, player, state.shielded);
    let bestBombPos: Position | null = null;
    let bestBombScore = baseScore + 28; // 至少比普通落子高出阈值才放炸弹

    for (const m of validMoves) {
      if (!hasBudget(budget)) break;
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
export function computeAIDecision(state: GameState, level: AILevel, options: AISearchOptions = {}): AIDecision {
  const budget = searchBudget(options);
  const player = state.currentPlayer;
  const validMoves = getValidMoves(state.board, player, state.shielded);
  const doubleStep = state.selectedSkill?.skillId === 'double' && state.selectedSkill.doubleStep === 2;

  // 无合法落子时：若可用「求你等我」则优先换取 +20 能量，否则 pass
  if (!validMoves.length) {
    if (!doubleStep && level !== 'L1' && canUseSkill(state, player, 'wait').usable) {
      return { actionType: 'skill', skillId: 'wait' };
    }
    return { actionType: 'pass' };
  }

  const base = hasBudget(budget)
    ? chooseBaseMove(state.board, state.shielded, player, validMoves, level, budget)
    : { move: validMoves[0] };
  const decision: AIDecision = {
    actionType: 'move', position: { row: base.move.row, col: base.move.col },
  };
  if (doubleStep || level === 'L1' || !state.players[player].equippedSkills.length || !hasBudget(budget)) return decision;

  const baseScore = base.score ?? evaluateBoard(fastApplyMove(state.board, player, base.move), state.shielded, player);
  return evaluateAISkillDecision(state, level, base.move, baseScore, budget) ?? decision;
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
