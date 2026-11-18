import { getBrowserShareOrigin } from '../config/runtime';

export interface SharePayload {
  title: string;
  query: string;
  imageUrl?: string;
}

export function browserInviteUrl(query: string): string {
  const origin = getBrowserShareOrigin();
  if (!/^https?:\/\//.test(origin)) return '';
  return `${origin}/preview.html?${query}`;
}

export async function sharePayload(payload: SharePayload): Promise<'native' | 'copied' | 'menu' | 'cancelled' | 'unavailable'> {
  const g = globalThis as unknown as {
    wx?: {
      shareAppMessage?: (payload: SharePayload) => void;
      showShareMenu?: (options: { withShareTicket: boolean }) => void;
    };
    navigator?: Navigator;
  };
  if (g.wx?.shareAppMessage) {
    g.wx.shareAppMessage(payload);
    return 'native';
  }
  if (g.wx?.showShareMenu) {
    g.wx.showShareMenu({ withShareTicket: true });
    return 'menu';
  }
  const url = browserInviteUrl(payload.query);
  if (!url) return 'unavailable';
  if (g.navigator?.share) {
    try {
      await g.navigator.share({ title: '翻盘棋', text: payload.title, url });
      return 'native';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
    }
  }
  if (g.navigator?.clipboard?.writeText) {
    try {
      await g.navigator.clipboard.writeText(`${payload.title}\n${url}`);
      return 'copied';
    } catch {
      // LAN preview pages are often served over HTTP, where Clipboard API is unavailable.
    }
  }
  if (typeof window !== 'undefined' && window.prompt) {
    const copied = window.prompt('复制邀请链接，发给微信好友：', url);
    return copied === null ? 'cancelled' : 'copied';
  }
  return 'unavailable';
}

export function drawShareCard(ctx: CanvasRenderingContext2D, data: { roomId?: string; black: number; white: number; maxFlip: number; board?: number[][] }): void {
  ctx.fillStyle = '#e9e3d4';
  ctx.fillRect(0, 0, 500, 400);
  ctx.fillStyle = '#b94d35';
  ctx.fillRect(0, 0, 500, 7);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#1d2b25';
  ctx.font = 'bold 38px "Songti SC", serif';
  ctx.fillText('翻盘棋', 32, 64);
  ctx.fillStyle = '#69756b';
  ctx.font = '16px sans-serif';
  ctx.fillText(data.roomId ? '棋桌已备好，就等你来。' : '黑白之间，再下一局。', 32, 95);
  ctx.fillStyle = '#244d3e';
  ctx.fillRect(30, 117, 440, 233);
  if (data.roomId) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8d3a6';
    ctx.font = '17px sans-serif';
    ctx.fillText('好友房间号', 250, 170);
    ctx.fillStyle = '#fffaf0';
    ctx.font = 'bold 62px "Songti SC", serif';
    ctx.fillText(data.roomId, 250, 247);
    ctx.font = '17px sans-serif';
    ctx.fillText('点开邀请，直接入座', 250, 302);
  } else {
    const board = data.board;
    const cell = 23;
    if (board) {
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const x = 49 + c * cell;
        const y = 139 + r * cell;
        ctx.strokeStyle = 'rgba(255,250,240,0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cell, cell);
        if (board[r][c]) {
          ctx.beginPath();
          ctx.arc(x + cell / 2, y + cell / 2, 8.8, 0, Math.PI * 2);
          ctx.fillStyle = board[r][c] === 1 ? '#17231f' : '#f5f0e4';
          ctx.fill();
        }
      }
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fffaf0';
    ctx.font = 'bold 39px "Songti SC", serif';
    ctx.fillText(`${data.black} : ${data.white}`, 354, 214);
    ctx.fillStyle = '#e8d3a6';
    ctx.font = '17px sans-serif';
    ctx.fillText(`一手最多翻 ${data.maxFlip} 子`, 354, 261);
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#69756b';
  ctx.font = '14px sans-serif';
  ctx.fillText('同桌对弈 · 好友联机 · 六种逆转招式', 250, 380);
}
