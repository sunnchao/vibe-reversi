/**
 * Event-driven presentation state. All animations are bounded and do not change rules.
 */

import { GameEvent, Piece, PlayerColor, Position } from '../core';

export interface FlipAnimItem {
  row: number;
  col: number;
  fromColor: PlayerColor;
  toColor: PlayerColor;
  startTimeMs: number;
  durationMs: number;
}

export interface BombExplosionAnim {
  center: Position;
  bombedPositions: Position[];
  startTimeMs: number;
  durationMs: number;
}

export interface ScoreRollAnim {
  targetBlack: number;
  targetWhite: number;
  startTimeMs: number;
  durationMs: number;
}

export interface BoardEffect {
  kind: 'place' | 'bomb' | 'shield' | 'steal' | 'double' | 'wait' | 'undo';
  position?: Position;
  startTimeMs: number;
  durationMs: number;
}

export class AnimationManager {
  public flipItems: FlipAnimItem[] = [];
  public bombExplosions: BombExplosionAnim[] = [];
  public scoreRoll: ScoreRollAnim | null = null;
  public toastMessage: { text: string; expireAt: number } | null = null;
  public boardEffects: BoardEffect[] = [];
  public pressedButton: { id: string; until: number } | null = null;

  private effect(kind: BoardEffect['kind'], nowMs: number, position?: Position, durationMs = 620): void {
    this.boardEffects.push({ kind, position, startTimeMs: nowMs, durationMs });
  }

  /**
   * 消费 core 引擎产生的结构化事件列表并创建对应动画
   */
  consumeEvents(events: GameEvent[], nowMs = Date.now()): void {
    for (const ev of events) {
      if (ev.type === 'MOVE_PLACED') {
        this.effect('place', nowMs, ev.position, 380);
        const fromColor = ev.player === Piece.Black ? Piece.White : Piece.Black;
        ev.flipped.forEach((pos, idx) => {
          this.flipItems.push({
            row: pos.row,
            col: pos.col,
            fromColor,
            toColor: ev.player,
            startTimeMs: nowMs + idx * 45,
            durationMs: 280,
          });
        });
      } else if (ev.type === 'BOMB_EXPLODED') {
        this.effect('bomb', nowMs, ev.center, 720);
        const fromColor = ev.player === Piece.Black ? Piece.White : Piece.Black;
        this.bombExplosions.push({
          center: ev.center,
          bombedPositions: ev.bombedPositions,
          startTimeMs: nowMs,
          durationMs: 520,
        });
        ev.bombedPositions.forEach((pos, idx) => {
          this.flipItems.push({
            row: pos.row,
            col: pos.col,
            fromColor,
            toColor: ev.player,
            startTimeMs: nowMs + 120 + idx * 40,
            durationMs: 300,
          });
        });
        this.showToast(
          `炸弹子触发：十字翻转 ${ev.bombedPositions.length} 子`,
          nowMs,
          1800
        );
      } else if (ev.type === 'PIECE_STOLEN') {
        this.effect('steal', nowMs, ev.position);
        const fromColor = ev.player === Piece.Black ? Piece.White : Piece.Black;
        this.flipItems.push({
          row: ev.position.row,
          col: ev.position.col,
          fromColor,
          toColor: ev.player,
          startTimeMs: nowMs,
          durationMs: 360,
        });
        this.showToast('偷天换日：棋子已易色', nowMs, 1800);
      } else if (ev.type === 'SHIELD_APPLIED') {
        this.effect('shield', nowMs, ev.position, 800);
        this.showToast('金身生效：此子本局不可被翻', nowMs, 1600);
      } else if (ev.type === 'DOUBLE_STEP_1_DONE') {
        this.effect('double', nowMs, ev.position);
        this.showToast('连落双子：请落下第二子', nowMs, 2000);
      } else if (ev.type === 'DOUBLE_STEP_2_REFUNDED') {
        this.showToast(
          `次子无合法点，已退还 ${ev.refundEnergy} 能量`,
          nowMs,
          2200
        );
      } else if (ev.type === 'TURN_PASSED') {
        const who = ev.player === Piece.Black ? '黑方' : '白方';
        if (ev.reason === 'NO_VALID_MOVE') {
          this.showToast(`${who}无合法落子，自动跳过`, nowMs, 1800);
        } else {
          this.showToast(`${who}发动「求你等我」，获得能量`, nowMs, 1800);
        }
      } else if (ev.type === 'UNDO_PERFORMED') {
        this.effect('undo', nowMs, undefined, 700);
        this.showToast('悔棋时光：已回到上个回合', nowMs, 1800);
      } else if (ev.type === 'WAIT_RESOLVED' && ev.approved) {
        this.effect('wait', nowMs, undefined, 800);
      } else if (ev.type === 'GAME_OVER') {
        this.startScoreRoll(ev.blackCount, ev.whiteCount, nowMs);
      }
    }
  }

  busyUntil(): number {
    return Math.max(
      0,
      ...this.flipItems.map((item) => item.startTimeMs + item.durationMs),
      ...this.boardEffects.filter((effect) => effect.kind === 'bomb' || effect.kind === 'steal')
        .map((effect) => effect.startTimeMs + effect.durationMs)
    );
  }

  getPlaceScale(row: number, col: number, nowMs: number): number {
    const item = [...this.boardEffects].reverse().find((effect) =>
      effect.kind === 'place' && effect.position?.row === row && effect.position.col === col
    );
    if (!item) return 1;
    const progress = Math.max(0, Math.min(1, (nowMs - item.startTimeMs) / 260));
    const overshoot = 1.7;
    return Math.max(0.12, 1 + (overshoot + 1) * (progress - 1) ** 3 + overshoot * (progress - 1) ** 2);
  }

  showToast(text: string, nowMs = Date.now(), durationMs = 1800): void {
    this.toastMessage = {
      text,
      expireAt: nowMs + durationMs,
    };
  }

  startScoreRoll(
    targetBlack: number,
    targetWhite: number,
    nowMs = Date.now()
  ): void {
    this.scoreRoll = {
      targetBlack,
      targetWhite,
      startTimeMs: nowMs,
      durationMs: 900,
    };
  }

  /**
   * 获取某格棋子当前帧的翻转动画状态（返回横向缩放比例 scaleX 与当前应显示的颜色）
   */
  getPieceFlipState(
    row: number,
    col: number,
    actualColor: PlayerColor,
    nowMs = Date.now()
  ): { scaleX: number; displayColor: PlayerColor; isAnimating: boolean } {
    for (let i = this.flipItems.length - 1; i >= 0; i--) {
      const item = this.flipItems[i];
      if (item.row === row && item.col === col) {
        if (nowMs < item.startTimeMs) {
          return {
            scaleX: 1,
            displayColor: item.fromColor,
            isAnimating: true,
          };
        }
        const elapsed = nowMs - item.startTimeMs;
        if (elapsed <= item.durationMs) {
          const progress = elapsed / item.durationMs; // 0 -> 1
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
  getRolledScores(
    actualBlack: number,
    actualWhite: number,
    nowMs = Date.now()
  ): { black: number; white: number; progress: number } {
    if (!this.scoreRoll) {
      return { black: actualBlack, white: actualWhite, progress: 1 };
    }
    const elapsed = Math.max(0, nowMs - this.scoreRoll.startTimeMs);
    const progress = Math.min(1, elapsed / this.scoreRoll.durationMs);
    // easeOutCubic
    const eased = 1 - Math.pow(1 - progress, 3);
    return {
      black: Math.round(this.scoreRoll.targetBlack * eased),
      white: Math.round(this.scoreRoll.targetWhite * eased),
      progress,
    };
  }

  /**
   * 清理已结束的动画队列
   */
  cleanup(nowMs = Date.now()): void {
    this.flipItems = this.flipItems.filter(
      (item) => nowMs <= item.startTimeMs + item.durationMs
    );
    this.bombExplosions = this.bombExplosions.filter(
      (b) => nowMs <= b.startTimeMs + b.durationMs
    );
    this.boardEffects = this.boardEffects.filter((effect) => nowMs <= effect.startTimeMs + effect.durationMs);
    if (this.pressedButton && nowMs > this.pressedButton.until) this.pressedButton = null;
    if (this.toastMessage && nowMs > this.toastMessage.expireAt) {
      this.toastMessage = null;
    }
  }
}
