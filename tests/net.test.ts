import { describe, it, expect } from 'vitest';
import {
  InMemoryCloudDatabase,
  ReversiCloudService,
  OnlineRoomClient,
  ROOM_EXPIRE_MS,
  HEARTBEAT_TIMEOUT_MS,
  RoomDocument,
} from '../src/net';
import { Piece, getValidMoves, createEmptyBoard } from '../src/core';

describe('阶段 5：好友房联机与服务端防作弊复验测试', () => {
  function setupPair() {
    const db = new InMemoryCloudDatabase();
    const service = new ReversiCloudService(db);
    const host = new OnlineRoomClient('host_openid_001', '房主阿强', {
      db,
      service,
    });
    const guest = new OnlineRoomClient('guest_openid_002', '房客阿珍', {
      db,
      service,
    });
    const stranger = new OnlineRoomClient('stranger_003', '路人甲', {
      db,
      service,
    });
    return { db, service, host, guest, stranger };
  }

  it('1. 创建房间、6位房间号、满房拒绝与 30 分钟过期自动失效', async () => {
    const { host, guest, stranger } = setupPair();
    const t0 = 1000000;

    const createRes = await host.createRoom(['bomb', 'shield', 'wait'], t0);
    expect(createRes.ok).toBe(true);
    const roomId = createRes.data!.roomId;
    expect(roomId).toMatch(/^\d{6}$/);
    expect(createRes.data!.status).toBe('waiting');

    // 房客正常加入，状态变为 playing
    const joinRes = await guest.joinRoom(roomId, ['steal', 'double', 'wait'], t0 + 1000);
    expect(joinRes.ok).toBe(true);
    expect(joinRes.data!.status).toBe('playing');
    expect(joinRes.data!.gameState).toBeDefined();

    // 第 3 人尝试加入满房 -> 被拒绝
    const fullRes = await stranger.joinRoom(roomId, ['bomb'], t0 + 2000);
    expect(fullRes.ok).toBe(false);
    expect(fullRes.error).toContain('已满');

    // 超过 30 分钟未活动的房间 -> 自动失效拒绝加入
    const createRes2 = await host.createRoom(['bomb'], t0);
    const expiredRoomId = createRes2.data!.roomId;
    const expiredJoin = await guest.joinRoom(
      expiredRoomId,
      ['bomb'],
      t0 + ROOM_EXPIRE_MS + 100
    );
    expect(expiredJoin.ok).toBe(false);
    expect(expiredJoin.error).toContain('失效');
  });

  it('2. 服务端防作弊复验：拒绝非当前回合操作、拒绝非法坐标落子、拒绝联机禁用技能、拦截篡改棋盘改包', async () => {
    const { host, guest } = setupPair();
    const createRes = await host.createRoom(['bomb', 'undo', 'wait']);
    const roomId = createRes.data!.roomId;
    await guest.joinRoom(roomId, ['bomb', 'shield', 'wait']);

    // 2.1 开局黑方（房主）回合，房客尝试抢先落子 -> 服务端拒绝
    const wrongTurn = await guest.submitMove({
      roomId,
      actionType: 'move',
      row: 2,
      col: 3,
    });
    expect(wrongTurn.ok).toBe(false);
    expect(wrongTurn.error).toContain('不是你的回合');

    // 2.2 房主尝试在非法空格 (0,0) 落子 -> 服务端用 core 引擎复验拒绝
    const illegalMove = await host.submitMove({
      roomId,
      actionType: 'move',
      row: 0,
      col: 0,
    });
    expect(illegalMove.ok).toBe(false);
    expect(illegalMove.error).toContain('非法落子');

    // 2.3 房主尝试在联机模式使用禁用的「悔棋时光 (undo)」 -> 服务端拒绝
    const bannedSkill = await host.submitMove({
      roomId,
      actionType: 'skill',
      skillId: 'undo',
    });
    expect(bannedSkill.ok).toBe(false);
    expect(bannedSkill.error).toContain('禁用');

    // 2.4 房主尝试能量不足时强行发包释放「炸弹子 (bomb)」(开局仅 10 能量，炸弹需 30) -> 服务端拒绝
    const noEnergySkill = await host.submitMove({
      roomId,
      actionType: 'skill',
      skillId: 'bomb',
      row: 2,
      col: 3,
    });
    expect(noEnergySkill.ok).toBe(false);
    expect(noEnergySkill.error).toContain('能量不足');

    // 2.5 客户端篡改棋盘数据上传（伪造全盘黑子）-> 服务端防作弊拦截
    const fakeBoard = createEmptyBoard();
    fakeBoard[0][0] = Piece.Black;
    const tamperRes = await host.submitMove({
      roomId,
      actionType: 'move',
      row: 2,
      col: 3,
      claimedBoardAfter: fakeBoard,
    });
    expect(tamperRes.ok).toBe(false);
    expect(tamperRes.error).toContain('防作弊拦截');
  });

  it('3. 「求你等我」联机请求与同意/拒绝流转 + 断线重进恢复最新棋盘 + 90 秒掉线判胜', async () => {
    const { db, service, host, guest } = setupPair();
    const t0 = 5000000;
    const createRes = await host.createRoom(['bomb', 'shield', 'wait'], t0);
    const roomId = createRes.data!.roomId;
    await guest.joinRoom(roomId, ['bomb', 'shield', 'wait'], t0 + 1000);

    // 监听实时更新
    let latestWatchedRoom: RoomDocument | null = null;
    guest.watchRoom(roomId, (r) => {
      latestWatchedRoom = r;
    });

    // 房主发起「求你等我」请求
    const req1 = await host.requestWaitSkill(roomId, t0 + 2000);
    expect(req1.ok).toBe(true);
    expect(latestWatchedRoom!.gameState!.pendingWaitRequest).toEqual({
      requester: Piece.Black,
    });

    // 房客第一次点击【拒绝】-> 房主不扣能量，继续由房主落子
    const respReject = await guest.respondWaitSkill(roomId, false, t0 + 3000);
    expect(respReject.ok).toBe(true);
    expect(respReject.data!.gameState!.currentPlayer).toBe(Piece.Black);
    expect(respReject.data!.gameState!.players[Piece.Black].energy).toBe(10);

    // 房主再次发起「求你等我」，房客点击【同意】-> 房主 +15 净能量，轮到房客（白方）
    await host.requestWaitSkill(roomId, t0 + 4000);
    const respApprove = await guest.respondWaitSkill(roomId, true, t0 + 5000);
    expect(respApprove.ok).toBe(true);
    expect(respApprove.data!.gameState!.currentPlayer).toBe(Piece.White);
    expect(respApprove.data!.gameState!.players[Piece.Black].energy).toBe(25);

    // 房客落子 (2,4)
    const guestMove = await guest.submitMove({
      roomId,
      actionType: 'move',
      row: 2,
      col: 4,
      now: t0 + 6000,
    });
    expect(guestMove.ok).toBe(true);

    // 模拟房主在对方回合杀进程重进（新实例化一个具有相同 openId 的客户端重新 joinRoom）
    const hostReconnected = new OnlineRoomClient('host_openid_001', '房主阿强', {
      db,
      service,
    });
    const rejoinRes = await hostReconnected.joinRoom(
      roomId,
      ['bomb', 'shield', 'wait'],
      t0 + 7000
    );
    expect(rejoinRes.ok).toBe(true);
    expect(rejoinRes.data!.gameState!.board[2][4]).toBe(Piece.White);
    expect(rejoinRes.data!.gameState!.currentPlayer).toBe(Piece.Black);

    // 模拟房客超过 90 秒无心跳掉线，房主调用 syncState 判定掉线并直接判胜结束
    const syncRes = await hostReconnected.syncState(
      roomId,
      true,
      t0 + 7000 + HEARTBEAT_TIMEOUT_MS + 500
    );
    expect(syncRes.ok).toBe(true);
    expect(syncRes.data!.opponentDisconnected).toBe(true);
    expect(syncRes.data!.room.status).toBe('finished');
    expect(syncRes.data!.room.gameState!.isGameOver).toBe(true);
    expect(syncRes.data!.room.gameState!.winner).toBe(Piece.Black);
  });

  it('4. 阶段 5 验收标准：双端异地模拟完整打完一局直到终局，状态完全同步', async () => {
    const { host, guest } = setupPair();
    const createRes = await host.createRoom(['bomb', 'shield', 'wait']);
    const roomId = createRes.data!.roomId;
    let room = (await guest.joinRoom(roomId, ['bomb', 'shield', 'wait'])).data!;

    let safety = 0;
    while (room.status === 'playing' && room.gameState && !room.gameState.isGameOver) {
      safety++;
      expect(safety).toBeLessThan(150);

      const state = room.gameState;
      const activeClient = state.currentPlayer === Piece.Black ? host : guest;
      const validMoves = getValidMoves(
        state.board,
        state.currentPlayer,
        state.shielded
      );

      if (validMoves.length === 0) {
        const res = await activeClient.submitMove({
          roomId,
          actionType: 'pass',
        });
        expect(res.ok).toBe(true);
        room = res.data!;
      } else {
        const move = validMoves[0];
        const res = await activeClient.submitMove({
          roomId,
          actionType: 'move',
          row: move.row,
          col: move.col,
        });
        expect(res.ok).toBe(true);
        room = res.data!;
      }
    }

    expect(room.status).toBe('finished');
    expect(room.gameState!.isGameOver).toBe(true);
    expect(room.gameState!.winner).not.toBeNull();
  });
});
