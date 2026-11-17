/**
 * 棋盘渲染与坐标点击换算工具（阶段 0 核心函数，纯逻辑可单测）
 */

export interface BoardRect {
  x: number;
  y: number;
  size: number;
  cellSize: number;
}

export interface GridCoord {
  row: number;
  col: number;
}

/**
 * 根据屏幕宽高计算 8x8 棋盘的居中矩形区域
 */
export function computeBoardRect(screenWidth: number, screenHeight: number): BoardRect {
  const padding = Math.max(16, Math.floor(screenWidth * 0.05));
  const maxBoardSize = Math.min(screenWidth - padding * 2, screenHeight * 0.56);
  const cellSize = Math.floor(maxBoardSize / 8);
  const size = cellSize * 8;
  const x = Math.floor((screenWidth - size) / 2);
  const y = Math.floor((screenHeight - size) / 2) - Math.floor(screenHeight * 0.02);
  return { x, y, size, cellSize };
}

/**
 * 将屏幕点击像素坐标 (px, py) 换算为棋盘行列坐标 (row, col)
 * 若点击在棋盘外则返回 null
 */
export function pixelToBoardCoord(
  px: number,
  py: number,
  rect: BoardRect
): GridCoord | null {
  if (
    px < rect.x ||
    px >= rect.x + rect.size ||
    py < rect.y ||
    py >= rect.y + rect.size
  ) {
    return null;
  }
  const col = Math.floor((px - rect.x) / rect.cellSize);
  const row = Math.floor((py - rect.y) / rect.cellSize);
  if (row < 0 || row >= 8 || col < 0 || col >= 8) {
    return null;
  }
  return { row, col };
}

/**
 * 将棋盘行列坐标 (row, col) 换算为格子中心像素坐标
 */
export function boardCoordToPixelCenter(
  row: number,
  col: number,
  rect: BoardRect
): { cx: number; cy: number } {
  return {
    cx: rect.x + col * rect.cellSize + rect.cellSize / 2,
    cy: rect.y + row * rect.cellSize + rect.cellSize / 2,
  };
}
