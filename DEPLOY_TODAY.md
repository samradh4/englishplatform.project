# Deploy Today — Fast Procedure

## 1. Upload this version to the existing GitHub repository

Extract the ZIP and open the extracted folder in VS Code. Open Terminal and run:

```bash
git init
git branch -M main
git add .
git commit -m "Deploy polished V12 remote voice demo"
git remote add origin https://github.com/samradh4/englishplatform.project.git
git push -u origin main --force
```

If `origin already exists` appears, run:

```bash
git remote set-url origin https://github.com/samradh4/englishplatform.project.git
git push -u origin main --force
```

## 2. Render

Open the existing `englishplatform.project` Web Service.

Use:

```text
Build Command: npm install
Start Command: npm start
```

Add or confirm:

```text
ADMIN_USERNAME = admin
ADMIN_PASSWORD = your private admin password
SESSION_SECRET = a long random private value
NODE_ENV = production
SESSION_DAYS = 30
VOICE_MODE = auto
```

Click **Manual Deploy → Deploy latest commit** if auto-deploy does not start. Wait for **Live**.

## 3. Test remote voice before sending the link

1. Open the Render URL on your laptop using Wi-Fi.
2. Open it on your phone using mobile data—not the same Wi-Fi.
3. Register both accounts from their own devices.
4. Approve them as admin, assign the same English level, and give a 1-day trial.
5. Create and approve a room with a limit of 5.
6. Join from both devices and allow microphone permission.
7. The room header should show **Secure cross-network relay active** when the built-in relay is being used.
8. Test mute, raise hand, mute everyone, chat, and remove participant.

## 4. Client demo

- Open the site 10 minutes early so the Render free service wakes up.
- Ask each person to register from the device they will use.
- Keep the admin panel open in a separate Incognito window.
- Approve all users with the same level and a 1-day trial.
- Create one room with participant limit 5 and approve it.
- Send the invite link.
- Ask users to use earphones and allow microphone permission.

## 5. Connect a custom domain

After buying a domain:

1. Open Render service **Settings → Custom Domains**.
2. Add a subdomain such as `speak.yourdomain.com`.
3. Render will show a DNS target.
4. In your domain provider, create the CNAME record exactly as Render shows.
5. Wait for DNS verification and HTTPS activation.

For the root domain, follow the exact DNS record Render displays. DNS labels differ by provider, so copy Render's shown target rather than guessing.

## Important

The built-in WSS voice relay is intended for a polished small demo and early testing. For a larger paid launch, migrate voice to LiveKit/mediasoup and data to PostgreSQL.
