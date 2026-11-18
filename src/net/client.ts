/**
 * 好友房联机客户端封装（支持微信云开发 wx.cloud.callFunction / db.collection('rooms').doc().watch，
 * 同时内置本地双端云模拟总线，方便在浏览器/单测/微信开发者工具无云环境下直接验证联机流程）
 */

import { SkillId } from '../config/skills';
import { WECHAT_CLOUD_ENV } from '../config/runtime';
import {
  CloudResponse,
  InMemoryCloudDatabase,
  ReversiCloudService,
  RuleVariant,
  RoomDocument,
  SubmitMovePayload,
} from './protocol';

const sharedLocalDb = new InMemoryCloudDatabase();
const sharedLocalCloud = new ReversiCloudService(sharedLocalDb);

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting';

export class OnlineRoomClient {
  private cloudService: ReversiCloudService;
  private db: InMemoryCloudDatabase;
  private unwatchFn: (() => void) | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private watchGeneration = 0;

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
    return Boolean(WECHAT_CLOUD_ENV && g.wx?.cloud && typeof g.wx.cloud.callFunction === 'function');
  }

  private async callRemote<T>(data: Record<string, unknown>): Promise<CloudResponse<T> | null> {
    const g = globalThis as unknown as {
      wx?: {
        cloud: {
          callFunction: (opts: { name: string; data: Record<string, unknown> }) =>
            Promise<{ result: CloudResponse<T> }>;
        };
      };
    };
    if (!g.wx && typeof window === 'undefined') return null;
    try {
      if (g.wx) {
        if (!this.hasWxCloud()) {
          return { ok: false, error: '好友联机需要配置微信云环境；当前可以体验人机与同桌对弈' };
        }
        const response = await g.wx.cloud.callFunction({ name: 'reversiRoom', data });
        return response.result;
      }
      if (!/^https?:$/.test(window.location.protocol)) {
        return { ok: false, error: '请用 npm run preview 启动好友联机预览服务' };
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch('/api/reversi', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'X-Preview-Player': this.openId },
          body: JSON.stringify(data), signal: controller.signal,
        });
        if (!response.ok) return { ok: false, error: '联机服务未启动，请使用 npm run preview' };
        return await response.json() as CloudResponse<T>;
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      return { ok: false, error: '云端连接失败，请检查网络后重试' };
    }
  }

  async createRoom(
    equippedSkills: SkillId[],
    variantOrNow: RuleVariant | number = 'skills',
    explicitNow?: number
  ): Promise<CloudResponse<RoomDocument>> {
    const variant: RuleVariant = typeof variantOrNow === 'string' ? variantOrNow : 'skills';
    const now = typeof variantOrNow === 'number' ? variantOrNow : explicitNow;
    if (now === undefined) {
      const result = await this.callRemote<RoomDocument>({
        action: 'createRoom', openId: this.openId, nickname: this.nickname, equippedSkills, variant,
      });
      if (result) return result;
    }
    return this.cloudService.createRoom({
      openId: this.openId,
      nickname: this.nickname,
      equippedSkills,
      variant,
      now,
    });
  }

  async joinRoom(
    roomId: string,
    equippedSkills: SkillId[],
    now?: number
  ): Promise<CloudResponse<RoomDocument>> {
    if (now === undefined) {
      const result = await this.callRemote<RoomDocument>({
        action: 'joinRoom', roomId, openId: this.openId, nickname: this.nickname, equippedSkills,
      });
      if (result) return result;
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
    if (payload.now === undefined) {
      const result = await this.callRemote<RoomDocument>({
        ...payload, action: 'submitMove', openId: this.openId,
      });
      if (result) return result;
    }
    return this.cloudService.submitMove({
      ...payload,
      openId: this.openId,
    });
  }

  async requestWaitSkill(
    roomId: string,
    now?: number
  ): Promise<CloudResponse<RoomDocument>> {
    if (now === undefined) {
      const result = await this.callRemote<RoomDocument>({
        action: 'requestSkill', roomId, openId: this.openId, skillId: 'wait',
      });
      if (result) return result;
    }
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
    if (now === undefined) {
      const result = await this.callRemote<RoomDocument>({
        action: 'respondSkill', roomId, openId: this.openId, approved,
      });
      if (result) return result;
    }
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
    if (now === undefined) {
      const result = await this.callRemote<{
        room: RoomDocument;
        opponentDisconnected: boolean;
        opponentIdleMs: number;
      }>({ action: 'syncState', roomId, openId: this.openId, claimDisconnectWin });
      if (result) return result;
    }
    return this.cloudService.syncState({
      roomId,
      openId: this.openId,
      claimDisconnectWin,
      now,
    });
  }

  async leaveRoom(roomId: string): Promise<CloudResponse<RoomDocument>> {
    return await this.callRemote<RoomDocument>({ action: 'leaveRoom', roomId }) ??
      this.cloudService.leaveRoom({ roomId, openId: this.openId });
  }

  /**
   * 监听房间实时更新（对应微信云数据库 onUpdate）
   */
  watchRoom(
    roomId: string,
    onUpdate: (room: RoomDocument) => void,
    onStatus?: (status: ConnectionStatus, opponentDisconnected?: boolean) => void
  ): () => void {
    this.stopWatch();
    const generation = this.watchGeneration;
    let revision = -1;
    let polling = false;
    const receive = (room: RoomDocument) => {
      if (generation !== this.watchGeneration) return;
      if (room.revision !== revision) {
        revision = room.revision;
        onUpdate(room);
      }
    };
    const poll = async () => {
      if (polling || generation !== this.watchGeneration) return;
      polling = true;
      try {
        const response = await this.syncState(roomId);
        if (generation !== this.watchGeneration) return;
        if (response.ok && response.data) {
          onStatus?.('connected', response.data.opponentDisconnected);
          receive(response.data.room);
        } else onStatus?.('reconnecting');
      } catch {
        if (generation === this.watchGeneration) onStatus?.('reconnecting');
      } finally { polling = false; }
    };
    const startPolling = (interval: number) => {
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = setInterval(() => { void poll(); }, interval);
      void poll();
    };
    const g = globalThis as unknown as {
      wx?: {
        cloud?: {
          database?: () => {
            collection: (name: string) => {
              where: (query: Record<string, string>) => {
                watch: (options: {
                  onChange: (snapshot: { docs?: RoomDocument[] }) => void;
                  onError?: () => void;
                }) => { close: () => void };
              };
            };
          };
        };
      };
    };
    onStatus?.('connecting');
    if (this.hasWxCloud() && g.wx?.cloud?.database) {
      try {
        const watcher = g.wx.cloud.database().collection('rooms').where({ roomId }).watch({
          onChange: (snapshot) => {
            const room = snapshot.docs?.[0];
            if (room) {
              onStatus?.('connected');
              receive(room);
            }
          },
          onError: () => {
            if (generation !== this.watchGeneration) return;
            onStatus?.('reconnecting');
            startPolling(4000);
          },
        });
        this.unwatchFn = () => watcher.close();
        startPolling(15000);
        return () => this.stopWatch();
      } catch {
        startPolling(4000);
        return () => this.stopWatch();
      }
    }
    if (typeof window !== 'undefined' || this.hasWxCloud()) {
      startPolling(1500);
    } else {
      this.unwatchFn = this.db.watchRoom(roomId, receive);
      onStatus?.('connected');
    }
    return () => this.stopWatch();
  }

  stopWatch(): void {
    this.watchGeneration++;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    if (this.unwatchFn) {
      this.unwatchFn();
      this.unwatchFn = null;
    }
  }
}
