/**
 * 20 关人机挑战配置表（全部配置化）
 * - 1–5 关：L1，AI 无技能 → 教玩家规则和技能
 * - 6–10 关：L2，AI 带 1 技能 → 解锁玩家第 2 个技能位
 * - 11–15 关：L2+，AI 带 2 技能，开局能量 20
 * - 16–19 关：L3，AI 带 3 技能
 * - 20 关：L3 满配 + 终局 Boss 皮肤/称号奖励
 */

import { SkillId } from './skills';

export type AILevel = 'L1' | 'L2' | 'L2_PLUS' | 'L3' | 'L3_BOSS';

export interface StageConfig {
  stageId: number;
  name: string;
  subtitle: string;
  aiLevel: AILevel;
  aiSkills: SkillId[];
  aiInitialEnergy: number;
  playerInitialEnergy: number;
  playerSkillSlots: number;      // 玩家可携带技能槽位数 (1~3)
  rewardTitle: string;           // 首通奖励描述
  unlockSkill?: SkillId;         // 通关解锁的技能
}

export const STAGES_CONFIG: StageConfig[] = [
  // 1-5 关：L1，AI 无技能 → 教玩家规则和技能
  {
    stageId: 1,
    name: '第 1 关 · 初入棋局',
    subtitle: '熟悉夹子翻转与角落优势',
    aiLevel: 'L1',
    aiSkills: [],
    aiInitialEnergy: 0,
    playerInitialEnergy: 20, // 新手关福利开局带 20 能量
    playerSkillSlots: 1,
    rewardTitle: '解锁技能「悔棋时光」',
    unlockSkill: 'undo',
  },
  {
    stageId: 2,
    name: '第 2 关 · 金身护体',
    subtitle: '善用金身子保护关键边角',
    aiLevel: 'L1',
    aiSkills: [],
    aiInitialEnergy: 0,
    playerInitialEnergy: 15,
    playerSkillSlots: 1,
    rewardTitle: '能量感悟 +5',
  },
  {
    stageId: 3,
    name: '第 3 关 · 十字轰炸',
    subtitle: '用炸弹子撕开对手防线',
    aiLevel: 'L1',
    aiSkills: [],
    aiInitialEnergy: 0,
    playerInitialEnergy: 15,
    playerSkillSlots: 1,
    rewardTitle: '解锁技能「偷天换日」',
    unlockSkill: 'steal',
  },
  {
    stageId: 4,
    name: '第 4 关 · 以退为进',
    subtitle: '蓄积能量等待一击逆转',
    aiLevel: 'L1',
    aiSkills: [],
    aiInitialEnergy: 0,
    playerInitialEnergy: 10,
    playerSkillSlots: 1,
    rewardTitle: '初级棋手徽章',
  },
  {
    stageId: 5,
    name: '第 5 关 · 新手试炼官',
    subtitle: '击败贪心守卫，开启进阶之路',
    aiLevel: 'L1',
    aiSkills: [],
    aiInitialEnergy: 10,
    playerInitialEnergy: 10,
    playerSkillSlots: 1,
    rewardTitle: '解锁第 2 个技能槽位',
  },

  // 6-10 关：L2，AI 带 1 技能 → 解锁玩家第 2 个技能位
  {
    stageId: 6,
    name: '第 6 关 · 边角猎手',
    subtitle: 'AI 开始注重抢占四角与边线',
    aiLevel: 'L2',
    aiSkills: ['shield'],
    aiInitialEnergy: 0,
    playerInitialEnergy: 10,
    playerSkillSlots: 2,
    rewardTitle: '解锁技能「连落双子」',
    unlockSkill: 'double',
  },
  {
    stageId: 7,
    name: '第 7 关 · 爆破专家',
    subtitle: '小心 AI 的十字炸弹突袭',
    aiLevel: 'L2',
    aiSkills: ['bomb'],
    aiInitialEnergy: 0,
    playerInitialEnergy: 10,
    playerSkillSlots: 2,
    rewardTitle: '进阶棋手徽章',
  },
  {
    stageId: 8,
    name: '第 8 关 · 诡道棋手',
    subtitle: '提防对手偷天换日偷走关键角',
    aiLevel: 'L2',
    aiSkills: ['steal'],
    aiInitialEnergy: 0,
    playerInitialEnergy: 10,
    playerSkillSlots: 2,
    rewardTitle: '战术大师感悟',
  },
  {
    stageId: 9,
    name: '第 9 关 · 蓄力守卫',
    subtitle: '对手会跳过回合积攒高额能量',
    aiLevel: 'L2',
    aiSkills: ['wait'],
    aiInitialEnergy: 10,
    playerInitialEnergy: 10,
    playerSkillSlots: 2,
    rewardTitle: '高阶战术精通',
  },
  {
    stageId: 10,
    name: '第 10 关 · 铁壁考官',
    subtitle: '突破位置权重 AI 的严密防守',
    aiLevel: 'L2',
    aiSkills: ['double'],
    aiInitialEnergy: 10,
    playerInitialEnergy: 10,
    playerSkillSlots: 2,
    rewardTitle: '解锁第 3 个技能槽位（满槽）',
  },

  // 11-15 关：L2+，AI 带 2 技能，开局能量 20
  {
    stageId: 11,
    name: '第 11 关 · 攻守兼备',
    subtitle: 'AI 开局 20 能量且携带双技能',
    aiLevel: 'L2_PLUS',
    aiSkills: ['shield', 'bomb'],
    aiInitialEnergy: 20,
    playerInitialEnergy: 15,
    playerSkillSlots: 3,
    rewardTitle: '精英棋手徽章',
  },
  {
    stageId: 12,
    name: '第 12 关 · 暗度陈仓',
    subtitle: '金身护角配合偷天换日',
    aiLevel: 'L2_PLUS',
    aiSkills: ['shield', 'steal'],
    aiInitialEnergy: 20,
    playerInitialEnergy: 15,
    playerSkillSlots: 3,
    rewardTitle: '破阵先锋称号',
  },
  {
    stageId: 13,
    name: '第 13 关 · 狂轰滥炸',
    subtitle: '蓄能与炸弹的高频压制',
    aiLevel: 'L2_PLUS',
    aiSkills: ['wait', 'bomb'],
    aiInitialEnergy: 20,
    playerInitialEnergy: 20,
    playerSkillSlots: 3,
    rewardTitle: '逆转达人称号',
  },
  {
    stageId: 14,
    name: '第 14 关 · 双子惊雷',
    subtitle: '蓄能后连落双子的爆发连招',
    aiLevel: 'L2_PLUS',
    aiSkills: ['wait', 'double'],
    aiInitialEnergy: 20,
    playerInitialEnergy: 20,
    playerSkillSlots: 3,
    rewardTitle: '星耀棋手徽章',
  },
  {
    stageId: 15,
    name: '第 15 关 · 宗师门徒',
    subtitle: '半决赛守门人，综合实力强劲',
    aiLevel: 'L2_PLUS',
    aiSkills: ['bomb', 'double'],
    aiInitialEnergy: 20,
    playerInitialEnergy: 20,
    playerSkillSlots: 3,
    rewardTitle: '晋级大师殿堂',
  },

  // 16-19 关：L3，AI 带 3 技能
  {
    stageId: 16,
    name: '第 16 关 · 深算长老',
    subtitle: '多步深算 + 行动力封锁',
    aiLevel: 'L3',
    aiSkills: ['shield', 'bomb', 'wait'],
    aiInitialEnergy: 20,
    playerInitialEnergy: 20,
    playerSkillSlots: 3,
    rewardTitle: '深算克星徽章',
  },
  {
    stageId: 17,
    name: '第 17 关 · 幻影大宗师',
    subtitle: '极限控场与偷天换日绝杀',
    aiLevel: 'L3',
    aiSkills: ['shield', 'steal', 'bomb'],
    aiInitialEnergy: 25,
    playerInitialEnergy: 20,
    playerSkillSlots: 3,
    rewardTitle: '幻影破局者称号',
  },
  {
    stageId: 18,
    name: '第 18 关 · 雷霆裁决者',
    subtitle: '连落双子配合多步搜索的压迫感',
    aiLevel: 'L3',
    aiSkills: ['wait', 'bomb', 'double'],
    aiInitialEnergy: 25,
    playerInitialEnergy: 25,
    playerSkillSlots: 3,
    rewardTitle: '雷霆棋圣徽章',
  },
  {
    stageId: 19,
    name: '第 19 关 · 绝境守望者',
    subtitle: '终极 Boss 前的最后一道防线',
    aiLevel: 'L3',
    aiSkills: ['shield', 'steal', 'double'],
    aiInitialEnergy: 30,
    playerInitialEnergy: 25,
    playerSkillSlots: 3,
    rewardTitle: '传奇挑战者称号',
  },

  // 20 关：L3 满配 + 终局 Boss 皮肤/称号奖励
  {
    stageId: 20,
    name: '第 20 关 · 翻盘棋神 (BOSS)',
    subtitle: 'L3 满配深算宗师 · 明明只剩 3 个子也能翻盘',
    aiLevel: 'L3_BOSS',
    aiSkills: ['shield', 'bomb', 'double'],
    aiInitialEnergy: 35,
    playerInitialEnergy: 30,
    playerSkillSlots: 3,
    rewardTitle: '【终局 Boss 称号：翻盘棋神】+【黑金至尊棋盘主题】',
  },
];

export function getStageConfig(stageId: number): StageConfig {
  const stage = STAGES_CONFIG.find((s) => s.stageId === stageId);
  if (!stage) {
    throw new Error(`Invalid stageId: ${stageId}`);
  }
  return stage;
}
