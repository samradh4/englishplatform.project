# Bolo English V21.2 — Contextual Voice Conversation

- Replaced the fixed/random prompt reply flow with conversation-history-aware replies.
- Handles greetings, how-are-you, introductions, new-user messages, bot identity, and several common knowledge questions naturally.
- Keeps spoken browser TTS replies.
- Adds `/api/ai/chat` with an optional server-side OpenAI-compatible LLM provider.
- If no provider is configured, the improved local contextual engine remains usable.
- AI keys are never exposed to browser JavaScript.
