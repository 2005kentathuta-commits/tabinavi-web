const express = require('express');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { get, put, del } = require('@vercel/blob');
const { createClerkClient, verifyToken: verifyClerkToken } = require('@clerk/backend');
const { Resend } = require('resend');
const { Redis } = require('@upstash/redis');
const { Pinecone } = require('@pinecone-database/pinecone');
const OpenAI = require('openai');

const app = express();

const MAX_JSON_SIZE = '12mb';
const JWT_ISSUER = 'tabinoshiori';
const JWT_AUDIENCE = 'tabinoshiori-users';
const JWT_SECRET = process.env.APP_JWT_SECRET || 'dev-secret-change-me';
const OWNER_ADMIN_EMAIL = '2005kentathuta@gmail.com';
const ADMIN_EMAIL_SET = new Set(
  [
    OWNER_ADMIN_EMAIL,
    ...String(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  ].filter(Boolean),
);
const RESET_TOKEN_TTL_MINUTES = Math.max(5, Number(process.env.RESET_TOKEN_TTL_MINUTES || 30) || 30);
const PASSWORD_SYNC_TOKEN_TTL_MINUTES = Math.max(
  5,
  Number(process.env.PASSWORD_SYNC_TOKEN_TTL_MINUTES || 180) || 180,
);
const SHOW_RESET_TOKEN_IN_LOGS = process.env.SHOW_RESET_TOKEN_IN_LOGS === 'true';
const PASSWORD_RESET_BASE_URL = String(process.env.PASSWORD_RESET_BASE_URL || process.env.APP_BASE_URL || '').trim();
const EMAIL_FROM = String(process.env.EMAIL_FROM || process.env.RESET_EMAIL_FROM || '').trim();
const RESET_EMAIL_REPLY_TO = String(process.env.RESET_EMAIL_REPLY_TO || '').trim();
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || '').trim();
const CLERK_SECRET_KEY = String(process.env.CLERK_SECRET_KEY || '').trim();
const CLERK_JWT_KEY = String(process.env.CLERK_JWT_KEY || '').trim();
const CLERK_PUBLISHABLE_KEY = String(process.env.CLERK_PUBLISHABLE_KEY || '').trim();
const CLERK_AUTHORIZED_PARTIES = String(process.env.CLERK_AUTHORIZED_PARTIES || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);
const POSTHOG_PUBLIC_KEY = String(process.env.POSTHOG_PUBLIC_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY || '').trim();
const POSTHOG_HOST = String(process.env.POSTHOG_HOST || 'https://us.i.posthog.com').trim();
const REDIS_URL = String(process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL || '').trim();
const REDIS_TOKEN = String(process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_TOKEN || '').trim();
const RATE_LIMIT_WINDOW_SECONDS = Math.max(30, Number(process.env.RATE_LIMIT_WINDOW_SECONDS || 60) || 60);
const RATE_LIMIT_MAX_LOGIN = Math.max(3, Number(process.env.RATE_LIMIT_MAX_LOGIN || 12) || 12);
const RATE_LIMIT_MAX_PASSWORD_RESET = Math.max(
  3,
  Number(process.env.RATE_LIMIT_MAX_PASSWORD_RESET || 6) || 6,
);
const RATE_LIMIT_MAX_SIGNUP = Math.max(3, Number(process.env.RATE_LIMIT_MAX_SIGNUP || 8) || 8);
const PINECONE_API_KEY = String(process.env.PINECONE_API_KEY || '').trim();
const PINECONE_INDEX = String(process.env.PINECONE_INDEX || '').trim();
const PINECONE_NAMESPACE = String(process.env.PINECONE_NAMESPACE || 'tabinavi-memories').trim();
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim();
const OPENAI_EMBEDDING_MODEL = String(process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small').trim();
const DB_PATH_PREFIX =
  process.env.DB_PATH ||
  `internal/db-${crypto.createHash('sha256').update(JWT_SECRET).digest('hex').slice(0, 24)}`;
const DB_PATH = `${DB_PATH_PREFIX}.json`;
const DB_ETAG_KEY = Symbol('db-etag');
const MAX_DB_WRITE_RETRIES = 10;
const COVER_PREFIX = 'covers/';
const MEMORY_PREFIX = 'memories/';
const MAX_AUTH_EVENTS = Math.max(200, Number(process.env.MAX_AUTH_EVENTS || 2000) || 2000);
const CLERK_LOCAL_ID_PREFIX = 'clerk_';
const DEFAULT_CLERK_EMAIL_DOMAIN = 'clerk.local';
const AUTH_PROVIDER = CLERK_SECRET_KEY ? 'hybrid-clerk' : 'legacy';

const clerkClient = CLERK_SECRET_KEY
  ? createClerkClient({
      secretKey: CLERK_SECRET_KEY,
    })
  : null;

const resendClient = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const redisClient =
  REDIS_URL && REDIS_TOKEN
    ? new Redis({
        url: REDIS_URL,
        token: REDIS_TOKEN,
      })
    : null;

const pineconeClient = PINECONE_API_KEY ? new Pinecone({ apiKey: PINECONE_API_KEY }) : null;
const openaiClient = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

app.use(express.json({ limit: MAX_JSON_SIZE }));

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function inviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function defaultDb() {
  return {
    users: [],
    passwordResets: [],
    authEvents: [],
    trips: [],
    tripMembers: [],
    itineraryItems: [],
    guideSections: [],
    memories: [],
  };
}

function normalizeDb(value) {
  const base = defaultDb();
  if (!value || typeof value !== 'object') {
    return base;
  }
  return {
    users: Array.isArray(value.users) ? value.users : [],
    passwordResets: Array.isArray(value.passwordResets) ? value.passwordResets : [],
    authEvents: Array.isArray(value.authEvents) ? value.authEvents : [],
    trips: Array.isArray(value.trips) ? value.trips : [],
    tripMembers: Array.isArray(value.tripMembers) ? value.tripMembers : [],
    itineraryItems: Array.isArray(value.itineraryItems) ? value.itineraryItems : [],
    guideSections: Array.isArray(value.guideSections) ? value.guideSections : [],
    memories: Array.isArray(value.memories) ? value.memories : [],
  };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeDisplayName(value) {
  return String(value || '').trim();
}

function displayNameKey(value) {
  return normalizeDisplayName(value).toLowerCase();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeEmailLocalPart(value) {
  const cleaned = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || `user_${Math.random().toString(36).slice(2, 10)}`;
}

function clerkLocalUserId(clerkUserId) {
  return `${CLERK_LOCAL_ID_PREFIX}${String(clerkUserId || '').trim()}`;
}

function defaultClerkEmail(clerkUserId) {
  const localPart = sanitizeEmailLocalPart(clerkUserId || crypto.randomUUID());
  return `${localPart}@${DEFAULT_CLERK_EMAIL_DOMAIN}`;
}

function extractClerkPrimaryEmail(clerkUser) {
  if (!clerkUser || typeof clerkUser !== 'object') {
    return '';
  }

  const addresses = Array.isArray(clerkUser.emailAddresses) ? clerkUser.emailAddresses : [];
  const primary =
    addresses.find((entry) => String(entry?.id || '') === String(clerkUser.primaryEmailAddressId || '')) ||
    addresses[0];

  return normalizeEmail(primary?.emailAddress || '');
}

function extractClerkDisplayName(clerkUser, fallbackEmail = '') {
  if (!clerkUser || typeof clerkUser !== 'object') {
    return normalizeDisplayName(fallbackEmail.split('@')[0] || 'Traveler');
  }

  const fullName = [String(clerkUser.firstName || '').trim(), String(clerkUser.lastName || '').trim()]
    .filter(Boolean)
    .join(' ');

  const candidate =
    String(clerkUser.username || '').trim() ||
    fullName ||
    String(clerkUser?.unsafeMetadata?.displayName || '').trim() ||
    String(clerkUser?.publicMetadata?.displayName || '').trim() ||
    fallbackEmail.split('@')[0] ||
    'Traveler';

  return normalizeDisplayName(candidate || 'Traveler');
}

async function verifyClerkSessionToken(token) {
  if (!token || !CLERK_SECRET_KEY) {
    return null;
  }

  const options = {
    secretKey: CLERK_SECRET_KEY,
    ...(CLERK_JWT_KEY ? { jwtKey: CLERK_JWT_KEY } : {}),
    ...(CLERK_AUTHORIZED_PARTIES.length > 0 ? { authorizedParties: CLERK_AUTHORIZED_PARTIES } : {}),
  };

  const result = await verifyClerkToken(token, options);
  if (result?.errors?.length) {
    return null;
  }
  const claims = result?.data || null;
  if (!claims?.sub) {
    return null;
  }
  return claims;
}

async function resolveClerkAuthUser(clerkUserId) {
  if (!clerkUserId) {
    return null;
  }

  const fallbackEmail = defaultClerkEmail(clerkUserId);

  if (!clerkClient) {
    return {
      id: clerkLocalUserId(clerkUserId),
      clerkUserId,
      email: fallbackEmail,
      displayName: 'Traveler',
      isGuest: false,
      passwordHash: '',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      passwordUpdatedAt: nowIso(),
    };
  }

  try {
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    const email = extractClerkPrimaryEmail(clerkUser) || fallbackEmail;
    const displayName = extractClerkDisplayName(clerkUser, email);
    return {
      id: clerkLocalUserId(clerkUserId),
      clerkUserId,
      email,
      displayName,
      isGuest: false,
      passwordHash: '',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      passwordUpdatedAt: nowIso(),
    };
  } catch (error) {
    console.error('[clerk] failed to fetch user profile', error);
    return {
      id: clerkLocalUserId(clerkUserId),
      clerkUserId,
      email: fallbackEmail,
      displayName: 'Traveler',
      isGuest: false,
      passwordHash: '',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      passwordUpdatedAt: nowIso(),
    };
  }
}

function clientIp(req) {
  const fromHeader = firstHeaderValue(req.headers['x-forwarded-for']) || '';
  if (fromHeader) {
    return fromHeader;
  }
  return String(req.socket?.remoteAddress || 'unknown').trim();
}

function cleanUserAgent(req) {
  const raw = firstHeaderValue(req.headers['user-agent']) || '';
  return raw.slice(0, 180);
}

function appendAuthEvent(db, event) {
  if (!db || typeof db !== 'object') {
    return;
  }

  if (!Array.isArray(db.authEvents)) {
    db.authEvents = [];
  }

  const record = {
    id: randomId('auth'),
    at: nowIso(),
    event: String(event?.event || 'auth'),
    success: Boolean(event?.success),
    email: normalizeEmail(event?.email || ''),
    userId: String(event?.userId || ''),
    displayName: normalizeDisplayName(event?.displayName || ''),
    ip: String(event?.ip || ''),
    userAgent: String(event?.userAgent || ''),
    reason: String(event?.reason || ''),
  };

  db.authEvents.push(record);
  if (db.authEvents.length > MAX_AUTH_EVENTS) {
    db.authEvents = db.authEvents.slice(-MAX_AUTH_EVENTS);
  }
}

async function persistAuthEvent(req, event) {
  try {
    await mutateDb((db) => {
      appendAuthEvent(db, {
        ...event,
        ip: event?.ip || clientIp(req),
        userAgent: event?.userAgent || cleanUserAgent(req),
      });
      return null;
    });
  } catch (error) {
    console.error('[auth-event] failed to persist', error);
  }
}

async function checkRateLimit(key, maxCount, windowSeconds) {
  if (!redisClient || !key || !Number.isFinite(maxCount) || maxCount <= 0) {
    return { allowed: true, remaining: maxCount, resetAt: Date.now() + windowSeconds * 1000 };
  }

  const safeWindow = Math.max(30, Number(windowSeconds) || RATE_LIMIT_WINDOW_SECONDS);
  const bucket = Math.floor(Date.now() / (safeWindow * 1000));
  const redisKey = `ratelimit:${key}:${bucket}`;

  try {
    const current = await redisClient.incr(redisKey);
    if (current === 1) {
      await redisClient.expire(redisKey, safeWindow + 5);
    }

    return {
      allowed: current <= maxCount,
      remaining: Math.max(0, maxCount - current),
      resetAt: (bucket + 1) * safeWindow * 1000,
    };
  } catch (error) {
    console.error('[ratelimit] redis error', error);
    return { allowed: true, remaining: maxCount, resetAt: Date.now() + safeWindow * 1000 };
  }
}

async function enforceRateLimit(req, category, maxCount) {
  const ip = clientIp(req);
  const result = await checkRateLimit(`${category}:${ip}`, maxCount, RATE_LIMIT_WINDOW_SECONDS);
  if (result.allowed) {
    return;
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  const error = new Error('アクセスが集中しています。少し待ってから再試行してください。');
  error.statusCode = 429;
  error.retryAfterSeconds = retryAfterSeconds;
  throw error;
}

function semanticSearchEnabled() {
  return Boolean(pineconeClient && openaiClient && PINECONE_INDEX);
}

async function createEmbeddingVector(inputText) {
  if (!semanticSearchEnabled()) {
    return null;
  }

  const text = String(inputText || '').trim();
  if (!text) {
    return null;
  }

  const response = await openaiClient.embeddings.create({
    model: OPENAI_EMBEDDING_MODEL,
    input: text.slice(0, 8000),
  });
  const vector = response?.data?.[0]?.embedding;
  return Array.isArray(vector) ? vector : null;
}

function memoryVectorId(memoryId) {
  return `memory:${String(memoryId || '')}`;
}

function memoryEmbeddingText(memory) {
  return [memory?.title, memory?.content, memory?.date]
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .join('\n');
}

async function upsertMemoryVector(memory) {
  if (!semanticSearchEnabled() || !memory?.id || !memory?.tripId) {
    return false;
  }

  const vector = await createEmbeddingVector(memoryEmbeddingText(memory));
  if (!vector) {
    return false;
  }

  const index = pineconeClient.index(PINECONE_INDEX).namespace(PINECONE_NAMESPACE);
  await index.upsert([
    {
      id: memoryVectorId(memory.id),
      values: vector,
      metadata: {
        memoryId: String(memory.id),
        tripId: String(memory.tripId),
        title: String(memory.title || ''),
        date: String(memory.date || ''),
        updatedAt: String(memory.updated_at || nowIso()),
      },
    },
  ]);
  return true;
}

async function removeMemoryVector(memoryId) {
  if (!semanticSearchEnabled() || !memoryId) {
    return false;
  }

  const index = pineconeClient.index(PINECONE_INDEX).namespace(PINECONE_NAMESPACE);
  await index.deleteOne({ id: memoryVectorId(memoryId) });
  return true;
}

function normalizeOptionalUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

function normalizeItineraryIcon(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '📍';
  }
  return Array.from(raw).slice(0, 2).join('');
}

function sanitizeTrip(trip) {
  if (!trip || typeof trip !== 'object') {
    return null;
  }
  const { edit_passphrase_hash, ...safeTrip } = trip;
  return {
    ...safeTrip,
    requires_passphrase: Boolean(edit_passphrase_hash),
  };
}

function passwordProof(email, password) {
  return crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${normalizeEmail(email)}:${String(password || '')}`)
    .digest('hex');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function createPasswordSyncToken(user, plainPassword) {
  const email = normalizeEmail(user?.email);
  if (!user?.id || !email || !plainPassword) {
    return '';
  }

  return jwt.sign(
    {
      sub: user.id,
      email,
      displayName: normalizeDisplayName(user.displayName || 'Traveler'),
      proof: passwordProof(email, plainPassword),
      purpose: 'password-sync',
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
    },
    JWT_SECRET,
    { expiresIn: `${PASSWORD_SYNC_TOKEN_TTL_MINUTES}m` },
  );
}

function verifyPasswordSyncToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (payload?.purpose !== 'password-sync' || !payload?.sub || !payload?.email || !payload?.proof) {
      return null;
    }
    return {
      id: payload.sub,
      email: normalizeEmail(payload.email),
      displayName: normalizeDisplayName(payload.displayName || 'Traveler'),
      proof: String(payload.proof),
    };
  } catch {
    return null;
  }
}

function verifyPasswordSyncProof(email, inputPassword, proof) {
  const expected = passwordProof(email, inputPassword);
  return safeEqual(expected, proof);
}

function createPasswordResetToken(user, options = {}) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      purpose: 'password-reset',
      manualDisplayName: options.manualDisplayName || '',
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
    },
    JWT_SECRET,
    { expiresIn: `${RESET_TOKEN_TTL_MINUTES}m` },
  );
}

function verifyPasswordResetToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (payload?.purpose !== 'password-reset' || !payload?.sub) {
      return null;
    }
    return {
      id: payload.sub,
      email: payload.email || '',
      manualDisplayName: payload.manualDisplayName || '',
    };
  } catch {
    return null;
  }
}

function isResetTokenValid(record) {
  if (!record || record.usedAt) {
    return false;
  }
  const expiresAt = record.expiresAt ? new Date(record.expiresAt).getTime() : 0;
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function cleanupExpiredResets(db) {
  db.passwordResets = (db.passwordResets || []).filter((record) => isResetTokenValid(record));
}

function normalizeGuideDetails(details) {
  const list = Array.isArray(details) ? details : [];
  return list
    .slice(0, 40)
    .map((entry) => {
      const label = String(entry?.label || '').trim();
      const value = String(entry?.value || '').trim();
      if (!label && !value) {
        return null;
      }
      return {
        id: String(entry?.id || randomId('detail')),
        label: label || '項目',
        value,
      };
    })
    .filter(Boolean);
}

function normalizeGuideStyleInput(style) {
  const base = style && typeof style === 'object' ? style : {};
  return {
    variant: String(base.variant || 'plain'),
    emoji: String(base.emoji || '📍'),
    details: normalizeGuideDetails(base.details),
  };
}

function defaultOverviewDetails() {
  return [
    { id: randomId('detail'), label: '日付', value: '' },
    { id: randomId('detail'), label: '時間', value: '' },
    { id: randomId('detail'), label: '出来事', value: '' },
    { id: randomId('detail'), label: '場所', value: '' },
  ];
}

function firstHeaderValue(header) {
  if (!header) {
    return '';
  }
  if (Array.isArray(header)) {
    return String(header[0] || '').trim();
  }
  return String(header).split(',')[0].trim();
}

function inferAppBaseUrl(req) {
  if (PASSWORD_RESET_BASE_URL) {
    return PASSWORD_RESET_BASE_URL;
  }
  const proto = firstHeaderValue(req.headers['x-forwarded-proto']) || 'https';
  const host =
    firstHeaderValue(req.headers['x-forwarded-host']) ||
    firstHeaderValue(req.headers.host) ||
    'localhost:5173';
  return `${proto}://${host}`;
}

function buildPasswordResetUrl(req, token) {
  const base = inferAppBaseUrl(req).replace(/\/+$/, '');
  return `${base}/?resetToken=${encodeURIComponent(token)}`;
}

async function sendTransactionalEmail({ toEmail, subject, html, text }) {
  if (!resendClient || !EMAIL_FROM) {
    return false;
  }

  const response = await resendClient.emails.send({
    from: EMAIL_FROM,
    to: [toEmail],
    subject,
    html,
    text,
    ...(RESET_EMAIL_REPLY_TO ? { replyTo: RESET_EMAIL_REPLY_TO } : {}),
  });

  if (response?.error) {
    throw new Error(response.error.message || 'メール送信に失敗しました。');
  }
  return true;
}

async function sendPasswordResetEmail(toEmail, resetUrl) {
  if (!resendClient || !EMAIL_FROM) {
    return false;
  }

  const html = `
    <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h2 style="margin: 0 0 12px;">パスワード再設定のご案内</h2>
      <p style="margin: 0 0 14px;">以下のリンクを開いて、新しいパスワードを設定してください。</p>
      <p style="margin: 0 0 16px;"><a href="${resetUrl}" target="_blank" rel="noreferrer">パスワードを再設定する</a></p>
      <p style="margin: 0;">このリンクの有効期限は ${RESET_TOKEN_TTL_MINUTES} 分です。</p>
    </div>
  `;

  const text =
    `パスワード再設定リンク: ${resetUrl}\n` +
    `このリンクの有効期限は ${RESET_TOKEN_TTL_MINUTES} 分です。`;

  return sendTransactionalEmail({
    toEmail,
    subject: '【足袋navi】パスワード再設定',
    html,
    text,
  });
}

function attachDbEtag(db, etag = '') {
  const normalized = normalizeEtag(etag);
  Object.defineProperty(db, DB_ETAG_KEY, {
    value: normalized,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  return db;
}

function normalizeEtag(etag) {
  const value = String(etag || '').trim();
  if (!value) {
    return '';
  }
  if (value.startsWith('W/')) {
    return value.slice(2);
  }
  return value;
}

function dbEtag(db) {
  return (db && typeof db === 'object' && db[DB_ETAG_KEY]) || '';
}

async function readDb() {
  try {
    const blob = await get(DB_PATH, {
      access: 'public',
    });

    if (!blob || blob.statusCode !== 200 || !blob.stream) {
      return attachDbEtag(defaultDb(), '');
    }

    const raw = await new Response(blob.stream).text();
    const parsed = JSON.parse(raw);

    return attachDbEtag(normalizeDb(parsed), blob.blob?.etag || '');
  } catch {
    return attachDbEtag(defaultDb(), '');
  }
}

function isWriteConflictError(error) {
  if (!error) {
    return false;
  }
  if (error.name === 'BlobPreconditionFailedError') {
    return true;
  }
  const message = String(error.message || '');
  return message.includes('precondition') || message.includes('ifMatch') || message.includes('ETag');
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function writeDb(db, expectedEtag = '') {
  const normalized = normalizeDb(db);
  const ifMatch =
    expectedEtag === null ? '' : normalizeEtag(expectedEtag || dbEtag(db));

  const uploaded = await put(DB_PATH, JSON.stringify(normalized), {
    access: 'public',
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: 'application/json',
    cacheControlMaxAge: 0,
    ...(ifMatch ? { ifMatch } : {}),
  });

  return attachDbEtag(normalizeDb(normalized), uploaded.etag || '');
}

async function mutateDb(mutator) {
  let conflictDetected = false;
  const retryWaits = [0, 300, 700, 1200, 1800, 2600, 3500, 4500, 6000, 8000];

  for (let attempt = 0; attempt < MAX_DB_WRITE_RETRIES; attempt += 1) {
    const db = await readDb();
    let value;

    try {
      value = await mutator(db);
    } catch (error) {
      if (error?.retryable && attempt < MAX_DB_WRITE_RETRIES - 1) {
        await sleep(retryWaits[Math.min(attempt + 1, retryWaits.length - 1)]);
        continue;
      }
      throw error;
    }

    try {
      const savedDb = await writeDb(db);
      return { db: savedDb, value };
    } catch (error) {
      if (isWriteConflictError(error)) {
        conflictDetected = true;
        await sleep(retryWaits[Math.min(attempt + 1, retryWaits.length - 1)]);
        continue;
      }
      throw error;
    }
  }

  if (conflictDetected) {
    const fallbackDb = await readDb();
    const fallbackValue = await mutator(fallbackDb);
    const savedDb = await writeDb(fallbackDb, null);
    return {
      db: savedDb,
      value: fallbackValue,
    };
  }

  throw new Error('データ更新に失敗しました。');
}

function safeName(name) {
  return String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') {
    throw new Error('画像データ形式が不正です。');
  }

  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('画像データ形式が不正です。');
  }

  const mimeType = match[1];
  const base64 = match[2];
  return {
    mimeType,
    buffer: Buffer.from(base64, 'base64'),
  };
}

async function uploadImage(prefix, tripId, file) {
  const { mimeType, buffer } = parseDataUrl(file.dataUrl || '');
  const extension = mimeType.split('/')[1] || 'jpg';
  const pathname = `${prefix}${tripId}/${Date.now()}-${crypto.randomUUID()}-${safeName(file.name || `image.${extension}`)}`;

  const uploaded = await put(pathname, buffer, {
    access: 'public',
    contentType: mimeType,
    addRandomSuffix: false,
    cacheControlMaxAge: 31536000,
  });

  return {
    path: uploaded.pathname,
    url: uploaded.url,
  };
}

async function removeBlobByPath(pathname) {
  if (!pathname) {
    return;
  }

  try {
    await del(pathname);
  } catch {
    // ignore if already removed
  }
}

async function createSessionForUser(user) {
  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      displayName: user.displayName,
      isGuest: Boolean(user.isGuest),
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
    },
    JWT_SECRET,
    { expiresIn: '30d' },
  );

  return {
    access_token: token,
    token_type: 'bearer',
    user: {
      id: user.id,
      email: user.email,
      user_metadata: {
        display_name: user.displayName,
        is_guest: Boolean(user.isGuest),
      },
    },
  };
}

async function verifyToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    return {
      id: payload.sub,
      email: payload.email,
      displayName: payload.displayName,
      isGuest: Boolean(payload.isGuest),
    };
  } catch {
    return null;
  }
}

async function getAuthUser(req, db) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return null;
  }

  const payloadUser = await verifyToken(token);
  if (payloadUser?.id) {
    return (
      db.users.find((user) => user.id === payloadUser.id) || {
        id: payloadUser.id,
        email: payloadUser.email || '',
        displayName: payloadUser.displayName || 'Traveler',
        isGuest: Boolean(payloadUser.isGuest),
        passwordHash: '',
        createdAt: '',
      }
    );
  }

  const clerkClaims = await verifyClerkSessionToken(token);
  if (!clerkClaims?.sub) {
    return null;
  }

  const localId = clerkLocalUserId(clerkClaims.sub);
  const existingUser =
    db.users.find((entry) => entry.id === localId) ||
    db.users.find((entry) => String(entry.clerkUserId || '') === String(clerkClaims.sub)) ||
    db.users.find((entry) => normalizeEmail(entry.email) === normalizeEmail(clerkClaims.email || ''));

  if (existingUser) {
    if (!existingUser.clerkUserId) {
      existingUser.clerkUserId = clerkClaims.sub;
      existingUser.updatedAt = nowIso();
    }
    return existingUser;
  }

  const clerkUser = await resolveClerkAuthUser(clerkClaims.sub);
  if (!clerkUser) {
    return null;
  }
  db.users.push(clerkUser);
  return clerkUser;
}

function requireAdminUser(user) {
  const email = normalizeEmail(user?.email);
  if (!email || !ADMIN_EMAIL_SET.has(email)) {
    const error = new Error('開発者権限が必要です。');
    error.statusCode = 403;
    throw error;
  }
}

function tripMember(db, tripId, userId) {
  return db.tripMembers.find((member) => member.tripId === tripId && member.userId === userId) || null;
}

function hasTripAccess(db, tripId, userId) {
  if (tripMember(db, tripId, userId)) {
    return true;
  }
  return db.trips.some((trip) => trip.id === tripId && trip.created_by === userId);
}

async function readDbForTripAccess(tripId, userId) {
  const waits = [0, 300, 800, 1500, 2500];
  let latestDb = await readDb();

  for (const waitMs of waits) {
    if (hasTripAccess(latestDb, tripId, userId)) {
      return latestDb;
    }
    if (waitMs > 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, waitMs);
      });
    }
    latestDb = await readDb();
  }

  return latestDb;
}

async function findUserByEmailWithRetry(email) {
  const waits = [0, 250, 600, 1200, 2000];
  let latestDb = await readDb();
  const normalized = normalizeEmail(email);

  for (const waitMs of waits) {
    const user = latestDb.users.find((entry) => normalizeEmail(entry.email) === normalized);
    if (user) {
      return { db: latestDb, user };
    }
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    latestDb = await readDb();
  }

  return { db: latestDb, user: null };
}

async function findUserByEmailAndDisplayNameWithRetry(email, displayName) {
  const waits = [0, 250, 600, 1200, 2000];
  let latestDb = await readDb();
  const normalizedEmail = normalizeEmail(email);
  const normalizedNameKey = displayNameKey(displayName);

  for (const waitMs of waits) {
    const user = latestDb.users.find(
      (entry) =>
        normalizeEmail(entry.email) === normalizedEmail &&
        displayNameKey(entry.displayName) === normalizedNameKey,
    );
    if (user) {
      return { db: latestDb, user };
    }
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    latestDb = await readDb();
  }

  return { db: latestDb, user: null };
}

function requireTripMember(db, tripId, userId) {
  const member = tripMember(db, tripId, userId);
  if (member) {
    return member;
  }

  const trip = db.trips.find((entry) => entry.id === tripId);
  if (trip?.created_by === userId) {
    return {
      tripId,
      userId,
      role: 'owner',
    };
  }

  throw new Error('この旅行へのアクセス権がありません。');
}

function requireTripMemberRetryable(db, tripId, userId) {
  const member = tripMember(db, tripId, userId);
  if (member) {
    return member;
  }

  const trip = db.trips.find((entry) => entry.id === tripId);
  if (!trip) {
    // Blob反映遅延でtripが見えないケースを許容する
    return {
      tripId,
      userId,
      role: 'owner',
    };
  }

  if (trip.created_by === userId) {
    return {
      tripId,
      userId,
      role: 'owner',
    };
  }

  const error = new Error('この旅行へのアクセス権がありません。');
  error.statusCode = 403;
  throw error;
}

function memberNameMap(db, tripId) {
  const members = db.tripMembers.filter((member) => member.tripId === tripId);
  const users = Object.fromEntries(db.users.map((user) => [user.id, user]));
  const map = {};
  for (const member of members) {
    map[member.userId] = users[member.userId]?.displayName || 'Traveler';
  }
  return map;
}

function buildWorkspace(db, tripId) {
  const trip = db.trips.find((entry) => entry.id === tripId);
  if (!trip) {
    throw new Error('旅行が見つかりません。');
  }

  const usersById = Object.fromEntries(db.users.map((user) => [user.id, user]));

  const members = db.tripMembers
    .filter((row) => row.tripId === tripId)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
    .map((row) => ({
      trip_id: row.tripId,
      user_id: row.userId,
      role: row.role,
      joined_at: row.joinedAt,
      name: usersById[row.userId]?.displayName || 'Traveler',
    }));

  const itineraryItems = db.itineraryItems
    .filter((row) => row.tripId === tripId)
    .sort((a, b) => {
      const aOrder = Number.isFinite(a.order_index) ? a.order_index : Number.MAX_SAFE_INTEGER;
      const bOrder = Number.isFinite(b.order_index) ? b.order_index : Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }

      return `${a.date || ''}${a.start_time || ''}${a.created_at}`.localeCompare(
        `${b.date || ''}${b.start_time || ''}${b.created_at}`,
      );
    });

  const guideSections = db.guideSections
    .filter((row) => row.tripId === tripId)
    .sort((a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at));

  const memories = db.memories
    .filter((row) => row.tripId === tripId)
    .sort((a, b) => `${a.date || ''}${a.created_at}`.localeCompare(`${b.date || ''}${b.created_at}`));

  return {
    trip: sanitizeTrip(trip),
    members,
    itineraryItems,
    guideSections,
    memories,
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/public-config', (_req, res) => {
  res.json({
    authProvider: AUTH_PROVIDER,
    clerk: {
      enabled: Boolean(CLERK_SECRET_KEY),
      publishableKey: CLERK_PUBLISHABLE_KEY || '',
    },
    posthog: {
      enabled: Boolean(POSTHOG_PUBLIC_KEY),
      key: POSTHOG_PUBLIC_KEY || '',
      host: POSTHOG_HOST,
    },
    services: {
      resend: Boolean(resendClient && EMAIL_FROM),
      redis: Boolean(redisClient),
      pinecone: semanticSearchEnabled(),
    },
  });
});

app.post('/api/auth/clerk/sync', async (req, res) => {
  try {
    if (!CLERK_SECRET_KEY) {
      return res.status(400).json({ error: 'Clerk が未設定です。' });
    }

    const { value: syncedUser } = await mutateDb(async (db) => {
      const user = await getAuthUser(req, db);
      if (!user) {
        const error = new Error('認証が必要です。');
        error.statusCode = 401;
        throw error;
      }

      const normalizedDisplayName = normalizeDisplayName(req.body?.displayName || '');
      if (normalizedDisplayName) {
        user.displayName = normalizedDisplayName;
        user.updatedAt = nowIso();
      }

      appendAuthEvent(db, {
        event: 'clerk-sync',
        success: true,
        email: user.email,
        userId: user.id,
        displayName: user.displayName,
        ip: clientIp(req),
        userAgent: cleanUserAgent(req),
      });

      return user;
    });

    const session = await createSessionForUser(syncedUser);
    res.json({
      data: {
        user: session.user,
        session,
      },
      error: null,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Clerk同期に失敗しました。' });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    await enforceRateLimit(req, 'auth-signup', RATE_LIMIT_MAX_SIGNUP);

    const { email, password, displayName } = req.body || {};
    if (!email || !password || !displayName) {
      return res.status(400).json({ error: 'メール・パスワード・表示名は必須です。' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'パスワードは8文字以上にしてください。' });
    }

    const normalizedEmail = normalizeEmail(email);
    const normalizedDisplayName = normalizeDisplayName(displayName);
    const passwordHash = await bcrypt.hash(password, 10);

    const { value: user } = await mutateDb((db) => {
      if (db.users.some((entry) => normalizeEmail(entry.email) === normalizedEmail)) {
        const error = new Error('登録に失敗しました。入力内容を確認してください。');
        error.statusCode = 409;
        throw error;
      }

      const created = {
        id: randomId('user'),
        email: normalizedEmail,
        passwordHash,
        displayName: normalizedDisplayName,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        passwordUpdatedAt: nowIso(),
      };

      db.users.push(created);
      appendAuthEvent(db, {
        event: 'signup',
        success: true,
        email: created.email,
        userId: created.id,
        displayName: created.displayName,
        ip: clientIp(req),
        userAgent: cleanUserAgent(req),
      });
      return created;
    });

    const session = await createSessionForUser(user);
    const passwordSyncToken = createPasswordSyncToken(user, password);

    res.status(201).json({
      data: {
        user: session.user,
        session,
        passwordSyncToken,
      },
      error: null,
    });
  } catch (err) {
    if (err.retryAfterSeconds) {
      res.set('Retry-After', String(err.retryAfterSeconds));
    }
    res.status(err.statusCode || 500).json({ error: err.message || 'サインアップに失敗しました。' });
  }
});

app.post('/api/auth/guest', async (req, res) => {
  try {
    const requestedName = normalizeDisplayName(req.body?.displayName);
    const displayName = requestedName || `Traveler-${Math.random().toString(36).slice(2, 6)}`;

    const { value: user } = await mutateDb(async (db) => {
      let email = '';
      do {
        email = `guest_${crypto.randomUUID().replace(/-/g, '')}@guest.local`;
      } while (db.users.some((entry) => normalizeEmail(entry.email) === normalizeEmail(email)));

      const randomPassword = `${crypto.randomUUID()}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const passwordHash = await bcrypt.hash(randomPassword, 10);
      const createdAt = nowIso();

      const created = {
        id: randomId('user'),
        email,
        passwordHash,
        displayName,
        isGuest: true,
        createdAt,
        updatedAt: createdAt,
        passwordUpdatedAt: createdAt,
      };

      db.users.push(created);
      appendAuthEvent(db, {
        event: 'guest-signup',
        success: true,
        email: created.email,
        userId: created.id,
        displayName: created.displayName,
        ip: clientIp(req),
        userAgent: cleanUserAgent(req),
      });
      return created;
    });

    const session = await createSessionForUser(user);

    res.status(201).json({
      data: {
        user: session.user,
        session,
      },
      error: null,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'ゲスト開始に失敗しました。' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    await enforceRateLimit(req, 'auth-login', RATE_LIMIT_MAX_LOGIN);

    const { email, password } = req.body || {};
    const passwordSyncToken = String(req.body?.passwordSyncToken || '').trim();
    if (!email || !password) {
      return res.status(400).json({ error: 'メールとパスワードは必須です。' });
    }

    const normalizedEmail = normalizeEmail(email);
    const syncPayload = passwordSyncToken ? verifyPasswordSyncToken(passwordSyncToken) : null;
    if (syncPayload && syncPayload.email === normalizedEmail) {
      const matches = verifyPasswordSyncProof(syncPayload.email, password, syncPayload.proof);
      if (!matches) {
        await persistAuthEvent(req, {
          event: 'login',
          success: false,
          email: normalizedEmail,
          reason: 'invalid-password-sync-proof',
        });
        return res.status(401).json({ error: 'メールまたはパスワードが正しくありません。' });
      }

      const db = await readDb();
      const syncedUser =
        db.users.find((entry) => entry.id === syncPayload.id) ||
        db.users.find((entry) => normalizeEmail(entry.email) === normalizedEmail) || {
          id: syncPayload.id,
          email: syncPayload.email,
          displayName: syncPayload.displayName || 'Traveler',
        };

      const session = await createSessionForUser(syncedUser);
      await persistAuthEvent(req, {
        event: 'login',
        success: true,
        email: syncedUser.email,
        userId: syncedUser.id,
        displayName: syncedUser.displayName,
        reason: 'password-sync-token',
      });
      return res.json({
        data: {
          user: session.user,
          session,
        },
        error: null,
      });
    }

    const { db } = await findUserByEmailWithRetry(normalizedEmail);
    const candidates = db.users.filter((entry) => normalizeEmail(entry.email) === normalizedEmail);
    if (candidates.length === 0) {
      await persistAuthEvent(req, {
        event: 'login',
        success: false,
        email: normalizedEmail,
        reason: 'user-not-found',
      });
      return res.status(401).json({ error: 'メールまたはパスワードが正しくありません。' });
    }

    const preferred = [...candidates].sort((a, b) => {
      const aScore = String(a.passwordUpdatedAt || a.updatedAt || a.createdAt || '');
      const bScore = String(b.passwordUpdatedAt || b.updatedAt || b.createdAt || '');
      return bScore.localeCompare(aScore);
    })[0];

    const matched = await bcrypt.compare(password, preferred.passwordHash);

    if (!matched) {
      await persistAuthEvent(req, {
        event: 'login',
        success: false,
        email: normalizedEmail,
        userId: preferred.id,
        displayName: preferred.displayName,
        reason: 'invalid-password',
      });
      return res.status(401).json({ error: 'メールまたはパスワードが正しくありません。' });
    }

    const session = await createSessionForUser(preferred);
    await persistAuthEvent(req, {
      event: 'login',
      success: true,
      email: preferred.email,
      userId: preferred.id,
      displayName: preferred.displayName,
    });
    res.json({
      data: {
        user: session.user,
        session,
      },
      error: null,
    });
  } catch (err) {
    if (err.retryAfterSeconds) {
      res.set('Retry-After', String(err.retryAfterSeconds));
    }
    res.status(err.statusCode || 500).json({ error: err.message || 'ログインに失敗しました。' });
  }
});

app.get('/api/auth/session', async (req, res) => {
  const db = await readDb();
  const user = await getAuthUser(req, db);
  if (!user) {
    return res.json({ data: { session: null }, error: null });
  }

  const session = await createSessionForUser(user);
  return res.json({ data: { session }, error: null });
});

app.post('/api/auth/profile', async (req, res) => {
  try {
    const displayNameRaw = req.body?.displayName;
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    const hasDisplayName = Object.prototype.hasOwnProperty.call(req.body || {}, 'displayName');
    const hasNewPassword = newPassword.length > 0;

    if (!hasDisplayName && !hasNewPassword) {
      return res.status(400).json({ error: '更新内容がありません。' });
    }

    const normalizedDisplayName = String(displayNameRaw || '').trim();
    if (hasDisplayName && !normalizedDisplayName) {
      return res.status(400).json({ error: '表示名は空にできません。' });
    }

    if (hasNewPassword && newPassword.length < 8) {
      return res.status(400).json({ error: '新しいパスワードは8文字以上にしてください。' });
    }

    const { value: updatedUser } = await mutateDb(async (db) => {
      const authUser = await getAuthUser(req, db);
      if (!authUser) {
        const error = new Error('認証が必要です。');
        error.statusCode = 401;
        throw error;
      }

      const user = db.users.find((entry) => entry.id === authUser.id);
      if (!user) {
        const error = new Error('ユーザーが見つかりません。');
        error.statusCode = 404;
        error.retryable = true;
        throw error;
      }

      const sameEmailUsers = db.users.filter(
        (entry) => normalizeEmail(entry.email) === normalizeEmail(user.email),
      );

      if (hasDisplayName) {
        for (const entry of sameEmailUsers) {
          entry.displayName = normalizedDisplayName;
          entry.updatedAt = nowIso();
        }
      }

      if (hasNewPassword) {
        if (!currentPassword) {
          const error = new Error('パスワード変更には現在のパスワードが必要です。');
          error.statusCode = 400;
          throw error;
        }
        const verified = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!verified) {
          const error = new Error('現在のパスワードが正しくありません。');
          error.statusCode = 401;
          throw error;
        }
        const nextHash = await bcrypt.hash(newPassword, 10);
        for (const entry of sameEmailUsers) {
          entry.passwordHash = nextHash;
          entry.updatedAt = nowIso();
          entry.passwordUpdatedAt = nowIso();
        }
      }

      return sameEmailUsers[0] || user;
    });

    const session = await createSessionForUser(updatedUser);
    const passwordSyncToken = hasNewPassword ? createPasswordSyncToken(updatedUser, newPassword) : '';
    res.json({
      data: {
        user: session.user,
        session,
        passwordSyncToken: passwordSyncToken || null,
      },
      error: null,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'プロフィール更新に失敗しました。' });
  }
});

app.post('/api/auth/password/request', async (req, res) => {
  try {
    await enforceRateLimit(req, 'auth-password-request', RATE_LIMIT_MAX_PASSWORD_RESET);

    const email = normalizeEmail(req.body?.email);
    const providedDisplayName = normalizeDisplayName(req.body?.displayName);
    if (!email) {
      return res.status(400).json({ error: 'メールアドレスは必須です。' });
    }

    const canSendEmail = Boolean(resendClient && EMAIL_FROM);
    let resetPayload = null;
    if (!canSendEmail) {
      if (providedDisplayName) {
        const { user } = await findUserByEmailAndDisplayNameWithRetry(email, providedDisplayName);
        if (user) {
          const token = createPasswordResetToken(user, { manualDisplayName: user.displayName || providedDisplayName });
          resetPayload = {
            email: user.email,
            token,
            expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000).toISOString(),
          };
        }
      }
    } else {
      const { user } = await findUserByEmailWithRetry(email);
      if (user) {
        const token = createPasswordResetToken(user);
        resetPayload = {
          email: user.email,
          token,
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000).toISOString(),
        };
      }
    }

    if (resetPayload?.token) {
      const resetUrl = buildPasswordResetUrl(req, resetPayload.token);
      let sent = false;

      if (canSendEmail) {
        try {
          sent = await sendPasswordResetEmail(resetPayload.email, resetUrl);
        } catch (mailError) {
          console.error('[password-reset-email] failed', mailError);
        }
      }

      if (!sent || SHOW_RESET_TOKEN_IN_LOGS) {
        console.log(
          `[password-reset] email=${email} token=${resetPayload.token} expiresAt=${resetPayload.expiresAt} url=${resetUrl}`,
        );
      }

      if (!sent) {
        return res.json({
          ok: true,
          delivery: 'manual-code',
          resetToken: resetPayload.token,
          message:
            'メール送信が未設定のため、この画面で再設定コードを発行しました。コードを入力してパスワードを更新してください。',
        });
      }
    }

    res.json({
      ok: true,
      delivery: canSendEmail ? 'email' : 'none',
      resetToken: null,
      message: canSendEmail
        ? '登録済みメールの場合はパスワード再設定メールを送信しました。届かない場合は迷惑メールフォルダも確認してください。'
        : '入力内容に一致するアカウントがある場合のみ、再設定コードを発行します。',
    });
  } catch (err) {
    if (err.retryAfterSeconds) {
      res.set('Retry-After', String(err.retryAfterSeconds));
    }
    res.status(err.statusCode || 500).json({ error: err.message || '再設定メールの送信に失敗しました。' });
  }
});

app.post('/api/auth/password/reset', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const nextPassword = String(req.body?.newPassword || '');

    if (!token || !nextPassword) {
      return res.status(400).json({ error: '再設定コードと新しいパスワードは必須です。' });
    }
    if (nextPassword.length < 8) {
      return res.status(400).json({ error: 'パスワードは8文字以上にしてください。' });
    }

    const nextHash = await bcrypt.hash(nextPassword, 10);

    const payload = verifyPasswordResetToken(token);
    if (!payload?.id) {
      return res.status(400).json({ error: '再設定コードが無効か、期限切れです。' });
    }

    const { value: resetUser } = await mutateDb((db) => {
      const targets = db.users.filter(
        (entry) => {
          if (payload.id && entry.id === payload.id) {
            return true;
          }

          if (normalizeEmail(entry.email) !== normalizeEmail(payload.email)) {
            return false;
          }

          if (payload.manualDisplayName) {
            return displayNameKey(entry.displayName) === displayNameKey(payload.manualDisplayName);
          }

          return true;
        },
      );
      if (targets.length === 0) {
        const error = new Error('再設定対象が見つかりませんでした。メールアドレス/表示名を確認して再設定コードを再発行してください。');
        error.statusCode = 400;
        error.retryable = true;
        throw error;
      }

      for (const target of targets) {
        target.passwordHash = nextHash;
        target.updatedAt = nowIso();
        target.passwordUpdatedAt = nowIso();
      }

      return targets[0];
    });

    const passwordSyncToken = createPasswordSyncToken(resetUser, nextPassword);

    res.json({
      ok: true,
      passwordSyncToken: passwordSyncToken || null,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'パスワード再設定に失敗しました。' });
  }
});

app.post('/api/admin/email-status', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return res.status(400).json({ error: 'メールアドレスは必須です。' });
    }

    const db = await readDb();
    const user = await getAuthUser(req, db);
    if (!user) {
      return res.status(401).json({ error: '認証が必要です。' });
    }
    requireAdminUser(user);

    const matched = db.users.find((entry) => normalizeEmail(entry.email) === email);
    res.json({
      exists: Boolean(matched),
      createdAt: matched?.createdAt || null,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'メール登録確認に失敗しました。' });
  }
});

app.get('/api/admin/registered-emails', async (req, res) => {
  try {
    const db = await readDb();
    const user = await getAuthUser(req, db);
    if (!user) {
      return res.status(401).json({ error: '認証が必要です。' });
    }
    requireAdminUser(user);

    const users = [...db.users]
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
      .map((entry) => ({
        id: entry.id,
        email: entry.email,
        displayName: entry.displayName || 'Traveler',
        createdAt: entry.createdAt || null,
      }));

    res.json({
      users,
      total: users.length,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || '登録メール一覧の取得に失敗しました。' });
  }
});

app.get('/api/admin/auth-events', async (req, res) => {
  try {
    const db = await readDb();
    const user = await getAuthUser(req, db);
    if (!user) {
      return res.status(401).json({ error: '認証が必要です。' });
    }
    requireAdminUser(user);

    const requestedLimit = Number(req.query?.limit || 120) || 120;
    const limit = Math.min(500, Math.max(20, requestedLimit));

    const events = [...(db.authEvents || [])]
      .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
      .slice(0, limit)
      .map((entry) => ({
        id: entry.id || '',
        at: entry.at || null,
        event: entry.event || 'login',
        success: Boolean(entry.success),
        email: entry.email || '',
        userId: entry.userId || '',
        displayName: entry.displayName || '',
        ip: entry.ip || '',
        userAgent: entry.userAgent || '',
        reason: entry.reason || '',
      }));

    res.json({
      events,
      total: (db.authEvents || []).length,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'ログイン履歴の取得に失敗しました。' });
  }
});

app.get('/api/trips', async (req, res) => {
  try {
    const db = await readDb();
    const user = await getAuthUser(req, db);
    if (!user) {
      return res.status(401).json({ error: '認証が必要です。' });
    }

    const myMemberships = db.tripMembers
      .filter((member) => member.userId === user.id)
      .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt));

    const trips = myMemberships
      .map((member) => {
        const trip = db.trips.find((entry) => entry.id === member.tripId);
        if (!trip) {
          return null;
        }
        return {
          ...sanitizeTrip(trip),
          role: member.role,
        };
      })
      .filter(Boolean);

    res.json({ trips });
  } catch (err) {
    res.status(500).json({ error: err.message || '旅行一覧の取得に失敗しました。' });
  }
});

app.post('/api/trips', async (req, res) => {
  try {
    const { name, destination, startDate, endDate, theme, passphrase } = req.body || {};
    if (!name || !destination) {
      return res.status(400).json({ error: '旅行名と目的地は必須です。' });
    }

    const normalizedPassphrase = String(passphrase || '').trim();
    if (normalizedPassphrase && normalizedPassphrase.length < 4) {
      return res.status(400).json({ error: '合言葉は4文字以上で設定してください。' });
    }

    const passphraseHash = normalizedPassphrase
      ? await bcrypt.hash(normalizedPassphrase, 10)
      : '';

    const { value: trip } = await mutateDb(async (db) => {
      const user = await getAuthUser(req, db);
      if (!user) {
        const error = new Error('認証が必要です。');
        error.statusCode = 401;
        throw error;
      }

      let code = inviteCode();
      while (db.trips.some((entry) => entry.code === code)) {
        code = inviteCode();
      }

      const createdAt = nowIso();
      const createdTrip = {
        id: randomId('trip'),
        code,
        name,
        destination,
        edit_passphrase_hash: passphraseHash,
        start_date: startDate || '',
        end_date: endDate || '',
        created_by: user.id,
        created_at: createdAt,
        cover_title: name,
        cover_subtitle: destination,
        cover_image_path: '',
        cover_image_url: '',
        theme: {
          primaryColor: '#0b6fa4',
          accentColor: '#ff7a3d',
          backgroundStyle: 'sunrise',
          fontStyle: 'mplus',
          stampText: '足袋navi',
          ...(theme || {}),
        },
      };

      db.trips.push(createdTrip);
      db.tripMembers.push({
        tripId: createdTrip.id,
        userId: user.id,
        role: 'owner',
        joinedAt: createdAt,
      });

      db.guideSections.push(
        {
          id: randomId('guide'),
          tripId: createdTrip.id,
          title: '旅の概要',
          content: `${destination} への旅行計画です。集合時間や移動手段をここにまとめましょう。`,
          order_index: 1,
          style: {
            variant: 'highlight',
            emoji: '🗺️',
            details: defaultOverviewDetails(),
          },
          created_at: createdAt,
          updated_at: createdAt,
        },
        {
          id: randomId('guide'),
          tripId: createdTrip.id,
          title: '持ち物チェック',
          content: '- パスポート / 身分証\n- 充電器\n- 保険証\n- 常備薬',
          order_index: 2,
          style: normalizeGuideStyleInput({ variant: 'plain', emoji: '🎒' }),
          created_at: createdAt,
          updated_at: createdAt,
        },
        {
          id: randomId('guide'),
          tripId: createdTrip.id,
          title: '緊急連絡先',
          content: '家族・宿泊先・保険会社の連絡先を記載。',
          order_index: 3,
          style: normalizeGuideStyleInput({ variant: 'note', emoji: '☎️' }),
          created_at: createdAt,
          updated_at: createdAt,
        },
      );

      return createdTrip;
    });

    res.status(201).json({ trip: sanitizeTrip(trip) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || '旅行作成に失敗しました。' });
  }
});

app.post('/api/trips/join', async (req, res) => {
  try {
    const { code, passphrase } = req.body || {};
    if (!code) {
      return res.status(400).json({ error: '招待コードは必須です。' });
    }

    const normalizedCode = String(code).trim().toUpperCase();
    const normalizedPassphrase = String(passphrase || '').trim();
    const { value: trip } = await mutateDb(async (db) => {
      const user = await getAuthUser(req, db);
      if (!user) {
        const error = new Error('認証が必要です。');
        error.statusCode = 401;
        throw error;
      }

      const foundTrip = db.trips.find((entry) => entry.code === normalizedCode);
      if (!foundTrip) {
        const error = new Error('招待コードに一致する旅行が見つかりません。');
        error.statusCode = 404;
        throw error;
      }

      if (foundTrip.edit_passphrase_hash) {
        if (!normalizedPassphrase) {
          const error = new Error('この旅行は合言葉が必要です。');
          error.statusCode = 403;
          throw error;
        }
        const matched = await bcrypt.compare(normalizedPassphrase, foundTrip.edit_passphrase_hash);
        if (!matched) {
          const error = new Error('合言葉が正しくありません。');
          error.statusCode = 403;
          throw error;
        }
      }

      if (!tripMember(db, foundTrip.id, user.id)) {
        db.tripMembers.push({
          tripId: foundTrip.id,
          userId: user.id,
          role: 'member',
          joinedAt: nowIso(),
        });
      }

      return foundTrip;
    });

    res.json({ trip: sanitizeTrip(trip) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || '旅行参加に失敗しました。' });
  }
});

app.post('/api/trips/:tripId/invite-email', async (req, res) => {
  try {
    if (!resendClient || !EMAIL_FROM) {
      return res.status(400).json({ error: 'Resend が未設定です。' });
    }

    const toEmail = normalizeEmail(req.body?.toEmail);
    const message = String(req.body?.message || '').trim();
    if (!toEmail) {
      return res.status(400).json({ error: '送信先メールアドレスは必須です。' });
    }

    const db = await readDb();
    const user = await getAuthUser(req, db);
    if (!user) {
      return res.status(401).json({ error: '認証が必要です。' });
    }

    requireTripMember(db, req.params.tripId, user.id);

    const trip = db.trips.find((entry) => entry.id === req.params.tripId);
    if (!trip) {
      return res.status(404).json({ error: '旅行が見つかりません。' });
    }

    const base = inferAppBaseUrl(req).replace(/\/+$/, '');
    const inviteUrl = `${base}/?invite=${encodeURIComponent(trip.code)}`;
    const safeName = normalizeDisplayName(user.displayName || 'メンバー');
    const safeTripName = escapeHtml(trip.name || '旅のしおり');
    const safeNameText = escapeHtml(safeName);
    const optionalMessage = message ? `<p style="margin:0 0 12px;">${escapeHtml(message)}</p>` : '';

    await sendTransactionalEmail({
      toEmail,
      subject: `【足袋navi】${trip.name} への招待`,
      html: `
        <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; line-height:1.7; color:#1f2937;">
          <h2 style="margin:0 0 10px;">旅行しおりの招待が届きました</h2>
          <p style="margin:0 0 12px;">${safeNameText} さんが <strong>${safeTripName}</strong> に招待しています。</p>
          ${optionalMessage}
          <p style="margin:0 0 12px;"><a href="${inviteUrl}" target="_blank" rel="noreferrer">招待リンクを開く</a></p>
          <p style="margin:0;">招待コード: <strong>${escapeHtml(trip.code)}</strong></p>
        </div>
      `,
      text:
        `${safeName} さんから旅行「${trip.name}」への招待です。\n` +
        `招待リンク: ${inviteUrl}\n` +
        `招待コード: ${trip.code}\n` +
        (message ? `メッセージ: ${message}\n` : ''),
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || '招待メール送信に失敗しました。' });
  }
});

app.get('/api/trips/:tripId/workspace', async (req, res) => {
  try {
    const initialDb = await readDb();
    const user = await getAuthUser(req, initialDb);
    if (!user) {
      return res.status(401).json({ error: '認証が必要です。' });
    }

    const db = await readDbForTripAccess(req.params.tripId, user.id);
    requireTripMember(db, req.params.tripId, user.id);

    const workspace = buildWorkspace(db, req.params.tripId);
    res.json(workspace);
  } catch (err) {
    const code = err.message.includes('アクセス権') ? 403 : err.message.includes('見つかりません') ? 404 : 500;
    res.status(code).json({ error: err.message || '旅行データの取得に失敗しました。' });
  }
});

app.post('/api/trips/:tripId/itinerary', async (req, res) => {
  try {
    const { date, startTime, endTime, title, place, notes, icon, linkUrl } = req.body || {};
    if (!title) {
      return res.status(400).json({ error: '予定タイトルは必須です。' });
    }

    await mutateDb(async (db) => {
      const user = await getAuthUser(req, db);
      if (!user) {
        const error = new Error('認証が必要です。');
        error.statusCode = 401;
        throw error;
      }

      requireTripMemberRetryable(db, req.params.tripId, user.id);

      const maxOrder = db.itineraryItems
        .filter((entry) => entry.tripId === req.params.tripId)
        .reduce((acc, entry) => Math.max(acc, entry.order_index || 0), 0);

      const timestamp = nowIso();
      db.itineraryItems.push({
        id: randomId('item'),
        tripId: req.params.tripId,
        order_index: maxOrder + 1,
        date: date || '',
        start_time: startTime || '',
        end_time: endTime || '',
        title,
        place: place || '',
        link_url: normalizeOptionalUrl(linkUrl),
        icon: normalizeItineraryIcon(icon),
        notes: notes || '',
        owner_user_id: user.id,
        created_at: timestamp,
        updated_at: timestamp,
      });
    });

    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || '予定追加に失敗しました。' });
  }
});

app.put('/api/itinerary/:itemId', async (req, res) => {
  try {
    await mutateDb(async (db) => {
      const user = await getAuthUser(req, db);
      if (!user) {
        const error = new Error('認証が必要です。');
        error.statusCode = 401;
        throw error;
      }

      const item = db.itineraryItems.find((entry) => entry.id === req.params.itemId);
      if (!item) {
        const error = new Error('対象の予定が見つかりません。');
        error.statusCode = 404;
        throw error;
      }

      requireTripMember(db, item.tripId, user.id);

      item.date = req.body?.date ?? item.date;
      item.start_time = req.body?.startTime ?? item.start_time;
      item.end_time = req.body?.endTime ?? item.end_time;
      item.title = req.body?.title ?? item.title;
      item.place = req.body?.place ?? item.place;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'linkUrl')) {
        item.link_url = normalizeOptionalUrl(req.body?.linkUrl);
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'icon')) {
        item.icon = normalizeItineraryIcon(req.body?.icon);
      }
      item.notes = req.body?.notes ?? item.notes;
      item.updated_at = nowIso();
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || '予定更新に失敗しました。' });
  }
});

app.post('/api/trips/:tripId/itinerary/reorder', async (req, res) => {
  try {
    const requestedOrder = Array.isArray(req.body?.itemIds)
      ? req.body.itemIds.map((entry) => String(entry || '').trim()).filter(Boolean)
      : [];
    if (requestedOrder.length === 0) {
      return res.status(400).json({ error: '並び替え対象が空です。' });
    }

    await mutateDb(async (db) => {
      const user = await getAuthUser(req, db);
      if (!user) {
        const error = new Error('認証が必要です。');
        error.statusCode = 401;
        throw error;
      }

      requireTripMemberRetryable(db, req.params.tripId, user.id);

      const tripItems = db.itineraryItems.filter((entry) => entry.tripId === req.params.tripId);
      if (tripItems.length === 0) {
        const error = new Error('並び替え対象の予定がありません。');
        error.statusCode = 404;
        throw error;
      }

      const itemById = new Map(tripItems.map((entry) => [entry.id, entry]));
      const normalizedOrder = requestedOrder.filter((itemId) => itemById.has(itemId));
      if (normalizedOrder.length !== tripItems.length) {
        const error = new Error('並び替えデータが不正です。最新状態で再読み込みしてください。');
        error.statusCode = 400;
        throw error;
      }

      const timestamp = nowIso();
      normalizedOrder.forEach((itemId, index) => {
        const item = itemById.get(itemId);
        if (!item) {
          return;
        }
        item.order_index = index + 1;
        item.updated_at = timestamp;
      });
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || '予定の並び替えに失敗しました。' });
  }
});

app.delete('/api/itinerary/:itemId', async (req, res) => {
  try {
    await mutateDb(async (db) => {
      const user = await getAuthUser(req, db);
      if (!user) {
        const error = new Error('認証が必要です。');
        error.statusCode = 401;
        throw error;
      }

      const item = db.itineraryItems.find((entry) => entry.id === req.params.itemId);
      if (!item) {
        const error = new Error('対象の予定が見つかりません。');
        error.statusCode = 404;
        throw error;
      }

      requireTripMember(db, item.tripId, user.id);
      db.itineraryItems = db.itineraryItems.filter((entry) => entry.id !== req.params.itemId);
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || '予定削除に失敗しました。' });
  }
});

app.post('/api/trips/:tripId/guide', async (req, res) => {
  try {
    const { title, content, variant, emoji, details } = req.body || {};
    if (!title) {
      return res.status(400).json({ error: '見出しは必須です。' });
    }

    await mutateDb(async (db) => {
      const user = await getAuthUser(req, db);
      if (!user) {
        const error = new Error('認証が必要です。');
        error.statusCode = 401;
        throw error;
      }

      requireTripMemberRetryable(db, req.params.tripId, user.id);

      const maxOrder = db.guideSections
        .filter((entry) => entry.tripId === req.params.tripId)
        .reduce((acc, entry) => Math.max(acc, entry.order_index || 0), 0);

      const timestamp = nowIso();
      db.guideSections.push({
        id: randomId('guide'),
        tripId: req.params.tripId,
        title,
        content: content || '',
        order_index: maxOrder + 1,
        style: normalizeGuideStyleInput({
          variant: variant || 'plain',
          emoji: emoji || '📍',
          details: Array.isArray(details) ? details : [],
        }),
        created_at: timestamp,
        updated_at: timestamp,
      });
    });

    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'しおり追加に失敗しました。' });
  }
});

app.put('/api/guide/:sectionId', async (req, res) => {
  try {
    await mutateDb(async (db) => {
      const user = await getAuthUser(req, db);
      if (!user) {
        const error = new Error('認証が必要です。');
        error.statusCode = 401;
        throw error;
      }

      const section = db.guideSections.find((entry) => entry.id === req.params.sectionId);
      if (!section) {
        const error = new Error('対象のしおりが見つかりません。');
        error.statusCode = 404;
        throw error;
      }

      requireTripMember(db, section.tripId, user.id);

      section.title = req.body?.title ?? section.title;
      section.content = req.body?.content ?? section.content;
      section.style = normalizeGuideStyleInput({
        ...section.style,
        ...(req.body?.style || {}),
      });
      section.updated_at = nowIso();
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'しおり更新に失敗しました。' });
  }
});

app.delete('/api/guide/:sectionId', async (req, res) => {
  try {
    await mutateDb(async (db) => {
      const user = await getAuthUser(req, db);
      if (!user) {
        const error = new Error('認証が必要です。');
        error.statusCode = 401;
        throw error;
      }

      const section = db.guideSections.find((entry) => entry.id === req.params.sectionId);
      if (!section) {
        const error = new Error('対象のしおりが見つかりません。');
        error.statusCode = 404;
        throw error;
      }

      requireTripMember(db, section.tripId, user.id);
      db.guideSections = db.guideSections.filter((entry) => entry.id !== req.params.sectionId);
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'しおり削除に失敗しました。' });
  }
});

app.post('/api/trips/:tripId/memories', async (req, res) => {
  try {
    const { date, title, content, files } = req.body || {};
    if (!title || !content) {
      return res.status(400).json({ error: 'タイトルと本文は必須です。' });
    }

    const normalizedFiles = Array.isArray(files) ? files.slice(0, 3) : [];

    const imagePaths = [];
    const imageUrls = [];
    for (const file of normalizedFiles) {
      const uploaded = await uploadImage(MEMORY_PREFIX, req.params.tripId, file);
      imagePaths.push(uploaded.path);
      imageUrls.push(uploaded.url);
    }

    const { value: createdMemory } = await mutateDb(async (db) => {
      const user = await getAuthUser(req, db);
      if (!user) {
        const error = new Error('認証が必要です。');
        error.statusCode = 401;
        throw error;
      }

      requireTripMemberRetryable(db, req.params.tripId, user.id);

      const timestamp = nowIso();
      const created = {
        id: randomId('memory'),
        tripId: req.params.tripId,
        date: date || '',
        title,
        content,
        image_paths: imagePaths,
        image_urls: imageUrls,
        author_user_id: user.id,
        created_at: timestamp,
        updated_at: timestamp,
      };
      db.memories.push(created);
      return created;
    });

    try {
      await upsertMemoryVector(createdMemory);
    } catch (vectorError) {
      console.error('[pinecone] failed to upsert memory vector', vectorError);
    }

    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || '思い出追加に失敗しました。' });
  }
});

app.put('/api/memories/:memoryId', async (req, res) => {
  try {
    const { value: updatedMemory } = await mutateDb(async (db) => {
      const user = await getAuthUser(req, db);
      if (!user) {
        const error = new Error('認証が必要です。');
        error.statusCode = 401;
        throw error;
      }

      const memory = db.memories.find((entry) => entry.id === req.params.memoryId);
      if (!memory) {
        const error = new Error('対象の思い出が見つかりません。');
        error.statusCode = 404;
        throw error;
      }

      requireTripMember(db, memory.tripId, user.id);

      memory.date = req.body?.date ?? memory.date;
      memory.title = req.body?.title ?? memory.title;
      memory.content = req.body?.content ?? memory.content;
      memory.updated_at = nowIso();
      return memory;
    });

    try {
      await upsertMemoryVector(updatedMemory);
    } catch (vectorError) {
      console.error('[pinecone] failed to update memory vector', vectorError);
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || '思い出更新に失敗しました。' });
  }
});

app.delete('/api/memories/:memoryId', async (req, res) => {
  try {
    const { value: removedPayload } = await mutateDb(async (db) => {
      const user = await getAuthUser(req, db);
      if (!user) {
        const error = new Error('認証が必要です。');
        error.statusCode = 401;
        throw error;
      }

      const memory = db.memories.find((entry) => entry.id === req.params.memoryId);
      if (!memory) {
        const error = new Error('対象の思い出が見つかりません。');
        error.statusCode = 404;
        throw error;
      }

      requireTripMember(db, memory.tripId, user.id);
      db.memories = db.memories.filter((entry) => entry.id !== req.params.memoryId);
      return {
        imagePaths: [...(memory.image_paths || [])],
        memoryId: memory.id,
      };
    });

    for (const path of removedPayload?.imagePaths || []) {
      await removeBlobByPath(path);
    }

    try {
      await removeMemoryVector(removedPayload?.memoryId);
    } catch (vectorError) {
      console.error('[pinecone] failed to remove memory vector', vectorError);
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || '思い出削除に失敗しました。' });
  }
});

app.post('/api/trips/:tripId/memories/similar', async (req, res) => {
  try {
    const db = await readDb();
    const user = await getAuthUser(req, db);
    if (!user) {
      return res.status(401).json({ error: '認証が必要です。' });
    }
    requireTripMember(db, req.params.tripId, user.id);

    const topK = Math.min(10, Math.max(1, Number(req.body?.topK || 5) || 5));
    const fromMemoryId = String(req.body?.memoryId || '').trim();
    const queryText = String(req.body?.query || '').trim();

    let seedText = queryText;
    if (!seedText && fromMemoryId) {
      const seedMemory = db.memories.find(
        (entry) => entry.id === fromMemoryId && String(entry.tripId) === String(req.params.tripId),
      );
      if (seedMemory) {
        seedText = memoryEmbeddingText(seedMemory);
      }
    }

    if (!seedText) {
      return res.status(400).json({ error: '検索文または memoryId を指定してください。' });
    }

    const memoriesInTrip = db.memories.filter((entry) => String(entry.tripId) === String(req.params.tripId));
    if (memoriesInTrip.length === 0) {
      return res.json({ results: [], source: semanticSearchEnabled() ? 'pinecone' : 'fallback' });
    }

    if (!semanticSearchEnabled()) {
      const keyword = seedText.toLowerCase();
      const fallback = memoriesInTrip
        .map((entry) => {
          const blob = `${entry.title || ''}\n${entry.content || ''}\n${entry.date || ''}`.toLowerCase();
          const score = keyword
            .split(/\s+/)
            .filter(Boolean)
            .reduce((acc, token) => acc + (blob.includes(token) ? 1 : 0), 0);
          return { entry, score };
        })
        .sort((a, b) => b.score - a.score)
        .filter((row) => row.score > 0 && row.entry.id !== fromMemoryId)
        .slice(0, topK)
        .map((row) => ({
          id: row.entry.id,
          title: row.entry.title,
          date: row.entry.date,
          content: row.entry.content,
          image_urls: row.entry.image_urls || [],
          score: row.score,
        }));

      return res.json({ results: fallback, source: 'fallback' });
    }

    const vector = await createEmbeddingVector(seedText);
    if (!vector) {
      return res.json({ results: [], source: 'pinecone' });
    }

    const index = pineconeClient.index(PINECONE_INDEX).namespace(PINECONE_NAMESPACE);
    const queryResult = await index.query({
      vector,
      topK,
      includeMetadata: true,
      filter: {
        tripId: {
          $eq: String(req.params.tripId),
        },
      },
    });

    const scoreById = new Map();
    for (const match of queryResult?.matches || []) {
      const memoryId =
        String(match?.metadata?.memoryId || '') || String(match?.id || '').replace(/^memory:/, '');
      if (!memoryId) {
        continue;
      }
      scoreById.set(memoryId, Number(match?.score || 0));
    }

    const results = memoriesInTrip
      .filter((entry) => scoreById.has(entry.id) && entry.id !== fromMemoryId)
      .sort((a, b) => (scoreById.get(b.id) || 0) - (scoreById.get(a.id) || 0))
      .slice(0, topK)
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        date: entry.date,
        content: entry.content,
        image_urls: entry.image_urls || [],
        score: scoreById.get(entry.id) || 0,
      }));

    res.json({ results, source: 'pinecone' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || '類似検索に失敗しました。' });
  }
});

app.post('/api/trips/:tripId/design', async (req, res) => {
  try {
    const { value: trip } = await mutateDb(async (db) => {
      const user = await getAuthUser(req, db);
      if (!user) {
        const error = new Error('認証が必要です。');
        error.statusCode = 401;
        throw error;
      }

      const nextTrip = db.trips.find((entry) => entry.id === req.params.tripId);
      if (!nextTrip) {
        const error = new Error('旅行が見つかりません。');
        error.statusCode = 404;
        error.retryable = true;
        throw error;
      }

      requireTripMemberRetryable(db, nextTrip.id, user.id);

      nextTrip.cover_title = req.body?.coverTitle ?? nextTrip.cover_title;
      nextTrip.cover_subtitle = req.body?.coverSubtitle ?? nextTrip.cover_subtitle;
      nextTrip.theme = {
        ...(nextTrip.theme || {}),
        ...(req.body?.theme || {}),
      };

      return nextTrip;
    });

    res.json({ trip: sanitizeTrip(trip) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'デザイン更新に失敗しました。' });
  }
});

app.post('/api/trips/:tripId/cover', async (req, res) => {
  try {
    const file = req.body?.file;
    if (!file?.dataUrl) {
      return res.status(400).json({ error: '表紙画像データが必要です。' });
    }

    const uploaded = await uploadImage(COVER_PREFIX, req.params.tripId, file);
    const { value: payload } = await mutateDb(async (db) => {
      const user = await getAuthUser(req, db);
      if (!user) {
        const error = new Error('認証が必要です。');
        error.statusCode = 401;
        throw error;
      }

      const trip = db.trips.find((entry) => entry.id === req.params.tripId);
      if (!trip) {
        const error = new Error('旅行が見つかりません。');
        error.statusCode = 404;
        error.retryable = true;
        throw error;
      }

      requireTripMemberRetryable(db, trip.id, user.id);

      const previousPath = trip.cover_image_path || '';
      trip.cover_image_path = uploaded.path;
      trip.cover_image_url = uploaded.url;

      return {
        trip,
        previousPath,
      };
    });

    if (payload.previousPath && payload.previousPath !== uploaded.path) {
      await removeBlobByPath(payload.previousPath);
    }

    const { trip } = payload;
    res.json({ trip: sanitizeTrip(trip) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || '表紙画像保存に失敗しました。' });
  }
});

module.exports = app;
