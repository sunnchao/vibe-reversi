import { ALL_SKILL_IDS, SkillId, SKILLS_CONFIG } from '../config/skills';
import { ReversiCloudService, RuleVariant } from './protocol';

/** Shared, validated RPC boundary. Identity is supplied by the server, never the body. */
export async function dispatchRoomAction(service: ReversiCloudService, raw: unknown, openId: string): Promise<unknown> {
  if (!raw || typeof raw !== 'object') return { ok: false, error: '请求格式不正确' };
  const input = raw as Record<string, unknown>;
  const roomId = typeof input.roomId === 'string' ? input.roomId : '';
  const action = input.action;
  if (action !== 'createRoom' && !/^\d{6}$/.test(roomId)) return { ok: false, error: '请输入 6 位房间号' };
  const suppliedSkills = Array.isArray(input.equippedSkills) ? input.equippedSkills : ['bomb', 'shield', 'wait'];
  const equippedSkills = [...new Set(suppliedSkills)].filter((id): id is SkillId =>
    typeof id === 'string' && ALL_SKILL_IDS.includes(id as SkillId) && SKILLS_CONFIG[id as SkillId].allowInOnline
  ).slice(0, 3);
  const nickname = typeof input.nickname === 'string' ? input.nickname.trim().slice(0, 20) || '棋手' : '棋手';
  const variant: RuleVariant = input.variant === 'classic' ? 'classic' : 'skills';
  if (action === 'createRoom') return service.createRoom({ openId, nickname, equippedSkills, variant });
  if (action === 'joinRoom') return service.joinRoom({ roomId, openId, nickname, equippedSkills });
  if (action === 'syncState') return service.syncState({ roomId, openId, claimDisconnectWin: input.claimDisconnectWin === true });
  if (action === 'leaveRoom') return service.leaveRoom({ roomId, openId });
  if (action === 'respondSkill') {
    if (typeof input.approved !== 'boolean') return { ok: false, error: '缺少请求回应' };
    return service.respondSkill({ roomId, openId, approved: input.approved });
  }
  if (action === 'requestSkill') return service.requestSkill({ roomId, openId, skillId: 'wait' });
  if (action === 'submitMove') {
    const actionType = input.actionType;
    if (actionType !== 'move' && actionType !== 'skill' && actionType !== 'pass' && actionType !== 'surrender') {
      return { ok: false, error: '不支持的对局操作' };
    }
    const skillId = typeof input.skillId === 'string' && ALL_SKILL_IDS.includes(input.skillId as SkillId)
      ? input.skillId as SkillId
      : undefined;
    if (actionType === 'move' || (actionType === 'skill' && skillId !== 'wait' && skillId !== 'undo')) {
      if (!Number.isInteger(input.row) || !Number.isInteger(input.col) ||
        Number(input.row) < 0 || Number(input.row) > 7 || Number(input.col) < 0 || Number(input.col) > 7) {
        return { ok: false, error: '落子坐标不正确' };
      }
    }
    return service.submitMove({
      roomId, openId, actionType, skillId,
      row: input.row as number | undefined,
      col: input.col as number | undefined,
    });
  }
  return { ok: false, error: '不支持的房间操作' };
}
