# Bolo English V21.1 - Speaking bot fix

The V21 bot could display replies but some browsers blocked automatic text-to-speech because the page had not received a user gesture yet.

V21.1 adds:
- a clear **Start voice session** button that unlocks browser audio;
- a **Test voice** button;
- automatic spoken replies after voice is unlocked;
- English voice selection and automatic voice preview;
- visible speech errors instead of silently failing;
- speaker re-enable replay of the most recent bot reply;
- mobile responsive voice controls.

No paid AI/TTS API is required. Browser support is best in current Chrome or Edge.
