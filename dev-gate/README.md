# dev-gate

A tiny Node.js reverse proxy that sits in front of [T3 Code](https://github.com/pingdotgg/t3code)
and lets users who have already passed Cloudflare Access (Google login) into T3 Code
without a second manual pairing step. It also adds a real logout and expires old sessions.

## Architecture

```
Browser
   |  HTTPS
   v
Cloudflare Access (Google login, policy = real gate)
   |
   v
Cloudflare Tunnel (cloudflared)
   |
   v
gate  (127.0.0.1:3774)   <-- this project
   |  HTTP + WebSocket
   v
T3 Code (127.0.0.1:3773)
```

## Flows

- **Auto-pair:** on a page navigation (`GET`, `Accept: text/html`) with a missing or invalid
  T3 session, the gate mints a one-time pairing credential via the `t3` CLI, labeled
  `gate-<random>`, exchanges it at `/api/auth/browser-session`, and sets the resulting session
  cookie (plus a `Secure` flag and a short-lived retry-guard cookie) before redirecting back.
  A random id cookie (`t3gate_id`) remembers which label belongs to this browser.
- **`/logout`:** clears the T3 session cookies and the gate's own cookies (`Set-Cookie` and
  `Clear-Site-Data`), revokes that browser's server-side session by its `gate-<id>` label,
  then redirects to the Cloudflare Access logout URL.
- **Hourly sweep:** `sweep.js` (run by a systemd timer) revokes every T3 session older than
  `SESSION_MAX_AGE_HOURS` (default 12). Use `node sweep.js --dry` to preview.

## Security notes

- The gate trusts the `Cf-Access-Authenticated-User-Email` header and returns 403 without it.
  It must therefore listen on `127.0.0.1` only and be reachable **only** through the tunnel;
  otherwise anyone could forge the header.
- The Cloudflare Access policy is the real gate. Keep it restrictive.
- Optional improvement: validate the Access JWT (`Cf-Access-Jwt-Assertion`) against your
  team's JWKS instead of trusting the email header alone.
- Never commit `~/.config/t3gate.env` or any T3 / cloudflared credentials.

## Setup

Requirements: Node.js 20+, T3 Code running on `T3_URL`, a Cloudflare Tunnel and Access app
for your hostname, and `npx` available (the gate calls `npx t3@latest auth ...`).

```sh
git clone <this repo> ~/homelab && cd ~/homelab/dev-gate
npm ci
cp .env.example ~/.config/t3gate.env && chmod 600 ~/.config/t3gate.env
$EDITOR ~/.config/t3gate.env        # set PUBLIC_HOST and ACCESS_LOGOUT_URL

mkdir -p ~/.config/systemd/user
cp systemd/* ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now t3gate.service t3sweep.timer
```

Point the tunnel's ingress for your hostname at `http://127.0.0.1:3774`.

| Variable | Required | Default | Used by |
|----------|----------|---------|---------|
| `PUBLIC_HOST` | yes | | gate (public hostname behind Access) |
| `ACCESS_LOGOUT_URL` | yes | | gate (post-logout redirect) |
| `PORT` | no | `3774` | gate |
| `T3_URL` | no | `http://127.0.0.1:3773` | gate |
| `SESSION_MAX_AGE_HOURS` | no | `12` | sweep |

The unit files assume the code lives at `~/dev-gate` (`%h/dev-gate`); adjust `ExecStart` if not.

## Known limitations

- Cloudflare Access has no idle timeout, only an absolute session duration.
- No sliding sessions: a T3 session is revoked by the sweep based on issue time, even if active.
- Session lookup relies on the `t3` CLI output format and label matching.
