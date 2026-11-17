/**
 * 能量与技能配置表（全部配置化，不写死在业务代码中）
 */

export type SkillId =
  | 'bomb'       // 炸弹子
  | 'shield'     // 金身子
  | 'steal'      // 偷天换日
  | 'double'     // 连落双子
  | 'wait'       // 求你等我
  | 'undo';      // 悔棋时光

export interface SkillConfig {
  id: SkillId;
  name: string;
  cost: number;
  maxUsesPerGame: number | null; // null 表示无次数上限（受能量限制）
  allowInOnline: boolean;
  requiresValidMove: boolean;    // 是否要求当前有合法落子才可选
  targetType: 'move_cell' | 'own_piece' | 'opponent_piece' | 'none';
  unlockStage: number;           // 解锁关卡（0 表示初始解锁）
  shortDesc: string;             // 一句话说明（选技能页展示）
  detailDesc: string;            // 详细规则与边界说明（技能图鉴页展示）
}

export interface EnergyConfig {
  initialEnergy: number;         // 默认初始能量
  turnStartGain: number;         // 每回合开始增加能量 (+10)
  perFlipGain: number;           // 本回合每翻 1 子额外增加能量 (+1)
  maxGainPerTurn: number;        // 单回合最大获取能量上限 (+18，即每回合开始+10与翻子之和或单回合获取上限)
  maxEnergy: number;             // 能量总上限 (60)
  waitSkillGain: number;         // 「求你等我」成功后获得的能量 (+20)
  doubleSkillRefundRatio: number;// 「连落双子」第二子无合法点时退还能量比例 (0.5)
}

export const ENERGY_CONFIG: EnergyConfig = {
  initialEnergy: 0,
  turnStartGain: 10,
  perFlipGain: 1,
  maxGainPerTurn: 18,
  maxEnergy: 60,
  waitSkillGain: 20,
  doubleSkillRefundRatio: 0.5,
};

export const SKILLS_CONFIG: Record<SkillId, SkillConfig> = {
  bomb: {
    id: 'bomb',
    name: '炸弹子',
    cost: 30,
    maxUsesPerGame: null,
    allowInOnline: true,
    requiresValidMove: true,
    targetType: 'move_cell',
    unlockStage: 0,
    shortDesc: '落子后十字四方向各多翻 1 格敌方棋子',
    detailDesc: '落子并完成正常翻转后，以落子点为中心，上下左右十字四方向各多翻转 1 格对方棋子（不触发连锁反应）。边缘越界自动跳过；炸到对方「金身子」不会翻转。',
  },
  shield: {
    id: 'shield',
    name: '金身子',
    cost: 20,
    maxUsesPerGame: null,
    allowInOnline: true,
    requiresValidMove: false,
    targetType: 'own_piece',
    unlockStage: 0,
    shortDesc: '指定己方一子本局永不可被翻转或阻断夹线',
    detailDesc: '落子前指定己方棋盘上一颗已有棋子赋予金身护盾（本回合仍需正常落子或无子跳过）。金身子本局不可被常规翻转、不可被炸弹炸翻、不可被偷天换日选中；且被金身子阻断的夹子线不成立！',
  },
  steal: {
    id: 'steal',
    name: '偷天换日',
    cost: 40,
    maxUsesPerGame: null,
    allowInOnline: true,
    requiresValidMove: false,
    targetType: 'opponent_piece',
    unlockStage: 3,
    shortDesc: '直接将对方一颗非金身棋子变为己方颜色',
    detailDesc: '指定棋盘上对方一颗普通棋子直接变为己方颜色（消耗本回合行动，不再常规落子），不触发任何连锁翻转。不能选择对方的「金身子」；且不能将对方场上最后一颗棋子变色导致对方直接归零（若对方仅剩 1 子则不可对其释放）。',
  },
  double: {
    id: 'double',
    name: '连落双子',
    cost: 50,
    maxUsesPerGame: null,
    allowInOnline: true,
    requiresValidMove: true,
    targetType: 'move_cell',
    unlockStage: 6,
    shortDesc: '本回合连续落 2 子，各自正常结算翻转',
    detailDesc: '开启后本回合连续落 2 颗子，第一子落下翻转后对方不插回合，立即由己方落第二子。第二子仍须符合合法落子规则；若第一子落下后己方无合法点可落第二子，则第二子作废并自动退还一半能量（+25）。',
  },
  wait: {
    id: 'wait',
    name: '求你等我',
    cost: 5,
    maxUsesPerGame: 2,
    allowInOnline: true,
    requiresValidMove: false,
    targetType: 'none',
    unlockStage: 0,
    shortDesc: '请求跳过本回合换取 +20 能量（每局最多 2 次）',
    detailDesc: '消耗 5 能量请求跳过本回合，若生效则额外获得 +20 能量（净增 +15）并直接轮到对方。人机与双人同屏模式默认同意；好友联机模式由对方点击同意/拒绝，若对方拒绝则不扣能量、不计次数，本回合继续正常落子。每局最多成功使用 2 次。',
  },
  undo: {
    id: 'undo',
    name: '悔棋时光',
    cost: 25,
    maxUsesPerGame: 1,
    allowInOnline: false,
    requiresValidMove: false,
    targetType: 'none',
    unlockStage: 1,
    shortDesc: '撤销自己上一步回到上回合初（仅单机/同屏）',
    detailDesc: '消耗 25 能量，时光倒流回到自己上一次行动前的棋盘与状态（扣除本次消耗的 25 能量并计已使用 1 次）。每局仅限使用 1 次；为防止联机扯皮，好友房联机模式禁用此技能。',
  },
};

export const ALL_SKILL_IDS: SkillId[] = ['bomb', 'shield', 'steal', 'double', 'wait', 'undo'];
export const MAX_EQUIPPED_SKILLS = 3;
