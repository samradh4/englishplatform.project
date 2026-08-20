'use strict';

// Public voice rooms should never transmit audio immediately after joining.
(() => {
  if (typeof getMicrophone !== 'function') return;

  micEnabled = false;
  const originalGetMicrophone = getMicrophone;

  getMicrophone = async function getMutedMicrophone(deviceId = '') {
    const stream = await originalGetMicrophone(deviceId);
    if (!hasJoined) {
      micEnabled = false;
      stream.getAudioTracks().forEach((track) => { track.enabled = false; });
    }
    return stream;
  };

  // Load the room background/foreground recovery layer after the main room
  // code and the default-mute guard are installed.
  if (!document.querySelector('script[data-bolo-room-background-recovery]')) {
    const script = document.createElement('script');
    script.src = '/js/room-background-recovery.js?v=1';
    script.dataset.boloRoomBackgroundRecovery = '1';
    document.body.appendChild(script);
  }
})();
