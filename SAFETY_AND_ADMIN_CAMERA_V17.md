# V17 safety and private-camera update

## Voice-room safety summary
Before joining a standard voice room, members must agree to concise rules covering privacy, off-platform contact, links and payments, respectful English-only conduct, recording consent, impersonation risk, and immediate reporting.

## Private guest link camera policy
- Private links remain hidden from the public website.
- Guests join without an account by entering name and phone number.
- Guests receive microphone access only.
- Only a user who is already signed in as the administrator can enable a camera.
- The backend marks the administrator role in the signed guest token, forces guest camera presence to false, and rejects guest WebRTC SDP that attempts to send video.
- Guests can still receive and view the administrator camera.

To use the camera, open the private link from the same browser in which the admin panel is signed in.
