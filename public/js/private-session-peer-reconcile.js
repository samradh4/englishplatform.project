'use strict';

// Reconcile private-room UI/WebRTC state with the server after reconnects.
// This prevents ghost participant cards, stale peer signaling, duplicate
// "joined" notices, and the transient "Participant connection not found"
// banner caused by signaling an already-removed client id.
(() => {
  if (typeof connectEvents !== 'function' || typeof sendSignal !== 'function') return;

  const recentToastText = new Map();

  function cleanupPeer(peerId) {
    if (!peerId || peerId === clientId) return;
    try { peers.get(peerId)?.pc?.close?.(); } catch {}
    peers.delete(peerId);
    pendingCandidates?.delete?.(peerId);
    try { removePeerCard(peerId); } catch {
      document.querySelector(`[data-private-participant="${CSS.escape(peerId)}"]`)?.remove();
    }
  }

  function reconcileFromReady(data) {
    const current = new Set(
      (Array.isArray(data?.existingPeers) ? data.existingPeers : [])
        .map((peer) => String(peer?.clientId || ''))
        .filter((id) => id && id !== clientId)
    );

    // Server `ready.existingPeers` is authoritative for this connection.
    for (const peerId of [...peers.keys()]) {
      if (!current.has(String(peerId))) cleanupPeer(peerId);
    }

    document.querySelectorAll('[data-private-participant]').forEach((card) => {
      const id = String(card.dataset.privateParticipant || '');
      if (!id || id === clientId) return;
      if (!current.has(id)) card.remove();
    });

    if (typeof setCallStatus === 'function') {
      setCallStatus(`Connected · ${current.size + 1} participant(s)`);
    }
  }

  // A stale peer can disappear between `ready` and an offer/ICE send. Treat
  // that 400 as a normal reconnect race instead of surfacing a red error.
  const previousSendSignal = sendSignal;
  sendSignal = async function reconciledSendSignal(to, payload) {
    try {
      return await previousSendSignal(to, payload);
    } catch (error) {
      const message = String(error?.message || '');
      if (/participant connection (?:not found|is unavailable)|call participant is unavailable/i.test(message)) {
        cleanupPeer(String(to || ''));
        return { stalePeer: true };
      }
      throw error;
    }
  };

  const previousConnectEvents = connectEvents;
  connectEvents = function reconciledConnectEvents() {
    // Do not create a second EventSource while the current one is still open
    // or reconnecting. EventSource already retries by itself.
    if (eventSource && eventSource.readyState !== EventSource.CLOSED) return eventSource;

    previousConnectEvents();
    const source = eventSource;
    if (!source || source.__boloPeerReconcileInstalled) return source;
    source.__boloPeerReconcileInstalled = true;

    source.addEventListener('ready', (event) => {
      try { reconcileFromReady(JSON.parse(event.data || '{}')); }
      catch (error) { console.warn('Private peer reconciliation failed:', error); }
    });

    source.addEventListener('peer-left', (event) => {
      try {
        const data = JSON.parse(event.data || '{}');
        cleanupPeer(String(data.clientId || ''));
      } catch {}
    });

    return source;
  };

  // The join-toast layer can receive the same event twice during a reconnect.
  // Remove only exact duplicate toast text that appears within a short window.
  const toastObserver = new MutationObserver((records) => {
    const now = Date.now();
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement) || !node.classList.contains('private-room-toast')) continue;
        const text = String(node.textContent || '').trim();
        if (!text || !/joined the room$/i.test(text)) continue;
        const previous = recentToastText.get(text) || 0;
        if (now - previous < 3500) {
          node.remove();
          continue;
        }
        recentToastText.set(text, now);
      }
    }
    for (const [text, time] of recentToastText) {
      if (now - time > 8000) recentToastText.delete(text);
    }
  });

  toastObserver.observe(document.body, { childList: true, subtree: true });
})();
