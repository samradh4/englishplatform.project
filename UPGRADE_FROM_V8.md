# Upgrade from V8 to V9

V9 does not require a new npm package or a new Render environment variable.

## Preserve existing members and rooms

Before replacing the old project, keep a backup of:

```text
data/db.json
```

After extracting V9, copy your existing `db.json` into the new `data` folder. Skip this step only when you want a clean database.

## Push to the existing GitHub repository

From inside the V9 project folder:

```bash
git add .
git commit -m "Add live approvals and responsive UI"
git push origin main
```

Render should redeploy automatically.

## Test the live approval flow

1. Open the pending member page on one device.
2. Open the administrator panel on another tab/device.
3. Approve the member with a level, validity plan, and device approval.
4. The pending member should open the dashboard automatically.
5. Ask the member to create a room.
6. Leave the member on the dashboard or room waiting screen.
7. Approve the room from the administrator panel.
8. The member view should update automatically; a waiting room should reload and open.

The **Check approval status** button also performs a full page refresh.
