import type { IncomingMessage, ServerResponse } from 'node:http';
import { MemoryFriendRoomStore, dispatchFriends } from '../src/friends/rooms';

/** Local/LAN preview only. Production mini-program identity comes from WeChat OPENID. */
export function friendsPreviewMiddleware() {
  const store = new MemoryFriendRoomStore();
  let queue: Promise<unknown> = Promise.resolve();
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url?.split('?')[0] !== '/api/friends') { next(); return; }
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'POST') { send(405, { ok: false, error: '需要 POST 请求' }); return; }
    const actor = req.headers['x-preview-player'];
    if (typeof actor !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(actor)) { send(401, { ok: false, error: '请重新打开预览页面' }); return; }
    const origin = req.headers.origin;
    if (origin) {
      let allowed = false;
      try { allowed = new URL(origin).host === req.headers.host; } catch { /* Invalid origins are refused. */ }
      if (!allowed) { send(403, { ok: false, error: '请求来源不正确' }); return; }
    }
    if (!req.headers['content-type']?.startsWith('application/json')) { send(415, { ok: false, error: '需要 JSON 请求' }); return; }
    try {
      let body = '';
      for await (const chunk of req) {
        body += String(chunk);
        if (Buffer.byteLength(body) > 16384) { send(413, { ok: false, error: '请求过大' }); return; }
      }
      let input: unknown;
      try { input = JSON.parse(body); } catch { send(400, { ok: false, error: 'JSON 格式不正确' }); return; }
      const operation = queue.then(() => dispatchFriends(store, input, actor));
      queue = operation.catch(() => {});
      send(200, await operation);
    } catch { if (!res.headersSent) send(500, { ok: false, error: '棋桌服务暂不可用，请重试' }); }
  };
}
