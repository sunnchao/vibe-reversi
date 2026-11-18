import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, createReadStream } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { networkInterfaces } from 'node:os';
import { dispatchRoomAction } from './net/dispatch';
import { ReversiCloudService, RoomDatabaseAdapter, RoomDocument } from './net/protocol';
import { UserProgress } from './net/storage';

class LocalRoomDatabase implements RoomDatabaseAdapter {
  private rooms = new Map<string, RoomDocument>();
  private users = new Map<string, UserProgress>();
  constructor(private file: string | null) {
    if (file && existsSync(file)) {
      const data = JSON.parse(readFileSync(file, 'utf8')) as { rooms: RoomDocument[] };
      for (const room of data.rooms ?? []) this.rooms.set(room.roomId, room);
    }
  }
  async getRoom(id: string): Promise<RoomDocument | null> {
    const room = this.rooms.get(id);
    return room ? structuredClone(room) : null;
  }
  async saveRoom(room: RoomDocument): Promise<void> {
    this.rooms.set(room.roomId, structuredClone(room));
    if (this.file) {
      const temp = `${this.file}.tmp`;
      writeFileSync(temp, JSON.stringify({ rooms: [...this.rooms.values()] }), { mode: 0o600 });
      renameSync(temp, this.file);
    }
  }
  async getUser(id: string): Promise<UserProgress | null> { return this.users.get(id) ?? null; }
  async saveUser(id: string, value: UserProgress): Promise<void> { this.users.set(id, value); }
}

function lanAddress(): string {
  for (const list of Object.values(networkInterfaces())) {
    const address = list?.find((item) => item.family === 'IPv4' && !item.internal);
    if (address) return address.address;
  }
  return '127.0.0.1';
}

export function createPreviewServer(options: { root?: string; stateDir?: string | null; publicUrl?: string } = {}) {
  const root = options.root ?? process.cwd();
  const stateDir = options.stateDir === undefined ? resolve(root, '.local') : options.stateDir;
  if (stateDir) mkdirSync(stateDir, { recursive: true });
  const keyFile = stateDir ? resolve(stateDir, 'session.key') : null;
  const secret = keyFile && existsSync(keyFile) ? readFileSync(keyFile) : randomBytes(32);
  if (keyFile && !existsSync(keyFile)) writeFileSync(keyFile, secret, { mode: 0o600 });
  const service = new ReversiCloudService(new LocalRoomDatabase(stateDir ? resolve(stateDir, 'rooms.json') : null));
  let queue: Promise<unknown> = Promise.resolve();

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const actor = (req: IncomingMessage, res: ServerResponse): string => {
    const previewPlayer = req.headers['x-preview-player'];
    if (typeof previewPlayer === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(previewPlayer)) return previewPlayer;
    const raw = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('vr_player='))?.slice(10);
    if (raw) {
      const [id, signature] = raw.split('.');
      const expected = createHmac('sha256', secret).update(id ?? '').digest('hex');
      if (/^[a-f0-9]{32}$/.test(id ?? '') && /^[a-f0-9]{64}$/.test(signature ?? '') &&
        timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return id;
    }
    const id = randomBytes(16).toString('hex');
    const signature = createHmac('sha256', secret).update(id).digest('hex');
    res.setHeader('Set-Cookie', `vr_player=${id}.${signature}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`);
    return id;
  };

  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (pathname === '/api/config' && req.method === 'GET') {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 4173;
        const host = req.headers.host ?? `127.0.0.1:${port}`;
        const origin = options.publicUrl || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host)
          ? `http://${lanAddress()}:${port}`
          : `http://${host}`);
        json(res, 200, { shareOrigin: origin, mode: options.publicUrl ? 'public' : 'lan' });
        return;
      }
      if (pathname === '/api/reversi' && req.method === 'POST') {
        const origin = req.headers.origin;
        if (origin && origin !== `http://${req.headers.host}` && origin !== options.publicUrl) {
          json(res, 403, { ok: false, error: '请求来源不正确' }); return;
        }
        if (!req.headers['content-type']?.startsWith('application/json')) {
          json(res, 415, { ok: false, error: '需要 JSON 请求' }); return;
        }
        let body = '';
        for await (const chunk of req) {
          body += String(chunk);
          if (Buffer.byteLength(body) > 65536) { json(res, 413, { ok: false, error: '请求过大' }); return; }
        }
        let payload: unknown;
        try { payload = JSON.parse(body); } catch { json(res, 400, { ok: false, error: 'JSON 格式不正确' }); return; }
        const identity = actor(req, res);
        const operation = queue.then(() => dispatchRoomAction(service, payload, identity));
        queue = operation.catch(() => {});
        json(res, 200, await operation);
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
      const staticPath = pathname === '/' ? '/preview.html' : pathname;
      if (staticPath !== '/preview.html' && staticPath !== '/game.js' && !staticPath.startsWith('/assets/')) {
        res.writeHead(404).end(); return;
      }
      const file = resolve(root, `.${decodeURIComponent(staticPath)}`);
      if (!file.startsWith(root + sep) || !existsSync(file)) { res.writeHead(404).end(); return; }
      const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp3': 'audio/mpeg' };
      res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
      if (req.method === 'HEAD') res.end();
      else createReadStream(file).on('error', () => res.destroy()).pipe(res);
    } catch {
      if (!res.headersSent) json(res, 500, { ok: false, error: '房间服务暂时不可用，请重试' });
      else res.destroy();
    }
  });
  return server;
}

if (typeof require !== 'undefined' && require.main === module) {
  const port = Number(process.env.PORT || 4173);
  const server = createPreviewServer({ publicUrl: process.env.PUBLIC_URL });
  server.listen(port, '0.0.0.0', () => {
    console.log(`翻盘棋预览: http://127.0.0.1:${port}/preview.html`);
    console.log(`同一 Wi-Fi 的朋友可打开: http://${lanAddress()}:${port}/preview.html`);
  });
  server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
}
