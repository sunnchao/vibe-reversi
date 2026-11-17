/**
 * 核心规则引擎类型定义（纯函数、无任何 wx API）
 */

import { SkillId } from '../config/skills';

export const BOARD_SIZE = 8;

export enum Piece {
  Empty = 0,
  Black = 1,
  White = 2,
}

export type PlayerColor = Piece.Black | Piece.White;

export interface Position {
  row: number;
  col: number;
}

export interface ValidMove {
  row: number;
  col: number;
  flips: Position[];
}

export type GameMode = 'ai' | 'local2p' | 'online';

/**
 * 玩家单局状态（能量、携带技能、已使用次数）
 */
export interface PlayerState {
  color: PlayerColor;
  energy: number;
  equippedSkills: SkillId[];
  skillUses: Record<SkillId, number>;
}

/**
 * 技能状态机：
 * - 未选技能 = null（普通落子）
 * - 选技能后高亮可作用目标；点空白处取消选择、不扣能量
 */
export interface ActiveSkillSelection {
  skillId: SkillId;
  /** 连落双子阶段：1 表示待落第 1 子，2 表示已落第 1 子待落第 2 子 */
  doubleStep?: 1 | 2;
}

/**
 * 「求你等我」联机请求挂起状态
 */
export interface PendingWaitRequest {
  requester: PlayerColor;
}

/**
 * 每步产生结构化事件，UI 只消费事件做动画，UI 不自己算规则
 */
export type GameEvent =
  | {
      type: 'MOVE_PLACED';
      player: PlayerColor;
      position: Position;
      flipped: Position[];
      skillUsed?: SkillId;
    }
  | {
      type: 'BOMB_EXPLODED';
      player: PlayerColor;
      center: Position;
      bombedPositions: Position[];
    }
  | {
      type: 'SHIELD_APPLIED';
      player: PlayerColor;
      position: Position;
    }
  | {
      type: 'PIECE_STOLEN';
      player: PlayerColor;
      position: Position;
    }
  | {
      type: 'DOUBLE_STEP_1_DONE';
      player: PlayerColor;
      position: Position;
      flipped: Position[];
    }
  | {
      type: 'DOUBLE_STEP_2_REFUNDED';
      player: PlayerColor;
      refundEnergy: number;
    }
  | {
      type: 'WAIT_REQUESTED';
      player: PlayerColor;
    }
  | {
      type: 'WAIT_RESOLVED';
      player: PlayerColor;
      approved: boolean;
      energyDelta: number;
    }
  | {
      type: 'UNDO_PERFORMED';
      player: PlayerColor;
      restoredStepIndex: number;
    }
  | {
      type: 'TURN_PASSED';
      player: PlayerColor;
      reason: 'NO_VALID_MOVE' | 'WAIT_SKILL';
    }
  | {
      type: 'ENERGY_GAINED';
      player: PlayerColor;
      amount: number;
      newEnergy: number;
      reason: 'TURN_START' | 'FLIPS' | 'WAIT_SKILL' | 'REFUND';
    }
  | {
      type: 'GAME_OVER';
      winner: PlayerColor | 'DRAW';
      blackCount: number;
      whiteCount: number;
      reason: 'BOARD_FULL' | 'BOTH_NO_MOVES' | 'WIPEOUT' | 'SURRENDER';
    };

/**
 * 单步历史记录（用于结算页计算「本局最大翻盘步」及回放）
 */
export interface MoveRecord {
  stepIndex: number;
  player: PlayerColor;
  actionType: 'move' | 'skill' | 'pass';
  skillId?: SkillId;
  position?: Position;
  secondPosition?: Position;
  flippedCount: number;          // 本回合总计翻转对方棋子数（含常规翻子+炸弹/连落双子/偷天换日变色）
  flippedPositions: Position[];
  blackCountAfter: number;
  whiteCountAfter: number;
  description: string;
}

/**
 * 历史快照：保存每步快照（棋盘+金身子+能量+技能状态），技能「悔棋时光」和对局回放都靠它
 */
export interface GameSnapshot {
  stepIndex: number;
  board: Piece[][];
  shielded: boolean[][];         // true 表示该格棋子拥有「金身子」护盾
  currentPlayer: PlayerColor;
  players: Record<PlayerColor, PlayerState>;
  consecutivePasses: number;
}

/**
 * 完整对局状态
 */
export interface GameState {
  mode: GameMode;
  stageId?: number;
  board: Piece[][];
  shielded: boolean[][];
  currentPlayer: PlayerColor;
  players: Record<PlayerColor, PlayerState>;
  selectedSkill: ActiveSkillSelection | null;
  pendingWaitRequest: PendingWaitRequest | null;
  consecutivePasses: number;
  isGameOver: boolean;
  winner: PlayerColor | 'DRAW' | null;
  stepIndex: number;
  snapshots: GameSnapshot[];
  moveHistory: MoveRecord[];
  lastEvents: GameEvent[];
}
