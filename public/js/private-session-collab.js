'use strict';

// Private-room collaboration layer:
// - separate mic request flow with admin accept/reject
// - keeps the existing raise-hand flow independent
// - live private-room chat over the existing signed signaling channel
(() => {
  if (typeof privateToken === 'undefined' || typeof sendSignal !== 'function') return;

  const CONTROL_PREFIX = 'bolo-control:';
  const CHAT_STORAGE_KEY = `uh.private.chat.${privateToken}`;
  const MAX_CHAT_MESSAGES = 50;
  const pendingMicRequests = new Map();
  const chatMessages = new Map();
  let micRequestPending = false;
  let chatOpen = false;
  let unreadChat = 0;

  function viewerIsAdmin() {
    return guest?.role === 'admin' || viewerCanUseCamera === true;
  }

  function encodeControl(control) {
    return `${CONTROL_PREFIX}${encodeURIComponent(JSON.stringify(control))}`;
  }

  function decodeControl(candidate) {
    const value = String(candidate || '');
    if (!value.startsWith(CONTROL_PREFIX)) return null;
    try { return JSON.parse(decodeURIComponent(value.slice(CONTROL_PREFIX.length))); }
    catch { return null; }
  }

  async function sendControl(peerId, type, detail = {}) {
    if (!peerId) return;
    await sendSignal(peerId, {
      candidate: {
        candidate: encodeControl({ type, ...detail }),
        sdpMid: '0',
        sdpMLineIndex: 0
      }
    });
  }

  async function broadcastControl(type, detail = {}) {
    const ids = [...peers.keys()];
    await Promise.allSettled(ids.map((peerId) => sendControl(peerId, type, detail)));
    return ids.length;
  }

  const topbar = document.querySelector('.private-call-topbar');
  const controlsBar = document.querySelector('.private-call-controls');
  if (!topbar || !controlsBar) return;

  // ----- Mic request UI -----
  const requestMicButton = document.createElement('button');
  requestMicButton.id = 'private-request-mic-button';
  requestMicButton.className = 'private-control-button private-request-mic-button';
  requestMicButton.type = 'button';
  requestMicButton.innerHTML = '<span>🎤</span><strong>Request mic</strong>';

  const handButton = document.getElementById('private-hand-button');
  controlsBar.insertBefore(requestMicButton, handButton || speakerButton);

  const micRequestTray = document.createElement('section');
  micRequestTray.id = 'private-mic-request-tray';
  micRequestTray.className = 'private-mic-request-tray';
  micRequestTray.hidden = true;
  micRequestTray.innerHTML = `
    <div class="private-request-tray-head">
      <div><span class="private-request-kicker">Mic requests</span><strong>Participants waiting to speak</strong></div>
      <span id="private-request-count" class="private-request-count">0</span>
    </div>
    <div id="private-request-list" class="private-request-list"></div>`;
  callAlert.insertAdjacentElement('afterend', micRequestTray);

  function syncRequestMicButton() {
    const admin = viewerIsAdmin();
    requestMicButton.hidden = admin;
    if (admin) return;
    requestMicButton.classList.toggle('active', micRequestPending);
    requestMicButton.querySelector('span').textContent = micRequestPending ? '⏳' : '🎤';
    requestMicButton.querySelector('strong').textContent = micRequestPending ? 'Mic requested' : 'Request mic';
  }

  function participantName(peerId) {
    const card = document.querySelector(`[data-private-participant="${CSS.escape(peerId)}"]`);
    return card?.querySelector('[data-private-name]')?.textContent?.replace(/\s*\(You\)\s*$/, '').trim() || 'Participant';
  }

  function renderMicRequests() {
    if (!viewerIsAdmin()) {
      micRequestTray.hidden = true;
      return;
    }
    const list = micRequestTray.querySelector('#private-request-list');
    const count = micRequestTray.querySelector('#private-request-count');
    const entries = [...pendingMicRequests.entries()];
    count.textContent = String(entries.length);
    micRequestTray.hidden = entries.length === 0;
    list.innerHTML = '';
    for (const [peerId, request] of entries) {
      const row = document.createElement('div');
      row.className = 'private-request-row';
      row.dataset.requestPeer = peerId;
      const identity = document.createElement('div');
      identity.className = 'private-request-identity';
      const name = document.createElement('strong');
      name.textContent = request.displayName || participantName(peerId);
      const note = document.createElement('small');
      note.textContent = 'wants microphone access';
      identity.append(name, note);
      const actions = document.createElement('div');
      actions.className = 'private-request-actions';
      actions.innerHTML = `
        <button type="button" data-mic-request-action="accept">Accept mic</button>
        <button type="button" data-mic-request-action="reject" class="reject">Reject</button>`;
      row.append(identity, actions);
      list.appendChild(row);
    }
  }

  async function acceptMicRequest(peerId) {
    const card = document.querySelector(`[data-private-participant="${CSS.escape(peerId)}"]`);
    const existingAllow = card?.querySelector('.private-moderator-actions [data-private-action="allow"]');
    if (existingAllow && !existingAllow.hidden) {
      existingAllow.click();
    } else {
      await sendControl(peerId, 'allow-speak');
    }
    pendingMicRequests.delete(peerId);
    await sendControl(peerId, 'mic-request-accepted').catch(() => {});
    renderMicRequests();
    showAlert(callAlert, `${participantName(peerId)} was allowed to speak.`, 'success');
  }

  async function rejectMicRequest(peerId) {
    pendingMicRequests.delete(peerId);
    await sendControl(peerId, 'mic-request-rejected').catch(() => {});
    renderMicRequests();
    showAlert(callAlert, `${participantName(peerId)}'s microphone request was rejected.`);
  }

  micRequestTray.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-mic-request-action]');
    if (!button) return;
    const row = button.closest('[data-request-peer]');
    const peerId = row?.dataset.requestPeer;
    if (!peerId) return;
    button.disabled = true;
    try {
      if (button.dataset.micRequestAction === 'accept') await acceptMicRequest(peerId);
      else await rejectMicRequest(peerId);
    } catch (error) {
      showAlert(callAlert, error.message || 'Could not update microphone permission.');
    } finally {
      button.disabled = false;
    }
  });

  requestMicButton.addEventListener('click', async () => {
    if (viewerIsAdmin()) return;
    if (micRequestPending) {
      micRequestPending = false;
      syncRequestMicButton();
      await broadcastControl('mic-request-cancelled');
      showAlert(callAlert, 'Microphone request cancelled.');
      return;
    }

    micRequestPending = true;
    syncRequestMicButton();
    const sent = await broadcastControl('mic-request', {
      displayName: guest?.displayName || guest?.name || 'Participant',
      requestedAt: new Date().toISOString()
    });
    showAlert(callAlert, sent
      ? 'Microphone requested. Waiting for the administrator to accept.'
      : 'Microphone requested. The administrator will see it when they join.', 'success');
  });

  // ----- Private room chat UI -----
  const topbarActions = document.createElement('div');
  topbarActions.className = 'private-topbar-actions';
  const existingCopyButton = document.getElementById('private-copy-link');
  existingCopyButton.insertAdjacentElement('beforebegin', topbarActions);
  topbarActions.appendChild(existingCopyButton);

  const chatToggle = document.createElement('button');
  chatToggle.id = 'private-chat-toggle';
  chatToggle.className = 'btn btn-outline btn-small private-chat-toggle';
  chatToggle.type = 'button';
  chatToggle.innerHTML = 'Chat <span id="private-chat-unread" class="private-chat-unread" hidden>0</span>';
  topbarActions.insertBefore(chatToggle, existingCopyButton);

  const chatPanel = document.createElement('aside');
  chatPanel.id = 'private-chat-panel';
  chatPanel.className = 'private-chat-panel';
  chatPanel.hidden = true;
  chatPanel.innerHTML = `
    <div class="private-chat-head">
      <div><span class="private-request-kicker">Private room</span><strong>Chat</strong></div>
      <button id="private-chat-close" type="button" aria-label="Close chat">×</button>
    </div>
    <div id="private-chat-messages" class="private-chat-messages" aria-live="polite">
      <div class="private-chat-empty">No messages yet. Say hello 👋</div>
    </div>
    <form id="private-chat-form" class="private-chat-form">
      <input id="private-chat-input" class="input" maxlength="250" autocomplete="off" placeholder="Message everyone in this private room">
      <button class="btn btn-primary btn-small" type="submit">Send</button>
    </form>`;
  document.body.appendChild(chatPanel);

  const chatMessagesBox = chatPanel.querySelector('#private-chat-messages');
  const chatForm = chatPanel.querySelector('#private-chat-form');
  const chatInput = chatPanel.querySelector('#private-chat-input');
  const unreadBadge = chatToggle.querySelector('#private-chat-unread');

  function saveChat() {
    try {
      const items = [...chatMessages.values()].slice(-MAX_CHAT_MESSAGES);
      sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }

  function loadChat() {
    try {
      const items = JSON.parse(sessionStorage.getItem(CHAT_STORAGE_KEY) || '[]');
      if (!Array.isArray(items)) return;
      for (const message of items.slice(-MAX_CHAT_MESSAGES)) {
        if (message?.id && message?.text) chatMessages.set(message.id, message);
      }
    } catch {}
  }

  function formatChatTime(value) {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function renderChat() {
    chatMessagesBox.innerHTML = '';
    const items = [...chatMessages.values()].slice(-MAX_CHAT_MESSAGES);
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'private-chat-empty';
      empty.textContent = 'No messages yet. Say hello 👋';
      chatMessagesBox.appendChild(empty);
      return;
    }

    for (const message of items) {
      const own = message.senderId === clientId;
      const row = document.createElement('article');
      row.className = `private-chat-message${own ? ' own' : ''}`;
      const meta = document.createElement('div');
      meta.className = 'private-chat-message-meta';
      const sender = document.createElement('strong');
      sender.textContent = own ? 'You' : (message.senderName || 'Participant');
      const time = document.createElement('span');
      time.textContent = formatChatTime(message.createdAt);
      meta.append(sender, time);
      const text = document.createElement('p');
      text.textContent = message.text;
      row.append(meta, text);
      chatMessagesBox.appendChild(row);
    }
    requestAnimationFrame(() => { chatMessagesBox.scrollTop = chatMessagesBox.scrollHeight; });
  }

  function addChatMessage(message, countUnread = true) {
    if (!message?.id || !message?.text || chatMessages.has(message.id)) return;
    chatMessages.set(message.id, {
      id: String(message.id),
      senderId: String(message.senderId || ''),
      senderName: String(message.senderName || 'Participant').slice(0, 60),
      text: String(message.text || '').slice(0, 250),
      createdAt: message.createdAt || new Date().toISOString()
    });
    while (chatMessages.size > MAX_CHAT_MESSAGES) {
      const first = chatMessages.keys().next().value;
      chatMessages.delete(first);
    }
    saveChat();
    renderChat();
    if (countUnread && !chatOpen && message.senderId !== clientId) {
      unreadChat += 1;
      unreadBadge.hidden = false;
      unreadBadge.textContent = unreadChat > 9 ? '9+' : String(unreadChat);
    }
  }

  function setChatOpen(open) {
    chatOpen = open === true;
    chatPanel.hidden = !chatOpen;
    document.body.classList.toggle('private-chat-open', chatOpen);
    if (chatOpen) {
      unreadChat = 0;
      unreadBadge.hidden = true;
      unreadBadge.textContent = '0';
      renderChat();
      setTimeout(() => chatInput.focus(), 80);
    }
  }

  chatToggle.addEventListener('click', () => setChatOpen(!chatOpen));
  chatPanel.querySelector('#private-chat-close').addEventListener('click', () => setChatOpen(false));

  chatForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    const button = chatForm.querySelector('button[type="submit"]');
    button.disabled = true;
    const message = {
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      senderId: clientId,
      senderName: guest?.displayName || guest?.name || 'Participant',
      text: text.slice(0, 250),
      createdAt: new Date().toISOString()
    };
    addChatMessage(message, false);
    chatInput.value = '';
    try {
      await broadcastControl('chat-message', { message });
    } finally {
      button.disabled = false;
      chatInput.focus();
    }
  });

  loadChat();
  renderChat();

  // Patch signaling after the existing moderation layer so both systems coexist.
  const previousHandleSignal = handleSignal;
  handleSignal = async function collabHandleSignal(payload) {
    const control = decodeControl(payload?.candidate?.candidate);
    if (!control) return previousHandleSignal(payload);

    const peerId = payload.from;
    if (control.type === 'mic-request' && viewerIsAdmin()) {
      pendingMicRequests.set(peerId, {
        displayName: control.displayName || payload.displayName || participantName(peerId),
        requestedAt: control.requestedAt || new Date().toISOString()
      });
      renderMicRequests();
      showAlert(callAlert, `${control.displayName || payload.displayName || 'A participant'} requested microphone access.`, 'success');
      return;
    }

    if (control.type === 'mic-request-cancelled' && viewerIsAdmin()) {
      pendingMicRequests.delete(peerId);
      renderMicRequests();
      return;
    }

    if (control.type === 'mic-request-rejected' && !viewerIsAdmin()) {
      micRequestPending = false;
      syncRequestMicButton();
      showAlert(callAlert, 'The administrator rejected your microphone request. You are still muted.');
      return;
    }

    if (control.type === 'mic-request-accepted' && !viewerIsAdmin()) {
      micRequestPending = false;
      syncRequestMicButton();
      return;
    }

    if (control.type === 'allow-speak' && !viewerIsAdmin()) {
      micRequestPending = false;
      syncRequestMicButton();
      return previousHandleSignal(payload);
    }

    if (control.type === 'revoke-speak' && !viewerIsAdmin()) {
      micRequestPending = false;
      syncRequestMicButton();
      return previousHandleSignal(payload);
    }

    if (control.type === 'chat-message') {
      addChatMessage(control.message, true);
      return;
    }

    if (control.type === 'chat-sync-request') {
      const items = [...chatMessages.values()].slice(-20);
      for (const message of items) {
        await sendControl(peerId, 'chat-sync-message', { message }).catch(() => {});
      }
      return;
    }

    if (control.type === 'chat-sync-message') {
      addChatMessage(control.message, false);
      return;
    }

    return previousHandleSignal(payload);
  };

  // Add collaboration listeners after the main SSE connection is created.
  const previousConnectEvents = connectEvents;
  connectEvents = function collabConnectEvents() {
    previousConnectEvents();
    if (!eventSource || eventSource.__boloCollabInstalled) return;
    eventSource.__boloCollabInstalled = true;

    eventSource.addEventListener('ready', () => {
      syncRequestMicButton();
      renderMicRequests();
      window.setTimeout(async () => {
        const firstPeer = [...peers.keys()][0];
        if (firstPeer) await sendControl(firstPeer, 'chat-sync-request').catch(() => {});
        if (micRequestPending) await broadcastControl('mic-request', {
          displayName: guest?.displayName || guest?.name || 'Participant',
          requestedAt: new Date().toISOString()
        });
      }, 700);
    });

    eventSource.addEventListener('peer-joined', (event) => {
      const peer = JSON.parse(event.data || '{}');
      if (!viewerIsAdmin() && micRequestPending && peer.role === 'admin') {
        sendControl(peer.clientId, 'mic-request', {
          displayName: guest?.displayName || guest?.name || 'Participant',
          requestedAt: new Date().toISOString()
        }).catch(() => {});
      }
    });

    eventSource.addEventListener('peer-left', (event) => {
      const peer = JSON.parse(event.data || '{}');
      pendingMicRequests.delete(peer.clientId);
      renderMicRequests();
    });
  };

  // When the admin grants mic through the existing tile action, clear a pending request.
  document.addEventListener('click', (event) => {
    const allow = event.target.closest('.private-moderator-actions [data-private-action="allow"]');
    if (!allow || !viewerIsAdmin()) return;
    const card = allow.closest('[data-private-participant]');
    const peerId = card?.dataset.privateParticipant;
    if (!peerId) return;
    pendingMicRequests.delete(peerId);
    renderMicRequests();
  }, true);

  syncRequestMicButton();
  renderMicRequests();
})();
