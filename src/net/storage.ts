/**
 * 通关进度与用户存档管理（本地存 + 云存档各一份，换设备不丢）
 */

import { ALL_SKILL_IDS, SkillId } from '../config/skills';
import { getStageConfig, STAGES_CONFIG } from '../config/stages';

export interface UserProgress {
  maxClearedStage: number;       // 已通关最高关卡 (0~20)
  unlockedSkills: SkillId[];     // 已解锁技能列表
  skillSlots: number;            // 已解锁技能槽位数 (1~3)
  equippedSkills: SkillId[];     // 当前选定携带的技能
  totalWins: number;
  totalGames: number;
  biggestFlipRecord: number;     // 历史最大单步翻子数记录
  titles: string[];              // 获得的称号列表
  records: MatchRecord[];         // 本机最近完成的对局，用于 Open Design 的「我的棋谱」
  updatedAt: number;
}

export interface MatchRecord {
  id: string;
  finishedAt: number;
  mode: 'ai' | 'local2p' | 'online';
  black: number;
  white: number;
  winner: 1 | 2 | 'DRAW';
  reason: 'BOARD_FULL' | 'BOTH_NO_MOVES' | 'WIPEOUT' | 'SURRENDER' | 'FINISHED';
  steps: number;
  maxFlip: number;
}

const STORAGE_KEY = 'vibe_reversi_user_progress_v1';

export function createDefaultProgress(): UserProgress {
  return {
    maxClearedStage: 0,
    unlockedSkills: ['bomb', 'shield', 'wait'],
    skillSlots: 1,
    equippedSkills: ['bomb', 'shield', 'wait'],
    totalWins: 0,
    totalGames: 0,
    biggestFlipRecord: 0,
    titles: ['初出茅庐'],
    records: [],
    updatedAt: Date.now(),
  };
}

/**
 * 内存兜底存储（用于 Node 单元测试环境）
 */
let memoryStore: Record<string, string> = {};

function getLocalRaw(key: string): string | null {
  const g = globalThis as unknown as {
    wx?: { getStorageSync?: (k: string) => string };
    window?: { localStorage?: { getItem?: (k: string) => string | null } };
  };
  if (g.wx && typeof g.wx.getStorageSync === 'function') {
    try {
      const val = g.wx.getStorageSync(key);
      if (val) return val;
    } catch {
      // ignore
    }
  }
  if (g.window && g.window.localStorage && typeof g.window.localStorage.getItem === 'function') {
    try {
      const val = g.window.localStorage.getItem(key);
      if (val) return val;
    } catch {
      // ignore
    }
  }
  return memoryStore[key] ?? null;
}

function setLocalRaw(key: string, value: string): void {
  memoryStore[key] = value;
  const g = globalThis as unknown as {
    wx?: { setStorageSync?: (k: string, v: string) => void };
    window?: { localStorage?: { setItem?: (k: string, v: string) => void } };
  };
  if (g.wx && typeof g.wx.setStorageSync === 'function') {
    try {
      g.wx.setStorageSync(key, value);
    } catch {
      // ignore
    }
  }
  if (g.window && g.window.localStorage && typeof g.window.localStorage.setItem === 'function') {
    try {
      g.window.localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  }
}

export function loadLocalProgress(): UserProgress {
  const raw = getLocalRaw(STORAGE_KEY);
  if (!raw) return createDefaultProgress();
  try {
    const parsed = JSON.parse(raw) as UserProgress;
    return {
      ...createDefaultProgress(),
      ...parsed,
    };
  } catch {
    return createDefaultProgress();
  }
}

export function saveLocalProgress(progress: UserProgress): void {
  progress.updatedAt = Date.now();
  setLocalRaw(STORAGE_KEY, JSON.stringify(progress));
}

export function appendMatchRecord(
  progress: UserProgress,
  record: MatchRecord
): UserProgress {
  const next: UserProgress = {
    ...progress,
    records: [record, ...progress.records.filter((item) => item.id !== record.id)]
      .sort((a, b) => b.finishedAt - a.finishedAt)
      .slice(0, 30),
    updatedAt: Date.now(),
  };
  saveLocalProgress(next);
  return next;
}

/**
 * 通关某一关后更新进度（解锁技能、解锁槽位、记录称号）
 */
export function recordStageWin(
  progress: UserProgress,
  stageId: number,
  maxFlipInGame: number
): UserProgress {
  const next: UserProgress = {
    ...progress,
    unlockedSkills: [...progress.unlockedSkills],
    equippedSkills: [...progress.equippedSkills],
    titles: [...progress.titles],
    totalGames: progress.totalGames + 1,
    totalWins: progress.totalWins + 1,
    biggestFlipRecord: Math.max(progress.biggestFlipRecord, maxFlipInGame),
    updatedAt: Date.now(),
  };

  if (stageId > next.maxClearedStage) {
    next.maxClearedStage = stageId;
  }

  // 根据已通关关卡解锁技能与槽位
  for (const st of STAGES_CONFIG) {
    if (st.stageId <= next.maxClearedStage) {
      if (st.unlockSkill && !next.unlockedSkills.includes(st.unlockSkill)) {
        next.unlockedSkills.push(st.unlockSkill);
      }
      if (!next.titles.includes(st.rewardTitle)) {
        next.titles.push(st.rewardTitle);
      }
    }
  }

  // 第 5 关通关解锁第 2 槽位，第 10 关通关解锁第 3 槽位
  if (next.maxClearedStage >= 10) {
    next.skillSlots = 3;
  } else if (next.maxClearedStage >= 5) {
    next.skillSlots = 2;
  } else {
    const cfg = getStageConfig(Math.min(20, next.maxClearedStage + 1));
    next.skillSlots = Math.max(next.skillSlots, cfg.playerSkillSlots);
  }

  saveLocalProgress(next);
  return next;
}

/**
 * 合并本地存档与云端存档（取进度更高的一方，换设备不丢）
 */
export function mergeLocalAndCloudProgress(
  local: UserProgress,
  cloud: UserProgress | null
): UserProgress {
  if (!cloud) return local;
  const unlockedSet = new Set<SkillId>([
    ...local.unlockedSkills,
    ...cloud.unlockedSkills,
  ]);
  const titleSet = new Set<string>([...local.titles, ...cloud.titles]);
  const maxClearedStage = Math.max(local.maxClearedStage, cloud.maxClearedStage);
  const skillSlots = Math.max(local.skillSlots, cloud.skillSlots);

  const merged: UserProgress = {
    maxClearedStage,
    unlockedSkills: ALL_SKILL_IDS.filter((id) => unlockedSet.has(id)),
    skillSlots,
    equippedSkills:
      cloud.updatedAt > local.updatedAt
        ? [...cloud.equippedSkills]
        : [...local.equippedSkills],
    totalWins: Math.max(local.totalWins, cloud.totalWins),
    totalGames: Math.max(local.totalGames, cloud.totalGames),
    biggestFlipRecord: Math.max(local.biggestFlipRecord, cloud.biggestFlipRecord),
    titles: Array.from(titleSet),
    records: Array.from(
      new Map(
        [...(local.records ?? []), ...(cloud.records ?? [])].map((record) => [record.id, record])
      ).values()
    ).sort((a, b) => b.finishedAt - a.finishedAt).slice(0, 30),
    updatedAt: Math.max(local.updatedAt, cloud.updatedAt),
  };

  saveLocalProgress(merged);
  return merged;
}
