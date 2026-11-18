import { dispatchRoomAction } from '../../src/net/dispatch';
import { dispatchFriends } from '../../src/friends/rooms';
import type { FriendRoom } from '../../src/friends/rooms';
import { ReversiCloudService, RoomDatabaseAdapter, RoomDocument } from '../../src/net/protocol';
import { UserProgress } from '../../src/net/storage';

interface TransactionStore {
  collection(name: string): {
    doc(id: string): {
      get(): Promise<{ data?: Record<string, unknown> | null }>;
      set(options: { data: Record<string, unknown> }): Promise<unknown>;
    };
  };
}

function transactionAdapter(store: TransactionStore): RoomDatabaseAdapter {
  return {
    async getRoom(roomId) {
      const result = await store.collection('rooms').doc(roomId).get();
      return (result.data as unknown as RoomDocument | null) ?? null;
    },
    async saveRoom(room) {
      const data = { ...room } as unknown as Record<string, unknown>;
      delete data._id;
      await store.collection('rooms').doc(room.roomId).set({ data });
    },
    async getUser(openId) {
      const result = await store.collection('users').doc(openId).get();
      return (result.data?.progress as UserProgress | undefined) ?? null;
    },
    async saveUser(openId, progress) {
      await store.collection('users').doc(openId).set({ data: { openId, progress } });
    },
  };
}

/** Every room mutation runs in a database transaction, including simultaneous joins. */
export async function main(event: unknown): Promise<unknown> {
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    const openId = cloud.getWXContext().OPENID;
    if (typeof openId !== 'string' || !openId.trim()) {
      return { ok: false, error: '无法确认微信身份，请从微信重新进入' };
    }
    const db = cloud.database({ throwOnNotFound: false });
    const input = event && typeof event === 'object'
      ? event as Record<string, unknown>
      : {};
    if (input.action === 'friends') {
      const isMissingCollection = (error: unknown): boolean =>
        /collection not exists|Db or Table not exist/i.test(
          error instanceof Error ? error.message : String(error),
        );
      const createFriendRooms = async (): Promise<void> => {
        const createCollection = (db as unknown as {
          createCollection?: (name: string) => Promise<unknown>;
        }).createCollection;
        if (typeof createCollection === 'function') {
          try { await createCollection.call(db, 'friendRooms'); } catch {}
        }
      };
      try {
        await db.collection('friendRooms').limit(1).get();
      } catch (error) {
        if (isMissingCollection(error)) await createFriendRooms();
      }
      const runFriendsTransaction = () => db.runTransaction((transaction: TransactionStore) =>
        dispatchFriends({
          async get(code) {
            const result = await transaction.collection('friendRooms').doc(code).get();
            return (result.data as unknown as FriendRoom | null) ?? null;
          },
          async set(room) {
            const data = { ...room } as unknown as Record<string, unknown>;
            delete data._id;
            await transaction.collection('friendRooms').doc(room.code).set({ data });
          },
        }, event, openId)
      );
      try {
        return await runFriendsTransaction();
      } catch (error) {
        if (!isMissingCollection(error)) throw error;
        await createFriendRooms();
        return await runFriendsTransaction();
      }
    }
    if (input.action === 'selftest') {
      return await runCloudSelfTest(db, openId);
    }
    try {
      const exists = await db.collection('rooms').limit(1).get();
      void exists;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (/collection not exists|Db or Table not exist/i.test(detail)) {
        const createCollection = (db as unknown as {
          createCollection?: (name: string) => Promise<unknown>;
        }).createCollection;
        if (typeof createCollection === 'function') {
          try { await createCollection.call(db, 'rooms'); } catch {}
        }
      }
    }
    return await db.runTransaction((transaction: TransactionStore) =>
      dispatchRoomAction(new ReversiCloudService(transactionAdapter(transaction)), event, openId)
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: '云端服务暂不可用，请检查环境、集合和云函数部署状态',
      detail: detail.slice(0, 500),
    };
  }
}

async function runCloudSelfTest(
  db: any,
  openId: string
): Promise<unknown> {
  const rooms = db.collection('rooms');
  const guestId = `selftest_guest_${Date.now()}`;
  const now = Date.now();
  const create = await dispatchRoomAction(
    new ReversiCloudService(transactionAdapter(db)),
    {
      action: 'createRoom',
      equippedSkills: ['bomb', 'shield', 'wait'],
      variant: 'skills',
    },
    openId
  ) as { ok: boolean; data?: RoomDocument; error?: string };
  if (!create.ok || !create.data) {
    return { ok: false, step: 'create', create };
  }
  const createdRoomId = create.data.roomId;
  const service = new ReversiCloudService(transactionAdapter(db));
  const join = await service.joinRoom({
    roomId: createdRoomId,
    openId: guestId,
    nickname: '云函数自检棋手',
    equippedSkills: ['steal', 'double', 'wait'],
    now: now + 1,
  });
  if (!join.ok || !join.data?.gameState) {
    return { ok: false, step: 'join', create, join };
  }
  const move = await service.submitMove({
    roomId: createdRoomId,
    openId,
    actionType: 'move',
    row: 2,
    col: 3,
    now: now + 2,
  });
  const sync = await service.syncState({
    roomId: createdRoomId,
    openId,
    now: now + 3,
  });
  const record = await rooms.doc(createdRoomId).get();
  const stored = record.data as RoomDocument | null;
  const result = {
    ok: Boolean(
      move.ok &&
      sync.ok &&
      stored?.gameState?.stepIndex === 1 &&
      stored.hostOpenId === openId
    ),
    roomId: createdRoomId,
    revision: stored?.revision,
    stepIndex: stored?.gameState?.stepIndex,
    blackPieces: stored?.gameState?.board.flat().filter((piece) => piece === 1).length,
    whitePieces: stored?.gameState?.board.flat().filter((piece) => piece === 2).length,
    hasSkills: Boolean(stored?.gameState?.players[1].equippedSkills.length),
    cleanup: false,
  };
  try {
    await rooms.doc(createdRoomId).remove();
    return { ...result, cleanup: true };
  } catch (error) {
    return {
      ...result,
      cleanup: false,
      cleanupError: error instanceof Error ? error.message : String(error),
    };
  }
}
