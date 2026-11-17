/**
 * 《技能黑白棋 · 翻盘棋》微信小游戏 & H5 Canvas 2D 统一启动入口
 * - 在微信小游戏环境中自动调用 wx.createCanvas() 与 wx.onTouchStart()
 * - 在浏览器/预览环境中自动挂载 #gameCanvas 与 pointerdown 事件
 */

import { GameApp } from './ui';

interface WxMiniGameGlobal {
  wx?: {
    createCanvas?: () => HTMLCanvasElement;
    getSystemInfoSync?: () => { windowWidth: number; windowHeight: number; pixelRatio: number };
    onTouchStart?: (
      cb: (res: { touches: Array<{ clientX: number; clientY: number }> }) => void
    ) => void;
    cloud?: {
      init?: (opts: { traceUser: boolean }) => void;
    };
  };
}

export function bootstrapGame(): GameApp {
  const app = new GameApp();
  const g = globalThis as unknown as WxMiniGameGlobal;

  if (g.wx && typeof g.wx.createCanvas === 'function') {
    if (g.wx.cloud && typeof g.wx.cloud.init === 'function') {
      try {
        g.wx.cloud.init({ traceUser: true });
      } catch {
        // ignore if cloud env not configured yet
      }
    }

    const canvas = g.wx.createCanvas();
    const sys = g.wx.getSystemInfoSync
      ? g.wx.getSystemInfoSync()
      : { windowWidth: 375, windowHeight: 812, pixelRatio: 2 };

    const dpr = sys.pixelRatio || 2;
    canvas.width = sys.windowWidth * dpr;
    canvas.height = sys.windowHeight * dpr;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }

    if (typeof g.wx.onTouchStart === 'function') {
      g.wx.onTouchStart((res) => {
        const touch = res.touches && res.touches[0];
        if (!touch) return;
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

  // 浏览器 DOM 环境（用于 preview.html 直接打开预览与调试）
  if (typeof document !== 'undefined') {
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement | null;
    if (canvas) {
      const logicalW = 390;
      const logicalH = 844;
      const dpr = window.devicePixelRatio || 2;
      canvas.width = logicalW * dpr;
      canvas.height = logicalH * dpr;
      canvas.style.width = `${logicalW}px`;
      canvas.style.height = `${logicalH}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }

      canvas.addEventListener('pointerdown', (ev) => {
        const rect = canvas.getBoundingClientRect();
        const x = ((ev.clientX - rect.left) / rect.width) * logicalW;
        const y = ((ev.clientY - rect.top) / rect.height) * logicalH;
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

// 若在微信小游戏或浏览器中直接加载脚本，则自动启动
if (typeof window !== 'undefined' || typeof (globalThis as WxMiniGameGlobal).wx !== 'undefined') {
  bootstrapGame();
}
