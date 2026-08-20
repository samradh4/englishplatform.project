'use strict';

// Best-effort mobile background continuity for private sessions.
// Browsers/operating systems remain in control of whether microphone capture
// is allowed while another app is fully foregrounded. This layer preserves
// the active media session where supported and repairs playback/capture as
// soon as the page is resumed.
(() => {
  if (typeof privateToken === 'undefined' || typeof sendSignal !== 'function') return;

  let watchedMicTrack = null;
  let wakeLock = null;
  let busy = false;
  let lastResumeAt = 0;
  let anchorContext = null;
  let anchorOscillator = null;
  let anchorGain = null;

  function active() {
    return Boolean(accessToken && callShell && callShell.hidden === false && !leaving);
  }

  function armMediaSession() {
    if (!('mediaSession' in navigator)) return;
    try {
      if ('MediaMetadata' in window) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: sessionInfo?.title || 'Bolo English private room',
          artist: 'Bolo English',
          album: 'Voice chat in progress'
        });
      }
      navigator.mediaSession.playbackState = active() ? 'playing' : 'none';
      navigator.mediaSession.setActionHandler?.('play', () => resumeContinuity('media-play').catch(() => {}));
      navigator.mediaSession.setActionHandler?.('pause', () => {});
    } catch {}
  }

  async function ensureBackgroundAudioAnchor() {
    if (!active()) return;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    try {
      if (!anchorContext) {
        anchorContext = new AudioContextCtor();
        anchorOscillator = anchorContext.createOscillator();
        anchorGain = anchorContext.createGain();
        // Inaudible sub-audible anchor. It helps some mobile browsers keep the
        // page classified as an active audio session without producing sound.
        anchorOscillator.frequency.value = 18;
        anchorGain.gain.value = 0.000001;
        anchorOscillator.connect(anchorGain);
        anchorGain.connect(anchorContext.destination);
        anchorOscillator.start();
      }
      if (anchorContext.state === 'suspended' && document.visibilityState === 'visible') {
        await anchorContext.resume();
      }
    } catch (error) {
      console.warn('Background audio anchor unavailable:', error);
    }
  }

  async function requestWakeLock() {
    if (!active() || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener?.('release', () => { wakeLock = null; });
    } catch {
      wakeLock = null;
    }
  }

  async function resumeRemoteMedia() {
    if (!active()) return;
    const videos = [...document.querySelectorAll('#private-video-grid video')];
    await Promise.allSettled(videos.map(async (video) => {
      const isLocal = video.closest('[data-private-participant]')?.dataset.privateParticipant === clientId;
      video.muted = isLocal || !speakerEnabled;
      if (video.srcObject && video.paused) await video.play();
    }));
  }

  function watchMic(track) {
    if (!track || watchedMicTrack === track) return;
    watchedMicTrack = track;
    try { track.contentHint = 'speech'; } catch {}
    track.addEventListener('mute', () => {
      if (active() && document.visibilityState === 'visible') {
        window.setTimeout(() => resumeContinuity('mic-muted').catch(() => {}), 150);
      }
    });
    track.addEventListener('ended', () => {
      if (active() && document.visibilityState === 'visible') {
        window.setTimeout(() => resumeContinuity('mic-ended').catch(() => {}), 80);
      }
    });
  }

  async function ensureMicrophone() {
    if (!active() || !localStream || !navigator.mediaDevices?.getUserMedia) return;
    const current = localStream.getAudioTracks()[0];
    if (current?.readyState === 'live') {
      current.enabled = micEnabled === true;
      watchMic(current);
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false
    });
    const replacement = stream.getAudioTracks()[0];
    if (!replacement) return;
    replacement.enabled = micEnabled === true;
    watchMic(replacement);

    for (const old of localStream.getAudioTracks()) {
      try { localStream.removeTrack(old); } catch {}
      try { old.stop(); } catch {}
    }
    localStream.addTrack(replacement);

    await Promise.allSettled([...peers.values()].map(async ({ pc }) => {
      if (!pc || pc.connectionState === 'closed') return;
      const sender = pc.getSenders().find((item) => item.track?.kind === 'audio');
      if (sender) await sender.replaceTrack(replacement);
      else pc.addTrack(replacement, localStream);
    }));

    try {
      setCardStream(clientId, localStream, guest?.displayName || guest?.name || 'You', true, guest?.specialTag || '');
      await updatePresence();
    } catch {}
  }

  function ensureSignaling() {
    if (!active()) return;
    if (!eventSource || eventSource.readyState === EventSource.CLOSED) {
      try { eventSource?.close(); } catch {}
      try { connectEvents(); } catch {}
    }
  }

  async function resumeContinuity(reason = 'foreground') {
    if (!active() || document.visibilityState === 'hidden' || busy) return;
    const now = Date.now();
    if (now - lastResumeAt < 500) return;
    lastResumeAt = now;
    busy = true;
    try {
      armMediaSession();
      await ensureBackgroundAudioAnchor();
      ensureSignaling();
      await ensureMicrophone().catch((error) => console.warn('Private mic resume failed:', error));
      await resumeRemoteMedia();
      await requestWakeLock();

      // Existing foreground/ICE recovery scripts perform negotiation repair.
      // Recheck playback after the browser has fully resumed its network stack.
      window.setTimeout(() => {
        if (!active() || document.visibilityState === 'hidden') return;
        ensureSignaling();
        ensureBackgroundAudioAnchor().catch(() => {});
        resumeRemoteMedia().catch(() => {});
      }, reason === 'pageshow' ? 500 : 1000);
    } finally {
      busy = false;
    }
  }

  function prepareBackground() {
    if (!active()) return;
    armMediaSession();
    ensureBackgroundAudioAnchor().catch(() => {});
    const track = localStream?.getAudioTracks?.()[0];
    if (track) watchMic(track);
    resumeRemoteMedia().catch(() => {});
    ensureSignaling();
  }

  document.addEventListener('visibilitychange', () => {
    if (!active()) return;
    if (document.visibilityState === 'hidden') prepareBackground();
    else window.setTimeout(() => resumeContinuity('visibility').catch(() => {}), 50);
  });
  document.addEventListener('freeze', prepareBackground);
  document.addEventListener('resume', () => window.setTimeout(() => resumeContinuity('resume').catch(() => {}), 50));
  window.addEventListener('pageshow', () => window.setTimeout(() => resumeContinuity('pageshow').catch(() => {}), 50));
  window.addEventListener('focus', () => window.setTimeout(() => resumeContinuity('focus').catch(() => {}), 50));
  window.addEventListener('online', () => window.setTimeout(() => resumeContinuity('online').catch(() => {}), 80));

  document.addEventListener('pointerdown', () => {
    if (!active()) return;
    ensureBackgroundAudioAnchor().catch(() => {});
    resumeRemoteMedia().catch(() => {});
  }, { passive: true });

  window.setInterval(() => {
    if (!active()) return;
    if (document.visibilityState === 'visible') resumeContinuity('health-check').catch(() => {});
    else prepareBackground();
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
})();
