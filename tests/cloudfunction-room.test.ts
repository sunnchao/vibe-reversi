import NodeModule from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FriendRequest, FriendResponse } from '../src/friends/rooms';

// Resolve the source explicitly, rather than the generated sibling index.js.
const sourcePath = '../cloudfunctions/reversiRoom/index.ts';
const { main }: typeof import('../cloudfunctions/reversiRoom/index') = await import(sourcePath);

type Data = Record<string, unknown>;
type VersionedDocument = { version: number; data: Data };
type Read = { code: string; version: number; data: Data | null };
type Write = { code: string; data: Data };
type Attempt = {
  reads: Read[];
  writes: Write[];
  outcome: 'pending' | 'committed' | 'conflict' | 'failed';
};
interface Transaction {
  collection(name: string): {
    doc(code: string): {
      get(): Promise<{ data: Data | null }>;
      set(options: { data: Data }): Promise<void>;
    };
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Document snapshots, staged writes, atomic version validation, and callback retry. */
class SerializableRoomDatabase {
  exists = true;
  missingMessage = 'collection not exists: friendRooms';
  afterProbe?: () => void;
  readError?: unknown;
  readonly documents = new Map<string, VersionedDocument>();
  readonly attempts: Attempt[] = [];
  private barrier?: { code: string; remaining: number; ready: Promise<void>; release(): void };

  readonly probe = vi.fn(async () => {
    this.assertExists();
    const afterProbe = this.afterProbe;
    this.afterProbe = undefined;
    afterProbe?.();
    return { data: [] };
  });

  // No nontransactional doc API: room reads and writes must use the transaction.
  readonly collection = vi.fn((name: string) => {
    this.assertName(name);
    return { limit: (_count: number) => ({ get: this.probe }) };
  });

  readonly createCollection = vi.fn(async (name: string) => {
    this.assertName(name);
    this.exists = true;
  });

  readonly runTransaction = vi.fn(async (work: (transaction: Transaction) => Promise<unknown>) => {
    for (let retry = 0; retry < 5; retry++) {
      const snapshot = new Map(
        [...this.documents].map(([code, document]) => [code, clone(document)]),
      );
      const readVersions = new Map<string, number>();
      const staged = new Map<string, Data>();
      const attempt: Attempt = { reads: [], writes: [], outcome: 'pending' };
      this.attempts.push(attempt);
      const transaction: Transaction = {
        collection: (name) => {
          this.assertName(name);
          return {
            doc: (code) => ({
              get: async () => {
                this.assertExists();
                if (this.readError !== undefined) throw this.readError;
                const document = snapshot.get(code);
                const version = document?.version ?? 0;
                const data = document ? { ...clone(document.data), _id: code } : null;
                readVersions.set(code, version);
                attempt.reads.push({ code, version, data: clone(data) });
                const barrier = this.barrier;
                if (barrier?.code === code && barrier.remaining > 0) {
                  if (--barrier.remaining === 0) {
                    this.barrier = undefined;
                    barrier.release();
                  }
                  await barrier.ready;
                }
                return { data };
              },
              set: async ({ data }) => {
                this.assertExists();
                // Log and validate the actual SDK payload, before staging it.
                attempt.writes.push({ code, data: clone(data) });
                if ('_id' in data) throw new Error('Cannot write reserved field _id');
                if (!readVersions.has(code)) {
                  readVersions.set(code, snapshot.get(code)?.version ?? 0);
                }
                staged.set(code, clone(data));
              },
            }),
          };
        },
      };

      let response: unknown;
      try {
        response = await work(transaction);
      } catch (error) {
        attempt.outcome = 'failed';
        throw error;
      }
      if ([...readVersions].some(([code, version]) =>
        (this.documents.get(code)?.version ?? 0) !== version)) {
        attempt.outcome = 'conflict';
        // Discard the response and all writes, then re-execute the real callback.
        continue;
      }
      // No await between validation and publishing: this commit is atomic.
      for (const [code, data] of staged) {
        this.documents.set(code, {
          version: (this.documents.get(code)?.version ?? 0) + 1,
          data: clone(data),
        });
      }
      attempt.outcome = 'committed';
      return response;
    }
    throw new Error('Serializable transaction retry limit reached');
  });

  overlapNextTwoReads(code: string): void {
    let release!: () => void;
    const ready = new Promise<void>((resolve) => { release = resolve; });
    this.barrier = { code, remaining: 2, ready, release };
  }

  private assertName(name: string): void {
    if (name !== 'friendRooms') throw new Error(`Unexpected collection: ${name}`);
  }

  private assertExists(): void {
    if (!this.exists) throw new Error(this.missingMessage);
  }
}

// vi.mock does not intercept require('wx-server-sdk'); hook only that CJS request.
const loader = NodeModule as unknown as {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};

function makeSdk(db: SerializableRoomDatabase) {
  return {
    DYNAMIC_CURRENT_ENV: 'test-dynamic-env',
    init: vi.fn(),
    getWXContext: vi.fn<[], { OPENID?: unknown }>(),
    database: vi.fn(() => db),
  };
}

describe('好友房云函数入口（真实 main / dispatchFriends）', () => {
  let db: SerializableRoomDatabase;
  let sdk: ReturnType<typeof makeSdk>;

  beforeEach(() => {
    db = new SerializableRoomDatabase();
    sdk = makeSdk(db);
    const originalLoad = loader._load;
    vi.spyOn(loader, '_load').mockImplementation((request, parent, isMain) =>
      request === 'wx-server-sdk'
        ? sdk
        : originalLoad.call(NodeModule, request, parent, isMain),
    );
    vi.spyOn(Date, 'now').mockReturnValue(1_730_000_000_000);
  });

  afterEach(() => { vi.restoreAllMocks(); });

  function invoke(openId: unknown, event: FriendRequest): Promise<FriendResponse & { detail?: string }> {
    // main reads this synchronously, before yielding; concurrent calls keep distinct actors.
    sdk.getWXContext.mockReturnValueOnce({ OPENID: openId });
    return main(event) as Promise<FriendResponse & { detail?: string }>;
  }

  async function createRoom() {
    const response = await invoke('host-openid', { action: 'friends', op: 'create' });
    expect(response.ok).toBe(true);
    expect(response.room).toMatchObject({ hostId: 'host-openid', guestId: null, rev: 0 });
    return response.room!;
  }

  it.each([
    { label: '空字符串', openId: '' },
    { label: '缺失', openId: undefined },
    { label: 'null', openId: null },
    { label: '纯空白', openId: ' \t ' },
  ])('OPENID $label 时直接拒绝，完全不触数据库', async ({ openId }) => {
    const response = await invoke(openId, { action: 'friends', op: 'create' });
    expect(response).toEqual({ ok: false, error: '无法确认微信身份，请从微信重新进入' });
    expect(sdk.init).toHaveBeenCalledWith({ env: sdk.DYNAMIC_CURRENT_ENV });
    expect(sdk.database).not.toHaveBeenCalled();
    expect(db.collection).not.toHaveBeenCalled();
    expect(db.createCollection).not.toHaveBeenCalled();
    expect(db.runTransaction).not.toHaveBeenCalled();
    expect(db.documents.size).toBe(0);
  });

  it('首次探测发现缺失 friendRooms 时创建集合，再执行真实建房事务', async () => {
    db.exists = false;
    const room = await createRoom();
    expect(sdk.database).toHaveBeenCalledWith({ throwOnNotFound: false });
    expect(db.collection).toHaveBeenCalledWith('friendRooms');
    expect(db.probe).toHaveBeenCalledTimes(1);
    expect(db.createCollection).toHaveBeenCalledTimes(1);
    expect(db.createCollection).toHaveBeenCalledWith('friendRooms');
    expect(db.runTransaction).toHaveBeenCalledTimes(1);
    expect(db.createCollection.mock.invocationCallOrder[0]).toBeLessThan(
      db.runTransaction.mock.invocationCallOrder[0],
    );
    expect(db.documents.get(room.code)?.data.hostId).toBe('host-openid');
    expect(db.attempts.map((attempt) => attempt.outcome)).toEqual(['committed']);
  });

  it.each(['collection not exists', 'Db or Table not exist'])(
    '探测成功但事务报 %s 时创建集合并重试整个事务',
    async (message) => {
      db.missingMessage = `${message}: friendRooms`;
      db.afterProbe = () => { db.exists = false; };
      const room = await createRoom();
      expect(db.probe).toHaveBeenCalledTimes(1);
      expect(db.createCollection).toHaveBeenCalledTimes(1);
      expect(db.createCollection).toHaveBeenCalledWith('friendRooms');
      expect(db.runTransaction).toHaveBeenCalledTimes(2);
      const [firstCall, retryCall] = db.runTransaction.mock.invocationCallOrder;
      const [createCall] = db.createCollection.mock.invocationCallOrder;
      expect(firstCall).toBeLessThan(createCall);
      expect(createCall).toBeLessThan(retryCall);
      expect(db.attempts.map((attempt) => attempt.outcome)).toEqual(['failed', 'committed']);
      expect(db.attempts[0].writes).toEqual([]);
      expect(db.documents.get(room.code)?.data).toMatchObject({ hostId: 'host-openid', rev: 0 });
    },
  );

  it('建集合后仍然缺失时只重试一次，返回云端错误且不写入', async () => {
    db.afterProbe = () => { db.exists = false; };
    db.createCollection.mockResolvedValue(undefined);
    const response = await invoke('host-openid', { action: 'friends', op: 'create' });
    expect(response).toMatchObject({ ok: false, detail: db.missingMessage });
    expect(db.createCollection).toHaveBeenCalledTimes(1);
    expect(db.runTransaction).toHaveBeenCalledTimes(2);
    expect(db.attempts.map((attempt) => attempt.outcome)).toEqual(['failed', 'failed']);
    expect(db.documents.size).toBe(0);
  });

  it('按云端 OPENID 恢复房主座位，忽略邀请请求里的身份字段', async () => {
    const room = await createRoom();
    const invite = { action: 'friends', op: 'join', code: room.code, openId: 'spoofed-openid' } as const;
    const host = await invoke('host-openid', invite);
    expect(host).toMatchObject({ ok: true, color: 1, room: { hostId: 'host-openid', guestId: null, rev: 0 } });
    const guestInvite = { ...invite, openId: 'host-openid' };
    const guest = await invoke('guest-openid', guestInvite);
    expect(guest).toMatchObject({ ok: true, color: 2, room: { hostId: 'host-openid', guestId: 'guest-openid', rev: 1 } });
  });

  it('两个不同 OPENID 并发入座：真实冲突回滚和回调重试后，只有一位成功', async () => {
    const room = await createRoom();
    db.attempts.length = 0;
    db.runTransaction.mockClear();
    db.overlapNextTwoReads(room.code);
    const actors = ['guest-a-openid', 'guest-b-openid'];
    const responses = await Promise.all(actors.map((openId) =>
      invoke(openId, { action: 'friends', op: 'join', code: room.code }),
    ));
    const winnerIndex = responses.findIndex((response) => response.ok);
    const loserIndex = 1 - winnerIndex;
    expect(responses.filter((response) => response.ok)).toHaveLength(1);
    expect(responses[winnerIndex]).toMatchObject({
      ok: true, color: 2, room: { guestId: actors[winnerIndex], rev: 1 },
    });
    expect(responses[loserIndex]).toEqual({ ok: false, error: '这张棋桌已满或正在对局' });
    expect(db.documents.get(room.code)?.data).toMatchObject({
      hostId: 'host-openid', guestId: actors[winnerIndex], rev: 1,
    });

    expect(db.runTransaction).toHaveBeenCalledTimes(2);
    expect(db.attempts).toHaveLength(3);
    const firstAttempts = db.attempts.slice(0, 2);
    // Both callbacks initially observe the empty seat and stage competing writes.
    for (const attempt of firstAttempts) {
      expect(attempt.reads[0].data).toMatchObject({ guestId: null, rev: 0 });
      expect(attempt.writes).toHaveLength(1);
    }
    expect(firstAttempts[0].reads[0].version).toBe(firstAttempts[1].reads[0].version);
    expect(firstAttempts.map((attempt) => attempt.outcome).sort()).toEqual(['committed', 'conflict']);
    const conflicted = firstAttempts.find((attempt) => attempt.outcome === 'conflict')!;
    expect(conflicted.writes[0].data.guestId).toBe(actors[loserIndex]);
    // The losing callback executes again against the committed winner and does not write.
    expect(db.attempts[2]).toMatchObject({ outcome: 'committed', writes: [] });
    expect(db.attempts[2].reads[0].data).toMatchObject({ guestId: actors[winnerIndex], rev: 1 });
    expect(db.attempts[2].reads[0].version).toBe(firstAttempts[0].reads[0].version + 1);
  });

  it('真实读取带 _id 的文档，同步保存前剥离数据库保留字段', async () => {
    const room = await createRoom();
    db.attempts.length = 0;
    const response = await invoke('host-openid', { action: 'friends', op: 'sync', code: room.code });
    expect(response.ok).toBe(true);
    const [attempt] = db.attempts;
    expect(attempt.reads[0].data).toHaveProperty('_id', room.code);
    expect(attempt.writes).toHaveLength(1);
    expect(attempt.writes[0].data).not.toHaveProperty('_id');
    expect(attempt.writes[0].data).toMatchObject({ code: room.code, hostId: 'host-openid' });
    expect(db.documents.get(room.code)?.data).not.toHaveProperty('_id');
  });

  it.each([
    { label: 'Error', error: new Error(`数据库权限错误：${'x'.repeat(700)}`) },
    { label: '非 Error 异常', error: `数据库权限错误：${'y'.repeat(700)}` },
  ])('$label 的 detail 截断为最多 500 字符，非缺集错误不重试', async ({ error }) => {
    db.readError = error;
    const response = await invoke('host-openid', { action: 'friends', op: 'create' });
    const message = error instanceof Error ? error.message : String(error);
    expect(response).toEqual({
      ok: false,
      error: '云端服务暂不可用，请检查环境、集合和云函数部署状态',
      detail: message.slice(0, 500),
    });
    expect(response.detail).toHaveLength(500);
    expect(db.runTransaction).toHaveBeenCalledTimes(1);
    expect(db.createCollection).not.toHaveBeenCalled();
    expect(db.attempts.map((attempt) => attempt.outcome)).toEqual(['failed']);
    expect(db.documents.size).toBe(0);
  });
});
