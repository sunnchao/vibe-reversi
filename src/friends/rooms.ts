import {
  applyInsight,
  makeGame,
  playMove,
  resignGame,
} from './game';
import type { Color, FriendGame, SkillKey, Variant } from './game';

export const INVITE_TTL = 10 * 60 * 1000;
export const DISCONNECT_MS = 90 * 1000;

export interface FriendRoom {
  code: string;
  // Authenticated actor IDs: WeChat OPENID in production, preview ID on H5.
  // Clients cannot supply these; dispatchFriends only receives the verified actor.
  hostId: string;
  guestId: string | null;
  hostName?: string;
  hostAvatar?: string;
  guestName?: string;
  guestAvatar?: string;
  phase: 'waiting' | 'playing' | 'finished' | 'closed';
  rev: number;
  created: number;
  updated: number;
  expires: number;
  hostSeen: number;
  guestSeen: number;
  game: FriendGame;
}

export interface FriendRequest {
  action: 'friends';
  op: 'create' | 'join' | 'start' | 'move' | 'insight' | 'resign' | 'rematch' | 'leave' | 'sync';
  code?: string;
  rev?: number;
  index?: number;
  skill?: SkillKey | null;
  variant?: Variant;
  name?: string;
  avatar?: string;
}

export interface FriendResponse {
  ok: boolean;
  room?: FriendRoom;
  color?: Color;
  error?: string;
}

export interface FriendRoomStore {
  get(code: string): Promise<FriendRoom | null>;
  set(room: FriendRoom): Promise<void>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class MemoryFriendRoomStore implements FriendRoomStore {
  private readonly rooms = new Map<string, FriendRoom>();

  async get(code: string): Promise<FriendRoom | null> {
    const room = this.rooms.get(code);
    return room ? clone(room) : null;
  }

  async set(room: FriendRoom): Promise<void> {
    this.rooms.set(room.code, clone(room));
  }
}

const OPS: FriendRequest['op'][] = ['create', 'join', 'start', 'move', 'insight', 'resign', 'rematch', 'leave', 'sync'];

export function sharedAvatar(value = ''): string {
  const avatar = value.trim();
  return /^cloud:\/\/[\w.-]+\/\S+$|^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+([/:?#]\S*)?$/i.test(avatar) ? avatar : '';
}

function parse(input: unknown): FriendRequest | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  if (data.action !== 'friends' || !OPS.includes(data.op as FriendRequest['op'])) return null;
  if (data.code !== undefined && (typeof data.code !== 'string' || !/^\d{6}$/.test(data.code))) return null;
  if (data.rev !== undefined && (!Number.isSafeInteger(data.rev) || (data.rev as number) < 0)) return null;
  if (data.index !== undefined && (!Number.isInteger(data.index) || (data.index as number) < 0 || (data.index as number) >= 64)) return null;
  if (data.skill !== undefined && data.skill !== null && data.skill !== 'bomb' && data.skill !== 'insight' && data.skill !== 'charge') return null;
  if (data.variant !== undefined && data.variant !== 'classic' && data.variant !== 'skills') return null;
  if (data.op !== 'create' && data.code === undefined) return null;
  if (data.op === 'move' && data.index === undefined) return null;
  if (data.op !== 'create' && data.op !== 'join' && data.op !== 'sync' && data.rev === undefined) return null;
  if (data.name !== undefined && (typeof data.name !== 'string' || data.name.length > 24)) return null;
  // A WeChat cloud-storage temporary URL carries a signed query string.
  if (data.avatar !== undefined && (typeof data.avatar !== 'string' || data.avatar.length > 2048)) return null;
  return data as unknown as FriendRequest;
}

// Profile fields are display-only; trim them so a room document stays small.
function profileOf(request: FriendRequest): { name?: string; avatar?: string } {
  return { name: request.name?.trim() || undefined, avatar: sharedAvatar(request.avatar) || undefined };
}

function failure(error: string): FriendResponse {
  return { ok: false, error };
}

function seen(room: FriendRoom, color: Color, now: number): void {
  if (color === 1) room.hostSeen = now;
  else room.guestSeen = now;
}

function peerLive(room: FriendRoom, color: Color, now: number): boolean {
  return Boolean(room.guestId) && now - (color === 1 ? room.guestSeen : room.hostSeen) < DISCONNECT_MS;
}

function finishDisconnectedPeer(room: FriendRoom, color: Color, now: number): boolean {
  if (room.phase !== 'playing' || !room.guestId || peerLive(room, color, now)) return false;
  room.game = resignGame(room.game, color === 1 ? 2 : 1, 'disconnect');
  room.phase = 'finished';
  room.rev++;
  return true;
}

/** Callers serialize this function, or run it inside their database transaction. */
export async function dispatchFriends(
  store: FriendRoomStore,
  input: unknown,
  actor: string,
  now: number = Date.now(),
): Promise<FriendResponse> {
  if (typeof actor !== 'string' || !actor.trim()) return failure('无法确认棋手身份');
  const request = parse(input);
  if (!request) return failure('房间请求格式无效');
  if (!Number.isFinite(now)) return failure('服务器时间无效');

  const save = async (room: FriendRoom, color: Color): Promise<FriendResponse> => {
    room.updated = now;
    seen(room, color, now);
    await store.set(room);
    return { ok: true, room: clone(room), color };
  };

  if (request.op === 'create') {
    for (let attempt = 0; attempt < 30; attempt++) {
      const code = String(100000 + Math.floor(Math.random() * 900000));
      // Never recycle an existing code, even a closed or expired one: a late
      // request must not accidentally address a different invitation.
      if (await store.get(code)) continue;
      const game = makeGame('room', 'easy', request.variant ?? 'skills');
      game.started = now;
      const host = profileOf(request);
      const room: FriendRoom = {
        code, hostId: actor, guestId: null, phase: 'waiting', rev: 0,
        created: now, updated: now, expires: now + INVITE_TTL,
        hostSeen: now, guestSeen: 0, game,
        ...(host.name ? { hostName: host.name } : {}),
        ...(host.avatar ? { hostAvatar: host.avatar } : {}),
      };
      return save(room, 1);
    }
    return failure('暂时无法分配房间号，请重试');
  }

  const stored = await store.get(request.code!);
  if (!stored) return failure('未找到这张棋桌');
  const room = clone(stored);
  const color: Color | null = actor === room.hostId ? 1 : actor === room.guestId ? 2 : null;

  if (!color) {
    if (request.op !== 'join') return failure('你没有入座这张棋桌');
    if (room.phase === 'closed') return failure('房主已收起棋桌');
    if (room.guestId || room.phase !== 'waiting') return failure('这张棋桌已满或正在对局');
    if (now >= room.expires) return failure('邀请已过期，请好友重新开桌');
    room.guestId = actor;
    const guest = profileOf(request);
    if (guest.name) room.guestName = guest.name;
    else delete room.guestName;
    if (guest.avatar) room.guestAvatar = guest.avatar;
    else delete room.guestAvatar;
    room.rev++;
    return save(room, 2);
  }

  // Members can observe closure; nobody can mutate or rejoin a closed room.
  if (room.phase === 'closed') {
    return request.op === 'sync'
      ? { ok: true, room, color }
      : failure('房主已收起棋桌');
  }

  // A returning host (e.g. opening their own shared invite) may refresh their own profile.
  if (request.op === 'sync' || request.op === 'join') {
    const self = profileOf(request);
    if (color === 1) {
      if (self.name) room.hostName = self.name;
      if (self.avatar) room.hostAvatar = self.avatar;
    } else {
      if (self.name) room.guestName = self.name;
      if (self.avatar) room.guestAvatar = self.avatar;
    }
    finishDisconnectedPeer(room, color, now);
    return save(room, color);
  }

  if (request.rev !== room.rev) return failure('棋局已更新，请同步后重试');

  if (request.op === 'leave') {
    if (color === 1) room.phase = 'closed';
    else {
      room.guestId = null;
      room.guestSeen = 0;
      delete room.guestName;
      delete room.guestAvatar;
      room.phase = 'waiting';
    }
    room.rev++;
    // The departed guest no longer occupies a heartbeat slot.
    room.updated = now;
    if (color === 1) room.hostSeen = now;
    await store.set(room);
    return { ok: true, room: clone(room), color };
  }

  if (request.op === 'start' || request.op === 'rematch') {
    if (color !== 1) return failure('请等待房主开始这一局');
    if (!room.guestId) return failure('请先等待好友入座');
    if (!peerLive(room, color, now)) return failure('好友暂时离线，请等待重连');
    if (request.op === 'start') {
      if (room.phase !== 'waiting' || room.game.over) return failure('当前不能开始，请等待或重新开局');
    } else {
      if (!room.game.over) return failure('请先完成当前对局');
      const game = makeGame('room', room.game.diff, room.game.variant, room.game.chapter);
      game.started = now;
      room.game = game;
    }
    room.phase = 'playing';
    room.rev++;
    return save(room, color);
  }

  if (room.phase !== 'playing' || room.game.over) return failure('当前不在对局中');
  if (request.op === 'resign') {
    room.game = resignGame(room.game, color);
    room.phase = 'finished';
    room.rev++;
    return save(room, color);
  }

  if (room.game.turn !== color) return failure('还没轮到你落子');
  const result = request.op === 'insight'
    ? applyInsight(room.game, color)
    : playMove(room.game, request.index!, color, request.skill ?? null);
  if (!result.ok) return failure(result.error ?? '无法执行这一步');
  if (finishDisconnectedPeer(room, color, now)) return save(room, color);
  room.game = result.game;
  if (room.game.over) room.phase = 'finished';
  room.rev++;
  return save(room, color);
}
