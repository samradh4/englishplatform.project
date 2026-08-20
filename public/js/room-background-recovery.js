'use strict';

// Best-effort mobile background/foreground resilience for normal Bolo English
// member rooms. Mobile operating systems may still suspend browser microphone
// capture while another app is fully foregrounded; this layer keeps the call
// transport alive where the browser allows it and repairs media immediately
// when Bolo English becomes active again.
(() => {
  if (typeof code === 'undefined' || typeof sendSignal !== 'function') return;

  let resumeRunning = false;
  let lastResumeAt = 0;
  let wakeLock = null;
  let watchedMicTrack = null;
  let recoveryTimer = null;
  let anchorContext = null;
  let anchorOscillator = null;
  let anchorGain = null;

  function callActive() {
    return Boolean(hasJoined && !isLeaving);
  }

  function armMediaSession() {
    if (!('mediaSession' in navigator)) return;
    try {
      if ('MediaMetadata' in window) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: roomData?.room?.name || roomData?.room?.title || 'Bolo English voice room',
          artist: 'Bolo English',
          album: 'Voice chat in progress'
        });
      }
      navigator.mediaSession.playbackState = callActive() ? 'playing' : 'none';
      navigator.mediaSession.setActionHandler?.('play', () => resumeRoomCall('media-play').catch(() => {}));
      navigator.mediaSession.setActionHandler?.('pause', () => {});
    } catch {}
  }

  async function ensureBackgroundAudioAnchor() {
    if (!callActive()) return;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    try {
      if (!anchorContext) {
        anchorContext = new AudioContextCtor();
        anchorOscillator = anchorContext.createOscillator();
        anchorGain = anchorContext.createGain();
        anchorOscillator.frequency.value = 18;
        anchorGain.gain.value = 0.000001;
        anchorOscillator.connect(anchorGain);
        anchorGain.connect(anchorContext.destination);
        anchorOscillator.start();
      }
      if (anchorContext.state === 'suspended' && document.visibilityState === 'visible') await anchorContext.resume();
    } catch (error) {
      console.warn('Room background audio anchor unavailable:', error);
    }
  }

  async function requestWakeLock() {
    if (!callActive() || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener?.('release', () => { wakeLock = null; });
    } catch {
      wakeLock = null;
    }
  }

  async function resumePlayback() {
    if (!callActive()) return;
    try {
      if (audioContext?.state === 'suspended') await audioContext.resume();
    } catch {}

    const audioElements = [...document.querySelectorAll('#participant-grid audio')];
    await Promise.allSettled(audioElements.map(async (audio) => {
      audio.muted = !speakerEnabled;
      if (audio.srcObject && audio.paused) await audio.play();
    }));
  }

  function watchMicTrack(track) {
    if (!track || watchedMicTrack === track) return;
    watchedMicTrack = track;
    track.contentHint = 'speech';
    track.addEventListener('mute', () => {
      if (!callActive()) return;
      if (document.visibilityState === 'visible') window.setTimeout(() => resumeRoomCall('mic-muted').catch(() => {}), 250);
    });
    track.addEventListener('ended', () => {
      if (!callActive()) return;
      if (document.visibilityState === 'visible') window.setTimeout(() => resumeRoomCall('mic-ended').catch(() => {}), 100);
    });
  }

  async function ensureMicrophoneTrack() {
    if (!callActive() || !localStream || !navigator.mediaDevices?.getUserMedia) return;
    const existing = localStream.getAudioTracks()[0];
    if (existing?.readyState === 'live') {
      existing.enabled = micEnabled === true && forcedMuted !== true;
      watchMicTrack(existing);
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false
    });
    const replacement = stream.getAudioTracks()[0];
    if (!replacement) return;
    replacement.enabled = micEnabled === true && forcedMuted !== true;
    watchMicTrack(replacement);

    for (const old of localStream.getAudioTracks()) {
      try { localStream.removeTrack(old); } catch {}
      try { old.stop(); } catch {}
    }
    localStream.addTrack(replacement);

    await Promise.allSettled([...peers.values()].map(async (pc) => {
      if (!pc || pc.connectionState === 'closed') return;
      const sender = pc.getSenders().find((item) => item.track?.kind === 'audio');
      if (sender) await sender.replaceTrack(replacement);
      else pc.addTrack(replacement, localStream);
    }));

    if (voiceMode === 'relay') {
      try { startRelayCapture(); } catch {}
    }
  }

  function transportHealthy(pc) {
    return Boolean(pc && pc.connectionState !== 'closed' && (
      pc.connectionState === 'connected' ||
      pc.iceConnectionState === 'connected' ||
      pc.iceConnectionState === 'completed'
    ));
  }

  async function restartPeer(peerId, pc) {
    if (!pc || transportHealthy(pc) || pc.connectionState === 'closed') return;
    if (pc.signalingState !== 'stable') return;
    try {
      pc.restartIce?.();
      const offer = await pc.createOffer({ iceRestart: true, offerToReceiveAudio: true });
      if (pc.signalingState !== 'stable') return;
      await pc.setLocalDescription(offer);
      await sendSignal(peerId, { description: pc.localDescription });
    } catch (error) {
      console.warn('Bolo room background ICE recovery failed:', error);
    }
  }

  function ensureEventAndRelayTransport() {
    if (!callActive()) return;
    if (!eventSource || eventSource.readyState === EventSource.CLOSED) {
      try { eventSource?.close(); } catch {}
      try { connectEvents(); } catch {}
    }
    if (voiceMode === 'relay' && (!relaySocket || relaySocket.readyState === WebSocket.CLOSED)) {
      try { startRelayVoice(); } catch {}
    }
  }

  async function resumeRoomCall(reason = 'foreground') {
    if (!callActive() || resumeRunning || document.visibilityState === 'hidden') return;
    const now = Date.now();
    if (now - lastResumeAt < 600) return;
    lastResumeAt = now;
    resumeRunning = true;

    try {
      armMediaSession();
      await ensureBackgroundAudioAnchor();
      ensureEventAndRelayTransport();
      await ensureMicrophoneTrack().catch((error) => console.warn('Could not restore room microphone:', error));
      await resumePlayback();
      await requestWakeLock();

      if (voiceMode !== 'relay') {
        const unhealthy = [...peers.entries()].filter(([, pc]) => !transportHealthy(pc));
        await Promise.allSettled(unhealthy.map(([peerId, pc]) => restartPeer(peerId, pc)));
      }

      window.setTimeout(async () => {
        if (!callActive() || document.visibilityState === 'hidden') return;
        ensureEventAndRelayTransport();
        await ensureBackgroundAudioAnchor();
        await resumePlayback();
        if (voiceMode !== 'relay') {
          const unhealthy = [...peers.entries()].filter(([, pc]) => !transportHealthy(pc));
          await Promise.allSettled(unhealthy.map(([peerId, pc]) => restartPeer(peerId, pc)));
        }
        document.getElementById('local-connection')?.replaceChildren(document.createTextNode(
          voiceMode === 'relay' ? 'Secure relay connected' : 'Connected'
        ));
      }, reason === 'pageshow' ? 600 : 1200);
    } finally {
      resumeRunning = false;
    }
  }

  function prepareForBackground() {
    if (!callActive()) return;
    armMediaSession();
    ensureBackgroundAudioAnchor().catch(() => {});
    resumePlayback().catch(() => {});
    const track = localStream?.getAudioTracks?.()[0];
    if (track) watchMicTrack(track);
    ensureEventAndRelayTransport();
  }

  document.addEventListener('visibilitychange', () => {
    if (!callActive()) return;
    if (document.visibilityState === 'hidden') prepareForBackground();
    else window.setTimeout(() => resumeRoomCall('visibility').catch(() => {}), 80);
  });

  window.addEventListener('focus', () => window.setTimeout(() => resumeRoomCall('focus').catch(() => {}), 80));
  window.addEventListener('pageshow', () => window.setTimeout(() => resumeRoomCall('pageshow').catch(() => {}), 80));
  window.addEventListener('online', () => window.setTimeout(() => resumeRoomCall('online').catch(() => {}), 100));
  document.addEventListener('resume', () => window.setTimeout(() => resumeRoomCall('resume').catch(() => {}), 80));
  document.addEventListener('freeze', prepareForBackground);

  document.addEventListener('pointerdown', () => {
    if (!callActive()) return;
    ensureBackgroundAudioAnchor().catch(() => {});
    resumePlayback().catch(() => {});
  }, { passive: true });

  recoveryTimer = window.setInterval(() => {
    if (!callActive()) return;
    if (document.visibilityState === 'visible') resumeRoomCall('health-check').catch(() => {});
    else prepareForBackground();
  }, 8000);

  window.addEventListener('pagehide', () => {
    try { wakeLock?.release?.(); } catch {}
    wakeLock = null;
  });

  window.addEventListener('beforeunload', () => {
    try { anchorOscillator?.stop?.(); } catch {}
    try { anchorContext?.close?.(); } catch {}
    anchorContext = null;
    anchorOscillator = null;
    anchorGain = null;
  });

  armMediaSession();
})();
