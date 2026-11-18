import type { GameApp } from './ui/app';
import { initWechatCloud, WxRuntime } from './platform/wechat';

declare const wx: WxRuntime;
declare const App: (config: Record<string, unknown>) => void;
interface MiniApp {
  globalData: { game: GameApp | null; query: Record<string, unknown> };
}

App({
  globalData: { game: null, query: {} },
  onLaunch() { initWechatCloud(wx); },
  onShow(this: MiniApp, options: { query?: Record<string, unknown> }) {
    this.globalData.query = options.query ?? {};
    if (this.globalData.game) void this.globalData.game.onForeground(this.globalData.query);
  },
  onHide(this: MiniApp) { this.globalData.game?.onBackground(); },
});
