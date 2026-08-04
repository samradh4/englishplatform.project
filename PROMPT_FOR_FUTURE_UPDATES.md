# Continuation Prompt

Continue development of UH Education Hub V12 without removing existing features.

Current stack: one Render-compatible Node.js server, HTML/CSS/vanilla JavaScript frontend, JSON storage, SSE live updates, WebRTC with optional TURN, and a built-in authenticated WSS PCM voice relay fallback for small remote demos.

Preserve:
- 30-day persistent login and one approved device
- automatic account and room approval updates
- English levels and validity plans
- room approval, participant limits, owner transfer
- raise hand, mute/unmute, mute everyone, reports, chat, topics
- owner/admin participant removal
- mobile/tablet/laptop/desktop responsiveness
- Poppins-based polished UI

Do not claim the built-in relay is suitable for large production scale. For production migration, use PostgreSQL, Redis, Socket.IO, LiveKit or mediasoup, Coturn, Nginx, Docker, monitoring, and backups.


V14 adds administrator-only special display names and verified role tags for registered members and private guests. Preserve these fields and live profile-updated events in future versions.
