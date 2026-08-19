'use strict';

// Runtime patch for server.js: adds server-enforced guest camera approval to
// private sessions without weakening the existing admin-only default.
const fs = require('fs');
const path = require('path');
const Module = require('module');

const originalJsLoader = Module._extensions['.js'];
const target = path.resolve(__dirname, 'server.js');

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`Bolo camera preload could not patch ${label}; server.js changed.`);
  }
  return source.replace(search, replacement);
}

Module._extensions['.js'] = function boloCameraLoader(mod, filename) {
  if (path.resolve(filename) !== target) return originalJsLoader(mod, filename);

  let source = fs.readFileSync(filename, 'utf8');

  source = replaceRequired(
    source,
    "role: auth.role === 'admin' && visitor.role === 'admin' ? 'admin' : 'guest', micEnabled: true, cameraEnabled: false, joinedAt:",
    "role: auth.role === 'admin' && visitor.role === 'admin' ? 'admin' : 'guest', micEnabled: true, cameraEnabled: false, cameraGranted: auth.role === 'admin' && visitor.role === 'admin', joinedAt:",
    'private client camera grant state'
  );

  source = source.replaceAll(
    "cameraEnabled: client.role === 'admin' && client.cameraEnabled === true",
    "cameraEnabled: (client.role === 'admin' || client.cameraGranted === true) && client.cameraEnabled === true, cameraGranted: client.cameraGranted === true"
  );

  source = replaceRequired(
    source,
    "if (sender.role !== 'admin' && sdpAttemptsToSendVideo(body.description)) return sendJson(res, 403, { error: 'Camera access is restricted to the administrator in this private session.' });",
    "if (sender.role !== 'admin' && sender.cameraGranted !== true && sdpAttemptsToSendVideo(body.description)) return sendJson(res, 403, { error: 'Camera access requires administrator approval in this private session.' });",
    'private video SDP authorization'
  );

  source = source.replaceAll(
    "cameraEnabled: sender.role === 'admin' && sender.cameraEnabled === true",
    "cameraEnabled: (sender.role === 'admin' || sender.cameraGranted === true) && sender.cameraEnabled === true, cameraGranted: sender.cameraGranted === true"
  );

  source = replaceRequired(
    source,
    "if (body.cameraEnabled != null) client.cameraEnabled = client.role === 'admin' && body.cameraEnabled === true;",
    "if (body.cameraEnabled != null) client.cameraEnabled = (client.role === 'admin' || client.cameraGranted === true) && body.cameraEnabled === true;",
    'private camera presence authorization'
  );

  const routeMarker = "  const privateSignalMatch = pathname.match(/^\\/api\\/private-sessions\\/([A-Za-z0-9_.-]{30,220})\\/signal$/);";
  const moderationRoute = `  const privateCameraModerateMatch = pathname.match(/^\\/api\\/private-sessions\\/([A-Za-z0-9_.-]{30,220})\\/camera-moderate$/);\n  if (privateCameraModerateMatch && req.method === 'POST') {\n    const sessionId = privateSessionIdFromToken(privateCameraModerateMatch[1]);\n    const session = sessionId ? db.read().privateSessions.find((entry) => entry.id === sessionId) : null;\n    const auth = sessionId ? privateGuestAuth(req, url, sessionId) : null;\n    if (!privateSessionIsActive(session) || !auth || auth.role !== 'admin') return sendJson(res, 403, { error: 'Only the administrator can approve camera access.' });\n    const body = await readJsonBody(req);\n    const targetClientId = String(body.targetClientId || '');\n    const action = String(body.action || '');\n    if (!['allow-camera', 'revoke-camera'].includes(action)) return sendJson(res, 400, { error: 'Invalid camera moderation action.' });\n    const targetClient = privateSessionClients.get(session.id)?.get(targetClientId);\n    if (!targetClient || targetClient.role === 'admin') return sendJson(res, 404, { error: 'Guest participant not found.' });\n    targetClient.cameraGranted = action === 'allow-camera';\n    if (!targetClient.cameraGranted) targetClient.cameraEnabled = false;\n    sendEvent(targetClient, 'private-moderation', {\n      action,\n      message: action === 'allow-camera' ? 'The administrator allowed your camera.' : 'The administrator turned off your camera permission.'\n    });\n    broadcastPrivateSession(session.id, 'presence', {\n      clientId: targetClientId,\n      role: targetClient.role || 'guest',\n      micEnabled: targetClient.micEnabled !== false,\n      cameraEnabled: targetClient.cameraGranted === true && targetClient.cameraEnabled === true,\n      cameraGranted: targetClient.cameraGranted === true\n    }, targetClientId);\n    return sendJson(res, 200, { ok: true, cameraGranted: targetClient.cameraGranted === true });\n  }\n\n`;

  source = replaceRequired(source, routeMarker, moderationRoute + routeMarker, 'private camera moderation route');

  mod._compile(source, filename);
};
