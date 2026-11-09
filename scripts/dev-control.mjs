import { createServer } from 'node:http';
import { createServer as createProbe } from 'node:net';
import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const appUrl = 'http://127.0.0.1:3300';
const controlUrl = 'http://127.0.0.1:3301';
const token = randomBytes(32).toString('hex');
const nonce = randomBytes(18).toString('base64');
const page = readFileSync(new URL('./dev-control.html', import.meta.url), 'utf8')
  .replaceAll('__CONTROL_TOKEN__', token).replaceAll('__SCRIPT_NONCE__', nonce);
let child = null;
let status = 'stopped';
let detail = '';
let busy = false;
let closing = false;

function snapshot() { return { status, detail, appUrl, pid: child?.pid ?? null }; }
function portAvailable() {
  return new Promise((resolve) => {
    const probe = createProbe();
    probe.once('error', () => resolve(false));
    probe.listen(3300, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}
function signalChild(processToSignal, signal) {
  try {
    if (process.platform === 'win32') processToSignal.kill(signal);
    else process.kill(-processToSignal.pid, signal);
  } catch (error) { if (error.code !== 'ESRCH') throw error; }
}
async function start() {
  if (busy || child || closing) return;
  busy = true;
  try {
    if (!(await portAvailable())) {
      status = 'error';
      detail = '3300番ポートが別のプロセスに使われています。既存プロセスは停止していません。';
      return;
    }
    status = 'starting';
    detail = '';
    const launched = spawn(process.execPath, [
      fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url)),
      'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3300',
    ], { cwd: root, stdio: 'inherit', detached: process.platform !== 'win32',
      env: { ...process.env, NODE_ENV: 'development' } });
    child = launched;
    launched.once('error', (error) => {
      if (child !== launched) return;
      child = null; status = 'error'; detail = error.message;
    });
    launched.once('close', (code) => {
      if (child !== launched) return;
      child = null;
      const expected = status === 'stopping' || closing;
      status = expected || code === 0 ? 'stopped' : 'error';
      detail = expected ? '' : `開発サーバーが終了しました（終了コード ${code}）。`;
    });
    const deadline = Date.now() + 45_000;
    while (child === launched && status === 'starting' && Date.now() < deadline) {
      try {
        const response = await fetch(appUrl, { signal: AbortSignal.timeout(2500) });
        await response.body?.cancel();
        if (response.ok && child === launched && status === 'starting') {
          status = 'running'; return;
        }
      } catch { /* Next.js may still be compiling. */ }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (child === launched && status === 'starting') {
      await stop();
      status = 'error'; detail = '起動確認がタイムアウトしました。ONで再試行できます。';
    }
  } finally { busy = false; }
}
async function stop() {
  const target = child;
  if (!target) return;
  status = 'stopping'; detail = '';
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { signalChild(target, 'SIGKILL'); } catch (error) { reject(error); }
    }, 6000);
    target.once('close', () => { clearTimeout(timeout); resolve(); });
    try { signalChild(target, 'SIGTERM'); }
    catch (error) { clearTimeout(timeout); reject(error); }
  });
}

const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; frame-src ${appUrl}; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`);
  function json(code, body) {
    response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(body));
  }
  if (request.headers.host !== '127.0.0.1:3301') return json(403, { error: 'LOCAL HOST ONLY' });
  const url = new URL(request.url, controlUrl);
  if (request.method === 'GET' && url.pathname === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(page); return;
  }
  if (request.method === 'GET' && url.pathname === '/status') return json(200, snapshot());
  if (request.method !== 'POST' || !['/start', '/stop'].includes(url.pathname)) return json(404, { error: 'NOT FOUND' });
  const supplied = request.headers['x-control-token'];
  if (request.headers.origin !== controlUrl || typeof supplied !== 'string' ||
      !/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))) {
    return json(403, { error: 'この管理画面から操作してください。' });
  }
  if (busy || status === 'stopping' || closing) return json(409, { error: '操作中です。完了後にもう一度お試しください。' });
  if (url.pathname === '/start') {
    void start().catch(error => { status = 'error'; detail = error.message; });
  } else {
    // stop() marks stopping before yielding, preventing overlapping requests.
    void stop().catch(error => { status = 'error'; detail = error.message; });
  }
  json(202, snapshot());
});
server.on('error', error => { console.error(`管理サーバーを起動できません: ${error.message}`); process.exitCode = 1; });
server.listen(3301, '127.0.0.1', () => {
  console.log(`\nEARTH GROOVE PF 開発用管理: ${controlUrl}\n`);
  void start().catch(error => { status = 'error'; detail = error.message; });
});
async function shutdown() {
  if (closing) return;
  closing = true;
  try { await stop(); } finally { server.close(); server.closeAllConnections(); }
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
