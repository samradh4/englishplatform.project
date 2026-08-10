# Bolo English V19

## New member flow

1. A learner creates an account with full name, phone number, email, English level, gender, username, and password.
2. The account is activated immediately and the learner is signed in automatically.
3. A 1-day free trial begins at registration time.
4. When the trial expires, voice-room access is paused and the membership page displays the paid plans.
5. After payment, the administrator activates 2 months, 6 months, or 1 year from the admin panel.
6. The member page refreshes automatically when validity is activated.

## Privacy

Full name, phone number, and email are shown only to the signed-in member and administrator APIs. Public voice rooms continue to show the username/public display name rather than the private full name.

## Admin panel

The member card shows full name, phone, email, username, level, registration time, trial status, and validity. Available paid plans match the published pricing:

- ₹99 — 2 months
- ₹249 — 6 months
- ₹349 — 1 year

## Important storage note

Production accounts still require persistent storage (`DATA_DIR`) or PostgreSQL so they survive redeployments.
