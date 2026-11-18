import { computeAIMove, type AISearchOptions } from '../ai/ai';
import { createInitialBoard, getFlipsForCell, getValidMoves } from '../core/board';
import type { Piece } from '../core/types';

export type Color = 1 | 2;
export type SkillKey = 'bomb' | 'insight' | 'charge';
export type Mode = 'ai' | 'local' | 'room';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Variant = 'classic' | 'skills';

type Energy = [number, number, number];
type Charges = [boolean, boolean, boolean];

export interface FriendGame {
  id: string;
  mode: Mode;
  diff: Difficulty;
  variant: Variant;
  chapter: number | null;
  /** Row-major 8 x 8 board; 0 is empty, 1 is black, 2 is white. */
  board: number[];
  turn: Color;
  last: number;
  history: GameMove[];
  energies: Energy;
  chargeUsed: Charges;
  skillsUsed: Energy;
  revealed: { color: Color; i: number } | null;
  over: boolean;
  winner: 0 | Color;
  reason: 'normal' | 'resign' | 'disconnect';
  started: number;
}

export type MoveSnapshot = Pick<FriendGame,
  'board' | 'turn' | 'last' | 'energies' | 'chargeUsed' | 'skillsUsed' |
  'revealed' | 'over' | 'winner' | 'reason'>;

export interface GameMove {
  i: number;
  color: Color;
  flips: number[];
  extra: number[];
  skill: SkillKey | null;
  before?: MoveSnapshot;
}

export interface MatchRecord {
  id: string;
  at: number;
  mode: Mode;
  diff: Difficulty;
  variant: Variant;
  chapter: number | null;
  board: number[];
  black: number;
  white: number;
  winner: 0 | Color;
  myColor: Color;
  reason: FriendGame['reason'];
  skills: number;
  history: GameMove[];
}

export interface MoveResult {
  ok: boolean;
  game: FriendGame;
  error?: string;
  skipped?: Color;
}

export const DIFFICULTIES = { easy: '入门', normal: '进阶', hard: '高手' } as const;

export const SKILLS: Record<SkillKey, {
  name: string;
  icon: string;
  cost: number;
  short: string;
  detail: string;
  limit: string;
}> = {
  bomb: {
    name: '十字爆破', icon: 'bomb', cost: 3,
    short: '合法落子后，额外翻转相邻的敌子。',
    detail: '先按黑白棋规则落子并翻转夹住的敌子，再把落点上、下、左、右紧邻的敌子翻为己方。空格与己方棋子不受影响。',
    limit: '可重复使用，落子后扣除 3 点能量',
  },
  insight: {
    name: '洞察一步', icon: 'eye', cost: 2,
    short: '标出当前局面的一处建议落点。',
    detail: '花费 2 点能量，参考角点、行动力与后续变化，标出一个合法的建议落点。不会代你落子，也不会保证必胜。',
    limit: '每回合至多一次，不消耗落子回合',
  },
  charge: {
    name: '蓄势一手', icon: 'energy', cost: 0,
    short: '下一手额外获得 2 点能量。',
    detail: '发动后在任意合法格落子。除了正常获得的 1 点能量，再获得 2 点，能量最多为 6 点。',
    limit: '每位棋手每局一次，落子时生效',
  },
};

let gameSequence = 0;

export function makeGame(
  mode: Mode,
  diff: Difficulty = 'easy',
  variant: Variant = 'skills',
  chapter: number | null = null,
): FriendGame {
  const started = Date.now();
  return {
    id: `${started.toString(36)}-${(++gameSequence).toString(36)}-${Math.random().toString(36).slice(2)}`,
    mode, diff, variant, chapter,
    board: createInitialBoard().flat(),
    turn: 1,
    last: -1,
    history: [],
    energies: [0, 3, 3],
    chargeUsed: [false, false, false],
    skillsUsed: [0, 0, 0],
    revealed: null,
    over: false,
    winner: 0,
    reason: 'normal',
    started,
  };
}

function matrix(board: number[]): Piece[][] {
  return Array.from({ length: 8 }, (_, row) => board.slice(row * 8, row * 8 + 8) as Piece[]);
}

function opponent(color: Color): Color {
  return color === 1 ? 2 : 1;
}

function isColor(color: unknown): color is Color {
  return color === 1 || color === 2;
}

function isSkill(skill: unknown): skill is SkillKey {
  return skill === 'bomb' || skill === 'insight' || skill === 'charge';
}

export function getLegalIndices(game: FriendGame): number[] {
  if (game.over) return [];
  return getValidMoves(matrix(game.board), game.turn).map(({ row, col }) => row * 8 + col);
}

export function coord(i: number): string {
  return Number.isInteger(i) && i >= 0 && i < 64
    ? `${'ABCDEFGH'[i % 8]}${Math.floor(i / 8) + 1}`
    : '';
}

export function scores(board: number[]): { black: number; white: number } {
  return {
    black: board.filter((piece) => piece === 1).length,
    white: board.filter((piece) => piece === 2).length,
  };
}

export function chooseMove(game: FriendGame, options: AISearchOptions = {}): number {
  if (game.over) return -1;
  const board = matrix(game.board);
  const level = game.diff === 'easy' ? 'L1' : game.diff === 'normal' ? 'L2' : 'L3';
  const decision = computeAIMove(board, game.turn, level, options);
  return decision ? decision.row * 8 + decision.col : -1;
}

function snapshot(game: MoveSnapshot): MoveSnapshot {
  return {
    board: [...game.board],
    turn: game.turn,
    last: game.last,
    energies: [...game.energies],
    chargeUsed: [...game.chargeUsed],
    skillsUsed: [...game.skillsUsed],
    revealed: game.revealed ? { ...game.revealed } : null,
    over: game.over,
    winner: game.winner,
    reason: game.reason,
  };
}

function turnError(game: FriendGame, color: Color): string | undefined {
  if (!isColor(color)) return '棋手颜色无效';
  if (game.over) return '对局已经结束';
  if (game.turn !== color) return '还没轮到你落子';
  return undefined;
}

function failure(game: FriendGame, error: string): MoveResult {
  return { ok: false, game, error };
}

export function playMove(
  game: FriendGame,
  index: number,
  color: Color,
  skill: SkillKey | null = null,
): MoveResult {
  const error = turnError(game, color);
  if (error) return failure(game, error);
  if (!Number.isInteger(index) || index < 0 || index >= 64) return failure(game, '落子坐标无效');
  if (skill !== null && !isSkill(skill)) return failure(game, '未知技能');
  if (skill === 'insight') return failure(game, '洞察一步不会代你落子');
  if (skill && game.variant !== 'skills') return failure(game, '经典黑白不使用技能');
  if (skill && game.energies[color] < SKILLS[skill].cost) return failure(game, '能量不足');
  if (skill === 'charge' && game.chargeUsed[color]) return failure(game, '蓄势一手每局只能使用一次');

  const flips = getFlipsForCell(matrix(game.board), color, index >> 3, index % 8)
    .map(({ row, col }) => row * 8 + col);
  if (!flips.length) return failure(game, '非法落子，请选择能夹住敌子的空格');

  const next: FriendGame = { ...game, ...snapshot(game), history: [...game.history] };
  next.board[index] = color;
  for (const i of flips) next.board[i] = color;
  const extra: number[] = [];
  if (skill === 'bomb') {
    const row = index >> 3;
    const col = index % 8;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < 8 && c >= 0 && c < 8 && next.board[r * 8 + c] === opponent(color)) {
        const i = r * 8 + c;
        next.board[i] = color;
        extra.push(i);
      }
    }
  }
  if (skill === 'charge') next.chargeUsed[color] = true;
  if (skill) next.skillsUsed[color]++;
  next.energies[color] = Math.min(6, next.energies[color] - (skill ? SKILLS[skill].cost : 0) + (skill === 'charge' ? 3 : 1));
  next.last = index;
  next.revealed = null;
  next.history.push({
    i: index,
    color,
    flips,
    extra,
    skill,
    ...(game.mode === 'room' ? {} : { before: snapshot(game) }),
  });
  next.turn = opponent(color);

  const board = matrix(next.board);
  let skipped: Color | undefined;
  if (!getValidMoves(board, next.turn).length) {
    if (getValidMoves(board, color).length) {
      skipped = next.turn;
      next.turn = color;
    } else {
      next.over = true;
      const { black, white } = scores(next.board);
      next.winner = black === white ? 0 : black > white ? 1 : 2;
    }
  }
  return skipped ? { ok: true, game: next, skipped } : { ok: true, game: next };
}

export function applyInsight(game: FriendGame, color: Color, options: AISearchOptions = {}): MoveResult {
  const error = turnError(game, color);
  if (error) return failure(game, error);
  if (game.variant !== 'skills') return failure(game, '经典黑白不使用技能');
  if (game.revealed?.color === color) return failure(game, '每回合只能洞察一次');
  if (game.energies[color] < SKILLS.insight.cost) return failure(game, '能量不足');
  const i = chooseMove({ ...game, diff: 'normal' }, options);
  if (i < 0) return failure(game, '当前没有合法落点');
  const next: FriendGame = { ...game, ...snapshot(game), revealed: { color, i } };
  next.energies[color] -= SKILLS.insight.cost;
  next.skillsUsed[color]++;
  return { ok: true, game: next };
}

export function undoGame(game: FriendGame): FriendGame {
  if (game.mode === 'room' || game.over || !game.history.length) return game;
  let next = game;
  do {
    const move = next.history[next.history.length - 1];
    if (!move?.before) break;
    next = { ...next, ...snapshot(move.before), history: next.history.slice(0, -1) };
  } while (next.mode === 'ai' && next.turn !== 1 && next.history.length);
  return next;
}

export function resignGame(
  game: FriendGame,
  color: Color,
  reason: 'resign' | 'disconnect' = 'resign',
): FriendGame {
  if (!isColor(color) || game.over || (reason !== 'resign' && reason !== 'disconnect')) return game;
  return { ...game, ...snapshot(game), over: true, winner: opponent(color), reason, revealed: null };
}

export function recordFromGame(game: FriendGame, myColor: Color): MatchRecord {
  return {
    id: game.id,
    at: Date.now(),
    mode: game.mode,
    diff: game.diff,
    variant: game.variant,
    chapter: game.chapter,
    board: [...game.board],
    ...scores(game.board),
    winner: game.winner,
    myColor,
    reason: game.reason,
    skills: game.skillsUsed[1] + game.skillsUsed[2],
    history: game.history.map(({ i, color, flips, extra, skill }) => ({
      i, color, flips: [...flips], extra: [...extra], skill,
    })),
  };
}

export function replayStates(record: Pick<MatchRecord, 'history'>): number[][] {
  const states = [createInitialBoard().flat() as number[]];
  for (const move of record.history) {
    const next = [...states[states.length - 1]];
    next[move.i] = move.color;
    for (const i of move.flips) next[i] = move.color;
    for (const i of move.extra) next[i] = move.color;
    states.push(next);
  }
  return states;
}
