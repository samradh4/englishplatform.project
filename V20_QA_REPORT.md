# Bolo English V20 QA report

Tested on Node.js 22 with a fresh SQLite database:

- Registration requires full name, phone, email, level, gender, username, and password.
- New users receive instant approved access and a 1-day free trial.
- Login requires username and password only.
- Administrator logs in from the same login form and is redirected to `/admin`.
- Separate administrator sign-in link and form were removed.
- Dashboard shows ₹500/1 month, ₹999/3 months, and ₹6,000/1-to-1 pricing.
- WhatsApp buttons are generated for +91 88083 94539 with the plan and username.
- Active trial and paid members create rooms instantly without room approval.
- Active trial and paid members can open rooms across English levels.
- Expired users still reach the dashboard and see pricing; room APIs remain blocked.
- Admin panel receives full name, phone, email, username, level, and membership details.
- Admin can activate the new 1-month, 3-month, and 1-to-1 plans.
- SQLite data and saved login sessions survive a server restart when `DATA_DIR` and `SESSION_SECRET` stay unchanged.
- Multiple browser sessions can remain logged in for `SESSION_DAYS` (default 30).
- JavaScript and backend syntax checks passed.

## Production storage

On Contabo use:

```env
DATA_DIR=/var/lib/boloenglish/data
SESSION_DAYS=30
```

Keep `SESSION_SECRET` unchanged. The database will be stored at `/var/lib/boloenglish/data/boloenglish.sqlite`.

On Render, a persistent disk is still required; otherwise the SQLite file can disappear after service replacement or redeployment.
