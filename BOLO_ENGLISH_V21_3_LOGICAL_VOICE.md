# Bolo English V21.3 — Logical Voice Conversation

Fixes the local free bot so it responds to what the learner actually says instead of jumping to unrelated prompts.

- Context-aware replies to short answers
- Direct handling for greetings, introductions, identity/model questions, songs/rhymes, jokes, stories, time/date, weather limitations, and common technology topics
- Detects cut-off speech-recognition fragments and asks the learner to repeat
- Unknown questions receive a relevant honest fallback instead of a random practice question
- Random prompts are used only when the learner explicitly asks for a topic/question
- Voice output remains browser speech synthesis, so no paid voice API is required

For fully open-ended factual intelligence, configure an external LLM provider with the existing server-side AI_API_URL / AI_API_KEY / AI_MODEL variables.
