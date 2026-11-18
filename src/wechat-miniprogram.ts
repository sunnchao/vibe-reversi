import { GameApp } from './ui/app';
import { attachArtwork, attachShareCard, GameCanvas, WxRuntime } from './platform/wechat';

declare const Page: (config: Record<string, unknown>) => void;
declare const getApp: () => { globalData: { game: GameApp | null; query: Record<string, unknown> } };
declare const wx: WxRuntime & {
  createSelectorQuery(): {
    in(page: MiniPage): {
      select(selector: string): {
        fields(options: { node: boolean; size: boolean; rect: boolean }): {
          exec(callback: (results: Array<{ node: GameCanvas; width: number; height: number; top: number; left: number }>) => void): void;
        };
      };
    };
  };
};

interface MiniPage {
  game?: GameApp;
  canvas?: GameCanvas;
  frame?: number;
  width: number;
  height: number;
  left: number;
  top: number;
  sharingKey?: string;
  setData(data: Record<string, unknown>): void;
  startLoop(): void;
}

const miniApp = getApp();

Page({
  data: { canShare: false },
  onLoad(options: Record<string, unknown>) { miniApp.globalData.query = options; },
  onReady(this: MiniPage) {
    wx.createSelectorQuery().in(this).select('#gameCanvas')
      .fields({ node: true, size: true, rect: true }).exec((results) => {
        const result = results[0];
        if (!result?.node) return;
        this.canvas = result.node;
        this.width = result.width;
        this.height = result.height;
        this.left = result.left;
        this.top = result.top;
        const dpr = wx.getWindowInfo?.().pixelRatio ?? 2;
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.game = new GameApp();
        const menuRect = wx.getMenuButtonBoundingClientRect?.();
        this.game.setNativeMenuRect(menuRect ? { left: menuRect.left, bottom: menuRect.bottom } : null);
        miniApp.globalData.game = this.game;
        attachArtwork(this.game, this.canvas.createImage?.bind(this.canvas) ?? wx.createImage?.bind(wx));
        if (wx.createCanvas) attachShareCard(this.game, () => wx.createCanvas!() as GameCanvas);
        wx.showShareMenu?.({ withShareTicket: true, menus: ['shareAppMessage'] });
        void this.game.onForeground(miniApp.globalData.query);
        this.startLoop();
      });
  },
  startLoop(this: MiniPage) {
    if (!this.canvas || !this.game || this.frame) return;
    const loop = () => {
      if (!this.canvas || !this.game) return;
      const ctx = this.canvas.getContext('2d');
      if (ctx && this.game.visible) this.game.render(ctx, this.width, this.height);
      const canShare = this.game.currentPage === 'online_room' && !!this.game.currentRoom || this.game.currentPage === 'result';
      const key = String(canShare);
      if (key !== this.sharingKey) {
        this.setData({ canShare });
        this.sharingKey = key;
      }
      this.frame = this.canvas.requestAnimationFrame(loop);
    };
    this.frame = this.canvas.requestAnimationFrame(loop);
  },
  onCanvasTap(this: MiniPage, event: { touches: Array<{ clientX?: number; clientY?: number; x: number; y: number }> }) {
    const touch = event.touches[0];
    if (!touch) return;
    this.game?.handlePointerTap(
      touch.clientX === undefined ? touch.x : touch.clientX - this.left,
      touch.clientY === undefined ? touch.y : touch.clientY - this.top,
      this.width, this.height
    );
  },
  onShow(this: MiniPage) {
    if (this.game) { void this.game.onForeground(); this.startLoop(); }
  },
  onHide(this: MiniPage) {
    this.game?.onBackground();
    if (this.frame) this.canvas?.cancelAnimationFrame(this.frame);
    this.frame = undefined;
  },
  onUnload(this: MiniPage) {
    this.game?.dispose();
    if (this.frame) this.canvas?.cancelAnimationFrame(this.frame);
    miniApp.globalData.game = null;
    this.game = undefined;
  },
  onShareAppMessage(this: MiniPage) {
    const payload = this.game?.getSharePayload() ?? { title: '翻盘棋', query: 'from=share' };
    return { title: payload.title, imageUrl: payload.imageUrl, path: `/pages/index/index?${payload.query}` };
  },
});
