# Self-hosting CineBoost from your laptop

Goal: serve CineBoost on a public HTTPS URL so you and a few friends can use it, with your laptop as the actual host. We'll use **Cloudflare Tunnel** (free, no port-forwarding, automatic HTTPS), run the Express server with **pm2** so it auto-restarts, and tweak macOS so it doesn't go to sleep.

## Architecture in one picture

```
your laptop                              the internet
┌────────────────────────────┐
│ Express on :8787           │
│  ├── /api/* (backend)      │            ┌────────────┐      ┌──────────────┐
│  └── /     (built React)   │ ◄── localhost ◄── cloudflared ◄── Cloudflare ◄── your friends
└────────────────────────────┘            │   tunnel   │      │  HTTPS edge  │
                                          └────────────┘      └──────────────┘
```

- The Express server serves both the API and the built React app on **one port (8787)**.
- `cloudflared` opens an outbound connection to Cloudflare's edge — no inbound ports on your laptop, no port-forwarding on your router.
- Cloudflare terminates HTTPS for you with a real cert. Your friends just hit `https://cineboost.<yourdomain>.com`.

## One-time setup

### 1. Build the frontend

```bash
cd cineboost-app
npm run install:all      # installs server + client deps
npm run build            # builds client → client/dist/
```

Verify it works locally:

```bash
npm start                # starts Express on :8787 serving both API and the React app
# open http://localhost:8787
```

You should see CineBoost. Stop it with `^C` for now.

### 2. Install pm2 (process manager)

`pm2` keeps the server running across crashes and reboots.

```bash
npm install -g pm2
cd cineboost-app/server
pm2 start src/index.js --name cineboost
pm2 save                          # remember the running set
pm2 startup                       # prints a command — paste & run it to install login-time autostart
```

Useful pm2 commands:
- `pm2 ls` — list managed processes
- `pm2 logs cineboost` — tail logs
- `pm2 restart cineboost` — restart after `git pull` or `.env` change
- `pm2 stop cineboost` — pause it

### 3. Install cloudflared

```bash
brew install cloudflared          # macOS
cloudflared tunnel login          # opens a browser; pick the Cloudflare zone you want to use
```

If you don't already have a Cloudflare-managed domain, you have two options:
- **Cheap & nice:** buy a domain (cheap on Cloudflare itself, ~$10/yr) and add it as a Cloudflare zone. This is the recommended path — once your URL is `https://cineboost.yourname.com` you'll never want to change it.
- **Quick & free:** use a Quick Tunnel (`cloudflared tunnel --url http://localhost:8787`). You get a random `*.trycloudflare.com` URL that changes every restart. Fine for testing, terrible for sharing with friends because the URL keeps changing.

The rest of this guide assumes the named-tunnel path with your own domain.

### 4. Create the named tunnel

```bash
cloudflared tunnel create cineboost
# Prints a tunnel UUID and writes credentials to ~/.cloudflared/<uuid>.json
```

Map a hostname to it:

```bash
cloudflared tunnel route dns cineboost cineboost.yourdomain.com
```

Create the config file:

```bash
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml <<'YAML'
tunnel: cineboost
credentials-file: /Users/your-mac-username/.cloudflared/<uuid>.json

ingress:
  - hostname: cineboost.yourdomain.com
    service: http://localhost:8787
  - service: http_status:404
YAML
```

Replace `<uuid>` and `your-mac-username` with the real values.

Test it:

```bash
cloudflared tunnel run cineboost
# Visit https://cineboost.yourdomain.com — you should see CineBoost
```

### 5. Run cloudflared as a background service

```bash
sudo cloudflared service install
# It picks up ~/.cloudflared/config.yml automatically
```

Now both `cineboost` (Express via pm2) and `cloudflared` (tunnel via launchd) restart automatically when your laptop reboots.

### 6. Tell Google your new public URL

Google OAuth only accepts logins from origins you've whitelisted.

1. https://console.cloud.google.com/apis/credentials
2. Open your OAuth 2.0 Client ID
3. Add `https://cineboost.yourdomain.com` to **Authorized JavaScript origins**
4. Save

Update `cineboost-app/client/.env` with the same `VITE_GOOGLE_CLIENT_ID` and rebuild:

```bash
cd cineboost-app
npm run build && pm2 restart cineboost
```

### 7. Stop the laptop from sleeping

If your lid closes or the screen sleeps, the server keeps running but the laptop will eventually sleep its CPU and the tunnel will hiccup. Quickest fix:

```bash
# Option A — leave a terminal window open with this running.
caffeinate -dimsu
```

Or persistent (until next reboot):

```bash
sudo pmset -a sleep 0
sudo pmset -a disablesleep 1   # closing the lid will not sleep the machine (plug in power!)
```

Reverse with `sudo pmset -a disablesleep 0; sudo pmset -a sleep 10`.

## Day-2 ops

**You shipped a code change:**
```bash
git pull
cd cineboost-app
npm run build           # rebuild frontend
pm2 restart cineboost   # restart server
```

**You changed an env var (`server/.env`):**
```bash
pm2 restart cineboost --update-env
```

**You want to see what's broken:**
```bash
pm2 logs cineboost --lines 200
```

**You want to take it offline temporarily:**
```bash
pm2 stop cineboost
# or
sudo cloudflared service uninstall   # also stops accepting traffic
```

## Backup the SQLite DB

User ratings live in `server/cineboost.db`. Back it up periodically — tunnel goes down, hard drive dies, etc.

```bash
# Manual snapshot
cp server/cineboost.db ~/Desktop/cineboost-$(date +%F).db

# Or set up a daily backup with launchd / cron, or rsync to a USB drive
```

## Limits to know about

- **Bandwidth:** Cloudflare Tunnel free tier is generous (terabytes), but your residential ISP cap matters. CineBoost is light — text + small JSON + image proxying — but movie posters from TMDB add up.
- **Concurrency:** Express + SQLite on a laptop can handle dozens of concurrent users without breaking a sweat. Hundreds is when you'd want to think about pooling, caching, and a real DB.
- **TMDB rate limit:** ~50 req/sec. The server fetches the now-playing list; cache it for an hour to stay polite (see "Things to add" in `README.md`).
- **OAuth:** Google ID tokens last ~1 hour. We hand back a 30-day session JWT after the first login, so users don't re-auth often.

## When to graduate off the laptop

- You start caring about uptime more than control
- Your laptop battery / thermals start to suffer
- You want to deploy from CI on push

Easiest next step: `fly.io` ($0 free tier covers a small Node app + 1GB volume for SQLite) or `railway.app`. The Express server with `client/dist` baked in deploys as one container; nothing about the architecture changes.
