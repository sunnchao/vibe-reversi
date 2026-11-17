/**
 * 好友房联机客户端封装（支持微信云开发 wx.cloud.callFunction / db.collection('rooms').doc().watch，
 * 同时内置本地双端云模拟总线，方便在浏览器/单测/微信开发者工具无云环境下直接验证联机流程）
 */

import { SkillId } from '../config/skills';
import {
  CloudResponse,
  InMemoryCloudDatabase,
  ReversiCloudService,
  RoomDocument,
  SubmitMovePayload,
} from './protocol';

const sharedLocalDb = new InMemoryCloudDatabase();
const sharedLocalCloud = new ReversiCloudService(sharedLocalDb);

export class OnlineRoomClient {
  private cloudService: ReversiCloudService;
  private db: InMemoryCloudDatabase;
  private unwatchFn: (() => void) | null = null;

  constructor(
    public readonly openId: string,
    public readonly nickname: string,
    customService?: { db: InMemoryCloudDatabase; service: ReversiCloudService }
  ) {
    this.db = customService?.db ?? sharedLocalDb;
    this.cloudService = customService?.service ?? sharedLocalCloud;
  }

  private hasWxCloud(): boolean {
    const g = globalThis as unknown as {
      wx?: { cloud?: { callFunction?: unknown } };
    };
    return Boolean(g.wx && g.wx.cloud && typeof g.wx.cloud.callFunction === 'function');
  }

  async createRoom(equippedSkills: SkillId[], now?: number): Promise<CloudResponse<RoomDocument>> {
    if (this.hasWxCloud() && now === undefined) {
      try {
        const g = globalThis as unknown as {
          wx: {
            cloud: {
              callFunction: (opts: {
                name: string;
                data: Record<string, unknown>;
              }) => Promise<{ result: CloudResponse<RoomDocument> }>;
            };
          };
        };
        const res = await g.wx.cloud.callFunction({
          name: 'reversiRoom',
          data: {
            action: 'createRoom',
            openId: this.openId,
            nickname: this.nickname,
            equippedSkills,
          },
        });
        return res.result;
      } catch {
        // fallback to local cloud service
      }
    }
    return this.cloudService.createRoom({
      openId: this.openId,
      nickname: this.nickname,
      equippedSkills,
      now,
    });
  }

  async joinRoom(
    roomId: string,
    equippedSkills: SkillId[],
    now?: number
  ): Promise<CloudResponse<RoomDocument>> {
    if (this.hasWxCloud() && now === undefined) {
      try {
        const g = globalThis as unknown as {
          wx: {
            cloud: {
              callFunction: (opts: {
                name: string;
                data: Record<string, unknown>;
              }) => Promise<{ result: CloudResponse<RoomDocument> }>;
            };
          };
        };
        const res = await g.wx.cloud.callFunction({
          name: 'reversiRoom',
          data: {
            action: 'joinRoom',
            roomId,
            openId: this.openId,
            nickname: this.nickname,
            equippedSkills,
          },
        });
        return res.result;
      } catch {
        // fallback
      }
    }
    return this.cloudService.joinRoom({
      roomId,
      openId: this.openId,
      nickname: this.nickname,
      equippedSkills,
      now,
    });
  }

  async submitMove(
    payload: Omit<SubmitMovePayload, 'openId'> & { now?: number }
  ): Promise<CloudResponse<RoomDocument>> {
    return this.cloudService.submitMove({
      ...payload,
      openId: this.openId,
    });
  }

  async requestWaitSkill(
    roomId: string,
    now?: number
  ): Promise<CloudResponse<RoomDocument>> {
    return this.cloudService.requestSkill({
      roomId,
      openId: this.openId,
      skillId: 'wait',
      now,
    });
  }

  async respondWaitSkill(
    roomId: string,
    approved: boolean,
    now?: number
  ): Promise<CloudResponse<RoomDocument>> {
    return this.cloudService.respondSkill({
      roomId,
      openId: this.openId,
      approved,
      now,
    });
  }

  async syncState(
    roomId: string,
    claimDisconnectWin = false,
    now?: number
  ): Promise<
    CloudResponse<{
      room: RoomDocument;
      opponentDisconnected: boolean;
      opponentIdleMs: number;
    }>
  > {
    return this.cloudService.syncState({
      roomId,
      openId: this.openId,
      claimDisconnectWin,
      now,
    });
  }

  /**
   * 监听房间实时更新（对应微信云数据库 onUpdate）
   */
  watchRoom(roomId: string, onUpdate: (room: RoomDocument) => void): () => void {
    this.stopWatch();
    this.unwatchFn = this.db.watchRoom(roomId, onUpdate);
    return () => this.stopWatch();
  }

  stopWatch(): void {
    if (this.unwatchFn) {
      this.unwatchFn();
      this.unwatchFn = null;
    }
  }
}
