# Bolo English V21.5 — Long Pause Voice Input

- Voice input no longer submits after a ~1 second pause.
- Keeps one speaking turn alive across browser recognition restarts.
- Waits about 4.2 seconds of silence after speech before automatically sending.
- Gives about 10 seconds to begin speaking after tapping the microphone.
- Users can still tap the microphone button to finish immediately.
- Mobile Chrome/Android early `onend` events are handled by restarting recognition during the same turn.
