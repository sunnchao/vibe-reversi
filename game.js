"use strict";
(() => {
  // src/ui/coord.ts
  function computeBoardRect(screenWidth, screenHeight) {
    const padding = Math.max(16, Math.floor(screenWidth * 0.05));
    const maxBoardSize = Math.min(screenWidth - padding * 2, screenHeight * 0.56);
    const cellSize = Math.floor(maxBoardSize / 8);
    const size = cellSize * 8;
    const x = Math.floor((screenWidth - size) / 2);
    const y = Math.floor((screenHeight - size) / 2) - Math.floor(screenHeight * 0.02);
    return { x, y, size, cellSize };
  }
  function pixelToBoardCoord(px, py, rect) {
    if (px < rect.x || px >= rect.x + rect.size || py < rect.y || py >= rect.y + rect.size) {
      return null;
    }
    const col = Math.floor((px - rect.x) / rect.cellSize);
    const row = Math.floor((py - rect.y) / rect.cellSize);
    if (row < 0 || row >= 8 || col < 0 || col >= 8) {
      return null;
    }
    return { row, col };
  }
  function boardCoordToPixelCenter(row, col, rect) {
    return {
      cx: rect.x + col * rect.cellSize + rect.cellSize / 2,
      cy: rect.y + row * rect.cellSize + rect.cellSize / 2
    };
  }

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
  var ALL_SKILL_IDS = ["bomb", "shield", "steal", "double", "wait", "undo"];
  var MAX_EQUIPPED_SKILLS = 3;

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
    if (state.isGameOver) {
      return { usable: false, reason: "\u5BF9\u5C40\u5DF2\u7ED3\u675F" };
    }
    if (state.currentPlayer !== player) {
      return { usable: false, reason: "\u975E\u5F53\u524D\u73A9\u5BB6\u56DE\u5408" };
    }
    if (state.pendingWaitRequest) {
      return { usable: false, reason: "\u6B63\u5728\u7B49\u5F85\u5BF9\u65B9\u54CD\u5E94\u8BF7\u6C42" };
    }
    if (state.selectedSkill?.doubleStep === 2) {
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
    const next = cloneGameState(state);
    next.lastEvents = [];
    if (skillId === null) {
      if (next.selectedSkill?.doubleStep === 2) {
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
    if (activeSkill?.skillId === "shield") {
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
    if (activeSkill?.skillId === "steal") {
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
    if (activeSkill?.skillId === "double") {
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
        const alreadyFlipped = prevRecord?.skillId === "double" ? prevRecord.flippedCount : 0;
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
    if (activeSkill?.skillId === "bomb") {
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
  function useUndoSkill(state) {
    const player = state.currentPlayer;
    const check = canUseSkill(state, player, "undo");
    if (!check.usable) {
      return { state, ok: false, reason: check.reason };
    }
    let targetSnapIdx = -1;
    for (let i = state.snapshots.length - 2; i >= 0; i--) {
      if (state.snapshots[i].currentPlayer === player) {
        targetSnapIdx = i;
        break;
      }
    }
    if (targetSnapIdx === -1) {
      return { state, ok: false, reason: "\u672A\u627E\u5230\u53EF\u56DE\u9000\u7684\u4E0A\u56DE\u5408\u5FEB\u7167" };
    }
    const snap = state.snapshots[targetSnapIdx];
    const next = cloneGameState(state);
    next.lastEvents = [];
    next.board = cloneBoard(snap.board);
    next.shielded = cloneShieldBoard(snap.shielded);
    next.currentPlayer = snap.currentPlayer;
    next.consecutivePasses = snap.consecutivePasses;
    next.players = {
      [1 /* Black */]: clonePlayerState(snap.players[1 /* Black */]),
      [2 /* White */]: clonePlayerState(snap.players[2 /* White */])
    };
    const cfg = SKILLS_CONFIG.undo;
    next.players[player].energy = Math.max(0, state.players[player].energy - cfg.cost);
    next.players[player].skillUses.undo = state.players[player].skillUses.undo + 1;
    next.selectedSkill = null;
    next.pendingWaitRequest = null;
    next.isGameOver = false;
    next.winner = null;
    next.stepIndex = snap.stepIndex;
    next.snapshots = next.snapshots.slice(0, targetSnapIdx + 1);
    next.snapshots[next.snapshots.length - 1] = createSnapshot(next);
    next.moveHistory = next.moveHistory.slice(0, targetSnapIdx);
    next.lastEvents.push({
      type: "UNDO_PERFORMED",
      player,
      restoredStepIndex: snap.stepIndex
    });
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
  function getBiggestComebackMove(state) {
    if (state.moveHistory.length === 0)
      return null;
    let best = null;
    for (const record of state.moveHistory) {
      if (record.flippedCount > 0) {
        if (!best || record.flippedCount > best.flippedCount) {
          best = record;
        }
      }
    }
    return best;
  }

  // src/ui/animations.ts
  var AnimationManager = class {
    constructor() {
      this.flipItems = [];
      this.bombExplosions = [];
      this.scoreRoll = null;
      this.toastMessage = null;
    }
    /**
     * 消费 core 引擎产生的结构化事件列表并创建对应动画
     */
    consumeEvents(events, nowMs = Date.now()) {
      for (const ev of events) {
        if (ev.type === "MOVE_PLACED") {
          const fromColor = ev.player === 1 /* Black */ ? 2 /* White */ : 1 /* Black */;
          ev.flipped.forEach((pos, idx) => {
            this.flipItems.push({
              row: pos.row,
              col: pos.col,
              fromColor,
              toColor: ev.player,
              startTimeMs: nowMs + idx * 45,
              durationMs: 280
            });
          });
        } else if (ev.type === "BOMB_EXPLODED") {
          const fromColor = ev.player === 1 /* Black */ ? 2 /* White */ : 1 /* Black */;
          this.bombExplosions.push({
            center: ev.center,
            bombedPositions: ev.bombedPositions,
            startTimeMs: nowMs,
            durationMs: 520
          });
          ev.bombedPositions.forEach((pos, idx) => {
            this.flipItems.push({
              row: pos.row,
              col: pos.col,
              fromColor,
              toColor: ev.player,
              startTimeMs: nowMs + 120 + idx * 40,
              durationMs: 300
            });
          });
          this.showToast(
            `\u{1F4A5} \u70B8\u5F39\u5B50\u5341\u5B57\u7206\u7834 +${ev.bombedPositions.length} \u5B50\uFF01`,
            nowMs,
            1800
          );
        } else if (ev.type === "PIECE_STOLEN") {
          const fromColor = ev.player === 1 /* Black */ ? 2 /* White */ : 1 /* Black */;
          this.flipItems.push({
            row: ev.position.row,
            col: ev.position.col,
            fromColor,
            toColor: ev.player,
            startTimeMs: nowMs,
            durationMs: 360
          });
          this.showToast("\u262F\uFE0F \u5077\u5929\u6362\u65E5\uFF01\u654C\u5B50\u76F4\u63A5\u6613\u5E1C", nowMs, 1800);
        } else if (ev.type === "SHIELD_APPLIED") {
          this.showToast("\u{1F6E1}\uFE0F \u91D1\u8EAB\u62A4\u4F53\uFF01\u6B64\u5B50\u6C38\u4E0D\u53EF\u88AB\u7FFB", nowMs, 1600);
        } else if (ev.type === "DOUBLE_STEP_1_DONE") {
          this.showToast("\u26A1 \u8FDE\u843D\u53CC\u5B50\uFF1A\u8BF7\u7EE7\u7EED\u843D\u7B2C 2 \u5B50\uFF01", nowMs, 2e3);
        } else if (ev.type === "DOUBLE_STEP_2_REFUNDED") {
          this.showToast(
            `\u26A1 \u6B21\u5B50\u65E0\u5408\u6CD5\u70B9\uFF0C\u81EA\u52A8\u9000\u8FD8 +${ev.refundEnergy} \u80FD\u91CF`,
            nowMs,
            2200
          );
        } else if (ev.type === "TURN_PASSED") {
          const who = ev.player === 1 /* Black */ ? "\u9ED1\u65B9" : "\u767D\u65B9";
          if (ev.reason === "NO_VALID_MOVE") {
            this.showToast(`\u26A0\uFE0F ${who}\u65E0\u5408\u6CD5\u843D\u5B50\uFF0C\u81EA\u52A8\u8DF3\u8FC7\u56DE\u5408`, nowMs, 1800);
          } else {
            this.showToast(`\u23F3 ${who}\u53D1\u52A8\u3010\u6C42\u4F60\u7B49\u6211\u3011\u6362\u53D6 +20 \u80FD\u91CF`, nowMs, 1800);
          }
        } else if (ev.type === "UNDO_PERFORMED") {
          this.showToast("\u23EA \u6094\u68CB\u65F6\u5149\uFF1A\u5DF2\u56DE\u6EAF\u81F3\u4E0A\u4E00\u56DE\u5408", nowMs, 1800);
        } else if (ev.type === "GAME_OVER") {
          this.startScoreRoll(ev.blackCount, ev.whiteCount, nowMs);
        }
      }
    }
    showToast(text, nowMs = Date.now(), durationMs = 1800) {
      this.toastMessage = {
        text,
        expireAt: nowMs + durationMs
      };
    }
    startScoreRoll(targetBlack, targetWhite, nowMs = Date.now()) {
      this.scoreRoll = {
        targetBlack,
        targetWhite,
        startTimeMs: nowMs,
        durationMs: 900
      };
    }
    /**
     * 获取某格棋子当前帧的翻转动画状态（返回横向缩放比例 scaleX 与当前应显示的颜色）
     */
    getPieceFlipState(row, col, actualColor, nowMs = Date.now()) {
      for (let i = this.flipItems.length - 1; i >= 0; i--) {
        const item = this.flipItems[i];
        if (item.row === row && item.col === col) {
          if (nowMs < item.startTimeMs) {
            return {
              scaleX: 1,
              displayColor: item.fromColor,
              isAnimating: true
            };
          }
          const elapsed = nowMs - item.startTimeMs;
          if (elapsed <= item.durationMs) {
            const progress = elapsed / item.durationMs;
            const scaleX = Math.max(0.08, Math.abs(Math.cos(progress * Math.PI)));
            const displayColor = progress < 0.5 ? item.fromColor : item.toColor;
            return { scaleX, displayColor, isAnimating: true };
          }
        }
      }
      return { scaleX: 1, displayColor: actualColor, isAnimating: false };
    }
    /**
     * 获取终局子数滚动结算的当前显示数字
     */
    getRolledScores(actualBlack, actualWhite, nowMs = Date.now()) {
      if (!this.scoreRoll) {
        return { black: actualBlack, white: actualWhite, progress: 1 };
      }
      const elapsed = Math.max(0, nowMs - this.scoreRoll.startTimeMs);
      const progress = Math.min(1, elapsed / this.scoreRoll.durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      return {
        black: Math.round(this.scoreRoll.targetBlack * eased),
        white: Math.round(this.scoreRoll.targetWhite * eased),
        progress
      };
    }
    /**
     * 清理已结束的动画队列
     */
    cleanup(nowMs = Date.now()) {
      this.flipItems = this.flipItems.filter(
        (item) => nowMs <= item.startTimeMs + item.durationMs
      );
      this.bombExplosions = this.bombExplosions.filter(
        (b) => nowMs <= b.startTimeMs + b.durationMs
      );
      if (this.toastMessage && nowMs > this.toastMessage.expireAt) {
        this.toastMessage = null;
      }
    }
  };

  // src/config/weights.ts
  var POSITION_WEIGHTS = [
    [120, -25, 20, 5, 5, 20, -25, 120],
    [-25, -45, -5, -5, -5, -5, -45, -25],
    [20, -5, 15, 3, 3, 15, -5, 20],
    [5, -5, 3, 3, 3, 3, -5, 5],
    [5, -5, 3, 3, 3, 3, -5, 5],
    [20, -5, 15, 3, 3, 15, -5, 20],
    [-25, -45, -5, -5, -5, -5, -45, -25],
    [120, -25, 20, 5, 5, 20, -25, 120]
  ];
  var AI_EVAL_WEIGHTS = {
    positionMultiplier: 1.2,
    mobilityMultiplier: 12,
    pieceDiffEarly: 1.5,
    pieceDiffLate: 25,
    shieldCornerBonus: 90,
    shieldEdgeBonus: 35,
    energyValueMultiplier: 1.5
  };

  // src/ai/ai.ts
  function isCorner(row, col) {
    return (row === 0 || row === 7) && (col === 0 || col === 7);
  }
  function isEdge(row, col) {
    return row === 0 || row === 7 || col === 0 || col === 7;
  }
  function evaluateBoard(board, shielded, player) {
    const opponent = getOpponent(player);
    const counts = countPieces(board);
    const myCount = player === 1 /* Black */ ? counts.black : counts.white;
    const oppCount = opponent === 1 /* Black */ ? counts.black : counts.white;
    if (myCount === 0)
      return -1e5;
    if (oppCount === 0)
      return 1e5;
    if (counts.empty === 0) {
      return (myCount - oppCount) * 1e3;
    }
    let posScore = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p === 0 /* Empty */)
          continue;
        let w = POSITION_WEIGHTS[r][c];
        if (shielded[r][c]) {
          if (isCorner(r, c))
            w += AI_EVAL_WEIGHTS.shieldCornerBonus;
          else if (isEdge(r, c))
            w += AI_EVAL_WEIGHTS.shieldEdgeBonus;
          else
            w += 15;
        }
        if (p === player)
          posScore += w;
        else
          posScore -= w;
      }
    }
    const myMoves = getValidMoves(board, player, shielded);
    const oppMoves = getValidMoves(board, opponent, shielded);
    if (myMoves.length === 0 && oppMoves.length === 0) {
      return (myCount - oppCount) * 1e3;
    }
    const mobilityScore = (myMoves.length - oppMoves.length) * AI_EVAL_WEIGHTS.mobilityMultiplier;
    const isLateGame = counts.empty <= 14;
    const pieceWeight = isLateGame ? AI_EVAL_WEIGHTS.pieceDiffLate : AI_EVAL_WEIGHTS.pieceDiffEarly;
    const pieceDiffScore = (myCount - oppCount) * pieceWeight;
    return posScore * AI_EVAL_WEIGHTS.positionMultiplier + mobilityScore + pieceDiffScore;
  }
  function fastApplyMove(board, color, move) {
    const next = cloneBoard(board);
    next[move.row][move.col] = color;
    for (const pos of move.flips) {
      next[pos.row][pos.col] = color;
    }
    return next;
  }
  function negamax(board, shielded, color, depth, alpha, beta, passedLastTurn, deadlineMs) {
    if (depth <= 0 || Date.now() >= deadlineMs) {
      return evaluateBoard(board, shielded, color);
    }
    const moves = getValidMoves(board, color, shielded);
    const opponent = getOpponent(color);
    if (moves.length === 0) {
      if (passedLastTurn) {
        const counts = countPieces(board);
        const myCount = color === 1 /* Black */ ? counts.black : counts.white;
        const oppCount = opponent === 1 /* Black */ ? counts.black : counts.white;
        return (myCount - oppCount) * 1e3;
      }
      return -negamax(
        board,
        shielded,
        opponent,
        depth - 1,
        -beta,
        -alpha,
        true,
        deadlineMs
      );
    }
    moves.sort(
      (a, b) => POSITION_WEIGHTS[b.row][b.col] + b.flips.length * 2 - (POSITION_WEIGHTS[a.row][a.col] + a.flips.length * 2)
    );
    let bestScore = -Infinity;
    for (const move of moves) {
      const nextBoard = fastApplyMove(board, color, move);
      const score = -negamax(
        nextBoard,
        shielded,
        opponent,
        depth - 1,
        -beta,
        -alpha,
        false,
        deadlineMs
      );
      if (score > bestScore) {
        bestScore = score;
      }
      if (score > alpha) {
        alpha = score;
      }
      if (alpha >= beta) {
        break;
      }
    }
    return bestScore;
  }
  function chooseL1Move(moves) {
    const nonCornerMoves = moves.filter((m) => !isCorner(m.row, m.col));
    const candidatePool = nonCornerMoves.length > 0 ? nonCornerMoves : moves;
    let best = candidatePool[0];
    let bestFlips = -1;
    for (const m of candidatePool) {
      const bonus = POSITION_WEIGHTS[m.row][m.col] < 0 ? 2 : 0;
      const score = m.flips.length + bonus;
      if (score > bestFlips) {
        bestFlips = score;
        best = m;
      }
    }
    return best;
  }
  function chooseL2Move(moves) {
    let best = moves[0];
    let bestScore = -Infinity;
    for (const m of moves) {
      const score = POSITION_WEIGHTS[m.row][m.col] + m.flips.length * 3;
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return best;
  }
  function chooseL3Move(board, shielded, color, moves, depth = 4, timeBudgetMs = 350) {
    const deadlineMs = Date.now() + timeBudgetMs;
    const opponent = getOpponent(color);
    const orderedMoves = [...moves].sort(
      (a, b) => POSITION_WEIGHTS[b.row][b.col] + b.flips.length * 2 - (POSITION_WEIGHTS[a.row][a.col] + a.flips.length * 2)
    );
    let bestMove = orderedMoves[0];
    let bestScore = -Infinity;
    let alpha = -Infinity;
    const beta = Infinity;
    for (const move of orderedMoves) {
      const nextBoard = fastApplyMove(board, color, move);
      const score = -negamax(
        nextBoard,
        shielded,
        opponent,
        depth - 1,
        -beta,
        -alpha,
        false,
        deadlineMs
      );
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      if (score > alpha) {
        alpha = score;
      }
    }
    return { move: bestMove, score: bestScore };
  }
  function evaluateAISkillDecision(state, level, baseMove, baseScore) {
    if (level === "L1")
      return null;
    const player = state.currentPlayer;
    const equipped = state.players[player].equippedSkills;
    if (equipped.length === 0)
      return null;
    if (canUseSkill(state, player, "shield").usable) {
      const shieldTargets = getSkillTargets(state, player, "shield");
      const cornerTarget = shieldTargets.find((t) => isCorner(t.row, t.col));
      const edgeTarget = shieldTargets.find((t) => isEdge(t.row, t.col));
      const chosenShield = cornerTarget ?? (level.startsWith("L3") ? edgeTarget : void 0);
      if (chosenShield) {
        return {
          actionType: "skill",
          skillId: "shield",
          position: chosenShield,
          followUpPosition: { row: baseMove.row, col: baseMove.col }
        };
      }
    }
    if (canUseSkill(state, player, "steal").usable) {
      const stealTargets = getSkillTargets(state, player, "steal");
      const cornerSteal = stealTargets.find((t) => isCorner(t.row, t.col));
      if (cornerSteal) {
        return {
          actionType: "skill",
          skillId: "steal",
          position: cornerSteal
        };
      }
    }
    if (canUseSkill(state, player, "double").usable) {
      const selState = selectSkill(state, "double").state;
      const step1Res = applyBoardAction(selState, baseMove.row, baseMove.col);
      if (step1Res.ok && step1Res.state.selectedSkill?.doubleStep === 2) {
        const step2Moves = getValidMoves(
          step1Res.state.board,
          player,
          step1Res.state.shielded
        );
        if (step2Moves.length > 0) {
          const bestStep2 = chooseL2Move(step2Moves);
          const step2Res = applyBoardAction(
            step1Res.state,
            bestStep2.row,
            bestStep2.col
          );
          if (step2Res.ok) {
            const doubleScore = evaluateBoard(
              step2Res.state.board,
              step2Res.state.shielded,
              player
            );
            if (doubleScore > baseScore + 45) {
              return {
                actionType: "skill",
                skillId: "double",
                position: { row: baseMove.row, col: baseMove.col },
                followUpPosition: { row: bestStep2.row, col: bestStep2.col }
              };
            }
          }
        }
      }
    }
    if (canUseSkill(state, player, "bomb").usable) {
      const validMoves = getValidMoves(state.board, player, state.shielded);
      let bestBombPos = null;
      let bestBombScore = baseScore + 28;
      for (const m of validMoves) {
        const selState = selectSkill(state, "bomb").state;
        const bombRes = applyBoardAction(selState, m.row, m.col);
        if (bombRes.ok) {
          const score = evaluateBoard(
            bombRes.state.board,
            bombRes.state.shielded,
            player
          );
          if (score > bestBombScore) {
            bestBombScore = score;
            bestBombPos = { row: m.row, col: m.col };
          }
        }
      }
      if (bestBombPos) {
        return {
          actionType: "skill",
          skillId: "bomb",
          position: bestBombPos
        };
      }
    }
    return null;
  }
  function computeAIDecision(state, level) {
    const player = state.currentPlayer;
    if (state.selectedSkill?.skillId === "double" && state.selectedSkill.doubleStep === 2) {
      const moves = getValidMoves(state.board, player, state.shielded);
      if (moves.length === 0) {
        return { actionType: "pass" };
      }
      const move = level === "L1" ? chooseL1Move(moves) : level === "L2" || level === "L2_PLUS" ? chooseL2Move(moves) : chooseL3Move(state.board, state.shielded, player, moves, 4).move;
      return {
        actionType: "move",
        position: { row: move.row, col: move.col }
      };
    }
    const validMoves = getValidMoves(state.board, player, state.shielded);
    if (validMoves.length === 0) {
      if (level !== "L1" && canUseSkill(state, player, "wait").usable) {
        return { actionType: "skill", skillId: "wait" };
      }
      return { actionType: "pass" };
    }
    let baseMove;
    let baseScore;
    if (level === "L1") {
      baseMove = chooseL1Move(validMoves);
      baseScore = evaluateBoard(state.board, state.shielded, player);
    } else if (level === "L2" || level === "L2_PLUS") {
      baseMove = chooseL2Move(validMoves);
      const nextBoard = fastApplyMove(state.board, player, baseMove);
      baseScore = evaluateBoard(nextBoard, state.shielded, player);
    } else {
      const searchDepth = level === "L3_BOSS" ? 5 : 4;
      const res = chooseL3Move(
        state.board,
        state.shielded,
        player,
        validMoves,
        searchDepth,
        350
      );
      baseMove = res.move;
      baseScore = res.score;
    }
    const skillDecision = evaluateAISkillDecision(state, level, baseMove, baseScore);
    if (skillDecision) {
      return skillDecision;
    }
    return {
      actionType: "move",
      position: { row: baseMove.row, col: baseMove.col }
    };
  }
  function executeAITurn(state, level) {
    if (state.isGameOver)
      return state;
    const decision = computeAIDecision(state, level);
    let current = state;
    if (decision.actionType === "pass") {
      const res = passTurn(current);
      return res.state;
    }
    if (decision.actionType === "skill" && decision.skillId) {
      if (decision.skillId === "wait") {
        return useWaitSkill(current).state;
      }
      const sel = selectSkill(current, decision.skillId);
      if (sel.ok && decision.position) {
        current = sel.state;
        const act1 = applyBoardAction(
          current,
          decision.position.row,
          decision.position.col
        );
        if (act1.ok) {
          current = act1.state;
          if (!current.isGameOver && current.currentPlayer === state.currentPlayer && decision.followUpPosition) {
            const act2 = applyBoardAction(
              current,
              decision.followUpPosition.row,
              decision.followUpPosition.col
            );
            if (act2.ok) {
              current = act2.state;
            }
          }
          return current;
        }
      }
    }
    if (decision.position) {
      const res = applyBoardAction(
        current,
        decision.position.row,
        decision.position.col
      );
      return res.state;
    }
    return current;
  }

  // src/config/stages.ts
  var STAGES_CONFIG = [
    // 1-5 关：L1，AI 无技能 → 教玩家规则和技能
    {
      stageId: 1,
      name: "\u7B2C 1 \u5173 \xB7 \u521D\u5165\u68CB\u5C40",
      subtitle: "\u719F\u6089\u5939\u5B50\u7FFB\u8F6C\u4E0E\u89D2\u843D\u4F18\u52BF",
      aiLevel: "L1",
      aiSkills: [],
      aiInitialEnergy: 0,
      playerInitialEnergy: 20,
      // 新手关福利开局带 20 能量
      playerSkillSlots: 1,
      rewardTitle: "\u89E3\u9501\u6280\u80FD\u300C\u6094\u68CB\u65F6\u5149\u300D",
      unlockSkill: "undo"
    },
    {
      stageId: 2,
      name: "\u7B2C 2 \u5173 \xB7 \u91D1\u8EAB\u62A4\u4F53",
      subtitle: "\u5584\u7528\u91D1\u8EAB\u5B50\u4FDD\u62A4\u5173\u952E\u8FB9\u89D2",
      aiLevel: "L1",
      aiSkills: [],
      aiInitialEnergy: 0,
      playerInitialEnergy: 15,
      playerSkillSlots: 1,
      rewardTitle: "\u80FD\u91CF\u611F\u609F +5"
    },
    {
      stageId: 3,
      name: "\u7B2C 3 \u5173 \xB7 \u5341\u5B57\u8F70\u70B8",
      subtitle: "\u7528\u70B8\u5F39\u5B50\u6495\u5F00\u5BF9\u624B\u9632\u7EBF",
      aiLevel: "L1",
      aiSkills: [],
      aiInitialEnergy: 0,
      playerInitialEnergy: 15,
      playerSkillSlots: 1,
      rewardTitle: "\u89E3\u9501\u6280\u80FD\u300C\u5077\u5929\u6362\u65E5\u300D",
      unlockSkill: "steal"
    },
    {
      stageId: 4,
      name: "\u7B2C 4 \u5173 \xB7 \u4EE5\u9000\u4E3A\u8FDB",
      subtitle: "\u84C4\u79EF\u80FD\u91CF\u7B49\u5F85\u4E00\u51FB\u9006\u8F6C",
      aiLevel: "L1",
      aiSkills: [],
      aiInitialEnergy: 0,
      playerInitialEnergy: 10,
      playerSkillSlots: 1,
      rewardTitle: "\u521D\u7EA7\u68CB\u624B\u5FBD\u7AE0"
    },
    {
      stageId: 5,
      name: "\u7B2C 5 \u5173 \xB7 \u65B0\u624B\u8BD5\u70BC\u5B98",
      subtitle: "\u51FB\u8D25\u8D2A\u5FC3\u5B88\u536B\uFF0C\u5F00\u542F\u8FDB\u9636\u4E4B\u8DEF",
      aiLevel: "L1",
      aiSkills: [],
      aiInitialEnergy: 10,
      playerInitialEnergy: 10,
      playerSkillSlots: 1,
      rewardTitle: "\u89E3\u9501\u7B2C 2 \u4E2A\u6280\u80FD\u69FD\u4F4D"
    },
    // 6-10 关：L2，AI 带 1 技能 → 解锁玩家第 2 个技能位
    {
      stageId: 6,
      name: "\u7B2C 6 \u5173 \xB7 \u8FB9\u89D2\u730E\u624B",
      subtitle: "AI \u5F00\u59CB\u6CE8\u91CD\u62A2\u5360\u56DB\u89D2\u4E0E\u8FB9\u7EBF",
      aiLevel: "L2",
      aiSkills: ["shield"],
      aiInitialEnergy: 0,
      playerInitialEnergy: 10,
      playerSkillSlots: 2,
      rewardTitle: "\u89E3\u9501\u6280\u80FD\u300C\u8FDE\u843D\u53CC\u5B50\u300D",
      unlockSkill: "double"
    },
    {
      stageId: 7,
      name: "\u7B2C 7 \u5173 \xB7 \u7206\u7834\u4E13\u5BB6",
      subtitle: "\u5C0F\u5FC3 AI \u7684\u5341\u5B57\u70B8\u5F39\u7A81\u88AD",
      aiLevel: "L2",
      aiSkills: ["bomb"],
      aiInitialEnergy: 0,
      playerInitialEnergy: 10,
      playerSkillSlots: 2,
      rewardTitle: "\u8FDB\u9636\u68CB\u624B\u5FBD\u7AE0"
    },
    {
      stageId: 8,
      name: "\u7B2C 8 \u5173 \xB7 \u8BE1\u9053\u68CB\u624B",
      subtitle: "\u63D0\u9632\u5BF9\u624B\u5077\u5929\u6362\u65E5\u5077\u8D70\u5173\u952E\u89D2",
      aiLevel: "L2",
      aiSkills: ["steal"],
      aiInitialEnergy: 0,
      playerInitialEnergy: 10,
      playerSkillSlots: 2,
      rewardTitle: "\u6218\u672F\u5927\u5E08\u611F\u609F"
    },
    {
      stageId: 9,
      name: "\u7B2C 9 \u5173 \xB7 \u84C4\u529B\u5B88\u536B",
      subtitle: "\u5BF9\u624B\u4F1A\u8DF3\u8FC7\u56DE\u5408\u79EF\u6512\u9AD8\u989D\u80FD\u91CF",
      aiLevel: "L2",
      aiSkills: ["wait"],
      aiInitialEnergy: 10,
      playerInitialEnergy: 10,
      playerSkillSlots: 2,
      rewardTitle: "\u9AD8\u9636\u6218\u672F\u7CBE\u901A"
    },
    {
      stageId: 10,
      name: "\u7B2C 10 \u5173 \xB7 \u94C1\u58C1\u8003\u5B98",
      subtitle: "\u7A81\u7834\u4F4D\u7F6E\u6743\u91CD AI \u7684\u4E25\u5BC6\u9632\u5B88",
      aiLevel: "L2",
      aiSkills: ["double"],
      aiInitialEnergy: 10,
      playerInitialEnergy: 10,
      playerSkillSlots: 2,
      rewardTitle: "\u89E3\u9501\u7B2C 3 \u4E2A\u6280\u80FD\u69FD\u4F4D\uFF08\u6EE1\u69FD\uFF09"
    },
    // 11-15 关：L2+，AI 带 2 技能，开局能量 20
    {
      stageId: 11,
      name: "\u7B2C 11 \u5173 \xB7 \u653B\u5B88\u517C\u5907",
      subtitle: "AI \u5F00\u5C40 20 \u80FD\u91CF\u4E14\u643A\u5E26\u53CC\u6280\u80FD",
      aiLevel: "L2_PLUS",
      aiSkills: ["shield", "bomb"],
      aiInitialEnergy: 20,
      playerInitialEnergy: 15,
      playerSkillSlots: 3,
      rewardTitle: "\u7CBE\u82F1\u68CB\u624B\u5FBD\u7AE0"
    },
    {
      stageId: 12,
      name: "\u7B2C 12 \u5173 \xB7 \u6697\u5EA6\u9648\u4ED3",
      subtitle: "\u91D1\u8EAB\u62A4\u89D2\u914D\u5408\u5077\u5929\u6362\u65E5",
      aiLevel: "L2_PLUS",
      aiSkills: ["shield", "steal"],
      aiInitialEnergy: 20,
      playerInitialEnergy: 15,
      playerSkillSlots: 3,
      rewardTitle: "\u7834\u9635\u5148\u950B\u79F0\u53F7"
    },
    {
      stageId: 13,
      name: "\u7B2C 13 \u5173 \xB7 \u72C2\u8F70\u6EE5\u70B8",
      subtitle: "\u84C4\u80FD\u4E0E\u70B8\u5F39\u7684\u9AD8\u9891\u538B\u5236",
      aiLevel: "L2_PLUS",
      aiSkills: ["wait", "bomb"],
      aiInitialEnergy: 20,
      playerInitialEnergy: 20,
      playerSkillSlots: 3,
      rewardTitle: "\u9006\u8F6C\u8FBE\u4EBA\u79F0\u53F7"
    },
    {
      stageId: 14,
      name: "\u7B2C 14 \u5173 \xB7 \u53CC\u5B50\u60CA\u96F7",
      subtitle: "\u84C4\u80FD\u540E\u8FDE\u843D\u53CC\u5B50\u7684\u7206\u53D1\u8FDE\u62DB",
      aiLevel: "L2_PLUS",
      aiSkills: ["wait", "double"],
      aiInitialEnergy: 20,
      playerInitialEnergy: 20,
      playerSkillSlots: 3,
      rewardTitle: "\u661F\u8000\u68CB\u624B\u5FBD\u7AE0"
    },
    {
      stageId: 15,
      name: "\u7B2C 15 \u5173 \xB7 \u5B97\u5E08\u95E8\u5F92",
      subtitle: "\u534A\u51B3\u8D5B\u5B88\u95E8\u4EBA\uFF0C\u7EFC\u5408\u5B9E\u529B\u5F3A\u52B2",
      aiLevel: "L2_PLUS",
      aiSkills: ["bomb", "double"],
      aiInitialEnergy: 20,
      playerInitialEnergy: 20,
      playerSkillSlots: 3,
      rewardTitle: "\u664B\u7EA7\u5927\u5E08\u6BBF\u5802"
    },
    // 16-19 关：L3，AI 带 3 技能
    {
      stageId: 16,
      name: "\u7B2C 16 \u5173 \xB7 \u6DF1\u7B97\u957F\u8001",
      subtitle: "\u591A\u6B65\u6DF1\u7B97 + \u884C\u52A8\u529B\u5C01\u9501",
      aiLevel: "L3",
      aiSkills: ["shield", "bomb", "wait"],
      aiInitialEnergy: 20,
      playerInitialEnergy: 20,
      playerSkillSlots: 3,
      rewardTitle: "\u6DF1\u7B97\u514B\u661F\u5FBD\u7AE0"
    },
    {
      stageId: 17,
      name: "\u7B2C 17 \u5173 \xB7 \u5E7B\u5F71\u5927\u5B97\u5E08",
      subtitle: "\u6781\u9650\u63A7\u573A\u4E0E\u5077\u5929\u6362\u65E5\u7EDD\u6740",
      aiLevel: "L3",
      aiSkills: ["shield", "steal", "bomb"],
      aiInitialEnergy: 25,
      playerInitialEnergy: 20,
      playerSkillSlots: 3,
      rewardTitle: "\u5E7B\u5F71\u7834\u5C40\u8005\u79F0\u53F7"
    },
    {
      stageId: 18,
      name: "\u7B2C 18 \u5173 \xB7 \u96F7\u9706\u88C1\u51B3\u8005",
      subtitle: "\u8FDE\u843D\u53CC\u5B50\u914D\u5408\u591A\u6B65\u641C\u7D22\u7684\u538B\u8FEB\u611F",
      aiLevel: "L3",
      aiSkills: ["wait", "bomb", "double"],
      aiInitialEnergy: 25,
      playerInitialEnergy: 25,
      playerSkillSlots: 3,
      rewardTitle: "\u96F7\u9706\u68CB\u5723\u5FBD\u7AE0"
    },
    {
      stageId: 19,
      name: "\u7B2C 19 \u5173 \xB7 \u7EDD\u5883\u5B88\u671B\u8005",
      subtitle: "\u7EC8\u6781 Boss \u524D\u7684\u6700\u540E\u4E00\u9053\u9632\u7EBF",
      aiLevel: "L3",
      aiSkills: ["shield", "steal", "double"],
      aiInitialEnergy: 30,
      playerInitialEnergy: 25,
      playerSkillSlots: 3,
      rewardTitle: "\u4F20\u5947\u6311\u6218\u8005\u79F0\u53F7"
    },
    // 20 关：L3 满配 + 终局 Boss 皮肤/称号奖励
    {
      stageId: 20,
      name: "\u7B2C 20 \u5173 \xB7 \u7FFB\u76D8\u68CB\u795E (BOSS)",
      subtitle: "L3 \u6EE1\u914D\u6DF1\u7B97\u5B97\u5E08 \xB7 \u660E\u660E\u53EA\u5269 3 \u4E2A\u5B50\u4E5F\u80FD\u7FFB\u76D8",
      aiLevel: "L3_BOSS",
      aiSkills: ["shield", "bomb", "double"],
      aiInitialEnergy: 35,
      playerInitialEnergy: 30,
      playerSkillSlots: 3,
      rewardTitle: "\u3010\u7EC8\u5C40 Boss \u79F0\u53F7\uFF1A\u7FFB\u76D8\u68CB\u795E\u3011+\u3010\u9ED1\u91D1\u81F3\u5C0A\u68CB\u76D8\u4E3B\u9898\u3011"
    }
  ];
  function getStageConfig(stageId) {
    const stage = STAGES_CONFIG.find((s) => s.stageId === stageId);
    if (!stage) {
      throw new Error(`Invalid stageId: ${stageId}`);
    }
    return stage;
  }

  // src/net/storage.ts
  var STORAGE_KEY = "vibe_reversi_user_progress_v1";
  function createDefaultProgress() {
    return {
      maxClearedStage: 0,
      unlockedSkills: ["bomb", "shield", "wait"],
      skillSlots: 1,
      equippedSkills: ["bomb", "shield", "wait"],
      totalWins: 0,
      totalGames: 0,
      biggestFlipRecord: 0,
      titles: ["\u521D\u51FA\u8305\u5E90"],
      updatedAt: Date.now()
    };
  }
  var memoryStore = {};
  function getLocalRaw(key) {
    const g = globalThis;
    if (g.wx && typeof g.wx.getStorageSync === "function") {
      try {
        const val = g.wx.getStorageSync(key);
        if (val)
          return val;
      } catch {
      }
    }
    if (g.window && g.window.localStorage && typeof g.window.localStorage.getItem === "function") {
      try {
        const val = g.window.localStorage.getItem(key);
        if (val)
          return val;
      } catch {
      }
    }
    return memoryStore[key] ?? null;
  }
  function setLocalRaw(key, value) {
    memoryStore[key] = value;
    const g = globalThis;
    if (g.wx && typeof g.wx.setStorageSync === "function") {
      try {
        g.wx.setStorageSync(key, value);
      } catch {
      }
    }
    if (g.window && g.window.localStorage && typeof g.window.localStorage.setItem === "function") {
      try {
        g.window.localStorage.setItem(key, value);
      } catch {
      }
    }
  }
  function loadLocalProgress() {
    const raw = getLocalRaw(STORAGE_KEY);
    if (!raw)
      return createDefaultProgress();
    try {
      const parsed = JSON.parse(raw);
      return {
        ...createDefaultProgress(),
        ...parsed
      };
    } catch {
      return createDefaultProgress();
    }
  }
  function saveLocalProgress(progress) {
    progress.updatedAt = Date.now();
    setLocalRaw(STORAGE_KEY, JSON.stringify(progress));
  }
  function recordStageWin(progress, stageId, maxFlipInGame) {
    const next = {
      ...progress,
      unlockedSkills: [...progress.unlockedSkills],
      equippedSkills: [...progress.equippedSkills],
      titles: [...progress.titles],
      totalGames: progress.totalGames + 1,
      totalWins: progress.totalWins + 1,
      biggestFlipRecord: Math.max(progress.biggestFlipRecord, maxFlipInGame),
      updatedAt: Date.now()
    };
    if (stageId > next.maxClearedStage) {
      next.maxClearedStage = stageId;
    }
    for (const st of STAGES_CONFIG) {
      if (st.stageId <= next.maxClearedStage) {
        if (st.unlockSkill && !next.unlockedSkills.includes(st.unlockSkill)) {
          next.unlockedSkills.push(st.unlockSkill);
        }
        if (!next.titles.includes(st.rewardTitle)) {
          next.titles.push(st.rewardTitle);
        }
      }
    }
    if (next.maxClearedStage >= 10) {
      next.skillSlots = 3;
    } else if (next.maxClearedStage >= 5) {
      next.skillSlots = 2;
    } else {
      const cfg = getStageConfig(Math.min(20, next.maxClearedStage + 1));
      next.skillSlots = Math.max(next.skillSlots, cfg.playerSkillSlots);
    }
    saveLocalProgress(next);
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
        this.listeners.get(roomId)?.delete(callback);
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
          if (!(state.selectedSkill?.skillId === "double" && state.selectedSkill.doubleStep === 2)) {
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
  var OnlineRoomClient = class {
    constructor(openId, nickname, customService) {
      this.openId = openId;
      this.nickname = nickname;
      this.unwatchFn = null;
      this.db = customService?.db ?? sharedLocalDb;
      this.cloudService = customService?.service ?? sharedLocalCloud;
    }
    hasWxCloud() {
      const g = globalThis;
      return Boolean(g.wx && g.wx.cloud && typeof g.wx.cloud.callFunction === "function");
    }
    async createRoom(equippedSkills, now) {
      if (this.hasWxCloud() && now === void 0) {
        try {
          const g = globalThis;
          const res = await g.wx.cloud.callFunction({
            name: "reversiRoom",
            data: {
              action: "createRoom",
              openId: this.openId,
              nickname: this.nickname,
              equippedSkills
            }
          });
          return res.result;
        } catch {
        }
      }
      return this.cloudService.createRoom({
        openId: this.openId,
        nickname: this.nickname,
        equippedSkills,
        now
      });
    }
    async joinRoom(roomId, equippedSkills, now) {
      if (this.hasWxCloud() && now === void 0) {
        try {
          const g = globalThis;
          const res = await g.wx.cloud.callFunction({
            name: "reversiRoom",
            data: {
              action: "joinRoom",
              roomId,
              openId: this.openId,
              nickname: this.nickname,
              equippedSkills
            }
          });
          return res.result;
        } catch {
        }
      }
      return this.cloudService.joinRoom({
        roomId,
        openId: this.openId,
        nickname: this.nickname,
        equippedSkills,
        now
      });
    }
    async submitMove(payload) {
      return this.cloudService.submitMove({
        ...payload,
        openId: this.openId
      });
    }
    async requestWaitSkill(roomId, now) {
      return this.cloudService.requestSkill({
        roomId,
        openId: this.openId,
        skillId: "wait",
        now
      });
    }
    async respondWaitSkill(roomId, approved, now) {
      return this.cloudService.respondSkill({
        roomId,
        openId: this.openId,
        approved,
        now
      });
    }
    async syncState(roomId, claimDisconnectWin = false, now) {
      return this.cloudService.syncState({
        roomId,
        openId: this.openId,
        claimDisconnectWin,
        now
      });
    }
    /**
     * 监听房间实时更新（对应微信云数据库 onUpdate）
     */
    watchRoom(roomId, onUpdate) {
      this.stopWatch();
      this.unwatchFn = this.db.watchRoom(roomId, onUpdate);
      return () => this.stopWatch();
    }
    stopWatch() {
      if (this.unwatchFn) {
        this.unwatchFn();
        this.unwatchFn = null;
      }
    }
  };

  // src/ui/app.ts
  var GameApp = class {
    constructor() {
      this.currentPage = "home";
      this.targetMode = "ai";
      this.selectedStageId = 1;
      this.hitBoxes = [];
      // 用于单机一键模拟好友加入测试
      this.currentRoom = null;
      this.inputRoomCode = "";
      this.shareCardNotice = "";
      this.progress = loadLocalProgress();
      this.anim = new AnimationManager();
      this.onlineClient = new OnlineRoomClient("wx_player_host", "\u6211\u65B9\u68CB\u624B");
      this.guestSimClient = new OnlineRoomClient("wx_player_guest", "\u53D7\u9080\u597D\u53CB");
      this.gameState = createGame({
        mode: "local2p",
        blackSkills: this.progress.equippedSkills
      });
    }
    /**
     * 跳转到指定页面
     */
    navigateTo(page) {
      this.currentPage = page;
      this.shareCardNotice = "";
    }
    /**
     * 在选技能页切换勾选技能（6 选 N，N 取决于当前已解锁槽位数，同屏/联机模式开放 3 槽）
     */
    toggleSkillEquip(skillId) {
      const cfg = SKILLS_CONFIG[skillId];
      const isUnlocked = this.progress.unlockedSkills.includes(skillId) || this.progress.maxClearedStage >= cfg.unlockStage;
      if (!isUnlocked) {
        this.anim.showToast(`\u{1F512} \u901A\u5173\u7B2C ${cfg.unlockStage} \u5173\u89E3\u9501\u3010${cfg.name}\u3011`);
        return false;
      }
      const maxSlots = this.targetMode === "ai" ? getStageConfig(this.selectedStageId).playerSkillSlots : MAX_EQUIPPED_SKILLS;
      const current = [...this.progress.equippedSkills];
      const idx = current.indexOf(skillId);
      if (idx >= 0) {
        if (current.length <= 1) {
          this.anim.showToast("\u81F3\u5C11\u4FDD\u7559 1 \u4E2A\u643A\u5E26\u6280\u80FD");
          return false;
        }
        current.splice(idx, 1);
      } else {
        if (current.length >= maxSlots) {
          current.shift();
        }
        current.push(skillId);
      }
      this.progress.equippedSkills = current;
      saveLocalProgress(this.progress);
      return true;
    }
    /**
     * 启动对局（人机挑战 / 双人同屏 / 好友联机）
     */
    startMatch(mode, stageId = this.selectedStageId) {
      this.targetMode = mode;
      this.selectedStageId = stageId;
      if (mode === "ai") {
        const stage = getStageConfig(stageId);
        const equipped = this.progress.equippedSkills.slice(
          0,
          stage.playerSkillSlots
        );
        this.gameState = createGame({
          mode: "ai",
          stageId,
          blackSkills: equipped,
          whiteSkills: stage.aiSkills,
          blackInitialEnergy: stage.playerInitialEnergy,
          whiteInitialEnergy: stage.aiInitialEnergy
        });
      } else if (mode === "local2p") {
        const equipped = this.progress.equippedSkills.slice(0, 3);
        this.gameState = createGame({
          mode: "local2p",
          blackSkills: equipped,
          whiteSkills: equipped,
          blackInitialEnergy: 10,
          whiteInitialEnergy: 10
        });
      } else {
        if (this.currentRoom?.gameState) {
          this.gameState = this.currentRoom.gameState;
        } else {
          this.gameState = createGame({
            mode: "online",
            blackSkills: this.progress.equippedSkills.slice(0, 3),
            whiteSkills: ["bomb", "shield", "wait"]
          });
        }
      }
      this.anim.consumeEvents(this.gameState.lastEvents);
      this.navigateTo("match");
    }
    /**
     * 处理对局页点击技能按钮
     */
    handleSkillButtonClick(skillId) {
      if (this.gameState.isGameOver)
        return;
      const player = this.gameState.currentPlayer;
      if (this.gameState.selectedSkill?.skillId === skillId && this.gameState.selectedSkill.doubleStep !== 2) {
        this.gameState = selectSkill(this.gameState, null).state;
        return;
      }
      if (skillId === "wait") {
        const res = useWaitSkill(this.gameState);
        if (!res.ok) {
          this.anim.showToast(res.reason ?? "\u65E0\u6CD5\u4F7F\u7528\u8BE5\u6280\u80FD");
          return;
        }
        this.gameState = res.state;
        this.anim.consumeEvents(this.gameState.lastEvents);
        this.checkPostTurnFlow();
        return;
      }
      if (skillId === "undo") {
        const res = useUndoSkill(this.gameState);
        if (!res.ok) {
          this.anim.showToast(res.reason ?? "\u65E0\u6CD5\u4F7F\u7528\u6094\u68CB\u65F6\u5149");
          return;
        }
        this.gameState = res.state;
        this.anim.consumeEvents(this.gameState.lastEvents);
        return;
      }
      const sel = selectSkill(this.gameState, skillId);
      if (!sel.ok) {
        this.anim.showToast(sel.reason ?? "\u5F53\u524D\u4E0D\u53EF\u9009\u8BE5\u6280\u80FD");
        return;
      }
      this.gameState = sel.state;
      const cfg = SKILLS_CONFIG[skillId];
      if (skillId === "shield") {
        this.anim.showToast(`\u5DF2\u9009\u3010${cfg.name}\u3011\uFF1A\u8BF7\u70B9\u51FB\u68CB\u76D8\u4E0A\u4E00\u9897\u5DF1\u65B9\u68CB\u5B50`);
      } else if (skillId === "steal") {
        this.anim.showToast(`\u5DF2\u9009\u3010${cfg.name}\u3011\uFF1A\u8BF7\u70B9\u51FB\u68CB\u76D8\u4E0A\u4E00\u9897\u5BF9\u65B9\u975E\u91D1\u8EAB\u68CB\u5B50`);
      } else {
        this.anim.showToast(`\u5DF2\u9009\u3010${cfg.name}\u3011\uFF1A\u8BF7\u70B9\u51FB\u9AD8\u4EAE\u5408\u6CD5\u683C\u843D\u5B50`);
      }
    }
    /**
     * 处理棋盘格子点击 (row, col)
     */
    handleBoardCellClick(row, col) {
      if (this.gameState.isGameOver)
        return;
      if (this.gameState.mode === "ai" && this.gameState.currentPlayer === 2 /* White */) {
        return;
      }
      const res = applyBoardAction(this.gameState, row, col);
      this.gameState = res.state;
      if (!res.ok) {
        if (res.reason) {
          this.anim.showToast(res.reason);
        }
        return;
      }
      this.anim.consumeEvents(this.gameState.lastEvents);
      this.checkPostTurnFlow();
    }
    /**
     * 检查回合后流转：AI 自动应答、终局自动结算与跳转
     */
    checkPostTurnFlow() {
      if (this.gameState.isGameOver) {
        this.onGameFinished();
        return;
      }
      if (this.gameState.mode === "ai" && this.gameState.currentPlayer === 2 /* White */ && !this.gameState.isGameOver) {
        const stage = getStageConfig(this.selectedStageId);
        let safety = 0;
        while (!this.gameState.isGameOver && this.gameState.currentPlayer === 2 /* White */ && safety < 6) {
          safety++;
          this.gameState = executeAITurn(this.gameState, stage.aiLevel);
          this.anim.consumeEvents(this.gameState.lastEvents);
        }
        if (this.gameState.isGameOver) {
          this.onGameFinished();
        }
      }
    }
    onGameFinished() {
      const biggest = getBiggestComebackMove(this.gameState);
      const maxFlip = biggest ? biggest.flippedCount : 0;
      if (this.gameState.mode === "ai" && this.gameState.winner === 1 /* Black */ && this.selectedStageId) {
        this.progress = recordStageWin(
          this.progress,
          this.selectedStageId,
          maxFlip
        );
      } else {
        this.progress.totalGames += 1;
        if (this.gameState.winner === 1 /* Black */) {
          this.progress.totalWins += 1;
        }
        if (maxFlip > this.progress.biggestFlipRecord) {
          this.progress.biggestFlipRecord = maxFlip;
        }
        saveLocalProgress(this.progress);
      }
    }
    /**
     * 生成战绩分享文案与卡片信息（阶段 6：结算与分享）
     */
    generateSharePayload() {
      const counts = countPieces(this.gameState.board);
      const biggest = getBiggestComebackMove(this.gameState);
      const flipNum = biggest ? biggest.flippedCount : 0;
      const roomQuery = this.currentRoom ? `roomId=${this.currentRoom.roomId}` : "from=share";
      const title = flipNum >= 4 ? `\u660E\u660E\u53EA\u5269\u51E0\u4E2A\u5B50\uFF0C\u6211\u4E00\u6B65\u72C2\u7FFB ${flipNum} \u5B50\u60CA\u5929\u9006\u8F6C\uFF01\u6562\u6765\u6311\u6218\u5417\uFF1F` : `\u300A\u6280\u80FD\u9ED1\u767D\u68CB\xB7\u7FFB\u76D8\u68CB\u300B\u6BD4\u5206 ${counts.black}:${counts.white}\uFF0C\u5FEB\u6765\u4E00\u51B3\u9AD8\u4E0B\uFF01`;
      const highlightStepText = biggest ? `\u7B2C ${biggest.stepIndex} \u6B65 \xB7 ${biggest.description}` : "\u672C\u5C40\u7A33\u624E\u7A33\u6253\u62FF\u4E0B\u80DC\u5229";
      this.shareCardNotice = `\u2705 \u5DF2\u62C9\u8D77\u5FAE\u4FE1\u597D\u53CB\u5206\u4EAB\u5361\u7247\uFF1A\u300C${title}\u300D`;
      this.anim.showToast("\u{1F4E4} \u6218\u7EE9\u5206\u4EAB\u5361\u5DF2\u751F\u6210\uFF0C\u597D\u53CB\u70B9\u51FB\u53EF\u76F4\u63A5\u8FDB\u5165\u5C0F\u6E38\u620F\uFF01");
      const g = globalThis;
      if (g.wx && typeof g.wx.shareAppMessage === "function") {
        try {
          g.wx.shareAppMessage({ title, query: roomQuery });
        } catch {
        }
      }
      return {
        title,
        highlightStepText,
        query: roomQuery
      };
    }
    /**
     * 处理屏幕像素点击 (px, py, width, height)
     */
    handlePointerTap(px, py, screenWidth, screenHeight) {
      for (let i = this.hitBoxes.length - 1; i >= 0; i--) {
        const box = this.hitBoxes[i];
        if (px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h) {
          box.onClick();
          return true;
        }
      }
      if (this.currentPage === "match") {
        const rect = computeBoardRect(screenWidth, screenHeight);
        const coord = pixelToBoardCoord(px, py, rect);
        if (coord) {
          this.handleBoardCellClick(coord.row, coord.col);
          return true;
        }
        if (this.gameState.selectedSkill && this.gameState.selectedSkill.doubleStep !== 2) {
          this.gameState = selectSkill(this.gameState, null).state;
          this.anim.showToast("\u5DF2\u53D6\u6D88\u6280\u80FD\u9009\u62E9\uFF08\u672A\u6263\u80FD\u91CF\uFF09");
          return true;
        }
      }
      return false;
    }
    registerButton(ctx, id, x, y, w, h, label, options) {
      const bg = options.disabled ? "#2a2f3a" : options.bg ?? "#eab308";
      const color = options.disabled ? "#6b7280" : options.color ?? "#0f172a";
      const fontSize = options.fontSize ?? 15;
      ctx.save();
      ctx.fillStyle = bg;
      this.roundRect(ctx, x, y, w, h, 10);
      ctx.fill();
      if (options.border) {
        ctx.strokeStyle = options.border;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.fillStyle = color;
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (options.subLabel) {
        ctx.fillText(label, x + w / 2, y + h / 2 - 8);
        ctx.font = `${Math.max(10, fontSize - 4)}px -apple-system, sans-serif`;
        ctx.fillStyle = options.disabled ? "#6b7280" : "#cbd5e1";
        ctx.fillText(options.subLabel, x + w / 2, y + h / 2 + 10);
      } else {
        ctx.fillText(label, x + w / 2, y + h / 2);
      }
      ctx.restore();
      if (!options.disabled) {
        this.hitBoxes.push({ id, x, y, w, h, onClick: options.onClick });
      }
    }
    roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }
    /**
     * 渲染主入口：根据 currentPage 绘制对应页面
     */
    render(ctx, width, height, nowMs = Date.now()) {
      this.hitBoxes = [];
      this.anim.cleanup(nowMs);
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, "#0f172a");
      grad.addColorStop(1, "#1e293b");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      switch (this.currentPage) {
        case "home":
          this.renderHomePage(ctx, width, height, nowMs);
          break;
        case "mode_select":
          this.renderModeSelectPage(ctx, width, height);
          break;
        case "skill_select":
          this.renderSkillSelectPage(ctx, width, height);
          break;
        case "match":
          this.renderMatchPage(ctx, width, height, nowMs);
          break;
        case "online_room":
          this.renderOnlineRoomPage(ctx, width, height);
          break;
        case "result":
          this.renderResultPage(ctx, width, height, nowMs);
          break;
        case "codex":
          this.renderCodexPage(ctx, width, height);
          break;
      }
      if (this.anim.toastMessage) {
        ctx.save();
        const tw = Math.min(width - 32, 330);
        const tx = (width - tw) / 2;
        const ty = 52;
        ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
        this.roundRect(ctx, tx, ty, tw, 36, 18);
        ctx.fill();
        ctx.strokeStyle = "#eab308";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = "#fef08a";
        ctx.font = "bold 13px -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.anim.toastMessage.text, width / 2, ty + 18);
        ctx.restore();
      }
    }
    /**
     * 页面 1：主页（开始游戏、技能图鉴入口、我的进度；一句口号 + 一个翻盘动图做视觉钩子）
     */
    renderHomePage(ctx, w, h, nowMs) {
      ctx.save();
      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 28px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("\u6280\u80FD\u9ED1\u767D\u68CB \xB7 \u7FFB\u76D8\u68CB", w / 2, h * 0.14);
      ctx.fillStyle = "#facc15";
      ctx.font = "bold 15px -apple-system, sans-serif";
      ctx.fillText("\u201C\u660E\u660E\u53EA\u5269 3 \u4E2A\u5B50\uFF0C\u4E00\u6B65\u5168\u7FFB\u56DE\u6765\uFF01\u201D", w / 2, h * 0.19);
      const demoY = h * 0.31;
      const demoW = Math.min(w - 48, 300);
      const demoX = (w - demoW) / 2;
      ctx.fillStyle = "#064e3b";
      this.roundRect(ctx, demoX, demoY - 42, demoW, 84, 14);
      ctx.fill();
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 2;
      ctx.stroke();
      const cycle = nowMs % 3e3 / 3e3;
      for (let i = 0; i < 5; i++) {
        const cx = demoX + 35 + i * ((demoW - 70) / 4);
        const flipMoment = 0.2 + i * 0.12;
        const isFlippedToBlack = cycle >= flipMoment;
        const localScale = Math.abs(cycle - flipMoment) < 0.08 ? Math.max(0.15, Math.abs(Math.cos((cycle - flipMoment) / 0.08 * Math.PI))) : 1;
        ctx.save();
        ctx.translate(cx, demoY);
        ctx.scale(localScale, 1);
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.fillStyle = isFlippedToBlack ? "#111827" : "#f8fafc";
        ctx.fill();
        ctx.strokeStyle = isFlippedToBlack ? "#facc15" : "#94a3b8";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
      const cardW = Math.min(w - 48, 300);
      const cardX = (w - cardW) / 2;
      const cardY = h * 0.44;
      ctx.fillStyle = "rgba(30, 41, 59, 0.9)";
      this.roundRect(ctx, cardX, cardY, cardW, 74, 12);
      ctx.fill();
      ctx.fillStyle = "#94a3b8";
      ctx.font = "13px -apple-system, sans-serif";
      ctx.fillText(
        `\u6211\u7684\u8FDB\u5EA6\uFF1A\u5DF2\u901A\u5173 ${this.progress.maxClearedStage}/20 \u5173 \uFF5C \u80DC\u573A ${this.progress.totalWins}`,
        w / 2,
        cardY + 26
      );
      ctx.fillStyle = "#38bdf8";
      ctx.fillText(
        `\u5355\u6B65\u6700\u5927\u7FFB\u76D8\u8BB0\u5F55\uFF1A${this.progress.biggestFlipRecord} \u5B50 \uFF5C \u79F0\u53F7\uFF1A${this.progress.titles[this.progress.titles.length - 1]}`,
        w / 2,
        cardY + 50
      );
      ctx.restore();
      const btnW = Math.min(w - 64, 260);
      const btnX = (w - btnW) / 2;
      this.registerButton(ctx, "btn_start", btnX, h * 0.6, btnW, 52, "\u{1F3AE} \u5F00\u59CB\u6E38\u620F", {
        bg: "#eab308",
        color: "#0f172a",
        fontSize: 18,
        onClick: () => this.navigateTo("mode_select")
      });
      this.registerButton(
        ctx,
        "btn_codex",
        btnX,
        h * 0.69,
        btnW,
        46,
        "\u{1F4D6} \u6280\u80FD\u56FE\u9274 & \u80FD\u91CF\u89C4\u5219",
        {
          bg: "#334155",
          color: "#f8fafc",
          border: "#475569",
          onClick: () => this.navigateTo("codex")
        }
      );
      this.registerButton(
        ctx,
        "btn_quick_skills",
        btnX,
        h * 0.77,
        btnW,
        46,
        "\u26A1 \u914D\u7F6E\u643A\u5E26\u6280\u80FD (6\u90093)",
        {
          bg: "#1e293b",
          color: "#38bdf8",
          border: "#0284c7",
          onClick: () => {
            this.targetMode = "local2p";
            this.navigateTo("skill_select");
          }
        }
      );
    }
    /**
     * 页面 2：模式选择（人机挑战 20 关 / 双人同屏 / 好友联机）
     */
    renderModeSelectPage(ctx, w, h) {
      this.registerButton(ctx, "btn_back_home", 16, 16, 72, 34, "\u2190 \u8FD4\u56DE", {
        bg: "#334155",
        color: "#f8fafc",
        fontSize: 13,
        onClick: () => this.navigateTo("home")
      });
      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 22px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("\u9009\u62E9\u5BF9\u6218\u6A21\u5F0F", w / 2, 38);
      const cardW = Math.min(w - 40, 320);
      const cardX = (w - cardW) / 2;
      const stageCfg = getStageConfig(this.selectedStageId);
      ctx.fillStyle = "#1e293b";
      this.roundRect(ctx, cardX, 74, cardW, 145, 12);
      ctx.fill();
      ctx.strokeStyle = "#eab308";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#fef08a";
      ctx.font = "bold 16px -apple-system, sans-serif";
      ctx.fillText(`\u{1F916} \u4EBA\u673A\u95EF\u5173\uFF08\u5171 20 \u5173\uFF09`, w / 2, 98);
      ctx.fillStyle = "#f8fafc";
      ctx.font = "14px -apple-system, sans-serif";
      ctx.fillText(`${stageCfg.name} [${stageCfg.aiLevel}]`, w / 2, 122);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "12px -apple-system, sans-serif";
      ctx.fillText(stageCfg.subtitle, w / 2, 142);
      this.registerButton(ctx, "stage_prev", cardX + 14, 160, 68, 38, "\u4E0A\u4E00\u5173", {
        bg: "#334155",
        color: "#f8fafc",
        fontSize: 13,
        onClick: () => {
          this.selectedStageId = this.selectedStageId > 1 ? this.selectedStageId - 1 : 20;
        }
      });
      this.registerButton(
        ctx,
        "btn_mode_ai",
        cardX + 92,
        160,
        cardW - 184,
        38,
        "\u8FDB\u5165\u9009\u6280\u5F00\u6218",
        {
          bg: "#eab308",
          color: "#0f172a",
          fontSize: 14,
          onClick: () => {
            this.targetMode = "ai";
            this.navigateTo("skill_select");
          }
        }
      );
      this.registerButton(
        ctx,
        "stage_next",
        cardX + cardW - 82,
        160,
        68,
        38,
        "\u4E0B\u4E00\u5173",
        {
          bg: "#334155",
          color: "#f8fafc",
          fontSize: 13,
          onClick: () => {
            this.selectedStageId = this.selectedStageId < 20 ? this.selectedStageId + 1 : 1;
          }
        }
      );
      this.registerButton(
        ctx,
        "btn_mode_local2p",
        cardX,
        245,
        cardW,
        72,
        "\u{1F465} \u53CC\u4EBA\u540C\u5C4F\u5BF9\u6218",
        {
          bg: "#0284c7",
          color: "#f8fafc",
          fontSize: 18,
          subLabel: "\u9762\u5BF9\u9762\u540C\u673A\u535A\u5F08 \xB7 \u516D\u5927\u9006\u8F6C\u6280\u80FD\u5168\u5F00",
          onClick: () => {
            this.targetMode = "local2p";
            this.navigateTo("skill_select");
          }
        }
      );
      this.registerButton(
        ctx,
        "btn_mode_online",
        cardX,
        340,
        cardW,
        72,
        "\u{1F310} \u597D\u53CB\u623F\u8054\u673A\u5BF9\u6218",
        {
          bg: "#059669",
          color: "#f8fafc",
          fontSize: 18,
          subLabel: "6\u4F4D\u623F\u95F4\u53F7\u9080\u597D\u53CB \xB7 \u4E91\u7AEF\u9632\u4F5C\u5F0A\u540C\u6B65",
          onClick: () => {
            this.targetMode = "online";
            this.navigateTo("online_room");
          }
        }
      );
      ctx.fillStyle = "#64748b";
      ctx.font = "12px -apple-system, sans-serif";
      ctx.fillText(
        `\u9996\u901A\u5956\u52B1\uFF1A${stageCfg.rewardTitle}\uFF08\u5171 ${STAGES_CONFIG.length} \u5173\u53EF\u81EA\u7531\u6311\u6218\uFF09`,
        w / 2,
        445
      );
    }
    /**
     * 页面 3：选技能页（6 选 3，每个技能一句话说明+消耗；有关卡锁定时置灰显示解锁条件）
     */
    renderSkillSelectPage(ctx, w, h) {
      this.registerButton(ctx, "btn_back_mode", 16, 16, 72, 34, "\u2190 \u8FD4\u56DE", {
        bg: "#334155",
        color: "#f8fafc",
        fontSize: 13,
        onClick: () => this.navigateTo("mode_select")
      });
      const maxSlots = this.targetMode === "ai" ? getStageConfig(this.selectedStageId).playerSkillSlots : MAX_EQUIPPED_SKILLS;
      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 20px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`\u9009\u62E9\u643A\u5E26\u6280\u80FD (\u5DF2\u9009 ${this.progress.equippedSkills.length}/${maxSlots})`, w / 2, 36);
      const cardW = Math.min(w - 32, 340);
      const cardX = (w - cardW) / 2;
      let startY = 64;
      const itemH = Math.min(68, Math.floor((h - 155) / 6) - 6);
      for (const skillId of ALL_SKILL_IDS) {
        const cfg = SKILLS_CONFIG[skillId];
        const isUnlocked = this.progress.unlockedSkills.includes(skillId) || this.progress.maxClearedStage >= cfg.unlockStage;
        const isEquipped = this.progress.equippedSkills.includes(skillId);
        const subText = isUnlocked ? cfg.shortDesc : `\u{1F512} \u901A\u5173\u7B2C ${cfg.unlockStage} \u5173\u89E3\u9501\uFF08${cfg.shortDesc}\uFF09`;
        this.registerButton(
          ctx,
          `skill_item_${skillId}`,
          cardX,
          startY,
          cardW,
          itemH,
          `${isEquipped ? "\u2705 " : ""}${cfg.name}  [\u6D88\u8017 ${cfg.cost} \u80FD\u91CF]`,
          {
            bg: !isUnlocked ? "#1e293b" : isEquipped ? "#065f46" : "#334155",
            border: isEquipped ? "#34d399" : "#475569",
            color: !isUnlocked ? "#64748b" : "#f8fafc",
            fontSize: 14,
            subLabel: subText,
            onClick: () => this.toggleSkillEquip(skillId)
          }
        );
        startY += itemH + 8;
      }
      this.registerButton(
        ctx,
        "btn_confirm_start_match",
        cardX,
        h - 68,
        cardW,
        48,
        "\u{1F525} \u786E\u8BA4\u6280\u80FD \xB7 \u7ACB\u5373\u5F00\u5C40",
        {
          bg: "#eab308",
          color: "#0f172a",
          fontSize: 17,
          onClick: () => this.startMatch(this.targetMode, this.selectedStageId)
        }
      );
    }
    /**
     * 页面 4：对局页（棋盘、双方头像/子数、能量条、3 个技能按钮、回合提示、认输/重开）
     */
    renderMatchPage(ctx, w, h, nowMs) {
      const state = this.gameState;
      const counts = countPieces(state.board);
      const bPlayer = state.players[1 /* Black */];
      const wPlayer = state.players[2 /* White */];
      this.registerButton(ctx, "btn_match_exit", 12, 12, 64, 30, "\u2190 \u9000\u51FA", {
        bg: "#334155",
        color: "#f8fafc",
        fontSize: 12,
        onClick: () => this.navigateTo("mode_select")
      });
      this.registerButton(
        ctx,
        "btn_match_restart",
        w - 144,
        12,
        62,
        30,
        "\u91CD\u5F00",
        {
          bg: "#334155",
          color: "#f8fafc",
          fontSize: 12,
          onClick: () => this.startMatch(state.mode, this.selectedStageId)
        }
      );
      this.registerButton(
        ctx,
        "btn_match_surrender",
        w - 74,
        12,
        62,
        30,
        "\u8BA4\u8F93",
        {
          bg: "#7f1d1d",
          color: "#fecaca",
          fontSize: 12,
          onClick: () => {
            this.gameState = surrenderGame(this.gameState, 1 /* Black */);
            this.anim.consumeEvents(this.gameState.lastEvents);
            this.onGameFinished();
            this.navigateTo("result");
          }
        }
      );
      const panelY = 50;
      const panelW = w - 24;
      ctx.save();
      ctx.fillStyle = "#1e293b";
      this.roundRect(ctx, 12, panelY, panelW, 68, 12);
      ctx.fill();
      ctx.fillStyle = state.currentPlayer === 1 /* Black */ ? "#facc15" : "#cbd5e1";
      ctx.font = "bold 14px -apple-system, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`\u26AB \u9ED1\u65B9: ${counts.black} \u5B50`, 24, panelY + 24);
      ctx.fillStyle = "#38bdf8";
      ctx.font = "12px -apple-system, sans-serif";
      ctx.fillText(
        `\u80FD\u91CF ${bPlayer.energy}/${ENERGY_CONFIG.maxEnergy}`,
        24,
        panelY + 46
      );
      const whiteLabel = state.mode === "ai" ? `\u26AA AI(${getStageConfig(this.selectedStageId).aiLevel}): ${counts.white} \u5B50` : `\u26AA \u767D\u65B9: ${counts.white} \u5B50`;
      ctx.fillStyle = state.currentPlayer === 2 /* White */ ? "#facc15" : "#cbd5e1";
      ctx.font = "bold 14px -apple-system, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(whiteLabel, w - 24, panelY + 24);
      ctx.fillStyle = "#38bdf8";
      ctx.font = "12px -apple-system, sans-serif";
      ctx.fillText(
        `\u80FD\u91CF ${wPlayer.energy}/${ENERGY_CONFIG.maxEnergy}`,
        w - 24,
        panelY + 46
      );
      ctx.textAlign = "center";
      ctx.fillStyle = "#fef08a";
      ctx.font = "bold 14px -apple-system, sans-serif";
      const turnText = state.isGameOver ? "\u{1F3C1} \u5BF9\u5C40\u7ED3\u675F" : state.currentPlayer === 1 /* Black */ ? "\u{1F449} \u9ED1\u65B9\u601D\u8003\u4E2D" : "\u{1F449} \u767D\u65B9\u601D\u8003\u4E2D";
      ctx.fillText(turnText, w / 2, panelY + 34);
      ctx.restore();
      const rect = computeBoardRect(w, h);
      ctx.save();
      ctx.fillStyle = "#065f46";
      this.roundRect(ctx, rect.x - 6, rect.y - 6, rect.size + 12, rect.size + 12, 10);
      ctx.fill();
      ctx.strokeStyle = "#047857";
      ctx.lineWidth = 3;
      ctx.stroke();
      const activePlayer = state.currentPlayer;
      const validMoves = getValidMoves(state.board, activePlayer, state.shielded);
      const validSet = new Set(validMoves.map((m) => `${m.row},${m.col}`));
      const skillTargetList = state.selectedSkill ? getSkillTargets(state, activePlayer, state.selectedSkill.skillId) : [];
      const skillTargetSet = new Set(
        skillTargetList.map((t) => `${t.row},${t.col}`)
      );
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const cx = rect.x + c * rect.cellSize;
          const cy = rect.y + r * rect.cellSize;
          ctx.fillStyle = (r + c) % 2 === 0 ? "#047857" : "#065f46";
          ctx.fillRect(cx, cy, rect.cellSize, rect.cellSize);
          ctx.strokeStyle = "rgba(255,255,255,0.12)";
          ctx.lineWidth = 1;
          ctx.strokeRect(cx, cy, rect.cellSize, rect.cellSize);
          const key = `${r},${c}`;
          const center = boardCoordToPixelCenter(r, c, rect);
          const piece = state.board[r][c];
          if (skillTargetSet.has(key)) {
            ctx.beginPath();
            ctx.arc(center.cx, center.cy, rect.cellSize * 0.42, 0, Math.PI * 2);
            ctx.strokeStyle = "#facc15";
            ctx.lineWidth = 2.5;
            ctx.stroke();
          } else if (piece === 0 /* Empty */ && validSet.has(key)) {
            ctx.beginPath();
            ctx.arc(center.cx, center.cy, rect.cellSize * 0.14, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(167, 243, 208, 0.65)";
            ctx.fill();
          }
          if (piece !== 0 /* Empty */) {
            const flipAnim = this.anim.getPieceFlipState(r, c, piece, nowMs);
            const radius = rect.cellSize * 0.38;
            ctx.save();
            ctx.translate(center.cx, center.cy);
            ctx.scale(flipAnim.scaleX, 1);
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fillStyle = flipAnim.displayColor === 1 /* Black */ ? "#0f172a" : "#f8fafc";
            ctx.fill();
            ctx.strokeStyle = flipAnim.displayColor === 1 /* Black */ ? "#475569" : "#cbd5e1";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            if (state.shielded[r][c]) {
              ctx.beginPath();
              ctx.arc(0, 0, radius + 3, 0, Math.PI * 2);
              ctx.strokeStyle = "#facc15";
              ctx.lineWidth = 3;
              ctx.stroke();
            }
            ctx.restore();
          }
        }
      }
      for (const bomb of this.anim.bombExplosions) {
        const progress = Math.min(
          1,
          Math.max(0, (nowMs - bomb.startTimeMs) / bomb.durationMs)
        );
        const centerPx = boardCoordToPixelCenter(
          bomb.center.row,
          bomb.center.col,
          rect
        );
        ctx.save();
        ctx.strokeStyle = `rgba(249, 115, 22, ${1 - progress})`;
        ctx.lineWidth = 5 * (1 - progress * 0.5);
        ctx.beginPath();
        ctx.arc(
          centerPx.cx,
          centerPx.cy,
          rect.cellSize * (0.3 + progress * 1.4),
          0,
          Math.PI * 2
        );
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
      const activePState = state.players[activePlayer];
      const skills = activePState.equippedSkills.slice(0, 3);
      const btnY = rect.y + rect.size + 18;
      const gap = 10;
      const btnW = Math.floor((w - 24 - gap * 2) / 3);
      skills.forEach((skillId, idx) => {
        const cfg = SKILLS_CONFIG[skillId];
        const check = canUseSkill(state, activePlayer, skillId);
        const isSelected = state.selectedSkill?.skillId === skillId;
        const bx = 12 + idx * (btnW + gap);
        this.registerButton(
          ctx,
          `match_skill_${skillId}`,
          bx,
          btnY,
          btnW,
          54,
          `${cfg.name} (${cfg.cost})`,
          {
            bg: isSelected ? "#eab308" : "#1e293b",
            border: isSelected ? "#fef08a" : "#38bdf8",
            color: isSelected ? "#0f172a" : "#f8fafc",
            fontSize: 13,
            subLabel: check.usable ? isSelected ? "\u70B9\u51FB\u53D6\u6D88" : "\u70B9\u51FB\u53D1\u52A8" : check.reason ?? "\u4E0D\u53EF\u7528",
            disabled: !check.usable && !isSelected,
            onClick: () => this.handleSkillButtonClick(skillId)
          }
        );
      });
      if (!state.isGameOver && validMoves.length === 0) {
        this.registerButton(
          ctx,
          "btn_match_pass",
          (w - 180) / 2,
          btnY + 64,
          180,
          40,
          "\u23ED\uFE0F \u65E0\u5B50\u53EF\u4E0B \xB7 \u8DF3\u8FC7\u56DE\u5408",
          {
            bg: "#f59e0b",
            color: "#0f172a",
            fontSize: 14,
            onClick: () => {
              const pRes = passTurn(this.gameState);
              if (pRes.ok) {
                this.gameState = pRes.state;
                this.anim.consumeEvents(this.gameState.lastEvents);
                this.checkPostTurnFlow();
              }
            }
          }
        );
      }
      if (state.pendingWaitRequest) {
        this.registerButton(
          ctx,
          "btn_wait_approve",
          w / 2 - 110,
          btnY + 64,
          100,
          38,
          "\u2705 \u540C\u610F\u7B49TA",
          {
            bg: "#10b981",
            color: "#0f172a",
            fontSize: 13,
            onClick: () => {
              const r = respondToWaitSkill(this.gameState, true);
              if (r.ok) {
                this.gameState = r.state;
                this.anim.consumeEvents(this.gameState.lastEvents);
              }
            }
          }
        );
        this.registerButton(
          ctx,
          "btn_wait_reject",
          w / 2 + 10,
          btnY + 64,
          100,
          38,
          "\u274C \u62D2\u7EDD\u8BF7\u6C42",
          {
            bg: "#ef4444",
            color: "#f8fafc",
            fontSize: 13,
            onClick: () => {
              const r = respondToWaitSkill(this.gameState, false);
              if (r.ok) {
                this.gameState = r.state;
                this.anim.consumeEvents(this.gameState.lastEvents);
              }
            }
          }
        );
      }
      if (state.isGameOver) {
        this.registerButton(
          ctx,
          "btn_goto_result",
          (w - 220) / 2,
          btnY + 64,
          220,
          44,
          "\u{1F3C6} \u67E5\u770B\u7EC8\u5C40\u7ED3\u7B97 & \u6700\u5927\u7FFB\u76D8\u6B65",
          {
            bg: "#eab308",
            color: "#0f172a",
            fontSize: 15,
            onClick: () => this.navigateTo("result")
          }
        );
      }
    }
    /**
     * 页面 5：好友房（创建房 6 位房间号+复制/分享按钮、加入房、等待页双方头像/技能预览/准备状态）
     */
    renderOnlineRoomPage(ctx, w, h) {
      this.registerButton(ctx, "btn_back_mode_from_room", 16, 16, 72, 34, "\u2190 \u8FD4\u56DE", {
        bg: "#334155",
        color: "#f8fafc",
        fontSize: 13,
        onClick: () => this.navigateTo("mode_select")
      });
      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 22px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("\u597D\u53CB\u623F\u8054\u673A\u5BF9\u6218", w / 2, 38);
      const cardW = Math.min(w - 40, 320);
      const cardX = (w - cardW) / 2;
      if (!this.currentRoom) {
        this.registerButton(
          ctx,
          "btn_create_room",
          cardX,
          90,
          cardW,
          56,
          "\u{1F3E0} \u521B\u5EFA 6 \u4F4D\u597D\u53CB\u623F",
          {
            bg: "#10b981",
            color: "#0f172a",
            fontSize: 17,
            subLabel: "\u751F\u6210 6 \u4F4D\u623F\u95F4\u53F7\u5E76\u5206\u4EAB\u7ED9\u5FAE\u4FE1\u597D\u53CB",
            onClick: async () => {
              const res = await this.onlineClient.createRoom(
                this.progress.equippedSkills
              );
              if (res.ok && res.data) {
                this.currentRoom = res.data;
                this.inputRoomCode = res.data.roomId;
                this.anim.showToast(`\u623F\u95F4\u521B\u5EFA\u6210\u529F\uFF1A${res.data.roomId}`);
              }
            }
          }
        );
        this.registerButton(
          ctx,
          "btn_join_room",
          cardX,
          170,
          cardW,
          56,
          `\u{1F511} \u8F93\u5165\u623F\u95F4\u53F7\u52A0\u5165 ${this.inputRoomCode ? `(${this.inputRoomCode})` : ""}`,
          {
            bg: "#0284c7",
            color: "#f8fafc",
            fontSize: 16,
            subLabel: "\u8F93\u5165\u597D\u53CB\u53D1\u6765\u7684 6 \u4F4D\u6570\u5B57\u623F\u95F4\u53F7",
            onClick: async () => {
              if (!this.inputRoomCode) {
                const created = await this.onlineClient.createRoom(
                  this.progress.equippedSkills
                );
                if (created.ok && created.data) {
                  this.inputRoomCode = created.data.roomId;
                }
              }
              const res = await this.guestSimClient.joinRoom(
                this.inputRoomCode,
                ["bomb", "shield", "wait"]
              );
              if (res.ok && res.data) {
                this.currentRoom = res.data;
                this.startMatch("online");
              } else {
                this.anim.showToast(res.error ?? "\u52A0\u5165\u5931\u8D25");
              }
            }
          }
        );
      } else {
        ctx.fillStyle = "#1e293b";
        this.roundRect(ctx, cardX, 75, cardW, 210, 14);
        ctx.fill();
        ctx.strokeStyle = "#10b981";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "#fef08a";
        ctx.font = "bold 24px -apple-system, sans-serif";
        ctx.fillText(`\u623F\u95F4\u53F7\uFF1A${this.currentRoom.roomId}`, w / 2, 112);
        ctx.fillStyle = "#f8fafc";
        ctx.font = "14px -apple-system, sans-serif";
        ctx.fillText(
          `\u26AB \u623F\u4E3B\uFF1A${this.currentRoom.hostInfo.nickname} [\u5DF2\u51C6\u5907]`,
          w / 2,
          150
        );
        ctx.fillStyle = "#94a3b8";
        ctx.font = "12px -apple-system, sans-serif";
        ctx.fillText(
          `\u643A\u5E26\u6280\u80FD\uFF1A${this.currentRoom.hostInfo.equippedSkills.map((id) => SKILLS_CONFIG[id].name).join(" / ")}`,
          w / 2,
          172
        );
        const guestText = this.currentRoom.guestInfo ? `\u26AA \u623F\u5BA2\uFF1A${this.currentRoom.guestInfo.nickname} [\u5DF2\u51C6\u5907]` : "\u26AA \u623F\u5BA2\uFF1A\u7B49\u5F85\u597D\u53CB\u52A0\u5165\u4E2D...";
        ctx.fillStyle = this.currentRoom.guestInfo ? "#34d399" : "#fbbf24";
        ctx.font = "14px -apple-system, sans-serif";
        ctx.fillText(guestText, w / 2, 212);
        this.registerButton(
          ctx,
          "btn_copy_share_room",
          cardX,
          305,
          cardW,
          48,
          "\u{1F4CB} \u590D\u5236\u623F\u95F4\u53F7 & \u5206\u4EAB\u7ED9\u5FAE\u4FE1\u597D\u53CB",
          {
            bg: "#eab308",
            color: "#0f172a",
            fontSize: 15,
            onClick: () => {
              this.anim.showToast(`\u5DF2\u590D\u5236\u623F\u95F4\u53F7 ${this.currentRoom?.roomId} \u5E76\u5524\u8D77\u5206\u4EAB`);
            }
          }
        );
        this.registerButton(
          ctx,
          "btn_sim_friend_join",
          cardX,
          368,
          cardW,
          48,
          "\u{1F680} \u6A21\u62DF\u597D\u53CB\u52A0\u5165\u5E76\u7ACB\u5373\u5F00\u5C40",
          {
            bg: "#10b981",
            color: "#0f172a",
            fontSize: 15,
            onClick: async () => {
              if (!this.currentRoom)
                return;
              const res = await this.guestSimClient.joinRoom(
                this.currentRoom.roomId,
                ["bomb", "shield", "wait"]
              );
              if (res.ok && res.data) {
                this.currentRoom = res.data;
                this.startMatch("online");
              }
            }
          }
        );
      }
    }
    /**
     * 页面 6：结算页（胜负、子数比分滚动动画、本局最大翻盘步高亮、再来一局/分享战绩）
     */
    renderResultPage(ctx, w, h, nowMs) {
      const counts = countPieces(this.gameState.board);
      const rolled = this.anim.getRolledScores(
        counts.black,
        counts.white,
        nowMs
      );
      const biggest = getBiggestComebackMove(this.gameState);
      const title = this.gameState.winner === 1 /* Black */ ? "\u{1F3C6} \u9ED1\u65B9\u83B7\u80DC \xB7 \u60CA\u5929\u7FFB\u76D8\uFF01" : this.gameState.winner === 2 /* White */ ? "\u26AA \u767D\u65B9\u83B7\u80DC \xB7 \u68CB\u9AD8\u4E00\u7740\uFF01" : "\u{1F91D} \u52BF\u5747\u529B\u654C \xB7 \u5E73\u5C40\u6536\u573A\uFF01";
      ctx.fillStyle = "#facc15";
      ctx.font = "bold 24px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(title, w / 2, h * 0.14);
      const cardW = Math.min(w - 40, 320);
      const cardX = (w - cardW) / 2;
      ctx.fillStyle = "#1e293b";
      this.roundRect(ctx, cardX, h * 0.2, cardW, 100, 14);
      ctx.fill();
      ctx.strokeStyle = "#eab308";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 34px -apple-system, sans-serif";
      ctx.fillText(`\u26AB ${rolled.black}  :  ${rolled.white} \u26AA`, w / 2, h * 0.2 + 54);
      const hlY = h * 0.38;
      ctx.fillStyle = "#064e3b";
      this.roundRect(ctx, cardX, hlY, cardW, 96, 14);
      ctx.fill();
      ctx.strokeStyle = "#34d399";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#6ee7b7";
      ctx.font = "bold 14px -apple-system, sans-serif";
      ctx.fillText("\u{1F525} \u672C\u5C40\u6700\u5927\u7FFB\u76D8\u6B65\u9AD8\u4EAE (MVP Step)", w / 2, hlY + 26);
      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 16px -apple-system, sans-serif";
      if (biggest) {
        ctx.fillText(
          `\u5355\u6B65\u72C2\u7FFB ${biggest.flippedCount} \u5B50\uFF01`,
          w / 2,
          hlY + 52
        );
        ctx.fillStyle = "#cbd5e1";
        ctx.font = "12px -apple-system, sans-serif";
        ctx.fillText(biggest.description, w / 2, hlY + 76);
      } else {
        ctx.fillText("\u672C\u5C40\u65E0\u7FFB\u5B50\u8BB0\u5F55", w / 2, hlY + 56);
      }
      if (this.shareCardNotice) {
        ctx.fillStyle = "#38bdf8";
        ctx.font = "12px -apple-system, sans-serif";
        ctx.fillText(this.shareCardNotice, w / 2, h * 0.57);
      }
      this.registerButton(
        ctx,
        "btn_result_rematch",
        cardX,
        h * 0.62,
        cardW,
        50,
        "\u{1F504} \u518D\u6765\u4E00\u5C40",
        {
          bg: "#eab308",
          color: "#0f172a",
          fontSize: 17,
          onClick: () => this.startMatch(this.gameState.mode, this.selectedStageId)
        }
      );
      this.registerButton(
        ctx,
        "btn_result_share",
        cardX,
        h * 0.71,
        cardW,
        50,
        "\u{1F4E4} \u5206\u4EAB\u7FFB\u76D8\u6218\u7EE9\u7ED9\u597D\u53CB",
        {
          bg: "#10b981",
          color: "#0f172a",
          fontSize: 16,
          onClick: () => {
            this.generateSharePayload();
          }
        }
      );
      this.registerButton(
        ctx,
        "btn_result_home",
        cardX,
        h * 0.8,
        cardW,
        44,
        "\u{1F3E0} \u8FD4\u56DE\u4E3B\u9875",
        {
          bg: "#334155",
          color: "#f8fafc",
          fontSize: 15,
          onClick: () => this.navigateTo("home")
        }
      );
    }
    /**
     * 页面 7：技能图鉴页（6 技能说明 + 能量规则，同时充当新手教程）
     */
    renderCodexPage(ctx, w, h) {
      this.registerButton(ctx, "btn_back_home_from_codex", 16, 16, 72, 34, "\u2190 \u8FD4\u56DE", {
        bg: "#334155",
        color: "#f8fafc",
        fontSize: 13,
        onClick: () => this.navigateTo("home")
      });
      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 20px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("\u6280\u80FD\u56FE\u9274 & \u80FD\u91CF\u89C4\u5219\uFF08\u65B0\u624B\u6307\u5357\uFF09", w / 2, 36);
      const cardW = Math.min(w - 28, 348);
      const cardX = (w - cardW) / 2;
      ctx.fillStyle = "#1e293b";
      this.roundRect(ctx, cardX, 58, cardW, 64, 10);
      ctx.fill();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 13px -apple-system, sans-serif";
      ctx.fillText(
        `\u26A1 \u80FD\u91CF\u89C4\u5219\uFF1A\u6BCF\u56DE\u5408\u521D +${ENERGY_CONFIG.turnStartGain} \uFF5C \u6BCF\u7FFB1\u5B50 +${ENERGY_CONFIG.perFlipGain} (\u5355\u56DE\u5408\u4E0A\u9650 +${ENERGY_CONFIG.maxGainPerTurn})`,
        w / 2,
        80
      );
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "12px -apple-system, sans-serif";
      ctx.fillText(
        `\u603B\u80FD\u91CF\u4E0A\u9650 ${ENERGY_CONFIG.maxEnergy}\uFF1B\u843D\u5B50\u524D\u70B9\u9009\u6280\u80FD\uFF0C\u70B9\u7A7A\u767D\u5904\u53EF\u65E0\u635F\u53D6\u6D88`,
        w / 2,
        104
      );
      let y = 132;
      const boxH = Math.min(76, Math.floor((h - 148) / 6) - 6);
      for (const id of ALL_SKILL_IDS) {
        const cfg = SKILLS_CONFIG[id];
        ctx.fillStyle = "rgba(30, 41, 59, 0.85)";
        this.roundRect(ctx, cardX, y, cardW, boxH, 8);
        ctx.fill();
        ctx.textAlign = "left";
        ctx.fillStyle = "#facc15";
        ctx.font = "bold 13px -apple-system, sans-serif";
        ctx.fillText(
          `\u3010${cfg.name}\u3011 \u6D88\u8017: ${cfg.cost}  ${cfg.maxUsesPerGame ? `(\u9650 ${cfg.maxUsesPerGame} \u6B21/\u5C40)` : ""}`,
          cardX + 12,
          y + 20
        );
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "11px -apple-system, sans-serif";
        ctx.fillText(cfg.shortDesc, cardX + 12, y + 40);
        y += boxH + 6;
      }
    }
  };

  // src/game.ts
  function bootstrapGame() {
    const app = new GameApp();
    const g = globalThis;
    if (g.wx && typeof g.wx.createCanvas === "function") {
      if (g.wx.cloud && typeof g.wx.cloud.init === "function") {
        try {
          g.wx.cloud.init({ traceUser: true });
        } catch {
        }
      }
      const canvas = g.wx.createCanvas();
      const sys = g.wx.getSystemInfoSync ? g.wx.getSystemInfoSync() : { windowWidth: 375, windowHeight: 812, pixelRatio: 2 };
      const dpr = sys.pixelRatio || 2;
      canvas.width = sys.windowWidth * dpr;
      canvas.height = sys.windowHeight * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
      if (typeof g.wx.onTouchStart === "function") {
        g.wx.onTouchStart((res) => {
          const touch = res.touches && res.touches[0];
          if (!touch)
            return;
          app.handlePointerTap(
            touch.clientX,
            touch.clientY,
            sys.windowWidth,
            sys.windowHeight
          );
        });
      }
      const loop = () => {
        if (ctx) {
          app.render(ctx, sys.windowWidth, sys.windowHeight, Date.now());
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      return app;
    }
    if (typeof document !== "undefined") {
      const canvas = document.getElementById("gameCanvas");
      if (canvas) {
        const logicalW = 390;
        const logicalH = 844;
        const dpr = window.devicePixelRatio || 2;
        canvas.width = logicalW * dpr;
        canvas.height = logicalH * dpr;
        canvas.style.width = `${logicalW}px`;
        canvas.style.height = `${logicalH}px`;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.scale(dpr, dpr);
        }
        canvas.addEventListener("pointerdown", (ev) => {
          const rect = canvas.getBoundingClientRect();
          const x = (ev.clientX - rect.left) / rect.width * logicalW;
          const y = (ev.clientY - rect.top) / rect.height * logicalH;
          app.handlePointerTap(x, y, logicalW, logicalH);
        });
        const loop = () => {
          if (ctx) {
            app.render(ctx, logicalW, logicalH, Date.now());
          }
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      }
    }
    return app;
  }
  if (typeof window !== "undefined" || typeof globalThis.wx !== "undefined") {
    bootstrapGame();
  }
})();
