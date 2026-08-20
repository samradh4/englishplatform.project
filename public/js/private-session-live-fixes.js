'use strict';

// Final private-room reliability layer.
// - ignores stale SDP answers instead of crashing a stable peer
// - rolls back polite peers on offer collisions
// - serializes normal offers per peer
// - mirrors camera requests through the server/SSE path
// - shows a visible "joined the room" toast
// - keeps WhatsApp clear of the mobile chat composer
// - blocks digits and links from private chat before they are sent
(() => {
  if (typeof handleSignal !== 'function' || typeof connectEvents !== 'function') return;

  const CONTROL_PREFIX = 'bolo-control:';
  const offerQueues = new Map();
  let cameraServerPending = false;

  function viewerIsAdmin() {
    return guest?.role === 'admin' || viewerCanUseCamera === true;
  }

  function encodeControl(control) {
    return `${CONTROL_PREFIX}${encodeURIComponent(JSON.stringify(control))}`;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isBlockedChatText(value) {
    const text = String(value || '').trim();
    if (/\d/.test(text)) return 'Numbers are not allowed in room chat.';
    if (/(?:https?:\/\/|www\.|mailto:|(?:[a-z0-9-]+\.)+(?:com|org|net|in|io|co|me|app|xyz|ly|ai|dev|edu|gov)\b)/i.test(text)) {
      return 'Links are not allowed in room chat.';
    }
    return '';
  }

  // Keep the floating support shortcut away from the message composer.
  const chatSafetyStyle = document.createElement('style');
  chatSafetyStyle.id = 'private-chat-safety-style';
  chatSafetyStyle.textContent = `
    body.private-chat-open .bolo-whatsapp-support{display:none!important}
  `;
  document.head.appendChild(chatSafetyStyle);

  // The collaboration script creates the chat form before this script loads.
  // Capture phase prevents its normal submit handler from running for blocked text.
  const privateChatForm = document.getElementById('private-chat-form');
  const privateChatInput = document.getElementById('private-chat-input');
  privateChatForm?.addEventListener('submit', (event) => {
    const error = isBlockedChatText(privateChatInput?.value);
    if (!error) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showAlert(callAlert, error);
    privateChatInput?.focus();
  }, true);

  function ensureToastLayer() {
    let layer = document.getElementById('private-room-toasts');
    if (layer) return layer;

    const style = document.createElement('style');
    style.textContent = `
      #private-room-toasts{position:fixed;top:88px;right:18px;z-index:5000;display:grid;gap:8px;pointer-events:none;max-width:min(360px,calc(100vw - 24px))}
      .private-room-toast{padding:11px 14px;border-radius:14px;background:#e9fff1;color:#123c25;border:1px solid rgba(37,160,91,.25);box-shadow:0 10px 30px rgba(0,0,0,.2);font:700 13px/1.35 inherit;animation:boloToastIn .18s ease-out}
      @keyframes boloToastIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
      @media(max-width:640px){#private-room-toasts{top:68px;left:12px;right:12px;max-width:none}.private-room-toast{font-size:12px;padding:10px 12px}}
    `;
    document.head.appendChild(style);

    layer = document.createElement('div');
    layer.id = 'private-room-toasts';
    layer.setAttribute('aria-live', 'polite');
    document.body.appendChild(layer);
    return layer;
  }

  function showRoomToast(message) {
    const layer = ensureToastLayer();
    const toast = document.createElement('div');
    toast.className = 'private-room-toast';
    toast.textContent = message;
    layer.appendChild(toast);
    window.setTimeout(() => toast.remove(), 4200);
  }

  // Perfect-negotiation guard: stale answers are harmless and should be ignored.
  const previousHandleSignal = handleSignal;
  handleSignal = async function stableHandleSignal(payload) {
    const peerId = payload?.from;
    const description = payload?.description;
    const meta = peerId ? peers.get(peerId) : null;
    const pc = meta?.pc;

    if (description?.type === 'answer' && pc && pc.signalingState !== 'have-local-offer') {
      console.warn('Ignored stale private-session SDP answer in state:', pc.signalingState);
      if (typeof updateCardState === 'function') updateCardState(peerId, payload || {});
      return;
    }

    if (description?.type === 'offer' && pc) {
      const collision = meta.makingOffer || pc.signalingState !== 'stable';
      const polite = String(clientId) < String(peerId);
      if (collision && polite && pc.signalingState !== 'stable') {
        try {
          await pc.setLocalDescription({ type: 'rollback' });
          meta.makingOffer = false;
        } catch (error) {
          console.warn('Private-session rollback failed; continuing negotiation:', error);
        }
      }
    }

    return previousHandleSignal(payload);
  };

  // Avoid overlapping normal offers to the same peer (camera add + reconnect + join).
  if (typeof createOfferFor === 'function') {
    const previousCreateOfferFor = createOfferFor;
    createOfferFor = function queuedCreateOfferFor(peerId, displayName, specialTag = '') {
      const previous = offerQueues.get(peerId) || Promise.resolve();
      const task = previous.catch(() => {}).then(async () => {
        const meta = peers.get(peerId);
        const pc = meta?.pc;

        if (pc && pc.signalingState !== 'stable') {
          for (let i = 0; i < 12 && pc.signalingState !== 'stable'; i += 1) await sleep(120);
          if (pc.signalingState !== 'stable') {
            console.warn('Skipped duplicate private-session offer while peer was', pc.signalingState);
            return meta;
          }
        }
        return previousCreateOfferFor(peerId, displayName, specialTag);
      }).finally(() => {
        if (offerQueues.get(peerId) === task) offerQueues.delete(peerId);
      });
      offerQueues.set(peerId, task);
      return task;
    };
  }

  async function sendCameraRequestToServer(action) {
    if (!accessToken || !clientId || viewerIsAdmin()) return;
    await guestApi(`/api/private-sessions/${encodeURIComponent(privateToken)}/camera-request`, {
      method: 'POST',
      body: JSON.stringify({ clientId, action })
    });
  }

  const requestCameraButton = document.getElementById('private-request-camera-button');
  if (requestCameraButton) {
    requestCameraButton.addEventListener('click', async () => {
      if (viewerIsAdmin()) return;
      const label = requestCameraButton.querySelector('strong')?.textContent || '';
      try {
        if (/camera requested/i.test(label) && !cameraServerPending) {
          await sendCameraRequestToServer('request-camera');
          cameraServerPending = true;
          showRoomToast('📷 Camera request sent to the administrator.');
        } else if (/request camera/i.test(label) && cameraServerPending) {
          await sendCameraRequestToServer('cancel-camera');
          cameraServerPending = false;
        } else if (/camera on|camera off/i.test(label)) {
          cameraServerPending = false;
        }
      } catch (error) {
        console.warn('Server camera request failed:', error);
        showAlert(callAlert, error.message || 'Could not send the camera request to the administrator.');
      }
    });
  }

  const previousConnectEvents = connectEvents;
  connectEvents = function liveFixConnectEvents() {
    previousConnectEvents();
    if (!eventSource || eventSource.__boloLiveFixesInstalled) return;
    eventSource.__boloLiveFixesInstalled = true;

    eventSource.addEventListener('peer-joined', (event) => {
      const peer = JSON.parse(event.data || '{}');
      showRoomToast(`👋 ${peer.displayName || 'A participant'} joined the room`);
    });

    eventSource.addEventListener('camera-request', (event) => {
      if (!viewerIsAdmin()) return;
      const data = JSON.parse(event.data || '{}');
      if (!data.clientId) return;
      handleSignal({
        from: data.clientId,
        displayName: data.displayName || 'Participant',
        candidate: {
          candidate: encodeControl({ type: 'camera-request', displayName: data.displayName || 'Participant', requestedAt: data.requestedAt }),
          sdpMid: '0',
          sdpMLineIndex: 0
        }
      }).catch((error) => console.warn('Could not render camera request:', error));
    });

    eventSource.addEventListener('camera-request-cancelled', (event) => {
      if (!viewerIsAdmin()) return;
      const data = JSON.parse(event.data || '{}');
      if (!data.clientId) return;
      handleSignal({
        from: data.clientId,
        displayName: data.displayName || 'Participant',
        candidate: {
          candidate: encodeControl({ type: 'camera-request-cancelled', displayName: data.displayName || 'Participant' }),
          sdpMid: '0',
          sdpMLineIndex: 0
        }
      }).catch(() => {});
    });

    eventSource.addEventListener('ready', (event) => {
      if (!viewerIsAdmin()) return;
      const data = JSON.parse(event.data || '{}');
      for (const peer of data.existingPeers || []) {
        if (!peer.cameraRequested) continue;
        handleSignal({
          from: peer.clientId,
          displayName: peer.displayName || 'Participant',
          candidate: {
            candidate: encodeControl({ type: 'camera-request', displayName: peer.displayName || 'Participant' }),
            sdpMid: '0',
            sdpMLineIndex: 0
          }
        }).catch(() => {});
      }
    });

    eventSource.addEventListener('private-moderation', (event) => {
      const data = JSON.parse(event.data || '{}');
      if (!viewerIsAdmin() && ['allow-camera', 'revoke-camera'].includes(data.action)) cameraServerPending = false;
    });
  };
})();
