const { execFile } = require('child_process');
const path = require('path');
const npx = path.join(path.dirname(process.execPath), 'npx');

function run(args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    execFile(npx, ['t3@latest', ...args], { timeout }, (err, stdout) =>
      err ? reject(err) : resolve(stdout));
  });
}
async function mint(label) {
  const out = await run(['auth', 'pairing', 'create', '--ttl', '1m', '--label', label, '--json']);
  return JSON.parse(out).credential;
}
async function listSessions() {
  const d = JSON.parse(await run(['auth', 'session', 'list', '--json']));
  if (Array.isArray(d)) return d;
  return d.sessions || d.clientSessions || Object.values(d).find(Array.isArray) || [];
}
const sessionId = (e) => e.sessionId || e.id;
function issuedMs(e) {
  for (const k of Object.keys(e)) {
    if (/issued/i.test(k)) { const t = Date.parse(e[k]); if (!isNaN(t)) return t; }
  }
  return NaN;
}
const revoke = (id) => run(['auth', 'session', 'revoke', id]);
module.exports = { mint, listSessions, revoke, sessionId, issuedMs };
