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


## V21: Free Bolo AI Voice Partner

The member dashboard now includes **Bolo AI**, a one-to-one English voice practice partner at `/ai-practice`.

- No paid AI API key is required for the default mode.
- Uses the browser's Web Speech recognition and speech-synthesis capabilities.
- Supports daily conversation, interview practice, beginner basics, travel English, college/study conversation, and random topics.
- Gives simple follow-up questions and a small set of gentle grammar corrections.
- Includes microphone start/stop, speaker on/off, voice selection, speech-speed control, transcript, typed fallback, and responsive phone UI.
- Active trial and paid members can use it. Expired members are redirected to pricing.

Important: this free implementation is a browser-based conversation engine, not a cloud LLM. Speech recognition support varies by browser and may use the browser vendor's speech service. Chrome/Edge provide the most consistent experience.

## V21.2: Context-aware voice conversation

The previous free bot used mostly fixed prompts, so it could ignore what the learner actually asked. V21.2 keeps conversation history and answers common greetings, introductions, "I am new here", "how are you?", "what is your name?", and common everyday questions naturally before asking a relevant follow-up.

For truly open-ended "answer almost anything" conversation, configure an OpenAI-compatible LLM endpoint using `AI_API_URL`, `AI_API_KEY`, and `AI_MODEL`. The key stays server-side. If no provider is configured or it fails, the app automatically falls back to the local context engine and spoken browser voice.


## V21.3: Logical local conversation fixes

The free local voice partner now avoids unrelated random prompts. It answers common greetings and direct requests, uses recent conversation context for short replies, detects cut-off speech, supports common learning/technology questions, and gives honest relevant fallbacks for questions it cannot answer without a cloud LLM.
