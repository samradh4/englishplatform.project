'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const { EventEmitter } = require('events');
const { DatabaseSync } = require('node:sqlite');

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'admin').trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'UHAdmin@123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'development-only-change-this-secret';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const SQLITE_PATH = process.env.SQLITE_PATH ? path.resolve(process.env.SQLITE_PATH) : path.join(DATA_DIR, 'boloenglish.sqlite');
const LEGACY_JSON_PATH = process.env.LEGACY_JSON_PATH ? path.resolve(process.env.LEGACY_JSON_PATH) : path.join(DATA_DIR, 'db.json');
const SESSION_COOKIE = 'uh.sid';
const DEVICE_COOKIE = 'uh.device';
const PRIVATE_GUEST_COOKIE = 'uh.guest';
const SESSION_DAYS = clampInt(process.env.SESSION_DAYS || 30, 1, 365, 30);
const SESSION_MAX_AGE_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const DEVICE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const RESET_CODE_MAX_AGE_MS = 30 * 60 * 1000;
const MAX_BODY_BYTES = 128 * 1024;
const DEFAULT_ROOM_CAPACITY = clampInt(process.env.MAX_ROOM_PARTICIPANTS || 8, 2, 12, 8);
const LEVEL_LABELS = Object.freeze({
  1: 'Level 1 · Beginner',
  2: 'Level 2 · Intermediate',
  3: 'Level 3 · Advanced'
});
const PLAN_OPTIONS = Object.freeze({
  trial1: { label: '1-day free trial', days: 1, price: 0 },
  month1: { label: '1 month', months: 1, price: 500 },
  month3: { label: '3 months', months: 3, price: 999 },
  teacher1to1: { label: '1-to-1 with teachers', months: 1, price: 6000 }
});

const TOPIC_INTERVAL_MINUTES = clampInt(process.env.TOPIC_INTERVAL_MINUTES || 10, 1, 60, 10);
const VOICE_MODE_SETTING = String(process.env.VOICE_MODE || 'auto').trim().toLowerCase();
const VOICE_RELAY_SAMPLE_RATE = clampInt(process.env.VOICE_RELAY_SAMPLE_RATE || 16000, 8000, 24000, 16000);
const AI_API_URL = String(process.env.AI_API_URL || '').trim();
const AI_API_KEY = String(process.env.AI_API_KEY || '').trim();
const AI_MODEL = String(process.env.AI_MODEL || '').trim();
const AI_TIMEOUT_MS = clampInt(process.env.AI_TIMEOUT_MS || 15000, 3000, 30000, 15000);
const TOPIC_INTERVAL_MS = TOPIC_INTERVAL_MINUTES * 60 * 1000;
const SPEAKING_TOPICS = Object.freeze({
  1: Object.freeze([
    'Introduce yourself and describe your daily routine.',
    'Talk about your favourite food and why you like it.',
    'Describe your family in five simple sentences.',
    'What do you usually do on weekends?',
    'Describe your school, college, or workplace.',
    'Talk about your favourite season and the weather.',
    'Describe your best friend.',
    'What is your favourite movie or television show?',
    'Talk about a place you want to visit.',
    'Describe your room or your home.',
    'What do you do to stay healthy?',
    'Talk about a hobby you enjoy.',
    'Describe a memorable birthday.',
    'What is your favourite subject and why?',
    'Talk about your morning routine.',
    'Describe your favourite festival.',
    'What did you do yesterday?',
    'Talk about one goal you have this year.',
    'Describe your favourite animal.',
    'What makes you happy?'
  ]),
  2: Object.freeze([
    'Should students use mobile phones in class? Explain your opinion.',
    'Describe a skill you want to learn and how you will learn it.',
    'Is online learning better than classroom learning?',
    'Talk about a difficult decision you once made.',
    'How can people improve their spoken English?',
    'Describe a person who inspires you.',
    'What are the advantages and disadvantages of social media?',
    'Should school uniforms be compulsory?',
    'Talk about a trip that taught you something new.',
    'How can young people manage money wisely?',
    'Is it better to live in a city or a village?',
    'What makes a good friend?',
    'How has technology changed education?',
    'Should everyone exercise every day?',
    'Describe a problem in your neighbourhood and a possible solution.',
    'What qualities make someone a good leader?',
    'Is working from home a good idea?',
    'How can we reduce plastic waste?',
    'What is more important: talent or hard work?',
    'Should teenagers have part-time jobs?'
  ]),
  3: Object.freeze([
    'Does artificial intelligence create more opportunities than risks?',
    'Should governments regulate social media algorithms?',
    'Is economic growth possible without harming the environment?',
    'How should education change for the jobs of the future?',
    'Does remote work improve or weaken workplace culture?',
    'Should voting be compulsory in democratic countries?',
    'Is privacy still possible in the digital age?',
    'Should universities focus more on employability than theory?',
    'Can technology reduce inequality, or does it increase it?',
    'Should public transport be free in major cities?',
    'Is failure necessary for long-term success?',
    'Should companies be responsible for employees’ mental well-being?',
    'Can online communities replace face-to-face communities?',
    'Is competition more useful than collaboration?',
    'Should governments introduce a universal basic income?',
    'How should societies respond to misinformation?',
    'Does globalisation protect or weaken local cultures?',
    'Should personal data be treated as personal property?',
    'Is entrepreneurship over-promoted to young people?',
    'What responsibilities come with freedom of speech?'
  ])
});

if (NODE_ENV === 'production') {
  if (ADMIN_PASSWORD === 'UHAdmin@123') console.warn('WARNING: Change ADMIN_PASSWORD before public use.');
  if (SESSION_SECRET === 'development-only-change-this-secret') console.warn('WARNING: Change SESSION_SECRET before public use.');
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

class SqliteDatabase {
  constructor(filePath, legacyJsonPath) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.database = new DatabaseSync(filePath);
    this.database.exec('PRAGMA journal_mode = WAL;');
    this.database.exec('PRAGMA synchronous = NORMAL;');
    this.database.exec('PRAGMA busy_timeout = 5000;');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS app_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    const row = this.database.prepare('SELECT data FROM app_state WHERE id = 1').get();
    if (!row) {
      let initial = { schemaVersion: 9, users: [], rooms: [], reports: [], privateSessions: [] };
      if (legacyJsonPath && fs.existsSync(legacyJsonPath)) {
        try {
          const legacy = JSON.parse(fs.readFileSync(legacyJsonPath, 'utf8'));
          if (legacy && typeof legacy === 'object') initial = legacy;
          console.log(`Imported existing data from ${legacyJsonPath} into SQLite.`);
        } catch (error) {
          console.warn(`Could not import legacy JSON data: ${error.message}`);
        }
      }
      this.database.prepare('INSERT INTO app_state (id, data, updated_at) VALUES (1, ?, ?)').run(
        JSON.stringify(initial),
        nowIso()
      );
    }
  }

  normalize(parsed) {
    if (!parsed || typeof parsed !== 'object') parsed = {};
    if (!Array.isArray(parsed.users)) parsed.users = [];
    if (!Array.isArray(parsed.rooms)) parsed.rooms = [];
    if (!Array.isArray(parsed.reports)) parsed.reports = [];
    if (!Array.isArray(parsed.privateSessions)) parsed.privateSessions = [];
    return parsed;
  }

  read() {
    const row = this.database.prepare('SELECT data FROM app_state WHERE id = 1').get();
    return this.normalize(JSON.parse(row?.data || '{}'));
  }

  write(data) {
    this.database.prepare('UPDATE app_state SET data = ?, updated_at = ? WHERE id = 1').run(
      JSON.stringify(this.normalize(data)),
      nowIso()
    );
  }

  transaction(mutator) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const data = this.read();
      const result = mutator(data);
      this.write(data);
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      try { this.database.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }
}

const db = new SqliteDatabase(SQLITE_PATH, LEGACY_JSON_PATH);
const rateBuckets = new Map();
const roomClients = new Map();
const roomChats = new Map();
// Lightweight server-sent events used for account approvals, room approvals,
// membership changes, and new admin requests. Audio still uses WebRTC.
const accountEventClients = new Map();
const adminEventClients = new Set();
const relaySockets = new Map();
const privateSessionClients = new Map();

function cleanUsername(value) { return String(value || '').trim(); }
function normalizedUsername(value) { return cleanUsername(value).toLowerCase(); }
function cleanFullName(value) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 80); }
function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length < 5 || email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
function validLevel(value) { const level = Number(value); return level === 1 || level === 2 || level === 3 ? level : null; }
function validGender(value) { const gender = String(value || '').toLowerCase(); return gender === 'male' || gender === 'female' ? gender : null; }
function validRoomStatus(value) { const status = String(value || ''); return ['pending', 'approved', 'rejected', 'closed'].includes(status) ? status : null; }
function nowIso() { return new Date().toISOString(); }

function cleanGuestName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 40);
}
function cleanSpecialDisplayName(value, fallback = '') {
  const cleaned = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  return cleaned || String(fallback || '').trim().slice(0, 40);
}
function cleanSpecialTag(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N} &+._-]/gu, '').slice(0, 24);
}
function normalizePhone(value) {
  const raw = String(value || '').trim();
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return `${hasPlus ? '+' : ''}${digits}`;
}
function privateSessionLinkToken(sessionId) {
  const payload = Buffer.from(String(sessionId), 'utf8').toString('base64url');
  return `${payload}.${signValue(`private-session:${payload}`)}`;
}
function privateSessionIdFromToken(token) {
  const value = String(token || '');
  const dot = value.lastIndexOf('.');
  if (dot < 2) return null;
  const payload = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  if (!timingSafeStringEqual(signature, signValue(`private-session:${payload}`))) return null;
  try {
    const id = Buffer.from(payload, 'base64url').toString('utf8');
    return /^[a-f0-9-]{20,64}$/i.test(id) ? id : null;
  } catch { return null; }
}
function createPrivateGuestToken(sessionId, guestId, expiresAtMs, role = 'guest') {
  const safeRole = role === 'admin' ? 'admin' : 'guest';
  const payload = Buffer.from(JSON.stringify({ sessionId, guestId, exp: expiresAtMs, role: safeRole }), 'utf8').toString('base64url');
  return `${payload}.${signValue(`private-guest:${payload}`)}`;
}
function verifyPrivateGuestToken(token, expectedSessionId = null) {
  const value = String(token || '');
  const dot = value.lastIndexOf('.');
  if (dot < 2) return null;
  const payload = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  if (!timingSafeStringEqual(signature, signValue(`private-guest:${payload}`))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed.sessionId || !parsed.guestId || !Number.isFinite(parsed.exp) || parsed.exp <= Date.now()) return null;
    if (expectedSessionId && parsed.sessionId !== expectedSessionId) return null;
    parsed.role = parsed.role === 'admin' ? 'admin' : 'guest';
    return parsed;
  } catch { return null; }
}
function privateSessionIsActive(session) {
  return Boolean(session && session.status === 'active' && new Date(session.expiresAt).getTime() > Date.now());
}
function privateSessionMap(sessionId) {
  if (!privateSessionClients.has(sessionId)) privateSessionClients.set(sessionId, new Map());
  return privateSessionClients.get(sessionId);
}
function safePrivateSession(session, origin = '') {
  const liveClients = privateSessionClients.get(session.id);
  const token = privateSessionLinkToken(session.id);
  const visitors = Array.isArray(session.visitors) ? session.visitors : [];
  return {
    id: session.id,
    title: session.title,
    status: session.status,
    capacity: clampInt(session.capacity, 2, 10, 6),
    cameraEnabled: true,
    cameraPolicy: 'admin-only',
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    liveParticipants: liveClients?.size || 0,
    visitorCount: visitors.length,
    recentVisitors: visitors.slice(-8).reverse().map((visitor) => ({
      id: visitor.id,
      name: visitor.name,
      displayName: visitor.displayName || visitor.name,
      specialTag: visitor.specialTag || '',
      phone: visitor.phone,
      role: visitor.role === 'admin' ? 'admin' : 'guest',
      joinedAt: visitor.joinedAt,
      lastSeenAt: visitor.lastSeenAt || visitor.joinedAt
    })),
    joinUrl: origin ? `${origin}/private/${token}` : `/private/${token}`
  };
}
function publicPrivateSession(session, viewerCanUseCamera = false) {
  return {
    title: session.title,
    capacity: clampInt(session.capacity, 2, 10, 6),
    cameraEnabled: true,
    cameraPolicy: 'admin-only',
    viewerCanUseCamera: viewerCanUseCamera === true,
    viewerRole: viewerCanUseCamera === true ? 'admin' : 'guest',
    expiresAt: session.expiresAt,
    liveParticipants: privateSessionClients.get(session.id)?.size || 0,
    requiresLogin: false
  };
}
function privateGuestAuth(req, url, sessionId) {
  const bearer = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  const cookieToken = parseCookies(req)[PRIVATE_GUEST_COOKIE];
  return verifyPrivateGuestToken(bearer || cookieToken, sessionId);
}
function sdpAttemptsToSendVideo(description) {
  const sdp = String(description?.sdp || '');
  if (!sdp || !/m=video\s/i.test(sdp)) return false;
  const sections = sdp.split(/(?=m=)/g);
  return sections.some((section) => /^m=video\s/im.test(section) && /a=(sendrecv|sendonly)\r?$/im.test(section));
}
function broadcastPrivateSession(sessionId, event, payload, exceptClientId = null) {
  for (const [clientId, client] of privateSessionMap(sessionId)) {
    if (clientId !== exceptClientId) sendEvent(client, event, payload);
  }
}
function removePrivateSessionClient(sessionId, clientId, announce = true) {
  const clients = privateSessionClients.get(sessionId);
  if (!clients) return;
  const client = clients.get(clientId);
  if (!client) return;
  client.closed = true;
  clearInterval(client.keepAlive);
  clients.delete(clientId);
  try { client.res.end(); } catch {}
  if (announce) broadcastPrivateSession(sessionId, 'peer-left', { clientId, guestId: client.guestId, displayName: client.displayName });
  if (!clients.size) privateSessionClients.delete(sessionId);
}

function stableHashInt(value) {
  const digest = crypto.createHash('sha256').update(String(value || '')).digest();
  return digest.readUInt32BE(0);
}

function speakingTopicState(room, now = Date.now()) {
  const level = validLevel(room?.level) || 2;
  const topics = SPEAKING_TOPICS[level] || SPEAKING_TOPICS[2];
  const bucket = Math.floor(now / TOPIC_INTERVAL_MS);
  let index = stableHashInt(`${room?.code || 'ROOM'}:${bucket}`) % topics.length;
  const previousIndex = stableHashInt(`${room?.code || 'ROOM'}:${bucket - 1}`) % topics.length;
  if (topics.length > 1 && index === previousIndex) index = (index + 1) % topics.length;
  const startedAtMs = bucket * TOPIC_INTERVAL_MS;
  const endsAtMs = startedAtMs + TOPIC_INTERVAL_MS;
  return {
    id: `${level}-${bucket}-${index}`,
    text: topics[index],
    level,
    levelLabel: LEVEL_LABELS[level],
    startedAt: new Date(startedAtMs).toISOString(),
    endsAt: new Date(endsAtMs).toISOString(),
    intervalMinutes: TOPIC_INTERVAL_MINUTES,
    serverNow: new Date(now).toISOString()
  };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [type, salt, expectedHex] = String(stored || '').split('$');
    if (type !== 'scrypt' || !salt || !expectedHex) return false;
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = crypto.scryptSync(password, salt, expected.length);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function validPassword(password) {
  const value = String(password || '');
  return value.length >= 8 && value.length <= 72 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

function hashToken(token) { return crypto.createHash('sha256').update(String(token || '')).digest('hex'); }

function addPlanDuration(baseDate, planKey) {
  const plan = PLAN_OPTIONS[planKey];
  if (!plan) return null;
  const date = new Date(baseDate);
  if (plan.days) date.setUTCDate(date.getUTCDate() + plan.days);
  if (plan.months) date.setUTCMonth(date.getUTCMonth() + plan.months);
  return date;
}

function membershipSummary(user) {
  if (user.role === 'admin') {
    return { status: 'active', planKey: 'admin', planLabel: 'Administrator', startsAt: null, expiresAt: null, daysRemaining: null };
  }
  const membership = user.membership || {};
  const expiresAt = membership.expiresAt ? new Date(membership.expiresAt) : null;
  const active = expiresAt && Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() > Date.now();
  const daysRemaining = active ? Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000)) : 0;
  return {
    status: !expiresAt ? 'not-set' : (active ? 'active' : 'expired'),
    planKey: membership.planKey || null,
    planLabel: membership.planLabel || (PLAN_OPTIONS[membership.planKey]?.label || 'Not set'),
    startsAt: membership.startsAt || null,
    expiresAt: membership.expiresAt || null,
    daysRemaining
  };
}

function safeUser(user, device = null) {
  const devices = Array.isArray(user.devices) ? user.devices : [];
  const membership = membershipSummary(user);
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName || user.displayName || user.username,
    displayName: user.displayName || user.fullName || user.username,
    email: user.email || '',
    phone: user.phone || '',
    specialTag: user.specialTag || '',
    gender: validGender(user.gender),
    role: user.role,
    status: user.status,
    level: validLevel(user.level),
    levelLabel: validLevel(user.level) ? LEVEL_LABELS[validLevel(user.level)] : null,
    deviceStatus: user.role === 'admin' ? 'approved' : (device?.status || null),
    pendingDevices: devices.filter((entry) => entry.status === 'pending').length,
    approvedDevices: devices.filter((entry) => entry.status === 'approved').length,
    deviceCount: devices.length,
    membership,
    resetStatus: user.passwordReset?.status || null,
    resetRequestedAt: user.passwordReset?.requestedAt || null,
    createdAt: user.createdAt,
    approvedAt: user.approvedAt || null
  };
}

function safeRoom(room) {
  const level = validLevel(room.level) || 2;
  const liveClients = roomClients.get(room.code);
  return {
    code: room.code,
    title: room.title,
    level,
    levelLabel: LEVEL_LABELS[level],
    capacity: clampInt(room.capacity, 2, 12, DEFAULT_ROOM_CAPACITY),
    status: validRoomStatus(room.status) || 'pending',
    isLocked: room.isLocked === true,
    creatorId: room.creatorId,
    creatorName: room.creatorName,
    ownerId: room.ownerId || room.creatorId,
    ownerName: room.ownerName || room.creatorName,
    bannedCount: Array.isArray(room.bannedUserIds) ? room.bannedUserIds.length : 0,
    liveParticipants: liveClients?.size || 0,
    createdAt: room.createdAt,
    approvedAt: room.approvedAt || null,
    lastActiveAt: room.lastActiveAt
  };
}


function safePublicRoom(room) {
  const level = validLevel(room.level) || 2;
  const clients = roomClients.get(room.code);
  const activeClients = clients
    ? Array.from(clients.values()).filter((client) => !client.closed).sort((a, b) => a.joinedAt - b.joinedAt)
    : [];
  const capacity = clampInt(room.capacity, 2, 12, DEFAULT_ROOM_CAPACITY);
  return {
    code: room.code,
    title: room.title,
    level,
    levelLabel: LEVEL_LABELS[level],
    capacity,
    liveParticipants: activeClients.length,
    isFull: activeClients.length >= capacity,
    isLocked: room.isLocked === true,
    participants: activeClients.slice(0, 8).map((client) => ({ username: client.displayName })),
    lastActiveAt: room.lastActiveAt || room.createdAt
  };
}

function migrateDatabase() {
  db.transaction((data) => {
    data.schemaVersion = 9;
    data.reports = Array.isArray(data.reports) ? data.reports : [];
    data.privateSessions = Array.isArray(data.privateSessions) ? data.privateSessions : [];
    data.privateSessions.forEach((session) => {
      session.cameraEnabled = true;
      session.cameraPolicy = 'admin-only';
      session.visitors = Array.isArray(session.visitors) ? session.visitors : [];
      session.visitors.forEach((visitor) => { visitor.role = visitor.role === 'admin' ? 'admin' : 'guest'; });
      session.title = String(session.title || 'Private consultation').trim().slice(0, 60);
      session.capacity = clampInt(session.capacity, 2, 10, 6);
      session.status = ['active', 'revoked'].includes(session.status) ? session.status : 'active';
      session.cameraEnabled = session.cameraEnabled !== false;
      session.visitors = Array.isArray(session.visitors) ? session.visitors : [];
      session.visitors.forEach((visitor) => {
        visitor.name = cleanGuestName(visitor.name);
        visitor.displayName = cleanSpecialDisplayName(visitor.displayName, visitor.name);
        visitor.specialTag = cleanSpecialTag(visitor.specialTag);
      });
      session.expiresAt = session.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    });
    data.users.forEach((user) => {
      user.username = cleanUsername(user.username);
      user.usernameKey = normalizedUsername(user.username);
      user.fullName = cleanFullName(user.fullName || user.displayName || user.username);
      user.displayName = cleanSpecialDisplayName(user.displayName || user.fullName, user.username);
      user.email = normalizeEmail(user.email) || '';
      user.phone = normalizePhone(user.phone) || '';
      user.phoneKey = user.phone.replace(/\D/g, '');
      user.specialTag = cleanSpecialTag(user.specialTag);
      user.role = user.role === 'admin' ? 'admin' : 'member';
      user.status = ['pending', 'approved', 'rejected'].includes(user.status) ? user.status : 'pending';
      user.devices = Array.isArray(user.devices) ? user.devices : [];
      user.gender = validGender(user.gender);
      user.passwordReset = user.passwordReset && typeof user.passwordReset === 'object' ? user.passwordReset : null;
      const legacySession = user.authSession && typeof user.authSession === 'object' ? user.authSession : null;
      user.authSessions = Array.isArray(user.authSessions) ? user.authSessions.filter((session) => session && typeof session === 'object') : [];
      if (legacySession?.tokenHash && !user.authSessions.some((session) => session.tokenHash === legacySession.tokenHash)) user.authSessions.push(legacySession);
      user.authSession = null;
      if (user.role === 'admin') {
        user.level = 3;
        user.gender = user.gender || 'male';
      } else {
        user.level = validLevel(user.level);
        user.membership = user.membership && typeof user.membership === 'object' ? user.membership : { planKey: null, planLabel: null, startsAt: null, expiresAt: null };
        if (user.status === 'approved' && !user.membership.expiresAt) {
          const startsAt = nowIso();
          const expiresAt = addPlanDuration(startsAt, 'trial1');
          user.membership = { planKey: 'trial1', planLabel: PLAN_OPTIONS.trial1.label, startsAt, expiresAt: expiresAt.toISOString() };
        }
      }
    });
    data.rooms.forEach((room) => {
      room.level = validLevel(room.level) || 2;
      room.capacity = clampInt(room.capacity, 2, 12, DEFAULT_ROOM_CAPACITY);
      room.status = validRoomStatus(room.status) || 'approved';
      room.isLocked = room.isLocked === true;
      room.ownerId = room.ownerId || room.creatorId;
      room.ownerName = room.ownerName || room.creatorName;
      room.bannedUserIds = Array.isArray(room.bannedUserIds) ? room.bannedUserIds : [];
      room.lastActiveAt = room.lastActiveAt || room.createdAt || nowIso();
    });
  });
}

migrateDatabase();

function seedAdmin() {
  db.transaction((data) => {
    let admin = data.users.find((user) => user.role === 'admin');
    if (!admin) {
      admin = {
        id: crypto.randomUUID(), username: ADMIN_USERNAME, usernameKey: normalizedUsername(ADMIN_USERNAME), displayName: 'Bolo English Admin',
        passwordHash: hashPassword(ADMIN_PASSWORD), gender: 'male', specialTag: 'Administrator', role: 'admin', status: 'approved', level: 3, devices: [],
        authSessions: [], authSession: null, createdAt: nowIso(), approvedAt: nowIso()
      };
      data.users.push(admin);
      console.log('\nInitial admin account created. Change its environment password before public use.\n');
      return;
    }
    admin.username = ADMIN_USERNAME;
    admin.usernameKey = normalizedUsername(ADMIN_USERNAME);
    admin.displayName = 'Bolo English Admin';
    admin.specialTag = 'Administrator';
    admin.status = 'approved';
    admin.level = 3;
    admin.gender = admin.gender || 'male';
    admin.devices = [];
    admin.authSessions = Array.isArray(admin.authSessions) ? admin.authSessions : [];
    if (!verifyPassword(ADMIN_PASSWORD, admin.passwordHash)) admin.passwordHash = hashPassword(ADMIN_PASSWORD);
  });
}

seedAdmin();

function parseCookies(req) {
  const result = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const rawValue = part.slice(index + 1).trim();
    if (!key) continue;
    try { result[key] = decodeURIComponent(rawValue); } catch { result[key] = rawValue; }
  }
  return result;
}

function timingSafeStringEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function signValue(value) { return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url'); }
function signedSessionCookie(token) { return `${token}.${signValue(token)}`; }

function getSession(req) {
  const signed = parseCookies(req)[SESSION_COOKIE];
  if (!signed) return null;
  const dot = signed.lastIndexOf('.');
  if (dot < 1) return null;
  const token = signed.slice(0, dot);
  const signature = signed.slice(dot + 1);
  if (!timingSafeStringEqual(signature, signValue(token))) return null;
  const tokenHash = hashToken(token);
  const now = Date.now();
  const state = db.read();
  for (const user of state.users) {
    const sessions = Array.isArray(user.authSessions) ? user.authSessions : [];
    const session = sessions.find((entry) => entry?.tokenHash && timingSafeStringEqual(entry.tokenHash, tokenHash));
    if (!session?.expiresAt || new Date(session.expiresAt).getTime() <= now) continue;
    return { id: tokenHash, userId: user.id, deviceId: session.deviceId || null, expiresAt: new Date(session.expiresAt).getTime() };
  }
  return null;
}

function getAuthContext(req) {
  const session = getSession(req);
  if (!session) return { session: null, user: null, device: null };
  const user = db.read().users.find((entry) => entry.id === session.userId) || null;
  if (!user) return { session: null, user: null, device: null };
  const device = user.role === 'admin' ? null : (user.devices || []).find((entry) => entry.id === session.deviceId) || null;
  return { session, user, device };
}

function appendCookie(res, cookie) {
  const current = res.getHeader('Set-Cookie');
  if (!current) res.setHeader('Set-Cookie', cookie);
  else if (Array.isArray(current)) res.setHeader('Set-Cookie', [...current, cookie]);
  else res.setHeader('Set-Cookie', [current, cookie]);
}
function cookieSecurity() { return NODE_ENV === 'production' ? '; Secure' : ''; }

function createSession(res, userId, deviceId = null, role = 'member') {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS).toISOString();
  db.transaction((data) => {
    const user = data.users.find((entry) => entry.id === userId);
    if (!user) return;
    const now = Date.now();
    user.authSessions = (Array.isArray(user.authSessions) ? user.authSessions : [])
      .filter((session) => session?.expiresAt && new Date(session.expiresAt).getTime() > now)
      .slice(-9);
    user.authSessions.push({ tokenHash, deviceId: role === 'admin' ? null : deviceId, createdAt: nowIso(), expiresAt });
    user.authSession = null;
  });
  appendCookie(res, `${SESSION_COOKIE}=${encodeURIComponent(signedSessionCookie(token))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}${cookieSecurity()}`);
}

function destroySession(req, res) {
  const session = getSession(req);
  if (session) {
    db.transaction((data) => {
      const user = data.users.find((entry) => entry.id === session.userId);
      if (!user) return;
      user.authSessions = (Array.isArray(user.authSessions) ? user.authSessions : [])
        .filter((entry) => !entry?.tokenHash || !timingSafeStringEqual(entry.tokenHash, session.id));
      user.authSession = null;
    });
  }
  appendCookie(res, `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookieSecurity()}`);
}
function setDeviceCookie(res, token) {
  appendCookie(res, `${DEVICE_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(DEVICE_MAX_AGE_MS / 1000)}${cookieSecurity()}`);
}

function currentDeviceForUser(req, user) {
  const token = parseCookies(req)[DEVICE_COOKIE];
  if (!token || !Array.isArray(user.devices)) return null;
  const tokenHash = hashToken(token);
  return user.devices.find((entry) => timingSafeStringEqual(entry.tokenHash, tokenHash)) || null;
}

function deviceLabel(req) {
  const ua = String(req.headers['user-agent'] || 'Browser').slice(0, 180);
  if (/iPhone/i.test(ua)) return 'iPhone browser';
  if (/Android/i.test(ua)) return 'Android browser';
  if (/Macintosh/i.test(ua)) return 'Mac browser';
  if (/Windows/i.test(ua)) return 'Windows browser';
  return 'Web browser';
}

function createDevice(req, res, userId, status = 'pending') {
  const token = crypto.randomBytes(32).toString('base64url');
  const device = { id: crypto.randomUUID(), tokenHash: hashToken(token), label: deviceLabel(req), status, createdAt: nowIso(), approvedAt: status === 'approved' ? nowIso() : null };
  db.transaction((data) => {
    const user = data.users.find((entry) => entry.id === userId);
    if (!user) return;
    user.devices = Array.isArray(user.devices) ? user.devices : [];
    user.devices.push(device);
  });
  setDeviceCookie(res, token);
  return device;
}

function membershipIsActive(user) { return user.role === 'admin' || membershipSummary(user).status === 'active'; }
function hasActiveOneDayTrial(user) {
  if (!user || user.role === 'admin') return false;
  const membership = membershipSummary(user);
  return membership.status === 'active' && membership.planKey === 'trial1';
}
function hasActiveRoomAccess(user) {
  return Boolean(user && (user.role === 'admin' || membershipSummary(user).status === 'active'));
}
function isAccessApproved(context) {
  if (!context.user) return false;
  if (context.user.role === 'admin') return true;
  return context.user.status === 'approved' && validLevel(context.user.level) && membershipIsActive(context.user);
}

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:", "img-src 'self' data: blob:", "media-src 'self' blob:",
    "connect-src 'self' ws: wss:", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'"
  ].join('; '));
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(body);
}
function redirect(res, location) { res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' }); res.end(); }

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) { reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('Invalid JSON request.'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}

function requireUser(req, res, level = 'login') {
  const context = getAuthContext(req);
  if (!context.user) { sendJson(res, 401, { error: 'Please sign in.' }); return null; }
  if (level === 'approved' && !isAccessApproved(context)) { sendJson(res, 403, { error: membershipSummary(context.user).status === 'expired' ? 'Your membership has expired.' : 'Admin approval, an English level, and active membership are required.' }); return null; }
  if (level === 'admin' && context.user.role !== 'admin') { sendJson(res, 403, { error: 'Administrator access required.' }); return null; }
  return context;
}

function getClientIp(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim(); }
function allowRate(req, key, limit = 35, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const bucketKey = `${getClientIp(req)}:${key}`;
  const current = (rateBuckets.get(bucketKey) || []).filter((time) => now - time < windowMs);
  if (current.length >= limit) return false;
  current.push(now);
  rateBuckets.set(bucketKey, current);
  return true;
}
function getOrigin(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || (req.socket.encrypted ? 'https' : 'http');
  return `${protocol}://${req.headers.host}`;
}
function isSameOriginMutation(req) {
  if (!['POST', 'PATCH', 'DELETE'].includes(req.method)) return true;
  const origin = String(req.headers.origin || '').trim();
  if (!origin) return true;
  try { return new URL(origin).host === String(req.headers.host || ''); } catch { return false; }
}
function roomCode() { return crypto.randomBytes(4).toString('hex').toUpperCase(); }
function resetCode() { return crypto.randomBytes(5).toString('base64url').replace(/[-_]/g, '').slice(0, 8).toUpperCase(); }
function buildIceServers() {
  const servers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (process.env.TURN_URL) servers.push({ urls: process.env.TURN_URL.split(',').map((value) => value.trim()).filter(Boolean), username: process.env.TURN_USERNAME || '', credential: process.env.TURN_CREDENTIAL || '' });
  return servers;
}
function turnConfigured() {
  return Boolean(String(process.env.TURN_URL || '').trim() && String(process.env.TURN_USERNAME || '').trim() && String(process.env.TURN_CREDENTIAL || '').trim());
}
function effectiveVoiceMode() {
  if (VOICE_MODE_SETTING === 'relay') return 'relay';
  if (VOICE_MODE_SETTING === 'webrtc') return 'webrtc';
  return turnConfigured() ? 'webrtc' : 'relay';
}
function relayRoomMap(code) {
  if (!relaySockets.has(code)) relaySockets.set(code, new Map());
  return relaySockets.get(code);
}
function closeRelaySocket(code, clientId) {
  const sockets = relaySockets.get(code);
  const socket = sockets?.get(clientId);
  if (socket) {
    sockets.delete(clientId);
    try { socket.close(1000, 'Room session ended'); } catch {}
  }
  if (sockets && !sockets.size) relaySockets.delete(code);
}

function roomMap(code) { if (!roomClients.has(code)) roomClients.set(code, new Map()); return roomClients.get(code); }
function chatHistory(code) { if (!roomChats.has(code)) roomChats.set(code, []); return roomChats.get(code); }
function sendEvent(client, event, payload) {
  if (!client || client.closed) return;
  try { client.res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`); } catch { client.closed = true; }
}
function broadcastRoom(code, event, payload, exceptClientId = null) {
  for (const [clientId, client] of roomMap(code)) if (clientId !== exceptClientId) sendEvent(client, event, payload);
}

function accountClientSet(userId) {
  if (!accountEventClients.has(userId)) accountEventClients.set(userId, new Set());
  return accountEventClients.get(userId);
}

function sendAccountEvent(userId, event, payload = {}) {
  const clients = accountEventClients.get(userId);
  if (!clients) return;
  for (const client of [...clients]) {
    sendEvent(client, event, payload);
    if (client.closed) clients.delete(client);
  }
  if (!clients.size) accountEventClients.delete(userId);
}

function sendAdminEvent(event, payload = {}) {
  for (const client of [...adminEventClients]) {
    sendEvent(client, event, payload);
    if (client.closed) adminEventClients.delete(client);
  }
}

function registerAccountEventStream(req, res, context) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(': connected\n\n');
  const client = {
    res,
    userId: context.user.id,
    role: context.user.role,
    closed: false,
    keepAlive: null
  };
  accountClientSet(context.user.id).add(client);
  if (context.user.role === 'admin') adminEventClients.add(client);
  client.keepAlive = setInterval(() => {
    try { res.write(': ping\n\n'); }
    catch { client.closed = true; }
  }, 20000);
  sendEvent(client, 'connected', { serverNow: nowIso() });
  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    client.closed = true;
    clearInterval(client.keepAlive);
    const set = accountEventClients.get(context.user.id);
    set?.delete(client);
    if (set && !set.size) accountEventClients.delete(context.user.id);
    adminEventClients.delete(client);
  };
  req.on('close', remove);
  req.on('error', remove);
}

function liveOwnerTransfer(code, removedClient) {
  if (!removedClient) return;
  const state = db.read();
  const room = state.rooms.find((entry) => entry.code === code);
  if (!room || room.ownerId !== removedClient.userId) return;
  const remaining = Array.from(roomMap(code).values()).filter((client) => !client.closed).sort((a, b) => a.joinedAt - b.joinedAt);
  if (!remaining.length) return;
  const nextOwner = remaining[0];
  db.transaction((data) => {
    const saved = data.rooms.find((entry) => entry.code === code);
    if (!saved) return;
    saved.ownerId = nextOwner.userId;
    saved.ownerName = nextOwner.displayName;
  });
  broadcastRoom(code, 'owner-changed', { ownerId: nextOwner.userId, ownerName: nextOwner.displayName });
}

function removeRoomClient(code, clientId, announce = true, reason = null) {
  const clients = roomClients.get(code);
  if (!clients) return;
  const client = clients.get(clientId);
  if (!client) return;
  client.closed = true;
  clearInterval(client.keepAlive);
  clients.delete(clientId);
  try { client.res.end(); } catch {}
  closeRelaySocket(code, clientId);
  if (announce) broadcastRoom(code, 'peer-left', { clientId, userId: client.userId, displayName: client.displayName, reason });
  liveOwnerTransfer(code, client);
  if (!clients.size) roomClients.delete(code);
}

function disconnectUserFromRooms(userId, message = 'Your room access changed.') {
  for (const [code, clients] of roomClients) {
    for (const [clientId, client] of clients) {
      if (client.userId === userId) {
        sendEvent(client, 'room-error', { message });
        removeRoomClient(code, clientId, true, message);
      }
    }
  }
}
function disconnectUser(userId, message = 'Your access changed. Please sign in again.') {
  disconnectUserFromRooms(userId, message);
  db.transaction((data) => {
    const user = data.users.find((entry) => entry.id === userId);
    if (user) {
      user.authSessions = [];
      user.authSession = null;
    }
  });
}
function keepOnlySessionForDevice(userId, deviceId) {
  db.transaction((data) => {
    const user = data.users.find((entry) => entry.id === userId);
    if (!user) return;
    user.authSessions = (Array.isArray(user.authSessions) ? user.authSessions : [])
      .filter((session) => !session.deviceId || session.deviceId === deviceId);
    user.authSession = null;
  });
}

function userCanEnterRoom(user, room) {
  if (user.role === 'admin') return true;
  if (Array.isArray(room.bannedUserIds) && room.bannedUserIds.includes(user.id)) return false;
  // Every active trial or paid member may join any approved room.
  if (hasActiveRoomAccess(user)) return true;
  return false;
}
function roomIsJoinableFor(user, room) {
  if (user.role === 'admin') return room.status !== 'rejected';
  if (room.status !== 'approved') return false;
  if (room.isLocked && room.ownerId !== user.id) return false;
  return userCanEnterRoom(user, room);
}

function validateSignal(body) {
  if (body.description != null) {
    if (!body.description || typeof body.description !== 'object') return false;
    if (!['offer', 'answer'].includes(body.description.type)) return false;
    if (typeof body.description.sdp !== 'string' || body.description.sdp.length > 70000) return false;
  }
  if (body.candidate != null) {
    if (!body.candidate || typeof body.candidate !== 'object') return false;
    if (typeof body.candidate.candidate !== 'string' || body.candidate.candidate.length > 4096) return false;
  }
  return Boolean(body.description || body.candidate);
}

function mimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' })[extension] || 'application/octet-stream';
}
function sendFile(req, res, filePath, status = 200) {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(PUBLIC_DIR) + path.sep) && resolved !== path.resolve(PUBLIC_DIR)) return sendJson(res, 403, { error: 'Forbidden.' });
  fs.stat(resolved, (error, stat) => {
    if (error || !stat.isFile()) return sendFile(req, res, path.join(PUBLIC_DIR, '404.html'), 404);
    res.writeHead(status, { 'Content-Type': mimeType(resolved), 'Content-Length': stat.size, 'Cache-Control': resolved.endsWith('.html') ? 'no-store' : 'public, max-age=3600' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(resolved).pipe(res);
  });
}

function pageAccess(req, res, level) {
  const context = getAuthContext(req);
  if (!context.user) { const next = encodeURIComponent(new URL(req.url, 'http://local').pathname); redirect(res, `/login?next=${next}`); return false; }
  if (level === 'approved' && !isAccessApproved(context)) { redirect(res, '/pending'); return false; }
  if (level === 'admin' && context.user.role !== 'admin') { redirect(res, '/dashboard'); return false; }
  return true;
}

function approveSingleDevice(user, preferredDeviceId = null) {
  const devices = Array.isArray(user.devices) ? user.devices : [];
  let chosen = preferredDeviceId ? devices.find((device) => device.id === preferredDeviceId) : null;
  if (!chosen) {
    const recentSession = (Array.isArray(user.authSessions) ? user.authSessions : []).slice().reverse().find((session) => session?.deviceId);
    if (recentSession?.deviceId) chosen = devices.find((device) => device.id === recentSession.deviceId);
  }
  if (!chosen) chosen = [...devices].reverse().find((device) => device.status === 'pending') || devices.find((device) => device.status === 'approved') || null;
  if (!chosen) return null;
  for (const device of devices) {
    if (device.id === chosen.id) { device.status = 'approved'; device.approvedAt = nowIso(); }
    else if (device.status === 'approved' || device.status === 'pending') device.status = 'revoked';
  }
  return chosen;
}

function applyMembership(user, planKey, mode = 'replace') {
  const plan = PLAN_OPTIONS[planKey];
  if (!plan) return false;
  const currentExpiry = user.membership?.expiresAt ? new Date(user.membership.expiresAt) : null;
  const base = mode === 'extend' && currentExpiry && currentExpiry.getTime() > Date.now() ? currentExpiry : new Date();
  const expiresAt = addPlanDuration(base, planKey);
  user.membership = { planKey, planLabel: plan.label, startsAt: nowIso(), expiresAt: expiresAt.toISOString() };
  return true;
}


function aiProviderConfigured() {
  return Boolean(AI_API_URL && AI_API_KEY && AI_MODEL);
}

function cleanAiMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .slice(-12)
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: String(item?.content || '').trim().replace(/\s+/g, ' ').slice(0, 700)
    }))
    .filter((item) => item.content);
}

async function requestExternalAiReply({ messages, mode, levelLabel }) {
  if (!aiProviderConfigured()) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  const systemPrompt = [
    'You are Bolo AI, a friendly English speaking practice partner.',
    'Have a normal, natural conversation and answer what the learner actually said.',
    'Never ignore a direct question just to ask a random practice prompt.',
    'Keep replies concise: usually 1 to 3 short sentences.',
    'If the learner says they are new, welcome them and explain how the conversation works.',
    'If they ask how you are, answer naturally.',
    'If they ask your name, say you are Bolo AI.',
    'Correct English gently only when useful; do not lecture.',
    'Ask at most one relevant follow-up question.',
    `Practice mode: ${String(mode || 'daily').slice(0, 30)}.`,
    `Learner level: ${String(levelLabel || 'English learner').slice(0, 80)}.`
  ].join(' ');
  try {
    const response = await fetch(AI_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${AI_API_KEY}`
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: 'system', content: systemPrompt }, ...cleanAiMessages(messages)],
        temperature: 0.7,
        max_tokens: 180
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`AI provider returned ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    const payload = await response.json();
    const reply = String(payload?.choices?.[0]?.message?.content || '').trim();
    if (!reply) throw new Error('AI provider returned an empty reply.');
    return reply.slice(0, 1200);
  } finally {
    clearTimeout(timeout);
  }
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  if (!isSameOriginMutation(req)) return sendJson(res, 403, { error: 'Cross-site request blocked.' });

  if (req.method === 'GET' && pathname === '/api/me') {
    const context = getAuthContext(req);
    return sendJson(res, 200, { user: context.user ? safeUser(context.user, context.device) : null, accessApproved: isAccessApproved(context), contact: '+91 88083 94539', baseUrl: getOrigin(req), maxRoomParticipants: DEFAULT_ROOM_CAPACITY, plans: PLAN_OPTIONS });
  }

  if (req.method === 'POST' && pathname === '/api/ai/chat') {
    const context = requireUser(req, res, 'login');
    if (!context) return;
    if (context.user.role !== 'admin' && !isAccessApproved(context)) {
      return sendJson(res, 403, { error: 'Your free trial or membership is not active.' });
    }
    if (!allowRate(req, `ai-chat:${context.user.id}`, 120, 60 * 60 * 1000)) {
      return sendJson(res, 429, { error: 'Too many AI messages. Please wait a little and try again.' });
    }
    const body = await readJsonBody(req);
    const messages = cleanAiMessages(body.messages);
    if (!messages.length) return sendJson(res, 400, { error: 'Say something first.' });
    if (!aiProviderConfigured()) return sendJson(res, 200, { reply: null, mode: 'local-context' });
    try {
      const reply = await requestExternalAiReply({
        messages,
        mode: body.mode,
        levelLabel: body.levelLabel || context.user.levelLabel
      });
      return sendJson(res, 200, { reply, mode: 'external-ai' });
    } catch (error) {
      console.warn(`AI provider error: ${error.message}`);
      return sendJson(res, 200, { reply: null, mode: 'local-context', warning: 'External AI is temporarily unavailable.' });
    }
  }

  if (req.method === 'GET' && pathname === '/api/events') {
    const context = requireUser(req, res, 'login');
    if (!context) return;
    registerAccountEventStream(req, res, context);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/public/live-rooms') {
    if (!allowRate(req, 'public-live-rooms', 180, 60 * 60 * 1000)) return sendJson(res, 429, { error: 'Too many refreshes. Please wait a moment.' });
    const rooms = db.read().rooms
      .filter((room) => room.status === 'approved' && (roomClients.get(room.code)?.size || 0) > 0)
      .map(safePublicRoom)
      .sort((a, b) => b.liveParticipants - a.liveParticipants || new Date(b.lastActiveAt) - new Date(a.lastActiveAt))
      .slice(0, 24);
    const totalParticipants = rooms.reduce((sum, room) => sum + room.liveParticipants, 0);
    return sendJson(res, 200, { rooms, totalParticipants, updatedAt: nowIso() });
  }


  // Admin-only private guest sessions. These links are never listed publicly.
  if (req.method === 'GET' && pathname === '/api/admin/private-sessions') {
    const context = requireUser(req, res, 'admin');
    if (!context) return;
    const sessions = db.read().privateSessions
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((session) => safePrivateSession(session, getOrigin(req)));
    return sendJson(res, 200, { sessions });
  }

  if (req.method === 'POST' && pathname === '/api/admin/private-sessions') {
    const context = requireUser(req, res, 'admin');
    if (!context) return;
    const body = await readJsonBody(req);
    const title = String(body.title || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    const capacity = clampInt(body.capacity, 2, 10, 6);
    const hours = clampInt(body.expiresInHours, 1, 168, 24);
    if (title.length < 3) return sendJson(res, 400, { error: 'Enter a session title of at least 3 characters.' });
    const session = {
      id: crypto.randomUUID(),
      title,
      capacity,
      cameraEnabled: true,
      cameraPolicy: 'admin-only',
      status: 'active',
      createdBy: context.user.id,
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
      visitors: []
    };
    db.transaction((data) => data.privateSessions.push(session));
    return sendJson(res, 201, { session: safePrivateSession(session, getOrigin(req)), message: 'Private guest link created.' });
  }

  const adminPrivateSessionMatch = pathname.match(/^\/api\/admin\/private-sessions\/([a-f0-9-]+)$/i);
  if (adminPrivateSessionMatch && req.method === 'PATCH') {
    const context = requireUser(req, res, 'admin');
    if (!context) return;
    const body = await readJsonBody(req);
    const id = adminPrivateSessionMatch[1];
    let updated = null;
    db.transaction((data) => {
      const session = data.privateSessions.find((entry) => entry.id === id);
      if (!session) return;
      if (body.status != null && ['active', 'revoked'].includes(String(body.status))) session.status = String(body.status);
      if (body.title != null) session.title = String(body.title).trim().replace(/\s+/g, ' ').slice(0, 60) || session.title;
      if (body.capacity != null) session.capacity = clampInt(body.capacity, 2, 10, session.capacity || 6);
      if (body.expiresInHours != null) session.expiresAt = new Date(Date.now() + clampInt(body.expiresInHours, 1, 168, 24) * 60 * 60 * 1000).toISOString();
      updated = safePrivateSession(session, getOrigin(req));
    });
    if (!updated) return sendJson(res, 404, { error: 'Private session not found.' });
    if (updated.status === 'revoked') {
      for (const [clientId, client] of privateSessionMap(id)) {
        sendEvent(client, 'session-ended', { message: 'The administrator revoked this private link.' });
        removePrivateSessionClient(id, clientId, false);
      }
    }
    return sendJson(res, 200, { session: updated });
  }

  if (adminPrivateSessionMatch && req.method === 'DELETE') {
    const context = requireUser(req, res, 'admin');
    if (!context) return;
    const id = adminPrivateSessionMatch[1];
    let removed = false;
    db.transaction((data) => {
      const index = data.privateSessions.findIndex((entry) => entry.id === id);
      if (index >= 0) { data.privateSessions.splice(index, 1); removed = true; }
    });
    if (!removed) return sendJson(res, 404, { error: 'Private session not found.' });
    for (const [clientId, client] of privateSessionMap(id)) {
      sendEvent(client, 'session-ended', { message: 'This private session was deleted.' });
      removePrivateSessionClient(id, clientId, false);
    }
    privateSessionClients.delete(id);
    return sendJson(res, 200, { ok: true });
  }

  const adminPrivateVisitorMatch = pathname.match(/^\/api\/admin\/private-sessions\/([a-f0-9-]+)\/visitors\/([a-f0-9-]+)$/i);
  if (adminPrivateVisitorMatch && req.method === 'PATCH') {
    const context = requireUser(req, res, 'admin');
    if (!context) return;
    const body = await readJsonBody(req);
    const sessionId = adminPrivateVisitorMatch[1];
    const visitorId = adminPrivateVisitorMatch[2];
    let updatedVisitor = null;
    db.transaction((data) => {
      const session = data.privateSessions.find((entry) => entry.id === sessionId);
      const visitor = session?.visitors?.find((entry) => entry.id === visitorId);
      if (!visitor) return;
      if (body.displayName != null) visitor.displayName = cleanSpecialDisplayName(body.displayName, visitor.name);
      if (body.specialTag != null) visitor.specialTag = cleanSpecialTag(body.specialTag);
      updatedVisitor = {
        id: visitor.id,
        name: visitor.name,
        displayName: visitor.displayName || visitor.name,
        specialTag: visitor.specialTag || '',
        phone: visitor.phone,
        joinedAt: visitor.joinedAt,
        lastSeenAt: visitor.lastSeenAt || visitor.joinedAt
      };
    });
    if (!updatedVisitor) return sendJson(res, 404, { error: 'Private guest record not found.' });
    const clients = privateSessionClients.get(sessionId);
    if (clients) {
      for (const [clientId, client] of clients) {
        if (client.guestId !== visitorId) continue;
        client.displayName = updatedVisitor.displayName;
        client.specialTag = updatedVisitor.specialTag;
        broadcastPrivateSession(sessionId, 'profile-updated', {
          clientId,
          guestId: visitorId,
          displayName: client.displayName,
          specialTag: client.specialTag
        });
      }
    }
    return sendJson(res, 200, { visitor: updatedVisitor, message: 'Special guest identity updated.' });
  }

  const privateSessionBaseMatch = pathname.match(/^\/api\/private-sessions\/([A-Za-z0-9_.-]{30,220})$/);
  if (privateSessionBaseMatch && req.method === 'GET') {
    const sessionId = privateSessionIdFromToken(privateSessionBaseMatch[1]);
    const session = sessionId ? db.read().privateSessions.find((entry) => entry.id === sessionId) : null;
    if (!session) return sendJson(res, 404, { error: 'This private link is invalid.' });
    if (!privateSessionIsActive(session)) return sendJson(res, 410, { error: session.status === 'revoked' ? 'This private link was revoked by the administrator.' : 'This private link has expired.' });
    const viewer = getAuthContext(req);
    const viewerCanUseCamera = viewer.user?.role === 'admin';
    return sendJson(res, 200, { session: publicPrivateSession(session, viewerCanUseCamera), iceServers: buildIceServers(), turnConfigured: turnConfigured() });
  }

  const privateJoinMatch = pathname.match(/^\/api\/private-sessions\/([A-Za-z0-9_.-]{30,220})\/join$/);
  if (privateJoinMatch && req.method === 'POST') {
    if (!allowRate(req, 'private-session-join', 30, 60 * 60 * 1000)) return sendJson(res, 429, { error: 'Too many attempts. Please wait before trying again.' });
    const sessionId = privateSessionIdFromToken(privateJoinMatch[1]);
    const state = db.read();
    const session = sessionId ? state.privateSessions.find((entry) => entry.id === sessionId) : null;
    if (!privateSessionIsActive(session)) return sendJson(res, session ? 410 : 404, { error: session ? 'This private link is no longer active.' : 'This private link is invalid.' });
    if ((privateSessionClients.get(session.id)?.size || 0) >= session.capacity) return sendJson(res, 409, { error: `This private session is full. Maximum ${session.capacity} participants.` });
    const body = await readJsonBody(req);
    const viewer = getAuthContext(req);
    const isAdmin = viewer.user?.role === 'admin';
    const role = isAdmin ? 'admin' : 'guest';
    const name = isAdmin
      ? cleanSpecialDisplayName(viewer.user.displayName || viewer.user.username, 'Bolo English Admin')
      : cleanGuestName(body.name);
    const phone = isAdmin ? '' : normalizePhone(body.phone);
    const specialTag = isAdmin ? 'Administrator' : '';
    if (name.length < 2) return sendJson(res, 400, { error: 'Enter your name.' });
    if (!isAdmin && !phone) return sendJson(res, 400, { error: 'Enter a valid phone number with 8–15 digits.' });
    if (body.consent !== true) return sendJson(res, 400, { error: isAdmin ? 'You must consent to microphone/camera use before joining.' : 'You must consent to microphone use before joining.' });
    const guestId = crypto.randomUUID();
    const joinedAt = nowIso();
    db.transaction((data) => {
      const saved = data.privateSessions.find((entry) => entry.id === session.id);
      if (!saved) return;
      saved.visitors = Array.isArray(saved.visitors) ? saved.visitors : [];
      saved.visitors.push({ id: guestId, name, displayName: name, specialTag, phone, role, joinedAt, lastSeenAt: joinedAt });
      if (saved.visitors.length > 500) saved.visitors = saved.visitors.slice(-500);
    });
    const expiresAtMs = Math.min(new Date(session.expiresAt).getTime(), Date.now() + 12 * 60 * 60 * 1000);
    const accessToken = createPrivateGuestToken(session.id, guestId, expiresAtMs, role);
    appendCookie(res, `${PRIVATE_GUEST_COOKIE}=${encodeURIComponent(accessToken)}; Path=/api/private-sessions/${privateJoinMatch[1]}/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(60, Math.floor((expiresAtMs - Date.now()) / 1000))}${cookieSecurity()}`);
    return sendJson(res, 201, {
      accessToken,
      guest: { id: guestId, name, displayName: name, specialTag, role, canUseCamera: isAdmin },
      session: publicPrivateSession(session, isAdmin),
      viewerCanUseCamera: isAdmin,
      iceServers: buildIceServers(),
      turnConfigured: turnConfigured()
    });
  }

  const privateMeMatch = pathname.match(/^\/api\/private-sessions\/([A-Za-z0-9_.-]{30,220})\/me$/);
  if (privateMeMatch && req.method === 'GET') {
    const sessionId = privateSessionIdFromToken(privateMeMatch[1]);
    const session = sessionId ? db.read().privateSessions.find((entry) => entry.id === sessionId) : null;
    const auth = sessionId ? privateGuestAuth(req, url, sessionId) : null;
    if (!privateSessionIsActive(session) || !auth) return sendJson(res, 401, { error: 'This private guest session is no longer valid.' });
    const visitor = session.visitors?.find((entry) => entry.id === auth.guestId);
    if (!visitor) return sendJson(res, 401, { error: 'Guest access not found.' });
    const canUseCamera = auth.role === 'admin' && visitor.role === 'admin';
    return sendJson(res, 200, { guest: { id: visitor.id, name: visitor.name, displayName: visitor.displayName || visitor.name, specialTag: visitor.specialTag || '', role: visitor.role || auth.role, canUseCamera }, session: publicPrivateSession(session, canUseCamera), viewerCanUseCamera: canUseCamera, iceServers: buildIceServers(), turnConfigured: turnConfigured() });
  }

  const privateEventsMatch = pathname.match(/^\/api\/private-sessions\/([A-Za-z0-9_.-]{30,220})\/events$/);
  if (privateEventsMatch && req.method === 'GET') {
    const sessionId = privateSessionIdFromToken(privateEventsMatch[1]);
    const session = sessionId ? db.read().privateSessions.find((entry) => entry.id === sessionId) : null;
    const auth = sessionId ? privateGuestAuth(req, url, sessionId) : null;
    if (!privateSessionIsActive(session) || !auth) return sendJson(res, 401, { error: 'Private session access denied.' });
    const visitor = session.visitors?.find((entry) => entry.id === auth.guestId);
    const clientId = String(url.searchParams.get('clientId') || '');
    if (!visitor || !/^[a-zA-Z0-9-]{8,64}$/.test(clientId)) return sendJson(res, 400, { error: 'Invalid guest session.' });
    const clients = privateSessionMap(session.id);
    if (!clients.has(clientId) && clients.size >= session.capacity) return sendJson(res, 409, { error: 'This private session is full.' });
    const existingPeers = Array.from(clients.entries()).map(([id, client]) => ({ clientId: id, guestId: client.guestId, displayName: client.displayName, specialTag: client.specialTag || '', role: client.role || 'guest', micEnabled: client.micEnabled !== false, cameraEnabled: client.role === 'admin' && client.cameraEnabled === true }));
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(': connected\n\n');
    const client = { res, guestId: visitor.id, displayName: visitor.displayName || visitor.name, specialTag: visitor.specialTag || '', role: auth.role === 'admin' && visitor.role === 'admin' ? 'admin' : 'guest', micEnabled: true, cameraEnabled: false, joinedAt: Date.now(), closed: false, keepAlive: null };
    const existing = clients.get(clientId);
    if (existing) removePrivateSessionClient(session.id, clientId, false);
    clients.set(clientId, client);
    client.keepAlive = setInterval(() => { try { res.write(': ping\n\n'); } catch { client.closed = true; } }, 20000);
    sendEvent(client, 'ready', { clientId, existingPeers, session: publicPrivateSession(session, client.role === 'admin'), viewerCanUseCamera: client.role === 'admin' });
    broadcastPrivateSession(session.id, 'peer-joined', { clientId, guestId: visitor.id, displayName: client.displayName, specialTag: client.specialTag, role: client.role, micEnabled: true, cameraEnabled: false }, clientId);
    let removed = false;
    const remove = () => { if (removed) return; removed = true; removePrivateSessionClient(session.id, clientId, true); };
    req.on('close', remove);
    req.on('error', remove);
    return;
  }

  const privateSignalMatch = pathname.match(/^\/api\/private-sessions\/([A-Za-z0-9_.-]{30,220})\/signal$/);
  if (privateSignalMatch && req.method === 'POST') {
    const sessionId = privateSessionIdFromToken(privateSignalMatch[1]);
    const session = sessionId ? db.read().privateSessions.find((entry) => entry.id === sessionId) : null;
    const auth = sessionId ? privateGuestAuth(req, url, sessionId) : null;
    if (!privateSessionIsActive(session) || !auth) return sendJson(res, 401, { error: 'Private session access denied.' });
    const body = await readJsonBody(req);
    if (!validateSignal(body)) return sendJson(res, 400, { error: 'Invalid WebRTC signal.' });
    const sender = privateSessionClients.get(session.id)?.get(String(body.clientId || ''));
    const receiver = privateSessionClients.get(session.id)?.get(String(body.to || ''));
    if (!sender || sender.guestId !== auth.guestId || !receiver) return sendJson(res, 400, { error: 'Participant connection not found.' });
    if (sender.role !== 'admin' && sdpAttemptsToSendVideo(body.description)) return sendJson(res, 403, { error: 'Camera access is restricted to the administrator in this private session.' });
    sendEvent(receiver, 'signal', { from: String(body.clientId), guestId: sender.guestId, displayName: sender.displayName, specialTag: sender.specialTag || '', role: sender.role || 'guest', micEnabled: sender.micEnabled !== false, cameraEnabled: sender.role === 'admin' && sender.cameraEnabled === true, description: body.description || null, candidate: body.candidate || null });
    return sendJson(res, 200, { ok: true });
  }

  const privatePresenceMatch = pathname.match(/^\/api\/private-sessions\/([A-Za-z0-9_.-]{30,220})\/presence$/);
  if (privatePresenceMatch && req.method === 'POST') {
    const sessionId = privateSessionIdFromToken(privatePresenceMatch[1]);
    const session = sessionId ? db.read().privateSessions.find((entry) => entry.id === sessionId) : null;
    const auth = sessionId ? privateGuestAuth(req, url, sessionId) : null;
    if (!privateSessionIsActive(session) || !auth) return sendJson(res, 401, { error: 'Private session access denied.' });
    const body = await readJsonBody(req);
    const clientId = String(body.clientId || '');
    const client = privateSessionClients.get(session.id)?.get(clientId);
    if (!client || client.guestId !== auth.guestId) return sendJson(res, 400, { error: 'Join the session first.' });
    if (body.micEnabled != null) client.micEnabled = body.micEnabled === true;
    if (body.cameraEnabled != null) client.cameraEnabled = client.role === 'admin' && body.cameraEnabled === true;
    broadcastPrivateSession(session.id, 'presence', { clientId, role: client.role || 'guest', micEnabled: client.micEnabled, cameraEnabled: client.role === 'admin' && client.cameraEnabled === true }, clientId);
    return sendJson(res, 200, { ok: true });
  }

  const privateLeaveMatch = pathname.match(/^\/api\/private-sessions\/([A-Za-z0-9_.-]{30,220})\/leave$/);
  if (privateLeaveMatch && req.method === 'POST') {
    const sessionId = privateSessionIdFromToken(privateLeaveMatch[1]);
    const auth = sessionId ? privateGuestAuth(req, url, sessionId) : null;
    const body = await readJsonBody(req);
    const clientId = String(body.clientId || '');
    const client = sessionId ? privateSessionClients.get(sessionId)?.get(clientId) : null;
    if (auth && client?.guestId === auth.guestId) removePrivateSessionClient(sessionId, clientId, true);
    appendCookie(res, `${PRIVATE_GUEST_COOKIE}=; Path=/api/private-sessions/${privateLeaveMatch[1]}/; HttpOnly; SameSite=Strict; Max-Age=0${cookieSecurity()}`);
    return sendJson(res, 200, { ok: true });
  }


  if (req.method === 'POST' && pathname === '/api/auth/register') {
    if (!allowRate(req, 'auth-register', 10)) return sendJson(res, 429, { error: 'Too many attempts. Please wait a few minutes.' });
    const body = await readJsonBody(req);
    const fullName = cleanFullName(body.fullName);
    const phone = normalizePhone(body.phone);
    const phoneKey = phone ? phone.replace(/\D/g, '') : '';
    const email = normalizeEmail(body.email);
    const username = cleanUsername(body.username);
    const usernameKey = normalizedUsername(username);
    const gender = validGender(body.gender);
    const level = validLevel(body.level);
    const password = String(body.password || '');

    if (fullName.length < 2) return sendJson(res, 400, { error: 'Enter your full name.' });
    if (!phone) return sendJson(res, 400, { error: 'Enter a valid phone number with 8–15 digits.' });
    if (!email) return sendJson(res, 400, { error: 'Enter a valid email address.' });
    if (!/^[a-zA-Z0-9_.-]{4,24}$/.test(username)) return sendJson(res, 400, { error: 'Username must be 4–24 characters using letters, numbers, dot, dash, or underscore.' });
    if (!level) return sendJson(res, 400, { error: 'Choose your English speaking level.' });
    if (!gender) return sendJson(res, 400, { error: 'Choose Male or Female.' });
    if (!validPassword(password)) return sendJson(res, 400, { error: 'Password must be 8–72 characters and include at least one letter and one number.' });
    if (usernameKey === normalizedUsername(ADMIN_USERNAME)) return sendJson(res, 409, { error: 'That username is reserved.' });

    let user = null;
    let duplicateField = null;
    const startsAt = nowIso();
    const expiresAt = addPlanDuration(startsAt, 'trial1');
    db.transaction((data) => {
      if (data.users.some((entry) => entry.usernameKey === usernameKey)) { duplicateField = 'username'; return; }
      if (data.users.some((entry) => entry.role !== 'admin' && entry.email && entry.email === email)) { duplicateField = 'email'; return; }
      if (data.users.some((entry) => entry.role !== 'admin' && (entry.phoneKey || String(entry.phone || '').replace(/\D/g, '')) === phoneKey)) { duplicateField = 'phone'; return; }
      user = {
        id: crypto.randomUUID(),
        fullName,
        username,
        usernameKey,
        displayName: username,
        email,
        phone,
        phoneKey,
        passwordHash: hashPassword(password),
        gender,
        role: 'member',
        status: 'approved',
        level,
        devices: [],
        membership: { planKey: 'trial1', planLabel: PLAN_OPTIONS.trial1.label, startsAt, expiresAt: expiresAt.toISOString() },
        passwordReset: null,
        authSessions: [],
        authSession: null,
        createdAt: startsAt,
        approvedAt: startsAt
      };
      data.users.push(user);
    });

    if (duplicateField === 'username') return sendJson(res, 409, { error: 'That username is already taken. Sign in instead.' });
    if (duplicateField === 'email') return sendJson(res, 409, { error: 'An account already uses this email address. Sign in or use Forgot password.' });
    if (duplicateField === 'phone') return sendJson(res, 409, { error: 'An account already uses this phone number. Sign in or contact the administrator.' });

    const device = createDevice(req, res, user.id, 'approved');
    createSession(res, user.id, device.id, 'member');
    user = db.read().users.find((entry) => entry.id === user.id);
    sendAdminEvent('admin-refresh', { reason: 'new-trial-member', userId: user.id, createdAt: user.createdAt });
    return sendJson(res, 201, {
      user: safeUser(user, device),
      redirect: '/dashboard',
      message: 'Account created. Your 1-day free trial is active.'
    });
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    if (!allowRate(req, 'auth-login', 16)) return sendJson(res, 429, { error: 'Too many attempts. Please wait a few minutes.' });
    const body = await readJsonBody(req);
    const user = db.read().users.find((entry) => entry.usernameKey === normalizedUsername(body.username));
    if (!user || !verifyPassword(String(body.password || ''), user.passwordHash)) return sendJson(res, 401, { error: 'Incorrect username or password. Passwords are case-sensitive.' });

    if (user.role === 'admin') {
      createSession(res, user.id, null, 'admin');
      return sendJson(res, 200, { user: safeUser(user), redirect: '/admin' });
    }
    if (user.status === 'rejected') return sendJson(res, 403, { error: 'This account was not approved. Contact the administrator.' });

    let device = currentDeviceForUser(req, user);
    if (!device || device.status === 'revoked') {
      device = createDevice(req, res, user.id, 'approved');
    } else if (device.status !== 'approved') {
      db.transaction((data) => {
        const storedUser = data.users.find((entry) => entry.id === user.id);
        const storedDevice = storedUser?.devices?.find((entry) => entry.id === device.id);
        if (storedDevice) {
          storedDevice.status = 'approved';
          storedDevice.approvedAt = nowIso();
        }
      });
      device.status = 'approved';
      device.approvedAt = nowIso();
    }
    createSession(res, user.id, device.id, 'member');
    const currentUser = db.read().users.find((entry) => entry.id === user.id);
    const currentDevice = currentUser.devices.find((entry) => entry.id === device.id);
    const profileReady = currentUser.status === 'approved' && Boolean(validLevel(currentUser.level));
    return sendJson(res, profileReady ? 200 : 202, { user: safeUser(currentUser, currentDevice), redirect: profileReady ? '/dashboard' : '/pending' });
  }

  if (req.method === 'POST' && pathname === '/api/auth/forgot') {
    if (!allowRate(req, 'auth-forgot', 8)) return sendJson(res, 429, { error: 'Too many reset requests. Please wait.' });
    const body = await readJsonBody(req);
    const key = normalizedUsername(body.username);
    db.transaction((data) => {
      const user = data.users.find((entry) => entry.usernameKey === key && entry.role !== 'admin');
      if (!user) return;
      user.passwordReset = { status: 'pending', requestedAt: nowIso(), codeHash: null, issuedAt: null, expiresAt: null };
    });
    sendAdminEvent('admin-refresh', { reason: 'password-reset-request' });
    return sendJson(res, 200, { message: 'If the username exists, a reset request was sent to the administrator. Contact +91 88083 94539 for the one-time code.' });
  }

  if (req.method === 'POST' && pathname === '/api/auth/reset') {
    if (!allowRate(req, 'auth-reset', 12)) return sendJson(res, 429, { error: 'Too many reset attempts. Please wait.' });
    const body = await readJsonBody(req);
    const usernameKey = normalizedUsername(body.username);
    const code = String(body.code || '').trim().toUpperCase();
    const newPassword = String(body.newPassword || '');
    if (!validPassword(newPassword)) return sendJson(res, 400, { error: 'New password must be 8–72 characters and include a letter and number.' });
    let userId = null;
    let approvedAfterReset = false;
    db.transaction((data) => {
      const user = data.users.find((entry) => entry.usernameKey === usernameKey && entry.role !== 'admin');
      if (!user || user.passwordReset?.status !== 'code-issued' || !user.passwordReset.codeHash || !user.passwordReset.expiresAt) return;
      if (new Date(user.passwordReset.expiresAt).getTime() <= Date.now()) return;
      if (!timingSafeStringEqual(user.passwordReset.codeHash, hashToken(code))) return;
      user.passwordHash = hashPassword(newPassword);
      user.passwordReset = null;
      user.devices = [];
      userId = user.id;
      approvedAfterReset = user.status === 'approved' && membershipIsActive(user) && Boolean(validLevel(user.level));
    });
    if (!userId) return sendJson(res, 400, { error: 'The reset code is invalid or expired.' });
    disconnectUser(userId, 'Your password was reset.');
    const device = createDevice(req, res, userId, approvedAfterReset ? 'approved' : 'pending');
    createSession(res, userId, device.id, 'member');
    const user = db.read().users.find((entry) => entry.id === userId);
    return sendJson(res, 200, { user: safeUser(user, device), redirect: approvedAfterReset ? '/dashboard' : '/dashboard' });
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const context = requireUser(req, res, 'login');
    if (!context) return;
    destroySession(req, res);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'PATCH' && pathname === '/api/profile') {
    const context = requireUser(req, res, 'approved');
    if (!context) return;
    if (context.user.role === 'admin') return sendJson(res, 400, { error: 'Use the administrator panel for admin settings.' });
    const body = await readJsonBody(req);
    const level = validLevel(body.level);
    const gender = validGender(body.gender);
    if (!level || !gender) return sendJson(res, 400, { error: 'Choose a valid English level and gender.' });
    const oldLevel = validLevel(context.user.level);
    let updated = null;
    db.transaction((data) => {
      const user = data.users.find((entry) => entry.id === context.user.id);
      if (!user) return;
      user.level = level;
      user.gender = gender;
      for (const room of data.rooms) if (room.ownerId === user.id && room.status === 'pending') room.level = level;
      updated = safeUser(user, user.devices.find((entry) => entry.id === context.device?.id));
    });
    if (oldLevel !== level && !hasActiveOneDayTrial(context.user)) disconnectUserFromRooms(context.user.id, 'Your English level changed, so you left the previous level room.');
    return sendJson(res, 200, { user: updated });
  }

  if (req.method === 'GET' && pathname === '/api/admin/users') {
    const context = requireUser(req, res, 'admin');
    if (!context) return;
    const status = String(url.searchParams.get('status') || 'all');
    const users = db.read().users.filter((user) => user.role !== 'admin' && (status === 'all' || user.status === status)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((user) => safeUser(user));
    return sendJson(res, 200, { users, plans: PLAN_OPTIONS });
  }

  const adminUserMatch = pathname.match(/^\/api\/admin\/users\/([a-f0-9-]+)$/i);
  if (adminUserMatch && req.method === 'PATCH') {
    const context = requireUser(req, res, 'admin');
    if (!context) return;
    const body = await readJsonBody(req);
    const status = body.status == null ? null : String(body.status);
    const level = body.level == null ? null : validLevel(body.level);
    const gender = body.gender == null ? null : validGender(body.gender);
    const planKey = body.planKey == null || body.planKey === '' ? null : String(body.planKey);
    const planMode = body.planMode === 'extend' ? 'extend' : 'replace';
    const displayNameProvided = body.displayName != null;
    const specialTagProvided = body.specialTag != null;
    if (status != null && !['approved', 'pending', 'rejected'].includes(status)) return sendJson(res, 400, { error: 'Invalid account status.' });
    if (body.level != null && !level) return sendJson(res, 400, { error: 'Invalid English level.' });
    if (body.gender != null && !gender) return sendJson(res, 400, { error: 'Invalid gender.' });
    if (planKey && !PLAN_OPTIONS[planKey]) return sendJson(res, 400, { error: 'Invalid membership plan.' });
    if (status === 'approved' && (!level || !planKey)) return sendJson(res, 400, { error: 'Choose an English level and validity plan before approval.' });

    let updated = null;
    let resetCodeValue = null;
    let approvedDeviceId = null;
    let shouldDisconnect = false;
    db.transaction((data) => {
      const user = data.users.find((entry) => entry.id === adminUserMatch[1] && entry.role !== 'admin');
      if (!user) return;
      const previousLevel = validLevel(user.level);
      const previousStatus = user.status;
      if (displayNameProvided) {
        user.displayName = cleanSpecialDisplayName(body.displayName, user.username);
        for (const room of data.rooms) {
          if (room.creatorId === user.id) room.creatorName = user.displayName;
          if (room.ownerId === user.id) room.ownerName = user.displayName;
        }
      }
      if (specialTagProvided) user.specialTag = cleanSpecialTag(body.specialTag);
      if (level) user.level = level;
      if (gender) user.gender = gender;
      if (planKey) applyMembership(user, planKey, planMode);
      if (status) {
        user.status = status;
        user.approvedAt = status === 'approved' ? nowIso() : null;
        if (status === 'rejected') for (const device of user.devices || []) if (device.status === 'pending') device.status = 'revoked';
      }
      if (status === 'approved') {
        for (const device of user.devices || []) {
          if (device.status !== 'revoked') {
            device.status = 'approved';
            device.approvedAt = nowIso();
          }
        }
      } else if (body.approveDevice === true) {
        const chosen = approveSingleDevice(user, body.deviceId || null);
        approvedDeviceId = chosen?.id || null;
      }
      if (body.issueResetCode === true) {
        resetCodeValue = resetCode();
        user.passwordReset = { status: 'code-issued', requestedAt: user.passwordReset?.requestedAt || nowIso(), codeHash: hashToken(resetCodeValue), issuedAt: nowIso(), expiresAt: new Date(Date.now() + RESET_CODE_MAX_AGE_MS).toISOString() };
      }
      if (body.clearReset === true) user.passwordReset = null;
      if (body.expireNow === true) {
        user.membership = { planKey: 'expired', planLabel: 'Expired by administrator', startsAt: user.membership?.startsAt || nowIso(), expiresAt: new Date(Date.now() - 1000).toISOString() };
      }
      shouldDisconnect = (status && status !== 'approved') || previousLevel !== validLevel(user.level) || body.expireNow === true;
      updated = safeUser(user);
    });
    if (!updated) return sendJson(res, 404, { error: 'User not found.' });
    if (approvedDeviceId) keepOnlySessionForDevice(updated.id, approvedDeviceId);
    if (shouldDisconnect) disconnectUserFromRooms(updated.id, 'The administrator changed your room access.');
    if (displayNameProvided || specialTagProvided) {
      for (const [roomCode, clients] of roomClients) {
        for (const [clientId, client] of clients) {
          if (client.userId !== updated.id) continue;
          client.displayName = updated.displayName;
          client.specialTag = updated.specialTag || '';
          broadcastRoom(roomCode, 'profile-updated', {
            clientId,
            userId: client.userId,
            displayName: client.displayName,
            specialTag: client.specialTag
          });
        }
      }
    }
    sendAccountEvent(updated.id, 'account-updated', {
      reason: status === 'approved' ? 'approved' : body.expireNow === true ? 'membership-expired' : 'profile-updated',
      user: updated,
      changedAt: nowIso()
    });
    return sendJson(res, 200, { user: updated, resetCode: resetCodeValue });
  }

  if (adminUserMatch && req.method === 'DELETE') {
    const context = requireUser(req, res, 'admin');
    if (!context) return;
    let removedId = null;
    db.transaction((data) => {
      const index = data.users.findIndex((entry) => entry.id === adminUserMatch[1] && entry.role !== 'admin');
      if (index < 0) return;
      removedId = data.users.splice(index, 1)[0].id;
      data.rooms = data.rooms.filter((room) => room.creatorId !== removedId && room.ownerId !== removedId);
    });
    if (!removedId) return sendJson(res, 404, { error: 'User not found.' });
    sendAccountEvent(removedId, 'account-deleted', { message: 'Your account was deleted by the administrator.' });
    disconnectUser(removedId, 'Your account was deleted.');
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/admin/rooms') {
    const context = requireUser(req, res, 'admin');
    if (!context) return;
    const status = String(url.searchParams.get('status') || 'all');
    const rooms = db.read().rooms.filter((room) => status === 'all' || room.status === status).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(safeRoom);
    return sendJson(res, 200, { rooms });
  }

  const adminRoomMatch = pathname.match(/^\/api\/admin\/rooms\/([A-F0-9]{8})$/i);
  if (adminRoomMatch && req.method === 'PATCH') {
    const context = requireUser(req, res, 'admin');
    if (!context) return;
    const body = await readJsonBody(req);
    const code = adminRoomMatch[1].toUpperCase();
    const status = body.status == null ? null : validRoomStatus(body.status);
    const level = body.level == null ? null : validLevel(body.level);
    const capacity = body.capacity == null ? null : clampInt(body.capacity, 2, 12, 0);
    if (body.status != null && !status) return sendJson(res, 400, { error: 'Invalid room status.' });
    if (body.level != null && !level) return sendJson(res, 400, { error: 'Invalid room level.' });
    if (body.capacity != null && !capacity) return sendJson(res, 400, { error: 'Room capacity must be 2–12.' });
    let updated = null;
    let roomAudience = [];
    db.transaction((data) => {
      const room = data.rooms.find((entry) => entry.code === code);
      if (!room) return;
      if (body.title != null) room.title = String(body.title).trim().slice(0, 60) || room.title;
      if (level) room.level = level;
      if (capacity) room.capacity = capacity;
      if (status) {
        room.status = status;
        room.approvedAt = status === 'approved' ? nowIso() : room.approvedAt;
        room.approvedBy = status === 'approved' ? context.user.id : room.approvedBy;
      }
      if (body.isLocked != null) room.isLocked = body.isLocked === true;
      if (body.clearBans === true) room.bannedUserIds = [];
      updated = safeRoom(room);
      roomAudience = [...new Set([room.creatorId, room.ownerId].filter(Boolean))];
    });
    if (!updated) return sendJson(res, 404, { error: 'Room not found.' });
    broadcastRoom(code, 'room-updated', { room: updated });
    for (const userId of roomAudience) sendAccountEvent(userId, 'room-updated', { room: updated, changedAt: nowIso() });
    if (updated.status === 'closed' || updated.status === 'rejected') {
      for (const [clientId, client] of roomMap(code)) {
        sendEvent(client, 'moderation', { action: 'close', message: 'The administrator closed this room.' });
        removeRoomClient(code, clientId, false, 'Room closed');
      }
    }
    return sendJson(res, 200, { room: updated });
  }

  if (adminRoomMatch && req.method === 'DELETE') {
    const context = requireUser(req, res, 'admin');
    if (!context) return;
    const code = adminRoomMatch[1].toUpperCase();
    let removed = false;
    let removedRoom = null;
    db.transaction((data) => {
      const index = data.rooms.findIndex((entry) => entry.code === code);
      if (index < 0) return;
      removedRoom = data.rooms.splice(index, 1)[0];
      removed = true;
    });
    if (!removed) return sendJson(res, 404, { error: 'Room not found.' });
    for (const userId of [...new Set([removedRoom?.creatorId, removedRoom?.ownerId].filter(Boolean))]) {
      sendAccountEvent(userId, 'room-deleted', { code, message: 'The administrator deleted this room.' });
    }
    for (const [clientId, client] of roomMap(code)) {
      sendEvent(client, 'moderation', { action: 'close', message: 'The administrator deleted this room.' });
      removeRoomClient(code, clientId, false, 'Room deleted');
    }
    roomChats.delete(code);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/admin/reports') {
    const context = requireUser(req, res, 'admin');
    if (!context) return;
    const requested = String(url.searchParams.get('status') || 'all');
    const reports = db.read().reports
      .filter((report) => requested === 'all' || report.status === requested)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 200);
    return sendJson(res, 200, { reports });
  }

  const adminReportMatch = pathname.match(/^\/api\/admin\/reports\/([a-f0-9-]{16,64})$/i);
  if (adminReportMatch && req.method === 'PATCH') {
    const context = requireUser(req, res, 'admin');
    if (!context) return;
    const body = await readJsonBody(req);
    const status = String(body.status || '');
    if (!['open', 'reviewed', 'dismissed'].includes(status)) return sendJson(res, 400, { error: 'Invalid report status.' });
    let updated = null;
    db.transaction((data) => {
      const report = (data.reports || []).find((entry) => entry.id === adminReportMatch[1]);
      if (!report) return;
      report.status = status;
      report.adminNote = String(body.adminNote || '').trim().slice(0, 1000);
      report.reviewedAt = status === 'open' ? null : nowIso();
      updated = report;
    });
    if (!updated) return sendJson(res, 404, { error: 'Report not found.' });
    return sendJson(res, 200, { report: updated });
  }

  if (req.method === 'POST' && pathname === '/api/rooms') {
    const context = requireUser(req, res, 'approved');
    if (!context) return;
    if (!allowRate(req, `room-create:${context.user.id}`, 8, 60 * 60 * 1000)) return sendJson(res, 429, { error: 'Too many room requests. Please try later.' });
    const body = await readJsonBody(req);
    const title = String(body.title || 'English Speaking Practice').trim().slice(0, 60) || 'English Speaking Practice';
    const level = context.user.role === 'admin' ? (validLevel(body.level) || 3) : validLevel(context.user.level);
    const capacity = clampInt(body.capacity, 2, 12, DEFAULT_ROOM_CAPACITY);
    if (!level) return sendJson(res, 403, { error: 'Your English level has not been set.' });
    const state = db.read();
    let code;
    do code = roomCode(); while (state.rooms.some((room) => room.code === code));
    const instantRoom = hasActiveRoomAccess(context.user);
    const status = instantRoom ? 'approved' : 'pending';
    const room = {
      code, title, level, capacity, status, isLocked: false, creatorId: context.user.id, creatorName: context.user.displayName || context.user.username,
      ownerId: context.user.id, ownerName: context.user.displayName || context.user.username, bannedUserIds: [], createdAt: nowIso(), approvedAt: status === 'approved' ? nowIso() : null,
      approvedBy: status === 'approved' ? context.user.id : null, approvalReason: context.user.role === 'admin' ? 'administrator' : (instantRoom ? 'active-membership' : null), lastActiveAt: nowIso()
    };
    db.transaction((data) => data.rooms.push(room));
    if (status === 'pending') sendAdminEvent('admin-refresh', { reason: 'room-request', code, createdAt: room.createdAt });
    return sendJson(res, 201, {
      room: safeRoom(room),
      inviteUrl: `${getOrigin(req)}/room/${code}`,
      message: status === 'pending'
        ? 'Room submitted for administrator approval.'
        : (instantRoom ? 'Room created instantly. Active trial and paid members do not need room approval.' : 'Room created.')
    });
  }

  if (req.method === 'GET' && pathname === '/api/rooms') {
    const context = requireUser(req, res, 'approved');
    if (!context) return;
    const rooms = db.read().rooms.filter((room) => room.creatorId === context.user.id || room.ownerId === context.user.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 20).map(safeRoom);
    return sendJson(res, 200, { rooms });
  }

  const roomMatch = pathname.match(/^\/api\/rooms\/([A-F0-9]{8})$/i);
  if (roomMatch && req.method === 'GET') {
    const context = requireUser(req, res, 'approved');
    if (!context) return;
    const code = roomMatch[1].toUpperCase();
    const room = db.read().rooms.find((entry) => entry.code === code);
    if (!room) return sendJson(res, 404, { error: 'Room not found. Check the invite link or room code.' });
    if (room.status === 'pending') return sendJson(res, 423, { error: 'This room is waiting for administrator approval.' });
    if (room.status === 'rejected') return sendJson(res, 403, { error: 'This room request was rejected.' });
    if (room.status === 'closed') return sendJson(res, 410, { error: 'This room is closed.' });
    if (Array.isArray(room.bannedUserIds) && room.bannedUserIds.includes(context.user.id) && context.user.role !== 'admin') return sendJson(res, 403, { error: 'You were removed from this room by the administrator.' });
    if (!userCanEnterRoom(context.user, room)) return sendJson(res, 403, { error: 'Your trial or paid membership is not active. Choose a plan to continue.' });
    if (room.isLocked && context.user.role !== 'admin' && room.ownerId !== context.user.id) return sendJson(res, 423, { error: 'This room is locked by the administrator.' });
    return sendJson(res, 200, { room: safeRoom(room), inviteUrl: `${getOrigin(req)}/room/${code}`, iceServers: buildIceServers(), voiceMode: effectiveVoiceMode(), turnConfigured: turnConfigured(), relayFallbackAllowed: VOICE_MODE_SETTING !== 'webrtc', voiceRelaySampleRate: VOICE_RELAY_SAMPLE_RATE, maxParticipants: room.capacity, currentParticipants: roomClients.get(code)?.size || 0, canModerate: context.user.role === 'admin' || room.ownerId === context.user.id, topic: speakingTopicState(room) });
  }

  const topicMatch = pathname.match(/^\/api\/rooms\/([A-F0-9]{8})\/topic$/i);
  if (topicMatch && req.method === 'GET') {
    const context = requireUser(req, res, 'approved');
    if (!context) return;
    const code = topicMatch[1].toUpperCase();
    const room = db.read().rooms.find((entry) => entry.code === code);
    if (!room || !roomIsJoinableFor(context.user, room)) return sendJson(res, 403, { error: 'Room access denied.' });
    return sendJson(res, 200, { topic: speakingTopicState(room) });
  }

  const eventsMatch = pathname.match(/^\/api\/rooms\/([A-F0-9]{8})\/events$/i);
  if (eventsMatch && req.method === 'GET') {
    const context = requireUser(req, res, 'approved');
    if (!context) return;
    const code = eventsMatch[1].toUpperCase();
    const clientId = String(url.searchParams.get('clientId') || '');
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(clientId)) return sendJson(res, 400, { error: 'Invalid call client.' });
    const room = db.read().rooms.find((entry) => entry.code === code);
    if (!room || !roomIsJoinableFor(context.user, room)) return sendJson(res, 403, { error: 'Room access denied.' });
    const clients = roomMap(code);
    if (!clients.has(clientId) && clients.size >= room.capacity) return sendJson(res, 409, { error: `This room is full. Maximum ${room.capacity} participants.` });
    for (const [existingId, existing] of clients) if (existing.userId === context.user.id && existingId !== clientId) removeRoomClient(code, existingId, true, 'Joined from another tab');
    const existingPeers = Array.from(clients.entries()).map(([id, client]) => ({ clientId: id, userId: client.userId, displayName: client.displayName, specialTag: client.specialTag || '', gender: client.gender, isAdmin: client.isAdmin, isOwner: room.ownerId === client.userId, micEnabled: client.micEnabled !== false, forcedMuted: client.forcedMuted === true, handRaised: client.handRaised === true }));
    if (clients.has(clientId)) removeRoomClient(code, clientId, false);

    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(': connected\n\n');
    const client = {
      res, userId: context.user.id, displayName: context.user.displayName || context.user.username, specialTag: context.user.specialTag || '', gender: validGender(context.user.gender) || 'male', isAdmin: context.user.role === 'admin', micEnabled: true, forcedMuted: false, handRaised: false,
      joinedAt: Date.now(), closed: false, keepAlive: setInterval(() => { try { res.write(': ping\n\n'); } catch { removeRoomClient(code, clientId, true); } }, 20000)
    };
    clients.set(clientId, client);
    sendEvent(client, 'existing-peers', { peers: existingPeers });
    sendEvent(client, 'chat-history', { messages: chatHistory(code).slice(-50) });
    sendEvent(client, 'topic', { topic: speakingTopicState(room) });
    sendEvent(client, 'room-updated', { room: safeRoom(room) });
    broadcastRoom(code, 'peer-joined', { clientId, userId: client.userId, displayName: client.displayName, specialTag: client.specialTag || '', gender: client.gender, isAdmin: client.isAdmin, isOwner: room.ownerId === client.userId, micEnabled: client.micEnabled, handRaised: client.handRaised }, clientId);
    db.transaction((data) => { const saved = data.rooms.find((entry) => entry.code === code); if (saved) saved.lastActiveAt = nowIso(); });
    req.on('close', () => removeRoomClient(code, clientId, true));
    return;
  }

  const signalMatch = pathname.match(/^\/api\/rooms\/([A-F0-9]{8})\/signal$/i);
  if (signalMatch && req.method === 'POST') {
    const context = requireUser(req, res, 'approved');
    if (!context) return;
    const code = signalMatch[1].toUpperCase();
    const room = db.read().rooms.find((entry) => entry.code === code);
    if (!room || !roomIsJoinableFor(context.user, room)) return sendJson(res, 403, { error: 'Room access denied.' });
    const body = await readJsonBody(req);
    const clientId = String(body.clientId || '');
    const target = String(body.target || '');
    if (!validateSignal(body)) return sendJson(res, 400, { error: 'Invalid call signal.' });
    const clients = roomClients.get(code);
    const sender = clients?.get(clientId);
    const receiver = clients?.get(target);
    if (!sender || sender.userId !== context.user.id || !receiver) return sendJson(res, 400, { error: 'Call participant is unavailable.' });
    sendEvent(receiver, 'signal', { from: clientId, userId: sender.userId, displayName: sender.displayName, specialTag: sender.specialTag || '', gender: sender.gender, isAdmin: sender.isAdmin, isOwner: room.ownerId === sender.userId, micEnabled: sender.micEnabled !== false, description: body.description || null, candidate: body.candidate || null });
    return sendJson(res, 200, { ok: true });
  }

  const presenceMatch = pathname.match(/^\/api\/rooms\/([A-F0-9]{8})\/presence$/i);
  if (presenceMatch && req.method === 'POST') {
    const context = requireUser(req, res, 'approved');
    if (!context) return;
    const code = presenceMatch[1].toUpperCase();
    const body = await readJsonBody(req);
    const clientId = String(body.clientId || '');
    const client = roomClients.get(code)?.get(clientId);
    if (!client || client.userId !== context.user.id) return sendJson(res, 400, { error: 'Join the room before updating microphone status.' });
    if (Object.prototype.hasOwnProperty.call(body, 'micEnabled')) {
      const requestedMicState = body.micEnabled === true;
      if (requestedMicState && client.forcedMuted === true) {
        return sendJson(res, 423, { error: 'The room owner or administrator must allow you to unmute.', micEnabled: false, forcedMuted: true });
      }
      client.micEnabled = requestedMicState;
      broadcastRoom(code, 'mic-state', { clientId, userId: client.userId, micEnabled: client.micEnabled }, clientId);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'handRaised')) {
      client.handRaised = body.handRaised === true;
      broadcastRoom(code, 'hand-state', { clientId, userId: client.userId, handRaised: client.handRaised }, clientId);
    }
    return sendJson(res, 200, { ok: true, micEnabled: client.micEnabled, forcedMuted: client.forcedMuted === true, handRaised: client.handRaised });
  }

  const reportMatch = pathname.match(/^\/api\/rooms\/([A-F0-9]{8})\/report$/i);
  if (reportMatch && req.method === 'POST') {
    const context = requireUser(req, res, 'approved');
    if (!context) return;
    if (!allowRate(req, `report:${context.user.id}`, 5, 24 * 60 * 60 * 1000)) return sendJson(res, 429, { error: 'You have submitted too many reports today.' });
    const code = reportMatch[1].toUpperCase();
    const body = await readJsonBody(req);
    const clientId = String(body.clientId || '');
    const targetUserId = String(body.targetUserId || '');
    const complaint = String(body.complaint || '').trim();
    const room = db.read().rooms.find((entry) => entry.code === code);
    const reporterClient = roomClients.get(code)?.get(clientId);
    const targetClient = Array.from(roomClients.get(code)?.values() || []).find((client) => client.userId === targetUserId);
    if (!room || !reporterClient || reporterClient.userId !== context.user.id) return sendJson(res, 400, { error: 'Join the room before reporting a participant.' });
    if (!targetClient || targetClient.userId === context.user.id) return sendJson(res, 400, { error: 'Choose another active participant.' });
    if (complaint.length < 10 || complaint.length > 1000) return sendJson(res, 400, { error: 'Complaint must be 10–1000 characters.' });
    const report = {
      id: crypto.randomUUID(), roomCode: code, roomTitle: room.title,
      reporterId: context.user.id, reporterName: context.user.displayName || context.user.username,
      targetUserId: targetClient.userId, targetName: targetClient.displayName,
      complaint, status: 'open', adminNote: '', createdAt: nowIso(), reviewedAt: null
    };
    db.transaction((data) => { data.reports = Array.isArray(data.reports) ? data.reports : []; data.reports.push(report); });
    sendAdminEvent('admin-refresh', { reason: 'safety-report', reportId: report.id, createdAt: report.createdAt });
    return sendJson(res, 201, { ok: true, reportId: report.id, message: 'Report sent privately to the administrator.' });
  }

  const chatMatch = pathname.match(/^\/api\/rooms\/([A-F0-9]{8})\/chat$/i);
  if (chatMatch && req.method === 'POST') {
    const context = requireUser(req, res, 'approved');
    if (!context) return;
    if (!allowRate(req, `chat:${context.user.id}`, 24, 60 * 1000)) return sendJson(res, 429, { error: 'You are sending messages too quickly.' });
    const code = chatMatch[1].toUpperCase();
    const room = db.read().rooms.find((entry) => entry.code === code);
    if (!room || !roomIsJoinableFor(context.user, room)) return sendJson(res, 403, { error: 'Room access denied.' });
    const body = await readJsonBody(req);
    const clientId = String(body.clientId || '');
    const text = String(body.text || '').trim();
    const client = roomClients.get(code)?.get(clientId);
    if (!client || client.userId !== context.user.id) return sendJson(res, 400, { error: 'Join the voice room before sending chat messages.' });
    if (!text || text.length > 300) return sendJson(res, 400, { error: 'Message must be 1–300 characters.' });
    const message = { id: crypto.randomUUID(), userId: context.user.id, username: context.user.displayName || context.user.username, specialTag: context.user.specialTag || '', text, createdAt: nowIso() };
    const history = chatHistory(code);
    history.push(message);
    if (history.length > 50) history.splice(0, history.length - 50);
    broadcastRoom(code, 'chat', { message });
    return sendJson(res, 201, { message });
  }

  const moderateMatch = pathname.match(/^\/api\/rooms\/([A-F0-9]{8})\/moderate$/i);
  if (moderateMatch && req.method === 'POST') {
    const context = requireUser(req, res, 'approved');
    if (!context) return;
    const code = moderateMatch[1].toUpperCase();
    const body = await readJsonBody(req);
    const action = String(body.action || '');
    const room = db.read().rooms.find((entry) => entry.code === code);
    if (!room) return sendJson(res, 404, { error: 'Room not found.' });

    const isAdministrator = context.user.role === 'admin';
    const isRoomOwner = room.ownerId === context.user.id;
    const ownerActions = new Set(['mute', 'unmute', 'mute-all', 'lower-hand', 'lower-all-hands', 'kick']);
    const adminActions = new Set([...ownerActions, 'make-owner', 'lock', 'unlock', 'close']);
    if (!(isAdministrator ? adminActions.has(action) : (isRoomOwner && ownerActions.has(action)))) {
      return sendJson(res, 403, { error: 'Only the room owner or administrator can use this moderation action.' });
    }

    const target = body.targetClientId ? roomClients.get(code)?.get(String(body.targetClientId)) : null;
    if (['mute', 'unmute', 'kick', 'make-owner', 'lower-hand'].includes(action) && !target) return sendJson(res, 404, { error: 'Participant not found.' });
    if (action === 'kick' && target.userId === context.user.id) return sendJson(res, 400, { error: 'You cannot remove yourself.' });
    if (target && isRoomOwner && target.isAdmin && ['mute', 'unmute', 'kick', 'lower-hand'].includes(action)) return sendJson(res, 403, { error: 'A room owner cannot moderate an administrator.' });

    const actor = isAdministrator ? 'administrator' : 'room owner';
    if (action === 'mute' || action === 'unmute') {
      if (action === 'mute') {
        target.forcedMuted = true;
        target.micEnabled = false;
      } else {
        target.forcedMuted = false;
      }
      sendEvent(target, 'moderation', { action, message: action === 'mute' ? `The ${actor} muted your microphone.` : `The ${actor} allowed you to unmute.` });
      broadcastRoom(code, 'mic-state', { clientId: String(body.targetClientId), userId: target.userId, micEnabled: target.micEnabled !== false });
    } else if (action === 'mute-all') {
      let count = 0;
      for (const [targetId, participant] of roomMap(code)) {
        if (participant.userId === context.user.id || (isRoomOwner && participant.isAdmin)) continue;
        participant.forcedMuted = true;
        participant.micEnabled = false;
        sendEvent(participant, 'moderation', { action: 'mute', message: `The ${actor} muted everyone in this room.` });
        broadcastRoom(code, 'mic-state', { clientId: targetId, userId: participant.userId, micEnabled: false });
        count += 1;
      }
      return sendJson(res, 200, { ok: true, affected: count, room: safeRoom(room) });
    } else if (action === 'lower-hand') {
      target.handRaised = false;
      sendEvent(target, 'moderation', { action: 'lower-hand', message: `The ${actor} lowered your hand.` });
      broadcastRoom(code, 'hand-state', { clientId: String(body.targetClientId), userId: target.userId, handRaised: false });
    } else if (action === 'lower-all-hands') {
      let count = 0;
      for (const [targetId, participant] of roomMap(code)) {
        if (!participant.handRaised || (isRoomOwner && participant.isAdmin)) continue;
        participant.handRaised = false;
        sendEvent(participant, 'moderation', { action: 'lower-hand', message: `The ${actor} lowered all raised hands.` });
        broadcastRoom(code, 'hand-state', { clientId: targetId, userId: participant.userId, handRaised: false });
        count += 1;
      }
      return sendJson(res, 200, { ok: true, affected: count, room: safeRoom(room) });
    } else if (action === 'kick') {
      db.transaction((data) => {
        const saved = data.rooms.find((entry) => entry.code === code);
        if (saved && !saved.bannedUserIds.includes(target.userId)) saved.bannedUserIds.push(target.userId);
      });
      sendEvent(target, 'moderation', { action: 'kick', message: `The ${actor} removed you from this room.` });
      const targetId = String(body.targetClientId);
      setTimeout(() => removeRoomClient(code, targetId, true, `Removed by ${actor}`), 50);
    } else if (action === 'make-owner') {
      db.transaction((data) => {
        const saved = data.rooms.find((entry) => entry.code === code);
        if (saved) { saved.ownerId = target.userId; saved.ownerName = target.displayName; }
      });
      broadcastRoom(code, 'owner-changed', { ownerId: target.userId, ownerName: target.displayName });
    } else if (action === 'lock' || action === 'unlock') {
      db.transaction((data) => { const saved = data.rooms.find((entry) => entry.code === code); if (saved) saved.isLocked = action === 'lock'; });
      broadcastRoom(code, 'room-updated', { room: safeRoom(db.read().rooms.find((entry) => entry.code === code)) });
    } else if (action === 'close') {
      db.transaction((data) => { const saved = data.rooms.find((entry) => entry.code === code); if (saved) saved.status = 'closed'; });
      for (const [targetId, client] of roomMap(code)) {
        sendEvent(client, 'moderation', { action: 'close', message: 'The administrator closed this room.' });
        setTimeout(() => removeRoomClient(code, targetId, false, 'Room closed'), 50);
      }
    } else return sendJson(res, 400, { error: 'Invalid moderation action.' });
    return sendJson(res, 200, { ok: true, room: safeRoom(db.read().rooms.find((entry) => entry.code === code)) });
  }

  const leaveMatch = pathname.match(/^\/api\/rooms\/([A-F0-9]{8})\/leave$/i);
  if (leaveMatch && req.method === 'POST') {
    const context = requireUser(req, res, 'approved');
    if (!context) return;
    const body = await readJsonBody(req);
    const code = leaveMatch[1].toUpperCase();
    const clientId = String(body.clientId || '');
    const client = roomClients.get(code)?.get(clientId);
    if (client && client.userId === context.user.id) removeRoomClient(code, clientId, true);
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: 'Not found.' });
}

async function handleRequest(req, res) {
  securityHeaders(res);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/health' && req.method === 'GET') return sendJson(res, 200, { ok: true, version: 21.3, voiceMode: effectiveVoiceMode(), turnConfigured: turnConfigured(), aiProviderConfigured: aiProviderConfigured() });
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });

  if (url.pathname === '/') {
    const context = getAuthContext(req);
    if (context.user?.role === 'admin') return redirect(res, '/admin');
    if (context.user) {
      if (context.user.status === 'approved' && validLevel(context.user.level)) return redirect(res, '/dashboard');
      return redirect(res, '/pending');
    }
    return sendFile(req, res, path.join(PUBLIC_DIR, 'index.html'));
  }
  if (/^\/private\/[A-Za-z0-9_.-]{30,220}$/.test(url.pathname)) return sendFile(req, res, path.join(PUBLIC_DIR, 'private-session.html'));
  if (url.pathname === '/admin-login') return redirect(res, '/login');
  if (['/login', '/register', '/forgot-password', '/reset-password'].includes(url.pathname)) return sendFile(req, res, path.join(PUBLIC_DIR, 'auth.html'));
  if (url.pathname === '/pending') { if (!pageAccess(req, res, 'login')) return; return sendFile(req, res, path.join(PUBLIC_DIR, 'pending.html')); }
  if (url.pathname === '/dashboard') { if (!pageAccess(req, res, 'login')) return; return sendFile(req, res, path.join(PUBLIC_DIR, 'dashboard.html')); }
  if (url.pathname === '/ai-practice') { if (!pageAccess(req, res, 'login')) return; return sendFile(req, res, path.join(PUBLIC_DIR, 'ai-practice.html')); }
  if (url.pathname === '/admin') { if (!pageAccess(req, res, 'admin')) return; return sendFile(req, res, path.join(PUBLIC_DIR, 'admin.html')); }
  if (/^\/room\/[A-F0-9]{8}$/i.test(url.pathname)) {
    const context = getAuthContext(req);
    if (!context.user) return redirect(res, '/register');
    if (!isAccessApproved(context)) return redirect(res, '/dashboard#pricing-section');
    return sendFile(req, res, path.join(PUBLIC_DIR, 'room.html'));
  }

  let decodedPath;
  try { decodedPath = decodeURIComponent(url.pathname); } catch { return sendFile(req, res, path.join(PUBLIC_DIR, '404.html'), 404); }
  const relativePath = decodedPath.replace(/^\/+/, '');
  const staticPath = path.join(PUBLIC_DIR, relativePath);
  if (staticPath.startsWith(PUBLIC_DIR + path.sep) && fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) return sendFile(req, res, staticPath);
  return sendFile(req, res, path.join(PUBLIC_DIR, '404.html'), 404);
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) sendJson(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'Internal server error.' });
    else res.end();
  });
});

const WS_OPEN = 1;
const WS_CLOSING = 2;
const WS_CLOSED = 3;
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function encodeWebSocketFrame(opcode, payload = Buffer.alloc(0)) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  let header;
  if (body.length < 126) {
    header = Buffer.from([0x80 | opcode, body.length]);
  } else if (body.length <= 0xffff) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }
  return Buffer.concat([header, body]);
}

class RawWebSocketPeer extends EventEmitter {
  constructor(socket, initialData = Buffer.alloc(0)) {
    super();
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.readyState = WS_OPEN;
    this.isAlive = true;
    socket.on('data', (chunk) => this.consume(chunk));
    socket.on('error', (error) => this.emit('error', error));
    socket.on('close', () => this.finishClose());
    socket.on('end', () => this.finishClose());
    if (initialData?.length) this.consume(initialData);
  }

  send(payload) {
    if (this.readyState !== WS_OPEN) return;
    const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    if (body.length > 65536) return this.terminate();
    this.socket.write(encodeWebSocketFrame(0x2, body));
  }

  ping() {
    if (this.readyState === WS_OPEN) this.socket.write(encodeWebSocketFrame(0x9));
  }

  close(code = 1000, reason = '') {
    if (this.readyState !== WS_OPEN) return;
    this.readyState = WS_CLOSING;
    const reasonBytes = Buffer.from(String(reason).slice(0, 100), 'utf8');
    const payload = Buffer.allocUnsafe(2 + reasonBytes.length);
    payload.writeUInt16BE(code, 0);
    reasonBytes.copy(payload, 2);
    try { this.socket.write(encodeWebSocketFrame(0x8, payload)); } catch {}
    this.socket.end();
  }

  terminate() {
    if (this.readyState === WS_CLOSED) return;
    this.readyState = WS_CLOSED;
    try { this.socket.destroy(); } catch {}
    this.emit('close');
  }

  finishClose() {
    if (this.readyState === WS_CLOSED) return;
    this.readyState = WS_CLOSED;
    this.emit('close');
  }

  consume(chunk) {
    if (this.readyState === WS_CLOSED) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const fin = (first & 0x80) !== 0;
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let length = second & 0x7f;
      let offset = 2;
      if (!fin || !masked) return this.terminate();
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        const bigLength = this.buffer.readBigUInt64BE(2);
        if (bigLength > BigInt(65536)) return this.terminate();
        length = Number(bigLength);
        offset = 10;
      }
      if (length > 65536) return this.terminate();
      if (this.buffer.length < offset + 4 + length) return;
      const mask = this.buffer.subarray(offset, offset + 4);
      offset += 4;
      const payload = Buffer.from(this.buffer.subarray(offset, offset + length));
      this.buffer = this.buffer.subarray(offset + length);
      for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];
      if (opcode === 0x2) this.emit('message', payload, true);
      else if (opcode === 0x8) {
        if (this.readyState === WS_OPEN) {
          try { this.socket.write(encodeWebSocketFrame(0x8, payload)); } catch {}
        }
        this.socket.end();
        return;
      } else if (opcode === 0x9) {
        try { this.socket.write(encodeWebSocketFrame(0xA, payload)); } catch {}
      } else if (opcode === 0xA) {
        this.isAlive = true;
        this.emit('pong');
      }
    }
  }
}

function upgradeToWebSocket(request, socket, head) {
  const key = String(request.headers['sec-websocket-key'] || '').trim();
  const version = String(request.headers['sec-websocket-version'] || '');
  if (!key || version !== '13') return null;
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '\r\n'
  ].join('\r\n'));
  return new RawWebSocketPeer(socket, head);
}

function registerVoiceRelayPeer(peer, meta) {
  const { code, clientId, userId } = meta;
  const sockets = relayRoomMap(code);
  const existing = sockets.get(clientId);
  if (existing && existing !== peer) try { existing.close(1000, 'Reconnected'); } catch {}
  sockets.set(clientId, peer);
  peer.isAlive = true;
  broadcastRoom(code, 'voice-mode', { mode: 'relay', reason: 'secure-fallback' });
  peer.on('pong', () => { peer.isAlive = true; });
  peer.on('message', (payload, isBinary) => {
    if (!isBinary || !Buffer.isBuffer(payload) || payload.length < 2 || payload.length > 65536) return;
    const roomClient = roomClients.get(code)?.get(clientId);
    if (!roomClient || roomClient.userId !== userId || roomClient.micEnabled === false) return;
    const idBytes = Buffer.from(clientId, 'utf8');
    if (idBytes.length > 255) return;
    const envelope = Buffer.allocUnsafe(1 + idBytes.length + payload.length);
    envelope.writeUInt8(idBytes.length, 0);
    idBytes.copy(envelope, 1);
    payload.copy(envelope, 1 + idBytes.length);
    for (const [otherId, otherPeer] of sockets) {
      if (otherId === clientId || otherPeer.readyState !== WS_OPEN) continue;
      if (!roomClients.get(code)?.has(otherId)) continue;
      try { otherPeer.send(envelope); } catch {}
    }
  });
  peer.on('close', () => {
    if (relaySockets.get(code)?.get(clientId) === peer) relaySockets.get(code).delete(clientId);
    if (relaySockets.get(code) && !relaySockets.get(code).size) relaySockets.delete(code);
  });
  peer.on('error', () => {});
}

server.on('upgrade', (request, socket, head) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const match = url.pathname.match(/^\/api\/rooms\/([A-F0-9]{8})\/voice-relay$/i);
    if (!match || VOICE_MODE_SETTING === 'webrtc') return socket.destroy();
    const code = match[1].toUpperCase();
    const clientId = String(url.searchParams.get('clientId') || '');
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(clientId)) return socket.destroy();
    const context = getAuthContext(request);
    const room = db.read().rooms.find((entry) => entry.code === code);
    const roomClient = roomClients.get(code)?.get(clientId);
    if (!context.user || !isAccessApproved(context) || !room || !roomIsJoinableFor(context.user, room) || !roomClient || roomClient.userId !== context.user.id) return socket.destroy();
    const peer = upgradeToWebSocket(request, socket, head);
    if (!peer) return socket.destroy();
    registerVoiceRelayPeer(peer, { code, clientId, userId: context.user.id });
  } catch {
    socket.destroy();
  }
});

const relayHeartbeat = setInterval(() => {
  for (const sockets of relaySockets.values()) {
    for (const peer of sockets.values()) {
      if (peer.isAlive === false) { peer.terminate(); continue; }
      peer.isAlive = false;
      try { peer.ping(); } catch {}
    }
  }
}, 25000);
relayHeartbeat.unref();
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.requestTimeout = 30000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Bolo English v21.3 is running at http://localhost:${PORT}`);
  console.log(`Voice mode: ${effectiveVoiceMode()}${turnConfigured() ? ' (TURN configured)' : ' (secure relay fallback)'}`);
  console.log(`SQLite database: ${SQLITE_PATH}`);
});

function shutdown() {
  clearInterval(relayHeartbeat);
  for (const sockets of relaySockets.values()) for (const socket of sockets.values()) try { socket.close(1001, 'Server shutdown'); } catch {}
  relaySockets.clear();
  for (const [sessionId, clients] of privateSessionClients) for (const [clientId] of clients) removePrivateSessionClient(sessionId, clientId, false);
  privateSessionClients.clear();
  for (const [code, clients] of roomClients) for (const [clientId] of clients) removeRoomClient(code, clientId, false);
  for (const clients of accountEventClients.values()) {
    for (const client of clients) {
      client.closed = true;
      clearInterval(client.keepAlive);
      try { client.res.end(); } catch {}
    }
  }
  accountEventClients.clear();
  adminEventClients.clear();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
setInterval(() => {
  const now = Date.now();
  db.transaction((data) => {
    for (const user of data.users) {
      user.authSessions = (Array.isArray(user.authSessions) ? user.authSessions : [])
        .filter((session) => session?.expiresAt && new Date(session.expiresAt).getTime() > now);
      user.authSession = null;
    }
  });
  for (const [key, times] of rateBuckets) {
    const current = times.filter((time) => now - time < 15 * 60 * 1000);
    if (current.length) rateBuckets.set(key, current); else rateBuckets.delete(key);
  }
}, 10 * 60 * 1000).unref();
