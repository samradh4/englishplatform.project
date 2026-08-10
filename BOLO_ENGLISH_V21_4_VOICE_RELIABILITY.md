# Bolo English V21.4 — Voice reliability fix

- Treats browser `interrupted` / `canceled` speech events as normal when the learner taps the microphone, changes voice, or starts another reply.
- Prevents false red error banners caused by the app intentionally stopping an utterance.
- Adds a short restart delay after `speechSynthesis.cancel()` to avoid Chrome/WebKit race conditions.
- Uses a suitable English system voice as a fallback when the selected voice is unavailable.
- Keeps genuine speech-synthesis failures visible while suppressing expected cancellation events.
