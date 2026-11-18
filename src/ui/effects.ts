import { AnimationManager } from './animations';
import { BoardRect, boardCoordToPixelCenter } from './coord';

export function renderBoardEffects(ctx: CanvasRenderingContext2D, anim: AnimationManager, rect: BoardRect, nowMs: number): void {
  for (const effect of anim.boardEffects) {
    const t = Math.max(0, Math.min(1, (nowMs - effect.startTimeMs) / effect.durationMs));
    const center = effect.position
      ? boardCoordToPixelCenter(effect.position.row, effect.position.col, rect)
      : { cx: rect.x + rect.size / 2, cy: rect.y + rect.size / 2 };
    const cell = rect.cellSize;
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.85;
    ctx.strokeStyle = effect.kind === 'bomb' || effect.kind === 'steal' ? '#d87b4f' : '#e8d3a6';
    ctx.fillStyle = '#e8d3a6';
    ctx.lineWidth = 2 * (1 - t) + 0.5;

    if (effect.kind === 'wait' || effect.kind === 'undo') {
      ctx.fillStyle = '#18362c';
      ctx.fillRect(center.cx - 75, center.cy - 20 - t * 24, 150, 38);
      ctx.fillStyle = '#f5f0e4';
      ctx.font = 'bold 15px "Songti SC", serif';
      ctx.textAlign = 'center';
      ctx.fillText(effect.kind === 'wait' ? '能量 +20' : '回到上一回合', center.cx, center.cy + 4 - t * 24);
    } else {
      ctx.beginPath();
      ctx.arc(center.cx, center.cy, cell * (0.25 + t * (effect.kind === 'bomb' ? 1.8 : 0.7)), 0, Math.PI * 2);
      ctx.stroke();
      if (effect.kind !== 'place') {
        const count = effect.kind === 'bomb' ? 16 : 8;
        for (let i = 0; i < count; i++) {
          const angle = i * Math.PI * 2 / count + (effect.kind === 'steal' ? t * 2.4 : 0);
          const distance = cell * (0.45 + t * 1.35);
          const px = center.cx + Math.cos(angle) * distance;
          const py = center.cy + Math.sin(angle) * distance + t * t * cell * 0.35;
          ctx.fillRect(px, py, 3 * (1 - t) + 1, 3 * (1 - t) + 1);
        }
      }
      if (effect.kind === 'bomb') {
        ctx.beginPath();
        ctx.moveTo(center.cx - cell * t * 1.8, center.cy);
        ctx.lineTo(center.cx + cell * t * 1.8, center.cy);
        ctx.moveTo(center.cx, center.cy - cell * t * 1.8);
        ctx.lineTo(center.cx, center.cy + cell * t * 1.8);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

export function renderCelebration(ctx: CanvasRenderingContext2D, w: number, h: number, startedAt: number, nowMs: number): void {
  const t = (nowMs - startedAt) / 1900;
  if (t < 0 || t > 1) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, (1 - t) * 2);
  const colors = ['#b94d35', '#bb9250', '#244d3e', '#e9e3d4'];
  for (let i = 0; i < 28; i++) {
    const seed = (i * 37 % 29) / 29;
    const x = w * seed + Math.sin(i * 4.2 + t * 5) * 18;
    const y = -30 + (h * 0.68 + i % 4 * 35) * t * t;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(i + t * 4);
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(-2, -4, 4, 8);
    ctx.restore();
  }
  ctx.restore();
}
