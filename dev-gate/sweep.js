const t3 = require('./t3cli');
const MAX_AGE_HOURS = Number(process.env.SESSION_MAX_AGE_HOURS || 12);
if (!(MAX_AGE_HOURS > 0)) {
  console.error('SESSION_MAX_AGE_HOURS must be a positive number');
  process.exit(1);
}
const MAX_AGE_MS = MAX_AGE_HOURS * 3600 * 1000;
const dry = process.argv.includes('--dry');
(async () => {
  const list = await t3.listSessions();
  const now = Date.now();
  let n = 0;
  for (const e of list) {
    const id = t3.sessionId(e);
    const t = t3.issuedMs(e);
    if (!id || isNaN(t)) { console.log('skip, unrecognized fields:', Object.keys(e)); continue; }
    const ageH = ((now - t) / 3600000).toFixed(1);
    if (now - t > MAX_AGE_MS) {
      console.log((dry ? 'would revoke ' : 'revoke ') + id + ' age ' + ageH + 'h');
      if (!dry) await t3.revoke(id);
      n++;
    }
  }
  console.log('done: matched ' + n + ' of ' + list.length);
})().catch((e) => { console.error(e.message); process.exit(1); });
