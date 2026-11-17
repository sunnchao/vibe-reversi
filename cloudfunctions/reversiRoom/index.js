"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// cloudfunctions/reversiRoom/index.ts
var reversiRoom_exports = {};
__export(reversiRoom_exports, {
  main: () => main
});
module.exports = __toCommonJS(reversiRoom_exports);

// src/config/skills.ts
var ENERGY_CONFIG = {
  initialEnergy: 0,
  turnStartGain: 10,
  perFlipGain: 1,
  maxGainPerTurn: 18,
  maxEnergy: 60,
  waitSkillGain: 20,
  doubleSkillRefundRatio: 0.5
};
var SKILLS_CONFIG = {
  bomb: {
    id: "bomb",
    name: "\u70B8\u5F39\u5B50",
    cost: 30,
    maxUsesPerGame: null,
    allowInOnline: true,
    requiresValidMove: true,
    targetType: "move_cell",
    unlockStage: 0,
    shortDesc: "\u843D\u5B50\u540E\u5341\u5B57\u56DB\u65B9\u5411\u5404\u591A\u7FFB 1 \u683C\u654C\u65B9\u68CB\u5B50",
    detailDesc: "\u843D\u5B50\u5E76\u5B8C\u6210\u6B63\u5E38\u7FFB\u8F6C\u540E\uFF0C\u4EE5\u843D\u5B50\u70B9\u4E3A\u4E2D\u5FC3\uFF0C\u4E0A\u4E0B\u5DE6\u53F3\u5341\u5B57\u56DB\u65B9\u5411\u5404\u591A\u7FFB\u8F6C 1 \u683C\u5BF9\u65B9\u68CB\u5B50\uFF08\u4E0D\u89E6\u53D1\u8FDE\u9501\u53CD\u5E94\uFF09\u3002\u8FB9\u7F18\u8D8A\u754C\u81EA\u52A8\u8DF3\u8FC7\uFF1B\u70B8\u5230\u5BF9\u65B9\u300C\u91D1\u8EAB\u5B50\u300D\u4E0D\u4F1A\u7FFB\u8F6C\u3002"
  },
  shield: {
    id: "shield",
    name: "\u91D1\u8EAB\u5B50",
    cost: 20,
    maxUsesPerGame: null,
    allowInOnline: true,
    requiresValidMove: false,
    targetType: "own_piece",
    unlockStage: 0,
    shortDesc: "\u6307\u5B9A\u5DF1\u65B9\u4E00\u5B50\u672C\u5C40\u6C38\u4E0D\u53EF\u88AB\u7FFB\u8F6C\u6216\u963B\u65AD\u5939\u7EBF",
    detailDesc: "\u843D\u5B50\u524D\u6307\u5B9A\u5DF1\u65B9\u68CB\u76D8\u4E0A\u4E00\u9897\u5DF2\u6709\u68CB\u5B50\u8D4B\u4E88\u91D1\u8EAB\u62A4\u76FE\uFF08\u672C\u56DE\u5408\u4ECD\u9700\u6B63\u5E38\u843D\u5B50\u6216\u65E0\u5B50\u8DF3\u8FC7\uFF09\u3002\u91D1\u8EAB\u5B50\u672C\u5C40\u4E0D\u53EF\u88AB\u5E38\u89C4\u7FFB\u8F6C\u3001\u4E0D\u53EF\u88AB\u70B8\u5F39\u70B8\u7FFB\u3001\u4E0D\u53EF\u88AB\u5077\u5929\u6362\u65E5\u9009\u4E2D\uFF1B\u4E14\u88AB\u91D1\u8EAB\u5B50\u963B\u65AD\u7684\u5939\u5B50\u7EBF\u4E0D\u6210\u7ACB\uFF01"
  },
  steal: {
    id: "steal",
    name: "\u5077\u5929\u6362\u65E5",
    cost: 40,
    maxUsesPerGame: null,
    allowInOnline: true,
    requiresValidMove: false,
    targetType: "opponent_piece",
    unlockStage: 3,
    shortDesc: "\u76F4\u63A5\u5C06\u5BF9\u65B9\u4E00\u9897\u975E\u91D1\u8EAB\u68CB\u5B50\u53D8\u4E3A\u5DF1\u65B9\u989C\u8272",
    detailDesc: "\u6307\u5B9A\u68CB\u76D8\u4E0A\u5BF9\u65B9\u4E00\u9897\u666E\u901A\u68CB\u5B50\u76F4\u63A5\u53D8\u4E3A\u5DF1\u65B9\u989C\u8272\uFF08\u6D88\u8017\u672C\u56DE\u5408\u884C\u52A8\uFF0C\u4E0D\u518D\u5E38\u89C4\u843D\u5B50\uFF09\uFF0C\u4E0D\u89E6\u53D1\u4EFB\u4F55\u8FDE\u9501\u7FFB\u8F6C\u3002\u4E0D\u80FD\u9009\u62E9\u5BF9\u65B9\u7684\u300C\u91D1\u8EAB\u5B50\u300D\uFF1B\u4E14\u4E0D\u80FD\u5C06\u5BF9\u65B9\u573A\u4E0A\u6700\u540E\u4E00\u9897\u68CB\u5B50\u53D8\u8272\u5BFC\u81F4\u5BF9\u65B9\u76F4\u63A5\u5F52\u96F6\uFF08\u82E5\u5BF9\u65B9\u4EC5\u5269 1 \u5B50\u5219\u4E0D\u53EF\u5BF9\u5176\u91CA\u653E\uFF09\u3002"
  },
  double: {
    id: "double",
    name: "\u8FDE\u843D\u53CC\u5B50",
    cost: 50,
    maxUsesPerGame: null,
    allowInOnline: true,
    requiresValidMove: true,
    targetType: "move_cell",
    unlockStage: 6,
    shortDesc: "\u672C\u56DE\u5408\u8FDE\u7EED\u843D 2 \u5B50\uFF0C\u5404\u81EA\u6B63\u5E38\u7ED3\u7B97\u7FFB\u8F6C",
    detailDesc: "\u5F00\u542F\u540E\u672C\u56DE\u5408\u8FDE\u7EED\u843D 2 \u9897\u5B50\uFF0C\u7B2C\u4E00\u5B50\u843D\u4E0B\u7FFB\u8F6C\u540E\u5BF9\u65B9\u4E0D\u63D2\u56DE\u5408\uFF0C\u7ACB\u5373\u7531\u5DF1\u65B9\u843D\u7B2C\u4E8C\u5B50\u3002\u7B2C\u4E8C\u5B50\u4ECD\u987B\u7B26\u5408\u5408\u6CD5\u843D\u5B50\u89C4\u5219\uFF1B\u82E5\u7B2C\u4E00\u5B50\u843D\u4E0B\u540E\u5DF1\u65B9\u65E0\u5408\u6CD5\u70B9\u53EF\u843D\u7B2C\u4E8C\u5B50\uFF0C\u5219\u7B2C\u4E8C\u5B50\u4F5C\u5E9F\u5E76\u81EA\u52A8\u9000\u8FD8\u4E00\u534A\u80FD\u91CF\uFF08+25\uFF09\u3002"
  },
  wait: {
    id: "wait",
    name: "\u6C42\u4F60\u7B49\u6211",
    cost: 5,
    maxUsesPerGame: 2,
    allowInOnline: true,
    requiresValidMove: false,
    targetType: "none",
    unlockStage: 0,
    shortDesc: "\u8BF7\u6C42\u8DF3\u8FC7\u672C\u56DE\u5408\u6362\u53D6 +20 \u80FD\u91CF\uFF08\u6BCF\u5C40\u6700\u591A 2 \u6B21\uFF09",
    detailDesc: "\u6D88\u8017 5 \u80FD\u91CF\u8BF7\u6C42\u8DF3\u8FC7\u672C\u56DE\u5408\uFF0C\u82E5\u751F\u6548\u5219\u989D\u5916\u83B7\u5F97 +20 \u80FD\u91CF\uFF08\u51C0\u589E +15\uFF09\u5E76\u76F4\u63A5\u8F6E\u5230\u5BF9\u65B9\u3002\u4EBA\u673A\u4E0E\u53CC\u4EBA\u540C\u5C4F\u6A21\u5F0F\u9ED8\u8BA4\u540C\u610F\uFF1B\u597D\u53CB\u8054\u673A\u6A21\u5F0F\u7531\u5BF9\u65B9\u70B9\u51FB\u540C\u610F/\u62D2\u7EDD\uFF0C\u82E5\u5BF9\u65B9\u62D2\u7EDD\u5219\u4E0D\u6263\u80FD\u91CF\u3001\u4E0D\u8BA1\u6B21\u6570\uFF0C\u672C\u56DE\u5408\u7EE7\u7EED\u6B63\u5E38\u843D\u5B50\u3002\u6BCF\u5C40\u6700\u591A\u6210\u529F\u4F7F\u7528 2 \u6B21\u3002"
  },
  undo: {
    id: "undo",
    name: "\u6094\u68CB\u65F6\u5149",
    cost: 25,
    maxUsesPerGame: 1,
    allowInOnline: false,
    requiresValidMove: false,
    targetType: "none",
    unlockStage: 1,
    shortDesc: "\u64A4\u9500\u81EA\u5DF1\u4E0A\u4E00\u6B65\u56DE\u5230\u4E0A\u56DE\u5408\u521D\uFF08\u4EC5\u5355\u673A/\u540C\u5C4F\uFF09",
    detailDesc: "\u6D88\u8017 25 \u80FD\u91CF\uFF0C\u65F6\u5149\u5012\u6D41\u56DE\u5230\u81EA\u5DF1\u4E0A\u4E00\u6B21\u884C\u52A8\u524D\u7684\u68CB\u76D8\u4E0E\u72B6\u6001\uFF08\u6263\u9664\u672C\u6B21\u6D88\u8017\u7684 25 \u80FD\u91CF\u5E76\u8BA1\u5DF2\u4F7F\u7528 1 \u6B21\uFF09\u3002\u6BCF\u5C40\u4EC5\u9650\u4F7F\u7528 1 \u6B21\uFF1B\u4E3A\u9632\u6B62\u8054\u673A\u626F\u76AE\uFF0C\u597D\u53CB\u623F\u8054\u673A\u6A21\u5F0F\u7981\u7528\u6B64\u6280\u80FD\u3002"
  }
};

// src/core/types.ts
var BOARD_SIZE = 8;

// src/core/board.ts
var DIRECTIONS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1]
];
var ORTHOGONAL_DIRECTIONS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1]
];
function getOpponent(color) {
  return color === 1 /* Black */ ? 2 /* White */ : 1 /* Black */;
}
function isInBounds(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}
function createEmptyBoard() {
  return Array.from(
    { length: BOARD_SIZE },
    () => Array.from({ length: BOARD_SIZE }, () => 0 /* Empty */)
  );
}
function createEmptyShieldBoard() {
  return Array.from(
    { length: BOARD_SIZE },
    () => Array.from({ length: BOARD_SIZE }, () => false)
  );
}
function createInitialBoard() {
  const board = createEmptyBoard();
  board[3][3] = 2 /* White */;
  board[3][4] = 1 /* Black */;
  board[4][3] = 1 /* Black */;
  board[4][4] = 2 /* White */;
  return board;
}
function cloneBoard(board) {
  return board.map((row) => [...row]);
}
function cloneShieldBoard(shielded) {
  return shielded.map((row) => [...row]);
}
function getFlipsForCell(board, color, row, col, shielded) {
  if (!isInBounds(row, col) || board[row][col] !== 0 /* Empty */) {
    return [];
  }
  const opponent = getOpponent(color);
  const allFlips = [];
  for (const [dr, dc] of DIRECTIONS) {
    const lineFlips = [];
    let r = row + dr;
    let c = col + dc;
    let blockedByShield = false;
    while (isInBounds(r, c) && board[r][c] === opponent) {
      if (shielded && shielded[r][c]) {
        blockedByShield = true;
        break;
      }
      lineFlips.push({ row: r, col: c });
      r += dr;
      c += dc;
    }
    if (!blockedByShield && lineFlips.length > 0 && isInBounds(r, c) && board[r][c] === color) {
      allFlips.push(...lineFlips);
    }
  }
  return allFlips;
}
function getValidMoves(board, color, shielded) {
  const moves = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (board[row][col] !== 0 /* Empty */)
        continue;
      const flips = getFlipsForCell(board, color, row, col, shielded);
      if (flips.length > 0) {
        moves.push({ row, col, flips });
      }
    }
  }
  return moves;
}
function countPieces(board) {
  let black = 0;
  let white = 0;
  let empty = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = board[r][c];
      if (cell === 1 /* Black */)
        black++;
      else if (cell === 2 /* White */)
        white++;
      else
        empty++;
    }
  }
  return { black, white, empty };
}
function getBombExtraFlips(board, color, row, col, shielded) {
  const opponent = getOpponent(color);
  const bombed = [];
  for (const [dr, dc] of ORTHOGONAL_DIRECTIONS) {
    const r = row + dr;
    const c = col + dc;
    if (!isInBounds(r, c))
      continue;
    if (board[r][c] === opponent && !shielded[r][c]) {
      bombed.push({ row: r, col: c });
    }
  }
  return bombed;
}

// src/core/engine.ts
function createInitialSkillUses() {
  return {
    bomb: 0,
    shield: 0,
    steal: 0,
    double: 0,
    wait: 0,
    undo: 0
  };
}
function clonePlayerState(p) {
  return {
    color: p.color,
    energy: p.energy,
    equippedSkills: [...p.equippedSkills],
    skillUses: { ...p.skillUses }
  };
}
function createSnapshot(state) {
  return {
    stepIndex: state.stepIndex,
    board: cloneBoard(state.board),
    shielded: cloneShieldBoard(state.shielded),
    currentPlayer: state.currentPlayer,
    players: {
      [1 /* Black */]: clonePlayerState(state.players[1 /* Black */]),
      [2 /* White */]: clonePlayerState(state.players[2 /* White */])
    },
    consecutivePasses: state.consecutivePasses
  };
}
function cloneGameState(state) {
  return {
    mode: state.mode,
    stageId: state.stageId,
    board: cloneBoard(state.board),
    shielded: cloneShieldBoard(state.shielded),
    currentPlayer: state.currentPlayer,
    players: {
      [1 /* Black */]: clonePlayerState(state.players[1 /* Black */]),
      [2 /* White */]: clonePlayerState(state.players[2 /* White */])
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
        [1 /* Black */]: clonePlayerState(s.players[1 /* Black */]),
        [2 /* White */]: clonePlayerState(s.players[2 /* White */])
      },
      consecutivePasses: s.consecutivePasses
    })),
    moveHistory: state.moveHistory.map((m) => ({
      ...m,
      position: m.position ? { ...m.position } : void 0,
      secondPosition: m.secondPosition ? { ...m.secondPosition } : void 0,
      flippedPositions: m.flippedPositions.map((p) => ({ ...p }))
    })),
    lastEvents: [...state.lastEvents]
  };
}
function addPlayerEnergy(playerState, rawAmount) {
  const before = playerState.energy;
  playerState.energy = Math.min(ENERGY_CONFIG.maxEnergy, before + rawAmount);
  return playerState.energy - before;
}
function createGame(options = {}) {
  const mode = options.mode ?? "local2p";
  const blackInit = Math.min(
    ENERGY_CONFIG.maxEnergy,
    options.blackInitialEnergy ?? ENERGY_CONFIG.initialEnergy
  );
  const whiteInit = Math.min(
    ENERGY_CONFIG.maxEnergy,
    options.whiteInitialEnergy ?? ENERGY_CONFIG.initialEnergy
  );
  const state = {
    mode,
    stageId: options.stageId,
    board: createInitialBoard(),
    shielded: createEmptyShieldBoard(),
    currentPlayer: 1 /* Black */,
    players: {
      [1 /* Black */]: {
        color: 1 /* Black */,
        energy: blackInit,
        equippedSkills: options.blackSkills ? [...options.blackSkills] : ["bomb", "shield", "wait"],
        skillUses: createInitialSkillUses()
      },
      [2 /* White */]: {
        color: 2 /* White */,
        energy: whiteInit,
        equippedSkills: options.whiteSkills ? [...options.whiteSkills] : ["bomb", "shield", "wait"],
        skillUses: createInitialSkillUses()
      }
    },
    selectedSkill: null,
    pendingWaitRequest: null,
    consecutivePasses: 0,
    isGameOver: false,
    winner: null,
    stepIndex: 0,
    snapshots: [],
    moveHistory: [],
    lastEvents: []
  };
  const gained = addPlayerEnergy(state.players[1 /* Black */], ENERGY_CONFIG.turnStartGain);
  if (gained > 0) {
    state.lastEvents.push({
      type: "ENERGY_GAINED",
      player: 1 /* Black */,
      amount: gained,
      newEnergy: state.players[1 /* Black */].energy,
      reason: "TURN_START"
    });
  }
  state.snapshots.push(createSnapshot(state));
  return state;
}
function canUseSkill(state, player, skillId) {
  var _a;
  if (state.isGameOver) {
    return { usable: false, reason: "\u5BF9\u5C40\u5DF2\u7ED3\u675F" };
  }
  if (state.currentPlayer !== player) {
    return { usable: false, reason: "\u975E\u5F53\u524D\u73A9\u5BB6\u56DE\u5408" };
  }
  if (state.pendingWaitRequest) {
    return { usable: false, reason: "\u6B63\u5728\u7B49\u5F85\u5BF9\u65B9\u54CD\u5E94\u8BF7\u6C42" };
  }
  if (((_a = state.selectedSkill) == null ? void 0 : _a.doubleStep) === 2) {
    return { usable: false, reason: "\u6B63\u5728\u8FDB\u884C\u8FDE\u843D\u53CC\u5B50\u7B2C\u4E8C\u5B50" };
  }
  const pState = state.players[player];
  if (!pState.equippedSkills.includes(skillId)) {
    return { usable: false, reason: "\u672A\u643A\u5E26\u8BE5\u6280\u80FD" };
  }
  const cfg = SKILLS_CONFIG[skillId];
  if (!cfg.allowInOnline && state.mode === "online") {
    return { usable: false, reason: "\u8054\u673A\u6A21\u5F0F\u7981\u7528\u8BE5\u6280\u80FD" };
  }
  if (cfg.maxUsesPerGame !== null && pState.skillUses[skillId] >= cfg.maxUsesPerGame) {
    return { usable: false, reason: `\u6BCF\u5C40\u6700\u591A\u4F7F\u7528 ${cfg.maxUsesPerGame} \u6B21` };
  }
  if (pState.energy < cfg.cost) {
    return { usable: false, reason: `\u80FD\u91CF\u4E0D\u8DB3\uFF08\u9700 ${cfg.cost}\uFF09` };
  }
  const validMoves = getValidMoves(state.board, player, state.shielded);
  if (cfg.requiresValidMove && validMoves.length === 0) {
    return { usable: false, reason: "\u5F53\u524D\u65E0\u5408\u6CD5\u843D\u5B50\u70B9" };
  }
  if (skillId === "shield") {
    if (validMoves.length === 0) {
      return { usable: false, reason: "\u5F53\u524D\u65E0\u5408\u6CD5\u843D\u5B50\u70B9" };
    }
    const targets = getSkillTargets(state, player, "shield");
    if (targets.length === 0) {
      return { usable: false, reason: "\u573A\u4E0A\u65E0\u53EF\u7528\u7684\u5DF1\u65B9\u666E\u901A\u68CB\u5B50" };
    }
  }
  if (skillId === "steal") {
    const targets = getSkillTargets(state, player, "steal");
    if (targets.length === 0) {
      return { usable: false, reason: "\u573A\u4E0A\u65E0\u53EF\u8F6C\u6362\u7684\u654C\u65B9\u68CB\u5B50" };
    }
  }
  if (skillId === "undo") {
    const hasPrevSnapshot = state.snapshots.slice(0, -1).some((snap) => snap.currentPlayer === player);
    if (!hasPrevSnapshot) {
      return { usable: false, reason: "\u5C1A\u65E0\u4E0A\u4E00\u6B65\u53EF\u6094\u68CB" };
    }
  }
  return { usable: true };
}
function getSkillTargets(state, player, skillId) {
  const opponent = getOpponent(player);
  const targets = [];
  if (skillId === "bomb" || skillId === "double") {
    return getValidMoves(state.board, player, state.shielded).map((m) => ({
      row: m.row,
      col: m.col
    }));
  }
  if (skillId === "shield") {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (state.board[r][c] === player && !state.shielded[r][c]) {
          targets.push({ row: r, col: c });
        }
      }
    }
    return targets;
  }
  if (skillId === "steal") {
    const counts = countPieces(state.board);
    const oppCount = opponent === 1 /* Black */ ? counts.black : counts.white;
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
function selectSkill(state, skillId) {
  var _a;
  const next = cloneGameState(state);
  next.lastEvents = [];
  if (skillId === null) {
    if (((_a = next.selectedSkill) == null ? void 0 : _a.doubleStep) === 2) {
      return { state: next, ok: false, reason: "\u5DF2\u843D\u7B2C\u4E00\u5B50\uFF0C\u8BF7\u5B8C\u6210\u7B2C\u4E8C\u5B50\u843D\u5B50" };
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
    doubleStep: skillId === "double" ? 1 : void 0
  };
  return { state: next, ok: true };
}
function grantFlipEnergy(state, player, flippedCount, alreadyFlippedInTurn = 0) {
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
        type: "ENERGY_GAINED",
        player,
        amount: actualGained,
        newEnergy: state.players[player].energy,
        reason: "FLIPS"
      });
    }
  }
}
function advanceTurn(state) {
  const counts = countPieces(state.board);
  if (counts.empty === 0 || counts.black === 0 || counts.white === 0) {
    finishGame(
      state,
      counts.empty === 0 ? "BOARD_FULL" : "WIPEOUT"
    );
    return;
  }
  const nextPlayer = getOpponent(state.currentPlayer);
  state.currentPlayer = nextPlayer;
  state.selectedSkill = null;
  const nextMoves = getValidMoves(state.board, nextPlayer, state.shielded);
  if (nextMoves.length > 0) {
    state.consecutivePasses = 0;
    const gained2 = addPlayerEnergy(state.players[nextPlayer], ENERGY_CONFIG.turnStartGain);
    if (gained2 > 0) {
      state.lastEvents.push({
        type: "ENERGY_GAINED",
        player: nextPlayer,
        amount: gained2,
        newEnergy: state.players[nextPlayer].energy,
        reason: "TURN_START"
      });
    }
    state.stepIndex += 1;
    state.snapshots.push(createSnapshot(state));
    return;
  }
  const otherPlayer = getOpponent(nextPlayer);
  const otherMoves = getValidMoves(state.board, otherPlayer, state.shielded);
  if (otherMoves.length === 0) {
    state.consecutivePasses = 2;
    state.lastEvents.push({
      type: "TURN_PASSED",
      player: nextPlayer,
      reason: "NO_VALID_MOVE"
    });
    finishGame(state, "BOTH_NO_MOVES");
    return;
  }
  const gained = addPlayerEnergy(state.players[nextPlayer], ENERGY_CONFIG.turnStartGain);
  if (gained > 0) {
    state.lastEvents.push({
      type: "ENERGY_GAINED",
      player: nextPlayer,
      amount: gained,
      newEnergy: state.players[nextPlayer].energy,
      reason: "TURN_START"
    });
  }
  const canWait = canUseSkill(state, nextPlayer, "wait").usable;
  if (!canWait) {
    state.consecutivePasses += 1;
    state.lastEvents.push({
      type: "TURN_PASSED",
      player: nextPlayer,
      reason: "NO_VALID_MOVE"
    });
    state.moveHistory.push({
      stepIndex: state.stepIndex + 1,
      player: nextPlayer,
      actionType: "pass",
      flippedCount: 0,
      flippedPositions: [],
      blackCountAfter: counts.black,
      whiteCountAfter: counts.white,
      description: `${nextPlayer === 1 /* Black */ ? "\u9ED1\u65B9" : "\u767D\u65B9"}\u65E0\u5408\u6CD5\u843D\u5B50\uFF0C\u81EA\u52A8\u8DF3\u8FC7\u56DE\u5408`
    });
    state.currentPlayer = otherPlayer;
    state.consecutivePasses = 0;
    const otherGained = addPlayerEnergy(
      state.players[otherPlayer],
      ENERGY_CONFIG.turnStartGain
    );
    if (otherGained > 0) {
      state.lastEvents.push({
        type: "ENERGY_GAINED",
        player: otherPlayer,
        amount: otherGained,
        newEnergy: state.players[otherPlayer].energy,
        reason: "TURN_START"
      });
    }
  }
  state.stepIndex += 1;
  state.snapshots.push(createSnapshot(state));
}
function finishGame(state, reason, forcedWinner) {
  const counts = countPieces(state.board);
  state.isGameOver = true;
  state.selectedSkill = null;
  state.pendingWaitRequest = null;
  if (forcedWinner) {
    state.winner = forcedWinner;
  } else if (counts.black > counts.white) {
    state.winner = 1 /* Black */;
  } else if (counts.white > counts.black) {
    state.winner = 2 /* White */;
  } else {
    state.winner = "DRAW";
  }
  state.lastEvents.push({
    type: "GAME_OVER",
    winner: state.winner,
    blackCount: counts.black,
    whiteCount: counts.white,
    reason
  });
  state.stepIndex += 1;
  state.snapshots.push(createSnapshot(state));
}
function passTurn(state) {
  if (state.isGameOver) {
    return { state, ok: false, reason: "\u5BF9\u5C40\u5DF2\u7ED3\u675F" };
  }
  const player = state.currentPlayer;
  const moves = getValidMoves(state.board, player, state.shielded);
  if (moves.length > 0) {
    return { state, ok: false, reason: "\u5F53\u524D\u6709\u5408\u6CD5\u843D\u5B50\uFF0C\u4E0D\u80FD\u4E3B\u52A8\u8DF3\u8FC7" };
  }
  const next = cloneGameState(state);
  next.lastEvents = [];
  next.selectedSkill = null;
  next.consecutivePasses += 1;
  const counts = countPieces(next.board);
  next.lastEvents.push({
    type: "TURN_PASSED",
    player,
    reason: "NO_VALID_MOVE"
  });
  next.moveHistory.push({
    stepIndex: next.stepIndex + 1,
    player,
    actionType: "pass",
    flippedCount: 0,
    flippedPositions: [],
    blackCountAfter: counts.black,
    whiteCountAfter: counts.white,
    description: `${player === 1 /* Black */ ? "\u9ED1\u65B9" : "\u767D\u65B9"}\u65E0\u5B50\u53EF\u4E0B\uFF0C\u8DF3\u8FC7\u56DE\u5408`
  });
  if (next.consecutivePasses >= 2) {
    finishGame(next, "BOTH_NO_MOVES");
    return { state: next, ok: true };
  }
  advanceTurn(next);
  return { state: next, ok: true };
}
function applyBoardAction(state, row, col) {
  if (state.isGameOver) {
    return { state, ok: false, reason: "\u5BF9\u5C40\u5DF2\u7ED3\u675F" };
  }
  if (state.pendingWaitRequest) {
    return { state, ok: false, reason: "\u6B63\u5728\u7B49\u5F85\u5BF9\u65B9\u54CD\u5E94\u300C\u6C42\u4F60\u7B49\u6211\u300D" };
  }
  if (!isInBounds(row, col)) {
    return { state, ok: false, reason: "\u5750\u6807\u8D8A\u754C" };
  }
  const next = cloneGameState(state);
  next.lastEvents = [];
  const player = next.currentPlayer;
  const pState = next.players[player];
  const activeSkill = next.selectedSkill;
  if ((activeSkill == null ? void 0 : activeSkill.skillId) === "shield") {
    if (next.board[row][col] !== player || next.shielded[row][col]) {
      next.selectedSkill = null;
      return { state: next, ok: false, reason: "\u5DF2\u53D6\u6D88\u9009\u62E9\u91D1\u8EAB\u5B50\uFF08\u9700\u70B9\u51FB\u5DF1\u65B9\u666E\u901A\u68CB\u5B50\uFF09" };
    }
    const cfg = SKILLS_CONFIG.shield;
    pState.energy -= cfg.cost;
    pState.skillUses.shield += 1;
    next.shielded[row][col] = true;
    next.selectedSkill = null;
    next.lastEvents.push({
      type: "SHIELD_APPLIED",
      player,
      position: { row, col }
    });
    const remainingMoves = getValidMoves(next.board, player, next.shielded);
    if (remainingMoves.length === 0) {
      advanceTurn(next);
    }
    return { state: next, ok: true };
  }
  if ((activeSkill == null ? void 0 : activeSkill.skillId) === "steal") {
    const opponent = getOpponent(player);
    const countsBefore = countPieces(next.board);
    const oppCount = opponent === 1 /* Black */ ? countsBefore.black : countsBefore.white;
    if (next.board[row][col] !== opponent || next.shielded[row][col] || oppCount <= 1) {
      next.selectedSkill = null;
      return { state: next, ok: false, reason: "\u5DF2\u53D6\u6D88\u9009\u62E9\u5077\u5929\u6362\u65E5\uFF08\u9700\u70B9\u51FB\u5BF9\u65B9\u975E\u91D1\u8EAB\u68CB\u5B50\uFF09" };
    }
    const cfg = SKILLS_CONFIG.steal;
    pState.energy -= cfg.cost;
    pState.skillUses.steal += 1;
    next.board[row][col] = player;
    next.selectedSkill = null;
    next.consecutivePasses = 0;
    next.lastEvents.push({
      type: "PIECE_STOLEN",
      player,
      position: { row, col }
    });
    grantFlipEnergy(next, player, 1);
    const countsAfter2 = countPieces(next.board);
    next.moveHistory.push({
      stepIndex: next.stepIndex + 1,
      player,
      actionType: "skill",
      skillId: "steal",
      position: { row, col },
      flippedCount: 1,
      flippedPositions: [{ row, col }],
      blackCountAfter: countsAfter2.black,
      whiteCountAfter: countsAfter2.white,
      description: `${player === 1 /* Black */ ? "\u9ED1\u65B9" : "\u767D\u65B9"}\u53D1\u52A8\u3010\u5077\u5929\u6362\u65E5\u3011\u8F6C\u5316 (${row + 1},${col + 1})`
    });
    advanceTurn(next);
    return { state: next, ok: true };
  }
  const flips = getFlipsForCell(next.board, player, row, col, next.shielded);
  if (flips.length === 0) {
    if (activeSkill && activeSkill.doubleStep !== 2) {
      next.selectedSkill = null;
      return { state: next, ok: false, reason: "\u5DF2\u53D6\u6D88\u6280\u80FD\u9009\u62E9" };
    }
    return { state: next, ok: false, reason: "\u975E\u6CD5\u843D\u5B50\u4F4D\u7F6E" };
  }
  if ((activeSkill == null ? void 0 : activeSkill.skillId) === "double") {
    const cfg = SKILLS_CONFIG.double;
    if (activeSkill.doubleStep === 1) {
      pState.energy -= cfg.cost;
      pState.skillUses.double += 1;
      next.board[row][col] = player;
      for (const pos of flips) {
        next.board[pos.row][pos.col] = player;
      }
      next.consecutivePasses = 0;
      next.lastEvents.push({
        type: "MOVE_PLACED",
        player,
        position: { row, col },
        flipped: flips,
        skillUsed: "double"
      });
      next.lastEvents.push({
        type: "DOUBLE_STEP_1_DONE",
        player,
        position: { row, col },
        flipped: flips
      });
      grantFlipEnergy(next, player, flips.length, 0);
      const secondMoves = getValidMoves(next.board, player, next.shielded);
      if (secondMoves.length === 0) {
        const refund = Math.floor(cfg.cost * ENERGY_CONFIG.doubleSkillRefundRatio);
        const actualRefund = addPlayerEnergy(pState, refund);
        next.lastEvents.push({
          type: "DOUBLE_STEP_2_REFUNDED",
          player,
          refundEnergy: actualRefund
        });
        next.lastEvents.push({
          type: "ENERGY_GAINED",
          player,
          amount: actualRefund,
          newEnergy: pState.energy,
          reason: "REFUND"
        });
        const countsAfter2 = countPieces(next.board);
        next.moveHistory.push({
          stepIndex: next.stepIndex + 1,
          player,
          actionType: "skill",
          skillId: "double",
          position: { row, col },
          flippedCount: flips.length,
          flippedPositions: flips,
          blackCountAfter: countsAfter2.black,
          whiteCountAfter: countsAfter2.white,
          description: `${player === 1 /* Black */ ? "\u9ED1\u65B9" : "\u767D\u65B9"}\u3010\u8FDE\u843D\u53CC\u5B50\u3011\u9996\u5B50\u7FFB ${flips.length} \u5B50\uFF08\u6B21\u5B50\u65E0\u5408\u6CD5\u70B9\u9000\u8FD8 ${actualRefund} \u80FD\u91CF\uFF09`
        });
        next.selectedSkill = null;
        advanceTurn(next);
        return { state: next, ok: true };
      }
      next.selectedSkill = {
        skillId: "double",
        doubleStep: 2
      };
      const countsAfter1 = countPieces(next.board);
      next.moveHistory.push({
        stepIndex: next.stepIndex + 1,
        player,
        actionType: "skill",
        skillId: "double",
        position: { row, col },
        flippedCount: flips.length,
        flippedPositions: flips,
        blackCountAfter: countsAfter1.black,
        whiteCountAfter: countsAfter1.white,
        description: `${player === 1 /* Black */ ? "\u9ED1\u65B9" : "\u767D\u65B9"}\u3010\u8FDE\u843D\u53CC\u5B50\u3011\u7B2C 1 \u5B50\u7FFB ${flips.length} \u5B50`
      });
      return { state: next, ok: true };
    } else {
      const prevRecord = next.moveHistory[next.moveHistory.length - 1];
      const alreadyFlipped = (prevRecord == null ? void 0 : prevRecord.skillId) === "double" ? prevRecord.flippedCount : 0;
      next.board[row][col] = player;
      for (const pos of flips) {
        next.board[pos.row][pos.col] = player;
      }
      next.lastEvents.push({
        type: "MOVE_PLACED",
        player,
        position: { row, col },
        flipped: flips,
        skillUsed: "double"
      });
      grantFlipEnergy(next, player, flips.length, alreadyFlipped);
      const countsAfter2 = countPieces(next.board);
      if (prevRecord && prevRecord.skillId === "double" && prevRecord.player === player) {
        prevRecord.secondPosition = { row, col };
        prevRecord.flippedCount += flips.length;
        prevRecord.flippedPositions = [...prevRecord.flippedPositions, ...flips];
        prevRecord.blackCountAfter = countsAfter2.black;
        prevRecord.whiteCountAfter = countsAfter2.white;
        prevRecord.description = `${player === 1 /* Black */ ? "\u9ED1\u65B9" : "\u767D\u65B9"}\u53D1\u52A8\u3010\u8FDE\u843D\u53CC\u5B50\u3011\u4E24\u6B65\u5171\u7FFB ${prevRecord.flippedCount} \u5B50`;
      }
      next.selectedSkill = null;
      advanceTurn(next);
      return { state: next, ok: true };
    }
  }
  if ((activeSkill == null ? void 0 : activeSkill.skillId) === "bomb") {
    const cfg = SKILLS_CONFIG.bomb;
    pState.energy -= cfg.cost;
    pState.skillUses.bomb += 1;
    next.board[row][col] = player;
    for (const pos of flips) {
      next.board[pos.row][pos.col] = player;
    }
    const bombed = getBombExtraFlips(next.board, player, row, col, next.shielded);
    for (const bPos of bombed) {
      next.board[bPos.row][bPos.col] = player;
    }
    const totalFlipped = [...flips, ...bombed];
    next.selectedSkill = null;
    next.consecutivePasses = 0;
    next.lastEvents.push({
      type: "MOVE_PLACED",
      player,
      position: { row, col },
      flipped: flips,
      skillUsed: "bomb"
    });
    next.lastEvents.push({
      type: "BOMB_EXPLODED",
      player,
      center: { row, col },
      bombedPositions: bombed
    });
    grantFlipEnergy(next, player, totalFlipped.length);
    const countsAfter2 = countPieces(next.board);
    next.moveHistory.push({
      stepIndex: next.stepIndex + 1,
      player,
      actionType: "skill",
      skillId: "bomb",
      position: { row, col },
      flippedCount: totalFlipped.length,
      flippedPositions: totalFlipped,
      blackCountAfter: countsAfter2.black,
      whiteCountAfter: countsAfter2.white,
      description: `${player === 1 /* Black */ ? "\u9ED1\u65B9" : "\u767D\u65B9"}\u53D1\u52A8\u3010\u70B8\u5F39\u5B50\u3011\u5171\u7FFB ${totalFlipped.length} \u5B50\uFF08\u5341\u5B57\u7206\u7834 ${bombed.length} \u5B50\uFF09`
    });
    advanceTurn(next);
    return { state: next, ok: true };
  }
  next.board[row][col] = player;
  for (const pos of flips) {
    next.board[pos.row][pos.col] = player;
  }
  next.selectedSkill = null;
  next.consecutivePasses = 0;
  next.lastEvents.push({
    type: "MOVE_PLACED",
    player,
    position: { row, col },
    flipped: flips
  });
  grantFlipEnergy(next, player, flips.length);
  const countsAfter = countPieces(next.board);
  next.moveHistory.push({
    stepIndex: next.stepIndex + 1,
    player,
    actionType: "move",
    position: { row, col },
    flippedCount: flips.length,
    flippedPositions: flips,
    blackCountAfter: countsAfter.black,
    whiteCountAfter: countsAfter.white,
    description: `${player === 1 /* Black */ ? "\u9ED1\u65B9" : "\u767D\u65B9"}\u843D\u5B50 (${row + 1},${col + 1}) \u7FFB ${flips.length} \u5B50`
  });
  advanceTurn(next);
  return { state: next, ok: true };
}
function useWaitSkill(state) {
  const player = state.currentPlayer;
  const check = canUseSkill(state, player, "wait");
  if (!check.usable) {
    return { state, ok: false, reason: check.reason };
  }
  const next = cloneGameState(state);
  next.lastEvents = [];
  next.selectedSkill = null;
  if (next.mode === "online") {
    next.pendingWaitRequest = { requester: player };
    next.lastEvents.push({
      type: "WAIT_REQUESTED",
      player
    });
    return { state: next, ok: true };
  }
  return respondToWaitSkill(
    {
      ...next,
      pendingWaitRequest: { requester: player }
    },
    true
  );
}
function respondToWaitSkill(state, approved) {
  if (!state.pendingWaitRequest) {
    return { state, ok: false, reason: "\u5F53\u524D\u6CA1\u6709\u5F85\u5904\u7406\u7684\u6C42\u4F60\u7B49\u6211\u8BF7\u6C42" };
  }
  const next = cloneGameState(state);
  next.lastEvents = [];
  const player = next.pendingWaitRequest.requester;
  next.pendingWaitRequest = null;
  next.selectedSkill = null;
  if (!approved) {
    next.lastEvents.push({
      type: "WAIT_RESOLVED",
      player,
      approved: false,
      energyDelta: 0
    });
    return { state: next, ok: true };
  }
  const pState = next.players[player];
  const cfg = SKILLS_CONFIG.wait;
  pState.energy -= cfg.cost;
  pState.skillUses.wait += 1;
  const gained = addPlayerEnergy(pState, ENERGY_CONFIG.waitSkillGain);
  next.lastEvents.push({
    type: "WAIT_RESOLVED",
    player,
    approved: true,
    energyDelta: gained - cfg.cost
  });
  next.lastEvents.push({
    type: "ENERGY_GAINED",
    player,
    amount: gained,
    newEnergy: pState.energy,
    reason: "WAIT_SKILL"
  });
  next.lastEvents.push({
    type: "TURN_PASSED",
    player,
    reason: "WAIT_SKILL"
  });
  const counts = countPieces(next.board);
  next.moveHistory.push({
    stepIndex: next.stepIndex + 1,
    player,
    actionType: "skill",
    skillId: "wait",
    flippedCount: 0,
    flippedPositions: [],
    blackCountAfter: counts.black,
    whiteCountAfter: counts.white,
    description: `${player === 1 /* Black */ ? "\u9ED1\u65B9" : "\u767D\u65B9"}\u53D1\u52A8\u3010\u6C42\u4F60\u7B49\u6211\u3011\u8DF3\u8FC7\u56DE\u5408\u83B7\u5F97 +${gained} \u80FD\u91CF`
  });
  advanceTurn(next);
  return { state: next, ok: true };
}
function surrenderGame(state, surrenderingPlayer) {
  if (state.isGameOver)
    return state;
  const next = cloneGameState(state);
  next.lastEvents = [];
  const winner = getOpponent(surrenderingPlayer);
  finishGame(next, "SURRENDER", winner);
  return next;
}

// src/net/protocol.ts
var ROOM_EXPIRE_MS = 30 * 60 * 1e3;
var HEARTBEAT_TIMEOUT_MS = 90 * 1e3;
var InMemoryCloudDatabase = class {
  constructor() {
    this.rooms = /* @__PURE__ */ new Map();
    this.users = /* @__PURE__ */ new Map();
    this.listeners = /* @__PURE__ */ new Map();
  }
  async getRoom(roomId) {
    const r = this.rooms.get(roomId);
    if (!r)
      return null;
    return JSON.parse(JSON.stringify(r));
  }
  async saveRoom(room) {
    const cloned = JSON.parse(JSON.stringify(room));
    this.rooms.set(room.roomId, cloned);
    const subs = this.listeners.get(room.roomId);
    if (subs) {
      for (const cb of subs) {
        cb(JSON.parse(JSON.stringify(cloned)));
      }
    }
  }
  async getUser(openId) {
    const u = this.users.get(openId);
    return u ? JSON.parse(JSON.stringify(u)) : null;
  }
  async saveUser(openId, progress) {
    this.users.set(openId, JSON.parse(JSON.stringify(progress)));
  }
  watchRoom(roomId, callback) {
    if (!this.listeners.has(roomId)) {
      this.listeners.set(roomId, /* @__PURE__ */ new Set());
    }
    this.listeners.get(roomId).add(callback);
    return () => {
      var _a;
      (_a = this.listeners.get(roomId)) == null ? void 0 : _a.delete(callback);
    };
  }
};
var ReversiCloudService = class {
  constructor(db) {
    this.db = db;
  }
  generate6DigitRoomId() {
    return String(Math.floor(1e5 + Math.random() * 9e5));
  }
  getPlayerColor(room, openId) {
    if (room.hostOpenId === openId)
      return 1 /* Black */;
    if (room.guestOpenId === openId)
      return 2 /* White */;
    return null;
  }
  /**
   * 1. 创建房间（6 位房间号防重复）
   */
  async createRoom(params) {
    const now = params.now ?? Date.now();
    let roomId = this.generate6DigitRoomId();
    for (let retry = 0; retry < 10; retry++) {
      const existing = await this.db.getRoom(roomId);
      if (!existing || now - existing.updatedAt > ROOM_EXPIRE_MS) {
        break;
      }
      roomId = this.generate6DigitRoomId();
    }
    const room = {
      roomId,
      status: "waiting",
      hostOpenId: params.openId,
      guestOpenId: null,
      hostInfo: {
        openId: params.openId,
        nickname: params.nickname,
        equippedSkills: params.equippedSkills.slice(0, 3),
        ready: true,
        lastHeartbeatAt: now
      },
      guestInfo: null,
      gameState: null,
      createdAt: now,
      updatedAt: now
    };
    await this.db.saveRoom(room);
    return { ok: true, data: room };
  }
  /**
   * 2. 加入房间（防满房、防过期房、支持断线重连恢复）
   */
  async joinRoom(params) {
    const now = params.now ?? Date.now();
    const room = await this.db.getRoom(params.roomId);
    if (!room) {
      return { ok: false, error: "\u623F\u95F4\u4E0D\u5B58\u5728\uFF0C\u8BF7\u68C0\u67E5 6 \u4F4D\u623F\u95F4\u53F7" };
    }
    if (now - room.updatedAt > ROOM_EXPIRE_MS) {
      room.status = "expired";
      await this.db.saveRoom(room);
      return { ok: false, error: "\u8BE5\u623F\u95F4\u5DF2\u8D85\u8FC7 30 \u5206\u949F\u81EA\u52A8\u5931\u6548" };
    }
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
    if (room.guestOpenId && room.guestOpenId !== params.openId) {
      return { ok: false, error: "\u623F\u95F4\u4EBA\u6570\u5DF2\u6EE1" };
    }
    room.guestOpenId = params.openId;
    room.guestInfo = {
      openId: params.openId,
      nickname: params.nickname,
      equippedSkills: params.equippedSkills.slice(0, 3),
      ready: true,
      lastHeartbeatAt: now
    };
    room.status = "playing";
    room.gameState = createGame({
      mode: "online",
      blackSkills: room.hostInfo.equippedSkills,
      whiteSkills: room.guestInfo.equippedSkills
    });
    room.updatedAt = now;
    await this.db.saveRoom(room);
    return { ok: true, data: room };
  }
  /**
   * 3. 提交一步操作（服务端用同一套 core 逻辑复验合法性，不合法直接拒绝）
   */
  async submitMove(payload) {
    var _a;
    const now = payload.now ?? Date.now();
    const room = await this.db.getRoom(payload.roomId);
    if (!room || !room.gameState) {
      return { ok: false, error: "\u623F\u95F4\u4E0D\u5B58\u5728\u6216\u5BF9\u5C40\u5C1A\u672A\u5F00\u59CB" };
    }
    if (room.status !== "playing") {
      return { ok: false, error: "\u5BF9\u5C40\u5DF2\u7ED3\u675F\u6216\u672A\u5904\u4E8E\u8FDB\u884C\u4E2D" };
    }
    const playerColor = this.getPlayerColor(room, payload.openId);
    if (!playerColor) {
      return { ok: false, error: "\u975E\u672C\u623F\u95F4\u5BF9\u5C40\u73A9\u5BB6" };
    }
    if (playerColor === 1 /* Black */) {
      room.hostInfo.lastHeartbeatAt = now;
    } else if (room.guestInfo) {
      room.guestInfo.lastHeartbeatAt = now;
    }
    if (payload.actionType === "surrender") {
      room.gameState = surrenderGame(room.gameState, playerColor);
      room.status = "finished";
      room.updatedAt = now;
      await this.db.saveRoom(room);
      return { ok: true, data: room };
    }
    if (room.gameState.currentPlayer !== playerColor) {
      return { ok: false, error: "\u975E\u6CD5\u64CD\u4F5C\uFF1A\u5F53\u524D\u4E0D\u662F\u4F60\u7684\u56DE\u5408" };
    }
    let state = cloneGameState(room.gameState);
    if (payload.actionType === "pass") {
      const passRes = passTurn(state);
      if (!passRes.ok) {
        return { ok: false, error: `\u670D\u52A1\u7AEF\u6821\u9A8C\u62D2\u7EDD\uFF1A${passRes.reason}` };
      }
      state = passRes.state;
    } else if (payload.actionType === "skill") {
      if (!payload.skillId) {
        return { ok: false, error: "\u670D\u52A1\u7AEF\u6821\u9A8C\u62D2\u7EDD\uFF1A\u7F3A\u5C11 skillId" };
      }
      if (payload.skillId === "undo") {
        return { ok: false, error: "\u670D\u52A1\u7AEF\u6821\u9A8C\u62D2\u7EDD\uFF1A\u8054\u673A\u6A21\u5F0F\u7981\u7528\u6094\u68CB\u65F6\u5149" };
      }
      if (payload.skillId === "wait") {
        const waitRes = useWaitSkill(state);
        if (!waitRes.ok) {
          return { ok: false, error: `\u670D\u52A1\u7AEF\u6821\u9A8C\u62D2\u7EDD\uFF1A${waitRes.reason}` };
        }
        state = waitRes.state;
      } else {
        if (!(((_a = state.selectedSkill) == null ? void 0 : _a.skillId) === "double" && state.selectedSkill.doubleStep === 2)) {
          const selRes = selectSkill(state, payload.skillId);
          if (!selRes.ok) {
            return { ok: false, error: `\u670D\u52A1\u7AEF\u6821\u9A8C\u62D2\u7EDD\uFF1A${selRes.reason}` };
          }
          state = selRes.state;
        }
        if (typeof payload.row !== "number" || typeof payload.col !== "number") {
          return { ok: false, error: "\u670D\u52A1\u7AEF\u6821\u9A8C\u62D2\u7EDD\uFF1A\u7F3A\u5C11\u843D\u5B50\u5750\u6807" };
        }
        const actRes = applyBoardAction(state, payload.row, payload.col);
        if (!actRes.ok) {
          return { ok: false, error: `\u670D\u52A1\u7AEF\u6821\u9A8C\u62D2\u7EDD\uFF1A${actRes.reason}` };
        }
        state = actRes.state;
      }
    } else if (payload.actionType === "move") {
      if (typeof payload.row !== "number" || typeof payload.col !== "number") {
        return { ok: false, error: "\u670D\u52A1\u7AEF\u6821\u9A8C\u62D2\u7EDD\uFF1A\u7F3A\u5C11\u843D\u5B50\u5750\u6807" };
      }
      const moveRes = applyBoardAction(state, payload.row, payload.col);
      if (!moveRes.ok) {
        return { ok: false, error: `\u670D\u52A1\u7AEF\u6821\u9A8C\u62D2\u7EDD\uFF1A${moveRes.reason}` };
      }
      state = moveRes.state;
    } else {
      return { ok: false, error: "\u672A\u77E5\u64CD\u4F5C\u7C7B\u578B" };
    }
    if (payload.claimedBoardAfter) {
      const expectedJson = JSON.stringify(state.board);
      const claimedJson = JSON.stringify(payload.claimedBoardAfter);
      if (expectedJson !== claimedJson) {
        return {
          ok: false,
          error: "\u670D\u52A1\u7AEF\u9632\u4F5C\u5F0A\u62E6\u622A\uFF1A\u5BA2\u6237\u7AEF\u68CB\u76D8\u72B6\u6001\u4E0E\u670D\u52A1\u7AEF\u5F15\u64CE\u8BA1\u7B97\u7ED3\u679C\u4E0D\u4E00\u81F4"
        };
      }
    }
    room.gameState = state;
    if (state.isGameOver) {
      room.status = "finished";
    }
    room.updatedAt = now;
    await this.db.saveRoom(room);
    return { ok: true, data: room };
  }
  /**
   * 4. 「求你等我」请求与响应流转（requestSkill / respondSkill）
   */
  async requestSkill(params) {
    return this.submitMove({
      roomId: params.roomId,
      openId: params.openId,
      actionType: "skill",
      skillId: params.skillId,
      now: params.now
    });
  }
  async respondSkill(params) {
    const now = params.now ?? Date.now();
    const room = await this.db.getRoom(params.roomId);
    if (!room || !room.gameState) {
      return { ok: false, error: "\u623F\u95F4\u4E0D\u5B58\u5728" };
    }
    const responderColor = this.getPlayerColor(room, params.openId);
    if (!responderColor) {
      return { ok: false, error: "\u975E\u672C\u623F\u95F4\u73A9\u5BB6" };
    }
    const pending = room.gameState.pendingWaitRequest;
    if (!pending) {
      return { ok: false, error: "\u5F53\u524D\u6CA1\u6709\u5F85\u5904\u7406\u7684\u6280\u80FD\u8BF7\u6C42" };
    }
    if (pending.requester === responderColor) {
      return { ok: false, error: "\u4E0D\u80FD\u81EA\u5DF1\u540C\u610F\u81EA\u5DF1\u7684\u300C\u6C42\u4F60\u7B49\u6211\u300D\u8BF7\u6C42" };
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
  async syncState(params) {
    const now = params.now ?? Date.now();
    const room = await this.db.getRoom(params.roomId);
    if (!room) {
      return { ok: false, error: "\u623F\u95F4\u4E0D\u5B58\u5728" };
    }
    const playerColor = this.getPlayerColor(room, params.openId);
    if (playerColor === 1 /* Black */) {
      room.hostInfo.lastHeartbeatAt = now;
    } else if (playerColor === 2 /* White */ && room.guestInfo) {
      room.guestInfo.lastHeartbeatAt = now;
    }
    let opponentIdleMs = 0;
    if (playerColor === 1 /* Black */ && room.guestInfo) {
      opponentIdleMs = now - room.guestInfo.lastHeartbeatAt;
    } else if (playerColor === 2 /* White */) {
      opponentIdleMs = now - room.hostInfo.lastHeartbeatAt;
    }
    const opponentDisconnected = room.status === "playing" && opponentIdleMs >= HEARTBEAT_TIMEOUT_MS;
    if (opponentDisconnected && params.claimDisconnectWin && room.gameState && playerColor) {
      const opponentColor = playerColor === 1 /* Black */ ? 2 /* White */ : 1 /* Black */;
      room.gameState = surrenderGame(room.gameState, opponentColor);
      room.status = "finished";
      room.updatedAt = now;
    }
    await this.db.saveRoom(room);
    return {
      ok: true,
      data: {
        room,
        opponentDisconnected,
        opponentIdleMs
      }
    };
  }
};

// src/net/client.ts
var sharedLocalDb = new InMemoryCloudDatabase();
var sharedLocalCloud = new ReversiCloudService(sharedLocalDb);

// cloudfunctions/reversiRoom/index.ts
function createCloudDbAdapter() {
  try {
    const cloud = require("wx-server-sdk");
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    const db = cloud.database();
    const roomsCol = db.collection("rooms");
    const usersCol = db.collection("users");
    return {
      async getRoom(roomId) {
        const res = await roomsCol.where({ roomId }).limit(1).get();
        return res.data && res.data[0] || null;
      },
      async saveRoom(room) {
        const existing = await roomsCol.where({ roomId: room.roomId }).limit(1).get();
        if (existing.data && existing.data.length > 0) {
          const docId = existing.data[0]._id;
          const copy = { ...room };
          delete copy._id;
          await roomsCol.doc(docId).update({ data: copy });
        } else {
          await roomsCol.add({ data: room });
        }
      },
      async getUser(openId) {
        var _a;
        const res = await usersCol.where({ openId }).limit(1).get();
        return res.data && ((_a = res.data[0]) == null ? void 0 : _a.progress) || null;
      },
      async saveUser(openId, progress) {
        const existing = await usersCol.where({ openId }).limit(1).get();
        if (existing.data && existing.data.length > 0) {
          await usersCol.doc(existing.data[0]._id).update({
            data: { progress, updatedAt: Date.now() }
          });
        } else {
          await usersCol.add({
            data: { openId, progress, updatedAt: Date.now() }
          });
        }
      }
    };
  } catch {
    return new InMemoryCloudDatabase();
  }
}
var adapter = createCloudDbAdapter();
var service = new ReversiCloudService(adapter);
async function main(event, context) {
  const openId = event.openId ?? "wx_anonymous_openid";
  switch (event.action) {
    case "createRoom":
      return service.createRoom({
        openId,
        nickname: event.nickname ?? "\u5FAE\u4FE1\u73A9\u5BB6",
        equippedSkills: event.equippedSkills ?? ["bomb", "shield", "wait"]
      });
    case "joinRoom":
      return service.joinRoom({
        roomId: event.roomId ?? "",
        openId,
        nickname: event.nickname ?? "\u597D\u53CB\u73A9\u5BB6",
        equippedSkills: event.equippedSkills ?? ["bomb", "shield", "wait"]
      });
    case "submitMove":
      return service.submitMove({
        roomId: event.roomId ?? "",
        openId,
        actionType: event.actionType ?? "move",
        skillId: event.skillId,
        row: event.row,
        col: event.col,
        claimedBoardAfter: event.claimedBoardAfter
      });
    case "requestSkill":
      return service.requestSkill({
        roomId: event.roomId ?? "",
        openId,
        skillId: event.skillId ?? "wait"
      });
    case "respondSkill":
      return service.respondSkill({
        roomId: event.roomId ?? "",
        openId,
        approved: Boolean(event.approved)
      });
    case "syncState":
      return service.syncState({
        roomId: event.roomId ?? "",
        openId,
        claimDisconnectWin: event.claimDisconnectWin
      });
    default:
      return { ok: false, error: `\u672A\u77E5\u4E91\u51FD\u6570 action: ${String(event.action)}` };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  main
});
