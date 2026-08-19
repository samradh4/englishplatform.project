'use strict';

// Recovery layer for private-session WebRTC calls.
// The main private-session script owns signaling and media. This file adds
// automatic ICE restarts when an already-working peer connection drops.
(() => {
  if (typeof createPeer !== 'function' || typeof sendSignal !== 'function') return;

  const originalCreatePeer = createPeer;
  const recoveryTimers = new Map();
  const restartInFlight = new Set();
  const maxRestartAttempts = 4;

  function clearRecoveryTimer(peerId) {
    const timer = recoveryTimers.get(peerId);
    if (timer) clearTimeout(timer);
    recoveryTimers.delete(peerId);
  }

  function connectionIsHealthy(pc) {
    return pc && (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed');
  }

  function clearConnectionWarning() {
    if (!callAlert) return;
    const text = String(callAlert.textContent || '');
    if (/TURN server|connection is having trouble|reconnecting audio/i.test(text)) clearAlert(callAlert);
  }

  function connectedStatus() {
    setCallStatus(`${videoGrid.children.length} participant(s) connected`);
    clearConnectionWarning();
  }

  async function restartIceForPeer(peerId, meta) {
    const pc = meta?.pc;
    if (!pc || pc.connectionState === 'closed' || leaving || restartInFlight.has(peerId)) return;
    if (connectionIsHealthy(pc)) {
      meta.recoveryAttempts = 0;
      connectedStatus();
      return;
    }

    const attempt = Number(meta.recoveryAttempts || 0) + 1;
    meta.recoveryAttempts = attempt;
    if (attempt > maxRestartAttempts) {
      setCallStatus('Connection unstable · retrying in the background…');
      showAlert(callAlert, 'The network connection is unstable. Bolo English will keep trying to restore audio automatically.');
      scheduleRecovery(peerId, meta, 8000);
      return;
    }

    restartInFlight.add(peerId);
    try {
      setCallStatus(`Reconnecting audio… attempt ${attempt}/${maxRestartAttempts}`);

      // To avoid both browsers sending restart offers at the same instant,
      // one deterministic side goes first. The other side retries later.
      const primaryRestartSide = String(clientId) < String(peerId);
      if (!primaryRestartSide && attempt === 1) {
        scheduleRecovery(peerId, meta, 2500);
        return;
      }

      if (typeof pc.restartIce === 'function') pc.restartIce();
      meta.makingOffer = true;
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      await sendSignal(peerId, { description: pc.localDescription });

      // Give ICE gathering/nomination time. If the direct route is gone,
      // the TURN server in iceServers can be selected automatically.
      scheduleRecovery(peerId, meta, Math.min(3000 + attempt * 1500, 7500));
    } catch (error) {
      console.warn('Private session ICE restart failed:', error);
      scheduleRecovery(peerId, meta, Math.min(2500 + attempt * 1500, 7000));
    } finally {
      meta.makingOffer = false;
      restartInFlight.delete(peerId);
    }
  }

  function scheduleRecovery(peerId, meta, delay = 2200) {
    clearRecoveryTimer(peerId);
    recoveryTimers.set(peerId, setTimeout(() => {
      recoveryTimers.delete(peerId);
      if (!meta?.pc || meta.pc.connectionState === 'closed' || leaving) return;
      if (connectionIsHealthy(meta.pc)) {
        meta.recoveryAttempts = 0;
        connectedStatus();
        return;
      }
      restartIceForPeer(peerId, meta).catch(() => {});
    }, delay));
  }

  createPeer = function patchedCreatePeer(peerId, displayName, specialTag = '') {
    const meta = originalCreatePeer(peerId, displayName, specialTag);
    if (!meta || meta.recoveryInstalled) return meta;
    meta.recoveryInstalled = true;
    meta.recoveryAttempts = 0;

    const pc = meta.pc;
    const evaluateConnection = () => {
      const state = pc.connectionState;
      const iceState = pc.iceConnectionState;

      if (connectionIsHealthy(pc)) {
        clearRecoveryTimer(peerId);
        meta.recoveryAttempts = 0;
        connectedStatus();
        return;
      }

      if (state === 'failed' || iceState === 'failed') {
        scheduleRecovery(peerId, meta, 250);
      } else if (state === 'disconnected' || iceState === 'disconnected') {
        // Short grace period prevents unnecessary renegotiation for tiny
        // Wi-Fi/mobile-network hiccups that recover by themselves.
        scheduleRecovery(peerId, meta, 2200);
      } else if (state === 'closed') {
        clearRecoveryTimer(peerId);
        restartInFlight.delete(peerId);
      }
    };

    pc.addEventListener('connectionstatechange', evaluateConnection);
    pc.addEventListener('iceconnectionstatechange', evaluateConnection);
    return meta;
  };

  window.addEventListener('offline', () => {
    setCallStatus('Network offline · waiting to reconnect…');
  });

  window.addEventListener('online', () => {
    setCallStatus('Network restored · reconnecting audio…');
    for (const [peerId, meta] of peers.entries()) {
      if (!connectionIsHealthy(meta.pc)) scheduleRecovery(peerId, meta, 300);
    }
  });

  window.addEventListener('beforeunload', () => {
    for (const peerId of recoveryTimers.keys()) clearRecoveryTimer(peerId);
  });
})();
