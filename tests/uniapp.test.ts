import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { FriendRoomClient } from '../uniapp/lib/room-client';
import { useReversi, type ReversiViewModel } from '../uniapp/lib/use-reversi';
import * as friendGame from '../src/friends/game';
import { getValidMoves } from '../src/core/board';
import type { Piece } from '../src/core/types';
import {
  applyInsight,
  chooseMove,
  coord,
  getLegalIndices,
  makeGame,
  playMove,
  recordFromGame,
  replayStates,
  resignGame,
  scores,
  undoGame,
} from '../src/friends/game';
import type { Color, FriendGame, SkillKey } from '../src/friends/game';
import {
  DISCONNECT_MS,
  INVITE_TTL,
  MemoryFriendRoomStore,
  dispatchFriends,
} from '../src/friends/rooms';
import type { FriendRoom } from '../src/friends/rooms';

const request = (op: string, code?: string, rev?: number, extra: Record<string, unknown> = {}) => ({
  action: 'friends', op, ...(code ? { code } : {}), ...(rev !== undefined ? { rev } : {}), ...extra,
});

function randomGenerator(seed: number): () => number {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

describe('OpenDesign pure friend game', () => {
  it('plays 20 seeded full games, including all skills, and replays every move exactly', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const random = randomGenerator(seed);
      let game = makeGame('local', 'easy', seed % 2 ? 'skills' : 'classic');
      expect(getLegalIndices(game)).toEqual([19, 26, 37, 44]);
      expect(scores(game.board)).toEqual({ black: 2, white: 2 });
      const boards = [[...game.board]];
      let turns = 0;
      while (!game.over && turns++ < 64) {
        const legal = getLegalIndices(game);
        expect(legal.length).toBeGreaterThan(0);
        const index = legal[Math.floor(random() * legal.length)];
        let skill: SkillKey | null = null;
        if (game.variant === 'skills') {
          if (random() < 0.2 && game.energies[game.turn] >= 2) {
            const insight = applyInsight(game, game.turn);
            expect(insight.ok).toBe(true);
            game = insight.game;
          }
          if (!game.chargeUsed[game.turn] && random() < 0.3) skill = 'charge';
          else if (game.energies[game.turn] >= 3 && random() < 0.3) skill = 'bomb';
        }
        const before = JSON.stringify(game);
        const result = playMove(game, index, game.turn, skill);
        expect(result.ok).toBe(true);
        expect(result.game).not.toBe(game);
        expect(JSON.stringify(game)).toBe(before);
        game = result.game;
        boards.push([...game.board]);
        expect(game.energies.slice(1).every((energy) => energy >= 0 && energy <= 6)).toBe(true);
        if (result.skipped) {
          const board = Array.from({ length: 8 }, (_, row) => game.board.slice(row * 8, row * 8 + 8) as Piece[]);
          expect(getValidMoves(board, result.skipped)).toHaveLength(0);
          expect(game.turn).not.toBe(result.skipped);
        }
      }
      expect(game.over).toBe(true);
      expect(turns).toBeLessThanOrEqual(60);
      const { black, white } = scores(game.board);
      expect(game.winner).toBe(black === white ? 0 : black > white ? 1 : 2);
      const record = recordFromGame(game, 1);
      expect(replayStates(record)).toEqual(boards);
      expect(record.history.every((move) => !('before' in move))).toBe(true);
      record.board[0] = 99;
      expect(game.board[0]).not.toBe(99);
    }
  });

  it('ends on a double pass before 64 cells are occupied', () => {
    const game = makeGame('local');
    game.board.fill(0);
    game.board[1] = 2;
    game.board[2] = 1;
    const result = playMove(game, 0, 1);
    expect(result.ok).toBe(true);
    expect(result.game.over).toBe(true);
    expect(result.game.winner).toBe(1);
    expect(result.game.board.filter(Boolean)).toHaveLength(3);
    expect(getLegalIndices(result.game)).toEqual([]);
    expect(chooseMove(result.game)).toBe(-1);
  });

  it('rejects invalid indices, colors, skill strings, classic skills, energy, and wrong turns immutably', () => {
    const game = makeGame('local');
    const before = JSON.stringify(game);
    for (const index of [-1, 64, NaN, 19.5, '19', null, 0, 27]) {
      expect(playMove(game, index as number, 1)).toMatchObject({ ok: false, game });
    }
    for (const color of [0, 3, '1', null, 2]) {
      expect(playMove(game, 19, color as Color).ok).toBe(false);
    }
    for (const skill of ['', 'shield', 'unknown', 'toString', false, 0, 'insight']) {
      expect(playMove(game, 19, 1, skill as SkillKey).ok).toBe(false);
    }
    expect(playMove({ ...game, variant: 'classic' }, 19, 1, 'bomb').ok).toBe(false);
    expect(playMove({ ...game, energies: [0, 2, 3] }, 19, 1, 'bomb').error).toContain('能量');
    expect(JSON.stringify(game)).toBe(before);
  });

  it('applies normal and extra bomb flips without overlap or board-edge wrapping', () => {
    const game = makeGame('local');
    game.board.fill(0);
    game.board[28] = game.board[19] = 2;
    game.board[29] = 1;
    const bomb = playMove(game, 27, 1, 'bomb');
    expect(bomb.ok).toBe(true);
    expect(bomb.game.history[0]).toMatchObject({ flips: [28], extra: [19] });
    expect(bomb.game.board[28]).toBe(1);
    expect(bomb.game.board[19]).toBe(1);
    expect(bomb.game.energies[1]).toBe(1);
    expect(bomb.game.skillsUsed[1]).toBe(1);
    expect(game.board[28]).toBe(2);

    const edge = makeGame('local');
    edge.board.fill(0);
    edge.board[6] = edge.board[8] = 2;
    edge.board[5] = 1;
    const edgeBomb = playMove(edge, 7, 1, 'bomb');
    expect(edgeBomb.ok).toBe(true);
    expect(edgeBomb.game.board[8]).toBe(2);
    expect(edgeBomb.game.history[0].extra).not.toContain(8);
  });

  it('limits insight to once per turn and charges without placement or turn consumption', () => {
    const game = makeGame('local');
    const before = JSON.stringify(game);
    const insight = applyInsight(game, 1);
    expect(insight.ok).toBe(true);
    expect(getLegalIndices(game)).toContain(insight.game.revealed!.i);
    expect(insight.game.board).toEqual(game.board);
    expect(insight.game.energies[1]).toBe(1);
    expect(insight.game.skillsUsed[1]).toBe(1);
    expect(insight.game.turn).toBe(1);
    expect(insight.game.history).toHaveLength(0);
    expect(applyInsight({ ...insight.game, energies: [0, 6, 3] }, 1).error).toContain('一次');
    expect(applyInsight({ ...game, energies: [0, 1, 3] }, 1).error).toContain('能量');
    expect(applyInsight({ ...game, variant: 'classic' }, 1).ok).toBe(false);
    expect(applyInsight(game, 2).ok).toBe(false);
    expect(JSON.stringify(game)).toBe(before);
    const placed = playMove(insight.game, 19, 1);
    expect(placed.game.revealed).toBeNull();
    expect(placed.game.energies[1]).toBe(2);
  });

  it('grants charge total +3, caps energy at 6, and limits it separately for each player', () => {
    const game = makeGame('local');
    const charged = playMove({ ...game, energies: [0, 0, 3] }, 19, 1, 'charge');
    expect(charged.ok).toBe(true);
    expect(charged.game.chargeUsed[1]).toBe(true);
    expect(charged.game.energies[1]).toBe(3);
    const whiteCharged = playMove(charged.game, getLegalIndices(charged.game)[0], 2, 'charge');
    expect(whiteCharged.ok).toBe(true);
    expect(whiteCharged.game.chargeUsed[2]).toBe(true);
    expect(whiteCharged.game.energies[2]).toBe(6);
    expect(playMove(whiteCharged.game, getLegalIndices(whiteCharged.game)[0], 1, 'charge').error).toContain('一次');
    expect(playMove({ ...game, energies: [0, 6, 3] }, 19, 1).game.energies[1]).toBe(6);
    expect(playMove({ ...game, energies: [0, 5, 3] }, 19, 1, 'charge').game.energies[1]).toBe(6);
    expect(game.chargeUsed[1]).toBe(false);
  });

  it('chooses legal moves for three AI levels on both colors without changing game state', () => {
    let game = makeGame('ai');
    for (let move = 0; move < 4; move++) {
      const before = JSON.stringify(game);
      for (const diff of ['easy', 'normal', 'hard'] as const) {
        expect(getLegalIndices(game)).toContain(chooseMove({ ...game, diff }));
      }
      expect(JSON.stringify(game)).toBe(before);
      game = playMove(game, getLegalIndices(game)[0], game.turn).game;
    }
    expect(coord(19)).toBe('D3');
    expect(coord(63)).toBe('H8');
  });

  it('keeps hard moves and insight legal and immutable when either search budget is exhausted', () => {
    let game = makeGame('ai', 'hard');
    const random = randomGenerator(76);
    for (let step = 0; step < 36 && !game.over; step++) {
      const legal = getLegalIndices(game);
      if (step % 5 === 0) {
        const before = JSON.stringify(game);
        for (const budget of [{ nodeBudget: 0 }, { nodeBudget: 1 }, { timeBudgetMs: 0 }]) {
          expect(legal).toContain(chooseMove(game, budget));
          const hint = applyInsight({ ...game, energies: [0, 6, 6] }, game.turn, budget);
          expect(hint.ok).toBe(true);
          expect(legal).toContain(hint.game.revealed!.i);
          expect(hint.game.board).toEqual(game.board);
          expect(hint.game.turn).toBe(game.turn);
          expect(hint.game.energies[game.turn]).toBe(4);
        }
        expect(JSON.stringify(game)).toBe(before);
      }
      game = playMove(game, legal[Math.floor(random() * legal.length)], game.turn).game;
    }
    const noMoves = { ...game, over: false, board: Array(64).fill(1) };
    expect(chooseMove(noMoves, { nodeBudget: 0 })).toBe(-1);
    expect(applyInsight(noMoves, noMoves.turn, { nodeBudget: 0 }).ok).toBe(false);
  });

  it('benchmarks the production hard/insight path across a seeded full game', () => {
    let game = makeGame('ai', 'hard');
    const hardTimes: number[] = [], insightTimes: number[] = [];
    while (!game.over) {
      const before = JSON.stringify(game);
      const legal = getLegalIndices(game);
      const started = performance.now();
      const index = chooseMove(game);
      hardTimes.push(performance.now() - started);
      const hintStarted = performance.now();
      const insight = applyInsight({ ...game, energies: [0, 6, 6] }, game.turn);
      insightTimes.push(performance.now() - hintStarted);
      expect(legal).toContain(index);
      expect(insight.ok).toBe(true);
      expect(legal).toContain(insight.game.revealed!.i);
      expect(JSON.stringify(game)).toBe(before);
      game = playMove(game, index, game.turn).game;
    }
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    console.log(`[uniapp AI 基准] ${hardTimes.length} 手 | hard 平均 ${mean(hardTimes).toFixed(2)}ms / 最大 ${Math.max(...hardTimes).toFixed(2)}ms | insight 平均 ${mean(insightTimes).toFixed(2)}ms / 最大 ${Math.max(...insightTimes).toFixed(2)}ms`);
    expect(Math.max(...hardTimes)).toBeLessThan(500);
    expect(Math.max(...insightTimes)).toBeLessThan(500);
  });

  it('undoes one local move with skill state and an AI round back to black', () => {
    const local = makeGame('local');
    const insight = applyInsight(local, 1).game;
    const charged = playMove(insight, 19, 1, 'charge').game;
    expect(undoGame(charged)).toEqual(insight);
    expect(charged.chargeUsed[1]).toBe(true);
    const ai = makeGame('ai');
    const first = playMove(ai, 19, 1).game;
    expect(undoGame(first)).toEqual(ai);
    const response = playMove(first, getLegalIndices(first)[0], 2).game;
    expect(undoGame(response)).toEqual(ai);
    expect(response.history).toHaveLength(2);
    const room = makeGame('room');
    const roomMove = playMove(room, 19, 1).game;
    expect(undoGame(roomMove)).toBe(roomMove);
    expect(roomMove.history[0].before).toBeUndefined();
  });

  it('records resignation or disconnection winner independently of scores', () => {
    const game = playMove(makeGame('local'), 19, 1).game;
    expect(scores(game.board).black).toBeGreaterThan(scores(game.board).white);
    for (const reason of ['resign', 'disconnect'] as const) {
      const resigned = resignGame(game, 1, reason);
      expect(resigned.over).toBe(true);
      expect(resigned.winner).toBe(2);
      expect(resigned.reason).toBe(reason);
      expect(resigned.board).toEqual(game.board);
      expect(resignGame(resigned, 2)).toBe(resigned);
      expect(recordFromGame(resigned, 1).history[0].before).toBeUndefined();
    }
    expect(resignGame(game, 0 as Color)).toBe(game);
    expect(game.over).toBe(false);
  });
});

describe('uniapp insight pending state', () => {
  const models: ReversiViewModel[] = [];
  function model() {
    const vm = useReversi(); models.push(vm); vm.start('local'); vm.state.selectedSkill = 'insight'; return vm;
  }
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
  }
  function seat(vm: ReversiViewModel) {
    const now = Date.now();
    const room: FriendRoom = {
      code: '123456', hostId: 'host', guestId: 'guest', phase: 'playing', rev: 1,
      created: now, updated: now, expires: now + 600000, hostSeen: now, guestSeen: now,
      game: makeGame('room'),
    };
    vm.state.room = room; vm.state.game = room.game; return room;
  }
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { querySelector: () => null });
    vi.stubGlobal('uni', { getStorageSync: () => '', setStorageSync: vi.fn() });
    vi.spyOn(FriendRoomClient.prototype, 'watch').mockImplementation(() => {});
    vi.spyOn(FriendRoomClient.prototype, 'stop').mockImplementation(() => {});
  });
  afterEach(async () => {
    models.splice(0).forEach(vm => vm.dispose()); await nextTick();
    vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
  });

  it('shows pending before local calculation and coalesces rapid clicks into one energy charge', async () => {
    const vm = model();
    const apply = vi.spyOn(friendGame, 'applyInsight');
    const first = vm.useSkill(), duplicate = vm.useSkill();
    await nextTick();
    expect(vm.state.insightPending).toBe(true);
    expect(vm.skillDisabled.value).toBe(true);
    expect(vm.skillLabel.value).toBe('洞察中…');
    expect(vm.gameHint.value).toContain('正在洞察');
    expect(vm.canPlay.value).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(32); await Promise.all([first, duplicate]);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(vm.state.insightPending).toBe(false);
    expect(vm.state.game?.energies[1]).toBe(1);
    expect(vm.state.game?.skillsUsed[1]).toBe(1);
    expect(vm.skillLabel.value).toBe('已使用');
  });

  it('uses the current AI turn color even when a previous room seat was white', async () => {
    const vm = model(); vm.state.color = 2; vm.start('ai');
    const pending = vm.useSkill(); await vi.advanceTimersByTimeAsync(32); await pending;
    expect(vm.state.game?.revealed?.color).toBe(1);
    expect(vm.state.game?.energies).toEqual([0, 1, 3]);
    expect(vm.state.insightPending).toBe(false);
  });

  it('releases the lock after a local failure and permits a retry', async () => {
    const vm = model();
    const apply = vi.spyOn(friendGame, 'applyInsight').mockImplementationOnce(() => { throw new Error('interrupted'); });
    const failed = vm.useSkill(); await vi.advanceTimersByTimeAsync(32); await failed;
    expect(vm.state.insightPending).toBe(false);
    expect(vm.state.game?.energies[1]).toBe(3);
    expect(vm.state.toast).toContain('重试');
    expect(vm.skillDisabled.value).toBe(false);
    const retried = vm.useSkill(); await vi.advanceTimersByTimeAsync(32); await retried;
    expect(apply).toHaveBeenCalledTimes(2);
    expect(vm.state.game?.revealed?.i).toBeGreaterThanOrEqual(0);
  });

  it.each(['hide', 'leave', 'replace', 'cancel', 'dispose'] as const)('cancels a queued calculation on %s without consuming energy', async action => {
    const vm = model(), game = vm.state.game;
    const apply = vi.spyOn(friendGame, 'applyInsight');
    const pending = vm.useSkill();
    if (action === 'hide') vm.hide();
    else if (action === 'leave') vm.navigate('home');
    else if (action === 'replace') vm.start('local');
    else if (action === 'cancel') vm.equipSkill('bomb');
    else vm.dispose();
    await pending;
    expect(vm.state.insightPending).toBe(false);
    await vi.advanceTimersByTimeAsync(32);
    expect(apply).not.toHaveBeenCalled();
    expect(game?.energies[1]).toBe(3);
    expect(game?.revealed).toBeNull();
  });

  it('does not let a cancelled calculation release a newer insight lock', async () => {
    const vm = model();
    const cancelled = vm.useSkill(); vm.start('local');
    const current = vm.useSkill(); await cancelled;
    expect(vm.state.insightPending).toBe(true);
    await vi.advanceTimersByTimeAsync(32); await current;
    expect(vm.state.insightPending).toBe(false);
    expect(vm.state.game?.skillsUsed[1]).toBe(1);
  });

  it('blocks duplicate room requests and releases both locks when the network rejects', async () => {
    const vm = model(); seat(vm);
    const request = vi.spyOn(FriendRoomClient.prototype, 'request').mockRejectedValue(new Error('offline'));
    const first = vm.useSkill(), second = vm.useSkill();
    await vi.advanceTimersByTimeAsync(32); await Promise.all([first, second]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0].op).toBe('insight');
    expect(vm.state).toMatchObject({ busy: false, insightPending: false });
    expect(vm.skillDisabled.value).toBe(false);
    expect(vm.state.game?.energies[1]).toBe(3);
    expect(vm.state.toast).toContain('重试');
  });

  it('discards an old room response after cancellation without unlocking a newer request', async () => {
    const vm = model(), room = seat(vm);
    const old = deferred<Awaited<ReturnType<FriendRoomClient['request']>>>();
    const current = deferred<Awaited<ReturnType<FriendRoomClient['request']>>>();
    const request = vi.spyOn(FriendRoomClient.prototype, 'request')
      .mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const cancelled = vm.useSkill(); await vi.advanceTimersByTimeAsync(32);
    vm.hide();
    expect(vm.state).toMatchObject({ busy: false, insightPending: false });
    vm.show();
    const active = vm.useSkill(); await vi.advanceTimersByTimeAsync(32);
    const response = { ok: true, room: { ...room, rev: 2, game: applyInsight(room.game, 1).game }, color: 1 as const };
    old.resolve(response); await cancelled;
    expect(request).toHaveBeenCalledTimes(2);
    expect(vm.state).toMatchObject({ busy: true, insightPending: true });
    expect(vm.state.game?.revealed).toBeNull();
    current.resolve(response); await active;
    expect(vm.state).toMatchObject({ busy: false, insightPending: false });
    expect(vm.state.game?.energies[1]).toBe(1);
  });
});

async function createdRoom(
  store: MemoryFriendRoomStore,
  now = 1_000_000,
  variant: 'classic' | 'skills' = 'skills',
): Promise<FriendRoom> {
  const response = await dispatchFriends(store, request('create', undefined, undefined, {
    variant, board: Array(64).fill(1), id: 'caller-id', hostId: 'forged-host',
    openId: 'forged-openid', now: -1,
  }), 'host', now);
  expect(response.ok).toBe(true);
  expect(response.room?.code).toMatch(/^\d{6}$/);
  expect(response.room?.hostId).toBe('host');
  expect(response.room?.game.board).not.toEqual(Array(64).fill(1));
  expect(response.room?.game.id).not.toBe('caller-id');
  expect(response.room?.game.started).toBe(now);
  return response.room!;
}

async function playingRoom(store: MemoryFriendRoomStore, now = 1_000_000): Promise<FriendRoom> {
  const room = await createdRoom(store, now);
  const joined = await dispatchFriends(store, request('join', room.code), 'guest', now + 1);
  const started = await dispatchFriends(store, request('start', room.code, joined.room!.rev), 'host', now + 2);
  expect(started.ok).toBe(true);
  return started.room!;
}

describe('authoritative friend rooms', () => {
  it('keeps host identity on reopen and stores both display profiles', async () => {
    const store = new MemoryFriendRoomStore();
    const created = await dispatchFriends(store, request('create', undefined, undefined, {
      variant: 'skills', name: '阿黑', avatar: 'https://example.test/host.png',
    }), 'host', 1_000_000);
    expect(created.room).toMatchObject({ hostName: '阿黑', hostAvatar: 'https://example.test/host.png' });

    // The host opening their own invite must come back as black, never as a second guest.
    const reopen = await dispatchFriends(store, request('join', created.room!.code), 'host', 1_000_100);
    expect(reopen.ok).toBe(true);
    expect(reopen.color).toBe(1);
    expect(reopen.room).toMatchObject({ guestId: null, rev: created.room!.rev });

    const join = await dispatchFriends(store, request('join', created.room!.code), 'guest', 1_000_200);
    expect(join.color).toBe(2);
    expect(join.room?.hostName).toBe('阿黑');

    const guestProfile = await dispatchFriends(store, request('sync', created.room!.code, undefined, {
      name: '小白', avatar: 'https://example.test/guest.png',
    }), 'guest', 1_000_300);
    expect(guestProfile.room).toMatchObject({ guestName: '小白', guestAvatar: 'https://example.test/guest.png' });
    expect(guestProfile.room?.hostName).toBe('阿黑');
  });

  it('clears the departing guest profile and ignores local avatar paths on the next join', async () => {
    const store = new MemoryFriendRoomStore();
    const room = await createdRoom(store);
    const joined = await dispatchFriends(store, request('join', room.code, undefined, {
      name: '小白', avatar: 'cloud://example-env.example-bucket/avatars/guest.jpg',
    }), 'guest', room.created + 1);
    expect(joined.room).toMatchObject({ guestName: '小白', guestAvatar: expect.stringMatching(/^cloud:\/\//) });
    const departed = await dispatchFriends(store, request('leave', room.code, joined.room!.rev), 'guest', room.created + 2);
    expect(departed.room?.guestId).toBeNull();
    expect(departed.room?.guestName).toBeUndefined();
    expect(departed.room?.guestAvatar).toBeUndefined();

    await store.set({ ...departed.room!, guestName: '旧棋友', guestAvatar: 'https://example.test/old.jpg' });
    const next = await dispatchFriends(store, request('join', room.code, undefined, {
      avatar: 'https://tmp/not-shared.png',
    }), 'another-guest', room.created + 3);
    expect(next.room?.guestId).toBe('another-guest');
    expect(next.room?.guestName).toBeUndefined();
    expect(next.room?.guestAvatar).toBeUndefined();
  });

  it('requires authenticated seats, explicit host start, legal turns, and current revisions', async () => {
    const store = new MemoryFriendRoomStore();
    const room = await createdRoom(store);
    const code = room.code;
    expect((await dispatchFriends(store, request('sync', code), 'stranger', room.created)).error).toContain('没有入座');
    expect((await dispatchFriends(store, request('start', code, room.rev), 'host', room.created)).ok).toBe(false);
    const join = await dispatchFriends(store, request('join', code), 'guest', room.created + 1);
    expect(join.ok).toBe(true);
    expect(join.color).toBe(2);
    expect(join.room?.phase).toBe('waiting');
    expect((await dispatchFriends(store, request('join', code), 'third', room.created + 2)).error).toContain('满');
    expect((await dispatchFriends(store, request('move', code, join.room!.rev, { index: 19 }), 'host', room.created + 2)).ok).toBe(false);
    const staleStart = await dispatchFriends(store, request('start', code, room.rev), 'host', room.created + 3);
    expect(staleStart.error).toContain('更新');
    const started = await dispatchFriends(store, request('start', code, join.room!.rev), 'host', room.created + 4);
    expect(started.room?.phase).toBe('playing');
    expect((await dispatchFriends(store, request('start', code, started.room!.rev), 'guest', room.created + 5)).error).toContain('房主');
    const beforeIllegal = await store.get(code);
    expect((await dispatchFriends(store, request('move', code, started.room!.rev, { index: 0 }), 'host', room.created + 6)).ok).toBe(false);
    expect(await store.get(code)).toEqual(beforeIllegal);
    expect((await dispatchFriends(store, request('move', code, started.room!.rev - 1, { index: 19 }), 'host', room.created + 7)).error).toContain('更新');
    const hostMove = await dispatchFriends(store, request('move', code, started.room!.rev, { index: 19, board: Array(64).fill(2), color: 2 }), 'host', room.created + 8);
    expect(hostMove.ok).toBe(true);
    expect(hostMove.room?.game.turn).toBe(2);
    expect(hostMove.room?.game.board[19]).toBe(1);
    expect(hostMove.room?.game.history[0].before).toBeUndefined();
    expect((await dispatchFriends(store, request('move', code, hostMove.room!.rev, { index: 26 }), 'host', room.created + 9)).error).toContain('轮到');
    const guestIndex = getLegalIndices(hostMove.room!.game)[0];
    expect((await dispatchFriends(store, request('move', code, hostMove.room!.rev, { index: guestIndex }), 'guest', room.created + 10)).ok).toBe(true);
    for (const op of ['sync', 'move', 'insight', 'resign', 'leave', 'rematch']) {
      const third = await dispatchFriends(store, request(op, code, 0, { index: 19 }), 'third', room.created + 11);
      expect(third.ok).toBe(false);
      expect(third.room).toBeUndefined();
    }
  });

  it('validates revisions for every mutation and applies insight authoritatively', async () => {
    const store = new MemoryFriendRoomStore();
    const room = await playingRoom(store);
    const before = await store.get(room.code);
    for (const op of ['start', 'move', 'insight', 'resign', 'rematch', 'leave']) {
      expect((await dispatchFriends(store, request(op, room.code, room.rev - 1, { index: 19 }), 'host', room.updated + 1)).error).toContain('更新');
    }
    expect(await store.get(room.code)).toEqual(before);
    const insight = await dispatchFriends(store, request('insight', room.code, room.rev), 'host', room.updated + 1);
    expect(insight.ok).toBe(true);
    expect(insight.room?.game.energies[1]).toBe(1);
    expect(insight.room?.rev).toBe(room.rev + 1);
    const storedInsight = await store.get(room.code);
    expect((await dispatchFriends(store, request('insight', room.code, insight.room!.rev), 'host', room.updated + 2)).ok).toBe(false);
    expect(await store.get(room.code)).toEqual(storedInsight);
    const sync = await dispatchFriends(store, request('sync', room.code), 'guest', room.updated + 3);
    expect(sync.room?.guestSeen).toBe(room.updated + 3);
    expect(sync.room?.rev).toBe(insight.room?.rev);
  });

  it('expires open invites but permits active seated-player reconnection after invitation expiry', async () => {
    const store = new MemoryFriendRoomStore();
    const room = await playingRoom(store, 2_000_000);
    const move = await dispatchFriends(store, request('move', room.code, room.rev, { index: 19 }), 'host', room.updated + 1);
    for (let now = room.updated + 30_000; now < room.expires; now += 30_000) {
      expect((await dispatchFriends(store, request('sync', room.code), 'guest', now)).room?.phase).toBe('playing');
      expect((await dispatchFriends(store, request('sync', room.code), 'host', now)).room?.phase).toBe('playing');
    }
    const reconnect = await dispatchFriends(store, request('join', room.code), 'guest', room.expires + 1);
    expect(reconnect.ok).toBe(true);
    expect(reconnect.room?.phase).toBe('playing');
    expect(reconnect.room?.game.board).toEqual(move.room?.game.board);
    expect((await dispatchFriends(store, request('join', room.code), 'intruder', room.expires + 2)).ok).toBe(false);
    const waiting = await createdRoom(store, room.expires + 5);
    expect((await dispatchFriends(store, request('join', waiting.code), 'guest', waiting.expires)).error).toContain('过期');
    expect(INVITE_TTL).toBe(10 * 60 * 1000);
    expect(DISCONNECT_MS).toBe(90 * 1000);
  });

  it('allows a disconnected member to return inside 90 seconds and adjudicates a stale opponent', async () => {
    const store = new MemoryFriendRoomStore();
    const room = await playingRoom(store, 3_000_000);
    const reconnected = await dispatchFriends(store, request('join', room.code), 'guest', room.updated + DISCONNECT_MS - 1);
    expect(reconnected.room?.phase).toBe('playing');
    expect(reconnected.room?.game.id).toBe(room.game.id);
    const keepHost = await dispatchFriends(store, request('sync', room.code), 'host', room.updated + DISCONNECT_MS - 1);
    expect(keepHost.room?.phase).toBe('playing');
    const timeout = await dispatchFriends(store, request('sync', room.code), 'host', room.updated + 2 * DISCONNECT_MS);
    expect(timeout.room?.phase).toBe('finished');
    expect(timeout.room?.game.reason).toBe('disconnect');
    expect(timeout.room?.game.winner).toBe(1);
    expect(timeout.room?.rev).toBe(room.rev + 1);
  });

  it('only lets the host rematch a finished game with a live peer and preserves its rules', async () => {
    const store = new MemoryFriendRoomStore();
    const waiting = await createdRoom(store, 4_000_000, 'classic');
    const joined = await dispatchFriends(store, request('join', waiting.code), 'guest', waiting.created + 1);
    const started = await dispatchFriends(store, request('start', waiting.code, joined.room!.rev), 'host', waiting.created + 2);
    expect((await dispatchFriends(store, request('rematch', waiting.code, started.room!.rev), 'host', waiting.created + 3)).ok).toBe(false);
    const resignation = await dispatchFriends(store, request('resign', waiting.code, started.room!.rev), 'host', waiting.created + 3);
    expect(resignation.room?.phase).toBe('finished');
    expect(resignation.room?.game.winner).toBe(2);
    expect((await dispatchFriends(store, request('rematch', waiting.code, resignation.room!.rev), 'guest', waiting.created + 4)).error).toContain('房主');
    expect((await dispatchFriends(store, request('rematch', waiting.code, resignation.room!.rev), 'host', waiting.created + DISCONNECT_MS + 1)).ok).toBe(false);
    await dispatchFriends(store, request('sync', waiting.code), 'guest', waiting.created + DISCONNECT_MS + 2);
    const rematch = await dispatchFriends(store, request('rematch', waiting.code, resignation.room!.rev, { variant: 'skills' }), 'host', waiting.created + DISCONNECT_MS + 3);
    expect(rematch.ok).toBe(true);
    expect(rematch.room?.phase).toBe('playing');
    expect(rematch.room?.guestId).toBe('guest');
    expect(rematch.room?.game.variant).toBe('classic');
    expect(rematch.room?.game.diff).toBe(waiting.game.diff);
    expect(rematch.room?.game.history).toEqual([]);
    expect(rematch.room?.game.id).not.toBe(resignation.room?.game.id);
  });

  it('pauses after guest leave, resumes by host start, and exposes host closure only to seated members', async () => {
    const store = new MemoryFriendRoomStore();
    const room = await playingRoom(store, 5_000_000);
    const moved = await dispatchFriends(store, request('move', room.code, room.rev, { index: 19 }), 'host', room.updated + 1);
    const guestLeft = await dispatchFriends(store, request('leave', room.code, moved.room!.rev), 'guest', room.updated + 2);
    expect(guestLeft.room?.phase).toBe('waiting');
    expect(guestLeft.room?.guestId).toBeNull();
    expect(guestLeft.room?.guestSeen).toBe(0);
    expect((await dispatchFriends(store, request('sync', room.code), 'guest', room.updated + 3)).ok).toBe(false);
    const replacement = await dispatchFriends(store, request('join', room.code), 'replacement', room.updated + 4);
    expect(replacement.room?.phase).toBe('waiting');
    const resumed = await dispatchFriends(store, request('start', room.code, replacement.room!.rev), 'host', room.updated + 5);
    expect(resumed.ok).toBe(true);
    expect(resumed.room?.game).toEqual(moved.room?.game);
    const hostLeft = await dispatchFriends(store, request('leave', room.code, resumed.room!.rev), 'host', room.updated + 6);
    expect(hostLeft.room?.phase).toBe('closed');
    const closedSync = await dispatchFriends(store, request('sync', room.code), 'replacement', room.updated + 7);
    expect(closedSync.ok).toBe(true);
    expect(closedSync.room?.phase).toBe('closed');
    expect((await dispatchFriends(store, request('join', room.code), 'third', room.updated + 8)).ok).toBe(false);
  });

  it('requires live peers for host start and never reuses an existing closed room code', async () => {
    const store = new MemoryFriendRoomStore();
    const room = await createdRoom(store, 6_000_000);
    const joined = await dispatchFriends(store, request('join', room.code), 'guest', room.created + 1);
    expect((await dispatchFriends(store, request('start', room.code, joined.room!.rev), 'host', room.created + DISCONNECT_MS + 1)).ok).toBe(false);
    const closed = { ...joined.room!, phase: 'closed' as const };
    await store.set(closed);
    const random = vi.spyOn(Math, 'random').mockReturnValue((Number(room.code) - 100000 + 0.25) / 900000);
    try {
      const collision = await dispatchFriends(store, request('create'), 'different-host', room.created + 2);
      expect(collision.ok).toBe(false);
      expect(await store.get(room.code)).toEqual(closed);
    } finally {
      random.mockRestore();
    }
  });

  it('clones its memory store and rejects malformed or incomplete requests without writes', async () => {
    const store = new MemoryFriendRoomStore();
    const room = await createdRoom(store, 7_000_000);
    room.game.board[0] = 99;
    expect((await store.get(room.code))?.game.board[0]).toBe(0);
    const read = (await store.get(room.code))!;
    read.game.board[1] = 99;
    expect((await store.get(room.code))?.game.board[1]).toBe(0);
    const before = await store.get(room.code);
    const badInputs = [
      null, [], 'friends', { action: 'friends', op: 'anything' },
      request('join', '12345'), request('join', 'abcdef'),
      request('move', room.code, undefined, { index: 19 }),
      request('move', room.code, 0),
      request('move', room.code, -1, { index: 19 }),
      request('move', room.code, 0, { index: '19' }),
      request('move', room.code, 0, { index: 64 }),
      request('move', room.code, 0, { index: 19, skill: 'shield' }),
      request('create', undefined, undefined, { variant: 'other' }),
      request('create', undefined, undefined, { avatar: 'x'.repeat(2049) }),
    ];
    for (const input of badInputs) expect((await dispatchFriends(store, input, 'host', room.created + 1)).ok).toBe(false);
    expect((await dispatchFriends(store, request('sync', room.code), '', room.created + 1)).ok).toBe(false);
    expect(await store.get(room.code)).toEqual(before);
  });
});
