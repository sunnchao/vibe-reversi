/**
 * 《技能黑白棋 · 翻盘棋》微信小游戏 & H5 Canvas 2D 统一启动入口
 * - 在微信小游戏环境中自动调用 wx.createCanvas() 与 wx.onTouchStart()
 * - 在浏览器/预览环境中自动挂载 #gameCanvas 与 pointerdown 事件
 */

import { GameApp } from './ui';
import { setBrowserShareOrigin } from './config/runtime';
import { attachArtwork, attachShareCard, GameCanvas, WindowMetrics, WxRuntime, initWechatCloud } from './platform/wechat';

interface WxMiniGameGlobal {
  wx?: WxRuntime & {
    getSystemInfoSync?: () => WindowMetrics;
    getWindowInfo?: () => WindowMetrics;
    getMenuButtonBoundingClientRect?: () => { bottom: number };
    onTouchStart?: (cb: (res: { touches: Array<{ clientX: number; clientY: number }> }) => void) => void;
    onWindowResize?: (callback: () => void) => void;
  };
}

export function bootstrapGame(): GameApp {
  const app = new GameApp();
  const g = globalThis as unknown as WxMiniGameGlobal;

  if (g.wx && typeof g.wx.createCanvas === 'function') {
    initWechatCloud(g.wx);
    const canvas = g.wx.createCanvas() as GameCanvas;
    const metrics = () => g.wx?.getWindowInfo?.() ?? g.wx?.getSystemInfoSync?.() ??
      { windowWidth: 375, windowHeight: 812, pixelRatio: 2 };
    let sys = metrics();
    const ctx = canvas.getContext('2d');
    const resize = () => {
      sys = metrics();
      const ratio = sys.pixelRatio || 2;
      canvas.width = sys.windowWidth * ratio;
      canvas.height = sys.windowHeight * ratio;
      ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
      app.pointerPosition = null;
    };
    resize();
    g.wx.onWindowResize?.(resize);
    attachArtwork(app, canvas.createImage?.bind(canvas) ?? g.wx.createImage?.bind(g.wx));
    attachShareCard(app, () => g.wx!.createCanvas!() as GameCanvas);
    const menuRect = g.wx.getMenuButtonBoundingClientRect?.();
    app.setNativeMenuRect(menuRect ? { left: menuRect.left, bottom: menuRect.bottom } : null);
    void app.onForeground(g.wx.getLaunchOptionsSync?.().query);
    g.wx.onShow?.((options) => { void app.onForeground(options.query); });
    g.wx.onHide?.(() => app.onBackground());
    g.wx.onShareAppMessage?.(() => app.getSharePayload());
    g.wx.showShareMenu?.({ withShareTicket: true, menus: ['shareAppMessage'] });

    if (typeof g.wx.onTouchStart === 'function') {
      g.wx.onTouchStart((res) => {
        const touch = res.touches && res.touches[0];
        if (!touch) return;
        app.handlePointerTap(
          touch.clientX,
          touch.clientY,
          sys.windowWidth,
          sys.windowHeight,
          true
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
      attachArtwork(app);
      let logicalW = 390;
      let logicalH = 844;
      const ctx = canvas.getContext('2d');
      const resizeCanvas = () => {
        logicalW = Math.min(390, Math.max(280, Math.floor(window.innerWidth - 36)));
        logicalH = Math.min(844, Math.max(500, Math.floor(window.innerHeight - 36)));
        const dpr = window.devicePixelRatio || 2;
        canvas.width = logicalW * dpr;
        canvas.height = logicalH * dpr;
        canvas.style.width = `${logicalW}px`;
        canvas.style.height = `${logicalH}px`;
        ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
        app.pointerPosition = null;
      };
      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);
      const query = Object.fromEntries(new URLSearchParams(window.location.search).entries());
      void app.onForeground(query);
      void fetch('/api/config')
        .then((response) => response.ok ? response.json() : null)
        .then((config: { shareOrigin?: string } | null) => setBrowserShareOrigin(config?.shareOrigin ?? ''))
        .catch(() => {});
      const heartbeat = window.setInterval(() => {
        if (app.currentRoom?.status === 'waiting') void app.onForeground();
      }, 5000);
      window.addEventListener('pagehide', () => {
        window.clearInterval(heartbeat);
        app.onBackground();
      });
      window.addEventListener('pageshow', () => { void app.onForeground(); });

      canvas.addEventListener('pointerdown', (ev) => {
        const rect = canvas.getBoundingClientRect();
        const x = ((ev.clientX - rect.left) / rect.width) * logicalW;
        const y = ((ev.clientY - rect.top) / rect.height) * logicalH;
        app.handlePointerTap(x, y, logicalW, logicalH);
      });
      canvas.addEventListener('pointermove', (ev) => {
        if (ev.pointerType === 'touch') return;
        const rect = canvas.getBoundingClientRect();
        app.handlePointerMove(
          ((ev.clientX - rect.left) / rect.width) * logicalW,
          ((ev.clientY - rect.top) / rect.height) * logicalH
        );
      });
      canvas.addEventListener('pointerleave', () => { app.pointerPosition = null; });
      canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
      window.addEventListener('keydown', (ev) => {
        if (app.handleKeyInput(ev.key)) ev.preventDefault();
      });
      window.addEventListener('paste', (ev) => {
        if (app.currentPage !== 'online_room' || app.currentRoom) return;
        const text = ev.clipboardData?.getData('text') ?? '';
        const digits = text.replace(/\D/g, '');
        if (digits.length === 6) {
          app.inputRoomCode = digits;
          ev.preventDefault();
        }
      });

      const loop = () => {
        if (ctx && app.visible) {
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
