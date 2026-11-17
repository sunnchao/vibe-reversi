/**
 * 好友房联机协议与云函数服务端引擎（前后端共用同一套 core 规则引擎）
 *
 * 数据集合（云数据库）：
 * - rooms：roomId(6位)、hostOpenId、guestOpenId、状态(waiting/playing/finished)、
 *          当前棋盘快照(gameState)、回合方、双方能量/技能/已用次数、步数历史、更新时间、双方心跳时间
 * - users：openId、关卡进度、解锁技能、战绩
 *
 * 云函数核心能力：
 * 1. createRoom / joinRoom（房间号防重复、满房拒绝、过期房 30 分钟自动失效）
 * 2. submitMove：**服务端用同一套 core 逻辑复验这步合法性**，不合法直接拒绝（防改包作弊）
 * 3. requestSkill / respondSkill：「求你等我」的同意/拒绝流转
 * 4. syncState / heartbeat：数据库监听或轮询拉最新状态；90 秒无心跳判掉线，对方可选择等待或判胜退出；中途退出按认输记
 */

import { SkillId } from '../config/skills';
import {
  applyBoardAction,
  cloneGameState,
  createGame,
  GameState,
  passTurn,
  Piece,
  PlayerColor,
  respondToWaitSkill,
  selectSkill,
  surrenderGame,
  useWaitSkill,
} from '../core';
import { UserProgress } from './storage';

export const ROOM_EXPIRE_MS = 30 * 60 * 1000;      // 30 分钟过期自动失效
export const HEARTBEAT_TIMEOUT_MS = 90 * 1000;     // 90 秒无心跳判掉线

export type RoomStatus = 'waiting' | 'playing' | 'finished' | 'expired';

export interface RoomPlayerInfo {
  openId: string;
  nickname: string;
  avatarUrl?: string;
  equippedSkills: SkillId[];
  ready: boolean;
  lastHeartbeatAt: number;
}

export interface RoomDocument {
  roomId: string;
  status: RoomStatus;
  hostOpenId: string;
  guestOpenId: string | null;
  hostInfo: RoomPlayerInfo;
  guestInfo: RoomPlayerInfo | null;
  gameState: GameState | null;
  createdAt: number;
  updatedAt: number;
}

export interface SubmitMovePayload {
  roomId: string;
  openId: string;
  actionType: 'move' | 'skill' | 'pass' | 'surrender';
  skillId?: SkillId;
  row?: number;
  col?: number;
  /** 若玩家选择了金身子后紧接着落子，或者分步提交，均可复验 */
  claimedBoardAfter?: Piece[][]; // 客户端若篡改棋盘上传，服务端对比复验结果直接拒绝
}

export interface CloudResponse<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

/**
 * 抽象云数据库存储接口（可对接微信 wx-server-sdk cloud.database()，也可在单测与本地联机中使用内存数据库）
 */
export interface RoomDatabaseAdapter {
  getRoom(roomId: string): Promise<RoomDocument | null>;
  saveRoom(room: RoomDocument): Promise<void>;
  getUser(openId: string): Promise<UserProgress | null>;
  saveUser(openId: string, progress: UserProgress): Promise<void>;
}

export class InMemoryCloudDatabase implements RoomDatabaseAdapter {
  private rooms = new Map<string, RoomDocument>();
  private users = new Map<string, UserProgress>();
  private listeners = new Map<string, Set<(room: RoomDocument) => void>>();

  async getRoom(roomId: string): Promise<RoomDocument | null> {
    const r = this.rooms.get(roomId);
    if (!r) return null;
    return JSON.parse(JSON.stringify(r)) as RoomDocument;
  }

  async saveRoom(room: RoomDocument): Promise<void> {
    const cloned = JSON.parse(JSON.stringify(room)) as RoomDocument;
    this.rooms.set(room.roomId, cloned);
    const subs = this.listeners.get(room.roomId);
    if (subs) {
      for (const cb of subs) {
        cb(JSON.parse(JSON.stringify(cloned)) as RoomDocument);
      }
    }
  }

  async getUser(openId: string): Promise<UserProgress | null> {
    const u = this.users.get(openId);
    return u ? (JSON.parse(JSON.stringify(u)) as UserProgress) : null;
  }

  async saveUser(openId: string, progress: UserProgress): Promise<void> {
    this.users.set(openId, JSON.parse(JSON.stringify(progress)) as UserProgress);
  }

  watchRoom(roomId: string, callback: (room: RoomDocument) => void): () => void {
    if (!this.listeners.has(roomId)) {
      this.listeners.set(roomId, new Set());
    }
    this.listeners.get(roomId)!.add(callback);
    return () => {
      this.listeners.get(roomId)?.delete(callback);
    };
  }
}

/**
 * 好友房云函数核心控制器（100% 复用 src/core 规则引擎进行防作弊校验）
 */
export class ReversiCloudService {
  constructor(private db: RoomDatabaseAdapter) {}

  private generate6DigitRoomId(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private getPlayerColor(room: RoomDocument, openId: string): PlayerColor | null {
    if (room.hostOpenId === openId) return Piece.Black;
    if (room.guestOpenId === openId) return Piece.White;
    return null;
  }

  /**
   * 1. 创建房间（6 位房间号防重复）
   */
  async createRoom(params: {
    openId: string;
    nickname: string;
    equippedSkills: SkillId[];
    now?: number;
  }): Promise<CloudResponse<RoomDocument>> {
    const now = params.now ?? Date.now();
    let roomId = this.generate6DigitRoomId();
    for (let retry = 0; retry < 10; retry++) {
      const existing = await this.db.getRoom(roomId);
      if (!existing || now - existing.updatedAt > ROOM_EXPIRE_MS) {
        break;
      }
      roomId = this.generate6DigitRoomId();
    }

    const room: RoomDocument = {
      roomId,
      status: 'waiting',
      hostOpenId: params.openId,
      guestOpenId: null,
      hostInfo: {
        openId: params.openId,
        nickname: params.nickname,
        equippedSkills: params.equippedSkills.slice(0, 3),
        ready: true,
        lastHeartbeatAt: now,
      },
      guestInfo: null,
      gameState: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.saveRoom(room);
    return { ok: true, data: room };
  }

  /**
   * 2. 加入房间（防满房、防过期房、支持断线重连恢复）
   */
  async joinRoom(params: {
    roomId: string;
    openId: string;
    nickname: string;
    equippedSkills: SkillId[];
    now?: number;
  }): Promise<CloudResponse<RoomDocument>> {
    const now = params.now ?? Date.now();
    const room = await this.db.getRoom(params.roomId);
    if (!room) {
      return { ok: false, error: '房间不存在，请检查 6 位房间号' };
    }

    // 检查是否超过 30 分钟未更新（过期房自动失效）
    if (now - room.updatedAt > ROOM_EXPIRE_MS) {
      room.status = 'expired';
      await this.db.saveRoom(room);
      return { ok: false, error: '该房间已超过 30 分钟自动失效' };
    }

    // 情况 A：房主或房客断线重进（杀进程重进恢复最新棋盘）
    if (room.hostOpenId === params.openId) {
      room.hostInfo.lastHeartbeatAt = now;
      room.updatedAt = now;
      await this.db.saveRoom(room);
      return { ok: true, data: room };
    }
    if (room.guestOpenId === params.openId && room.guestInfo) {
      room.guestInfo.lastHeartbeatAt = now;
      room.updatedAt = now;
      await this.db.saveRoom(room);
      return { ok: true, data: room };
    }

    // 情况 B：房间已满
    if (room.guestOpenId && room.guestOpenId !== params.openId) {
      return { ok: false, error: '房间人数已满' };
    }

    // 情况 C：新房客加入并自动开局（黑先：房主执黑，房客执白）
    room.guestOpenId = params.openId;
    room.guestInfo = {
      openId: params.openId,
      nickname: params.nickname,
      equippedSkills: params.equippedSkills.slice(0, 3),
      ready: true,
      lastHeartbeatAt: now,
    };
    room.status = 'playing';
    room.gameState = createGame({
      mode: 'online',
      blackSkills: room.hostInfo.equippedSkills,
      whiteSkills: room.guestInfo.equippedSkills,
    });
    room.updatedAt = now;

    await this.db.saveRoom(room);
    return { ok: true, data: room };
  }

  /**
   * 3. 提交一步操作（服务端用同一套 core 逻辑复验合法性，不合法直接拒绝）
   */
  async submitMove(
    payload: SubmitMovePayload & { now?: number }
  ): Promise<CloudResponse<RoomDocument>> {
    const now = payload.now ?? Date.now();
    const room = await this.db.getRoom(payload.roomId);
    if (!room || !room.gameState) {
      return { ok: false, error: '房间不存在或对局尚未开始' };
    }
    if (room.status !== 'playing') {
      return { ok: false, error: '对局已结束或未处于进行中' };
    }

    const playerColor = this.getPlayerColor(room, payload.openId);
    if (!playerColor) {
      return { ok: false, error: '非本房间对局玩家' };
    }

    // 更新心跳
    if (playerColor === Piece.Black) {
      room.hostInfo.lastHeartbeatAt = now;
    } else if (room.guestInfo) {
      room.guestInfo.lastHeartbeatAt = now;
    }

    // 中途退出 / 主动认输：任何回合均可认输
    if (payload.actionType === 'surrender') {
      room.gameState = surrenderGame(room.gameState, playerColor);
      room.status = 'finished';
      room.updatedAt = now;
      await this.db.saveRoom(room);
      return { ok: true, data: room };
    }

    // 严格校验当前回合归属
    if (room.gameState.currentPlayer !== playerColor) {
      return { ok: false, error: '非法操作：当前不是你的回合' };
    }

    let state = cloneGameState(room.gameState);

    // 情况 1：跳过回合 (pass)
    if (payload.actionType === 'pass') {
      const passRes = passTurn(state);
      if (!passRes.ok) {
        return { ok: false, error: `服务端校验拒绝：${passRes.reason}` };
      }
      state = passRes.state;
    }
    // 情况 2：选择了技能并在棋盘(row, col)释放
    else if (payload.actionType === 'skill') {
      if (!payload.skillId) {
        return { ok: false, error: '服务端校验拒绝：缺少 skillId' };
      }
      if (payload.skillId === 'undo') {
        return { ok: false, error: '服务端校验拒绝：联机模式禁用悔棋时光' };
      }
      if (payload.skillId === 'wait') {
        const waitRes = useWaitSkill(state);
        if (!waitRes.ok) {
          return { ok: false, error: `服务端校验拒绝：${waitRes.reason}` };
        }
        state = waitRes.state;
      } else {
        // 如果尚未处于连落双子第 2 步，先调用 selectSkill 验证能量与次数
        if (
          !(
            state.selectedSkill?.skillId === 'double' &&
            state.selectedSkill.doubleStep === 2
          )
        ) {
          const selRes = selectSkill(state, payload.skillId);
          if (!selRes.ok) {
            return { ok: false, error: `服务端校验拒绝：${selRes.reason}` };
          }
          state = selRes.state;
        }
        if (typeof payload.row !== 'number' || typeof payload.col !== 'number') {
          return { ok: false, error: '服务端校验拒绝：缺少落子坐标' };
        }
        const actRes = applyBoardAction(state, payload.row, payload.col);
        if (!actRes.ok) {
          return { ok: false, error: `服务端校验拒绝：${actRes.reason}` };
        }
        state = actRes.state;
      }
    }
    // 情况 3：普通落子
    else if (payload.actionType === 'move') {
      if (typeof payload.row !== 'number' || typeof payload.col !== 'number') {
        return { ok: false, error: '服务端校验拒绝：缺少落子坐标' };
      }
      const moveRes = applyBoardAction(state, payload.row, payload.col);
      if (!moveRes.ok) {
        return { ok: false, error: `服务端校验拒绝：${moveRes.reason}` };
      }
      state = moveRes.state;
    } else {
      return { ok: false, error: '未知操作类型' };
    }

    // 如果客户端附带了篡改后的棋盘快照，服务端比对不一致立即拒绝
    if (payload.claimedBoardAfter) {
      const expectedJson = JSON.stringify(state.board);
      const claimedJson = JSON.stringify(payload.claimedBoardAfter);
      if (expectedJson !== claimedJson) {
        return {
          ok: false,
          error: '服务端防作弊拦截：客户端棋盘状态与服务端引擎计算结果不一致',
        };
      }
    }

    room.gameState = state;
    if (state.isGameOver) {
      room.status = 'finished';
    }
    room.updatedAt = now;
    await this.db.saveRoom(room);

    return { ok: true, data: room };
  }

  /**
   * 4. 「求你等我」请求与响应流转（requestSkill / respondSkill）
   */
  async requestSkill(params: {
    roomId: string;
    openId: string;
    skillId: SkillId;
    now?: number;
  }): Promise<CloudResponse<RoomDocument>> {
    return this.submitMove({
      roomId: params.roomId,
      openId: params.openId,
      actionType: 'skill',
      skillId: params.skillId,
      now: params.now,
    });
  }

  async respondSkill(params: {
    roomId: string;
    openId: string;
    approved: boolean;
    now?: number;
  }): Promise<CloudResponse<RoomDocument>> {
    const now = params.now ?? Date.now();
    const room = await this.db.getRoom(params.roomId);
    if (!room || !room.gameState) {
      return { ok: false, error: '房间不存在' };
    }

    const responderColor = this.getPlayerColor(room, params.openId);
    if (!responderColor) {
      return { ok: false, error: '非本房间玩家' };
    }

    const pending = room.gameState.pendingWaitRequest;
    if (!pending) {
      return { ok: false, error: '当前没有待处理的技能请求' };
    }
    if (pending.requester === responderColor) {
      return { ok: false, error: '不能自己同意自己的「求你等我」请求' };
    }

    const res = respondToWaitSkill(room.gameState, params.approved);
    if (!res.ok) {
      return { ok: false, error: res.reason };
    }

    room.gameState = res.state;
    room.updatedAt = now;
    await this.db.saveRoom(room);
    return { ok: true, data: room };
  }

  /**
   * 5. 同步状态、心跳与 90 秒断线判定（syncState）
   * - 90 秒无心跳判掉线，对方可选择等待或 claimTimeoutWin 判胜退出
   */
  async syncState(params: {
    roomId: string;
    openId: string;
    claimDisconnectWin?: boolean;
    now?: number;
  }): Promise<
    CloudResponse<{
      room: RoomDocument;
      opponentDisconnected: boolean;
      opponentIdleMs: number;
    }>
  > {
    const now = params.now ?? Date.now();
    const room = await this.db.getRoom(params.roomId);
    if (!room) {
      return { ok: false, error: '房间不存在' };
    }

    const playerColor = this.getPlayerColor(room, params.openId);
    if (playerColor === Piece.Black) {
      room.hostInfo.lastHeartbeatAt = now;
    } else if (playerColor === Piece.White && room.guestInfo) {
      room.guestInfo.lastHeartbeatAt = now;
    }

    let opponentIdleMs = 0;
    if (playerColor === Piece.Black && room.guestInfo) {
      opponentIdleMs = now - room.guestInfo.lastHeartbeatAt;
    } else if (playerColor === Piece.White) {
      opponentIdleMs = now - room.hostInfo.lastHeartbeatAt;
    }

    const opponentDisconnected =
      room.status === 'playing' && opponentIdleMs >= HEARTBEAT_TIMEOUT_MS;

    // 若对方已掉线满 90 秒且当前玩家选择直接判胜退出
    if (
      opponentDisconnected &&
      params.claimDisconnectWin &&
      room.gameState &&
      playerColor
    ) {
      const opponentColor =
        playerColor === Piece.Black ? Piece.White : Piece.Black;
      room.gameState = surrenderGame(room.gameState, opponentColor);
      room.status = 'finished';
      room.updatedAt = now;
    }

    await this.db.saveRoom(room);
    return {
      ok: true,
      data: {
        room,
        opponentDisconnected,
        opponentIdleMs,
      },
    };
  }
}
