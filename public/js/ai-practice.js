(() => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synthesis = window.speechSynthesis;

  const el = (id) => document.getElementById(id);
  const transcript = el('ai-transcript');
  const alertBox = el('ai-alert');
  const micButton = el('ai-mic-button');
  const micLabel = el('ai-mic-label');
  const speakerButton = el('ai-speaker-button');
  const textInput = el('ai-text-input');
  const sendButton = el('ai-send-button');
  const modeSelect = el('ai-mode');
  const voiceSelect = el('ai-voice');
  const speedInput = el('ai-speed');
  const speedValue = el('ai-speed-value');
  const correctionToggle = el('ai-corrections');
  const correctionCard = el('ai-correction-card');
  const correctionText = el('ai-correction-text');
  const orb = el('ai-orb');
  const orbStatus = el('ai-orb-status');
  const levelBadge = el('ai-level-badge');
  const sessionTitle = el('ai-session-title');
  const turnCount = el('ai-turn-count');
  const startVoiceButton = el('ai-start-voice');
  const voiceHelp = el('ai-voice-help');
  const testVoiceButton = el('ai-test-voice');

  let currentUser = null;
  let recognition = null;
  let listening = false;
  let speaking = false;
  let speakerEnabled = true;
  let turns = 0;
  let botTurns = 0;
  let voices = [];
  let lastUserText = '';
  let recentPrompts = [];
  let voiceUnlocked = false;
  let pendingSpeechText = '';
  let lastBotText = '';
  let currentUtterance = null;
  let speechTimer = null;
  let speechRunId = 0;
  let conversationHistory = [];
  let providerMode = 'local-context';

  // Keep the microphone session alive through natural speaking pauses.
  // Browser SpeechRecognition may end after a short silence, especially on mobile,
  // so we restart it while the user is still in the same speaking turn.
  const SPEECH_PAUSE_MS = 4200;
  const SPEECH_START_GRACE_MS = 10000;
  let recognitionSessionActive = false;
  let recognitionUserStopped = false;
  let recognitionSubmitOnStop = true;
  let recognitionFinalText = '';
  let recognitionInterimText = '';
  let recognitionSilenceTimer = null;
  let recognitionStartTimer = null;
  let recognitionRestartTimer = null;

  const modes = {
    daily: {
      title: 'Daily conversation',
      opening: [
        'Hi! I am your Bolo AI practice partner. How has your day been so far?',
        'Hello! Let us have a relaxed English conversation. What did you do today?',
        'Welcome! Tell me one interesting thing that happened to you this week.'
      ],
      prompts: [
        'What do you usually do in your free time?',
        'What is one habit you would like to improve, and why?',
        'Tell me about a food you really enjoy.',
        'What kind of music or videos do you like?',
        'Describe your ideal weekend.',
        'What is something useful you learned recently?',
        'If you could visit any city in India, where would you go and why?'
      ]
    },
    interview: {
      title: 'Interview practice',
      opening: [
        'Welcome to your interview practice. Please introduce yourself in about thirty seconds.',
        'Let us practise an interview. Start by telling me about yourself and what you are currently learning.'
      ],
      prompts: [
        'What are your strengths?',
        'Tell me about a challenge you faced and how you handled it.',
        'Why should a company choose you for an opportunity?',
        'Describe a project or achievement you are proud of.',
        'How do you work when you have a tight deadline?',
        'What skill are you currently improving?',
        'Where would you like to be professionally in the next few years?'
      ]
    },
    beginner: {
      title: 'Beginner basics',
      opening: [
        'Hi! We will keep the English simple. What is your name, and what do you like to do?',
        'Hello! Let us practise easy English. Tell me about your family or your daily routine.'
      ],
      prompts: [
        'What time do you usually wake up?',
        'What is your favourite food?',
        'Tell me three things you do every day.',
        'What is your favourite place near your home?',
        'What do you like to study or learn?',
        'Describe one of your friends using simple words.',
        'What would you like to do tomorrow?'
      ]
    },
    travel: {
      title: 'Travel English',
      opening: [
        'Imagine you are travelling. Where would you like to go, and what would you like to do there?',
        'Let us practise travel English. You have just arrived at a hotel. Tell me what you would say at reception.'
      ],
      prompts: [
        'How would you ask someone for directions to a railway station?',
        'Imagine your hotel room has a problem. How would you explain it politely?',
        'How would you order a meal at a restaurant?',
        'What questions would you ask before booking a ticket?',
        'Describe your perfect holiday in English.',
        'How would you ask a shopkeeper about price and size?'
      ]
    },
    college: {
      title: 'College & studies',
      opening: [
        'Let us talk about studies. What are you learning these days, and what do you enjoy about it?',
        'Tell me about a subject or skill you would like to become better at.'
      ],
      prompts: [
        'What makes a good teacher in your opinion?',
        'How do you prepare for an exam or an important assignment?',
        'Should students work on projects outside the classroom? Why?',
        'Tell me about a useful skill you learned outside school or college.',
        'How can technology make learning better?',
        'What would you change about the way students are taught?'
      ]
    },
    random: {
      title: 'Random speaking topics',
      opening: [
        'Ready for a random topic? Would you rather live near the mountains or near the sea? Explain your choice.',
        'Here is your first random topic: Is it better to plan everything or be spontaneous? Tell me what you think.'
      ],
      prompts: [
        'If you could learn one skill instantly, what would it be?',
        'Do you think phones make communication better or worse?',
        'What makes a person a good friend?',
        'Would you prefer to work from home or from an office? Why?',
        'What small change could make your city better?',
        'Is travelling more valuable than buying things? Why?',
        'What invention has changed everyday life the most?'
      ]
    }
  };

  const acknowledgements = {
    short: ['Good start.', 'Nice.', 'I understand.', 'Good answer.', 'That makes sense.'],
    medium: ['That is a clear answer.', 'You explained that well.', 'Interesting point.', 'Good job expressing your idea.', 'I like the way you explained that.'],
    long: ['That was a detailed answer, which is excellent speaking practice.', 'You gave a complete explanation. Nice work.', 'That was a strong response with useful detail.']
  };

  const grammarRules = [
    { re: /\bi am agree\b/i, replacement: 'I agree', note: 'Say “I agree,” not “I am agree.”' },
    { re: /\bhe go\b/i, replacement: 'he goes', note: 'With he/she/it in the present simple, use “goes.”' },
    { re: /\bshe go\b/i, replacement: 'she goes', note: 'With he/she/it in the present simple, use “goes.”' },
    { re: /\bpeople is\b/i, replacement: 'people are', note: '“People” normally takes “are,” not “is.”' },
    { re: /\bi didn't went\b/i, replacement: "I didn't go", note: 'After “didn’t,” use the base verb: “go.”' },
    { re: /\bi have went\b/i, replacement: 'I have gone', note: 'Use “have gone,” not “have went.”' },
    { re: /\bmore better\b/i, replacement: 'better', note: 'Use “better” by itself; “more better” is not needed.' },
    { re: /\bdiscuss about\b/i, replacement: 'discuss', note: 'Use “discuss the topic,” not “discuss about the topic.”' },
    { re: /\breturn back\b/i, replacement: 'return', note: '“Return” already means “go back,” so “back” is unnecessary.' },
    { re: /\badvices\b/i, replacement: 'advice', note: '“Advice” is usually uncountable: say “some advice.”' }
  ];

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function setState(state, label) {
    orb.classList.remove('is-listening', 'is-speaking', 'is-thinking');
    if (state) orb.classList.add(`is-${state}`);
    orbStatus.textContent = label;
    micButton.classList.toggle('is-listening', state === 'listening');
  }

  function appendMessage(role, text) {
    const row = document.createElement('div');
    row.className = `ai-message-row ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'ai-message-bubble';
    const who = document.createElement('span');
    who.className = 'ai-message-who';
    who.textContent = role === 'bot' ? 'Bolo AI' : (currentUser?.displayName || currentUser?.username || 'You');
    const content = document.createElement('p');
    content.textContent = text;
    bubble.append(who, content);
    row.appendChild(bubble);
    transcript.appendChild(row);
    transcript.scrollTop = transcript.scrollHeight;
  }

  function populateVoices() {
    if (!synthesis) return;
    voices = synthesis.getVoices();
    const current = voiceSelect.value;
    voiceSelect.innerHTML = '<option value="">Default voice</option>';
    voices
      .filter((voice) => /^en[-_]/i.test(voice.lang) || /english/i.test(voice.name))
      .forEach((voice) => {
        const option = document.createElement('option');
        option.value = voice.name;
        option.textContent = `${voice.name} · ${voice.lang}`;
        voiceSelect.appendChild(option);
      });
    if ([...voiceSelect.options].some((option) => option.value === current)) voiceSelect.value = current;
  }

  function createUtterance(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    const selected = voices.find((voice) => voice.name === voiceSelect.value);
    const fallback = selected || voices.find((voice) => /^en-IN$/i.test(voice.lang)) || voices.find((voice) => /^en[-_]/i.test(voice.lang));
    if (fallback) utterance.voice = fallback;
    utterance.lang = fallback?.lang || 'en-IN';
    utterance.rate = Number(speedInput.value || 1);
    utterance.pitch = 1;
    utterance.volume = 1;
    return utterance;
  }

  function stopCurrentSpeech({ keepState = false } = {}) {
    speechRunId += 1;
    if (speechTimer) {
      clearTimeout(speechTimer);
      speechTimer = null;
    }
    if (currentUtterance) {
      // Chrome often reports our own cancel() as an "interrupted" error.
      // Detach handlers before cancelling so that normal user actions never show a false error.
      currentUtterance.__boloCancelled = true;
      currentUtterance.onstart = null;
      currentUtterance.onend = null;
      currentUtterance.onerror = null;
    }
    try { synthesis?.cancel(); } catch { /* ignore */ }
    currentUtterance = null;
    speaking = false;
    if (!keepState) setState('', 'Ready to practise');
  }

  function speak(text, { force = false } = {}) {
    const clean = String(text || '').trim();
    if (!clean) return;
    lastBotText = clean;
    if (!speakerEnabled || !synthesis || !('SpeechSynthesisUtterance' in window)) {
      setState('', 'Ready to practise');
      return;
    }
    if (!voiceUnlocked && !force) {
      pendingSpeechText = clean;
      setState('', 'Tap “Start voice session”');
      startVoiceButton.hidden = false;
      voiceHelp.hidden = false;
      return;
    }

    pendingSpeechText = '';
    stopCurrentSpeech({ keepState: true });
    const runId = speechRunId;
    try { synthesis.resume(); } catch { /* ignore */ }

    // A tiny delay after cancel() avoids a Chrome/WebKit race where the next
    // utterance is immediately reported as "interrupted".
    speechTimer = window.setTimeout(() => {
      if (runId !== speechRunId || !speakerEnabled) return;
      const utterance = createUtterance(clean);
      currentUtterance = utterance;
      utterance.onstart = () => {
        if (runId !== speechRunId) return;
        speaking = true;
        setState('speaking', 'Bolo AI is speaking');
        clearAlert(alertBox);
      };
      utterance.onend = () => {
        if (runId !== speechRunId) return;
        speaking = false;
        currentUtterance = null;
        setState('', 'Ready to practise');
      };
      utterance.onerror = (event) => {
        if (runId !== speechRunId || utterance.__boloCancelled) return;
        const errorName = String(event?.error || '').toLowerCase();
        speaking = false;
        currentUtterance = null;

        // "interrupted" / "canceled" usually means the learner tapped the mic,
        // changed voice, or started another reply. It is expected, not a failure.
        if (errorName === 'interrupted' || errorName === 'canceled' || errorName === 'cancelled') {
          setState('', 'Ready to practise');
          return;
        }

        setState('', 'Voice could not play');
        showAlert(alertBox, `The browser could not play the bot voice${errorName ? ` (${errorName})` : ''}. Tap “Test voice” or choose another English voice.`, 'error');
      };
      try {
        synthesis.speak(utterance);
      } catch {
        if (runId !== speechRunId) return;
        currentUtterance = null;
        speaking = false;
        setState('', 'Voice could not play');
        showAlert(alertBox, 'The browser could not start the bot voice. Tap “Test voice” or choose another English voice.', 'error');
      }
    }, 90);
  }

  function unlockVoice({ speakPending = true } = {}) {
    if (!synthesis || !('SpeechSynthesisUtterance' in window)) {
      showAlert(alertBox, 'Spoken bot replies are not supported in this browser. Try Chrome or Edge.', 'error');
      return false;
    }
    voiceUnlocked = true;
    startVoiceButton.hidden = true;
    voiceHelp.hidden = true;
    clearAlert(alertBox);
    populateVoices();
    try { synthesis.cancel(); synthesis.resume(); } catch { /* ignore */ }
    const text = speakPending ? (pendingSpeechText || lastBotText || 'Hello! Bolo AI voice is ready.') : 'Hello! Bolo AI voice is working.';
    speak(text, { force: true });
    return true;
  }

  function showCorrection(text) {
    correctionCard.hidden = true;
    if (!correctionToggle.checked || !text) return;
    const rule = grammarRules.find((item) => item.re.test(text));
    if (!rule) return;
    correctionText.textContent = rule.note;
    correctionCard.hidden = false;
  }

  function isQuestion(text) {
    return /\?|\b(what|why|how|when|where|who|which|can|could|would|do|does|did|is|are|should|tell me)\b/i.test(text);
  }

  function nextPrompt() {
    const prompts = modes[modeSelect.value]?.prompts || modes.daily.prompts;
    const available = prompts.filter((prompt) => !recentPrompts.includes(prompt));
    const prompt = pick(available.length ? available : prompts);
    recentPrompts.push(prompt);
    if (recentPrompts.length > Math.max(2, prompts.length - 2)) recentPrompts.shift();
    return prompt;
  }

  function lastAssistantMessage() {
    for (let i = conversationHistory.length - 2; i >= 0; i -= 1) {
      if (conversationHistory[i]?.role === 'assistant') return String(conversationHistory[i].content || '');
    }
    return '';
  }

  function compactTopic(text, max = 70) {
    const clean = String(text || '').trim().replace(/\s+/g, ' ');
    return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
  }

  function basicKnowledgeReply(lower) {
    const facts = [
      [/\b(what is|tell me about|explain) (artificial intelligence|ai)\b/, 'Artificial intelligence, or AI, is technology that lets computers do tasks such as understanding language, recognising patterns, making predictions, and generating content.'],
      [/\b(what is|tell me about|explain) (machine learning|ml)\b/, 'Machine learning is a part of AI where computer systems learn patterns from data instead of being given a separate rule for every situation.'],
      [/\b(what is|tell me about|explain) (large language model|llm)\b/, 'A large language model, or LLM, is an AI model trained on large amounts of text so it can understand and generate language.'],
      [/\b(what is|tell me about|explain) chatgpt\b/, 'ChatGPT is an AI assistant made by OpenAI that can understand prompts and generate useful responses across many topics.'],
      [/\b(what is|tell me about|explain) (computer|a computer)\b/, 'A computer is an electronic machine that processes data and runs programs. People use computers for study, communication, coding, design, entertainment, and many other tasks.'],
      [/\b(what is|tell me about|explain) (the internet|internet)\b/, 'The internet is a global network that connects computers and devices so they can exchange information and use services such as websites, email, messaging, and video calls.'],
      [/\b(what is|tell me about|explain) (programming|coding)\b/, 'Programming means writing instructions that tell a computer what to do. Coding is the practical work of writing those instructions in languages such as JavaScript or Python.'],
      [/\b(what is|tell me about|explain) javascript\b/, 'JavaScript is a programming language widely used to make websites interactive. It can also run on servers with environments such as Node.js.'],
      [/\b(what is|tell me about|explain) python\b/, 'Python is a programming language known for readable syntax. It is commonly used for automation, web development, data work, and AI.'],
      [/\b(what is|tell me about|explain) react\b/, 'React is a JavaScript library for building user interfaces from reusable components, especially for web applications.'],
      [/\b(what is|tell me about|explain) (an api|api)\b/, 'An API is a defined way for one software system to communicate with another. For example, a website can call an API to send data to a server and receive a response.'],
      [/\b(what is|tell me about|explain) (a database|database)\b/, 'A database stores organised information so an application can save, find, update, and manage data reliably.'],
      [/\b(what is|tell me about|explain) sql\b/, 'SQL is a language used to work with relational databases. It is used for tasks such as reading, inserting, updating, and deleting structured data.'],
      [/\b(what is|tell me about|explain) postgresql\b/, 'PostgreSQL is an open-source relational database system known for reliability and strong SQL support.'],
      [/\b(what is|tell me about|explain) (frontend|front end)\b/, 'Frontend development is the part of web development that builds what users see and interact with in the browser.'],
      [/\b(what is|tell me about|explain) (backend|back end)\b/, 'Backend development is the server-side part of an application. It handles business logic, databases, authentication, APIs, and other work users do not directly see.'],
      [/\b(what is|tell me about|explain) english fluency\b/, 'English fluency means being able to communicate smoothly and clearly. It improves through regular speaking, listening, vocabulary, and feedback.']
    ];
    for (const [pattern, answer] of facts) if (pattern.test(lower)) return answer;
    return '';
  }

  function localContextReply(text) {
    const clean = String(text || '').trim();
    const lower = clean.toLowerCase().replace(/[?.!,]/g, ' ').replace(/\s+/g, ' ').trim();
    const words = lower.split(/\s+/).filter(Boolean);
    const firstName = currentUser?.displayName?.split(/\s+/)?.[0] || currentUser?.username || 'there';
    const previousBot = lastAssistantMessage().toLowerCase();

    // Privacy: do not repeat personal details back into the transcript.
    if (/\b\d{10,12}\b/.test(clean) || /\b\S+@\S+\.\S+\b/.test(clean) || /\b(aadhaar|pan number|password|otp|bank account)\b/i.test(clean)) {
      return 'For your privacy, please do not share phone numbers, email addresses, passwords, OTPs, bank details, Aadhaar/PAN details, or other sensitive information here. We can continue without them.';
    }

    // Common natural conversation.
    if (/\b(hi|hello|hey)\b/.test(lower) && /\b(how are you|how r u|what about you|what about u|how about you|how about u)\b/.test(lower)) {
      return `Hi ${firstName}! I’m doing well, thanks for asking. How are you doing today?`;
    }
    if (/\b(how are you|how r u|what about you|what about u|how about you|how about u)\b/.test(lower)) {
      return 'I’m doing well, thanks for asking! I’m ready to chat and practise English with you. How are you feeling today?';
    }
    if (/^(hi|hello|hey|hii|hello there)$/i.test(lower)) {
      return `Hi ${firstName}! Nice to meet you. How are you today?`;
    }
    if (/\b(i am new|i'm new|im new|new here|first time|new user)\b/.test(lower)) {
      return `Welcome, ${firstName}! You can talk to me normally, like a conversation partner. Tell me something about yourself or ask me any everyday question, and I’ll respond as naturally as I can.`;
    }
    if (/\b(what is your name|what's your name|whats your name|who are you|your name)\b/.test(lower)) {
      return 'My name is Bolo AI. I’m the English speaking practice partner inside Bolo English. What would you like to talk about?';
    }
    if (/\b(what model|which model|what ai model|which ai model|what model are you using|which model are you using)\b/.test(lower)) {
      return 'In the free mode, I use Bolo English’s built-in conversation engine with your browser’s speech tools, not a cloud LLM. If the site owner connects an external AI provider, I can use that for more open-ended answers.';
    }
    if (/\b(is this free|are you free|free api|paid api|does this cost|api cost)\b/.test(lower)) {
      return 'This built-in mode does not require a paid AI API. The browser handles speech recognition and voice output, while Bolo English handles the conversation logic.';
    }
    if (/\b(what can you do|how can you help|what do you do)\b/.test(lower)) {
      return 'I can have everyday English conversations, answer common questions, help with speaking practice, and give gentle corrections. In the free local mode, I may not know every factual topic.';
    }
    if (/\b(where are you from|where do you live)\b/.test(lower)) {
      return 'I’m a virtual practice partner, so I don’t have a physical home. I’m available inside Bolo English whenever you want to practise. Where are you from?';
    }
    if (/\b(thank you|thanks|thank u|thx)\b/.test(lower)) {
      return 'You’re welcome! What would you like to talk about next?';
    }
    if (/\b(bye|goodbye|see you|good night|see ya)\b/.test(lower)) {
      return 'Goodbye! It was nice talking with you. Come back anytime you want to practise English.';
    }
    if (/\b(i am|i'm|im) (good|fine|great|okay|ok|well|awesome)\b/.test(lower)) {
      if (/\bwhat about you|what about u|how about you|how about u\b/.test(lower)) return 'I’m doing well too, thank you! What has been the best part of your day so far?';
      return 'Glad to hear that! What has been the best part of your day so far?';
    }
    if (/\b(i am|i'm|im) (sad|tired|bored|nervous|worried|upset)\b/.test(lower)) {
      return 'I understand. We can keep the conversation relaxed. Would you like to talk about what happened, or switch to a lighter topic?';
    }
    if (/\bmy name is\b|\bi am called\b/.test(lower)) {
      const match = clean.match(/\b(?:my name is|i am called)\s+([A-Za-z][A-Za-z'-]{1,30})/i);
      const name = match?.[1] || '';
      return name ? `Nice to meet you, ${name}! I’m Bolo AI. What do you enjoy doing in your free time?` : 'Nice to meet you! Tell me a little about yourself.';
    }

    // Direct requests should receive direct replies, not random practice questions.
    if (/\b(sing|song)\b/.test(lower)) {
      return 'I can’t truly sing with melody, but I can speak a short original rhyme for you: “Speak a little, learn each day; words grow stronger on the way.” Want another original rhyme?';
    }
    if (/\b(tell|say).*(joke)\b|\bmake me laugh\b/.test(lower)) {
      return 'Here’s a small original joke: My vocabulary joined a gym because it wanted stronger sentences. Want another one?';
    }
    if (/\b(tell|make).*(story)\b/.test(lower)) {
      return 'Here’s a tiny original story: A learner was afraid to speak English, so she promised herself one sentence a day. A month later, those little sentences had become full conversations. What kind of story should I tell next?';
    }
    if (/\b(repeat after me|say this|repeat this)\b/.test(lower)) {
      const quoted = clean.match(/["“](.+?)["”]/)?.[1];
      if (quoted) return quoted.slice(0, 180);
      return 'Sure. Tell me the sentence you want me to repeat.';
    }
    if (/\b(ask me something|ask me a question|give me a topic|random topic)\b/.test(lower)) {
      return nextPrompt();
    }
    if (/\b(where should i start|how do i start)\b/.test(lower)) {
      return 'Start with a simple sentence about yourself, your day, your studies, or something you enjoy. I’ll respond to what you actually say and keep the conversation going.';
    }

    // Useful lightweight knowledge for common learning topics.
    const known = basicKnowledgeReply(lower);
    if (known) return `${known} ${/\b(what is|explain|tell me about)\b/.test(lower) ? 'Would you like a simpler example?' : ''}`.trim();

    // Time/date can be answered locally from the user's device.
    if (/\b(what time is it|current time|time now)\b/.test(lower)) {
      return `According to your device, the time is ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
    }
    if (/\b(what is the date|today's date|todays date|what day is it)\b/.test(lower)) {
      return `According to your device, today is ${new Date().toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;
    }
    if (/\b(weather|temperature|forecast)\b/.test(lower)) {
      return 'I can’t check live weather in the free local mode. If you tell me the weather you see, we can practise talking about it in English.';
    }

    // Personal preferences and simple statements.
    const likeMatch = clean.match(/\b(?:i like|i love|i enjoy)\s+(.{2,80})/i);
    if (likeMatch) {
      const topic = compactTopic(likeMatch[1].replace(/[.!?]+$/, ''));
      return `Nice! What do you like most about ${topic}?`;
    }
    const studyMatch = clean.match(/\b(?:i study|i am studying|i'm studying|i learn|i am learning|i'm learning)\s+(.{2,80})/i);
    if (studyMatch) {
      const topic = compactTopic(studyMatch[1].replace(/[.!?]+$/, ''));
      return `That sounds useful. What part of ${topic} are you working on right now?`;
    }
    const fromMatch = clean.match(/\b(?:i am from|i'm from|im from|i live in)\s+(.{2,60})/i);
    if (fromMatch) {
      const place = compactTopic(fromMatch[1].replace(/[.!?]+$/, ''));
      return `Nice! What do you like most about living in ${place}?`;
    }

    // Use the previous bot question so short answers stay connected to context.
    if (/where are you from/.test(previousBot) && words.length <= 8) {
      return `Nice! What do you like most about ${compactTopic(clean)}?`;
    }
    if (/how are you|how are you doing|how are you feeling|how has your day been/.test(previousBot) && words.length <= 12) {
      return `Thanks for telling me. What made you feel ${compactTopic(clean, 35)} today?`;
    }
    if (/what do you (like|enjoy)|what do you enjoy doing|free time/.test(previousBot) && words.length <= 14) {
      return `That sounds interesting. What do you enjoy most about ${compactTopic(clean, 55)}?`;
    }
    if (/what would you like to talk about|what do you want to talk about/.test(previousBot) && words.length <= 14) {
      return `Sure, let’s talk about ${compactTopic(clean, 55)}. What interests you most about it?`;
    }

    // Speech recognition often cuts off a sentence. Ask for a repeat instead of inventing a reply.
    if (words.length <= 2 || /\b(in|on|at|of|with|to|for|from|and|but|or|because)$/i.test(lower)) {
      return 'I think your sentence may have been cut off. Could you say it again in a complete sentence?';
    }

    // Unknown direct questions: be relevant and honest rather than asking an unrelated random prompt.
    if (isQuestion(clean)) {
      return `You asked, “${compactTopic(clean, 95)}” I don’t have enough knowledge in the free local mode to answer that accurately. If you tell me what you already know or what part you want to discuss, I can help you talk about it in English.`;
    }

    // General statements: reflect the user's topic and invite a relevant continuation.
    if (words.length <= 6) {
      return `I understand. You said, “${compactTopic(clean, 70)}” Could you tell me a little more about that?`;
    }
    return `I understand what you’re saying about “${compactTopic(clean, 75)}” What part of that would you like to discuss more?`;
  }

  async function getBotReply(text) {
    conversationHistory.push({ role: 'user', content: text });
    conversationHistory = conversationHistory.slice(-12);
    try {
      const result = await api('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: conversationHistory,
          mode: modeSelect.value,
          levelLabel: levelBadge.textContent
        })
      });
      providerMode = result?.mode || providerMode;
      if (result?.reply) {
        const reply = String(result.reply).trim();
        conversationHistory.push({ role: 'assistant', content: reply });
        conversationHistory = conversationHistory.slice(-12);
        return reply;
      }
    } catch (error) {
      console.warn('Context AI request failed, using local conversation mode:', error);
    }
    const reply = localContextReply(text);
    conversationHistory.push({ role: 'assistant', content: reply });
    conversationHistory = conversationHistory.slice(-12);
    return reply;
  }

  async function processUserTurn(text) {
    const clean = String(text || '').trim().replace(/\s+/g, ' ');
    if (!clean || clean === lastUserText) return;
    lastUserText = clean;
    appendMessage('user', clean);
    turns += 1;
    turnCount.textContent = String(turns);
    showCorrection(clean);
    setState('thinking', 'Bolo AI is thinking');
    try {
      const reply = await getBotReply(clean);
      botTurns += 1;
      appendMessage('bot', reply);
      speak(reply);
    } catch (error) {
      const reply = localContextReply(clean);
      appendMessage('bot', reply);
      speak(reply);
    }
  }

  function clearRecognitionTimers() {
    if (recognitionSilenceTimer) window.clearTimeout(recognitionSilenceTimer);
    if (recognitionStartTimer) window.clearTimeout(recognitionStartTimer);
    if (recognitionRestartTimer) window.clearTimeout(recognitionRestartTimer);
    recognitionSilenceTimer = null;
    recognitionStartTimer = null;
    recognitionRestartTimer = null;
  }

  function updateRecognitionDraft(interim = '') {
    const combined = [recognitionFinalText, interim].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    textInput.value = combined;
  }

  function scheduleRecognitionPauseStop() {
    if (recognitionSilenceTimer) window.clearTimeout(recognitionSilenceTimer);
    recognitionSilenceTimer = window.setTimeout(() => {
      if (recognitionSessionActive) stopRecognition({ submit: true });
    }, SPEECH_PAUSE_MS);
  }

  function finishRecognitionTurn({ submit = true } = {}) {
    const spoken = (recognitionFinalText || recognitionInterimText || textInput.value || '').trim();
    recognitionSessionActive = false;
    recognitionUserStopped = true;
    recognitionSubmitOnStop = submit;
    clearRecognitionTimers();
    listening = false;
    micLabel.textContent = 'Tap to speak';
    setState('', 'Ready to practise');

    const current = recognition;
    recognition = null;
    if (current) {
      try { current.stop(); } catch { /* ignore */ }
    }

    recognitionFinalText = '';
    recognitionInterimText = '';
    if (submit && spoken) {
      textInput.value = '';
      processUserTurn(spoken);
    } else if (!submit) {
      textInput.value = '';
    }
  }

  function stopRecognition({ submit = true } = {}) {
    if (!recognitionSessionActive && !recognition) return;
    finishRecognitionTurn({ submit });
  }

  function launchRecognitionCycle() {
    if (!recognitionSessionActive || recognitionUserStopped || !SpeechRecognition) return;

    const cycle = new SpeechRecognition();
    recognition = cycle;
    cycle.lang = 'en-IN';
    cycle.interimResults = true;
    cycle.continuous = true;
    cycle.maxAlternatives = 1;
    let cycleInterim = '';

    cycle.onstart = () => {
      if (!recognitionSessionActive) return;
      listening = true;
      micLabel.textContent = 'Listening… tap to stop';
      setState('listening', 'Listening — pauses are okay');
    };

    cycle.onresult = (event) => {
      if (!recognitionSessionActive) return;
      let interim = '';
      let heardAnything = false;

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = (event.results[i][0]?.transcript || '').trim();
        if (!piece) continue;
        heardAnything = true;
        if (event.results[i].isFinal) {
          recognitionFinalText = [recognitionFinalText, piece].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
        } else {
          interim += `${piece} `;
        }
      }

      cycleInterim = interim.trim();
      recognitionInterimText = cycleInterim;
      updateRecognitionDraft(cycleInterim);

      if (heardAnything) {
        if (recognitionStartTimer) {
          window.clearTimeout(recognitionStartTimer);
          recognitionStartTimer = null;
        }
        scheduleRecognitionPauseStop();
      }
    };

    cycle.onerror = (event) => {
      if (!recognitionSessionActive) return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        showAlert(alertBox, 'Microphone permission was blocked. Allow microphone access in your browser settings, or type your reply below.', 'error');
        finishRecognitionTurn({ submit: false });
        return;
      }
      if (event.error === 'audio-capture') {
        showAlert(alertBox, 'No microphone was available. Check your microphone and browser permission, or type your reply below.', 'error');
        finishRecognitionTurn({ submit: false });
        return;
      }
      // Chrome may emit no-speech/aborted while we are intentionally keeping a turn open.
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('Speech recognition error:', event.error);
      }
    };

    cycle.onend = () => {
      if (recognition === cycle) recognition = null;
      if (!recognitionSessionActive || recognitionUserStopped) return;

      // Preserve any last interim text if the browser ended the cycle early.
      // A fresh recognition cycle cannot recover that partial transcript, so fold it
      // into the current turn before restarting.
      if (cycleInterim && !recognitionFinalText.endsWith(cycleInterim)) {
        recognitionFinalText = [recognitionFinalText, cycleInterim].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
        recognitionInterimText = '';
        updateRecognitionDraft('');
      }

      // Some browsers stop recognition after about a second of silence. Restart it
      // instead of submitting the user's sentence. The silence timer decides when
      // the whole speaking turn is actually finished.
      recognitionRestartTimer = window.setTimeout(() => {
        recognitionRestartTimer = null;
        launchRecognitionCycle();
      }, 120);
    };

    try {
      cycle.start();
    } catch (error) {
      console.warn('Could not restart speech recognition:', error);
      recognitionRestartTimer = window.setTimeout(() => {
        recognitionRestartTimer = null;
        launchRecognitionCycle();
      }, 350);
    }
  }

  function startRecognition() {
    if (!SpeechRecognition) {
      showAlert(alertBox, 'Voice recognition is not available in this browser. You can still type your reply and hear Bolo AI speak back.', 'error');
      textInput.focus();
      return;
    }

    if (recognitionSessionActive) return;
    if (speaking && synthesis) stopCurrentSpeech({ keepState: true });
    clearAlert(alertBox);

    recognitionSessionActive = true;
    recognitionUserStopped = false;
    recognitionSubmitOnStop = true;
    recognitionFinalText = '';
    recognitionInterimText = '';
    textInput.value = '';

    // Give the user plenty of time to begin speaking after tapping the mic.
    recognitionStartTimer = window.setTimeout(() => {
      if (recognitionSessionActive && !recognitionFinalText && !recognitionInterimText) {
        finishRecognitionTurn({ submit: false });
      }
    }, SPEECH_START_GRACE_MS);

    launchRecognitionCycle();
  }

  function resetConversation() {
    if (synthesis) stopCurrentSpeech({ keepState: true });
    stopRecognition({ submit: false });
    transcript.innerHTML = '';
    correctionCard.hidden = true;
    turns = 0;
    botTurns = 0;
    recentPrompts = [];
    lastUserText = '';
    turnCount.textContent = '0';
    const mode = modes[modeSelect.value] || modes.daily;
    sessionTitle.textContent = mode.title;
    const opening = pick(mode.opening);
    conversationHistory = [{ role: 'assistant', content: opening }];
    appendMessage('bot', opening);
    lastBotText = opening;
    pendingSpeechText = opening;
    if (voiceUnlocked) {
      setState('', 'Ready to practise');
      window.setTimeout(() => speak(opening), 120);
    } else {
      setState('', 'Tap “Start voice session”');
      startVoiceButton.hidden = false;
      voiceHelp.hidden = false;
    }
  }

  async function loadPage() {
    try {
      const { user } = await api('/api/me');
      if (!user) return window.location.replace('/login?next=%2Fai-practice');
      if (user.role === 'admin') {
        currentUser = user;
        levelBadge.textContent = 'Administrator';
      } else {
        const active = user.membership?.status === 'active';
        if (!active) return window.location.replace('/dashboard#pricing-section');
        currentUser = user;
        levelBadge.textContent = user.levelLabel || 'English learner';
        if (Number(user.level) === 1) modeSelect.value = 'beginner';
      }
      populateVoices();
      if (synthesis) synthesis.onvoiceschanged = populateVoices;
      resetConversation();
    } catch (error) {
      showAlert(alertBox, error.message || 'Could not start the AI practice partner.', 'error');
    }
  }

  micButton.addEventListener('click', () => {
    if (recognitionSessionActive || listening) stopRecognition({ submit: true });
    else startRecognition();
  });

  sendButton.addEventListener('click', () => {
    const text = textInput.value.trim();
    if (!text) return;
    textInput.value = '';
    processUserTurn(text);
  });

  textInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendButton.click();
    }
  });

  startVoiceButton.addEventListener('click', () => {
    unlockVoice({ speakPending: true });
  });

  testVoiceButton.addEventListener('click', () => {
    unlockVoice({ speakPending: false });
  });

  voiceSelect.addEventListener('change', () => {
    if (voiceUnlocked) speak('Hello! This is the Bolo AI voice you selected.', { force: true });
  });

  speakerButton.addEventListener('click', () => {
    speakerEnabled = !speakerEnabled;
    speakerButton.setAttribute('aria-pressed', String(speakerEnabled));
    speakerButton.textContent = speakerEnabled ? '🔊 Speaker on' : '🔇 Speaker off';
    if (!speakerEnabled && synthesis) stopCurrentSpeech();
    if (speakerEnabled && voiceUnlocked && lastBotText) speak(lastBotText, { force: true });
  });

  speedInput.addEventListener('input', () => {
    speedValue.textContent = `${Number(speedInput.value).toFixed(2).replace(/0$/, '')}×`;
  });

  modeSelect.addEventListener('change', resetConversation);
  el('ai-new-session').addEventListener('click', resetConversation);

  window.addEventListener('beforeunload', () => {
    if (synthesis) stopCurrentSpeech({ keepState: true });
    stopRecognition({ submit: false });
  });

  if (!SpeechRecognition) {
    el('ai-support-note').textContent = 'Voice recognition is not supported in this browser. Type your reply below; Bolo AI can still speak its response aloud.';
  }

  loadPage();
})();
