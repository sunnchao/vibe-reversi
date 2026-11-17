/**
 * 核心对局状态机与技能执行引擎（纯函数、无任何 wx API）
 *
 * 严格遵循开发清单：
 * 1. 每步产生结构化事件（落子、翻了哪些子、是否 pass、是否终局），UI 只消费事件做动画
 * 2. 悔棋/回放支持：保存每步快照（棋盘+能量+技能状态），技能「悔棋时光」和对局回放都靠它
 * 3. 能量规则：
 *    - 每回合开始 +10；本回合每翻 1 子额外 +1，上限单回合 +18
 *    - 能量上限 60；技能必须在落子前选择，选了技能本回合的落子按技能规则结算
 * 4. 六大技能（炸弹子、金身子、偷天换日、连落双子、求你等我、悔棋时光）
 */

import { ENERGY_CONFIG, SKILLS_CONFIG, SkillId } from '../config/skills';
import {
  cloneBoard,
  cloneShieldBoard,
  countPieces,
  createEmptyShieldBoard,
  createInitialBoard,
  getBombExtraFlips,
  getFlipsForCell,
  getOpponent,
  getValidMoves,
  isInBounds,
} from './board';
import {
  GameEvent,
  GameMode,
  GameSnapshot,
  GameState,
  MoveRecord,
  Piece,
  PlayerColor,
  PlayerState,
  Position,
} from './types';

export interface CreateGameOptions {
  mode?: GameMode;
  stageId?: number;
  blackSkills?: SkillId[];
  whiteSkills?: SkillId[];
  blackInitialEnergy?: number;
  whiteInitialEnergy?: number;
}

function createInitialSkillUses(): Record<SkillId, number> {
  return {
    bomb: 0,
    shield: 0,
    steal: 0,
    double: 0,
    wait: 0,
    undo: 0,
  };
}

function clonePlayerState(p: PlayerState): PlayerState {
  return {
    color: p.color,
    energy: p.energy,
    equippedSkills: [...p.equippedSkills],
    skillUses: { ...p.skillUses },
  };
}

export function createSnapshot(state: GameState): GameSnapshot {
  return {
    stepIndex: state.stepIndex,
    board: cloneBoard(state.board),
    shielded: cloneShieldBoard(state.shielded),
    currentPlayer: state.currentPlayer,
    players: {
      [Piece.Black]: clonePlayerState(state.players[Piece.Black]),
      [Piece.White]: clonePlayerState(state.players[Piece.White]),
    },
    consecutivePasses: state.consecutivePasses,
  };
}

export function cloneGameState(state: GameState): GameState {
  return {
    mode: state.mode,
    stageId: state.stageId,
    board: cloneBoard(state.board),
    shielded: cloneShieldBoard(state.shielded),
    currentPlayer: state.currentPlayer,
    players: {
      [Piece.Black]: clonePlayerState(state.players[Piece.Black]),
      [Piece.White]: clonePlayerState(state.players[Piece.White]),
    },
    selectedSkill: state.selectedSkill ? { ...state.selectedSkill } : null,
    pendingWaitRequest: state.pendingWaitRequest ? { ...state.pendingWaitRequest } : null,
    consecutivePasses: state.consecutivePasses,
    isGameOver: state.isGameOver,
    winner: state.winner,
    stepIndex: state.stepIndex,
    snapshots: state.snapshots.map((s) => ({
      stepIndex: s.stepIndex,
      board: cloneBoard(s.board),
      shielded: cloneShieldBoard(s.shielded),
      currentPlayer: s.currentPlayer,
      players: {
        [Piece.Black]: clonePlayerState(s.players[Piece.Black]),
        [Piece.White]: clonePlayerState(s.players[Piece.White]),
      },
      consecutivePasses: s.consecutivePasses,
    })),
    moveHistory: state.moveHistory.map((m) => ({
      ...m,
      position: m.position ? { ...m.position } : undefined,
      secondPosition: m.secondPosition ? { ...m.secondPosition } : undefined,
      flippedPositions: m.flippedPositions.map((p) => ({ ...p })),
    })),
    lastEvents: [...state.lastEvents],
  };
}

/**
 * 给指定玩家增加能量（受 maxEnergy = 60 上限约束），返回实际增加量
 */
function addPlayerEnergy(playerState: PlayerState, rawAmount: number): number {
  const before = playerState.energy;
  playerState.energy = Math.min(ENERGY_CONFIG.maxEnergy, before + rawAmount);
  return playerState.energy - before;
}

/**
 * 创建新对局
 * 黑先；回合 1 开始时黑方触发回合初 +10 能量
 */
export function createGame(options: CreateGameOptions = {}): GameState {
  const mode = options.mode ?? 'local2p';
  const blackInit = Math.min(
    ENERGY_CONFIG.maxEnergy,
    options.blackInitialEnergy ?? ENERGY_CONFIG.initialEnergy
  );
  const whiteInit = Math.min(
    ENERGY_CONFIG.maxEnergy,
    options.whiteInitialEnergy ?? ENERGY_CONFIG.initialEnergy
  );

  const state: GameState = {
    mode,
    stageId: options.stageId,
    board: createInitialBoard(),
    shielded: createEmptyShieldBoard(),
    currentPlayer: Piece.Black,
    players: {
      [Piece.Black]: {
        color: Piece.Black,
        energy: blackInit,
        equippedSkills: options.blackSkills ? [...options.blackSkills] : ['bomb', 'shield', 'wait'],
        skillUses: createInitialSkillUses(),
      },
      [Piece.White]: {
        color: Piece.White,
        energy: whiteInit,
        equippedSkills: options.whiteSkills ? [...options.whiteSkills] : ['bomb', 'shield', 'wait'],
        skillUses: createInitialSkillUses(),
      },
    },
    selectedSkill: null,
    pendingWaitRequest: null,
    consecutivePasses: 0,
    isGameOver: false,
    winner: null,
    stepIndex: 0,
    snapshots: [],
    moveHistory: [],
    lastEvents: [],
  };

  // 第 1 回合黑方开始获得 +10 能量
  const gained = addPlayerEnergy(state.players[Piece.Black], ENERGY_CONFIG.turnStartGain);
  if (gained > 0) {
    state.lastEvents.push({
      type: 'ENERGY_GAINED',
      player: Piece.Black,
      amount: gained,
      newEnergy: state.players[Piece.Black].energy,
      reason: 'TURN_START',
    });
  }

  // 保存初始快照（stepIndex = 0）
  state.snapshots.push(createSnapshot(state));

  return state;
}

/**
 * 判断某技能在当前回合是否可被当前玩家选择
 * 处理：
 * - 是否携带该技能
 * - 能量是否足够
 * - 使用次数是否未超上限
 * - 联机模式是否禁用（如「悔棋时光」）
 * - 技能与 pass 交互：无合法落子时，炸弹/双子不可选（置灰）
 * - 「金身子」需场上有己方非金身棋子
 * - 「偷天换日」需场上有对方非金身棋子且对方棋子总数 > 1
 * - 「悔棋时光」需历史快照中存在该玩家上一步状态
 */
export function canUseSkill(
  state: GameState,
  player: PlayerColor,
  skillId: SkillId
): { usable: boolean; reason?: string } {
  if (state.isGameOver) {
    return { usable: false, reason: '对局已结束' };
  }
  if (state.currentPlayer !== player) {
    return { usable: false, reason: '非当前玩家回合' };
  }
  if (state.pendingWaitRequest) {
    return { usable: false, reason: '正在等待对方响应请求' };
  }
  if (state.selectedSkill?.doubleStep === 2) {
    return { usable: false, reason: '正在进行连落双子第二子' };
  }

  const pState = state.players[player];
  if (!pState.equippedSkills.includes(skillId)) {
    return { usable: false, reason: '未携带该技能' };
  }

  const cfg = SKILLS_CONFIG[skillId];
  if (!cfg.allowInOnline && state.mode === 'online') {
    return { usable: false, reason: '联机模式禁用该技能' };
  }
  if (cfg.maxUsesPerGame !== null && pState.skillUses[skillId] >= cfg.maxUsesPerGame) {
    return { usable: false, reason: `每局最多使用 ${cfg.maxUsesPerGame} 次` };
  }
  if (pState.energy < cfg.cost) {
    return { usable: false, reason: `能量不足（需 ${cfg.cost}）` };
  }

  const validMoves = getValidMoves(state.board, player, state.shielded);
  if (cfg.requiresValidMove && validMoves.length === 0) {
    return { usable: false, reason: '当前无合法落子点' };
  }

  if (skillId === 'shield') {
    // 场上有己方未加金身的棋子，且当前有合法落子或可行动
    if (validMoves.length === 0) {
      return { usable: false, reason: '当前无合法落子点' };
    }
    const targets = getSkillTargets(state, player, 'shield');
    if (targets.length === 0) {
      return { usable: false, reason: '场上无可用的己方普通棋子' };
    }
  }

  if (skillId === 'steal') {
    const targets = getSkillTargets(state, player, 'steal');
    if (targets.length === 0) {
      return { usable: false, reason: '场上无可转换的敌方棋子' };
    }
  }

  if (skillId === 'undo') {
    // 查找历史快照中属于当前玩家的上一次行动前快照（不含当前 stepIndex）
    const hasPrevSnapshot = state.snapshots
      .slice(0, -1)
      .some((snap) => snap.currentPlayer === player);
    if (!hasPrevSnapshot) {
      return { usable: false, reason: '尚无上一步可悔棋' };
    }
  }

  return { usable: true };
}

/**
 * 获取技能可作用的目标格子列表（用于 UI 高亮可作用目标）
 */
export function getSkillTargets(
  state: GameState,
  player: PlayerColor,
  skillId: SkillId
): Position[] {
  const opponent = getOpponent(player);
  const targets: Position[] = [];

  if (skillId === 'bomb' || skillId === 'double') {
    return getValidMoves(state.board, player, state.shielded).map((m) => ({
      row: m.row,
      col: m.col,
    }));
  }

  if (skillId === 'shield') {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (state.board[r][c] === player && !state.shielded[r][c]) {
          targets.push({ row: r, col: c });
        }
      }
    }
    return targets;
  }

  if (skillId === 'steal') {
    const counts = countPieces(state.board);
    const oppCount = opponent === Piece.Black ? counts.black : counts.white;
    if (oppCount <= 1) {
      return [];
    }
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (state.board[r][c] === opponent && !state.shielded[r][c]) {
          targets.push({ row: r, col: c });
        }
      }
    }
    return targets;
  }

  return targets;
}

/**
 * 选择技能或取消选择技能（技能状态机）
 * - 未选技能 = 普通落子
 * - 选技能后高亮可作用目标；点空白处或传 null 取消选择、不扣能量
 * - 对于无需选棋盘格的技能（wait / undo），调用 selectSkill 也可直接触发或通过 executeImmediateSkill 触发
 */
export function selectSkill(
  state: GameState,
  skillId: SkillId | null
): { state: GameState; ok: boolean; reason?: string } {
  const next = cloneGameState(state);
  next.lastEvents = [];

  if (skillId === null) {
    // 连落双子已落第 1 子时不可取消
    if (next.selectedSkill?.doubleStep === 2) {
      return { state: next, ok: false, reason: '已落第一子，请完成第二子落子' };
    }
    next.selectedSkill = null;
    return { state: next, ok: true };
  }

  const check = canUseSkill(next, next.currentPlayer, skillId);
  if (!check.usable) {
    return { state: next, ok: false, reason: check.reason };
  }

  next.selectedSkill = {
    skillId,
    doubleStep: skillId === 'double' ? 1 : undefined,
  };
  return { state: next, ok: true };
}

/**
 * 内部辅助：结算翻子获得的额外能量
 * 规则：每回合开始 +10；本回合每翻 1 子额外 +1，上限单回合 +18
 * 因此本回合通过翻子最多可再获得 18 - 10 = 8 点能量（若连落双子两步累计翻子，同样受单回合翻子上限 8 约束）
 */
function grantFlipEnergy(
  state: GameState,
  player: PlayerColor,
  flippedCount: number,
  alreadyFlippedInTurn = 0
): void {
  const maxFlipAllowance = Math.max(
    0,
    ENERGY_CONFIG.maxGainPerTurn - ENERGY_CONFIG.turnStartGain
  );
  const remainingAllowance = Math.max(0, maxFlipAllowance - alreadyFlippedInTurn);
  const rawFlipEnergy = Math.min(
    remainingAllowance,
    flippedCount * ENERGY_CONFIG.perFlipGain
  );
  if (rawFlipEnergy > 0) {
    const actualGained = addPlayerEnergy(state.players[player], rawFlipEnergy);
    if (actualGained > 0) {
      state.lastEvents.push({
        type: 'ENERGY_GAINED',
        player,
        amount: actualGained,
        newEnergy: state.players[player].energy,
        reason: 'FLIPS',
      });
    }
  }
}

/**
 * 内部辅助：推进到下一回合，处理自动 pass、回合初能量恢复、终局判定与保存快照
 */
function advanceTurn(state: GameState): void {
  const counts = countPieces(state.board);

  // 1. 棋盘满或一方被吃光 → 立即终局
  if (counts.empty === 0 || counts.black === 0 || counts.white === 0) {
    finishGame(
      state,
      counts.empty === 0 ? 'BOARD_FULL' : 'WIPEOUT'
    );
    return;
  }

  const nextPlayer = getOpponent(state.currentPlayer);
  state.currentPlayer = nextPlayer;
  state.selectedSkill = null;

  const nextMoves = getValidMoves(state.board, nextPlayer, state.shielded);
  if (nextMoves.length > 0) {
    state.consecutivePasses = 0;
    const gained = addPlayerEnergy(state.players[nextPlayer], ENERGY_CONFIG.turnStartGain);
    if (gained > 0) {
      state.lastEvents.push({
        type: 'ENERGY_GAINED',
        player: nextPlayer,
        amount: gained,
        newEnergy: state.players[nextPlayer].energy,
        reason: 'TURN_START',
      });
    }
    state.stepIndex += 1;
    state.snapshots.push(createSnapshot(state));
    return;
  }

  // 下一位玩家无合法落子点：
  // 检查该玩家是否还能使用无需合法落子的主动技能（求你等我 / 偷天换日）？
  // 根据规则第 1 节 & 第 2 节：
  // - 「无合法点 → 自动跳过回合（pass），并给出 UI 提示事件」
  // - 「无合法落子时只能用『求你等我』或 pass，炸弹/双子不可选（置灰）」
  // 如果该玩家没有携带/无法使用「求你等我」，则立即自动 pass！
  // 若该玩家可以使用「求你等我」，我们在自动對弈/常规流转中允许玩家主动调 passTurn 或自动 pass。
  // 为保证规则 1（无合法点 → 自动跳过回合 pass，双方连续无子可下 → 终局）100% 确定性不卡死：
  // 先给该回合玩家检查对手是否有合法落子：
  const otherPlayer = getOpponent(nextPlayer);
  const otherMoves = getValidMoves(state.board, otherPlayer, state.shielded);

  if (otherMoves.length === 0) {
    // 双方均无合法落子点 → 立即终局！
    state.consecutivePasses = 2;
    state.lastEvents.push({
      type: 'TURN_PASSED',
      player: nextPlayer,
      reason: 'NO_VALID_MOVE',
    });
    finishGame(state, 'BOTH_NO_MOVES');
    return;
  }

  // 检查 nextPlayer 是否能使用「求你等我」：
  // 若不能使用「求你等我」，则直接自动 pass 回 otherPlayer！
  // 若可以使用「求你等我」，先给回合初能量并停在 nextPlayer 让其选择「求你等我」或点击「跳过回合(Pass)」；
  // 同时提供 autoPassIfNoMoves 参数或直接支持 passTurn。
  const gained = addPlayerEnergy(state.players[nextPlayer], ENERGY_CONFIG.turnStartGain);
  if (gained > 0) {
    state.lastEvents.push({
      type: 'ENERGY_GAINED',
      player: nextPlayer,
      amount: gained,
      newEnergy: state.players[nextPlayer].energy,
      reason: 'TURN_START',
    });
  }

  const canWait = canUseSkill(state, nextPlayer, 'wait').usable;
  if (!canWait) {
    // 自动 pass 并切回 otherPlayer
    state.consecutivePasses += 1;
    state.lastEvents.push({
      type: 'TURN_PASSED',
      player: nextPlayer,
      reason: 'NO_VALID_MOVE',
    });
    state.moveHistory.push({
      stepIndex: state.stepIndex + 1,
      player: nextPlayer,
      actionType: 'pass',
      flippedCount: 0,
      flippedPositions: [],
      blackCountAfter: counts.black,
      whiteCountAfter: counts.white,
      description: `${nextPlayer === Piece.Black ? '黑方' : '白方'}无合法落子，自动跳过回合`,
    });

    state.currentPlayer = otherPlayer;
    state.consecutivePasses = 0;
    const otherGained = addPlayerEnergy(
      state.players[otherPlayer],
      ENERGY_CONFIG.turnStartGain
    );
    if (otherGained > 0) {
      state.lastEvents.push({
        type: 'ENERGY_GAINED',
        player: otherPlayer,
        amount: otherGained,
        newEnergy: state.players[otherPlayer].energy,
        reason: 'TURN_START',
      });
    }
  }

  state.stepIndex += 1;
  state.snapshots.push(createSnapshot(state));
}

function finishGame(
  state: GameState,
  reason: 'BOARD_FULL' | 'BOTH_NO_MOVES' | 'WIPEOUT' | 'SURRENDER',
  forcedWinner?: PlayerColor
): void {
  const counts = countPieces(state.board);
  state.isGameOver = true;
  state.selectedSkill = null;
  state.pendingWaitRequest = null;

  if (forcedWinner) {
    state.winner = forcedWinner;
  } else if (counts.black > counts.white) {
    state.winner = Piece.Black;
  } else if (counts.white > counts.black) {
    state.winner = Piece.White;
  } else {
    state.winner = 'DRAW';
  }

  state.lastEvents.push({
    type: 'GAME_OVER',
    winner: state.winner,
    blackCount: counts.black,
    whiteCount: counts.white,
    reason,
  });

  state.stepIndex += 1;
  state.snapshots.push(createSnapshot(state));
}

/**
 * 当无合法落子但因持有「求你等我」停留在本回合时，玩家主动选择跳过回合（Pass）
 */
export function passTurn(state: GameState): {
  state: GameState;
  ok: boolean;
  reason?: string;
} {
  if (state.isGameOver) {
    return { state, ok: false, reason: '对局已结束' };
  }
  const player = state.currentPlayer;
  const moves = getValidMoves(state.board, player, state.shielded);
  if (moves.length > 0) {
    return { state, ok: false, reason: '当前有合法落子，不能主动跳过' };
  }

  const next = cloneGameState(state);
  next.lastEvents = [];
  next.selectedSkill = null;
  next.consecutivePasses += 1;

  const counts = countPieces(next.board);
  next.lastEvents.push({
    type: 'TURN_PASSED',
    player,
    reason: 'NO_VALID_MOVE',
  });
  next.moveHistory.push({
    stepIndex: next.stepIndex + 1,
    player,
    actionType: 'pass',
    flippedCount: 0,
    flippedPositions: [],
    blackCountAfter: counts.black,
    whiteCountAfter: counts.white,
    description: `${player === Piece.Black ? '黑方' : '白方'}无子可下，跳过回合`,
  });

  if (next.consecutivePasses >= 2) {
    finishGame(next, 'BOTH_NO_MOVES');
    return { state: next, ok: true };
  }

  advanceTurn(next);
  return { state: next, ok: true };
}

/**
 * 在棋盘 (row, col) 执行点击/落子/目标指定：
 * - 若未选技能：执行普通落子
 * - 若已选「炸弹子 (bomb)」：正常落子并额外炸翻十字四方向对方非金身棋子
 * - 若已选「金身子 (shield)」：指定己方一颗非金身棋子加护盾（扣除能量，随后本回合继续普通落子）
 * - 若已选「偷天换日 (steal)」：指定对方一颗非金身棋子直接变色（消耗本回合行动）
 * - 若已选「连落双子 (double)」：连续落两子，第一子落后若第二子无合法点则自动退还一半能量（+25）并结束回合
 */
export function applyBoardAction(
  state: GameState,
  row: number,
  col: number
): { state: GameState; ok: boolean; reason?: string } {
  if (state.isGameOver) {
    return { state, ok: false, reason: '对局已结束' };
  }
  if (state.pendingWaitRequest) {
    return { state, ok: false, reason: '正在等待对方响应「求你等我」' };
  }
  if (!isInBounds(row, col)) {
    return { state, ok: false, reason: '坐标越界' };
  }

  const next = cloneGameState(state);
  next.lastEvents = [];
  const player = next.currentPlayer;
  const pState = next.players[player];
  const activeSkill = next.selectedSkill;

  // 情况 A：已选「金身子 (shield)」→ 目标是己方已有棋子
  if (activeSkill?.skillId === 'shield') {
    if (next.board[row][col] !== player || next.shielded[row][col]) {
      // 点击非目标格：取消选择，不扣能量
      next.selectedSkill = null;
      return { state: next, ok: false, reason: '已取消选择金身子（需点击己方普通棋子）' };
    }
    const cfg = SKILLS_CONFIG.shield;
    pState.energy -= cfg.cost;
    pState.skillUses.shield += 1;
    next.shielded[row][col] = true;
    next.selectedSkill = null;

    next.lastEvents.push({
      type: 'SHIELD_APPLIED',
      player,
      position: { row, col },
    });

    // 金身子是在落子前指定己方一子，随后本回合继续正常落子（若无子可下则 advanceTurn）
    const remainingMoves = getValidMoves(next.board, player, next.shielded);
    if (remainingMoves.length === 0) {
      advanceTurn(next);
    }
    return { state: next, ok: true };
  }

  // 情况 B：已选「偷天换日 (steal)」→ 目标是对方普通棋子，直接变色并结束本回合
  if (activeSkill?.skillId === 'steal') {
    const opponent = getOpponent(player);
    const countsBefore = countPieces(next.board);
    const oppCount = opponent === Piece.Black ? countsBefore.black : countsBefore.white;

    if (
      next.board[row][col] !== opponent ||
      next.shielded[row][col] ||
      oppCount <= 1
    ) {
      next.selectedSkill = null;
      return { state: next, ok: false, reason: '已取消选择偷天换日（需点击对方非金身棋子）' };
    }

    const cfg = SKILLS_CONFIG.steal;
    pState.energy -= cfg.cost;
    pState.skillUses.steal += 1;
    next.board[row][col] = player;
    next.selectedSkill = null;
    next.consecutivePasses = 0;

    next.lastEvents.push({
      type: 'PIECE_STOLEN',
      player,
      position: { row, col },
    });

    grantFlipEnergy(next, player, 1);

    const countsAfter = countPieces(next.board);
    next.moveHistory.push({
      stepIndex: next.stepIndex + 1,
      player,
      actionType: 'skill',
      skillId: 'steal',
      position: { row, col },
      flippedCount: 1,
      flippedPositions: [{ row, col }],
      blackCountAfter: countsAfter.black,
      whiteCountAfter: countsAfter.white,
      description: `${player === Piece.Black ? '黑方' : '白方'}发动【偷天换日】转化 (${row + 1},${col + 1})`,
    });

    advanceTurn(next);
    return { state: next, ok: true };
  }

  // 情况 C：普通落子 / 炸弹子 (bomb) / 连落双子 (double)
  const flips = getFlipsForCell(next.board, player, row, col, next.shielded);
  if (flips.length === 0) {
    // 若当前处于选技能状态（且不是连落双子第 2 步），点击空白/非法格取消技能选择且不扣能量
    if (activeSkill && activeSkill.doubleStep !== 2) {
      next.selectedSkill = null;
      return { state: next, ok: false, reason: '已取消技能选择' };
    }
    return { state: next, ok: false, reason: '非法落子位置' };
  }

  // C1：连落双子 (double)
  if (activeSkill?.skillId === 'double') {
    const cfg = SKILLS_CONFIG.double;

    if (activeSkill.doubleStep === 1) {
      // 第一子落下：先扣 50 能量，记使用 1 次
      pState.energy -= cfg.cost;
      pState.skillUses.double += 1;

      next.board[row][col] = player;
      for (const pos of flips) {
        next.board[pos.row][pos.col] = player;
      }
      next.consecutivePasses = 0;

      next.lastEvents.push({
        type: 'MOVE_PLACED',
        player,
        position: { row, col },
        flipped: flips,
        skillUsed: 'double',
      });
      next.lastEvents.push({
        type: 'DOUBLE_STEP_1_DONE',
        player,
        position: { row, col },
        flipped: flips,
      });

      grantFlipEnergy(next, player, flips.length, 0);

      // 检查第二子是否还有合法落子点
      const secondMoves = getValidMoves(next.board, player, next.shielded);
      if (secondMoves.length === 0) {
        // 第二子无合法点：作废并退还一半能量 (+25)，直接结束本回合
        const refund = Math.floor(cfg.cost * ENERGY_CONFIG.doubleSkillRefundRatio);
        const actualRefund = addPlayerEnergy(pState, refund);
        next.lastEvents.push({
          type: 'DOUBLE_STEP_2_REFUNDED',
          player,
          refundEnergy: actualRefund,
        });
        next.lastEvents.push({
          type: 'ENERGY_GAINED',
          player,
          amount: actualRefund,
          newEnergy: pState.energy,
          reason: 'REFUND',
        });

        const countsAfter = countPieces(next.board);
        next.moveHistory.push({
          stepIndex: next.stepIndex + 1,
          player,
          actionType: 'skill',
          skillId: 'double',
          position: { row, col },
          flippedCount: flips.length,
          flippedPositions: flips,
          blackCountAfter: countsAfter.black,
          whiteCountAfter: countsAfter.white,
          description: `${player === Piece.Black ? '黑方' : '白方'}【连落双子】首子翻 ${flips.length} 子（次子无合法点退还 ${actualRefund} 能量）`,
        });

        next.selectedSkill = null;
        advanceTurn(next);
        return { state: next, ok: true };
      }

      // 停留在当前玩家，进入连落双子第 2 步
      next.selectedSkill = {
        skillId: 'double',
        doubleStep: 2,
      };
      const countsAfter1 = countPieces(next.board);
      next.moveHistory.push({
        stepIndex: next.stepIndex + 1,
        player,
        actionType: 'skill',
        skillId: 'double',
        position: { row, col },
        flippedCount: flips.length,
        flippedPositions: flips,
        blackCountAfter: countsAfter1.black,
        whiteCountAfter: countsAfter1.white,
        description: `${player === Piece.Black ? '黑方' : '白方'}【连落双子】第 1 子翻 ${flips.length} 子`,
      });
      return { state: next, ok: true };
    } else {
      // 连落双子第 2 子落下
      const prevRecord = next.moveHistory[next.moveHistory.length - 1];
      const alreadyFlipped = prevRecord?.skillId === 'double' ? prevRecord.flippedCount : 0;

      next.board[row][col] = player;
      for (const pos of flips) {
        next.board[pos.row][pos.col] = player;
      }

      next.lastEvents.push({
        type: 'MOVE_PLACED',
        player,
        position: { row, col },
        flipped: flips,
        skillUsed: 'double',
      });

      grantFlipEnergy(next, player, flips.length, alreadyFlipped);

      const countsAfter2 = countPieces(next.board);
      if (prevRecord && prevRecord.skillId === 'double' && prevRecord.player === player) {
        prevRecord.secondPosition = { row, col };
        prevRecord.flippedCount += flips.length;
        prevRecord.flippedPositions = [...prevRecord.flippedPositions, ...flips];
        prevRecord.blackCountAfter = countsAfter2.black;
        prevRecord.whiteCountAfter = countsAfter2.white;
        prevRecord.description = `${player === Piece.Black ? '黑方' : '白方'}发动【连落双子】两步共翻 ${prevRecord.flippedCount} 子`;
      }

      next.selectedSkill = null;
      advanceTurn(next);
      return { state: next, ok: true };
    }
  }

  // C2：炸弹子 (bomb)
  if (activeSkill?.skillId === 'bomb') {
    const cfg = SKILLS_CONFIG.bomb;
    pState.energy -= cfg.cost;
    pState.skillUses.bomb += 1;

    next.board[row][col] = player;
    for (const pos of flips) {
      next.board[pos.row][pos.col] = player;
    }

    // 十字四方向各多翻 1 格（仅翻对方子，不连锁，跳过越界与金身子）
    const bombed = getBombExtraFlips(next.board, player, row, col, next.shielded);
    for (const bPos of bombed) {
      next.board[bPos.row][bPos.col] = player;
    }

    const totalFlipped = [...flips, ...bombed];
    next.selectedSkill = null;
    next.consecutivePasses = 0;

    next.lastEvents.push({
      type: 'MOVE_PLACED',
      player,
      position: { row, col },
      flipped: flips,
      skillUsed: 'bomb',
    });
    next.lastEvents.push({
      type: 'BOMB_EXPLODED',
      player,
      center: { row, col },
      bombedPositions: bombed,
    });

    grantFlipEnergy(next, player, totalFlipped.length);

    const countsAfter = countPieces(next.board);
    next.moveHistory.push({
      stepIndex: next.stepIndex + 1,
      player,
      actionType: 'skill',
      skillId: 'bomb',
      position: { row, col },
      flippedCount: totalFlipped.length,
      flippedPositions: totalFlipped,
      blackCountAfter: countsAfter.black,
      whiteCountAfter: countsAfter.white,
      description: `${player === Piece.Black ? '黑方' : '白方'}发动【炸弹子】共翻 ${totalFlipped.length} 子（十字爆破 ${bombed.length} 子）`,
    });

    advanceTurn(next);
    return { state: next, ok: true };
  }

  // C3：普通落子
  next.board[row][col] = player;
  for (const pos of flips) {
    next.board[pos.row][pos.col] = player;
  }
  next.selectedSkill = null;
  next.consecutivePasses = 0;

  next.lastEvents.push({
    type: 'MOVE_PLACED',
    player,
    position: { row, col },
    flipped: flips,
  });

  grantFlipEnergy(next, player, flips.length);

  const countsAfter = countPieces(next.board);
  next.moveHistory.push({
    stepIndex: next.stepIndex + 1,
    player,
    actionType: 'move',
    position: { row, col },
    flippedCount: flips.length,
    flippedPositions: flips,
    blackCountAfter: countsAfter.black,
    whiteCountAfter: countsAfter.white,
    description: `${player === Piece.Black ? '黑方' : '白方'}落子 (${row + 1},${col + 1}) 翻 ${flips.length} 子`,
  });

  advanceTurn(next);
  return { state: next, ok: true };
}

/**
 * 发动「求你等我 (wait)」技能：
 * - 请求跳过本回合换 +20 能量（扣 5 能量，获得 +20 能量）
 * - 人机 (ai) / 双人同屏 (local2p) 默认直接同意
 * - 好友联机 (online) 进入 pendingWaitRequest 等待对方点同意/拒绝
 */
export function useWaitSkill(state: GameState): {
  state: GameState;
  ok: boolean;
  reason?: string;
} {
  const player = state.currentPlayer;
  const check = canUseSkill(state, player, 'wait');
  if (!check.usable) {
    return { state, ok: false, reason: check.reason };
  }

  const next = cloneGameState(state);
  next.lastEvents = [];
  next.selectedSkill = null;

  if (next.mode === 'online') {
    next.pendingWaitRequest = { requester: player };
    next.lastEvents.push({
      type: 'WAIT_REQUESTED',
      player,
    });
    return { state: next, ok: true };
  }

  // 人机/同屏默认同意
  return respondToWaitSkill(
    {
      ...next,
      pendingWaitRequest: { requester: player },
    },
    true
  );
}

/**
 * 响应「求你等我 (wait)」请求（同意 / 拒绝）：
 * - 若对方拒绝：正常落子且不扣能量、不计使用次数
 * - 若对方同意：扣 5 能量、计 1 次使用、增加 +20 能量，跳过本回合轮到对方
 */
export function respondToWaitSkill(
  state: GameState,
  approved: boolean
): { state: GameState; ok: boolean; reason?: string } {
  if (!state.pendingWaitRequest) {
    return { state, ok: false, reason: '当前没有待处理的求你等我请求' };
  }

  const next = cloneGameState(state);
  next.lastEvents = [];
  const player = next.pendingWaitRequest!.requester;
  next.pendingWaitRequest = null;
  next.selectedSkill = null;

  if (!approved) {
    next.lastEvents.push({
      type: 'WAIT_RESOLVED',
      player,
      approved: false,
      energyDelta: 0,
    });
    return { state: next, ok: true };
  }

  const pState = next.players[player];
  const cfg = SKILLS_CONFIG.wait;
  pState.energy -= cfg.cost;
  pState.skillUses.wait += 1;

  const gained = addPlayerEnergy(pState, ENERGY_CONFIG.waitSkillGain);
  next.lastEvents.push({
    type: 'WAIT_RESOLVED',
    player,
    approved: true,
    energyDelta: gained - cfg.cost,
  });
  next.lastEvents.push({
    type: 'ENERGY_GAINED',
    player,
    amount: gained,
    newEnergy: pState.energy,
    reason: 'WAIT_SKILL',
  });
  next.lastEvents.push({
    type: 'TURN_PASSED',
    player,
    reason: 'WAIT_SKILL',
  });

  const counts = countPieces(next.board);
  next.moveHistory.push({
    stepIndex: next.stepIndex + 1,
    player,
    actionType: 'skill',
    skillId: 'wait',
    flippedCount: 0,
    flippedPositions: [],
    blackCountAfter: counts.black,
    whiteCountAfter: counts.white,
    description: `${player === Piece.Black ? '黑方' : '白方'}发动【求你等我】跳过回合获得 +${gained} 能量`,
  });

  // 推进到对方回合
  advanceTurn(next);
  return { state: next, ok: true };
}

/**
 * 发动「悔棋时光 (undo)」技能：
 * - 撤销自己上一步，回到自己上回合行动前的快照状态
 * - 每局 1 次；联机模式禁用（防扯皮），仅人机/同屏可用
 */
export function useUndoSkill(state: GameState): {
  state: GameState;
  ok: boolean;
  reason?: string;
} {
  const player = state.currentPlayer;
  const check = canUseSkill(state, player, 'undo');
  if (!check.usable) {
    return { state, ok: false, reason: check.reason };
  }

  // 在历史快照中从后往前找（排除最后一个即当前回合快照），找到上一个 currentPlayer === player 的快照
  let targetSnapIdx = -1;
  for (let i = state.snapshots.length - 2; i >= 0; i--) {
    if (state.snapshots[i].currentPlayer === player) {
      targetSnapIdx = i;
      break;
    }
  }

  if (targetSnapIdx === -1) {
    return { state, ok: false, reason: '未找到可回退的上回合快照' };
  }

  const snap = state.snapshots[targetSnapIdx];
  const next = cloneGameState(state);
  next.lastEvents = [];

  // 恢复棋盘、金身子与双方状态到 targetSnap
  next.board = cloneBoard(snap.board);
  next.shielded = cloneShieldBoard(snap.shielded);
  next.currentPlayer = snap.currentPlayer;
  next.consecutivePasses = snap.consecutivePasses;
  next.players = {
    [Piece.Black]: clonePlayerState(snap.players[Piece.Black]),
    [Piece.White]: clonePlayerState(snap.players[Piece.White]),
  };

  // 扣除本次悔棋时光消耗的 25 能量，并标记已使用 1 次
  const cfg = SKILLS_CONFIG.undo;
  next.players[player].energy = Math.max(0, state.players[player].energy - cfg.cost);
  next.players[player].skillUses.undo = state.players[player].skillUses.undo + 1;

  next.selectedSkill = null;
  next.pendingWaitRequest = null;
  next.isGameOver = false;
  next.winner = null;
  next.stepIndex = snap.stepIndex;
  next.snapshots = next.snapshots.slice(0, targetSnapIdx + 1);
  // 同步更新最新快照中的能量与 undo 次数
  next.snapshots[next.snapshots.length - 1] = createSnapshot(next);
  next.moveHistory = next.moveHistory.slice(0, targetSnapIdx);

  next.lastEvents.push({
    type: 'UNDO_PERFORMED',
    player,
    restoredStepIndex: snap.stepIndex,
  });

  return { state: next, ok: true };
}

/**
 * 认输（联机中途退出或点击认输按钮）
 */
export function surrenderGame(
  state: GameState,
  surrenderingPlayer: PlayerColor
): GameState {
  if (state.isGameOver) return state;
  const next = cloneGameState(state);
  next.lastEvents = [];
  const winner = getOpponent(surrenderingPlayer);
  finishGame(next, 'SURRENDER', winner);
  return next;
}

/**
 * 计算本局「最大翻盘步」（结算页高亮：单步翻子最多的一步）
 */
export function getBiggestComebackMove(state: GameState): MoveRecord | null {
  if (state.moveHistory.length === 0) return null;
  let best: MoveRecord | null = null;
  for (const record of state.moveHistory) {
    if (record.flippedCount > 0) {
      if (!best || record.flippedCount > best.flippedCount) {
        best = record;
      }
    }
  }
  return best;
}
