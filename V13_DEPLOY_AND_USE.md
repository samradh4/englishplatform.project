# V13: Deploy and use the private guest video link

## Deploy on the existing Render service

1. Extract this ZIP and open the folder in VS Code.
2. Push it to the existing GitHub repository:

```bash
git init
git branch -M main
git add .
git commit -m "Add admin private guest video links"
git remote add origin https://github.com/samradh4/englishplatform.project.git
git push -u origin main --force
```

3. Wait for Render to show **Live**. Keep `npm install` as the build command and `npm start` as the start command.
4. Keep the same `SESSION_SECRET`; changing it invalidates previously created private links.

## Create a private link

1. Sign in as admin and open `/admin`.
2. Find **Private guest session links**.
3. Enter a title, participant limit, and expiry.
4. Click **Create private link**.
5. Copy and privately share the link. It is never included in the homepage or public room list.
6. The guest enters only name and phone number, accepts the media notice, and can join with camera on or off.
7. After the meeting, revoke or delete the link from the admin panel.

## Remote video reliability

The website must use HTTPS. For users on different or strict networks, add `TURN_URL`, `TURN_USERNAME`, and `TURN_CREDENTIAL` in Render. Without TURN, video may fail on some networks even when the page and chat work.


Camera is now restricted to the signed-in administrator; guests are audio-only.
