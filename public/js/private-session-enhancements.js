'use strict';

// Private-session UX layer:
// - resume the same private guest session after a page reload
// - everyone joins muted
// - guests raise a hand before speaking; admin grants/revokes speaking
// - compact paged participant grid on phones
(() => {
  if (typeof privateToken === 'undefined' || typeof sendSignal !== 'function') return;

  const storageKey = `uh.private.${privateToken}`;
  const controlPrefix = 'bolo-control:';
  const peerRoles = new Map();
  const handRequests = new Set();
  const speakerGrants = new Set();
  let speakerGranted = false;
  let handRaisedPrivate = false;
  let mobilePage = 0;
  let restoring = false;

  const controlsBar = document.querySelector('.private-call-controls');
  const pager = document.createElement('div');
  pager.id = 'private-participant-pager';
  pager.className = 'private-participant-pager';
  pager.hidden = true;
  pager.innerHTML = `
    <button type="button" class="private-page-button" data-page="prev" aria-label="Previous participants">‹</button>
    <span id="private-page-label">1 / 1</span>
    <button type="button" class="private-page-button" data-page="next" aria-label="Next participants">›</button>`;
  videoGrid.insertAdjacentElement('afterend', pager);

  const handButton = document.createElement('button');
  handButton.id = 'private-hand-button';
  handButton.className = 'private-control-button private-hand-button';
  handButton.type = 'button';
  handButton.innerHTML = '<span>✋</span><strong>Raise hand</strong>';
  controlsBar?.insertBefore(handButton, speakerButton);

  function currentViewerIsAdmin() {
    return guest?.role === 'admin' || viewerCanUseCamera === true;
  }

  function setLocalMic(enabled) {
    micEnabled = enabled === true;
    localStream?.getAudioTracks().forEach((track) => { track.enabled = micEnabled; });
    refreshControlLabels();
    updateCardState(clientId, { micEnabled, cameraEnabled });
    syncModerationControls();
  }

  function syncModerationControls() {
    const admin = currentViewerIsAdmin();
    handButton.hidden = admin;
    handButton.classList.toggle('active', handRaisedPrivate);
    handButton.querySelector('span').textContent = handRaisedPrivate ? '🙋' : '✋';
    handButton.querySelector('strong').textContent = handRaisedPrivate ? 'Lower hand' : 'Raise hand';

    if (!admin) {
      micButton.disabled = !speakerGranted;
      if (!speakerGranted) {
        micButton.querySelector('span').textContent = '🔇';
        micButton.querySelector('strong').textContent = handRaisedPrivate ? 'Waiting for admin' : 'Muted';
      }
    } else {
      micButton.disabled = false;
    }
  }

  function encodeControl(control) {
    return `${controlPrefix}${encodeURIComponent(JSON.stringify(control))}`;
  }

  function decodeControl(candidate) {
    const value = String(candidate || '');
    if (!value.startsWith(controlPrefix)) return null;
    try { return JSON.parse(decodeURIComponent(value.slice(controlPrefix.length))); }
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

  function adminPeerIds() {
    return [...peerRoles.entries()].filter(([, role]) => role === 'admin').map(([id]) => id);
  }

  async function notifyAdminsOfHand() {
    const admins = adminPeerIds();
    if (!admins.length) {
      showAlert(callAlert, 'Hand raised. Waiting for the administrator to join.', 'success');
      return;
    }
    await Promise.allSettled(admins.map((peerId) => sendControl(peerId, 'raise-hand')));
    showAlert(callAlert, 'Hand raised. The administrator can now allow you to speak.', 'success');
  }

  function moderatorActionsFor(peerId) {
    if (!currentViewerIsAdmin() || peerRoles.get(peerId) === 'admin') return null;
    const card = document.querySelector(`[data-private-participant="${CSS.escape(peerId)}"]`);
    if (!card) return null;
    let actions = card.querySelector('.private-moderator-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'private-moderator-actions';
      actions.innerHTML = `
        <button type="button" data-private-action="allow">Allow speak</button>
        <button type="button" data-private-action="mute">Mute</button>`;
      card.appendChild(actions);
      actions.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-private-action]');
        if (!button) return;
        const action = button.dataset.privateAction;
        button.disabled = true;
        try {
          if (action === 'allow') {
            speakerGrants.add(peerId);
            handRequests.delete(peerId);
            await sendControl(peerId, 'allow-speak');
          } else {
            speakerGrants.delete(peerId);
            handRequests.delete(peerId);
            await sendControl(peerId, 'revoke-speak');
          }
          renderModeratorState(peerId);
        } catch (error) {
          showAlert(callAlert, error.message || 'Could not update speaking permission.');
        } finally {
          button.disabled = false;
        }
      });
    }
    return actions;
  }

  function renderModeratorState(peerId) {
    if (!currentViewerIsAdmin()) return;
    const card = document.querySelector(`[data-private-participant="${CSS.escape(peerId)}"]`);
    if (!card || peerRoles.get(peerId) === 'admin') return;
    const actions = moderatorActionsFor(peerId);
    if (!actions) return;
    const allow = actions.querySelector('[data-private-action="allow"]');
    const mute = actions.querySelector('[data-private-action="mute"]');
    const requested = handRequests.has(peerId);
    const granted = speakerGrants.has(peerId);
    card.classList.toggle('private-hand-raised', requested);
    allow.hidden = granted;
    mute.hidden = !granted;
    allow.classList.toggle('requesting', requested);
    allow.textContent = requested ? '✋ Allow speak' : 'Allow speak';
  }

  function participantCards() {
    return Array.from(videoGrid.querySelectorAll('.private-video-card'));
  }

  function compactMode() {
    return window.matchMedia('(max-width: 760px)').matches;
  }

  function cardsPerPage() {
    return window.innerWidth <= 430 ? 4 : 6;
  }

  function updatePagination() {
    const cards = participantCards();
    if (!compactMode()) {
      cards.forEach((card) => { card.hidden = false; });
      pager.hidden = true;
      return;
    }

    const perPage = cardsPerPage();
    const pages = Math.max(1, Math.ceil(cards.length / perPage));
    mobilePage = Math.max(0, Math.min(mobilePage, pages - 1));
    cards.forEach((card, index) => {
      card.hidden = Math.floor(index / perPage) !== mobilePage;
    });
    pager.hidden = cards.length <= perPage;
    const label = pager.querySelector('#private-page-label');
    if (label) label.textContent = `${mobilePage + 1} / ${pages} · ${cards.length} people`;
    pager.querySelector('[data-page="prev"]').disabled = mobilePage <= 0;
    pager.querySelector('[data-page="next"]').disabled = mobilePage >= pages - 1;
  }

  function focusPeerPage(peerId) {
    if (!compactMode()) return;
    const cards = participantCards();
    const index = cards.findIndex((card) => card.dataset.privateParticipant === peerId);
    if (index < 0) return;
    mobilePage = Math.floor(index / cardsPerPage());
    updatePagination();
  }

  pager.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-page]');
    if (!button) return;
    mobilePage += button.dataset.page === 'next' ? 1 : -1;
    updatePagination();
  });

  const gridObserver = new MutationObserver(() => {
    updatePagination();
    if (currentViewerIsAdmin()) {
      for (const [peerId] of peerRoles) renderModeratorState(peerId);
    }
  });
  gridObserver.observe(videoGrid, { childList: true, subtree: false });
  window.addEventListener('resize', updatePagination);

  // Everybody enters a private room muted. Admin may unmute themselves;
  // guests must first receive speaking permission.
  const originalStartLocalMedia = startLocalMedia;
  startLocalMedia = async function patchedStartLocalMedia(startWithCamera) {
    await originalStartLocalMedia(startWithCamera);
    setLocalMic(false);
  };

  micButton.addEventListener('click', (event) => {
    if (currentViewerIsAdmin() || speakerGranted) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showAlert(callAlert, handRaisedPrivate
      ? 'Your hand is raised. Wait for the administrator to allow you to speak.'
      : 'Raise your hand first. The administrator must allow you to speak.');
  }, true);

  handButton.addEventListener('click', async () => {
    if (currentViewerIsAdmin()) return;
    handRaisedPrivate = !handRaisedPrivate;
    syncModerationControls();
    if (handRaisedPrivate) {
      await notifyAdminsOfHand();
    } else {
      await Promise.allSettled(adminPeerIds().map((peerId) => sendControl(peerId, 'lower-hand')));
      clearAlert(callAlert);
    }
  });

  // Record peer roles from the existing SSE presence stream.
  const originalConnectEvents = connectEvents;
  connectEvents = function patchedConnectEvents() {
    originalConnectEvents();
    if (!eventSource || eventSource.__boloModerationInstalled) return;
    eventSource.__boloModerationInstalled = true;

    eventSource.addEventListener('ready', (event) => {
      const data = JSON.parse(event.data || '{}');
      for (const peer of data.existingPeers || []) {
        peerRoles.set(peer.clientId, peer.role || 'guest');
        renderModeratorState(peer.clientId);
      }
      if (!currentViewerIsAdmin() && handRaisedPrivate && adminPeerIds().length) notifyAdminsOfHand();
      updatePagination();
    });

    eventSource.addEventListener('peer-joined', (event) => {
      const peer = JSON.parse(event.data || '{}');
      peerRoles.set(peer.clientId, peer.role || 'guest');
      renderModeratorState(peer.clientId);
      if (!currentViewerIsAdmin() && handRaisedPrivate && peer.role === 'admin') {
        sendControl(peer.clientId, 'raise-hand').catch(() => {});
      }
      updatePagination();
    });

    eventSource.addEventListener('peer-left', (event) => {
      const peer = JSON.parse(event.data || '{}');
      peerRoles.delete(peer.clientId);
      handRequests.delete(peer.clientId);
      speakerGrants.delete(peer.clientId);
      updatePagination();
    });
  };

  const originalHandleSignal = handleSignal;
  handleSignal = async function patchedHandleSignal(payload) {
    if (payload?.from && payload?.role) peerRoles.set(payload.from, payload.role);
    const control = decodeControl(payload?.candidate?.candidate);
    if (!control) return originalHandleSignal(payload);

    const peerId = payload.from;
    if (control.type === 'raise-hand' && currentViewerIsAdmin()) {
      handRequests.add(peerId);
      speakerGrants.delete(peerId);
      renderModeratorState(peerId);
      focusPeerPage(peerId);
      const name = payload.displayName || 'A participant';
      showAlert(callAlert, `${name} raised a hand and wants to speak.`, 'success');
      return;
    }

    if (control.type === 'lower-hand' && currentViewerIsAdmin()) {
      handRequests.delete(peerId);
      renderModeratorState(peerId);
      return;
    }

    if (control.type === 'allow-speak' && !currentViewerIsAdmin()) {
      speakerGranted = true;
      handRaisedPrivate = false;
      setLocalMic(true);
      await updatePresence();
      showAlert(callAlert, 'The administrator allowed you to speak. Your microphone is now on.', 'success');
      return;
    }

    if (control.type === 'revoke-speak' && !currentViewerIsAdmin()) {
      speakerGranted = false;
      handRaisedPrivate = false;
      setLocalMic(false);
      await updatePresence();
      showAlert(callAlert, 'The administrator muted your microphone. Raise your hand when you want to speak again.');
    }
  };

  // Preserve the private access token on refresh. The SSE connection itself
  // closes naturally, so the server removes the old live client.
  const originalLeaveSession = leaveSession;
  leaveSession = async function patchedLeaveSession(redirectToEntry = true) {
    if (redirectToEntry === false) {
      try { eventSource?.close(); } catch {}
      for (const { pc } of peers.values()) { try { pc.close(); } catch {} }
      try { localStream?.getTracks().forEach((track) => track.stop()); } catch {}
      return;
    }
    sessionStorage.removeItem(storageKey);
    return originalLeaveSession(true);
  };

  async function resumeSavedPrivateSession() {
    if (restoring || accessToken || callShell.hidden === false) return;
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); }
    catch { saved = null; }
    if (!saved?.accessToken) return;

    restoring = true;
    accessToken = saved.accessToken;
    try {
      const data = await guestApi(`/api/private-sessions/${encodeURIComponent(privateToken)}/me`);
      guest = data.guest;
      sessionInfo = data.session;
      viewerCanUseCamera = data.viewerCanUseCamera === true || guest?.canUseCamera === true;
      iceServers = data.iceServers || iceServers;

      entryCard.hidden = true;
      callShell.hidden = false;
      callTitle.textContent = sessionInfo.title;
      await startLocalMedia(false);
      connectEvents();
      await updatePresence();
      syncModerationControls();
      updatePagination();
      showAlert(callAlert, 'Session restored after reload. You rejoined muted.', 'success');
    } catch (error) {
      accessToken = null;
      sessionStorage.removeItem(storageKey);
      entryCard.hidden = false;
      callShell.hidden = true;
    } finally {
      restoring = false;
    }
  }

  syncModerationControls();
  updatePagination();
  window.setTimeout(resumeSavedPrivateSession, 120);
})();
