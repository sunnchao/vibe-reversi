/**
 * AI 评估参数与棋盘位置权重表（配置化）
 * 角 >> 边 > 内圈，角旁格（X-square 和 C-square）为负分
 */

export const POSITION_WEIGHTS: number[][] = [
  [120, -25,  20,   5,   5,  20, -25, 120],
  [-25, -45,  -5,  -5,  -5,  -5, -45, -25],
  [ 20,  -5,  15,   3,   3,  15,  -5,  20],
  [  5,  -5,   3,   3,   3,   3,  -5,   5],
  [  5,  -5,   3,   3,   3,   3,  -5,   5],
  [ 20,  -5,  15,   3,   3,  15,  -5,  20],
  [-25, -45,  -5,  -5,  -5,  -5, -45, -25],
  [120, -25,  20,   5,   5,  20, -25, 120],
];

export interface AIEvalWeights {
  positionMultiplier: number;
  mobilityMultiplier: number;
  pieceDiffEarly: number;
  pieceDiffLate: number;
  shieldCornerBonus: number;
  shieldEdgeBonus: number;
  energyValueMultiplier: number;
}

export const AI_EVAL_WEIGHTS: AIEvalWeights = {
  positionMultiplier: 1.2,
  mobilityMultiplier: 12,
  pieceDiffEarly: 1.5,
  pieceDiffLate: 25,
  shieldCornerBonus: 90,
  shieldEdgeBonus: 35,
  energyValueMultiplier: 1.5,
};
