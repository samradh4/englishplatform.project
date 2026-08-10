# UH Education Hub V17.1 — Launch QA Report

## Automated checks passed

- Node syntax for the backend and every frontend JavaScript file
- Package-lock consistency and dependency audit
- Registration, pending access, admin login, member approval, English level, and trial activation
- Automatic approval event endpoint and approved-session state
- Re-login with the same approved username and password
- Login restoration after a Node server restart when the same data directory and session secret are retained
- Room request, admin room approval, level matching, shared topic endpoint, and room capacity state
- Secure WSS voice-relay authentication and binary audio packet forwarding between two approved room participants
- Raise-hand/presence API, owner mute-all permission, and backend-enforced moderator mute
- Private admin link creation, signed token validation, guest name/phone validation, and admin-only camera policy
- Static page assets, JavaScript references, and required DOM element IDs
- Security headers, no-store HTML caching, password hashing, signed HttpOnly login cookies, and same-origin mutation checks

## Critical deployment requirements

1. **Persistent data:** The app still uses `data/db.json`. On an ephemeral Render filesystem, users, rooms, memberships, and reports may disappear after a redeploy. Use a Render persistent disk and `DATA_DIR=/var/data`, or migrate to PostgreSQL before accepting paid memberships.
2. **Always-on hosting:** A sleeping/free service interrupts live voice rooms and creates long wake-up delays. Use an always-on paid web service for a public launch.
3. **Private guest video:** Private video sessions use WebRTC. Configure `TURN_URL`, `TURN_USERNAME`, and `TURN_CREDENTIAL` for reliable calls between different networks.
4. **Normal voice rooms:** `VOICE_MODE=auto` uses the WSS relay when TURN is absent. This was packet-tested, but a real microphone/speaker test on two physical devices is still required.
5. **Scale:** Keep early rooms small (recommended 3–5 participants). The built-in relay is not an SFU and is not suitable for hundreds of concurrent callers.
6. **Secrets:** Set a unique strong `ADMIN_PASSWORD` and long random `SESSION_SECRET`. Never commit `.env`.

## Final physical-device test

Test one laptop on Wi-Fi and one phone on mobile data. Check microphone permission, two-way sound, mute/unmute, mute everyone, raise hand, chat, report, leave/rejoin, and mobile layout. Test the private link separately with the administrator on camera and the guest audio-only.
