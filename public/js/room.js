'use strict';

const code = location.pathname.split('/').filter(Boolean).pop().toUpperCase();
const clientId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const peers = new Map();
const peerInfo = new Map();
const pendingCandidates = new Map();
const audioMonitors = new Map();
let localStream;
let roomData;
let currentUser;
let eventSource;
let audioContext;
let iceServers = [];
let voiceMode = 'webrtc';
let voiceRelaySampleRate = 16000;
let relayFallbackAllowed = true;
let relaySocket = null;
let relayCaptureSource = null;
let relayProcessor = null;
let relaySilentGain = null;
let relayOutputGain = null;
let relayReconnectTimer = null;
let relayReconnectAttempts = 0;
const relayPlayback = new Map();
let hasJoined = false;
let micEnabled = true;
let handRaised = false;
let speakerEnabled = true;
let forcedMuted = false;
let isLeaving = false;
let eventErrors = 0;
let selectedSpeakerId = '';
let mobileView = 'people';
let unreadChats = 0;
let reportTarget = null;
let currentTopic = null;
let topicClockOffsetMs = 0;
let topicRefreshInFlight = false;
let nextTopicRefreshAttemptAt = 0;
let topicTimerId = null;
let accountUpdateSource = null;
let approvalFallbackTimer = null;

const grid = document.getElementById('participant-grid');
const toast = document.getElementById('toast');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatForm = document.getElementById('chat-form');
const joinAlert = document.getElementById('join-alert');
const roomLayout = document.querySelector('.room-layout');
const mobileTabs = document.getElementById('mobile-room-tabs');
const chatUnread = document.getElementById('chat-unread');
const reportModal = document.getElementById('report-modal');
const reportAlert = document.getElementById('report-alert');
const currentTopicElement = document.getElementById('current-topic');
const topicTimerElement = document.getElementById('topic-timer');
const topicProgressBar = document.getElementById('topic-progress-bar');
const topicHelper = document.getElementById('topic-helper');
const rulesConsent = document.getElementById('rules-consent');
const acceptJoinButton = document.getElementById('accept-join');


function syncRoomVisualViewport() {
  const viewport = window.visualViewport;
  const height = Math.max(320, Math.round(viewport?.height || window.innerHeight));
  document.documentElement.style.setProperty('--room-visual-height', `${height}px`);

  const keyboardGap = Math.max(0, window.innerHeight - height - Math.round(viewport?.offsetTop || 0));
  document.body.classList.toggle('keyboard-open', keyboardGap > 120 && matchMedia('(max-width: 760px)').matches);
}

syncRoomVisualViewport();
window.visualViewport?.addEventListener('resize', syncRoomVisualViewport);
window.visualViewport?.addEventListener('scroll', syncRoomVisualViewport);
window.addEventListener('orientationchange', () => window.setTimeout(syncRoomVisualViewport, 150));

function syncJoinButton() {
  if (!acceptJoinButton) return;
  acceptJoinButton.disabled = !(rulesConsent?.checked && roomData);
}

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function profileBadge(name) {
  const icons = ['🎓', '🎧', '🌍', '💬', '📚', '⭐', '🗣️', '🚀'];
  return icons[hashText(name) % icons.length];
}

function avatarMarkup(name, gender = 'male') {
  const seed = hashText(`${name}:${gender}`);
  const skin = ['#f2b08f', '#e9a37f', '#d9946f', '#f4c09d'][seed % 4];
  const shirt = ['#244d84', '#25805c', '#6f4da0', '#a74d5f', '#a86725'][Math.floor(seed / 4) % 5];
  const hair = ['#2f211d', '#4a2d27', '#1e232b', '#5b392a'][Math.floor(seed / 20) % 4];
  const eye = ['#296db7', '#3b8056', '#6b4ca0', '#6d462c'][Math.floor(seed / 80) % 4];
  const female = gender === 'female';
  const hairShape = female
    ? '<path d="M25 49C24 19 40 8 64 8s40 12 39 42c-2-17-11-25-19-29-8 10-27 16-50 16-4 4-7 8-9 12Z"/><path d="M24 43c-4 18-1 41 8 55l11-8c-7-11-7-28-4-42l-15-5Zm80 0c4 18 1 41-8 55l-11-8c7-11 7-28 4-42l15-5Z"/>'
    : '<path d="M25 47C23 22 37 9 61 8c18-1 34 7 42 20l-15-4 8 10-18-7 2 10c-18-8-35-3-55 10Z"/>';
  const accent = female ? '#ef6f9b' : '#5d8ee8';
  return `<svg viewBox="0 0 128 128" role="img" aria-label="Cartoon profile avatar">
    <defs><linearGradient id="shirt-${seed}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${shirt}"/><stop offset="1" stop-color="${accent}"/></linearGradient></defs>
    <circle cx="64" cy="64" r="62" fill="#dcecff"/>
    <path d="M18 128c5-25 22-39 46-39s41 14 46 39" fill="url(#shirt-${seed})"/>
    <path d="M45 81h38v24H45z" fill="${skin}"/>
    <ellipse cx="64" cy="58" rx="38" ry="43" fill="${skin}"/>
    <g fill="${hair}">${hairShape}</g>
    <ellipse cx="28" cy="61" rx="8" ry="12" fill="${skin}"/><ellipse cx="100" cy="61" rx="8" ry="12" fill="${skin}"/>
    <path d="M42 49c7-5 14-5 21-1M66 48c7-4 14-3 20 2" fill="none" stroke="${hair}" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="50" cy="59" rx="8" ry="10" fill="#fff"/><ellipse cx="78" cy="59" rx="8" ry="10" fill="#fff"/>
    <circle cx="51" cy="60" r="4.5" fill="${eye}"/><circle cx="79" cy="60" r="4.5" fill="${eye}"/><circle cx="52" cy="59" r="1.8"/><circle cx="80" cy="59" r="1.8"/>
    <circle cx="53" cy="57" r="1.2" fill="#fff"/><circle cx="81" cy="57" r="1.2" fill="#fff"/>
    <path d="M64 59c-2 9-3 13 3 14" fill="none" stroke="#bd6f5d" stroke-width="2" stroke-linecap="round"/>
    <path d="M51 78c8 7 18 7 26 0" fill="none" stroke="#8e4d4f" stroke-width="2.5" stroke-linecap="round"/>
    ${female ? '<path d="M40 40c12 4 36 2 49-10" fill="none" stroke="' + hair + '" stroke-width="8" stroke-linecap="round"/>' : ''}
  </svg>`;
}

function setAvatar(element, info) {
  if (!element) return;
  element.innerHTML = avatarMarkup(info.displayName || info.username || 'User', info.gender || 'male');
}

function setMobileView(view) {
  mobileView = view === 'chat' ? 'chat' : 'people';
  roomLayout.dataset.mobileView = mobileView;
  mobileTabs?.querySelectorAll('[data-mobile-view]').forEach((button) => {
    const active = button.dataset.mobileView === mobileView;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  if (mobileView === 'chat') {
    unreadChats = 0;
    if (chatUnread) chatUnread.hidden = true;
    requestAnimationFrame(() => { chatMessages.scrollTop = chatMessages.scrollHeight; });
  }
}

function markUnreadChat() {
  if (!matchMedia('(max-width: 760px)').matches || mobileView === 'chat') return;
  unreadChats += 1;
  if (chatUnread) {
    chatUnread.hidden = false;
    chatUnread.textContent = unreadChats > 9 ? '9+' : String(unreadChats);
  }
}

function formatTopicTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function topicNow() {
  return Date.now() + topicClockOffsetMs;
}

function updateTopicCountdown() {
  if (!currentTopic) return;
  const startedAt = Date.parse(currentTopic.startedAt);
  const endsAt = Date.parse(currentTopic.endsAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(endsAt) || endsAt <= startedAt) return;
  const now = topicNow();
  const remaining = Math.max(0, endsAt - now);
  const total = endsAt - startedAt;
  const percentRemaining = Math.max(0, Math.min(100, (remaining / total) * 100));
  if (topicTimerElement) topicTimerElement.textContent = remaining > 0 ? `${formatTopicTime(remaining)} left` : 'Changing topic…';
  if (topicProgressBar) topicProgressBar.style.width = `${percentRemaining}%`;
  if (remaining <= 0 && Date.now() >= nextTopicRefreshAttemptAt) refreshTopic();
}

function renderTopic(topic, announceChange = false) {
  if (!topic?.id || !topic?.text) return;
  const previousId = currentTopic?.id || null;
  const serverNow = Date.parse(topic.serverNow);
  if (Number.isFinite(serverNow)) topicClockOffsetMs = serverNow - Date.now();
  currentTopic = topic;
  if (currentTopicElement) currentTopicElement.textContent = topic.text;
  if (topicHelper) topicHelper.textContent = `Everyone sees the same ${topic.levelLabel || 'English'} topic. It changes automatically every ${topic.intervalMinutes || 10} minutes.`;
  if (!topicTimerId) topicTimerId = setInterval(updateTopicCountdown, 1000);
  updateTopicCountdown();
  if (announceChange && previousId && previousId !== topic.id) notify('New speaking topic is ready.');
}

async function refreshTopic() {
  if (topicRefreshInFlight) return;
  topicRefreshInFlight = true;
  nextTopicRefreshAttemptAt = Date.now() + 5000;
  try {
    const response = await api(`/api/rooms/${code}/topic`);
    renderTopic(response.topic, true);
    nextTopicRefreshAttemptAt = 0;
  } catch (error) {
    console.warn('Topic refresh failed:', error);
    if (topicTimerElement) topicTimerElement.textContent = 'Syncing topic…';
  } finally {
    topicRefreshInFlight = false;
  }
}

function updateCount() {
  const count = hasJoined ? 1 + peerInfo.size : 0;
  document.getElementById('participant-count').textContent = hasJoined ? `${count} participant${count === 1 ? '' : 's'}` : 'Not joined';
}

function remoteCardId(id) {
  return `peer-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

function roleLabel(info) {
  return info?.specialTag || (info?.isAdmin ? 'Administrator' : info?.isOwner ? 'Room owner' : '');
}

function updateParticipantMic(card, enabled, label = null) {
  if (!card) return;
  const badge = card.querySelector('.mic-badge');
  const state = card.querySelector('.mic-state');
  card.classList.toggle('participant-muted', !enabled);
  if (!enabled) card.classList.remove('speaking');
  if (badge) {
    badge.textContent = enabled ? '🎙️' : '🔇';
    badge.classList.toggle('muted', !enabled);
    badge.title = enabled ? 'Microphone on' : 'Microphone muted';
  }
  if (state) state.textContent = label || (enabled ? 'Microphone on' : 'Microphone muted');
}

function updateParticipantHand(card, raised) {
  if (!card) return;
  const badge = card.querySelector('.hand-badge');
  card.classList.toggle('hand-raised', raised === true);
  if (badge) badge.hidden = raised !== true;
}

function updateHandButton() {
  const button = document.getElementById('toggle-hand');
  if (!button) return;
  button.disabled = !hasJoined;
  button.classList.toggle('active', handRaised);
  button.querySelector('.control-icon').textContent = handRaised ? '🙋' : '✋';
  button.querySelector('.control-label').textContent = handRaised ? 'Lower hand' : 'Raise hand';
  updateParticipantHand(document.getElementById('local-card'), handRaised);
}

function currentUserCanModerateRoom() {
  return Boolean(currentUser && roomData?.room && (currentUser.role === 'admin' || currentUser.id === roomData.room.ownerId));
}

function refreshRoomControlVisibility() {
  const bar = document.getElementById('moderator-live-controls');
  if (!bar) return;
  const allowed = currentUserCanModerateRoom();
  bar.hidden = !allowed;
  document.getElementById('moderator-control-title').textContent = currentUser?.role === 'admin' ? 'Administrator controls' : 'Room owner controls';
  bar.querySelectorAll('.admin-only-room-control').forEach((button) => { button.hidden = currentUser?.role !== 'admin'; });
}

function canCurrentUserRemove(info) {
  if (!currentUser || !roomData?.room) return false;
  if (currentUser.role === 'admin') return info?.userId !== currentUser.id;
  return currentUser.id === roomData.room.ownerId && !info?.isAdmin && info?.userId !== currentUser.id;
}

function refreshModerationActions(card, info) {
  if (!card) return;
  const actions = card.querySelector('.moderator-actions');
  if (!actions) return;
  const isAdmin = currentUser?.role === 'admin';
  const isOwner = currentUser?.id === roomData?.room?.ownerId;
  const targetIsAdmin = info?.isAdmin === true;
  const targetIsSelf = info?.userId === currentUser?.id;
  const canModerateTarget = !targetIsSelf && (isAdmin || (isOwner && !targetIsAdmin));
  actions.hidden = !canModerateTarget;
  actions.querySelectorAll('[data-mod="mute"],[data-mod="unmute"],[data-mod="lower-hand"]').forEach((button) => { button.hidden = !canModerateTarget; });
  const makeOwner = actions.querySelector('[data-mod="make-owner"]');
  if (makeOwner) makeOwner.hidden = !isAdmin;
  const removeButton = actions.querySelector('[data-mod="kick"]');
  if (removeButton) removeButton.hidden = !canCurrentUserRemove(info);
}

function ensureRemoteCard(id, info = { displayName: 'Participant' }) {
  let card = document.getElementById(remoteCardId(id));
  if (card) {
    updateRemoteRole(id, info);
    if (typeof info.micEnabled === 'boolean') updateParticipantMic(card, info.micEnabled);
    if (typeof info.handRaised === 'boolean') updateParticipantHand(card, info.handRaised);
    return card;
  }
  peerInfo.set(id, info);
  card = document.createElement('article');
  card.id = remoteCardId(id);
  card.className = 'participant-card';
  card.dataset.clientId = id;
  card.dataset.userId = info.userId || '';
  card.innerHTML = `
    <audio autoplay playsinline></audio>
    <div class="participant-avatar-wrap">
      <div class="speaking-rings" aria-hidden="true"><i></i><i></i><i></i></div>
      <span class="participant-avatar avatar-art" aria-hidden="true"></span>
      <span class="mic-badge ${info.micEnabled === false ? 'muted' : ''}" title="Microphone status">${info.micEnabled === false ? '🔇' : '🎙️'}</span>
      <span class="profile-badge" aria-hidden="true">${profileBadge(info.displayName)}</span>
      <span class="hand-badge" title="Hand raised" ${info.handRaised === true ? '' : 'hidden'}>✋</span>
    </div>
    <strong>${escapeHtml(info.displayName)}</strong>
    <span class="participant-role${info.specialTag ? ' special' : ''}">${escapeHtml(roleLabel(info))}</span>
    <span class="mic-state">${info.micEnabled === false ? 'Microphone muted' : 'Connecting microphone…'}</span>
    <small>Joining audio</small>
    <div class="participant-actions"><button class="report-user-btn" type="button" data-report-user>Report</button></div>
    <div class="moderator-actions" hidden>
      <button class="btn btn-outline btn-tiny" data-mod="mute">Mute</button>
      <button class="btn btn-outline btn-tiny" data-mod="unmute">Allow unmute</button>
      <button class="btn btn-outline btn-tiny" data-mod="lower-hand">Lower hand</button>
      <button class="btn btn-outline btn-tiny" data-mod="make-owner">Make owner</button>
      <button class="btn btn-danger btn-tiny" data-mod="kick">Remove</button>
    </div>`;
  setAvatar(card.querySelector('.participant-avatar'), info);
  refreshModerationActions(card, info);
  grid.appendChild(card);
  updateParticipantMic(card, info.micEnabled !== false);
  updateParticipantHand(card, info.handRaised === true);
  return card;
}

function updateRemoteRole(id, info) {
  const old = peerInfo.get(id) || {};
  const updated = { ...old, ...info };
  peerInfo.set(id, updated);
  const card = document.getElementById(remoteCardId(id));
  if (!card) return;
  card.dataset.userId = updated.userId || card.dataset.userId || '';
  const role = card.querySelector('.participant-role');
  role.textContent = roleLabel(updated);
  role.classList.toggle('special', Boolean(updated.specialTag));
  if (updated.displayName) card.querySelector('strong').textContent = updated.displayName;
  if (info.gender || info.displayName) setAvatar(card.querySelector('.participant-avatar'), updated);
  if (typeof info.handRaised === 'boolean') updateParticipantHand(card, info.handRaised);
  refreshModerationActions(card, updated);
}

function ensureAudioContext() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  return audioContext;
}

function stopSpeakingMonitor(key) {
  const monitor = audioMonitors.get(key);
  if (!monitor) return;
  cancelAnimationFrame(monitor.frame);
  try { monitor.source.disconnect(); } catch {}
  audioMonitors.delete(key);
}

function startSpeakingMonitor(key, stream, card, isEnabled = () => true) {
  stopSpeakingMonitor(key);
  if (!stream?.getAudioTracks().length || !card) return;
  try {
    const context = ensureAudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.72;
    const values = new Uint8Array(analyser.fftSize);
    source.connect(analyser);
    const monitor = { source, analyser, values, frame: 0, quietFrames: 0 };
    const tick = () => {
      analyser.getByteTimeDomainData(values);
      let sum = 0;
      for (const value of values) {
        const normalized = (value - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / values.length);
      const active = isEnabled() && rms > 0.035;
      if (active) monitor.quietFrames = 0;
      else monitor.quietFrames += 1;
      card.classList.toggle('speaking', active || monitor.quietFrames < 10);
      monitor.frame = requestAnimationFrame(tick);
    };
    monitor.frame = requestAnimationFrame(tick);
    audioMonitors.set(key, monitor);
  } catch (error) {
    console.warn('Audio activity indicator unavailable:', error);
  }
}

function preferOpus(pc) {
  try {
    const capabilities = RTCRtpReceiver.getCapabilities?.('audio');
    const transceiver = pc.getTransceivers().find((item) => item.receiver?.track?.kind === 'audio' || item.sender?.track?.kind === 'audio');
    if (!capabilities?.codecs || !transceiver?.setCodecPreferences) return;
    const opus = capabilities.codecs.filter((codec) => /opus/i.test(codec.mimeType));
    const rest = capabilities.codecs.filter((codec) => !/opus/i.test(codec.mimeType));
    if (opus.length) transceiver.setCodecPreferences([...opus, ...rest]);
  } catch (error) {
    console.warn('Opus preference unavailable:', error);
  }
}

async function sendSignal(target, payload) {
  try {
    await api(`/api/rooms/${code}/signal`, { method: 'POST', body: JSON.stringify({ clientId, target, ...payload }) });
  } catch (error) {
    console.error(error);
  }
}

async function applySpeakerToAudio(audio) {
  if (!audio) return;
  audio.muted = !speakerEnabled;
  if (selectedSpeakerId && typeof audio.setSinkId === 'function') {
    try { await audio.setSinkId(selectedSpeakerId); } catch (error) { console.warn(error); }
  }
  if (speakerEnabled) audio.play().catch(() => {});
}


function downsampleAudio(input, inputRate, outputRate) {
  if (outputRate >= inputRate) return input.slice();
  const ratio = inputRate / outputRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);
  let inputOffset = 0;
  for (let outputOffset = 0; outputOffset < outputLength; outputOffset += 1) {
    const nextInputOffset = Math.min(input.length, Math.round((outputOffset + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let index = inputOffset; index < nextInputOffset; index += 1) {
      sum += input[index];
      count += 1;
    }
    output[outputOffset] = count ? sum / count : 0;
    inputOffset = nextInputOffset;
  }
  return output;
}

function floatToInt16(floatSamples) {
  const pcm = new Int16Array(floatSamples.length);
  for (let index = 0; index < floatSamples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, floatSamples[index]));
    pcm[index] = value < 0 ? Math.round(value * 32768) : Math.round(value * 32767);
  }
  return pcm;
}

function ensureRelayOutput() {
  const context = ensureAudioContext();
  if (!relayOutputGain) {
    relayOutputGain = context.createGain();
    relayOutputGain.gain.value = speakerEnabled ? 1 : 0;
    relayOutputGain.connect(context.destination);
  }
  return relayOutputGain;
}

function stopRelayCapture() {
  try { relayCaptureSource?.disconnect(); } catch {}
  try { relayProcessor?.disconnect(); } catch {}
  try { relaySilentGain?.disconnect(); } catch {}
  relayCaptureSource = null;
  relayProcessor = null;
  relaySilentGain = null;
}

function startRelayCapture() {
  stopRelayCapture();
  if (!localStream?.getAudioTracks().length || !relaySocket || relaySocket.readyState !== WebSocket.OPEN) return;
  const context = ensureAudioContext();
  const source = context.createMediaStreamSource(localStream);
  const processor = context.createScriptProcessor(2048, 1, 1);
  const silentGain = context.createGain();
  silentGain.gain.value = 0;
  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(context.destination);
  processor.onaudioprocess = (event) => {
    if (!hasJoined || !micEnabled || forcedMuted || !relaySocket || relaySocket.readyState !== WebSocket.OPEN) return;
    const input = event.inputBuffer.getChannelData(0);
    const downsampled = downsampleAudio(input, context.sampleRate, voiceRelaySampleRate);
    const pcm = floatToInt16(downsampled);
    if (pcm.byteLength > 0) relaySocket.send(pcm.buffer);
  };
  relayCaptureSource = source;
  relayProcessor = processor;
  relaySilentGain = silentGain;
}

function markRelaySpeaking(senderId, samples) {
  const card = document.getElementById(remoteCardId(senderId));
  if (!card) return;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const normalized = samples[index] / 32768;
    sum += normalized * normalized;
  }
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  if (rms < 0.02 || peerInfo.get(senderId)?.micEnabled === false || !speakerEnabled) return;
  card.classList.add('speaking');
  const state = relayPlayback.get(senderId) || {};
  clearTimeout(state.speakTimer);
  state.speakTimer = setTimeout(() => card.classList.remove('speaking'), 180);
  relayPlayback.set(senderId, state);
}

function playRelayPacket(arrayBuffer) {
  if (!speakerEnabled || !(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength < 4) return;
  const bytes = new Uint8Array(arrayBuffer);
  const idLength = bytes[0];
  if (!idLength || arrayBuffer.byteLength <= 1 + idLength + 1) return;
  const senderId = new TextDecoder().decode(bytes.slice(1, 1 + idLength));
  if (!senderId || senderId === clientId) return;
  const pcmBytes = arrayBuffer.slice(1 + idLength);
  const sampleCount = Math.floor(pcmBytes.byteLength / 2);
  if (!sampleCount) return;
  const samples = new Int16Array(pcmBytes, 0, sampleCount);
  const info = peerInfo.get(senderId) || { clientId: senderId, displayName: 'Participant', micEnabled: true };
  const card = ensureRemoteCard(senderId, info);
  card.classList.add('connected');
  card.querySelector('small').textContent = 'Secure relay connected';
  markRelaySpeaking(senderId, samples);

  const context = ensureAudioContext();
  const output = ensureRelayOutput();
  const buffer = context.createBuffer(1, sampleCount, voiceRelaySampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < sampleCount; index += 1) channel[index] = samples[index] / 32768;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(output);
  const state = relayPlayback.get(senderId) || { nextTime: 0 };
  let startAt = Math.max(context.currentTime + 0.055, state.nextTime || 0);
  if (startAt > context.currentTime + 0.6) startAt = context.currentTime + 0.055;
  state.nextTime = startAt + buffer.duration;
  relayPlayback.set(senderId, state);
  source.start(startAt);
}

function stopRelayVoice() {
  clearTimeout(relayReconnectTimer);
  relayReconnectTimer = null;
  stopRelayCapture();
  if (relaySocket) {
    const socket = relaySocket;
    relaySocket = null;
    try { socket.close(1000, 'Leaving room'); } catch {}
  }
  for (const state of relayPlayback.values()) clearTimeout(state.speakTimer);
  relayPlayback.clear();
}

function activateRelayFallback(message = 'Switching everyone to secure relay voice…') {
  if (voiceMode === 'relay' || !relayFallbackAllowed || isLeaving) return;
  voiceMode = 'relay';
  for (const pc of peers.values()) try { pc.close(); } catch {}
  peers.clear();
  pendingCandidates.clear();
  document.getElementById('voice-tech').textContent = 'Secure WSS voice relay';
  document.getElementById('voice-network-label').textContent = 'Switching to cross-network relay…';
  document.getElementById('voice-network-banner').classList.add('ready');
  for (const [id, info] of peerInfo) {
    const card = ensureRemoteCard(id, info);
    card.querySelector('small').textContent = 'Switching voice route…';
  }
  notify(message);
  startRelayVoice();
}

function startRelayVoice() {
  if (!hasJoined || isLeaving || voiceMode !== 'relay') return;
  if (relaySocket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(relaySocket.readyState)) return;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${location.host}/api/rooms/${code}/voice-relay?clientId=${encodeURIComponent(clientId)}`);
  socket.binaryType = 'arraybuffer';
  relaySocket = socket;
  socket.addEventListener('open', () => {
    relayReconnectAttempts = 0;
    document.getElementById('local-connection').textContent = 'Secure relay connected';
    document.getElementById('voice-network-label').textContent = 'Secure cross-network relay active';
    document.getElementById('voice-network-banner').classList.add('ready');
    startRelayCapture();
  });
  socket.addEventListener('message', (event) => playRelayPacket(event.data));
  socket.addEventListener('close', () => {
    if (relaySocket === socket) relaySocket = null;
    stopRelayCapture();
    if (!hasJoined || isLeaving) return;
    document.getElementById('local-connection').textContent = 'Reconnecting voice…';
    relayReconnectAttempts += 1;
    const delay = Math.min(6000, 900 * relayReconnectAttempts);
    clearTimeout(relayReconnectTimer);
    relayReconnectTimer = setTimeout(startRelayVoice, delay);
  });
  socket.addEventListener('error', () => {
    document.getElementById('voice-network-label').textContent = 'Voice relay reconnecting…';
  });
}

function createPeer(id, initiator, info = { displayName: 'Participant' }) {
  if (peers.has(id)) return peers.get(id);
  peerInfo.set(id, { ...(peerInfo.get(id) || {}), ...info });
  const pc = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle' });
  peers.set(id, pc);
  const card = ensureRemoteCard(id, peerInfo.get(id));
  const audio = card.querySelector('audio');
  const detail = card.querySelector('small');
  localStream?.getAudioTracks().forEach((track) => pc.addTrack(track, localStream));
  preferOpus(pc);
  pc.ontrack = (event) => {
    const stream = event.streams[0] || new MediaStream([event.track]);
    audio.srcObject = stream;
    applySpeakerToAudio(audio);
    detail.textContent = 'Connected';
    card.classList.add('connected');
    const infoNow = peerInfo.get(id) || {};
    updateParticipantMic(card, infoNow.micEnabled !== false);
    startSpeakingMonitor(`remote:${id}`, stream, card, () => (peerInfo.get(id)?.micEnabled !== false) && speakerEnabled);
  };
  pc.onicecandidate = (event) => {
    if (event.candidate) sendSignal(id, { candidate: event.candidate.toJSON?.() || event.candidate });
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') {
      detail.textContent = 'Connected';
      card.classList.add('connected');
    } else if (pc.connectionState === 'failed') {
      detail.textContent = 'Changing voice route…';
      activateRelayFallback();
    } else if (pc.connectionState === 'disconnected') detail.textContent = 'Reconnecting…';
  };
  if (initiator) {
    pc.createOffer({ offerToReceiveAudio: true })
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => sendSignal(id, { description: pc.localDescription }))
      .catch((error) => notify(error.message));
  }
  updateCount();
  return pc;
}

async function flushCandidates(id, pc) {
  for (const candidate of pendingCandidates.get(id) || []) {
    try { await pc.addIceCandidate(candidate); } catch (error) { console.error(error); }
  }
  pendingCandidates.delete(id);
}

function removePeer(id) {
  stopSpeakingMonitor(`remote:${id}`);
  peers.get(id)?.close();
  peers.delete(id);
  peerInfo.delete(id);
  pendingCandidates.delete(id);
  document.getElementById(remoteCardId(id))?.remove();
  updateCount();
}

function audioConstraints(deviceId = '') {
  const supported = navigator.mediaDevices?.getSupportedConstraints?.() || {};
  const audio = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: { ideal: 48000 },
    latency: { ideal: 0.02 },
    ...(deviceId ? { deviceId: { exact: deviceId } } : {})
  };
  if (supported.voiceIsolation) audio.voiceIsolation = true;
  return audio;
}

async function getMicrophone(deviceId = '') {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Use an updated Chrome, Edge, or Safari browser.');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(deviceId), video: false });
    const track = stream.getAudioTracks()[0];
    if (track) track.contentHint = 'speech';
    return stream;
  } catch (error) {
    if (error.name === 'NotAllowedError') throw new Error('Allow microphone permission and try again.');
    if (error.name === 'NotFoundError') throw new Error('No microphone was found.');
    if (error.name === 'OverconstrainedError') throw new Error('That microphone is unavailable. Choose another source.');
    throw new Error('The microphone could not start.');
  }
}

async function populateAudioDevices(preferredMic = '') {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const micSelect = document.getElementById('mic-select');
  const speakerSelect = document.getElementById('speaker-select');
  const currentMic = preferredMic || localStream?.getAudioTracks()[0]?.getSettings?.().deviceId || '';
  const inputs = devices.filter((device) => device.kind === 'audioinput');
  micSelect.innerHTML = '';
  (inputs.length ? inputs : [{ deviceId: '', label: 'Default microphone' }]).forEach((device, index) => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = device.label || `Microphone ${index + 1}`;
    option.selected = device.deviceId === currentMic;
    micSelect.appendChild(option);
  });

  const outputs = devices.filter((device) => device.kind === 'audiooutput');
  const mediaSinkSupported = typeof HTMLMediaElement.prototype.setSinkId === 'function';
  const contextSinkSupported = typeof audioContext?.setSinkId === 'function';
  const supported = mediaSinkSupported || contextSinkSupported;
  speakerSelect.disabled = !supported;
  speakerSelect.innerHTML = '';
  const list = outputs.length ? outputs : [{ deviceId: '', label: supported ? 'Default speaker' : 'System speaker' }];
  list.forEach((device, index) => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = device.label || `Speaker ${index + 1}`;
    option.selected = device.deviceId === selectedSpeakerId;
    speakerSelect.appendChild(option);
  });
  if (!supported) document.getElementById('speaker-support-note').textContent = 'This browser uses the phone or computer system audio output. Speaker on/off still works.';
  else if (voiceMode === 'relay' && contextSinkSupported) document.getElementById('speaker-support-note').textContent = 'Secure relay voice is active. Choose an output supported by this browser.';
}

async function switchMicrophone(deviceId) {
  if (!hasJoined) return;
  try {
    const stream = await getMicrophone(deviceId);
    const track = stream.getAudioTracks()[0];
    track.enabled = micEnabled && !forcedMuted;
    await Promise.allSettled([...peers.values()].map((pc) => {
      const sender = pc.getSenders().find((item) => item.track?.kind === 'audio');
      return sender ? sender.replaceTrack(track) : Promise.resolve(pc.addTrack(track, stream));
    }));
    localStream?.getTracks().forEach((item) => item.stop());
    localStream = stream;
    if (voiceMode === 'relay') startRelayCapture();
    startSpeakingMonitor('local', localStream, document.getElementById('local-card'), () => micEnabled && !forcedMuted);
    await populateAudioDevices(deviceId);
    notify('Microphone changed.');
  } catch (error) {
    notify(error.message);
  }
}

async function switchSpeaker(deviceId) {
  selectedSpeakerId = deviceId || '';
  try {
    if (voiceMode === 'relay' && typeof audioContext?.setSinkId === 'function') {
      await audioContext.setSinkId(selectedSpeakerId || '');
      return notify('Speaker source changed.');
    }
    const audios = [...grid.querySelectorAll('audio')];
    if (!audios.length) return notify('Speaker source saved for new participants.');
    if (typeof HTMLMediaElement.prototype.setSinkId !== 'function') return notify('Speaker source is controlled by your device on this browser.');
    await Promise.all(audios.map((audio) => audio.setSinkId(selectedSpeakerId)));
    notify('Speaker source changed.');
  } catch {
    notify('This speaker source is unavailable.');
  }
}

async function publishMicState() {
  if (!hasJoined) return;
  try {
    await api(`/api/rooms/${code}/presence`, { method: 'POST', body: JSON.stringify({ clientId, micEnabled: micEnabled && !forcedMuted, handRaised }) });
  } catch (error) {
    console.warn(error);
  }
}

async function copyInvite() {
  const link = roomData?.inviteUrl || location.href;
  try {
    await navigator.clipboard.writeText(link);
    notify('Invite link copied.');
  } catch {
    prompt('Copy invite link:', link);
  }
}

function appendChat(message) {
  document.querySelector('.chat-empty')?.remove();
  const article = document.createElement('article');
  article.className = `chat-message${message.userId === currentUser?.id ? ' mine' : ''}`;
  article.innerHTML = `<div class="chat-meta"><strong>${escapeHtml(message.username)}${message.specialTag ? ` <em class="chat-special-tag">${escapeHtml(message.specialTag)}</em>` : ''}</strong><span>${new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div><p>${escapeHtml(message.text)}</p>`;
  chatMessages.appendChild(article);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  if (message.userId !== currentUser?.id) markUnreadChat();
}

function applyOwner(ownerId, ownerName) {
  if (roomData) {
    roomData.room.ownerId = ownerId;
    roomData.room.ownerName = ownerName;
  }
  document.getElementById('room-owner').textContent = ownerName || '—';
  document.getElementById('local-role').textContent = currentUser?.role === 'admin' ? 'Administrator' : currentUser?.id === ownerId ? 'Room owner' : '';
  for (const [id, info] of peerInfo) {
    updateRemoteRole(id, { isOwner: info.userId === ownerId });
    refreshModerationActions(document.getElementById(remoteCardId(id)), { ...info, isOwner: info.userId === ownerId });
  }
  refreshRoomControlVisibility();
  for (const [id, info] of peerInfo) refreshModerationActions(document.getElementById(remoteCardId(id)), info);
  notify(`${ownerName} is now the room owner.`);
}

async function moderate(action, targetClientId = null) {
  try {
    await api(`/api/rooms/${code}/moderate`, { method: 'POST', body: JSON.stringify({ action, targetClientId }) });
    notify('Room moderation applied.');
  } catch (error) {
    notify(error.message);
  }
}

function connectEvents() {
  eventSource = new EventSource(`/api/rooms/${code}/events?clientId=${encodeURIComponent(clientId)}`);
  eventSource.addEventListener('open', () => {
    eventErrors = 0;
    document.getElementById('local-connection').textContent = voiceMode === 'relay' ? 'Connecting secure relay…' : 'Connected';
    if (voiceMode === 'relay') startRelayVoice();
    publishMicState();
  });
  eventSource.addEventListener('existing-peers', (event) => {
    for (const peer of JSON.parse(event.data).peers || []) {
      if (voiceMode === 'webrtc') createPeer(peer.clientId, true, peer);
      else { const card = ensureRemoteCard(peer.clientId, peer); card.querySelector('small').textContent = 'Secure relay ready'; }
    }
    updateCount();
  });
  eventSource.addEventListener('peer-joined', (event) => {
    const peer = JSON.parse(event.data);
    const card = ensureRemoteCard(peer.clientId, peer);
    if (voiceMode === 'relay') card.querySelector('small').textContent = 'Secure relay ready';
    updateCount();
    notify(`${peer.displayName} joined.`);
  });
  eventSource.addEventListener('signal', async (event) => {
    const data = JSON.parse(event.data);
    if (voiceMode !== 'webrtc') return;
    try {
      const pc = createPeer(data.from, false, data);
      if (data.description) {
        await pc.setRemoteDescription(data.description);
        await flushCandidates(data.from, pc);
        if (data.description.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal(data.from, { description: pc.localDescription });
        }
      }
      if (data.candidate) {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
        else {
          const queue = pendingCandidates.get(data.from) || [];
          queue.push(data.candidate);
          pendingCandidates.set(data.from, queue);
        }
      }
    } catch (error) {
      console.error(error);
      notify('Participant connection error.');
    }
  });
  eventSource.addEventListener('mic-state', (event) => {
    const data = JSON.parse(event.data);
    const info = peerInfo.get(data.clientId) || {};
    info.micEnabled = data.micEnabled === true;
    peerInfo.set(data.clientId, info);
    updateParticipantMic(document.getElementById(remoteCardId(data.clientId)), info.micEnabled);
  });
  eventSource.addEventListener('hand-state', (event) => {
    const data = JSON.parse(event.data);
    const info = peerInfo.get(data.clientId) || {};
    info.handRaised = data.handRaised === true;
    peerInfo.set(data.clientId, info);
    updateParticipantHand(document.getElementById(remoteCardId(data.clientId)), info.handRaised);
    if (info.handRaised) notify(`${info.displayName || 'A participant'} raised a hand.`);
  });
  eventSource.addEventListener('profile-updated', (event) => {
    const info = JSON.parse(event.data || '{}');
    if (info.clientId === clientId) {
      currentUser.displayName = info.displayName || currentUser.displayName;
      currentUser.specialTag = info.specialTag || '';
      document.getElementById('local-label').textContent = `${currentUser.displayName} (You)`;
      const localRole = document.getElementById('local-role');
      localRole.textContent = currentUser.specialTag || (currentUser.role === 'admin' ? 'Administrator' : currentUser.id === roomData.room.ownerId ? 'Room owner' : '');
      localRole.classList.toggle('special', Boolean(currentUser.specialTag));
      setAvatar(document.getElementById('local-avatar'), currentUser);
      notify('Your special name or tag was updated by the administrator.');
    } else updateRemoteRole(info.clientId, info);
  });
  eventSource.addEventListener('peer-left', (event) => {
    const data = JSON.parse(event.data);
    removePeer(data.clientId);
    notify(`${data.displayName || 'A participant'} left.`);
  });
  eventSource.addEventListener('chat-history', (event) => {
    const messages = JSON.parse(event.data).messages || [];
    chatMessages.innerHTML = messages.length ? '' : '<div class="chat-empty">No messages yet.</div>';
    messages.forEach(appendChat);
  });
  eventSource.addEventListener('topic', (event) => {
    const data = JSON.parse(event.data);
    renderTopic(data.topic, true);
  });
  eventSource.addEventListener('chat', (event) => appendChat(JSON.parse(event.data).message));
  eventSource.addEventListener('owner-changed', (event) => {
    const data = JSON.parse(event.data);
    applyOwner(data.ownerId, data.ownerName);
  });
  eventSource.addEventListener('voice-mode', (event) => {
    const data = JSON.parse(event.data);
    if (data.mode === 'relay') activateRelayFallback('Secure relay voice is now active for this room.');
  });
  eventSource.addEventListener('room-updated', (event) => {
    const data = JSON.parse(event.data);
    if (!data.room) return;
    roomData.room = data.room;
    document.getElementById('room-capacity').textContent = `Limit ${data.room.capacity} · ${data.room.isLocked ? 'Locked' : 'Open'}`;
    document.getElementById('room-title').textContent = data.room.title;
  });
  eventSource.addEventListener('moderation', (event) => {
    const data = JSON.parse(event.data);
    if (data.action === 'mute') {
      forcedMuted = true;
      micEnabled = false;
      localStream?.getAudioTracks().forEach((track) => { track.enabled = false; });
      updateMicButton();
      publishMicState();
    } else if (data.action === 'unmute') {
      forcedMuted = false;
      updateMicButton();
      notify(data.message);
    } else if (data.action === 'lower-hand') {
      handRaised = false;
      updateHandButton();
      publishMicState();
      notify(data.message);
    } else if (['kick', 'close'].includes(data.action)) {
      notify(data.message);
      setTimeout(leaveCall, 1000);
    }
    notify(data.message || 'Administrator action applied.');
  });
  eventSource.addEventListener('room-error', (event) => {
    notify(JSON.parse(event.data).message || 'Room access ended.');
    setTimeout(() => { location.href = '/dashboard#pricing-section'; }, 1800);
  });
  eventSource.onerror = () => {
    if (isLeaving) return;
    if (++eventErrors >= 4) {
      eventSource.close();
      notify('Room connection could not be restored.');
    } else notify('Reconnecting…');
  };
}

function updateMicButton() {
  const button = document.getElementById('toggle-mic');
  button.classList.toggle('off', !micEnabled || forcedMuted);
  button.querySelector('.control-icon').textContent = micEnabled && !forcedMuted ? '🎙️' : '🔇';
  button.querySelector('.control-label').textContent = forcedMuted ? 'Moderator muted' : micEnabled ? 'Mute' : 'Unmute';
  button.disabled = !hasJoined || forcedMuted;
  const label = forcedMuted ? 'Muted by moderator' : micEnabled ? 'Microphone on' : 'Microphone muted';
  updateParticipantMic(document.getElementById('local-card'), micEnabled && !forcedMuted, label);
}

function updateSpeakerButton() {
  const button = document.getElementById('toggle-speaker');
  button.classList.toggle('off', !speakerEnabled);
  button.querySelector('.control-icon').textContent = speakerEnabled ? '🔊' : '🔇';
  button.querySelector('.control-label').textContent = speakerEnabled ? 'Speaker on' : 'Speaker off';
  if (relayOutputGain) relayOutputGain.gain.value = speakerEnabled ? 1 : 0;
  grid.querySelectorAll('audio').forEach((audio) => {
    audio.muted = !speakerEnabled;
    if (speakerEnabled) audio.play().catch(() => {});
  });
  if (!speakerEnabled) grid.querySelectorAll('.participant-card:not(.local)').forEach((card) => card.classList.remove('speaking'));
}

async function joinCall() {
  if (hasJoined) return;
  const button = document.getElementById('accept-join');
  setBusy(button, true, 'Starting microphone…');
  try {
    if (roomData.currentParticipants >= roomData.maxParticipants) throw new Error(`Room full. Limit ${roomData.maxParticipants}.`);
    ensureAudioContext();
    localStream = await getMicrophone();
    hasJoined = true;
    document.getElementById('join-modal').classList.remove('show');
    chatInput.disabled = false;
    chatForm.querySelector('button').disabled = false;
    startSpeakingMonitor('local', localStream, document.getElementById('local-card'), () => micEnabled && !forcedMuted);
    updateMicButton();
    updateSpeakerButton();
    updateHandButton();
    updateCount();
    await populateAudioDevices();
    connectEvents();
    await publishMicState();
  } catch (error) {
    showAlert(joinAlert, error.message);
    setBusy(button, false);
  }
}

function leaveCall() {
  if (isLeaving) return;
  isLeaving = true;
  eventSource?.close();
  if (hasJoined) fetch(`/api/rooms/${code}/leave`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId }), keepalive: true }).catch(() => {});
  stopRelayVoice();
  peers.forEach((pc) => pc.close());
  audioMonitors.forEach((_, key) => stopSpeakingMonitor(key));
  localStream?.getTracks().forEach((track) => track.stop());
  audioContext?.close().catch(() => {});
  if (topicTimerId) clearInterval(topicTimerId);
  topicTimerId = null;
  location.href = '/dashboard';
}

function openReport(card) {
  const id = card.dataset.clientId;
  const info = peerInfo.get(id);
  if (!info?.userId) return notify('This participant is not available to report.');
  reportTarget = { clientId: id, userId: info.userId, displayName: info.displayName, gender: info.gender };
  document.getElementById('report-target-name').textContent = info.displayName;
  setAvatar(document.getElementById('report-avatar'), info);
  document.getElementById('report-complaint').value = '';
  clearAlert(reportAlert);
  reportModal.classList.add('show');
  setTimeout(() => document.getElementById('report-complaint').focus(), 50);
}

function closeReport() {
  reportTarget = null;
  reportModal.classList.remove('show');
  clearAlert(reportAlert);
}

async function submitReport() {
  const complaint = document.getElementById('report-complaint').value.trim();
  if (!reportTarget) return;
  if (complaint.length < 10) return showAlert(reportAlert, 'Write at least 10 characters explaining what happened.');
  const button = document.getElementById('submit-report');
  setBusy(button, true, 'Sending…');
  try {
    const result = await api(`/api/rooms/${code}/report`, { method: 'POST', body: JSON.stringify({ clientId, targetUserId: reportTarget.userId, complaint }) });
    showAlert(reportAlert, result.message || 'Report sent to the administrator.', 'success');
    setTimeout(closeReport, 1200);
  } catch (error) {
    showAlert(reportAlert, error.message);
  } finally {
    setBusy(button, false);
  }
}

async function initialise() {
  try {
    const [{ user, accessApproved }, response] = await Promise.all([api('/api/me'), api(`/api/rooms/${code}`)]);
    if (!user || !accessApproved) return location.href = '/dashboard#pricing-section';
    currentUser = user;
    roomData = response;
    syncJoinButton();
    iceServers = response.iceServers || [];
    voiceMode = response.voiceMode === 'relay' ? 'relay' : 'webrtc';
    voiceRelaySampleRate = Number(response.voiceRelaySampleRate) || 16000;
    relayFallbackAllowed = response.relayFallbackAllowed !== false;
    document.getElementById('voice-tech').textContent = voiceMode === 'relay' ? 'Secure WSS voice relay' : (response.turnConfigured ? 'WebRTC · Opus · TURN ready' : 'WebRTC · Opus');
    document.getElementById('voice-network-label').textContent = voiceMode === 'relay' ? 'Cross-network relay selected' : (response.turnConfigured ? 'TURN relay available' : 'Direct WebRTC connection');
    document.getElementById('voice-network-banner').classList.toggle('ready', voiceMode === 'relay' || response.turnConfigured);
    renderTopic(response.topic);
    document.getElementById('room-title').textContent = response.room.title;
    document.getElementById('room-code').textContent = response.room.code;
    document.getElementById('room-level').textContent = response.room.levelLabel;
    document.getElementById('room-owner').textContent = response.room.ownerName;
    document.getElementById('room-capacity').textContent = `Limit ${response.maxParticipants} · ${response.room.isLocked ? 'Locked' : 'Open'}`;
    document.getElementById('local-label').textContent = `${user.displayName} (You)`;
    setAvatar(document.getElementById('local-avatar'), user);
    document.getElementById('local-profile-badge').textContent = profileBadge(user.displayName);
    document.getElementById('local-role').textContent = user.specialTag || (user.role === 'admin' ? 'Administrator' : user.id === response.room.ownerId ? 'Room owner' : '');
    document.getElementById('local-role').classList.toggle('special', Boolean(user.specialTag));
    refreshRoomControlVisibility();
    document.title = `${response.room.title} | Bolo English`;
  } catch (error) {
    showAlert(joinAlert, error.message);
    document.getElementById('accept-join').disabled = true;
  }
}

rulesConsent?.addEventListener('change', syncJoinButton);
acceptJoinButton?.addEventListener('click', joinCall);
document.getElementById('toggle-mic').addEventListener('click', async () => {
  if (forcedMuted) return notify('Administrator must allow unmute.');
  micEnabled = !micEnabled;
  localStream?.getAudioTracks().forEach((track) => { track.enabled = micEnabled; });
  updateMicButton();
  await publishMicState();
});
document.getElementById('toggle-hand').addEventListener('click', async () => {
  if (!hasJoined) return;
  handRaised = !handRaised;
  updateHandButton();
  await publishMicState();
  notify(handRaised ? 'Your hand is raised.' : 'Your hand is lowered.');
});
document.getElementById('toggle-speaker').addEventListener('click', () => {
  speakerEnabled = !speakerEnabled;
  updateSpeakerButton();
});
document.getElementById('toggle-settings').addEventListener('click', (event) => {
  const settings = document.getElementById('mic-settings');
  settings.hidden = !settings.hidden;
  event.currentTarget.setAttribute('aria-expanded', String(!settings.hidden));
});
document.getElementById('mic-select').addEventListener('change', (event) => switchMicrophone(event.target.value));
document.getElementById('speaker-select').addEventListener('change', (event) => switchSpeaker(event.target.value));
document.getElementById('copy-invite').addEventListener('click', copyInvite);
document.getElementById('share-invite').addEventListener('click', copyInvite);
document.getElementById('leave-call').addEventListener('click', leaveCall);
document.getElementById('moderator-live-controls').addEventListener('click', (event) => {
  const button = event.target.closest('[data-room-moderate]');
  if (button && confirm(`Apply ${button.dataset.roomModerate} to this room?`)) moderate(button.dataset.roomModerate);
});
grid.addEventListener('click', (event) => {
  const reportButton = event.target.closest('[data-report-user]');
  if (reportButton) return openReport(reportButton.closest('[data-client-id]'));
  const button = event.target.closest('[data-mod]');
  if (!button) return;
  const card = button.closest('[data-client-id]');
  if (card && confirm(`Apply ${button.dataset.mod} to this participant?`)) moderate(button.dataset.mod, card.dataset.clientId);
});
chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !hasJoined) return;
  try {
    await api(`/api/rooms/${code}/chat`, { method: 'POST', body: JSON.stringify({ clientId, text }) });
    chatInput.value = '';
  } catch (error) {
    notify(error.message);
  }
});
mobileTabs?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-mobile-view]');
  if (button) setMobileView(button.dataset.mobileView);
});
document.getElementById('cancel-report').addEventListener('click', closeReport);
document.getElementById('submit-report').addEventListener('click', submitReport);
reportModal.addEventListener('click', (event) => { if (event.target === reportModal) closeReport(); });
setMobileView('people');
window.addEventListener('resize', () => {
  syncRoomVisualViewport();
  if (!matchMedia('(max-width: 760px)').matches) roomLayout.dataset.mobileView = 'people';
  else setMobileView(mobileView);
});
navigator.mediaDevices?.addEventListener?.('devicechange', () => { if (hasJoined) populateAudioDevices().catch(() => {}); });
window.addEventListener('beforeunload', () => {
  if (topicTimerId) clearInterval(topicTimerId);
  if (approvalFallbackTimer) clearInterval(approvalFallbackTimer);
  accountUpdateSource?.close();
  stopRelayVoice();
  if (hasJoined && !isLeaving) fetch(`/api/rooms/${code}/leave`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId }), keepalive: true }).catch(() => {});
});

async function recheckRoomApproval() {
  if (roomData || hasJoined || isLeaving || document.visibilityState === 'hidden') return;
  try {
    await api(`/api/rooms/${code}`);
    showAlert(joinAlert, 'Room approved! Refreshing…', 'success');
    window.location.reload();
  } catch (error) {
    // Pending, rejected, closed, or level-mismatched rooms remain on this screen.
    // The live event stream will act immediately when the administrator changes it.
  }
}

accountUpdateSource = createLiveUpdateStream({
  'room-updated': ({ room }) => {
    if (!room || room.code !== code) return;
    if (!roomData && room.status === 'approved') {
      showAlert(joinAlert, 'Room approved! Opening the room…', 'success');
      return window.setTimeout(() => window.location.reload(), 250);
    }
    if (room.status === 'rejected' || room.status === 'closed') {
      notify(`This room is ${room.status}.`);
      return window.setTimeout(() => window.location.replace('/dashboard'), 1200);
    }
  },
  'room-deleted': ({ code: deletedCode }) => {
    if (deletedCode === code) window.location.replace('/dashboard');
  },
  'account-updated': async () => {
    try {
      const { accessApproved } = await api('/api/me');
      if (!accessApproved) window.location.replace('/dashboard#pricing-section');
    } catch {}
  },
  'account-deleted': () => window.location.replace('/login')
});

approvalFallbackTimer = window.setInterval(recheckRoomApproval, 6000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') recheckRoomApproval();
});

initialise();
