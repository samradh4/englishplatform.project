'use strict';

// Server-enforced guest camera requests for private sessions.
(() => {
  if (typeof privateToken === 'undefined' || typeof sendSignal !== 'function') return;

  const CONTROL_PREFIX = 'bolo-control:';
  const cameraRequests = new Map();
  let cameraRequestPending = false;
  let guestCameraGranted = false;
  let guestCameraEnabled = false;

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

  function participantName(peerId) {
    const card = document.querySelector(`[data-private-participant="${CSS.escape(peerId)}"]`);
    return card?.querySelector('[data-private-name]')?.textContent?.replace(/\s*\(You\)\s*$/, '').trim() || 'Participant';
  }

  const controlsBar = document.querySelector('.private-call-controls');
  if (!controlsBar) return;

  let requestCameraButton = document.getElementById('private-request-camera-button');
  if (!requestCameraButton) {
    requestCameraButton = document.createElement('button');
    requestCameraButton.id = 'private-request-camera-button';
    requestCameraButton.className = 'private-control-button private-request-camera-button';
    requestCameraButton.type = 'button';
    requestCameraButton.innerHTML = '<span>📷</span><strong>Request camera</strong>';
    const handButton = document.getElementById('private-hand-button');
    controlsBar.insertBefore(requestCameraButton, handButton || speakerButton);
  }

  const cameraRequestTray = document.createElement('section');
  cameraRequestTray.id = 'private-camera-request-tray';
  cameraRequestTray.className = 'private-mic-request-tray private-camera-request-tray';
  cameraRequestTray.hidden = true;
  cameraRequestTray.innerHTML = `
    <div class="private-request-tray-head">
      <div><span class="private-request-kicker">Camera requests</span><strong>Participants asking to turn on video</strong></div>
      <span id="private-camera-request-count" class="private-request-count">0</span>
    </div>
    <div id="private-camera-request-list" class="private-request-list"></div>`;

  const micTray = document.getElementById('private-mic-request-tray');
  if (micTray) micTray.insertAdjacentElement('afterend', cameraRequestTray);
  else callAlert.insertAdjacentElement('afterend', cameraRequestTray);

  function syncCameraButton() {
    const admin = viewerIsAdmin();
    requestCameraButton.hidden = admin;
    if (admin) return;

    requestCameraButton.classList.toggle('active', cameraRequestPending || guestCameraEnabled);
    if (guestCameraGranted) {
      requestCameraButton.querySelector('span').textContent = guestCameraEnabled ? '🚫' : '📷';
      requestCameraButton.querySelector('strong').textContent = guestCameraEnabled ? 'Camera off' : 'Camera on';
    } else if (cameraRequestPending) {
      requestCameraButton.querySelector('span').textContent = '⏳';
      requestCameraButton.querySelector('strong').textContent = 'Camera requested';
    } else {
      requestCameraButton.querySelector('span').textContent = '📷';
      requestCameraButton.querySelector('strong').textContent = 'Request camera';
    }
  }

  function renderCameraRequests() {
    if (!viewerIsAdmin()) {
      cameraRequestTray.hidden = true;
      return;
    }
    const entries = [...cameraRequests.entries()];
    const list = cameraRequestTray.querySelector('#private-camera-request-list');
    cameraRequestTray.querySelector('#private-camera-request-count').textContent = String(entries.length);
    cameraRequestTray.hidden = entries.length === 0;
    list.innerHTML = '';

    for (const [peerId, request] of entries) {
      const row = document.createElement('div');
      row.className = 'private-request-row';
      row.dataset.cameraRequestPeer = peerId;

      const identity = document.createElement('div');
      identity.className = 'private-request-identity';
      const name = document.createElement('strong');
      name.textContent = request.displayName || participantName(peerId);
      const note = document.createElement('small');
      note.textContent = request.granted ? 'camera permission is active' : 'wants camera access';
      identity.append(name, note);

      const actions = document.createElement('div');
      actions.className = 'private-request-actions';
      if (request.granted) {
        actions.innerHTML = '<button type="button" data-camera-request-action="revoke" class="reject">Stop camera</button>';
      } else {
        actions.innerHTML = `
          <button type="button" data-camera-request-action="accept">Accept camera</button>
          <button type="button" data-camera-request-action="reject" class="reject">Reject</button>`;
      }
      row.append(identity, actions);
      list.appendChild(row);
    }
  }

  async function setServerCameraPermission(peerId, allow) {
    return guestApi(`/api/private-sessions/${encodeURIComponent(privateToken)}/camera-moderate`, {
      method: 'POST',
      body: JSON.stringify({ targetClientId: peerId, action: allow ? 'allow-camera' : 'revoke-camera' })
    });
  }

  async function acceptCamera(peerId) {
    await setServerCameraPermission(peerId, true);
    const current = cameraRequests.get(peerId) || { displayName: participantName(peerId) };
    cameraRequests.set(peerId, { ...current, granted: true });
    renderCameraRequests();
    showAlert(callAlert, `${participantName(peerId)} was allowed to use the camera.`, 'success');
  }

  async function rejectCamera(peerId) {
    cameraRequests.delete(peerId);
    await sendControl(peerId, 'camera-request-rejected').catch(() => {});
    renderCameraRequests();
    showAlert(callAlert, `${participantName(peerId)}'s camera request was rejected.`);
  }

  async function revokeCamera(peerId) {
    await setServerCameraPermission(peerId, false);
    cameraRequests.delete(peerId);
    renderCameraRequests();
    showAlert(callAlert, `${participantName(peerId)}'s camera permission was removed.`);
  }

  cameraRequestTray.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-camera-request-action]');
    if (!button) return;
    const row = button.closest('[data-camera-request-peer]');
    const peerId = row?.dataset.cameraRequestPeer;
    if (!peerId) return;
    button.disabled = true;
    try {
      const action = button.dataset.cameraRequestAction;
      if (action === 'accept') await acceptCamera(peerId);
      else if (action === 'revoke') await revokeCamera(peerId);
      else await rejectCamera(peerId);
    } catch (error) {
      showAlert(callAlert, error.message || 'Could not update camera permission.');
    } finally {
      button.disabled = false;
    }
  });

  async function enableGuestCamera() {
    if (viewerIsAdmin() || !guestCameraGranted) return;
    let track = localStream?.getVideoTracks()[0];
    let added = false;
    if (!track || track.readyState === 'ended') {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: 'user' },
        audio: false
      });
      track = stream.getVideoTracks()[0];
      if (!track) throw new Error('No camera is available on this device.');
      localStream.addTrack(track);
      for (const { pc } of peers.values()) pc.addTrack(track, localStream);
      added = true;
    }

    track.enabled = true;
    guestCameraEnabled = true;
    cameraEnabled = true;
    setCardStream(clientId, localStream, guest.displayName || guest.name, true, guest.specialTag || '');
    updateCardState(clientId, { micEnabled, cameraEnabled: true });
    await updatePresence();

    if (added) {
      await Promise.allSettled([...peers.entries()].map(([peerId, meta]) =>
        createOfferFor(peerId, meta.displayName || 'Participant', meta.specialTag || '')
      ));
    }
    syncCameraButton();
  }

  async function disableGuestCamera(stopTrack = false) {
    const track = localStream?.getVideoTracks()[0];
    if (track) {
      track.enabled = false;
      if (stopTrack) track.stop();
    }
    guestCameraEnabled = false;
    cameraEnabled = false;
    updateCardState(clientId, { micEnabled, cameraEnabled: false });
    await updatePresence().catch(() => {});
    syncCameraButton();
  }

  requestCameraButton.addEventListener('click', async () => {
    if (viewerIsAdmin()) return;

    if (guestCameraGranted) {
      try {
        if (guestCameraEnabled) await disableGuestCamera(false);
        else await enableGuestCamera();
      } catch (error) {
        showAlert(callAlert, error.name === 'NotAllowedError'
          ? 'Camera permission was denied in your browser. Allow camera access and try again.'
          : (error.message || 'Could not start the camera.'));
      }
      return;
    }

    if (cameraRequestPending) {
      cameraRequestPending = false;
      syncCameraButton();
      await broadcastControl('camera-request-cancelled');
      showAlert(callAlert, 'Camera request cancelled.');
      return;
    }

    cameraRequestPending = true;
    syncCameraButton();
    const sent = await broadcastControl('camera-request', {
      displayName: guest?.displayName || guest?.name || 'Participant',
      requestedAt: new Date().toISOString()
    });
    showAlert(callAlert, sent
      ? 'Camera requested. Waiting for the administrator to accept.'
      : 'Camera requested. The administrator will see it when they join.', 'success');
  });

  const previousHandleSignal = handleSignal;
  handleSignal = async function cameraRequestHandleSignal(payload) {
    const control = decodeControl(payload?.candidate?.candidate);
    if (!control) return previousHandleSignal(payload);

    const peerId = payload.from;
    if (control.type === 'camera-request' && viewerIsAdmin()) {
      cameraRequests.set(peerId, {
        displayName: control.displayName || payload.displayName || participantName(peerId),
        requestedAt: control.requestedAt || new Date().toISOString(),
        granted: false
      });
      renderCameraRequests();
      showAlert(callAlert, `${control.displayName || payload.displayName || 'A participant'} requested camera access.`, 'success');
      return;
    }

    if (control.type === 'camera-request-cancelled' && viewerIsAdmin()) {
      const request = cameraRequests.get(peerId);
      if (!request?.granted) cameraRequests.delete(peerId);
      renderCameraRequests();
      return;
    }

    if (control.type === 'camera-request-rejected' && !viewerIsAdmin()) {
      cameraRequestPending = false;
      guestCameraGranted = false;
      syncCameraButton();
      showAlert(callAlert, 'The administrator rejected your camera request. Your camera stays off.');
      return;
    }

    return previousHandleSignal(payload);
  };

  const previousConnectEvents = connectEvents;
  connectEvents = function cameraRequestConnectEvents() {
    previousConnectEvents();
    if (!eventSource || eventSource.__boloCameraRequestInstalled) return;
    eventSource.__boloCameraRequestInstalled = true;

    eventSource.addEventListener('ready', () => {
      syncCameraButton();
      renderCameraRequests();
      if (cameraRequestPending && !viewerIsAdmin()) {
        window.setTimeout(() => broadcastControl('camera-request', {
          displayName: guest?.displayName || guest?.name || 'Participant',
          requestedAt: new Date().toISOString()
        }).catch(() => {}), 350);
      }
    });

    eventSource.addEventListener('peer-left', (event) => {
      const peer = JSON.parse(event.data || '{}');
      cameraRequests.delete(peer.clientId);
      renderCameraRequests();
    });

    eventSource.addEventListener('private-moderation', async (event) => {
      const data = JSON.parse(event.data || '{}');
      if (viewerIsAdmin()) return;
      if (data.action === 'allow-camera') {
        cameraRequestPending = false;
        guestCameraGranted = true;
        syncCameraButton();
        try {
          await enableGuestCamera();
          showAlert(callAlert, 'The administrator allowed your camera. Your camera is now on.', 'success');
        } catch (error) {
          syncCameraButton();
          showAlert(callAlert, error.name === 'NotAllowedError'
            ? 'Camera was approved, but browser camera permission is blocked. Allow camera access and press Camera on.'
            : (error.message || 'Camera was approved, but it could not start.'));
        }
      } else if (data.action === 'revoke-camera') {
        cameraRequestPending = false;
        guestCameraGranted = false;
        await disableGuestCamera(true);
        showAlert(callAlert, 'The administrator turned off your camera permission.');
      }
    });
  };

  syncCameraButton();
  renderCameraRequests();
})();
