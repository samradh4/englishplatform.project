'use strict';

const privateToken = window.location.pathname.split('/').filter(Boolean).pop();
const entryCard = document.getElementById('guest-entry-card');
const entryForm = document.getElementById('private-entry-form');
const entryAlert = document.getElementById('private-entry-alert');
const callShell = document.getElementById('private-call-shell');
const callAlert = document.getElementById('private-call-alert');
const videoGrid = document.getElementById('private-video-grid');
const titleElement = document.getElementById('private-session-title');
const callTitle = document.getElementById('private-call-title');
const callStatus = document.getElementById('private-call-status');
const capacityNote = document.getElementById('private-capacity-note');
const expiryNote = document.getElementById('private-expiry-note');
const joinButton = document.getElementById('private-join-button');
const micButton = document.getElementById('private-mic-button');
const cameraButton = document.getElementById('private-camera-button');
const speakerButton = document.getElementById('private-speaker-button');
const leaveButton = document.getElementById('private-leave-button');
const copyButton = document.getElementById('private-copy-link');
const nameLabel = document.getElementById('private-name-label');
const phoneLabel = document.getElementById('private-phone-label');
const nameInput = document.getElementById('private-guest-name');
const phoneInput = document.getElementById('private-guest-phone');
const adminJoinNote = document.getElementById('private-admin-join-note');
const cameraChoice = document.getElementById('private-camera-choice');
const cameraOnInput = document.getElementById('private-camera-on');
const consentText = document.getElementById('private-consent-text');

let sessionInfo = null;
let guest = null;
let accessToken = null;
let clientId = crypto.randomUUID();
let localStream = null;
let eventSource = null;
let iceServers = [];
let micEnabled = true;
let cameraEnabled = false;
let speakerEnabled = true;
let leaving = false;
let viewerCanUseCamera = false;
const peers = new Map();
const pendingCandidates = new Map();

function authHeaders() {
  return { Authorization: `Bearer ${accessToken}` };
}

async function guestApi(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The private session request failed.');
  return data;
}

function setCallStatus(text) {
  callStatus.textContent = text;
}

function participantCard(id, displayName, isLocal = false, specialTag = '') {
  let card = document.querySelector(`[data-private-participant="${CSS.escape(id)}"]`);
  if (card) {
    updateParticipantIdentity(id, displayName, specialTag, isLocal);
    return card;
  }
  card = document.createElement('article');
  card.className = 'private-video-card';
  card.dataset.privateParticipant = id;
  card.innerHTML = `
    <video autoplay playsinline ${isLocal ? 'muted' : ''}></video>
    <div class="private-video-placeholder"><span>${escapeHtml(initials(displayName))}</span></div>
    <div class="private-video-label">
      <div class="private-identity"><strong data-private-name>${escapeHtml(displayName)}${isLocal ? ' (You)' : ''}</strong><em class="special-person-tag private-special-tag" data-private-tag ${specialTag ? '' : 'hidden'}>${escapeHtml(specialTag)}</em></div>
      <span data-media-state>Connecting…</span>
    </div>
    <div class="private-speaking-ring" aria-hidden="true"></div>`;
  videoGrid.appendChild(card);
  return card;
}

function updateParticipantIdentity(id, displayName, specialTag = '', isLocal = false) {
  const card = document.querySelector(`[data-private-participant="${CSS.escape(id)}"]`);
  if (!card) return;
  const name = card.querySelector('[data-private-name]');
  const tag = card.querySelector('[data-private-tag]');
  const placeholder = card.querySelector('.private-video-placeholder span');
  if (name) name.textContent = `${displayName}${isLocal ? ' (You)' : ''}`;
  if (placeholder) placeholder.textContent = initials(displayName);
  if (tag) {
    tag.textContent = specialTag || '';
    tag.hidden = !specialTag;
  }
}

function setCardStream(id, stream, displayName, isLocal = false, specialTag = '') {
  const card = participantCard(id, displayName, isLocal, specialTag);
  const video = card.querySelector('video');
  video.srcObject = stream;
  video.muted = isLocal || !speakerEnabled;
  video.play().catch(() => {});
  updateCardState(id, {
    micEnabled: stream.getAudioTracks().some((track) => track.enabled),
    cameraEnabled: stream.getVideoTracks().some((track) => track.enabled)
  });
  beginSpeakingDetection(card, stream);
}

function updateCardState(id, state = {}) {
  const card = document.querySelector(`[data-private-participant="${CSS.escape(id)}"]`);
  if (!card) return;
  const status = card.querySelector('[data-media-state]');
  const cameraOn = state.cameraEnabled === true;
  const micOn = state.micEnabled !== false;
  card.classList.toggle('camera-on', cameraOn);
  card.classList.toggle('mic-muted', !micOn);
  status.textContent = `${micOn ? '🎙️ Mic on' : '🔇 Muted'} · ${cameraOn ? '📷 Camera on' : 'Camera off'}`;
}

function beginSpeakingDetection(card, stream) {
  if (!stream?.getAudioTracks().length || card.dataset.speakingWatch === '1') return;
  card.dataset.speakingWatch = '1';
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextClass();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const values = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (!document.body.contains(card)) { context.close().catch(() => {}); return; }
      analyser.getByteFrequencyData(values);
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      card.classList.toggle('is-speaking', average > 18);
      requestAnimationFrame(tick);
    };
    tick();
  } catch {}
}

function removePeerCard(peerId) {
  document.querySelector(`[data-private-participant="${CSS.escape(peerId)}"]`)?.remove();
}

async function sendSignal(to, payload) {
  await guestApi(`/api/private-sessions/${encodeURIComponent(privateToken)}/signal`, {
    method: 'POST',
    body: JSON.stringify({ clientId, to, ...payload })
  });
}

function createPeer(peerId, displayName, specialTag = '') {
  if (peers.has(peerId)) return peers.get(peerId);
  const pc = new RTCPeerConnection({ iceServers });
  const meta = { pc, displayName, specialTag, makingOffer: false, ignoreOffer: false };
  peers.set(peerId, meta);
  participantCard(peerId, displayName, false, specialTag);
  localStream?.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) sendSignal(peerId, { candidate }).catch(() => {});
  };
  pc.ontrack = ({ streams }) => {
    const stream = streams[0];
    if (stream) setCardStream(peerId, stream, meta.displayName, false, meta.specialTag);
  };
  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    if (state === 'connected') setCallStatus(`${videoGrid.children.length} participant(s) connected`);
    if (['failed', 'disconnected'].includes(state)) {
      showAlert(callAlert, 'A participant connection is having trouble. A TURN server may be required for strict networks.');
    }
    if (state === 'closed') removePeerCard(peerId);
  };
  return meta;
}

async function createOfferFor(peerId, displayName, specialTag = '') {
  const meta = createPeer(peerId, displayName, specialTag);
  try {
    meta.makingOffer = true;
    const offer = await meta.pc.createOffer();
    await meta.pc.setLocalDescription(offer);
    await sendSignal(peerId, { description: meta.pc.localDescription });
  } finally { meta.makingOffer = false; }
}

async function handleSignal(payload) {
  const peerId = payload.from;
  const meta = createPeer(peerId, payload.displayName || 'Guest', payload.specialTag || '');
  if (payload.displayName) meta.displayName = payload.displayName;
  if (payload.specialTag != null) meta.specialTag = payload.specialTag;
  updateParticipantIdentity(peerId, meta.displayName, meta.specialTag, false);
  const pc = meta.pc;
  if (payload.description) {
    const offerCollision = payload.description.type === 'offer' && (meta.makingOffer || pc.signalingState !== 'stable');
    meta.ignoreOffer = offerCollision && clientId > peerId;
    if (meta.ignoreOffer) return;
    await pc.setRemoteDescription(payload.description);
    const queued = pendingCandidates.get(peerId) || [];
    for (const candidate of queued) await pc.addIceCandidate(candidate).catch(() => {});
    pendingCandidates.delete(peerId);
    if (payload.description.type === 'offer') {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal(peerId, { description: pc.localDescription });
    }
  }
  if (payload.candidate) {
    if (pc.remoteDescription) await pc.addIceCandidate(payload.candidate).catch(() => {});
    else {
      const queue = pendingCandidates.get(peerId) || [];
      queue.push(payload.candidate);
      pendingCandidates.set(peerId, queue);
    }
  }
  updateCardState(peerId, payload);
}

function connectEvents() {
  const url = `/api/private-sessions/${encodeURIComponent(privateToken)}/events?clientId=${encodeURIComponent(clientId)}`;
  eventSource = new EventSource(url);
  eventSource.addEventListener('ready', async (event) => {
    const data = JSON.parse(event.data || '{}');
    setCallStatus(`Connected · ${data.existingPeers.length + 1} participant(s)`);
    for (const peer of data.existingPeers) {
      updateCardState(peer.clientId, peer);
      // The administrator initiates connections involving admin video. Guests
      // initiate only guest-to-guest audio connections.
      if (viewerCanUseCamera || peer.role !== 'admin') {
        await createOfferFor(peer.clientId, peer.displayName, peer.specialTag || '');
      }
    }
  });
  eventSource.addEventListener('peer-joined', (event) => {
    const peer = JSON.parse(event.data || '{}');
    participantCard(peer.clientId, peer.displayName, false, peer.specialTag || '');
    updateCardState(peer.clientId, peer);
    if (viewerCanUseCamera) {
      createOfferFor(peer.clientId, peer.displayName, peer.specialTag || '').catch((error) => showAlert(callAlert, error.message));
    }
    setCallStatus(`${videoGrid.children.length} participant(s) in this private session`);
  });
  eventSource.addEventListener('profile-updated', (event) => {
    const profile = JSON.parse(event.data || '{}');
    if (profile.clientId === clientId) {
      guest.displayName = profile.displayName || guest.displayName || guest.name;
      guest.specialTag = profile.specialTag || '';
      updateParticipantIdentity(clientId, guest.displayName, guest.specialTag, true);
      showAlert(callAlert, 'Your special guest name or tag was updated by the administrator.', 'success');
    } else {
      const meta = peers.get(profile.clientId);
      if (meta) {
        meta.displayName = profile.displayName || meta.displayName;
        meta.specialTag = profile.specialTag || '';
      }
      updateParticipantIdentity(profile.clientId, profile.displayName || meta?.displayName || 'Guest', profile.specialTag || '', false);
    }
  });
  eventSource.addEventListener('peer-left', (event) => {
    const peer = JSON.parse(event.data || '{}');
    peers.get(peer.clientId)?.pc.close();
    peers.delete(peer.clientId);
    removePeerCard(peer.clientId);
    setCallStatus(`${videoGrid.children.length} participant(s) in this private session`);
  });
  eventSource.addEventListener('signal', (event) => {
    handleSignal(JSON.parse(event.data || '{}')).catch((error) => showAlert(callAlert, error.message));
  });
  eventSource.addEventListener('presence', (event) => updateCardState(JSON.parse(event.data || '{}').clientId, JSON.parse(event.data || '{}')));
  eventSource.addEventListener('session-ended', (event) => {
    const data = JSON.parse(event.data || '{}');
    showAlert(callAlert, data.message || 'This private session ended.');
    leaveSession(false).catch(() => {});
  });
  eventSource.onerror = () => setCallStatus('Reconnecting…');
}

async function updatePresence() {
  if (!accessToken) return;
  await guestApi(`/api/private-sessions/${encodeURIComponent(privateToken)}/presence`, {
    method: 'POST',
    body: JSON.stringify({ clientId, micEnabled, cameraEnabled })
  }).catch(() => {});
  updateCardState(clientId, { micEnabled, cameraEnabled });
}

async function startLocalMedia(startWithCamera) {
  const allowCamera = viewerCanUseCamera && startWithCamera;
  const constraints = {
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: allowCamera ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false
  };
  localStream = await navigator.mediaDevices.getUserMedia(constraints);
  micEnabled = true;
  cameraEnabled = localStream.getVideoTracks().some((track) => track.enabled);
  setCardStream(clientId, localStream, guest.displayName || guest.name, true, guest.specialTag || '');
  refreshControlLabels();
}

function refreshControlLabels() {
  cameraButton.hidden = !viewerCanUseCamera;
  cameraButton.disabled = !viewerCanUseCamera;
  micButton.querySelector('strong').textContent = micEnabled ? 'Mute' : 'Unmute';
  micButton.querySelector('span').textContent = micEnabled ? '🎙️' : '🔇';
  cameraButton.querySelector('strong').textContent = cameraEnabled ? 'Camera off' : 'Camera on';
  cameraButton.querySelector('span').textContent = cameraEnabled ? '📷' : '🚫';
  speakerButton.querySelector('strong').textContent = speakerEnabled ? 'Speaker on' : 'Speaker off';
  speakerButton.querySelector('span').textContent = speakerEnabled ? '🔊' : '🔈';
}

async function ensureVideoTrack() {
  if (!viewerCanUseCamera) throw new Error('Camera access is available only to the signed-in administrator.');
  let track = localStream?.getVideoTracks()[0];
  if (track) return track;
  const videoStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
  track = videoStream.getVideoTracks()[0];
  localStream.addTrack(track);
  for (const { pc } of peers.values()) pc.addTrack(track, localStream);
  setCardStream(clientId, localStream, guest.displayName || guest.name, true, guest.specialTag || '');
  for (const [peerId, meta] of peers) await createOfferFor(peerId, meta.displayName, meta.specialTag || '').catch(() => {});
  return track;
}

async function enterSession(joinData, startWithCamera) {
  accessToken = joinData.accessToken;
  guest = joinData.guest;
  sessionInfo = joinData.session;
  viewerCanUseCamera = joinData.viewerCanUseCamera === true || guest.canUseCamera === true || sessionInfo.viewerCanUseCamera === true;
  iceServers = joinData.iceServers || [];
  sessionStorage.setItem(`uh.private.${privateToken}`, JSON.stringify({ accessToken, guest, viewerCanUseCamera }));
  entryCard.hidden = true;
  callShell.hidden = false;
  callTitle.textContent = sessionInfo.title;
  await startLocalMedia(viewerCanUseCamera && startWithCamera);
  connectEvents();
  await updatePresence();
}

async function leaveSession(redirectToEntry = true) {
  if (leaving) return;
  leaving = true;
  eventSource?.close();
  for (const { pc } of peers.values()) pc.close();
  peers.clear();
  localStream?.getTracks().forEach((track) => track.stop());
  if (accessToken) {
    await guestApi(`/api/private-sessions/${encodeURIComponent(privateToken)}/leave`, {
      method: 'POST', body: JSON.stringify({ clientId })
    }).catch(() => {});
  }
  sessionStorage.removeItem(`uh.private.${privateToken}`);
  if (redirectToEntry) window.location.reload();
}

entryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearAlert(entryAlert);
  setBusy(joinButton, true, 'Joining…');
  try {
    const startWithCamera = viewerCanUseCamera && cameraOnInput.checked;
    const data = await api(`/api/private-sessions/${encodeURIComponent(privateToken)}/join`, {
      method: 'POST',
      body: JSON.stringify({
        name: nameInput.value.trim(),
        phone: phoneInput.value.trim(),
        consent: document.getElementById('private-consent').checked
      })
    });
    await enterSession(data, startWithCamera);
  } catch (error) {
    showAlert(entryAlert, error.name === 'NotAllowedError' ? (viewerCanUseCamera ? 'Microphone or camera permission was denied. Allow access in your browser and try again.' : 'Microphone permission was denied. Allow it in your browser and try again.') : error.message);
  } finally { setBusy(joinButton, false); }
});

micButton.addEventListener('click', async () => {
  const track = localStream?.getAudioTracks()[0];
  if (!track) return;
  micEnabled = !micEnabled;
  track.enabled = micEnabled;
  refreshControlLabels();
  await updatePresence();
});

cameraButton.addEventListener('click', async () => {
  if (!viewerCanUseCamera) return showAlert(callAlert, 'Camera access is available only to the signed-in administrator.');
  try {
    const track = await ensureVideoTrack();
    cameraEnabled = !cameraEnabled;
    track.enabled = cameraEnabled;
    refreshControlLabels();
    updateCardState(clientId, { micEnabled, cameraEnabled });
    await updatePresence();
  } catch (error) { showAlert(callAlert, 'Camera permission was denied or no camera is available.'); }
});

speakerButton.addEventListener('click', () => {
  speakerEnabled = !speakerEnabled;
  document.querySelectorAll('.private-video-card video').forEach((video) => {
    const isLocal = video.closest('[data-private-participant]')?.dataset.privateParticipant === clientId;
    video.muted = isLocal || !speakerEnabled;
  });
  refreshControlLabels();
});

leaveButton.addEventListener('click', () => leaveSession(true));
copyButton.addEventListener('click', async () => {
  await navigator.clipboard.writeText(window.location.href);
  copyButton.textContent = 'Copied';
  setTimeout(() => { copyButton.textContent = 'Copy invite'; }, 1500);
});
window.addEventListener('beforeunload', () => leaveSession(false));

async function loadPrivateSession() {
  try {
    const data = await api(`/api/private-sessions/${encodeURIComponent(privateToken)}`);
    sessionInfo = data.session;
    viewerCanUseCamera = sessionInfo.viewerCanUseCamera === true;
    iceServers = data.iceServers || [];
    titleElement.textContent = sessionInfo.title;
    callTitle.textContent = sessionInfo.title;
    capacityNote.textContent = `${sessionInfo.liveParticipants}/${sessionInfo.capacity} people currently connected`;
    expiryNote.textContent = `Link expires ${formatDate(sessionInfo.expiresAt)}`;
    adminJoinNote.hidden = !viewerCanUseCamera;
    cameraChoice.hidden = !viewerCanUseCamera;
    cameraButton.hidden = !viewerCanUseCamera;
    cameraButton.disabled = !viewerCanUseCamera;
    if (viewerCanUseCamera) {
      nameLabel.hidden = true;
      phoneLabel.hidden = true;
      nameInput.required = false;
      phoneInput.required = false;
      nameInput.value = 'Bolo English Administrator';
      phoneInput.value = '';
      joinButton.textContent = 'Join as administrator';
      consentText.textContent = 'I consent to microphone and optional camera access for this private session.';
    } else {
      nameLabel.hidden = false;
      phoneLabel.hidden = false;
      nameInput.required = true;
      phoneInput.required = true;
      cameraChoice.hidden = true;
      cameraOnInput.checked = false;
      joinButton.textContent = 'Join private audio session';
      consentText.textContent = 'I consent to microphone access and understand that my name and phone number are visible only to the administrator.';
    }
  } catch (error) {
    titleElement.textContent = 'Private session unavailable';
    showAlert(entryAlert, error.message);
    entryForm.querySelectorAll('input, button').forEach((element) => { element.disabled = true; });
    capacityNote.textContent = 'This link cannot be used.';
    expiryNote.textContent = '';
  }
}

loadPrivateSession();
