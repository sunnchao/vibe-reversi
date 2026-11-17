/**
 * 表现层三大核心动画控制器（消费 core 层输出的 GameEvent，UI 不自己算规则）
 * 严格遵循清单第 4 节：
 * 动画只做三处（多了拖工期）：
 * 1. 翻子翻转动画（FlipAnimation：3D 水平缩放 scaleX 从 1 -> 0 -> 1 变色，逐子错开延迟）
 * 2. 炸弹子爆炸帧（BombExplosionAnimation：十字激波扩散 + 火花粒子帧）
 * 3. 终局子数滚动结算（ResultRollAnimation：比分从 0 滚动递增到最终子数）
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

export class AnimationManager {
  public flipItems: FlipAnimItem[] = [];
  public bombExplosions: BombExplosionAnim[] = [];
  public scoreRoll: ScoreRollAnim | null = null;
  public toastMessage: { text: string; expireAt: number } | null = null;

  /**
   * 消费 core 引擎产生的结构化事件列表并创建对应动画
   */
  consumeEvents(events: GameEvent[], nowMs = Date.now()): void {
    for (const ev of events) {
      if (ev.type === 'MOVE_PLACED') {
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
          `💥 炸弹子十字爆破 +${ev.bombedPositions.length} 子！`,
          nowMs,
          1800
        );
      } else if (ev.type === 'PIECE_STOLEN') {
        const fromColor = ev.player === Piece.Black ? Piece.White : Piece.Black;
        this.flipItems.push({
          row: ev.position.row,
          col: ev.position.col,
          fromColor,
          toColor: ev.player,
          startTimeMs: nowMs,
          durationMs: 360,
        });
        this.showToast('☯️ 偷天换日！敌子直接易帜', nowMs, 1800);
      } else if (ev.type === 'SHIELD_APPLIED') {
        this.showToast('🛡️ 金身护体！此子永不可被翻', nowMs, 1600);
      } else if (ev.type === 'DOUBLE_STEP_1_DONE') {
        this.showToast('⚡ 连落双子：请继续落第 2 子！', nowMs, 2000);
      } else if (ev.type === 'DOUBLE_STEP_2_REFUNDED') {
        this.showToast(
          `⚡ 次子无合法点，自动退还 +${ev.refundEnergy} 能量`,
          nowMs,
          2200
        );
      } else if (ev.type === 'TURN_PASSED') {
        const who = ev.player === Piece.Black ? '黑方' : '白方';
        if (ev.reason === 'NO_VALID_MOVE') {
          this.showToast(`⚠️ ${who}无合法落子，自动跳过回合`, nowMs, 1800);
        } else {
          this.showToast(`⏳ ${who}发动【求你等我】换取 +20 能量`, nowMs, 1800);
        }
      } else if (ev.type === 'UNDO_PERFORMED') {
        this.showToast('⏪ 悔棋时光：已回溯至上一回合', nowMs, 1800);
      } else if (ev.type === 'GAME_OVER') {
        this.startScoreRoll(ev.blackCount, ev.whiteCount, nowMs);
      }
    }
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
    if (this.toastMessage && nowMs > this.toastMessage.expireAt) {
      this.toastMessage = null;
    }
  }
}
