const http = require('http');
const crypto = require('crypto');
const httpProxy = require('http-proxy');
const t3 = require('./t3cli');

function required(name) {
  const v = process.env[name];
  if (!v) { console.error('Missing required environment variable: ' + name); process.exit(1); }
  return v;
}

const PORT = Number(process.env.PORT || 3774);
const T3 = process.env.T3_URL || 'http://127.0.0.1:3773';
const HOST = required('PUBLIC_HOST');
const PUBLIC = 'https://' + HOST;
const ACCESS_LOGOUT = required('ACCESS_LOGOUT_URL');
const ACCESS_HDR = 'cf-access-authenticated-user-email';
const OWN = (n) => n.startsWith('t3_session') || n === 't3gate_try' || n === 't3gate_id';

const proxy = httpProxy.createProxyServer({ target: T3, ws: true, xfwd: true });
proxy.on('error', (e, req, res) => {
  console.error('proxy error:', e.message);
  if (res && res.writeHead && !res.headersSent) res.writeHead(502).end('bad gateway');
  else if (res && res.destroy) res.destroy();
});

async function isAuthed(cookie) {
  try {
    const r = await fetch(T3 + '/api/auth/session', { headers: { cookie, host: HOST } });
    return (await r.json()).authenticated === true;
  } catch (e) {
    console.error('session check failed:', e.message);
    return true;
  }
}

async function revokeByLabel(label) {
  const list = await t3.listSessions();
  for (const e of list) {
    if (JSON.stringify(e).includes(label)) {
      const id = t3.sessionId(e);
      if (id) { await t3.revoke(id); console.log('revoked session', label); }
    }
  }
}

const server = http.createServer(async (req, res) => {
  if (!req.headers[ACCESS_HDR]) { res.writeHead(403).end('forbidden'); return; }
  const cookie = req.headers.cookie || '';

  if (req.method === 'GET' && req.url.split('?')[0] === '/logout') {
    const expire = cookie.split(';').map((c) => c.trim().split('=')[0]).filter(OWN)
      .map((n) => n + '=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Clear-Site-Data': '"cookies"',
      'Set-Cookie': expire,
      'Cache-Control': 'no-store',
    }).end('<!doctype html><meta charset=utf-8><meta http-equiv="refresh" content="1;url=' +
      ACCESS_LOGOUT + '"><p>Logging out...</p>');
    const m = cookie.match(/(?:^|;\s*)t3gate_id=([0-9a-f]{12})/);
    if (m) revokeByLabel('gate-' + m[1]).catch((e) => console.error('revoke failed:', e.message));
    return;
  }

  const isNav = req.method === 'GET' && (req.headers.accept || '').includes('text/html');
  if (isNav && !cookie.includes('t3gate_try=1') && !(await isAuthed(cookie))) {
    try {
      const rand = crypto.randomBytes(6).toString('hex');
      const credential = await t3.mint('gate-' + rand);
      const r = await fetch(T3 + '/api/auth/browser-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json', host: HOST, origin: PUBLIC },
        body: JSON.stringify({ credential }),
      });
      if (r.ok) {
        const cookies = r.headers.getSetCookie()
          .map((c) => (/;\s*secure/i.test(c) ? c : c + '; Secure'));
        cookies.push('t3gate_try=1; Max-Age=10; Path=/; HttpOnly; Secure; SameSite=Lax');
        cookies.push('t3gate_id=' + rand + '; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax');
        res.writeHead(302, { Location: req.url, 'Set-Cookie': cookies, 'Cache-Control': 'no-store' }).end();
        return;
      }
      console.error('exchange failed, status', r.status);
    } catch (e) { console.error('auto-pair error:', e.message); }
  }
  proxy.web(req, res);
});

server.on('upgrade', (req, socket, head) => {
  if (!req.headers[ACCESS_HDR]) { socket.destroy(); return; }
  proxy.ws(req, socket, head);
});

server.listen(PORT, '127.0.0.1', () => console.log('gate on 127.0.0.1:' + PORT));
