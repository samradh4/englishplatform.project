# Private guest links

1. Sign in as administrator and open `/admin`.
2. Under **Private guest session links**, enter a title, participant limit, and expiry.
3. Click **Create private link** and share only with intended guests.
4. Guests enter name and phone number; no member login is required.
5. Revoke or delete the link after the session.

The link is a bearer credential: anyone who receives it can open the session until it expires or is revoked. Phone numbers are stored in `data/db.json` and visible only in the administrator panel. Configure a persistent database/storage for production and publish an appropriate privacy notice. Remote video reliability requires HTTPS and preferably TURN credentials (`TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`).


## Camera policy
Guests are audio-only. Only a browser that is already signed in as the administrator can enable camera on a private link. Guests can view the administrator camera but cannot publish their own video.
