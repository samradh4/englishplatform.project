# One-time member approval

- Admin approves each member account once.
- The same username and password can be used again without device reapproval.
- The newest login becomes the active session and remains signed in for up to `SESSION_DAYS` days.
- English level and active membership are still required.

## Important Render note

This demo stores users in `data/db.json`. Render's free filesystem is temporary. A redeploy or instance replacement can erase accounts created on the live site. For permanent users, attach a persistent disk and set `DATA_DIR=/var/data`, or migrate to PostgreSQL.
