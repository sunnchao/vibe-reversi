/**
 * 棋盘与夹子计算纯函数（无任何 wx API，支持金身子阻断规则）
 *
 * 规则要点：
 * 1. 棋盘 8×8；初始中央 4 子对角交叉（(3,3)=白, (3,4)=黑, (4,3)=黑, (4,4)=白）
 * 2. 黑先；落子必须在空格且至少一个方向（横/竖/斜共 8 方向）夹住对方连续棋子，被夹的全部翻转
 * 3. 金身子规则：
 *    - 金身子本局不可被翻（含炸弹）
 *    - 被金身子阻断的夹子线不成立！即某个方向扫描对方连续棋子时，若其中包含任何一颗金身子，则该方向夹子线不成立
 */

import { BOARD_SIZE, Piece, PlayerColor, Position, ValidMove } from './types';

export const DIRECTIONS: readonly [number, number][] = [
  [-1, -1], [-1, 0], [-1, 1],
  [ 0, -1],          [ 0, 1],
  [ 1, -1], [ 1, 0], [ 1, 1],
];

export const ORTHOGONAL_DIRECTIONS: readonly [number, number][] = [
  [-1, 0],
  [ 1, 0],
  [ 0, -1],
  [ 0, 1],
];

export function getOpponent(color: PlayerColor): PlayerColor {
  return color === Piece.Black ? Piece.White : Piece.Black;
}

export function isInBounds(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

export function createEmptyBoard(): Piece[][] {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => Piece.Empty)
  );
}

export function createEmptyShieldBoard(): boolean[][] {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => false)
  );
}

/**
 * 创建标准 8x8 初始棋盘：中央 4 子对角交叉（黑白各 2）
 */
export function createInitialBoard(): Piece[][] {
  const board = createEmptyBoard();
  board[3][3] = Piece.White;
  board[3][4] = Piece.Black;
  board[4][3] = Piece.Black;
  board[4][4] = Piece.White;
  return board;
}

export function cloneBoard(board: Piece[][]): Piece[][] {
  return board.map((row) => [...row]);
}

export function cloneShieldBoard(shielded: boolean[][]): boolean[][] {
  return shielded.map((row) => [...row]);
}

/**
 * 计算在指定格子 (row, col) 落子后能翻转的所有对方棋子列表
 * @param board 当前 8x8 棋盘
 * @param color 落子方颜色
 * @param row 行坐标 (0-7)
 * @param col 列坐标 (0-7)
 * @param shielded 可选的金身子矩阵；若某方向被夹的对方棋子中含有金身子，则该方向夹子线被阻断不成立
 */
export function getFlipsForCell(
  board: Piece[][],
  color: PlayerColor,
  row: number,
  col: number,
  shielded?: boolean[][]
): Position[] {
  if (!isInBounds(row, col) || board[row][col] !== Piece.Empty) {
    return [];
  }

  const opponent = getOpponent(color);
  const allFlips: Position[] = [];

  for (const [dr, dc] of DIRECTIONS) {
    const lineFlips: Position[] = [];
    let r = row + dr;
    let c = col + dc;
    let blockedByShield = false;

    while (isInBounds(r, c) && board[r][c] === opponent) {
      if (shielded && shielded[r][c]) {
        // 被金身子阻断的夹子线不成立
        blockedByShield = true;
        break;
      }
      lineFlips.push({ row: r, col: c });
      r += dr;
      c += dc;
    }

    if (
      !blockedByShield &&
      lineFlips.length > 0 &&
      isInBounds(r, c) &&
      board[r][c] === color
    ) {
      allFlips.push(...lineFlips);
    }
  }

  return allFlips;
}

/**
 * 合法落子计算函数：输入棋盘+颜色（及可选的金身子矩阵），输出所有合法点及每点翻子列表
 */
export function getValidMoves(
  board: Piece[][],
  color: PlayerColor,
  shielded?: boolean[][]
): ValidMove[] {
  const moves: ValidMove[] = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (board[row][col] !== Piece.Empty) continue;
      const flips = getFlipsForCell(board, color, row, col, shielded);
      if (flips.length > 0) {
        moves.push({ row, col, flips });
      }
    }
  }
  return moves;
}

/**
 * 统计棋盘上黑白双方子数与空格数
 */
export function countPieces(board: Piece[][]): {
  black: number;
  white: number;
  empty: number;
} {
  let black = 0;
  let white = 0;
  let empty = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = board[r][c];
      if (cell === Piece.Black) black++;
      else if (cell === Piece.White) white++;
      else empty++;
    }
  }
  return { black, white, empty };
}

/**
 * 计算炸弹子在 (row, col) 十字四方向额外炸翻的对方棋子坐标（跳过越界与金身子，不连锁）
 */
export function getBombExtraFlips(
  board: Piece[][],
  color: PlayerColor,
  row: number,
  col: number,
  shielded: boolean[][]
): Position[] {
  const opponent = getOpponent(color);
  const bombed: Position[] = [];

  for (const [dr, dc] of ORTHOGONAL_DIRECTIONS) {
    const r = row + dr;
    const c = col + dc;
    if (!isInBounds(r, c)) continue;
    if (board[r][c] === opponent && !shielded[r][c]) {
      bombed.push({ row: r, col: c });
    }
  }

  return bombed;
}
