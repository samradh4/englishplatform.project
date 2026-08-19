'use strict';

// Foreground/background recovery for private-session calls.
// Mobile browsers may suspend media playback, EventSource, or ICE while the
// user switches tabs/apps. When Bolo English becomes active again, restore
// playback and signaling without asking the guest to join again.
(() => {
  if (typeof privateToken === 'undefined' || typeof sendSignal !== 'function') return;

  let resumeRunning = false;
  let lastResumeAt = 0;
  let foregroundGeneration = 0;
  let wakeLock = null;

  function inActiveCall() {
    return Boolean(accessToken && callShell && callShell.hidden === false && !leaving);
  }

  function peerHealthy(pc) {
    return Boolean(pc && pc.connectionState !== 'closed' && (
      pc.connectionState === 'connected' ||
      pc.iceConnectionState === 'connected' ||
      pc.iceConnectionState === 'completed'
    ));
  }

  async function requestWakeLock() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener?.('release', () => { wakeLock = null; });
    } catch {
      wakeLock = null;
    }
  }

  async function resumeRemotePlayback() {
    const videos = [...document.querySelectorAll('#private-video-grid video')];
    await Promise.allSettled(videos.map(async (video) => {
      video.muted = video.closest('[data-private-participant]')?.dataset.privateParticipant === clientId || !speakerEnabled;
      if (video.srcObject && video.paused) await video.play();
    }));
  }

  async function ensureLiveMicrophoneTrack() {
    if (!localStream || !navigator.mediaDevices?.getUserMedia) return;
    const existing = localStream.getAudioTracks()[0];
    if (existing && existing.readyState === 'live') {
      existing.enabled = micEnabled === true;
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });
      const replacement = stream.getAudioTracks()[0];
      if (!replacement) return;
      replacement.enabled = micEnabled === true;

      for (const old of localStream.getAudioTracks()) {
        try { localStream.removeTrack(old); } catch {}
        try { old.stop(); } catch {}
      }
      localStream.addTrack(replacement);

      await Promise.allSettled([...peers.values()].map(async ({ pc }) => {
        if (!pc || pc.connectionState === 'closed') return;
        const sender = pc.getSenders().find((item) => item.track?.kind === 'audio' || (!item.track && item.replaceTrack));
        if (sender) await sender.replaceTrack(replacement);
        else pc.addTrack(replacement, localStream);
      }));

      setCardStream(clientId, localStream, guest?.displayName || guest?.name || 'You', true, guest?.specialTag || '');
      await updatePresence().catch(() => {});
    } catch (error) {
      console.warn('Could not restore microphone after returning to Bolo English:', error);
    }
  }

  function ensureEventStream() {
    if (!inActiveCall()) return;
    // OPEN = 1. CONNECTING = 0 is still a valid EventSource and should be given
    // a moment to reconnect itself. CLOSED = 2 needs a fresh stream.
    if (!eventSource || eventSource.readyState === EventSource.CLOSED) {
      try { eventSource?.close(); } catch {}
      try { connectEvents(); } catch (error) {
        console.warn('Could not restore private-session event stream:', error);
      }
    }
  }

  async function restartPeer(peerId, meta) {
    const pc = meta?.pc;
    if (!pc || pc.connectionState === 'closed' || peerHealthy(pc)) return;

    try {
      if (pc.signalingState !== 'stable') {
        window.setTimeout(() => restartPeer(peerId, meta).catch(() => {}), 900);
        return;
      }
      if (typeof pc.restartIce === 'function') pc.restartIce();
      meta.makingOffer = true;
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      await sendSignal(peerId, { description: pc.localDescription });
    } catch (error) {
      console.warn('Foreground ICE restart failed:', error);
    } finally {
      meta.makingOffer = false;
    }
  }

  async function resumePrivateCall(reason = 'foreground') {
    if (!inActiveCall() || document.visibilityState === 'hidden' || resumeRunning) return;
    const now = Date.now();
    if (now - lastResumeAt < 700) return;
    lastResumeAt = now;
    resumeRunning = true;
    const generation = ++foregroundGeneration;

    try {
      setCallStatus('Restoring call…');
      ensureEventStream();
      await ensureLiveMicrophoneTrack();
      await resumeRemotePlayback();
      await requestWakeLock();

      const unhealthy = [...peers.entries()].filter(([, meta]) => !peerHealthy(meta.pc));
      await Promise.allSettled(unhealthy.map(([peerId, meta]) => restartPeer(peerId, meta)));

      // EventSource may still be CONNECTING immediately after a foreground
      // transition. Recheck once browser timers/network sockets are awake.
      window.setTimeout(async () => {
        if (generation !== foregroundGeneration || !inActiveCall() || document.visibilityState === 'hidden') return;
        ensureEventStream();
        await resumeRemotePlayback();
        const stillUnhealthy = [...peers.entries()].filter(([, meta]) => !peerHealthy(meta.pc));
        await Promise.allSettled(stillUnhealthy.map(([peerId, meta]) => restartPeer(peerId, meta)));
        if (!stillUnhealthy.length) {
          setCallStatus(`${videoGrid.children.length} participant(s) connected`);
          const alertText = String(callAlert?.textContent || '');
          if (/unstable|restore audio|reconnecting|connection.*trouble/i.test(alertText)) clearAlert(callAlert);
        }
      }, reason === 'pageshow' ? 600 : 1200);
    } finally {
      resumeRunning = false;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      window.setTimeout(() => resumePrivateCall('visibility').catch(() => {}), 80);
    }
  });

  window.addEventListener('focus', () => {
    window.setTimeout(() => resumePrivateCall('focus').catch(() => {}), 80);
  });

  window.addEventListener('pageshow', () => {
    window.setTimeout(() => resumePrivateCall('pageshow').catch(() => {}), 80);
  });

  window.addEventListener('online', () => {
    window.setTimeout(() => resumePrivateCall('online').catch(() => {}), 120);
  });

  // Some mobile browsers require a fresh user gesture to restart a paused
  // media element after an app switch. Any tap on the room retries playback.
  document.addEventListener('pointerdown', () => {
    if (inActiveCall()) resumeRemotePlayback().catch(() => {});
  }, { passive: true });

  window.addEventListener('pagehide', () => {
    try { wakeLock?.release?.(); } catch {}
    wakeLock = null;
  });
})();
