# Bolo English V20

This version adds a modern pricing section after login, WhatsApp plan enquiries, instant room creation and all-room access for every active trial or paid member, one shared login page for members and administrators, and SQLite-backed persistent data and multi-session login.

## Pricing shown after login

- ₹500 — 1 month
- ₹999 — 3 months
- ₹6,000 — 1-to-1 with teachers

Each button opens WhatsApp to **+91 88083 94539** with the selected plan and the member username already filled in.

## Persistent database

The app now stores its state in SQLite at:

```text
data/boloenglish.sqlite
```

On first start it automatically imports an existing `data/db.json` when present.

For Contabo, set:

```env
DATA_DIR=/var/lib/boloenglish/data
SESSION_DAYS=30
```

Keep `SESSION_SECRET` unchanged after launch. SQLite persists on a VPS; Render still requires a persistent disk.



Render-ready English speaking platform for a small live demonstration with users joining from different locations.

## Included

- Persistent 30-day login on the approved device
- Automatic account approval update and redirect—no second login required
- Automatic room approval refresh
- Raise/lower hand with animated badge
- Room owner can mute one participant, allow unmute, mute everyone, lower hands, and remove a participant
- Administrator keeps full room controls
- Secure cross-network voice relay fallback over WSS when TURN is not configured
- WebRTC + TURN support when TURN credentials are provided
- Microphone and speaker on/off controls
- Microphone and supported speaker-source selection
- Speaking rings, mute status, animated avatars, chat, reports, topics, invite links
- Responsive UI for phones, tablets, laptops, and desktop PCs

## Voice modes

`VOICE_MODE=auto` is recommended.

- With valid `TURN_URL`, `TURN_USERNAME`, and `TURN_CREDENTIAL`, the app uses WebRTC + TURN.
- Without TURN, the app automatically uses its built-in secure WSS voice relay so a small remote demo can work across different networks.
- The built-in relay is designed for a small demo room, not hundreds of simultaneous users. A permanent production service should use LiveKit or a managed TURN/SFU setup.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`. Do not use VS Code Go Live.

## Render settings

```text
Runtime: Node
Branch: main
Root Directory: blank
Build Command: npm install
Start Command: npm start
```

Required environment variables:

```env
NODE_ENV=production
ADMIN_USERNAME=admin
ADMIN_PASSWORD=choose-a-strong-private-password
SESSION_SECRET=choose-a-long-random-private-value
SESSION_DAYS=30
VOICE_MODE=auto
```

Optional production TURN variables:

```env
TURN_URL=turn:your-turn-host:3478?transport=udp,turn:your-turn-host:3478?transport=tcp
TURN_USERNAME=your-turn-username
TURN_CREDENTIAL=your-turn-password
```

See `DEPLOY_TODAY.md` for the exact deployment and demo checklist.


## Admin-only private guest video links

The administrator panel can create secret links that are never shown on the homepage or public live-room list. A guest opens the link, enters a name and phone number, accepts the camera/microphone notice, and joins without creating an account. Camera access is enabled only on this private-session page. The administrator can copy, extend, revoke, or delete each link and privately view guest attendance details. Use HTTPS and configure TURN credentials for reliable remote video calls across strict networks.


## V17 privacy update
Private guest links are audio-only for guests. Only the signed-in administrator can enable camera. Standard voice rooms show a concise safety agreement before microphone access.


## V17.1 launch QA fix

Moderator mutes are now enforced by the backend. A participant cannot bypass a room-owner or administrator mute by calling the presence API manually. The moderator must explicitly allow unmute first.

Before accepting paid members, use persistent storage (`DATA_DIR=/var/data` on a persistent disk) or migrate to PostgreSQL. The repository JSON file alone is not durable on an ephemeral host.


## V19.1 trial room access

During an active 1-day trial, a learner can create a room instantly without administrator approval and can join any approved room regardless of English level. When the trial ends, room access stops until the administrator activates paid validity. Paid members return to level-matched joining and normal room-approval rules.
