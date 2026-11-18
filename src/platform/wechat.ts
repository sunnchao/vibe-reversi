import { WECHAT_CLOUD_ENV } from '../config/runtime';
import { GameApp } from '../ui/app';
import { countPieces, getBiggestComebackMove } from '../core';
import { drawShareCard } from './sharing';

export interface GameCanvas extends HTMLCanvasElement {
  createImage?: () => HTMLImageElement;
  toTempFilePathSync?: (options: { destWidth: number; destHeight: number; fileType: string }) => string;
  requestAnimationFrame(callback: (timestamp: number) => void): number;
  cancelAnimationFrame(handle: number): void;
}

export interface WindowMetrics {
  windowWidth: number;
  windowHeight: number;
  pixelRatio: number;
  safeArea?: { top: number; bottom: number };
}

export interface WxRuntime {
  createCanvas?: () => GameCanvas;
  createImage?: () => HTMLImageElement;
  getWindowInfo?: () => WindowMetrics;
  getSystemInfoSync?: () => WindowMetrics;
  getMenuButtonBoundingClientRect?: () => { left: number; bottom: number; right: number; top: number };
  getLaunchOptionsSync?: () => { query?: Record<string, unknown> };
  onShow?: (callback: (options: { query?: Record<string, unknown> }) => void) => void;
  onHide?: (callback: () => void) => void;
  onWindowResize?: (callback: () => void) => void;
  onShareAppMessage?: (callback: () => { title: string; query: string; imageUrl?: string }) => void;
  showShareMenu?: (options: { withShareTicket: boolean; menus?: string[] }) => void;
  onTouchStart?: (callback: (event: { touches: Array<{ clientX: number; clientY: number }> }) => void) => void;
  cloud?: { init?: (options: { env: string; traceUser: boolean }) => void };
}

export function initWechatCloud(wx: WxRuntime): void {
  if (WECHAT_CLOUD_ENV && wx.cloud?.init) {
    wx.cloud.init({ env: WECHAT_CLOUD_ENV, traceUser: true });
  }
}

export function attachArtwork(app: GameApp, factory?: () => HTMLImageElement): void {
  const image = factory ? factory() : typeof Image !== 'undefined' ? new Image() : null;
  if (!image) return;
  image.onload = () => app.setHeroImage(image);
  image.src = '/assets/reversi-table.jpg';
}

export function attachShareCard(app: GameApp, factory: () => GameCanvas): void {
  app.shareImageProvider = (kind) => {
    try {
      const canvas = factory();
      canvas.width = 500;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      if (!ctx || !canvas.toTempFilePathSync) return undefined;
      const counts = countPieces(app.gameState.board);
      drawShareCard(ctx, {
        ...counts,
        roomId: kind === 'invite' ? app.currentRoom?.roomId : undefined,
        maxFlip: getBiggestComebackMove(app.gameState)?.flippedCount ?? 0,
        board: app.gameState.board,
      });
      return canvas.toTempFilePathSync({ destWidth: 500, destHeight: 400, fileType: 'png' });
    } catch { return undefined; }
  };
}
