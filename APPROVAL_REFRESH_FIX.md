# Approval auto-refresh fix

The pending page JavaScript is now loaded from `public/js/pending.js` instead of an inline script.
The server security policy intentionally blocks inline JavaScript, so the previous inline code never ran on Render.

After deployment:
1. Hard-refresh the pending user page.
2. Approve the member with a level, validity plan, and device.
3. The user is redirected automatically within about 6 seconds, usually immediately through SSE.

The Check approval status button now also reloads the page and the external script re-checks access.
