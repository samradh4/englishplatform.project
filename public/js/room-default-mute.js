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
})();
