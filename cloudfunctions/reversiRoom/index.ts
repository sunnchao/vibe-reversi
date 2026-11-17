/**
 * 微信云开发云函数入口：reversiRoom
 * 复用 src/core 规则引擎与 src/net/protocol 的 ReversiCloudService，
 * 服务端严格复验每步落子与技能合法性，防止客户端改包作弊。
 */

import { SkillId } from '../../src/config/skills';
import { Piece } from '../../src/core';
import {
  InMemoryCloudDatabase,
  ReversiCloudService,
  RoomDatabaseAdapter,
  RoomDocument,
  UserProgress,
} from '../../src/net';

// 若在真实微信云开发环境中运行，自动挂载 wx-server-sdk 数据库集合 `rooms` 与 `users`
function createCloudDbAdapter(): RoomDatabaseAdapter {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    const db = cloud.database();
    const roomsCol = db.collection('rooms');
    const usersCol = db.collection('users');

    return {
      async getRoom(roomId: string): Promise<RoomDocument | null> {
        const res = await roomsCol.where({ roomId }).limit(1).get();
        return (res.data && res.data[0]) || null;
      },
      async saveRoom(room: RoomDocument): Promise<void> {
        const existing = await roomsCol.where({ roomId: room.roomId }).limit(1).get();
        if (existing.data && existing.data.length > 0) {
          const docId = existing.data[0]._id;
          const copy = { ...room } as Record<string, unknown>;
          delete copy._id;
          await roomsCol.doc(docId).update({ data: copy });
        } else {
          await roomsCol.add({ data: room });
        }
      },
      async getUser(openId: string): Promise<UserProgress | null> {
        const res = await usersCol.where({ openId }).limit(1).get();
        return (res.data && res.data[0]?.progress) || null;
      },
      async saveUser(openId: string, progress: UserProgress): Promise<void> {
        const existing = await usersCol.where({ openId }).limit(1).get();
        if (existing.data && existing.data.length > 0) {
          await usersCol.doc(existing.data[0]._id).update({
            data: { progress, updatedAt: Date.now() },
          });
        } else {
          await usersCol.add({
            data: { openId, progress, updatedAt: Date.now() },
          });
        }
      },
    };
  } catch {
    return new InMemoryCloudDatabase();
  }
}

const adapter = createCloudDbAdapter();
const service = new ReversiCloudService(adapter);

export interface CloudEvent {
  action:
    | 'createRoom'
    | 'joinRoom'
    | 'submitMove'
    | 'requestSkill'
    | 'respondSkill'
    | 'syncState';
  roomId?: string;
  openId?: string;
  nickname?: string;
  equippedSkills?: SkillId[];
  actionType?: 'move' | 'skill' | 'pass' | 'surrender';
  skillId?: SkillId;
  row?: number;
  col?: number;
  approved?: boolean;
  claimDisconnectWin?: boolean;
  claimedBoardAfter?: Piece[][];
}

export async function main(event: CloudEvent, context?: unknown): Promise<unknown> {
  void context;
  const openId = event.openId ?? 'wx_anonymous_openid';

  switch (event.action) {
    case 'createRoom':
      return service.createRoom({
        openId,
        nickname: event.nickname ?? '微信玩家',
        equippedSkills: event.equippedSkills ?? ['bomb', 'shield', 'wait'],
      });
    case 'joinRoom':
      return service.joinRoom({
        roomId: event.roomId ?? '',
        openId,
        nickname: event.nickname ?? '好友玩家',
        equippedSkills: event.equippedSkills ?? ['bomb', 'shield', 'wait'],
      });
    case 'submitMove':
      return service.submitMove({
        roomId: event.roomId ?? '',
        openId,
        actionType: event.actionType ?? 'move',
        skillId: event.skillId,
        row: event.row,
        col: event.col,
        claimedBoardAfter: event.claimedBoardAfter,
      });
    case 'requestSkill':
      return service.requestSkill({
        roomId: event.roomId ?? '',
        openId,
        skillId: event.skillId ?? 'wait',
      });
    case 'respondSkill':
      return service.respondSkill({
        roomId: event.roomId ?? '',
        openId,
        approved: Boolean(event.approved),
      });
    case 'syncState':
      return service.syncState({
        roomId: event.roomId ?? '',
        openId,
        claimDisconnectWin: event.claimDisconnectWin,
      });
    default:
      return { ok: false, error: `未知云函数 action: ${String(event.action)}` };
  }
}
