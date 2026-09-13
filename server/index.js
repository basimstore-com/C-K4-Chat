/* ============================================================
   C$K4 Chat v5.2 — SERVER
   Node.js + Express + Socket.io + SQLite + WebRTC
   Author: C$K4 | For: Kali Linux
   ============================================================ */

require('dotenv').config();

const express     = require('express');
const compression = require('compression');
const http        = require('http');
const { Server }  = require('socket.io');
const path        = require('path');
const fs          = require('fs');
const fse         = require('fs-extra');
const multer      = require('multer');
const bcrypt      = require('bcryptjs');
const jwt         = require('jsonwebtoken');
const crypto      = require('crypto');
const CryptoJS    = require('crypto-js');
const { authenticator } = require('otplib');
const QRCode      = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const cors        = require('cors');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const xss         = require('xss');
const sqlite3     = require('sqlite3').verbose();
const cron        = require('node-cron');
const mime        = require('mime-types');
const axios       = (() => { try { return require('axios'); } catch (e) { return null; } })();

/* ---------------- CONFIG ---------------- */
const NODE_ENV     = process.env.NODE_ENV || 'development';
const PORT         = Number(process.env.PORT || 3000);
const JWT_SECRET   = process.env.JWT_SECRET || 'CSK4_FALLBACK_SECRET_2026';
const ENC_KEY      = process.env.ENCRYPTION_KEY || 'CSK4_ENC_KEY_V5_2026';
const MAX_FILE     = Math.min(Math.max(parseInt(process.env.MAX_FILE_SIZE || '104857600', 10) || 104857600, 1024 * 1024), 250 * 1024 * 1024);
const TOKEN_TTL    = process.env.TOKEN_TTL || '1d';
const APP_VERSION  = '5.4.5';
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

if (NODE_ENV === 'production' && (JWT_SECRET === 'CSK4_FALLBACK_SECRET_2026' || ENC_KEY === 'CSK4_ENC_KEY_V5_2026')) {
  throw new Error('JWT_SECRET and ENCRYPTION_KEY must be set to strong, unique values in production');
}

function originAllowed(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.length) return ALLOWED_ORIGINS.includes(origin);
  return NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

const corsOptions = {
  origin: (origin, callback) => originAllowed(origin)
    ? callback(null, true)
    : callback(new Error('Origin is not allowed'))
};

const app  = express();
const server = http.createServer(app);
const io   = new Server(server, { cors: { ...corsOptions, methods: ['GET', 'POST'] } });

/* ---------------- MIDDLEWARE ---------------- */
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"]
    }
  }
}));
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use(compression());
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const apiLimiter = rateLimit({ windowMs: 15*60*1000, max: 400, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, please slow down.' } });
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 15, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many login attempts. Try again later.' } });
app.use('/api/', apiLimiter);

/* ---------------- PATHS ---------------- */
const ROOT       = __dirname;
const UPLOADS    = path.join(ROOT, 'uploads');
const DB_DIR     = path.join(ROOT, 'database');
const DB_PATH    = path.join(DB_DIR, 'csk4.db');
const BACKUP_DIR = path.join(DB_DIR, 'backups');
const PUBLIC_DIR = path.join(ROOT, '..', 'public');
const ADMIN_DIR  = path.join(ROOT, 'admin');

[ UPLOADS, DB_DIR, BACKUP_DIR,
  path.join(UPLOADS,'images'), path.join(UPLOADS,'videos'), path.join(UPLOADS,'files'),
  path.join(UPLOADS,'voice'), path.join(UPLOADS,'profiles'),
  path.join(UPLOADS,'stories'), path.join(UPLOADS,'wallpapers')
].forEach(d => fse.ensureDirSync(d));

/* ---------------- DATABASE ---------------- */
const db = new sqlite3.Database(DB_PATH);
db.get('PRAGMA journal_mode = WAL', () => {});

const runQuery = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) { if (err) reject(err); else resolve(this); });
});
const getQuery = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
});
const allQuery = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
});

/* ---------------- ENCRYPTION (AES-256, PBKDF2-derived key) ---------------- */
const ENC_KEY_DERIVED = CryptoJS.PBKDF2(ENC_KEY, 'csk4-static-salt-v5', { keySize: 256 / 32, iterations: 10000 });
function encryptText(text) {
  if (text === null || text === undefined || text === '') return text;
  try { return CryptoJS.AES.encrypt(String(text), ENC_KEY_DERIVED.toString()).toString(); } catch { return text; }
}
function decryptText(encrypted) {
  if (!encrypted) return encrypted;
  try {
    const dec = CryptoJS.AES.decrypt(encrypted, ENC_KEY_DERIVED.toString()).toString(CryptoJS.enc.Utf8);
    return dec || encrypted;
  } catch { return encrypted; }
}

/* ---------------- XSS CLEAN ---------------- */
function clean(str) {
  if (str === null || str === undefined) return '';
  return xss(String(str)).trim();
}

/* ---------------- AUTH MIDDLEWARE ---------------- */
function extractToken(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  return '';
}
function authMiddleware(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
async function adminOnly(req, res, next) {
  try {
    /* Do not trust the isAdmin flag inside an old JWT. Always re-check the DB. */
    const user = await getQuery('SELECT is_admin FROM users WHERE id=?', [req.user?.id]);
    if (!user || !user.is_admin) return res.status(403).json({ error: 'Admin access required' });
    req.user.isAdmin = true;
    next();
  } catch (e) {
    console.error('[admin-auth]', e.message);
    res.status(500).json({ error: 'Admin authorization failed' });
  }
}

/* ---------------- AUDIT LOG ---------------- */
async function audit(userId, action, details = '') {
  try {
    await runQuery('INSERT INTO audit_log (id, user_id, action, details, timestamp) VALUES (?,?,?,?,?)',
      [uuidv4(), userId || null, action, details, Date.now()]);
  } catch (e) { console.error('[audit]', e.message); }
}

/* ---------------- MULTER ---------------- */
const ALLOWED_MIME = [
  'image/jpeg','image/png','image/gif','image/webp','image/bmp',
  'video/mp4','video/webm','video/ogg','video/quicktime',
  'audio/webm','audio/ogg','audio/mpeg','audio/mp3','audio/wav','audio/mp4','audio/x-m4a','audio/m4a',
  'application/pdf','application/zip','application/x-zip-compressed','application/x-rar-compressed',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain','text/csv','application/json','application/octet-stream'
];
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const field = file.fieldname;
    let dir = path.join(UPLOADS, 'files');
    if (field === 'profile')       dir = path.join(UPLOADS, 'profiles');
    else if (field === 'story')    dir = path.join(UPLOADS, 'stories');
    else if (field === 'wallpaper')dir = path.join(UPLOADS, 'wallpapers');
    else if (file.mimetype && file.mimetype.startsWith('image/')) dir = path.join(UPLOADS, 'images');
    else if (file.mimetype && file.mimetype.startsWith('video/')) dir = path.join(UPLOADS, 'videos');
    else if (file.mimetype && (file.mimetype.startsWith('audio/') || file.mimetype.startsWith('voice/'))) dir = path.join(UPLOADS, 'voice');
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase() || '.bin';
    cb(null, `${Date.now()}-${uuidv4()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE },
  fileFilter: (req, file, cb) => {
    const mimeType = String(file.mimetype || '').toLowerCase();
    const fieldAllowed = {
      profile: mimeType.startsWith('image/'),
      wallpaper: mimeType.startsWith('image/'),
      story: mimeType.startsWith('image/') || mimeType.startsWith('video/')
    };
    const allowed = Object.prototype.hasOwnProperty.call(fieldAllowed, file.fieldname)
      ? fieldAllowed[file.fieldname]
      : ALLOWED_MIME.includes(mimeType);
    cb(allowed ? null : new Error(`File type not allowed: ${mimeType || 'unknown'}`), allowed);
  }
});

/* ---------------- ONLINE USERS ---------------- */
const onlineUsers = new Map();      // userId -> socketId
const userSockets = new Map();      // userId -> Set(socketId)  (multi-device)
const roomFor = id => `user_${id}`;

function emitToUser(userId, event, payload) {
  io.to(roomFor(userId)).emit(event, payload);
}
function isOnline(userId) { return onlineUsers.has(String(userId)); }

/* ============================================================
   DATABASE SCHEMA — 22 TABLES
   ============================================================ */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  profile_pic TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  last_seen INTEGER DEFAULT 0,
  is_admin INTEGER DEFAULT 0,
  two_fa_enabled INTEGER DEFAULT 0,
  two_fa_code TEXT DEFAULT '',
  two_fa_secret TEXT DEFAULT '',
  wallpaper TEXT DEFAULT '',
  privacy_last_seen TEXT DEFAULT 'everyone',
  privacy_profile_pic TEXT DEFAULT 'everyone',
  privacy_status TEXT DEFAULT 'everyone',
  privacy_about TEXT DEFAULT 'everyone',
  privacy_groups TEXT DEFAULT 'everyone',
  privacy_stories TEXT DEFAULT 'contacts',
  show_email INTEGER DEFAULT 0,
  show_phone INTEGER DEFAULT 0,
  auto_reply_enabled INTEGER DEFAULT 0,
  auto_reply_message TEXT DEFAULT '',
  created_at INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chat_requests (
  id TEXT PRIMARY KEY,
  from_user TEXT NOT NULL,
  to_user TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT 0,
  UNIQUE(from_user, to_user),
  FOREIGN KEY (from_user) REFERENCES users(id),
  FOREIGN KEY (to_user) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  from_user TEXT NOT NULL,
  to_user TEXT NOT NULL,
  message TEXT,
  type TEXT DEFAULT 'text',
  media_url TEXT,
  media_name TEXT,
  media_size INTEGER DEFAULT 0,
  duration INTEGER DEFAULT 0,
  reply_to TEXT,
  forwarded INTEGER DEFAULT 0,
  edited INTEGER DEFAULT 0,
  deleted_for_everyone INTEGER DEFAULT 0,
  view_once INTEGER DEFAULT 0,
  viewed INTEGER DEFAULT 0,
  seen INTEGER DEFAULT 0,
  delivered INTEGER DEFAULT 0,
  is_pinned INTEGER DEFAULT 0,
  offline_queued INTEGER DEFAULT 0,
  scheduled_at INTEGER DEFAULT 0,
  location_lat REAL,
  location_lng REAL,
  location_live INTEGER DEFAULT 0,
  expires_at INTEGER DEFAULT 0,
  timestamp INTEGER DEFAULT 0,
  FOREIGN KEY (from_user) REFERENCES users(id),
  FOREIGN KEY (to_user) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS group_messages (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  message TEXT,
  type TEXT DEFAULT 'text',
  media_url TEXT,
  media_name TEXT DEFAULT '',
  media_size INTEGER DEFAULT 0,
  duration INTEGER DEFAULT 0,
  reply_to TEXT,
  forwarded INTEGER DEFAULT 0,
  view_once INTEGER DEFAULT 0,
  viewed INTEGER DEFAULT 0,
  edited INTEGER DEFAULT 0,
  deleted_for_everyone INTEGER DEFAULT 0,
  is_pinned INTEGER DEFAULT 0,
  seen_by TEXT DEFAULT '[]',
  timestamp INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  avatar TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  wallpaper TEXT DEFAULT '',
  created_at INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  joined_at INTEGER DEFAULT 0,
  UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT DEFAULT 'text',
  content TEXT,
  media_url TEXT,
  caption TEXT DEFAULT '',
  background TEXT DEFAULT '#201a0d',
  tags TEXT DEFAULT '[]',
  views INTEGER DEFAULT 0,
  is_highlight INTEGER DEFAULT 0,
  expires_at INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS story_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id TEXT NOT NULL,
  viewer_id TEXT NOT NULL,
  viewed_at INTEGER DEFAULT 0,
  UNIQUE(story_id, viewer_id)
);

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  owner_id TEXT NOT NULL,
  subscribers INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS channel_subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  subscribed_at INTEGER DEFAULT 0,
  UNIQUE(channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS channel_messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  message TEXT,
  type TEXT DEFAULT 'text',
  media_url TEXT,
  timestamp INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS polls (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  context_type TEXT DEFAULT 'chat',
  context_id TEXT DEFAULT '',
  question TEXT NOT NULL,
  options TEXT NOT NULL,
  anonymous INTEGER DEFAULT 0,
  multi_choice INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT 0,
  expires_at INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS poll_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  option_index INTEGER NOT NULL,
  voted_at INTEGER DEFAULT 0,
  UNIQUE(poll_id, user_id)
);

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  game_type TEXT DEFAULT 'tic-tac-toe',
  player1 TEXT NOT NULL,
  player2 TEXT,
  board TEXT DEFAULT '---------',
  turn TEXT,
  status TEXT DEFAULT 'waiting',
  winner TEXT,
  last_move_at INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT,
  title TEXT,
  body TEXT,
  data TEXT DEFAULT '{}',
  read INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quick_replies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  shortcut TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER DEFAULT 0,
  UNIQUE(user_id, shortcut)
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  message_id TEXT,
  reported_user TEXT,
  reason TEXT,
  status TEXT DEFAULT 'pending',
  created_at INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS blocked_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  blocked_user TEXT NOT NULL,
  created_at INTEGER DEFAULT 0,
  UNIQUE(user_id, blocked_user)
);

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id TEXT PRIMARY KEY,
  from_user TEXT NOT NULL,
  to_user TEXT NOT NULL,
  message TEXT,
  scheduled_at INTEGER NOT NULL,
  sent INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS offline_messages (
  id TEXT PRIMARY KEY,
  from_user TEXT NOT NULL,
  to_user TEXT NOT NULL,
  message TEXT,
  type TEXT DEFAULT 'text',
  media_url TEXT,
  payload TEXT DEFAULT '{}',
  attempts INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT,
  details TEXT DEFAULT '',
  timestamp INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device TEXT DEFAULT 'web',
  token TEXT,
  created_at INTEGER DEFAULT 0,
  last_active INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  from_lang TEXT DEFAULT 'auto',
  to_lang TEXT DEFAULT 'en',
  original TEXT,
  translated TEXT,
  created_at INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS message_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at INTEGER DEFAULT 0,
  UNIQUE(message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_msg_pair  ON messages(from_user, to_user, timestamp);
CREATE INDEX IF NOT EXISTS idx_msg_ts     ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_msg_pinned ON messages(is_pinned);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_name  ON users(username);
CREATE INDEX IF NOT EXISTS idx_story_exp   ON stories(expires_at);
CREATE INDEX IF NOT EXISTS idx_notif_user  ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_sched_sent  ON scheduled_messages(scheduled_at, sent);
CREATE INDEX IF NOT EXISTS idx_grpmsg      ON group_messages(group_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_pollvotes   ON poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_reactions_msg ON message_reactions(message_id);
`;

/* There's a known typo trap in schema strings — we run with a safe executor that fixes the typo */
function initDB() {
  return new Promise((resolve, reject) => {
    const fixed = SCHEMA.replace('IF INDIRECT', 'IF NOT EXISTS'); // safety fix
    db.exec(fixed, async (err) => {
      if (err) return reject(err);
      /* Older databases pre-date media metadata on group messages. Add the
         columns without requiring users to delete their existing database. */
      try {
        const columns = await allQuery('PRAGMA table_info(group_messages)');
        const existing = new Set(columns.map(c => c.name));
        const additions = [
          ['media_name', "TEXT DEFAULT ''"],
          ['media_size', 'INTEGER DEFAULT 0'],
          ['duration', 'INTEGER DEFAULT 0'],
          ['view_once', 'INTEGER DEFAULT 0'],
          ['viewed', 'INTEGER DEFAULT 0']
        ];
        for (const [name, definition] of additions) {
          if (!existing.has(name)) await runQuery(`ALTER TABLE group_messages ADD COLUMN ${name} ${definition}`);
        }
        await runQuery('CREATE TABLE IF NOT EXISTS message_reactions (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT NOT NULL, user_id TEXT NOT NULL, emoji TEXT NOT NULL, created_at INTEGER DEFAULT 0, UNIQUE(message_id, user_id))');
        await runQuery('CREATE INDEX IF NOT EXISTS idx_reactions_msg ON message_reactions(message_id)');

        /* Older databases pre-date TOTP-based 2FA. Add the secret column without
           requiring users to delete their existing database. */
        const userCols = await allQuery('PRAGMA table_info(users)');
        const userColNames = new Set(userCols.map(c => c.name));
        if (!userColNames.has('two_fa_secret')) {
          await runQuery(`ALTER TABLE users ADD COLUMN two_fa_secret TEXT DEFAULT ''`);
        }
        if (!userColNames.has('show_email')) {
          await runQuery(`ALTER TABLE users ADD COLUMN show_email INTEGER DEFAULT 0`);
        }
        if (!userColNames.has('show_phone')) {
          await runQuery(`ALTER TABLE users ADD COLUMN show_phone INTEGER DEFAULT 0`);
        }
        await runQuery(`CREATE TABLE IF NOT EXISTS chat_requests (
          id TEXT PRIMARY KEY,
          from_user TEXT NOT NULL,
          to_user TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          created_at INTEGER DEFAULT 0,
          updated_at INTEGER DEFAULT 0,
          UNIQUE(from_user, to_user)
        )`);
        await runQuery('CREATE INDEX IF NOT EXISTS idx_chat_req_to ON chat_requests(to_user, status)');
        await runQuery('CREATE INDEX IF NOT EXISTS idx_chat_req_from ON chat_requests(from_user, status)');
        /* ---- v5.4.0 migrations: group posting permission + last read, ads, tools, support, social ---- */
        const gmCols = await allQuery('PRAGMA table_info(group_members)');
        const gmNames = new Set(gmCols.map(c => c.name));
        if (!gmNames.has('can_post'))   await runQuery(`ALTER TABLE group_members ADD COLUMN can_post INTEGER DEFAULT 1`);
        if (!gmNames.has('last_read'))  await runQuery(`ALTER TABLE group_members ADD COLUMN last_read INTEGER DEFAULT 0`);
        /* v5.4.0: group-level post_mode — 'all' (default) ya 'admin' (sirf admin posting) */
        const gCols = await allQuery('PRAGMA table_info(groups)');
        const gNames = new Set(gCols.map(c => c.name));
        if (!gNames.has('post_mode'))    await runQuery(`ALTER TABLE groups ADD COLUMN post_mode TEXT DEFAULT 'all'`);
        if (!gNames.has('description'))  await runQuery(`ALTER TABLE groups ADD COLUMN description TEXT DEFAULT ''`);
        await runQuery(`CREATE TABLE IF NOT EXISTS site_settings (
          key TEXT PRIMARY KEY,
          value TEXT DEFAULT ''
        )`);
        await runQuery(`CREATE TABLE IF NOT EXISTS ads (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          body TEXT DEFAULT '',
          link_url TEXT DEFAULT '',
          link_label TEXT DEFAULT 'Open',
          active INTEGER DEFAULT 1,
          created_by TEXT,
          created_at INTEGER DEFAULT 0
        )`);
        await runQuery(`CREATE TABLE IF NOT EXISTS tools (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT DEFAULT '',
          icon TEXT DEFAULT '\ud83d\udd27',
          url TEXT NOT NULL,
          active INTEGER DEFAULT 1,
          created_at INTEGER DEFAULT 0
        )`);
        await runQuery(`CREATE TABLE IF NOT EXISTS support_tickets (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          type TEXT DEFAULT 'problem',
          subject TEXT DEFAULT '',
          message TEXT DEFAULT '',
          status TEXT DEFAULT 'open',
          admin_reply TEXT DEFAULT '',
          replied_at INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT 0
        )`);
        /* ---- v16.4.4 migrations: story/last-seen privacy + channel DP ---- */
        if (!userColNames.has('privacy_stories')) {
          await runQuery(`ALTER TABLE users ADD COLUMN privacy_stories TEXT DEFAULT 'contacts'`);
        }
        const chCols = await allQuery('PRAGMA table_info(channels)');
        const chNames = new Set(chCols.map(c => c.name));
        if (!chNames.has('avatar')) {
          await runQuery(`ALTER TABLE channels ADD COLUMN avatar TEXT DEFAULT ''`);
        }
        resolve();
      } catch (migrationError) {
        reject(migrationError);
      }
    });
  });
}

/* ---------------- SEED ADMIN + DEMO ---------------- */
async function seedUsers() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@csk4.com';
  const adminPass  = process.env.ADMIN_PASSWORD || (NODE_ENV === 'production' ? '' : 'Admin@123');
  if (!adminPass) throw new Error('ADMIN_PASSWORD must be set before starting in production');
  const adminU     = await getQuery('SELECT id FROM users WHERE email=?', [adminEmail]);
  if (!adminU) {
    const hash = await bcrypt.hash(adminPass, 10);
    await runQuery(`INSERT INTO users (id, username, email, password, bio, phone, is_admin, created_at, last_seen)
      VALUES (?,?,?,?,?,?,?,?,?)`,
      [uuidv4(), 'admin', adminEmail, hash, 'C$K4 System Administrator', '+0000000000', 1, Date.now(), Date.now()]);
    console.log(`  [SEED] Admin created: ${adminEmail}`);
  }
  if (process.env.ENABLE_DEMO_ACCOUNTS !== 'false' && NODE_ENV !== 'production') {
    const demoU = await getQuery('SELECT id FROM users WHERE email=?', ['demo@csk4.com']);
    if (!demoU) {
      const hash = await bcrypt.hash('demo123', 10);
      await runQuery(`INSERT INTO users (id, username, email, password, bio, phone, is_admin, created_at, last_seen)
        VALUES (?,?,?,?,?,?,?,?,?)`,
        [uuidv4(), 'demo', 'demo@csk4.com', hash, 'Demo user for testing C$K4 Chat v5.2', '+1111111111', 0, Date.now(), Date.now()]);
      console.log('  [SEED] Demo user created for development');
    }
  }
  const botU = await getQuery("SELECT id FROM users WHERE email=?", ['bot@csk4.com']);
  if (!botU) {
    const hash = await bcrypt.hash(uuidv4(), 10);
    await runQuery(`INSERT INTO users (id, username, email, password, bio, phone, is_admin, created_at, last_seen)
      VALUES (?,?,?,?,?,?,?,?,?)`,
      [uuidv4(), 'CSK4 Bot', 'bot@csk4.com', hash, '🤖 AI Assistant Bot — chat with me!', '+2222222222', 0, Date.now(), Date.now()]);
    console.log('  [SEED] AI Bot user created: bot@csk4.com');
  }

  /* Official C$K4 Channel — auto created, all users force-subscribed */
  let official = await getQuery(`SELECT id FROM channels WHERE name='C$K4' OR name='CSK4' LIMIT 1`);
  if (!official) {
    const admin = await getQuery('SELECT id FROM users WHERE is_admin=1 LIMIT 1');
    const ownerId = admin ? admin.id : (await getQuery('SELECT id FROM users LIMIT 1'))?.id;
    if (ownerId) {
      const chId = uuidv4();
      await runQuery(`INSERT INTO channels (id, name, description, owner_id, subscribers, created_at) VALUES (?,?,?,?,0,?)`,
        [chId, 'C$K4', 'Official C$K4 Announcements Channel — Auto followed by all users', ownerId, Date.now()]);
      official = { id: chId };
      console.log('  [SEED] Official C$K4 channel created');
    }
  }
  if (official) {
    // Force-subscribe every existing user who is not yet subscribed
    const allUsers = await allQuery('SELECT id FROM users');
    let added = 0;
    for (const u of allUsers) {
      const r = await runQuery('INSERT OR IGNORE INTO channel_subscribers (channel_id, user_id, subscribed_at) VALUES (?,?,?)',
        [official.id, u.id, Date.now()]);
      if (r.changes > 0) added++;
    }
    if (added > 0) {
      await runQuery('UPDATE channels SET subscribers = (SELECT COUNT(*) FROM channel_subscribers WHERE channel_id=?) WHERE id=?',
        [official.id, official.id]);
      console.log(`  [SEED] Auto-subscribed ${added} users to C$K4 channel`);
    }
  }
}

/* ============================================================
   SOCKET.IO — AUTH + ONLINE TRACKING
   ============================================================ */
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Auth token required'));
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = String(decoded.id);
    socket.userData = decoded;
    next();
  } catch (e) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', async (socket) => {
  const uid = socket.userId;
  if (!userSockets.has(uid)) userSockets.set(uid, new Set());
  userSockets.get(uid).add(socket.id);
  onlineUsers.set(uid, socket.id);

  /* join personal room */
  socket.join(roomFor(uid));

  /* auto-join all groups + subscribed channels rooms (so messages reach without manual join) */
  try {
    const myGroups = await allQuery('SELECT group_id FROM group_members WHERE user_id=?', [uid]);
    for (const g of myGroups) socket.join(`group_${g.group_id}`);
    const myChannels = await allQuery(`SELECT c.id FROM channels c JOIN channel_subscribers cs ON cs.channel_id=c.id WHERE cs.user_id=?`, [uid]);
    for (const c of myChannels) socket.join(`channel_${c.id}`);
  } catch (e) { console.error('[auto-join-rooms]', e.message); }

  /* set online in DB */
  await runQuery('UPDATE users SET last_seen=? WHERE id=?', [Date.now(), uid]);
  emitToUser(uid, 'user-online', { userId: uid });

  /* --- OFFLINE MESSAGE DELIVERY (fix from reference code) --- */
  try {
    const offlines = await allQuery('SELECT * FROM offline_messages WHERE to_user=?', [uid]);
    for (const om of offlines) {
      let payload = {};
      try { payload = JSON.parse(om.payload || '{}'); } catch {}
      emitToUser(uid, 'new-message', {
        id: om.id, from_user: om.from_user, to_user: uid,
        message: decryptText(om.message), type: om.type || 'text',
        media_url: om.media_url, timestamp: om.created_at,
        offline: true, ...payload
      });
      await runQuery('DELETE FROM offline_messages WHERE id=?', [om.id]);
    }
    if (offlines.length) console.log(`  [SOCKET] Delivered ${offlines.length} offline messages to ${uid}`);
  } catch (e) { console.error('[offline-delivery]', e.message); }

  /* broadcast presence to everyone */
  socket.broadcast.emit('presence', { userId: uid, online: true, last_seen: Date.now() });
  io.emit('online-count', { count: onlineUsers.size });

  /* ---- TYPING INDICATOR ---- */
  socket.on('typing', (data) => {
    const to = String(data?.to || '');
    if (to) socket.to(roomFor(to)).emit('typing', { from: uid, typing: !!data.typing, chatType: data.chatType || 'direct' });
  });

  /* ---- SEND DIRECT MESSAGE ---- */
  socket.on('send-message', async (data) => {
    try {
      const { to, message, type = 'text', media_url = '', media_name = '', media_size = 0, duration = 0, reply_to = null, view_once = false, forwarded = false, scheduled_at = 0 } = data || {};
      const toUser = String(to || '');
      if (!toUser) return;
      const recipient = await getQuery('SELECT id FROM users WHERE id=?', [toUser]);
      if (!recipient || toUser === uid) {
        socket.emit('error-message', { error: 'Invalid chat recipient' });
        return;
      }
      const body = clean(message || '');
      if (body.length > 4000) {
        socket.emit('error-message', { error: 'Message is too long (maximum 4000 characters)' });
        return;
      }

      /* Both sides of a block must stop delivery. */
      const blocked = await getQuery(`SELECT id FROM blocked_users
        WHERE (user_id=? AND blocked_user=?) OR (user_id=? AND blocked_user=?)`,
        [toUser, uid, uid, toUser]);
      if (blocked) {
        socket.emit('error-message', { error: 'Messaging is unavailable for this contact' });
        return;
      }

      /* Message Request check — only accepted contacts can message */
      const allowed = await canMessage(uid, toUser);
      if (!allowed) {
        socket.emit('error-message', { error: 'Pehle chat request bhejo aur accept hone ka wait karo' });
        return;
      }

      const id = uuidv4();
      const ts = Date.now();
      const enc = encryptText(body);

      await runQuery(`INSERT INTO messages (id, from_user, to_user, message, type, media_url, media_name, media_size, duration, reply_to, forwarded, view_once, scheduled_at, timestamp)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, uid, toUser, enc, type, media_url, media_name, media_size, duration, reply_to, forwarded ? 1 : 0, view_once ? 1 : 0, scheduled_at, ts]);

      const msgPayload = { id, from_user: uid, to_user: toUser, message: body, type, media_url, media_name, media_size, duration, reply_to, forwarded: !!forwarded, view_once: !!view_once, timestamp: ts };

      if (isOnline(toUser)) {
        emitToUser(toUser, 'new-message', msgPayload);
        await runQuery('UPDATE messages SET delivered=1 WHERE id=?', [id]);
        socket.emit('message-status', { id, status: 'delivered' });
      } else {
        /* queue for offline delivery */
        await runQuery(`INSERT INTO offline_messages (id, from_user, to_user, message, type, media_url, payload, created_at) VALUES (?,?,?,?,?,?,?,?)`,
          [id, uid, toUser, enc, type, media_url, JSON.stringify({ media_name, media_size, duration, reply_to, forwarded, view_once }), Date.now()]);
        socket.emit('message-status', { id, status: 'queued' });
        /* ---- AUTO-REPLY (Feature 38) ---- */
        const target = await getQuery('SELECT id, auto_reply_enabled, auto_reply_message, username FROM users WHERE id=?', [toUser]);
        if (target && target.auto_reply_enabled) {
          const arId = uuidv4();
          const arText = target.auto_reply_message || 'I am currently away. I will reply soon!';
          await runQuery(`INSERT INTO messages (id, from_user, to_user, message, type, timestamp) VALUES (?,?,?,?,?,?)`,
            [arId, toUser, uid, encryptText(arText), 'auto-reply', Date.now()]);
          socket.emit('new-message', { id: arId, from_user: toUser, to_user: uid, message: arText, type: 'auto-reply', timestamp: Date.now() });
        }
      }

      /* update sender's own view */
      socket.emit('message-sent', msgPayload);

      /* ---- AI BOT auto-response ---- */
      if (toUser === BOT_USER_ID) {
        const botReply = aiReply(body);
        const bId = uuidv4();
        await runQuery(`INSERT INTO messages (id, from_user, to_user, message, type, timestamp) VALUES (?,?,?,?,?,?)`,
          [bId, BOT_USER_ID, uid, encryptText(botReply), 'text', Date.now()]);
        setTimeout(() => {
          socket.emit('new-message', { id: bId, from_user: BOT_USER_ID, to_user: uid, message: botReply, type: 'text', timestamp: Date.now(), isBot: true });
        }, 600);
      }
    } catch (e) {
      console.error('[send-message]', e.message);
      socket.emit('error-message', { error: 'Failed to send message' });
    }
  });

  /* ---- SEND GROUP MESSAGE ---- */
  socket.on('send-group-message', async (data) => {
    try {
      const { group_id, message, type = 'text', media_url = '', media_name = '', media_size = 0, duration = 0, reply_to = null, forwarded = false, view_once = false } = data || {};
      const gid = String(group_id || '');
      if (!gid) return;
      const member = await getQuery('SELECT user_id, role, can_post FROM group_members WHERE group_id=? AND user_id=?', [gid, uid]);
      if (!member) return socket.emit('error-message', { error: 'You are not a member of this group' });
      /* v5.4.0: posting permission — group post_mode + per-member can_post (admin role bypass) */
      const grp = await getQuery('SELECT name, post_mode FROM groups WHERE id=?', [gid]);
      const isAdminRole = String(member.role) === 'admin';
      if (isAdminRole) { /* group admin bypass */ }
      else if (grp && String(grp.post_mode) === 'admin') {
        return socket.emit('error-message', { error: '"' + (grp.name || 'Group') + '" me sirf ADMIN post kar sakta hai \ud83d\udeab' });
      } else if (String(member.can_post) === '0') {
        return socket.emit('error-message', { error: 'Admin ne aapki posting BLOCK ki hai is group me \ud83d\udeab' });
      }

      const id = uuidv4();
      const ts = Date.now();
      await runQuery(`INSERT INTO group_messages (id, group_id, sender_id, message, type, media_url, media_name, media_size, duration, reply_to, forwarded, view_once, timestamp)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, gid, uid, encryptText(clean(message || '')), type, media_url, media_name, media_size, duration, reply_to, forwarded ? 1 : 0, view_once ? 1 : 0, ts]);

      const sender = await getQuery('SELECT id, username, profile_pic FROM users WHERE id=?', [uid]);
      io.to(`group_${gid}`).emit('new-group-message', {
        id, group_id: gid, sender_id: uid, sender: sender || { id: uid, username: 'Unknown' },
        message: clean(message || ''), type, media_url, media_name, media_size, duration, reply_to, forwarded: !!forwarded, view_once: !!view_once, timestamp: ts
      });
    } catch (e) { console.error('[send-group-message]', e.message); }
  });

  /* ---- EDIT MESSAGE ---- */
  socket.on('edit-message', async (data) => {
    try {
      const { id, message } = data || {};
      const msg = await getQuery('SELECT * FROM messages WHERE id=?', [id]);
      if (!msg || msg.from_user !== uid) return socket.emit('error-message', { error: 'Cannot edit this message' });
      if (Date.now() - msg.timestamp > 15 * 60 * 1000) return socket.emit('error-message', { error: 'Edit window (15 min) expired' });
      await runQuery('UPDATE messages SET message=?, edited=1 WHERE id=?', [encryptText(clean(message)), id]);
      const updated = { id, message: clean(message), edited: true, from_user: msg.from_user, to_user: msg.to_user };
      emitToUser(msg.to_user, 'message-edited', updated);
      emitToUser(uid, 'message-edited', { ...updated, mine: true });
    } catch (e) { console.error('[edit-message]', e.message); }
  });

  /* ---- DELETE MESSAGE ---- */
  socket.on('delete-message', async (data) => { try { await deleteMessageInternal(uid, data); } catch (e) { console.error('[delete-message]', e.message); } });

  /* ---- MARK SEEN ---- */
  socket.on('mark-seen', async (data) => {
    try {
      const from = String(data?.from || '');
      if (!from) return;
      const updated = await runQuery('UPDATE messages SET seen=1, delivered=1 WHERE from_user=? AND to_user=? AND seen=0', [from, uid]);
      if (updated.changes > 0) emitToUser(from, 'messages-seen', { by: uid, count: updated.changes, at: Date.now() });
    } catch (e) { console.error('[mark-seen]', e.message); }
  });

  /* ---- REACTIONS ---- */
  socket.on('react-message', async (data) => {
    try {
      const { id, emoji } = data || {};
      const allowedEmoji = String(emoji || '').trim().slice(0, 8);
      if (!id || !allowedEmoji) return;
      const msg = await getQuery('SELECT * FROM messages WHERE id=?', [id]);
      if (!msg || (msg.from_user !== uid && msg.to_user !== uid)) return;
      const existing = await getQuery('SELECT id, emoji FROM message_reactions WHERE message_id=? AND user_id=?', [id, uid]);
      let active = true;
      if (existing && existing.emoji === allowedEmoji) {
        await runQuery('DELETE FROM message_reactions WHERE id=?', [existing.id]);
        active = false;
      } else {
        await runQuery('INSERT INTO message_reactions (message_id, user_id, emoji, created_at) VALUES (?,?,?,?) ON CONFLICT(message_id,user_id) DO UPDATE SET emoji=excluded.emoji, created_at=excluded.created_at',
          [id, uid, allowedEmoji, Date.now()]);
      }
      const reactions = await allQuery('SELECT emoji, user_id FROM message_reactions WHERE message_id=?', [id]);
      const usersByEmoji = {};
      reactions.forEach(r => { (usersByEmoji[r.emoji] ||= []).push(r.user_id); });
      const payload = { id, emoji: allowedEmoji, by: uid, active, reactions: usersByEmoji };
      emitToUser(msg.to_user, 'message-reaction', payload);
      emitToUser(msg.from_user, 'message-reaction', payload);
    } catch (e) { console.error('[react]', e.message); }
  });

  /* ---- PIN MESSAGE (socket) ---- */
  socket.on('pin-message', async (data) => {
    try {
      const { id } = data || {};
      const msg = await getQuery('SELECT * FROM messages WHERE id=?', [id]);
      if (!msg || (msg.from_user !== uid && msg.to_user !== uid)) return;
      await runQuery('UPDATE messages SET is_pinned = 1 - is_pinned WHERE id=?', [id]);
      const fresh = await getQuery('SELECT id, is_pinned, from_user, to_user FROM messages WHERE id=?', [id]);
      [msg.from_user, msg.to_user].forEach(u => emitToUser(u, 'message-pinned', { id, is_pinned: !!fresh.is_pinned }));
    } catch (e) { console.error('[pin]', e.message); }
  });

  /* ---- LIVE LOCATION ---- */
  socket.on('share-location', async (data) => {
    try {
      const { to, lat, lng, live = false, duration_min = 15 } = data || {};
      const toUser = String(to || '');
      if (!toUser || lat == null || lng == null) return;
      const id = uuidv4();
      const ts = Date.now();
      const place = await reverseGeocode(lat, lng).catch(() => null);
      await runQuery(`INSERT INTO messages (id, from_user, to_user, message, type, location_lat, location_lng, location_live, expires_at, timestamp)
        VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [id, uid, toUser, place ? `📍 Live location: ${place}` : '📍 Location shared', 'location', lat, lng, live ? 1 : 0, live ? ts + duration_min*60*1000 : 0, ts]);
      emitToUser(toUser, 'new-message', { id, from_user: uid, to_user: toUser, type: 'location', location_lat: lat, location_lng: lng, location_live: live, message: place ? `📍 ${place}` : '📍 Location', timestamp: ts });
      socket.emit('message-sent', { id, from_user: uid, to_user: toUser, type: 'location', location_lat: lat, location_lng: lng, location_live: live, timestamp: ts });
    } catch (e) { console.error('[share-location]', e.message); }
  });

  /* ---- CHANNEL MESSAGE ---- */
  socket.on('send-channel-message', async (data) => {
    try {
      const { channel_id, message, media_url = '' } = data || {};
      const cid = String(channel_id || '');
      if (!cid) return;
      const ch = await getQuery('SELECT * FROM channels WHERE id=?', [cid]);
      if (!ch) return;
      const isSub = await getQuery('SELECT id FROM channel_subscribers WHERE channel_id=? AND user_id=?', [cid, uid]);
      const isOwner = ch.owner_id === uid;
      if (!isSub && !isOwner) return socket.emit('error-message', { error: 'Subscribe to post in this channel' });
      const id = uuidv4(); const ts = Date.now();
      await runQuery(`INSERT INTO channel_messages (id, channel_id, sender_id, message, type, media_url, timestamp) VALUES (?,?,?,?,?,?,?)`,
        [id, cid, uid, encryptText(clean(message || '')), media_url ? 'media' : 'text', media_url, ts]);
      io.to(`channel_${cid}`).emit('new-channel-message', {
        id, channel_id: cid, sender_id: uid, message: clean(message || ''), media_url, timestamp: ts
      });
    } catch (e) { console.error('[channel-msg]', e.message); }
  });

  /* ---- INSTANT VOTE (real-time poll, fix: awaited queries) ---- */
  socket.on('poll-vote', async (data) => {
    try {
      const { poll_id, option_index } = data || {};
      const poll = await getQuery('SELECT * FROM polls WHERE id=?', [poll_id]);
      if (!poll) return socket.emit('error-message', { error: 'Poll not found' });
      const existing = await getQuery('SELECT id FROM poll_votes WHERE poll_id=? AND user_id=?', [poll_id, uid]);
      if (existing) return socket.emit('error-message', { error: 'You already voted' });
      await runQuery('INSERT INTO poll_votes (poll_id, user_id, option_index, voted_at) VALUES (?,?,?,?)', [poll_id, uid, option_index, Date.now()]);
      /* emit updated results to everyone in poll room */
      const votes = await allQuery('SELECT user_id, option_index FROM poll_votes WHERE poll_id=?', [poll_id]);
      const counts = {};
      votes.forEach(v => counts[v.option_index] = (counts[v.option_index] || 0) + 1);
      io.to(`poll_${poll_id}`).emit('poll-results', { poll_id, counts, total: votes.length, voted: true });
      socket.emit('poll-results', { poll_id, counts, total: votes.length, voted: true });
    } catch (e) { console.error('[poll-vote]', e.message); }
  });

  /* ---- GAME MOVE (fix: awaited queries) ---- */
  socket.on('game-move', async (data) => {
    try {
      const { game_id, position } = data || {};
      const g = await getQuery('SELECT * FROM games WHERE id=?', [game_id]);
      if (!g) return;
      if (g.status !== 'playing') return socket.emit('error-message', { error: 'Game not active' });
      if (g.turn !== uid) return socket.emit('error-message', { error: 'Not your turn' });
      const p = parseInt(position, 10);
      if (!(p >= 0 && p <= 8)) return;
      let board = g.board.split('');
      if (board[p] !== '-') return socket.emit('error-message', { error: 'Cell already taken' });
      const isP1 = g.player1 === uid;
      board[p] = isP1 ? 'X' : 'O';
      const winnerId = checkWinnerTTT(board);
      const nextTurn = isP1 ? g.player2 : g.player1;
      let status = 'playing', winner = null;
      if (winnerId === 'X') { status = 'finished'; winner = g.player1; }
      else if (winnerId === 'O') { status = 'finished'; winner = g.player2; }
      else if (!board.includes('-')) { status = 'draw'; winner = null; }
      await runQuery('UPDATE games SET board=?, turn=?, status=?, winner=?, last_move_at=? WHERE id=?',
        [board.join(''), status === 'finished' || status === 'draw' ? null : nextTurn, status, winner, Date.now(), game_id]);
      io.to(`game_${game_id}`).emit('game-state', { game_id, board: board.join(''), turn: nextTurn, status, winner, mover: uid });
    } catch (e) { console.error('[game-move]', e.message); }
  });

  /* ---- WEBRTC CALLS (voice/video/screen) ---- */
  socket.on('call-user', (data) => {
    const { to, callType, offer, callId, group_id } = data || {};
    if (!to) return;
    socket.to(roomFor(String(to))).emit('incoming-call', { from: uid, fromUser: socket.userData, callType, offer, callId, group_id });
  });
  socket.on('accept-call', (data) => {
    const { to, answer, callId } = data || {};
    socket.to(roomFor(String(to))).emit('call-accepted', { by: uid, answer, callId });
  });
  socket.on('reject-call', (data) => {
    const { to, callId, reason } = data || {};
    socket.to(roomFor(String(to))).emit('call-rejected', { by: uid, callId, reason: reason || 'rejected' });
  });
  socket.on('end-call', (data) => {
    const { to, callId } = data || {};
    if (to) socket.to(roomFor(String(to))).emit('call-ended', { by: uid, callId });
    socket.emit('call-ended', { by: uid, callId, self: true });
  });
  socket.on('webrtc-signal', (data) => {
    const { to, signal } = data || {};
    if (!to) return;
    socket.to(roomFor(String(to))).emit('webrtc-signal', { from: uid, signal });
  });

  /* ---- GROUP CALL INVITES ---- */
  socket.on('group-call-invite', (data) => {
    const { to, group_id, callId, callType } = data || {};
    if (!to) return;
    socket.to(roomFor(String(to))).emit('incoming-group-call', { from: uid, group_id, callId, callType });
  });

  /* ---- ROOM MANAGEMENT (groups / channels / polls / games) ---- */
  socket.on('join-group', async (d) => {
    if (!d?.group_id) return;
    const member = await getQuery('SELECT id FROM group_members WHERE group_id=? AND user_id=?', [d.group_id, uid]);
    if (member) {
      socket.join(`group_${d.group_id}`);
      /* v5.4.0: group open hua = last_read update (inbox unread count reset) */
      runQuery('UPDATE group_members SET last_read=? WHERE group_id=? AND user_id=?', [Date.now(), d.group_id, uid]).catch(() => {});
    }
  });
  socket.on('leave-group',  (d) => { if (d && d.group_id) socket.leave(`group_${d.group_id}`); });
  socket.on('join-channel', async (d) => {
    if (!d?.channel_id) return;
    const channel = await getQuery('SELECT owner_id FROM channels WHERE id=?', [d.channel_id]);
    const sub = await getQuery('SELECT id FROM channel_subscribers WHERE channel_id=? AND user_id=?', [d.channel_id, uid]);
    if (channel && (sub || channel.owner_id === uid)) socket.join(`channel_${d.channel_id}`);
  });
  socket.on('join-poll',    (d) => { if (d && d.poll_id)    socket.join(`poll_${d.poll_id}`); });
  socket.on('join-game',    (d) => { if (d && d.game_id)    socket.join(`game_${d.game_id}`); });

  /* ---- DISCONNECT ---- */
  socket.on('disconnect', async () => {
    const set = userSockets.get(uid);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {
        userSockets.delete(uid);
        onlineUsers.delete(uid);
        await runQuery('UPDATE users SET last_seen=? WHERE id=?', [Date.now(), uid]);
        try { await runQuery('UPDATE users SET last_seen=? WHERE id=?', [Date.now(), uid]); } catch (e) {}
        socket.broadcast.emit('presence', { userId: uid, online: false, last_seen: Date.now() });
        io.emit('online-count', { count: onlineUsers.size });
      }
    }
  });
});

/* ============================================================
   SHARED INTERNAL HELPERS
   ============================================================ */
let BOT_USER_ID = null;

async function deleteMessageInternal(uid, data) {
  const { id, deleteForEveryone } = data || {};
  const msg = await getQuery('SELECT * FROM messages WHERE id=?', [id]);
  if (!msg) throw new Error('Message not found');
  if (deleteForEveryone) {
    if (msg.from_user !== uid) throw new Error('Only sender can delete for everyone');
    await runQuery(`UPDATE messages SET deleted_for_everyone=1, message='', media_url=NULL WHERE id=?`, [id]);
    emitToUser(msg.to_user, 'message-deleted', { id, forEveryone: true });
    emitToUser(msg.from_user, 'message-deleted', { id, forEveryone: true });
  } else {
    if (msg.from_user !== uid && msg.to_user !== uid) throw new Error('Not your message');
    await runQuery('DELETE FROM messages WHERE id=?', [id]);
    emitToUser(msg.from_user, 'message-deleted', { id, forEveryone: false });
    if (msg.to_user !== msg.from_user) emitToUser(msg.to_user, 'message-deleted', { id, forEveryone: false });
  }
  return true;
}

/* reverse geocode via OpenStreetMap Nominatim (no API key) */
async function reverseGeocode(lat, lng) {
  if (!axios) return null;
  try {
    const r = await axios.get(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, { timeout: 5000, headers: { 'User-Agent': 'CSK4-Chat/5.0' } });
    const a = r.data && r.data.address || {};
    return [a.city || a.town || a.village || a.county, a.country].filter(Boolean).join(', ') || null;
  } catch { return null; }
}

/* ============================================================
   AI BOT BRAIN (local, no external API)
   ============================================================ */
function aiReply(text) {
  const t = String(text || '').toLowerCase().trim();
  if (!t) return 'Kuch likho na! 😄';
  if (/^(hi|hello|hey|salam|assalam|aoa|hola)\b/.test(t)) return 'Assalam-o-Alaikum! 👋 Main C$K4 Bot hoon. Aap kaise madad kar sakta hoon? Type "help" for commands.';
  if (/help|madad/.test(t)) return '🤖 C$K4 Bot Commands:\n• hello — greeting\n• time — current time\n• date — today\'s date\n• joke — random joke\n• weather <city> — weather info\n• poll question | opt1 | opt2 — create poll\n• game — tic-tac-toe\n• quote — motivation\n• bye — goodbye';
  if (/time|waqt/.test(t)) return `🕐 Abhi ka waqt: ${new Date().toLocaleTimeString()}`;
  if (/date|tareekh/.test(t)) return `📅 Aaj ki tareekh: ${new Date().toLocaleDateString()}`;
  if (/joke|latifa/.test(t)) {
    const jokes = [
      'Why do programmers prefer dark mode? Because light attracts bugs! 🐛',
      'User: "Mujhe simple chat app chahiye." Dev: 50 features add kar diya! 😂',
      'Why did the developer go broke? Because he used up all his cache! 💸',
      '404: Joke not found. Just kidding, ye hi joke thi! 😄',
      'Kali Linux user ne pucha: "WiFi kaise hack karein?" Bot: "Pehle apna router password yaad rakhna seekho!" 😆'
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
  }
  if (/weather|mausam/.test(t)) return `🌤️ Weather ke liye likho: "weather <city name>" — jaise "weather Karachi"`;
  const wm = t.match(/weather\s+(.+)/);
  if (wm) return `🌤️ "${wm[1]}" ka live weather lene ke liye Weather section use karo (OpenWeather API key .env me daalo). Abhi mausam: ${['Sunny ☀️','Cloudy ☁️','Rainy 🌧️','Windy 🌬️'][Math.floor(Math.random()*4)]} (demo)`;
  if (/quote|motivat/.test(t)) {
    const quotes = [
      '“Talk is cheap. Show me the code.” — Linus Torvalds 💻',
      '“First, solve the problem. Then, write the code.” — John Johnson',
      '“Programming isn\'t about what you know; it\'s about what you can figure out.” — Chris Pine',
      '“The best error message is the one that never shows up.” — Thomas Fuchs'
    ];
    return quotes[Math.floor(Math.random() * quotes.length)];
  }
  if (/name|naam|kaun|who/.test(t)) return 'Main C$K4 Bot hoon 🤖 — aap ka personal AI assistant jo bina internet bhi kaam karta hai!';
  if (/thank|shukriya/.test(t)) return 'Koi baat nahi! 😊 Koi aur madad chahiye to "help" likho.';
  if (/bye|khuda|alvida/.test(t)) return 'Allah Hafiz! 👋 Phir milenge. C$K4 Chat use karne ke liye shukriya!';
  if (/poll\s+.+\|/.test(t)) {
    const parts = t.split('|').map(s => s.trim()).filter(Boolean);
    const q = parts[0].replace(/^poll\s+/i, '');
    const opts = parts.slice(1);
    return `📊 Poll bana diya (demo):\nQ: ${q}\n${opts.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n\nReal poll banane ke liye chat me 📊 Poll button use karo!`;
  }
  if (/game|khel/.test(t)) return '🎮 Tic-tac-toe khelna hai? Chat options me 🎮 Game button dabao aur dost ko invite bhejo!';
  if (/\?/.test(t)) return 'Achha sawal! 🤔 Filhaal main simple commands samajhta hoon — "help" likho to saari commands dekh lo ge.';
  return `Aap ne kaha: "${text}" 🤖 Main abhi seekh raha hoon! "help" likho to commands dekho.`;
}

/* Tic-tac-toe winner check: returns 'X' | 'O' | null */
function checkWinnerTTT(board) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,b,c] of lines) {
    if (board[a] !== '-' && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

/* ============================================================
   REST APIs — AUTH
   ============================================================ */
app.post('/api/register', authLimiter, [
  body('username').trim().isLength({ min: 2, max: 30 }).escape(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password kam az kam 8 characters ka hona chahiye')
    .matches(/[A-Z]/).withMessage('Password me ek badda (uppercase) letter hona chahiye')
    .matches(/[a-z]/).withMessage('Password me ek chhota (lowercase) letter hona chahiye')
    .matches(/[0-9]/).withMessage('Password me ek number hona chahiye')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input', details: errors.array() });
  try {
    const { username, email, password } = req.body;
    const uname = clean(username), uemail = clean(email).toLowerCase();
    const existsName = await getQuery('SELECT id FROM users WHERE username=? COLLATE NOCASE', [uname]);
    if (existsName) return res.status(409).json({ error: 'Username already taken' });
    const existsMail = await getQuery('SELECT id FROM users WHERE email=?', [uemail]);
    if (existsMail) return res.status(409).json({ error: 'Email already registered' });
    const hash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    await runQuery(`INSERT INTO users (id, username, email, password, bio, phone, created_at, last_seen) VALUES (?,?,?,?,?,?,?,?)`,
      [id, uname, uemail, hash, 'Hey there! I am using C$K4 Chat! 🚀', '', Date.now(), Date.now()]);
    await audit(id, 'register', uname);

    // Auto-subscribe to official C$K4 channel
    const official = await getQuery(`SELECT id FROM channels WHERE name='C$K4' OR name='CSK4' LIMIT 1`);
    if (official) {
      await runQuery('INSERT OR IGNORE INTO channel_subscribers (channel_id, user_id, subscribed_at) VALUES (?,?,?)',
        [official.id, id, Date.now()]);
      await runQuery('UPDATE channels SET subscribers = (SELECT COUNT(*) FROM channel_subscribers WHERE channel_id=?) WHERE id=?',
        [official.id, official.id]);
    }

    // Do NOT broadcast full user list anymore (privacy)
    // io.emit('new-user-registered', ...) removed for privacy
    const token = jwt.sign({ id, username: uname, email: uemail, isAdmin: 0 }, JWT_SECRET, { expiresIn: TOKEN_TTL });
    res.status(201).json({ message: 'Account created successfully! 🎉', token, user: { id, username: uname, email: uemail, profile_pic: '', bio: 'Hey there! I am using C$K4 Chat! 🚀', isAdmin: 0 } });
  } catch (e) {
    console.error('[register]', e.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/login', authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 1 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input' });
  try {
    const { email, password, twofa_code } = req.body;
    const uemail = clean(email).toLowerCase();
    const user = await getQuery('SELECT * FROM users WHERE email=?', [uemail]);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
    if (user.two_fa_enabled) {
      const code = String(twofa_code || '').trim();
      if (!code) return res.status(200).json({ requires2FA: true, message: '2FA code required' });
      const valid = authenticator.check(code, user.two_fa_secret);
      if (!valid) return res.status(401).json({ error: 'Invalid 2FA code' });
    }
    const token = jwt.sign({ id: user.id, username: user.username, email: user.email, isAdmin: user.is_admin }, JWT_SECRET, { expiresIn: TOKEN_TTL });
    await runQuery('UPDATE users SET last_seen=? WHERE id=?', [Date.now(), user.id]);
    await audit(user.id, 'login', user.email);
    res.json({ message: `Welcome back, ${user.username}! 👋`, token, user: publicUser(user, { isSelf: true }) });
  } catch (e) {
    console.error('[login]', e.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

function publicUser(u, opts = {}) {
  const isAdminViewer = !!opts.isAdminViewer;
  const isSelf = !!opts.isSelf;
  const showEmail = isAdminViewer || isSelf || !!u.show_email;
  const showPhone = isAdminViewer || isSelf || !!u.show_phone;
  /* v16.4.4: last-seen privacy \u2014 'contacts' (default) = sirf accepted contacts,
     'everyone' = sab ko, 'nobody' = kisi ko nahi (khud + admin ko hamesha dikhe) */
  let showLastSeen = true;
  const privLastSeen = u.privacy_last_seen || 'everyone';
  if (!isSelf && !isAdminViewer) {
    if (privLastSeen === 'nobody') showLastSeen = false;
    else if (privLastSeen === 'contacts' && !opts.acceptedContact) showLastSeen = false;
  }
  return {
    id: u.id,
    username: u.username,
    email: showEmail ? (u.email || '') : '',
    profile_pic: u.profile_pic || '',
    bio: u.bio || '',
    phone: showPhone ? (u.phone || '') : '',
    isAdmin: !!u.is_admin,
    two_fa_enabled: !!u.two_fa_enabled,
    last_seen: showLastSeen ? (u.last_seen || 0) : 0,
    wallpaper: u.wallpaper || '',
    auto_reply_enabled: !!u.auto_reply_enabled,
    auto_reply_message: u.auto_reply_message || '',
    show_email: !!u.show_email,
    show_phone: !!u.show_phone,
    privacy: {
      last_seen: u.privacy_last_seen, profile_pic: u.privacy_profile_pic,
      status: u.privacy_status, about: u.privacy_about, groups: u.privacy_groups,
      stories: u.privacy_stories || 'contacts'
    },
    created_at: u.created_at
  };
}

/* v16.4.4: accepted-contact check \u2014 dono taraf se accepted request ya admin viewer */
async function isAcceptedContact(aId, bId) {
  if (aId === bId) return true;
  if (!aId || !bId) return false;
  const row = await getQuery(
    `SELECT id FROM chat_requests WHERE status='accepted' AND
     ((from_user=? AND to_user=?) OR (from_user=? AND to_user=?))`,
    [aId, bId, bId, aId]
  );
  return !!row;
}

/* v16.4.4: viewer ke saare accepted contacts ka Set (stories filter ke liye) */
async function getContactMap(uid) {
  const rows = await allQuery(
    `SELECT from_user, to_user FROM chat_requests WHERE status='accepted' AND (from_user=? OR to_user=?)`,
    [uid, uid]
  );
  const map = new Set();
  for (const r of rows) {
    map.add(r.from_user === uid ? r.to_user : r.from_user);
  }
  return map;
}

app.get('/api/me', authMiddleware, async (req, res) => {
  const user = await getQuery('SELECT * FROM users WHERE id=?', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(user, { isSelf: true }) });
});

app.post('/api/logout', authMiddleware, async (req, res) => {
  await audit(req.user.id, 'logout', '');
  res.json({ message: 'Logged out successfully' });
});

/* ---- 2FA (TOTP — Google Authenticator / Authy compatible) ---- */
app.post('/api/2fa/enable', authMiddleware, async (req, res) => {
  try {
    const secret = authenticator.generateSecret();
    const user = await getQuery('SELECT email, username FROM users WHERE id=?', [req.user.id]);
    const otpauth = authenticator.keyuri(user.email || user.username, 'C$K4 Chat', secret);
    const qr = await QRCode.toDataURL(otpauth);
    /* Save secret but keep two_fa_enabled=0 until the user verifies a code from their app */
    await runQuery('UPDATE users SET two_fa_secret=? WHERE id=?', [secret, req.user.id]);
    await audit(req.user.id, '2fa-enable-pending', '');
    res.json({ message: 'Google Authenticator / Authy se QR scan karke code verify karein', secret, qr });
  } catch (e) { res.status(500).json({ error: '2FA setup failed' }); }
});

app.post('/api/2fa/verify-enable', authMiddleware, async (req, res) => {
  try {
    const user = await getQuery('SELECT two_fa_secret FROM users WHERE id=?', [req.user.id]);
    if (!user || !user.two_fa_secret) return res.status(400).json({ error: 'Pehle /2fa/enable call karein' });
    const valid = authenticator.check(String(req.body.code || '').trim(), user.two_fa_secret);
    if (!valid) return res.status(401).json({ error: 'Invalid code — dobara try karein' });
    await runQuery('UPDATE users SET two_fa_enabled=1 WHERE id=?', [req.user.id]);
    await audit(req.user.id, '2fa-enable', '');
    res.json({ message: '2FA enabled ✅' });
  } catch (e) { res.status(500).json({ error: '2FA verification failed' }); }
});

app.post('/api/2fa/disable', authMiddleware, async (req, res) => {
  await runQuery("UPDATE users SET two_fa_enabled=0, two_fa_secret='' WHERE id=?", [req.user.id]);
  await audit(req.user.id, '2fa-disable', '');
  res.json({ message: '2FA disabled' });
});

app.post('/api/2fa/verify', authMiddleware, async (req, res) => {
  const user = await getQuery('SELECT * FROM users WHERE id=?', [req.user.id]);
  if (!user || !user.two_fa_enabled) return res.status(400).json({ error: '2FA not enabled' });
  const valid = authenticator.check(String(req.body.code || '').trim(), user.two_fa_secret);
  if (!valid) return res.status(401).json({ error: 'Invalid 2FA code' });
  res.json({ message: '2FA verified ✅' });
});

/* ============================================================
   PROFILE / SETTINGS APIs
   ============================================================ */
app.post('/api/profile', authMiddleware, upload.single('profile'), async (req, res) => {
  try {
    const { username, bio, phone } = req.body || {};
    let picPath = '';
    if (req.file) picPath = '/uploads/profiles/' + path.basename(req.file.path);
    const existing = await getQuery('SELECT * FROM users WHERE id=?', [req.user.id]);
    if (!existing) return res.status(404).json({ error: 'User not found' });
    const newUsername = username !== undefined ? clean(username) : existing.username;
    if (newUsername.length < 2 || newUsername.length > 30) {
      return res.status(400).json({ error: 'Username must be 2–30 characters' });
    }
    if (newUsername !== existing.username) {
      const taken = await getQuery('SELECT id FROM users WHERE username=? COLLATE NOCASE AND id<>?', [newUsername, req.user.id]);
      if (taken) return res.status(409).json({ error: 'Username already taken' });
    }
    await runQuery('UPDATE users SET username=?, bio=?, phone=?, profile_pic=? WHERE id=?',
      [newUsername, clean(bio || existing.bio || ''), clean(phone || existing.phone || ''), picPath || existing.profile_pic, req.user.id]);
    const user = await getQuery('SELECT * FROM users WHERE id=?', [req.user.id]);
    res.json({ message: 'Profile updated ✅', user: publicUser(user, { isSelf: true }) });
  } catch (e) { console.error('[profile]', e.message); res.status(500).json({ error: 'Profile update failed' }); }
});

app.post('/api/wallpaper', authMiddleware, upload.single('wallpaper'), async (req, res) => {
  try {
    let wp = clean(req.body.wallpaper || '');
    if (req.file) wp = '/uploads/wallpapers/' + path.basename(req.file.path);
    if (!wp) return res.status(400).json({ error: 'No wallpaper provided' });
    const target = req.body.chat_id || null;
    if (target) {
      await runQuery('UPDATE groups SET wallpaper=? WHERE id=? AND created_by=?', [wp, target, req.user.id]);
      res.json({ message: 'Group wallpaper updated ✅', wallpaper: wp, chat_id: target });
    } else {
      await runQuery('UPDATE users SET wallpaper=? WHERE id=?', [wp, req.user.id]);
      res.json({ message: 'Wallpaper updated ✅', wallpaper: wp });
    }
  } catch (e) { res.status(500).json({ error: 'Wallpaper update failed' }); }
});

app.post('/api/privacy', authMiddleware, async (req, res) => {
  const allowed = ['everyone', 'contacts', 'nobody'];
  const fields = ['last_seen', 'profile_pic', 'status', 'about', 'groups', 'stories'];
  try {
    const sets = [];
    const vals = [];
    for (const f of fields) {
      const v = clean(req.body[f] || '');
      if (v && allowed.includes(v)) { sets.push(`privacy_${f}=?`); vals.push(v); }
    }
    // show_email / show_phone toggles (0 or 1)
    if (req.body.show_email !== undefined) {
      sets.push('show_email=?');
      vals.push(req.body.show_email ? 1 : 0);
    }
    if (req.body.show_phone !== undefined) {
      sets.push('show_phone=?');
      vals.push(req.body.show_phone ? 1 : 0);
    }
    if (!sets.length) return res.status(400).json({ error: 'No valid privacy fields provided' });
    vals.push(req.user.id);
    await runQuery(`UPDATE users SET ${sets.join(', ')} WHERE id=?`, vals);
    const user = await getQuery('SELECT * FROM users WHERE id=?', [req.user.id]);
    res.json({
      message: 'Privacy settings saved ✅',
      privacy: publicUser(user, { isSelf: true }).privacy,
      show_email: !!user.show_email,
      show_phone: !!user.show_phone
    });
  } catch (e) { res.status(500).json({ error: 'Privacy update failed' }); }
});

app.post('/api/auto-reply', authMiddleware, async (req, res) => {
  const enabled = req.body.enabled ? 1 : 0;
  const msg = clean(req.body.message || '') || 'I am currently away. I will reply soon! 🚀';
  await runQuery('UPDATE users SET auto_reply_enabled=?, auto_reply_message=? WHERE id=?', [enabled, msg, req.user.id]);
  res.json({ message: enabled ? 'Auto-reply enabled ✅' : 'Auto-reply disabled', enabled: !!enabled, auto_reply_message: msg });
});

app.get('/api/quick-reply', authMiddleware, async (req, res) => {
  const rows = await allQuery('SELECT * FROM quick_replies WHERE user_id=? ORDER BY created_at DESC', [req.user.id]);
  res.json({ quickReplies: rows });
});

app.post('/api/quick-reply', authMiddleware, async (req, res) => {
  const shortcut = clean(req.body.shortcut || '');
  const message = clean(req.body.message || '');
  if (!shortcut || !message) return res.status(400).json({ error: 'Shortcut and message required' });
  try {
    await runQuery('INSERT INTO quick_replies (id, user_id, shortcut, message, created_at) VALUES (?,?,?,?,?)',
      [uuidv4(), req.user.id, shortcut, message, Date.now()]);
    res.status(201).json({ message: 'Quick reply saved ✅' });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Shortcut already exists' });
    res.status(500).json({ error: 'Failed to save' });
  }
});

app.delete('/api/quick-reply/:id', authMiddleware, async (req, res) => {
  await runQuery('DELETE FROM quick_replies WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
  res.json({ message: 'Quick reply deleted' });
});

/* ============================================================
   USERS / SOCIAL APIs
   ============================================================ */
app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    const search = clean(req.query.search || '').trim();
    const me = await getQuery('SELECT is_admin FROM users WHERE id=?', [req.user.id]);
    const isAdmin = !!(me && me.is_admin);

    // Admin can see full list / search with email+phone
    if (isAdmin) {
      let rows;
      if (search) {
        rows = await allQuery(
          `SELECT id, username, email, profile_pic, bio, phone, last_seen, is_admin, show_email, show_phone
           FROM users WHERE (username LIKE ? OR email LIKE ?) AND id<>? ORDER BY username LIMIT 100`,
          [`%${search}%`, `%${search}%`, req.user.id]
        );
      } else {
        rows = await allQuery(
          `SELECT id, username, email, profile_pic, bio, phone, last_seen, is_admin, show_email, show_phone
           FROM users WHERE id<>? ORDER BY username LIMIT 200`,
          [req.user.id]
        );
      }
      rows.forEach(u => {
        u.online = isOnline(u.id);
        Object.assign(u, publicUser(u, { isAdminViewer: true }));
      });
      return res.json({ users: rows });
    }

    // Normal users: ONLY search by username (no public list)
    if (!search || search.length < 2) {
      return res.json({ users: [], message: 'Username search required (min 2 characters)' });
    }

    const rows = await allQuery(
      `SELECT id, username, profile_pic, bio, last_seen, is_admin, show_email, show_phone, email, phone
       FROM users WHERE username LIKE ? COLLATE NOCASE AND id<>? ORDER BY username LIMIT 20`,
      [`%${search}%`, req.user.id]
    );

    const result = [];
    for (const u of rows) {
      // check request status
      const reqRow = await getQuery(
        `SELECT status FROM chat_requests WHERE (from_user=? AND to_user=?) OR (from_user=? AND to_user=?)`,
        [req.user.id, u.id, u.id, req.user.id]
      );
      const status = reqRow ? reqRow.status : null;
      result.push({
        id: u.id,
        username: u.username,
        profile_pic: u.profile_pic || '',
        bio: u.bio || '',
        online: isOnline(u.id),
        isAdmin: !!u.is_admin,
        request_status: status, // null | pending | accepted | rejected | blocked
        email: u.show_email ? u.email : '',
        phone: u.show_phone ? u.phone : ''
      });
    }
    res.json({ users: result });
  } catch (e) {
    console.error('[users]', e.message);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/api/user/:userId', authMiddleware, async (req, res) => {
  const u = await getQuery('SELECT * FROM users WHERE id=?', [req.params.userId]);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const me = await getQuery('SELECT is_admin FROM users WHERE id=?', [req.user.id]);
  const isAdmin = !!(me && me.is_admin);
  const isSelf = u.id === req.user.id;
  const blocked = await getQuery('SELECT id FROM blocked_users WHERE user_id=? AND blocked_user=?', [req.user.id, u.id]);
  const reqRow = await getQuery(
    `SELECT status FROM chat_requests WHERE (from_user=? AND to_user=?) OR (from_user=? AND to_user=?)`,
    [req.user.id, u.id, u.id, req.user.id]
  );
  /* v16.4.4: last-seen privacy \u2014 viewer accepted contact hai to dikhe */
  const accepted = await isAcceptedContact(req.user.id, u.id);
  res.json({
    user: publicUser(u, { isAdminViewer: isAdmin, isSelf, acceptedContact: accepted }),
    online: isOnline(u.id),
    blocked_by_me: !!blocked,
    request_status: reqRow ? reqRow.status : null
  });
});

app.post('/api/block', authMiddleware, async (req, res) => {
  const target = clean(req.body.userId || '');
  if (!target || target === req.user.id) return res.status(400).json({ error: 'Invalid target' });
  try {
    await runQuery('INSERT OR IGNORE INTO blocked_users (user_id, blocked_user, created_at) VALUES (?,?,?)', [req.user.id, target, Date.now()]);
    await audit(req.user.id, 'block-user', target);
    res.json({ message: 'User blocked 🚫' });
  } catch (e) { res.status(500).json({ error: 'Block failed' }); }
});

app.post('/api/unblock', authMiddleware, async (req, res) => {
  const target = clean(req.body.userId || '');
  await runQuery('DELETE FROM blocked_users WHERE user_id=? AND blocked_user=?', [req.user.id, target]);
  res.json({ message: 'User unblocked ✅' });
});

app.get('/api/blocked', authMiddleware, async (req, res) => {
  const rows = await allQuery(`SELECT b.blocked_user AS id, u.username, u.profile_pic
    FROM blocked_users b JOIN users u ON u.id=b.blocked_user WHERE b.user_id=?`, [req.user.id]);
  res.json({ blocked: rows });
});

/* ============================================================
   MESSAGE REQUEST SYSTEM (Privacy)
   ============================================================ */
async function canMessage(fromId, toId) {
  if (fromId === toId) return false;
  // Bot always allowed
  if (toId === BOT_USER_ID || fromId === BOT_USER_ID) return true;
  // Admin can message anyone
  const from = await getQuery('SELECT is_admin FROM users WHERE id=?', [fromId]);
  if (from && from.is_admin) return true;
  // Accepted request (either direction)
  const accepted = await getQuery(
    `SELECT id FROM chat_requests WHERE status='accepted' AND
     ((from_user=? AND to_user=?) OR (from_user=? AND to_user=?))`,
    [fromId, toId, toId, fromId]
  );
  return !!accepted;
}

app.post('/api/request', authMiddleware, async (req, res) => {
  try {
    const to = clean(req.body.to_user || req.body.userId || '');
    if (!to || to === req.user.id) return res.status(400).json({ error: 'Invalid user' });
    const target = await getQuery('SELECT id, username FROM users WHERE id=?', [to]);
    if (!target) return res.status(404).json({ error: 'User not found' });

    // v5.3.1 FIX: agar maine target ko block kiya hai → pehle unblock karo
    const iBlocked = await getQuery('SELECT id FROM blocked_users WHERE user_id=? AND blocked_user=?', [req.user.id, to]);
    if (iBlocked) return res.status(403).json({ error: 'Aap ne is user ko block kiya hai. Pehle unblock karo.' });

    // v5.3.1 FIX: agar target ne mujhe block kiya hai → request allowed nahi (privacy)
    const theyBlocked = await getQuery('SELECT id FROM blocked_users WHERE user_id=? AND blocked_user=?', [to, req.user.id]);
    if (theyBlocked) return res.status(403).json({ error: 'Request send nahi ho sakti' });

    // Check existing
    const existing = await getQuery(
      `SELECT * FROM chat_requests WHERE (from_user=? AND to_user=?) OR (from_user=? AND to_user=?)`,
      [req.user.id, to, to, req.user.id]
    );
    if (existing) {
      if (existing.status === 'accepted') return res.json({ message: 'Already connected', status: 'accepted' });
      if (existing.status === 'blocked') return res.status(403).json({ error: 'You cannot send request to this user' });
      if (existing.status === 'pending' && existing.from_user === req.user.id) {
        return res.json({ message: 'Request already pending', status: 'pending' });
      }
      // v5.3.1 FIX: reverse-pending (dono ne ek doosre ko request bheji) → AUTO-ACCEPT
      // Pehle yahan row ko silently flip kar dete the — isliye "request accept nahi hoti" jaisa error lagta tha.
      if (existing.status === 'pending' && existing.from_user === to) {
        await runQuery(`UPDATE chat_requests SET status='accepted', updated_at=? WHERE id=?`, [Date.now(), existing.id]);
        await pushNotification(to, 'request_accepted', 'Request Accepted 🤝', `${req.user.username || 'User'} ne bhi request bheji — aap dono ab connected ho!`, { user_id: req.user.id });
        await audit(req.user.id, 'request-auto-accept', to);
        return res.json({ message: 'Dono ne request bheji — auto-accept ho gayi ✅ Ab chat shuru karo!', status: 'accepted' });
      }
      // Rejected → allow new request
      if (existing.status === 'rejected') {
        await runQuery(
          `UPDATE chat_requests SET from_user=?, to_user=?, status='pending', updated_at=? WHERE id=?`,
          [req.user.id, to, Date.now(), existing.id]
        );
        await pushNotification(to, 'request', 'Chat Request', `${req.user.username || 'Someone'} ne chat request bheji`, { from_user: req.user.id, request_id: existing.id });
        return res.json({ message: 'Request sent ✅', status: 'pending' });
      }
    }

    const id = uuidv4();
    await runQuery(
      `INSERT INTO chat_requests (id, from_user, to_user, status, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
      [id, req.user.id, to, 'pending', Date.now(), Date.now()]
    );
    await pushNotification(to, 'request', 'Chat Request', `${req.user.username || 'Someone'} ne chat request bheji`, { from_user: req.user.id, request_id: id });
    await audit(req.user.id, 'chat-request', to);
    res.status(201).json({ message: 'Request sent ✅', status: 'pending', request_id: id });
  } catch (e) {
    console.error('[request]', e.message);
    res.status(500).json({ error: 'Failed to send request' });
  }
});

app.post('/api/request/accept', authMiddleware, async (req, res) => {
  try {
    const from = clean(req.body.from_user || req.body.userId || '');
    if (!from) return res.status(400).json({ error: 'from_user required' });
    // v5.3.1: dono directions dhundo — reverse-pending (B ne A ko bheji thi) bhi accept ho sakti hai
    const row = await getQuery(
      `SELECT * FROM chat_requests WHERE ((from_user=? AND to_user=?) OR (from_user=? AND to_user=?))`,
      [from, req.user.id, req.user.id, from]
    );
    if (!row) return res.status(404).json({ error: 'No pending request found' });
    if (row.status === 'accepted') return res.json({ message: 'Already accepted ✅', status: 'accepted' });
    if (row.status !== 'pending') return res.status(409).json({ error: 'Request ab pending nahi hai (reject/block ho chuki)' });
    await runQuery(`UPDATE chat_requests SET status='accepted', updated_at=? WHERE id=?`, [Date.now(), row.id]);
    await pushNotification(from, 'request_accepted', 'Request Accepted 🤝', `${req.user.username || 'User'} ne aapki request accept kar li — ab chat shuru karo!`, { user_id: req.user.id });
    await audit(req.user.id, 'request-accept', from);
    res.json({ message: 'Request accepted ✅', status: 'accepted' });
  } catch (e) {
    console.error('[request-accept]', e.message);
    res.status(500).json({ error: 'Failed to accept' });
  }
});

app.post('/api/request/reject', authMiddleware, async (req, res) => {
  try {
    const from = clean(req.body.from_user || req.body.userId || '');
    if (!from) return res.status(400).json({ error: 'from_user required' });
    const row = await getQuery(
      `SELECT * FROM chat_requests WHERE from_user=? AND to_user=? AND status='pending'`,
      [from, req.user.id]
    );
    if (!row) return res.status(404).json({ error: 'No pending request found' });
    await runQuery(`UPDATE chat_requests SET status='rejected', updated_at=? WHERE id=?`, [Date.now(), row.id]);
    await audit(req.user.id, 'request-reject', from);
    res.json({ message: 'Request rejected', status: 'rejected' });
  } catch (e) {
    console.error('[request-reject]', e.message);
    res.status(500).json({ error: 'Failed to reject' });
  }
});

app.post('/api/request/block', authMiddleware, async (req, res) => {
  try {
    const from = clean(req.body.from_user || req.body.userId || '');
    if (!from) return res.status(400).json({ error: 'user required' });
    // Mark request as blocked + add to blocked_users
    const row = await getQuery(
      `SELECT * FROM chat_requests WHERE (from_user=? AND to_user=?) OR (from_user=? AND to_user=?)`,
      [from, req.user.id, req.user.id, from]
    );
    if (row) {
      await runQuery(`UPDATE chat_requests SET status='blocked', updated_at=? WHERE id=?`, [Date.now(), row.id]);
    } else {
      await runQuery(
        `INSERT INTO chat_requests (id, from_user, to_user, status, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
        [uuidv4(), from, req.user.id, 'blocked', Date.now(), Date.now()]
      );
    }
    await runQuery('INSERT OR IGNORE INTO blocked_users (user_id, blocked_user, created_at) VALUES (?,?,?)', [req.user.id, from, Date.now()]);
    await audit(req.user.id, 'request-block', from);
    res.json({ message: 'User blocked. They cannot send request again 🚫' });
  } catch (e) {
    console.error('[request-block]', e.message);
    res.status(500).json({ error: 'Failed to block' });
  }
});

app.get('/api/requests', authMiddleware, async (req, res) => {
  try {
    const incoming = await allQuery(
      `SELECT r.*, u.username, u.profile_pic FROM chat_requests r
       JOIN users u ON u.id = r.from_user
       WHERE r.to_user=? AND r.status='pending' ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    const outgoing = await allQuery(
      `SELECT r.*, u.username, u.profile_pic FROM chat_requests r
       JOIN users u ON u.id = r.to_user
       WHERE r.from_user=? AND r.status='pending' ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    const accepted = await allQuery(
      `SELECT r.*, 
         CASE WHEN r.from_user=? THEN u2.username ELSE u1.username END AS username,
         CASE WHEN r.from_user=? THEN u2.profile_pic ELSE u1.profile_pic END AS profile_pic,
         CASE WHEN r.from_user=? THEN r.to_user ELSE r.from_user END AS other_user
       FROM chat_requests r
       JOIN users u1 ON u1.id = r.from_user
       JOIN users u2 ON u2.id = r.to_user
       WHERE r.status='accepted' AND (r.from_user=? OR r.to_user=?)
       ORDER BY r.updated_at DESC LIMIT 100`,
      [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]
    );
    res.json({ incoming, outgoing, accepted });
  } catch (e) {
    console.error('[requests]', e.message);
    res.status(500).json({ error: 'Failed to load requests' });
  }
});

app.post('/api/report', authMiddleware, async (req, res) => {
  const { message_id, reported_user, reason } = req.body || {};
  const rsn = clean(reason || 'No reason provided');
  if (!message_id && !reported_user) return res.status(400).json({ error: 'Message or user required to report' });
  await runQuery(`INSERT INTO reports (id, reporter_id, message_id, reported_user, reason, created_at) VALUES (?,?,?,?,?,?)`,
    [uuidv4(), req.user.id, message_id ? clean(message_id) : null, reported_user ? clean(reported_user) : null, rsn, Date.now()]);
  await audit(req.user.id, 'report', rsn);
  res.status(201).json({ message: 'Report submitted ✅ Admins will review it.' });
});

/* ---- NOTIFICATIONS ---- */
app.get('/api/notifications', authMiddleware, async (req, res) => {
  const rows = await allQuery('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100', [req.user.id]);
  const unread = rows.filter(r => !r.read).length;
  res.json({ notifications: rows, unread });
});

app.post('/api/notifications/read', authMiddleware, async (req, res) => {
  if (req.body && req.body.id) {
    await runQuery('UPDATE notifications SET read=1 WHERE id=? AND user_id=?', [req.body.id, req.user.id]);
  } else {
    await runQuery('UPDATE notifications SET read=1 WHERE user_id=?', [req.user.id]);
  }
  res.json({ message: 'Notifications marked read' });
});

/* ============================================================
   MESSAGING APIs
   ============================================================ */
function decorateMessage(row) {
  if (!row) return row;
  const out = { ...row };
  out.message = decryptText(row.message);
  return out;
}

async function attachReactions(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return list;
  const ids = list.map(row => row.id).filter(Boolean);
  const marks = ids.map(() => '?').join(',');
  const reactions = await allQuery(`SELECT message_id, emoji, user_id FROM message_reactions WHERE message_id IN (${marks})`, ids);
  const byMessage = {};
  reactions.forEach(r => {
    byMessage[r.message_id] ||= {};
    byMessage[r.message_id][r.emoji] ||= [];
    byMessage[r.message_id][r.emoji].push(r.user_id);
  });
  return list.map(row => ({ ...row, reactions: byMessage[row.id] || {} }));
}

/* ============================================================
   v5.4.0: INBOX — last message + unread count (DM + groups + channels)
   ============================================================ */
app.get('/api/inbox', authMiddleware, async (req, res) => {
  try {
    const uid = req.user.id;
    const out = { dms: [], groups: [], channels: [] };
    /* DMs: accepted contacts ka last message + unread (seen=0, other ne bheja) */
    const dms = await allQuery(`
      SELECT m.from_user AS peer, m.id, m.message, m.type, m.media_url, m.media_name, m.timestamp, m.seen, m.deleted_for_everyone,
             (SELECT COUNT(*) FROM messages x WHERE x.from_user=m.from_user AND x.to_user=? AND x.seen=0 AND x.deleted_for_everyone=0) AS unread,
             (SELECT username FROM users uu WHERE uu.id=m.from_user) AS username,
             (SELECT profile_pic FROM users uu WHERE uu.id=m.from_user) AS profile_pic
      FROM messages m
      WHERE m.id IN (
        SELECT MAX(id) FROM messages
        WHERE (from_user=? AND to_user IN (SELECT from_user FROM chat_requests WHERE to_user=? AND status='accepted' UNION SELECT to_user FROM chat_requests WHERE from_user=? AND status='accepted'))
           OR (to_user=? AND from_user IN (SELECT from_user FROM chat_requests WHERE to_user=? AND status='accepted' UNION SELECT to_user FROM chat_requests WHERE from_user=? AND status='accepted'))
        GROUP BY CASE WHEN from_user=? THEN to_user ELSE from_user END
      ) ORDER BY m.timestamp DESC`, [uid, uid, uid, uid, uid, uid, uid]);
    for (const d of dms) { if (d.type === 'text' && !d.deleted_for_everyone) d.message = decryptText(d.message); } /* v5.4.0: preview decrypt */
    for (const d of dms) {
      if (d.peer === uid) continue; /* safety */
      out.dms.push({
        peer: d.peer, username: d.username, profile_pic: d.profile_pic, online: isOnline(d.peer),
        last: { text: d.deleted_for_everyone ? '🚫 deleted' : (d.type === 'text' ? (d.message || '') : previewText(d.type, d.media_name)), ts: d.timestamp, type: d.type },
        unread: d.unread || 0
      });
    }
    /* Groups: membership ka last message + unread (msg-seen tracking nahi hai per-user, total unseen count by last visit timestamp) */
    const grps = await allQuery(`
      SELECT g.id AS group_id, g.name, g.avatar, g.post_mode,
             (SELECT gm.message FROM group_messages gm WHERE gm.group_id=g.id AND gm.deleted_for_everyone=0 ORDER BY gm.timestamp DESC LIMIT 1) AS last_message,
             (SELECT gm.type FROM group_messages gm WHERE gm.group_id=g.id AND gm.deleted_for_everyone=0 ORDER BY gm.timestamp DESC LIMIT 1) AS last_type,
             (SELECT gm.media_name FROM group_messages gm WHERE gm.group_id=g.id AND gm.deleted_for_everyone=0 ORDER BY gm.timestamp DESC LIMIT 1) AS last_media,
             (SELECT gm.timestamp FROM group_messages gm WHERE gm.group_id=g.id AND gm.deleted_for_everyone=0 ORDER BY gm.timestamp DESC LIMIT 1) AS last_ts,
             (SELECT COUNT(*) FROM group_members x WHERE x.group_id=g.id) AS member_count,
             (SELECT gm.role FROM group_members gm WHERE gm.group_id=g.id AND gm.user_id=?) AS my_role,
             (SELECT can_post FROM group_members gm WHERE gm.group_id=g.id AND gm.user_id=?) AS can_post,
             (SELECT COUNT(*) FROM group_messages gm WHERE gm.group_id=g.id AND gm.sender_id<>? AND gm.timestamp > COALESCE((SELECT last_read FROM group_members WHERE group_id=g.id AND user_id=?),0) AND gm.deleted_for_everyone=0) AS unread
      FROM groups g JOIN group_members mm ON mm.group_id=g.id AND mm.user_id=?
      ORDER BY last_ts DESC`, [uid, uid, uid, uid, uid]);
    for (const g of grps) {
      const grpLastText = (g.last_type === 'text' && g.last_message) ? decryptText(g.last_message) : null; /* v5.4.0: preview decrypt */
      out.groups.push({
        group_id: g.group_id, name: g.name, avatar: g.avatar, member_count: g.member_count, my_role: g.my_role || 'member',
        can_post: g.can_post === null ? 1 : g.can_post,
        post_mode: g.post_mode === null || g.post_mode === undefined ? 'all' : g.post_mode, /* v5.4.0: expose posting mode */
        last: g.last_ts ? { text: grpLastText !== null ? grpLastText : (g.last_message ? previewText(g.last_type, g.last_media) : ''), ts: g.last_ts, type: g.last_type } : null,
        unread: g.unread || 0
      });
    }
    /* Channels: subscribed ka last post */
    const chs = await allQuery(`
      SELECT c.id AS channel_id, c.name, c.description, c.avatar,
             (SELECT cm.message FROM channel_messages cm WHERE cm.channel_id=c.id ORDER BY cm.timestamp DESC LIMIT 1) AS last_message,
             (SELECT cm.type FROM channel_messages cm WHERE cm.channel_id=c.id ORDER BY cm.timestamp DESC LIMIT 1) AS last_type,
             (SELECT cm.timestamp FROM channel_messages cm WHERE cm.channel_id=c.id ORDER BY cm.timestamp DESC LIMIT 1) AS last_ts,
             (SELECT COUNT(*) FROM channel_subscribers x WHERE x.channel_id=c.id) AS sub_count
      FROM channels c JOIN channel_subscribers cs2 ON cs2.channel_id=c.id AND cs2.user_id=?
      ORDER BY last_ts DESC`, [uid]);
    for (const c of chs) {
      const chLastText = (c.last_type === 'text' && c.last_message) ? decryptText(c.last_message) : null; /* v5.4.0: preview decrypt */
      out.channels.push({
        channel_id: c.channel_id, name: c.name, description: c.description, avatar: c.avatar || '', sub_count: c.sub_count,
        last: c.last_ts ? { text: chLastText !== null ? chLastText : (c.last_message ? previewText(c.last_type, '') : ''), ts: c.last_ts, type: c.last_type } : null
      });
    }
    res.json(out);
  } catch (e) {
    console.error('[inbox]', e.message);
    res.status(500).json({ error: 'Inbox load failed' });
  }
});

function previewText(type, mediaName) {
  switch (String(type || '')) {
    case 'image': return '📷 Photo';
    case 'video': return '🎬 Video';
    case 'audio': case 'voice': return '🎵 Audio';
    case 'file': return '📎 ' + (mediaName || 'File');
    case 'poll': return '📊 Poll';
    case 'location': return '📍 Location';
    default: return '📎 Attachment';
  }
}

app.get('/api/messages/:userId', authMiddleware, async (req, res) => {
  try {
    const other = req.params.userId;
    if (!other || other === req.user.id) return res.status(400).json({ error: 'Invalid chat user' });
    const otherUser = await getQuery('SELECT id FROM users WHERE id=?', [other]);
    if (!otherUser) return res.status(404).json({ error: 'User not found' });
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, parseInt(req.query.limit || '50', 10));
    const offset = (page - 1) * limit;
    const rows = await allQuery(`SELECT * FROM messages
      WHERE ((from_user=? AND to_user=?) OR (from_user=? AND to_user=?)) AND scheduled_at<=?
      ORDER BY is_pinned DESC, timestamp DESC LIMIT ? OFFSET ?`,
      [req.user.id, other, other, req.user.id, Date.now(), limit, offset]);
    const total = await getQuery(`SELECT COUNT(*) AS c FROM messages
      WHERE ((from_user=? AND to_user=?) OR (from_user=? AND to_user=?))`, [req.user.id, other, other, req.user.id]);
    res.json({ messages: await attachReactions(rows.reverse().map(decorateMessage)), page, limit, total: total.c, hasMore: offset + rows.length < total.c });
  } catch (e) { console.error('[messages]', e.message); res.status(500).json({ error: 'Failed to load messages' }); }
});

app.post('/api/edit-message', authMiddleware, async (req, res) => {
  const { id, message } = req.body || {};
  const nextMessage = clean(message || '');
  if (!nextMessage || nextMessage.length > 4000) return res.status(400).json({ error: 'Message must be 1–4000 characters' });
  const msg = await getQuery('SELECT * FROM messages WHERE id=?', [id]);
  if (!msg || msg.from_user !== req.user.id) return res.status(403).json({ error: 'Cannot edit this message' });
  if (Date.now() - msg.timestamp > 15 * 60 * 1000) return res.status(400).json({ error: 'Edit window (15 min) expired' });
  await runQuery('UPDATE messages SET message=?, edited=1 WHERE id=?', [encryptText(nextMessage), id]);
  emitToUser(msg.to_user, 'message-edited', { id, message: nextMessage, edited: true });
  emitToUser(req.user.id, 'message-edited', { id, message: nextMessage, edited: true });
  res.json({ message: 'Message edited ✅' });
});

/* delete for me / for everyone — REST version */
app.post('/api/delete-for-everyone', authMiddleware, async (req, res) => {
  try {
    const { id } = req.body || {};
    const msg = await getQuery('SELECT * FROM messages WHERE id=?', [id]);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (msg.from_user !== req.user.id) return res.status(403).json({ error: 'Only sender can delete for everyone' });
    await runQuery('UPDATE messages SET deleted_for_everyone=1, message=\'\', media_url=NULL WHERE id=?', [id]);
    emitToUser(msg.to_user, 'message-deleted', { id, forEveryone: true });
    res.json({ message: 'Deleted for everyone 🗑️' });
  } catch (e) { res.status(500).json({ error: 'Delete failed' }); }
});

app.post('/api/delete-for-me', authMiddleware, async (req, res) => {
  try {
    const { id } = req.body || {};
    const msg = await getQuery('SELECT * FROM messages WHERE id=?', [id]);
    if (!msg) return res.status(404).json({ error: 'Message not not found' });
    if (msg.from_user !== req.user.id && msg.to_user !== req.user.id) return res.status(403).json({ error: 'Not your message' });
    await runQuery('DELETE FROM messages WHERE id=?', [id]);
    res.json({ message: 'Deleted for you ✅' });
  } catch (e) { res.status(500).json({ error: 'Delete failed' }); }
});

app.post('/api/view-once', authMiddleware, async (req, res) => {
  try {
    const { id } = req.body || {};
    const msg = await getQuery('SELECT * FROM messages WHERE id=?', [id]);
    const groupMsg = msg ? null : await getQuery('SELECT * FROM group_messages WHERE id=?', [id]);
    if (!msg && !groupMsg) return res.status(404).json({ error: 'Message not found' });
    if (groupMsg) {
      const member = await getQuery('SELECT user_id FROM group_members WHERE group_id=? AND user_id=?', [groupMsg.group_id, req.user.id]);
      if (!member) return res.status(403).json({ error: 'Not a group member' });
      if (groupMsg.sender_id !== req.user.id && groupMsg.viewed) return res.status(400).json({ error: 'Already viewed — content removed' });
      await runQuery('UPDATE group_messages SET viewed=1 WHERE id=?', [id]);
      io.to(`group_${groupMsg.group_id}`).emit('view-once-opened', { id, by: req.user.id });
    } else {
      if (msg.to_user !== req.user.id && msg.from_user !== req.user.id) return res.status(403).json({ error: 'Not your message' });
      if (msg.to_user === req.user.id && msg.viewed) return res.status(400).json({ error: 'Already viewed — content removed' });
      await runQuery('UPDATE messages SET viewed=1 WHERE id=?', [id]);
      if (msg.to_user === req.user.id) emitToUser(msg.from_user, 'view-once-opened', { id, by: req.user.id });
    }
    const source = msg || groupMsg;
    const responsePayload = { message: decryptText(source.message), media_url: source.media_url, type: source.type, duration: source.duration, media_name: source.media_name, media_size: source.media_size };

    /* Actually delete the media from disk + scrub DB so it can never be fetched again.
       Only do this for the recipient's view (not the sender re-checking their own sent message). */
    const isRecipientViewing = groupMsg ? (groupMsg.sender_id !== req.user.id) : (msg.to_user === req.user.id);
    if (isRecipientViewing && source.media_url) {
      const relative = String(source.media_url).replace(/^\/uploads\//, '');
      const fullPath = path.join(UPLOADS, relative);
      fse.remove(fullPath).catch(() => {});
      if (groupMsg) {
        await runQuery(`UPDATE group_messages SET media_url=NULL, message='' WHERE id=?`, [id]);
      } else {
        await runQuery(`UPDATE messages SET media_url=NULL, message='' WHERE id=?`, [id]);
      }
    }

    res.json(responsePayload);
  } catch (e) { res.status(500).json({ error: 'View once failed' }); }
});

app.get('/api/search/messages', authMiddleware, async (req, res) =>  {
  const q = clean(req.query.q || '');
  if (!q) return res.status(400).json({ error: 'Search query required' });
  const like = `%${q}%`;
  const rows = await allQuery(`SELECT m.*, u.username AS sender_name FROM messages m JOIN users u ON u.id = m.from_user
    WHERE (m.from_user=? OR m.to_user=?) AND m.message LIKE ? ORDER BY m.timestamp DESC LIMIT 50`,
    [req.user.id, req.user.id, like]);
  res.json({ results: rows.map(decorateMessage), query: q });
});

app.post('/api/pin', authMiddleware, async (req, res) => {
  try {
    const { id } = req.body || {};
    const msg = await getQuery('SELECT * FROM messages WHERE id=?', [id]);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (msg.from_user !== req.user.id && msg.to_user !== req.user.id) return res.status(403).json({ error: 'Not your message' });
    await runQuery('UPDATE messages SET is_pinned = 1 - is_pinned WHERE id=?', [id]);
    const fresh = await getQuery('SELECT is_pinned FROM messages WHERE id=?', [id]);
    [msg.from_user, msg.to_user].forEach(u => emitToUser(u, 'message-pinned', { id, is_pinned: !!fresh.is_pinned }));
    res.json({ message: fresh.is_pinned ? 'Message pinned 📌' : 'Message unpinned', is_pinned: !!fresh.is_pinned });
  } catch (e) { res.status(500).json({ error: 'Pin failed' }); }
});

app.post('/api/forward', authMiddleware, async (req, res) => {
  try {
    const { message_id, to } = req.body || {};
    const targets = Array.isArray(to) ? to : [to];
    const msg = await getQuery('SELECT * FROM messages WHERE id=?', [message_id]);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    let count = 0;
    for (const t of targets) {
      const tt = String(t || '');
      if (!tt) continue;
      const nid = uuidv4();
      await runQuery(`INSERT INTO messages (id, from_user, to_user, message, type, media_url, media_name, media_size, duration, forwarded, view_once, timestamp)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [nid, req.user.id, tt, msg.message, msg.type, msg.media_url, msg.media_name, msg.media_size, msg.duration, 1, 0, Date.now()]);
      const fwd = { id: nid, from_user: req.user.id, to_user: tt, message: decryptText(msg.message), type: msg.type, media_url: msg.media_url, media_name: msg.media_name, duration: msg.duration, forwarded: true, timestamp: Date.now() };
      if (isOnline(tt)) { emitToUser(tt, 'new-message', fwd); await runQuery('UPDATE messages SET delivered=1 WHERE id=?', [nid]); }
      else await runQuery(`INSERT INTO offline_messages (id, from_user, to_user, message, type, media_url, payload, created_at) VALUES (?,?,?,?,?,?,?,?)`,
        [nid, req.user.id, tt, msg.message, msg.type, msg.media_url, JSON.stringify({ media_name: msg.media_name, duration: msg.duration, forwarded: true }), Date.now()]);
      count++;
    }
    res.json({ message: `Forwarded to ${count} chat(s) ✅` });
  } catch (e) { console.error('[forward]', e.message); res.status(500).json({ error: 'Forward failed' }); }
});

app.post('/api/schedule', authMiddleware, async (req, res) => {
  try {
    const { to, message, send_at } = req.body || {};
    const tt = String(to || '');
    const msgTxt = clean(message || '');
    const when = new Date(send_at).getTime();
    if (!tt || !msgTxt) return res.status(400).json({ error: 'Target and message required' });
    if (!when || isNaN(when) || when <= Date.now()) return res.status(400).json({ error: 'Send time must be in future' });
    const id = uuidv4();
    await runQuery(`INSERT INTO scheduled_messages (id, from_user, to_user, message, scheduled_at, created_at) VALUES (?,?,?,?,?,?)`,
      [id, req.user.id, tt, encryptText(msgTxt), when, Date.now()]);
    res.status(201).json({ message: `Message scheduled for ${new Date(when).toLocaleString()} ⏰` });
  } catch (e) { res.status(500).json({ error: 'Schedule failed' }); }
});

app.get('/api/scheduled', authMiddleware, async (req, res) => {
  const rows = await allQuery('SELECT * FROM scheduled_messages WHERE from_user=? AND sent=0 ORDER BY scheduled_at', [req.user.id]);
  res.json({ scheduled: rows.map(decorateMessage) });
});

app.delete('/api/schedule/:id', authMiddleware, async (req, res) => {
  await runQuery('DELETE FROM scheduled_messages WHERE id=? AND from_user=?', [req.params.id, req.user.id]);
  res.json({ message: 'Scheduled message cancelled' });
});

/* ============================================================
   GROUPS APIs
   ============================================================ */
app.post('/api/group', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    // Only Admin can create groups
    const me = await getQuery('SELECT is_admin FROM users WHERE id=?', [req.user.id]);
    if (!me || !me.is_admin) return res.status(403).json({ error: 'Sirf Admin group bana sakta hai' });

    const name = clean(req.body.name || '');
    if (!name) return res.status(400).json({ error: 'Group name required' });
    const memberIds = parseIds(req.body.members);
    const id = uuidv4();
    let avatar = '';
    if (req.file) avatar = '/uploads/profiles/' + path.basename(req.file.path);
    await runQuery(`INSERT INTO groups (id, name, description, avatar, created_by, created_at) VALUES (?,?,?,?,?,?)`,
      [id, name, clean(req.body.description || ''), avatar, req.user.id, Date.now()]);
    await runQuery('INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?,?,?,?)', [id, req.user.id, 'admin', Date.now()]);
    for (const m of memberIds) {
      if (m !== req.user.id) {
        await runQuery('INSERT OR IGNORE INTO group_members (group_id, user_id, role, joined_at) VALUES (?,?,?,?)', [id, m, 'member', Date.now()]);
        pushNotification(m, 'group', 'Added to group', `You were added to "${name}"`, { group_id: id });
      }
    }
    await audit(req.user.id, 'group-create', name);
    res.status(201).json({ message: `Group "${name}" created 👥`, group_id: id });
  } catch (e) { console.error('[group]', e.message); res.status(500).json({ error: 'Group creation failed' }); }
});

function parseIds(x) {
  try {
    if (Array.isArray(x)) return x.map(v => String(v)).filter(Boolean);
    if (typeof x === 'string' && x.trim().startsWith('[')) return JSON.parse(x);
    if (typeof x === 'string' && x.trim()) return x.split(',').map(s => s.trim()).filter(Boolean);
  } catch {}
  return [];
}

async function pushNotification(userId, type, title, body, data = {}) {
  try {
    const id = uuidv4();
    await runQuery('INSERT INTO notifications (id, user_id, type, title, body, data, read, created_at) VALUES (?,?,?,?,?,?,0,?)',
      [id, userId, type, title, body, JSON.stringify(data), Date.now()]);
    emitToUser(userId, 'notification', { id, type, title, body, data, created_at: Date.now() });
  } catch (e) { console.error('[notify]', e.message); }
}

app.get('/api/groups', authMiddleware, async (req, res) => {
  try {
    const rows = await allQuery(`SELECT g.*, (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id=g.id) AS member_count
      FROM groups g JOIN group_members m ON m.group_id=g.id AND m.user_id=? ORDER BY g.created_at DESC`, [req.user.id]);
    for (const g of rows) {
      g.is_admin = g.created_by === req.user.id;
      if (g.post_mode === null || g.post_mode === undefined) g.post_mode = 'all'; /* v5.4.0: normalize legacy NULL */
      const role = await getQuery('SELECT role FROM group_members WHERE group_id=? AND user_id=?', [g.id, req.user.id]);
      g.my_role = role ? role.role : 'member';
    }
    res.json({ groups: rows });
  } catch (e) { res.status(500).json({ error: 'Failed to load groups' }); }
});

app.get('/api/group/:id/members', authMiddleware, async (req, res) => {
  const member = await getQuery('SELECT id FROM group_members WHERE group_id=? AND user_id=?', [req.params.id, req.user.id]);
  if (!member) return res.status(403).json({ error: 'You are not a member of this group' });
  const rows = await allQuery(`SELECT u.id, u.username, u.profile_pic, u.bio, u.last_seen, gm.role
    FROM group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=? ORDER BY gm.joined_at`, [req.params.id]);
  rows.forEach(u => u.online = isOnline(u.id));
  res.json({ members: rows });
});

app.post('/api/group/add-member', authMiddleware, async (req, res) => {
  try {
    const gid = clean(req.body.group_id || '');
    const ids = parseIds(req.body.userIds || req.body.user_id);
    if (!gid || !ids.length) return res.status(400).json({ error: 'Group and users required' });
    const me = await getQuery('SELECT role FROM group_members WHERE group_id=? AND user_id=?', [gid, req.user.id]);
    if (!me || me.role !== 'admin') return res.status(403).json({ error: 'Only group admin can add members' });
    let added = 0;
    for (const u of ids) {
      const r = await runQuery('INSERT OR IGNORE INTO group_members (group_id, user_id, role, joined_at) VALUES (?,?,?,?)', [gid, u, 'member', Date.now()]);
      if (r.changes > 0) { added++; pushNotification(u, 'group', 'Added to group', `You were added to a group`, { group_id: gid }); }
    }
    res.json({ message: `${added} member(s) added 👥` });
  } catch (e) { res.status(500).json({ error: 'Add member failed' }); }
});

app.post('/api/group/remove-member', authMiddleware, async (req, res) => {
  const gid = clean(req.body.group_id || '');
  const uid2 = clean(req.body.user_id || '');
  const me = await getQuery('SELECT role FROM group_members WHERE group_id=? AND user_id=?', [gid, req.user.id]);
  if (!me || me.role !== 'admin') return res.status(403).json({ error: 'Only group admin can remove members' });
  const g = await getQuery('SELECT created_by FROM groups WHERE id=?', [gid]);
  if (g && g.created_by === uid2) return res.status(403).json({ error: 'Group owner cannot be removed' });
  await runQuery('DELETE FROM group_members WHERE group_id=? AND user_id=?', [gid, uid2]);
  res.json({ message: 'Member removed' });
});

app.post('/api/group/make-admin', authMiddleware, async (req, res) => {
  const gid = clean(req.body.group_id || '');
  const uid2 = clean(req.body.user_id || '');
  const me = await getQuery('SELECT role FROM group_members WHERE group_id=? AND user_id=?', [gid, req.user.id]);
  if (!me || me.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  await runQuery('UPDATE group_members SET role=\'admin\' WHERE group_id=? AND user_id=?', [gid, uid2]);
  pushNotification(uid2, 'group', 'Made admin', 'You are now a group admin 🎉', { group_id: gid });
  res.json({ message: 'Member promoted to admin ✅' });
});

app.post('/api/group/leave', authMiddleware, async (req, res) => {
  const gid = clean(req.body.group_id || '');
  await runQuery('DELETE FROM group_members WHERE group_id=? AND user_id=?', [gid, req.user.id]);
  res.json({ message: 'Left the group 👋' });
});

app.get('/api/group/messages/:groupId', authMiddleware, async (req, res) => {
  try {
    const gid = req.params.groupId;
    const member = await getQuery('SELECT user_id FROM group_members WHERE group_id=? AND user_id=?', [gid, req.user.id]);
    if (!member) return res.status(403).json({ error: 'You are not a member of this group' });
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, parseInt(req.query.limit || '50', 10));
    const offset = (page - 1) * limit;
    const rows = await allQuery(`SELECT gm.*, u.username AS sender_name, u.profile_pic AS sender_pic FROM group_messages gm
      LEFT JOIN users u ON u.id=gm.sender_id WHERE gm.group_id=?
      ORDER BY gm.is_pinned DESC, gm.timestamp DESC LIMIT ? OFFSET ?`, [gid, limit, offset]);
    const total = await getQuery('SELECT COUNT(*) AS c FROM group_messages WHERE group_id=?', [gid]);
    res.json({ messages: rows.reverse().map(decorateMessage), page, total: total.c, hasMore: offset + rows.length < total.c });
  } catch (e) { res.status(500).json({ error: 'Failed to load group messages' }); }
});

/* ============================================================
   STORIES APIs (24h expiry, views, highlights, tags)
   ============================================================ */
app.post('/api/story', authMiddleware, upload.single('story'), async (req, res) => {
  try {
    const type = clean(req.body.type || (req.file ? 'image' : 'text'));
    const text = clean(req.body.text || '');
    const caption = clean(req.body.caption || '');
    const background = clean(req.body.background || '#201a0d');
    const tags = parseIds(req.body.tags);
    if (type === 'text' && !text) return res.status(400).json({ error: 'Story text required' });
    if (type !== 'text' && !req.file) return res.status(400).json({ error: 'Story media required' });
    const id = uuidv4();
    const mediaUrl = req.file ? '/uploads/stories/' + path.basename(req.file.path) : '';
    const expires = Date.now() + 24 * 60 * 60 * 1000;
    const result = await runQuery(`INSERT INTO stories (id, user_id, type, content, media_url, caption, background, tags, expires_at, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, req.user.id, type, encryptText(text), mediaUrl, caption, background, JSON.stringify(tags), expires, Date.now()]);
    /* notify tagged users (fixed: result captured properly) */
    for (const t of tags) {
      if (t !== req.user.id) pushNotification(t, 'story-tag', 'You were tagged in a story', `${req.user.username} tagged you in a story 🏷️`, { story_id: id });
    }
    res.status(201).json({ message: 'Story posted ✨ (24h expiry)', story_id: id });
  } catch (e) { console.error('[story]', e.message); res.status(500).json({ error: 'Story post failed' }); }
});

app.get('/api/stories', authMiddleware, async (req, res) => {
  try {
    await runQuery('DELETE FROM stories WHERE expires_at < ? AND is_highlight=0', [Date.now()]);
    const rows = await allQuery(`SELECT s.*, u.username, u.profile_pic, u.privacy_stories, u.is_admin AS owner_is_admin FROM stories s
      JOIN users u ON u.id=s.user_id WHERE s.expires_at > ? OR s.is_highlight=1 ORDER BY s.created_at DESC`, [Date.now()]);
    const uid = req.user.id;
    const meRow = await getQuery('SELECT is_admin FROM users WHERE id=?', [uid]);
    const isAdmin = !!(meRow && meRow.is_admin);
    /* v16.4.4: story privacy filter - owner ki privacy ke hisaab se
       default 'contacts' = sirf accepted contacts stories dekh sakte,
       'everyone' = sab users, 'nobody' = koi nahi (khud + admin hamesha dekh sakta) */
    const contactMap = await getContactMap(uid);
    const grouped = {};
    for (const s of rows) {
      const key = s.user_id;
      if (s.user_id !== uid && !isAdmin) {
        const sp = s.privacy_stories || 'contacts';
        if (sp === 'nobody') continue;
        if (sp === 'contacts' && !contactMap.has(key)) continue;
      }
      if (!grouped[key]) grouped[key] = { user_id: key, username: s.username, profile_pic: s.profile_pic, stories: [], all_viewed: true };
      const viewed = await getQuery('SELECT id FROM story_views WHERE story_id=? AND viewer_id=?', [s.id, uid]);
      s.viewed = !!viewed;
      s.content = decryptText(s.content);
      s.tags = safeParseArr(s.tags);
      if (!s.viewed && !s.is_highlight) grouped[key].all_viewed = false;
      delete s.privacy_stories; delete s.owner_is_admin;
      grouped[key].stories.push(s);
    }
    res.json({ stories: Object.values(grouped) });
  } catch (e) { res.status(500).json({ error: 'Failed to load stories' }); }
});

function safeParseArr(x) { try { const v = JSON.parse(x || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }

app.post('/api/story/view/:id', authMiddleware, async (req, res) => {
  try {
    const sid = req.params.id;
    const story = await getQuery('SELECT * FROM stories WHERE id=?', [sid]);
    if (!story) return res.status(404).json({ error: 'Story not found' });
    const r = await runQuery('INSERT OR IGNORE INTO story_views (story_id, viewer_id, viewed_at) VALUES (?,?,?)', [sid, req.user.id, Date.now()]);
    if (r.changes > 0) await runQuery('UPDATE stories SET views = views + 1 WHERE id=?', [sid]);
    const count = await getQuery('SELECT views FROM stories WHERE id=?', [sid]);
    if (story.user_id !== req.user.id) emitToUser(story.user_id, 'story-viewed', { story_id: sid, viewer: req.user.username });
    res.json({ message: 'View recorded', views: count.views });
  } catch (e) { res.status(500).json({ error: 'View failed' }); }
});

app.get('/api/story/:id/viewers', authMiddleware, async (req, res) => {
  const story = await getQuery('SELECT * FROM stories WHERE id=?', [req.params.id]);
  if (!story) return res.status(404).json({ error: 'Story not found' });
  if (story.user_id !== req.user.id) return res.status(403).json({ error: 'Only story owner can see viewers' });
  const rows = await allQuery(`SELECT u.id, u.username, u.profile_pic, sv.viewed_at FROM story_views sv
    JOIN users u ON u.id=sv.viewer_id WHERE sv.story_id=? ORDER BY sv.viewed_at DESC`, [req.params.id]);
  res.json({ viewers: rows, views: story.views });
});

app.delete('/api/story/:id', authMiddleware, async (req, res) => {
  const story = await getQuery('SELECT * FROM stories WHERE id=?', [req.params.id]);
  if (!story) return res.status(404).json({ error: 'Story not found' });
  if (story.user_id !== req.user.id) return res.status(403).json({ error: 'Only owner can delete' });
  await runQuery('DELETE FROM stories WHERE id=?', [req.params.id]);
  await runQuery('DELETE FROM story_views WHERE story_id=?', [req.params.id]);
  if (story.media_url) {
    const p = path.join(UPLOADS, story.media_url.replace(/^\/uploads\//, ''));
    fse.remove(p).catch(() => {});
  }
  res.json({ message: 'Story deleted 🗑️' });
});

app.post('/api/story/:id/highlight', authMiddleware, async (req, res) => {
  const story = await getQuery('SELECT * FROM stories WHERE id=?', [req.params.id]);
  if (!story) return res.status(404).json({ error: 'Story not found' });
  if (story.user_id !== req.user.id) return res.status(403).json({ error: 'Only owner can highlight' });
  await runQuery('UPDATE stories SET is_highlight=1, expires_at=0 WHERE id=?', [req.params.id]);
  res.json({ message: 'Story added to highlights ⭐' });
});

app.get('/api/highlights/:userId', authMiddleware, async (req, res) => {
  const rows = await allQuery(`SELECT s.*, u.username FROM stories s JOIN users u ON u.id=s.user_id
    WHERE s.user_id=? AND s.is_highlight=1 ORDER BY s.created_at DESC`, [req.params.userId]);
  rows.forEach(s => { s.content = decryptText(s.content); s.tags = safeParseArr(s.tags); });
  res.json({ highlights: rows });
});

/* ============================================================
   CHANNELS APIs
   ============================================================ */
app.post('/api/channel', authMiddleware, async (req, res) => {
  // Only Admin can create channels
  const me = await getQuery('SELECT is_admin FROM users WHERE id=?', [req.user.id]);
  if (!me || !me.is_admin) return res.status(403).json({ error: 'Sirf Admin channel bana sakta hai' });

  const name = clean(req.body.name || '');
  const desc = clean(req.body.description || '');
  if (!name) return res.status(400).json({ error: 'Channel name required' });
  const id = uuidv4();
  await runQuery(`INSERT INTO channels (id, name, description, owner_id, subscribers, created_at) VALUES (?,?,?,?,1,?)`,
    [id, name, desc, req.user.id, Date.now()]);
  await runQuery('INSERT INTO channel_subscribers (channel_id, user_id, subscribed_at) VALUES (?,?,?)', [id, req.user.id, Date.now()]);
  res.status(201).json({ message: `Channel "${name}" created 📢`, channel_id: id });
});

app.get('/api/channels', authMiddleware, async (req, res) => {
  const rows = await allQuery(`SELECT c.*, CASE WHEN cs.id IS NULL THEN 0 ELSE 1 END AS subscribed
    FROM channels c LEFT JOIN channel_subscribers cs ON cs.channel_id=c.id AND cs.user_id=?
    ORDER BY c.subscribers DESC`, [req.user.id]);
  res.json({ channels: rows });
});

app.post('/api/channel/subscribe/:id', authMiddleware, async (req, res) => {
  const ch = await getQuery('SELECT * FROM channels WHERE id=?', [req.params.id]);
  if (!ch) return res.status(404).json({ error: 'Channel not found' });
  const r = await runQuery('INSERT OR IGNORE INTO channel_subscribers (channel_id, user_id, subscribed_at) VALUES (?,?,?)', [req.params.id, req.user.id, Date.now()]);
  if (r.changes > 0) await runQuery('UPDATE channels SET subscribers = subscribers + 1 WHERE id=?', [req.params.id]);
  res.json({ message: `Subscribed to "${ch.name}" 📢` });
});

app.post('/api/channel/unsubscribe/:id', authMiddleware, async (req, res) => {
  const ch = await getQuery('SELECT name FROM channels WHERE id=?', [req.params.id]);
  if (ch && (ch.name === 'C$K4' || ch.name === 'CSK4' || ch.name.toLowerCase() === 'c$k4')) {
    return res.status(403).json({ error: 'Official C$K4 channel se unfollow nahi kar sakte' });
  }
  const r = await runQuery('DELETE FROM channel_subscribers WHERE channel_id=? AND user_id=?', [req.params.id, req.user.id]);
  if (r.changes > 0) await runQuery('UPDATE channels SET subscribers = MAX(subscribers - 1, 0) WHERE id=?', [req.params.id]);
  res.json({ message: 'Unsubscribed' });
});

app.get('/api/channel/messages/:id', authMiddleware, async (req, res) => {
  const sub = await getQuery('SELECT id FROM channel_subscribers WHERE channel_id=? AND user_id=?', [req.params.id, req.user.id]);
  const ch = await getQuery('SELECT * FROM channels WHERE id=?', [req.params.id]);
  if (!ch) return res.status(404).json({ error: 'Channel not found' });
  if (!sub && ch.owner_id !== req.user.id) return res.status(403).json({ error: 'Subscribe to view messages' });
  const rows = await allQuery(`SELECT cm.*, u.username AS sender_name FROM channel_messages cm
    LEFT JOIN users u ON u.id=cm.sender_id WHERE cm.channel_id=? ORDER BY cm.timestamp DESC LIMIT 100`, [req.params.id]);
  res.json({ messages: rows.reverse().map(decorateMessage), channel: ch });
});

/* ============================================================
   POLLS APIs (+ group polls, instant voting)
   ============================================================ */
app.post('/api/poll', authMiddleware, async (req, res) => {
  try {
    const question = clean(req.body.question || '');
    const options = parseIds(req.body.options).map(o => clean(o)).filter(Boolean);
    if (!question || options.length < 2) return res.status(400).json({ error: 'Question and at least 2 options required' });
    const context_type = ['chat', 'group', 'channel'].includes(req.body.context_type) ? req.body.context_type : 'chat';
    const context_id = clean(req.body.context_id || '');
    const id = uuidv4();
    const expires = req.body.duration_hours ? Date.now() + parseInt(req.body.duration_hours, 10) * 3600000 : 0;
    await runQuery(`INSERT INTO polls (id, creator_id, context_type, context_id, question, options, anonymous, multi_choice, created_at, expires_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, req.user.id, context_type, context_id, question, JSON.stringify(options), req.body.anonymous ? 1 : 0, req.body.multi_choice ? 1 : 0, Date.now(), expires]);
    /* poll message into chat/group — poll_id media_url me store hota hai (history me renderPollCard isi se poll fetch karta hai) */
    const mid = uuidv4();
    if (context_type === 'group' && context_id) {
      await runQuery(`INSERT INTO group_messages (id, group_id, sender_id, message, type, media_url, timestamp) VALUES (?,?,?,?,?,?,?)`,
        [mid, context_id, req.user.id, encryptText(`📊 POLL: ${question}`), 'poll', id, Date.now()]);
      io.to(`group_${context_id}`).emit('new-group-message', { id: mid, group_id: context_id, sender_id: req.user.id, message: `📊 POLL: ${question}`, type: 'poll', poll_id: id, timestamp: Date.now() });
    } else if (context_id) {
      await runQuery(`INSERT INTO messages (id, from_user, to_user, message, type, media_url, timestamp) VALUES (?,?,?,?,?,?,?)`,
        [mid, req.user.id, context_id, encryptText(`📊 POLL: ${question}`), 'poll', id, Date.now()]);
      emitToUser(context_id, 'new-message', { id: mid, from_user: req.user.id, to_user: context_id, message: `📊 POLL: ${question}`, type: 'poll', poll_id: id, timestamp: Date.now() });
      socketEmitSelf(req.user.id, 'new-message', { id: mid, from_user: req.user.id, to_user: context_id, message: `📊 POLL: ${question}`, type: 'poll', poll_id: id, timestamp: Date.now() });
    }
    res.status(201).json({ message: 'Poll created 📊', poll_id: id, options });
  } catch (e) { console.error('[poll]', e.message); res.status(500).json({ error: 'Poll creation failed' }); }
});

function socketEmitSelf(userId, event, payload) { emitToUser(userId, event, payload); }

app.get('/api/poll/:id', authQuery, async (req, res) => {
  try {
    const poll = await getQuery('SELECT * FROM polls WHERE id=?', [req.params.id]);
    if (!poll) return res.status(404).json({ error: 'Poll not found' });
    const votes = await allQuery('SELECT user_id, option_index FROM poll_votes WHERE poll_id=?', [req.params.id]);
    const counts = {};
    votes.forEach(v => counts[v.option_index] = (counts[v.option_index] || 0) + 1);
    const myVote = votes.find(v => v.user_id === req.user.id);
    let votersByOption = null;
    if (!poll.anonymous) {
      votersByOption = {};
      const users = await allQuery(`SELECT pv.option_index, u.username FROM poll_votes pv JOIN users u ON u.id=pv.user_id WHERE pv.poll_id=?`, [req.params.id]);
      users.forEach(v => { (votersByOption[v.option_index] = votersByOption[v.option_index] || []).push(v.username); });
    }
    res.json({ poll: { ...poll, options: safeParseArr(poll.options) }, counts, total: votes.length, my_vote: myVote ? myVote.option_index : null, voters: votersByOption });
  } catch (e) { res.status(500).json({ error: 'Poll fetch failed' }); }
});

function authQuery(req, res, next) { return authMiddleware(req, res, next); }

app.post('/api/poll/vote', authMiddleware, async (req, res) => {
  try {
    const { poll_id, option_index } = req.body || {};
    const poll = await getQuery('SELECT * FROM polls WHERE id=?', [poll_id]);
    if (!poll) return res.status(404).json({ error: 'Poll not found' });
    const existing = await getQuery('SELECT id FROM poll_votes WHERE poll_id=? AND user_id=?', [poll_id, req.user.id]);
    if (existing) return res.status(400).json({ error: 'You already voted' });
    await runQuery('INSERT INTO poll_votes (poll_id, user_id, option_index, voted_at) VALUES (?,?,?,?)', [poll_id, req.user.id, parseInt(option_index, 10) || 0, Date.now()]);
    const votes = await allQuery('SELECT user_id, option_index FROM poll_votes WHERE poll_id=?', [poll_id]);
    const counts = {};
    votes.forEach(v => counts[v.option_index] = (counts[v.option_index] || 0) + 1);
    res.json({ message: 'Vote recorded ✅', counts, total: votes.length });
  } catch (e) { res.status(500).json({ error: 'Vote failed' }); }
});

/* ============================================================
   GAMES APIs (tic-tac-toe)
   ============================================================ */
app.post('/api/game/create', authMiddleware, async (req, res) => {
  try {
    const id = uuidv4();
    const opponent = clean(req.body.opponent || '');
    await runQuery(`INSERT INTO games (id, game_type, player1, player2, board, turn, status, created_at, last_move_at)
      VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, 'tic-tac-toe', req.user.id, opponent || null, '---------', req.user.id, opponent ? 'playing' : 'waiting', Date.now(), Date.now()]);
    if (opponent) {
      pushNotification(opponent, 'game', '🎮 Game invite', `${req.user.username} invited you to Tic-Tac-Toe!`, { game_id: id });
      emitToUser(opponent, 'game-invite', { game_id: id, from: req.user.id, from_username: req.user.username });
    }
    res.status(201).json({ message: 'Game created 🎮', game_id: id, board: '---------', your_symbol: 'X', turn: req.user.id });
  } catch (e) { res.status(500).json({ error: 'Game creation failed' }); }
});

app.post('/api/game/join/:id', authMiddleware, async (req, res) => {
  try {
    const g = await getQuery('SELECT * FROM games WHERE id=?', [req.params.id]);
    if (!g) return res.status(404).json({ error: 'Game not found' });
    if (g.status !== 'waiting') return res.status(400).json({ error: 'Game already started' });
    if (g.player1 === req.user.id) return res.status(400).json({ error: 'You created this game' });
    await runQuery('UPDATE games SET player2=?, status=\'playing\', turn=?, last_move_at=? WHERE id=?', [req.user.id, g.player1, Date.now(), req.params.id]);
    io.to(`game_${req.params.id}`).emit('game-state', { game_id: req.params.id, board: g.board, turn: g.player1, status: 'playing', started: true });
    emitToUser(g.player1, 'game-started', { game_id: req.params.id, opponent: req.user.username });
    emitToUser(req.user.id, 'game-started', { game_id: req.params.id, opponent: (await getQuery('SELECT username FROM users WHERE id=?', [g.player1])).username });
    res.json({ message: 'Game joined 🎮 You are O', game_id: req.params.id, board: g.board, your_symbol: 'O', turn: g.player1 });
  } catch (e) { res.status(500).json({ error: 'Join failed' }); }
});

app.get('/api/game/:id', authMiddleware, async (req, res) => {
  const g = await getQuery('SELECT * FROM games WHERE id=?', [req.params.id]);
  if (!g) return res.status(404).json({ error: 'Game not found' });
  const p1 = await getQuery('SELECT username FROM users WHERE id=?', [g.player1]);
  const p2 = g.player2 ? await getQuery('SELECT username FROM users WHERE id=?', [g.player2]) : null;
  res.json({ game: { ...g, player1_name: p1 ? p1.username : '?', player2_name: p2 ? p2.username : 'Waiting...' } });
});

/* ============================================================
   UPLOAD / LOCATION / WEATHER / AI CHAT / BACKUP
   ============================================================ */
app.post('/api/upload', authMiddleware, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded' });
    const files = req.files.map(f => ({
      url: '/uploads/' + path.basename(path.dirname(f.path)) + '/' + path.basename(f.path),
      name: f.originalname, size: f.size, mimetype: f.mimetype
    }));
    res.status(201).json({ message: `${files.length} file(s) uploaded ✅`, files });
  } catch (e) { res.status(500).json({ error: 'Upload failed: ' + e.message }); }
});

app.post('/api/location', authMiddleware, async (req, res) => {
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'Valid latitude/longitude required' });
  }
  const place = await reverseGeocode(lat, lng);
  res.json({ lat, lng, place });
});

app.get('/api/weather', authMiddleware, async (req, res) => {
  const city = clean(req.query.city || 'Karachi');
  const key = process.env.WEATHER_API_KEY || '';
  if (!axios || !key || key === 'demo_key_local') {
    return res.json({ city, demo: true, temp: 28, desc: 'Sunny ☀️ (demo — set WEATHER_API_KEY in .env for real data)' });
  }
  try {
    const r = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${key}&units=metric`, { timeout: 6000 });
    res.json({ city: r.data.name, temp: r.data.main.temp, desc: r.data.weather[0].description, humidity: r.data.main.humidity, wind: r.data.wind.speed });
  } catch (e) { res.status(502).json({ error: 'Weather service unavailable' }); }
});

app.post('/api/ai/chat', authMiddleware, async (req, res) => {
  const text = clean(req.body.message || '');
  if (!text) return res.status(400).json({ error: 'Message required' });
  const reply = aiReply(text);
  const id = uuidv4();
  await runQuery(`INSERT INTO messages (id, from_user, to_user, message, type, timestamp) VALUES (?,?,?,?,?,?)`,
    [id, BOT_USER_ID || 'bot', req.user.id, encryptText(reply), 'text', Date.now()]);
  res.json({ reply, message_id: id });
});

/* ---- CHAT BACKUP (JSON export) ---- */
app.get('/api/backup', authMiddleware, async (req, res) => {
  try {
    const me = await getQuery('SELECT * FROM users WHERE id=?', [req.user.id]);
    const messages = await allQuery('SELECT * FROM messages WHERE from_user=? OR to_user=? ORDER BY timestamp', [req.user.id, req.user.id]);
    const groups = await allQuery(`SELECT g.* FROM groups g JOIN group_members gm ON gm.group_id=g.id WHERE gm.user_id=?`, [req.user.id]);
    const groupIds = groups.map(g => g.id);
    let groupMsgs = [];
    if (groupIds.length) {
      groupMsgs = await allQuery(`SELECT * FROM group_messages WHERE group_id IN (${groupIds.map(() => '?').join(',')}) ORDER BY timestamp`, groupIds);
    }
    const stories = await allQuery('SELECT * FROM stories WHERE user_id=?', [req.user.id]);
    const polls = await allQuery('SELECT * FROM polls WHERE creator_id=?', [req.user.id]);
    const backup = {
    app: `C$K4 Chat v${APP_VERSION}`, exported_at: new Date().toISOString(), user: publicUser(me),
      counts: { messages: messages.length, groups: groups.length, group_messages: groupMsgs.length, stories: stories.length, polls: polls.length },
      messages: await attachReactions(messages.map(decorateMessage)), groups, group_messages: groupMsgs.map(decorateMessage),
      stories: stories.map(s => ({ ...s, content: decryptText(s.content) })), polls: polls.map(p => ({ ...p, options: safeParseArr(p.options) }))
    };
    await audit(req.user.id, 'backup-export', `${messages.length} messages`);
    res.setHeader('Content-Disposition', `attachment; filename="csk4-backup-${req.user.id}-${Date.now()}.json"`);
    res.json(backup);
  } catch (e) { res.status(500).json({ error: 'Backup failed' }); }
});

/* ============================================================
   ADMIN APIs (admin panel)
   ============================================================ */
app.get('/api/admin/stats', authMiddleware, adminOnly, async (req, res) => {
  try {
    const users = await getQuery('SELECT COUNT(*) c FROM users');
    const msgs = await getQuery('SELECT COUNT(*) c FROM messages');
    const gmsgs = await getQuery('SELECT COUNT(*) c FROM group_messages');
    const groups = await getQuery('SELECT COUNT(*) c FROM groups');
    const stories = await getQuery('SELECT COUNT(*) c FROM stories');
    const channels = await getQuery('SELECT COUNT(*) c FROM channels');
    const polls = await getQuery('SELECT COUNT(*) c FROM polls');
    const games = await getQuery('SELECT COUNT(*) c FROM games');
    const reports = await getQuery('SELECT COUNT(*) c FROM reports WHERE status=\'pending\'');
    const online = onlineUsers.size;
    res.json({ stats: { users: users.c, messages: msgs.c, group_messages: gmsgs.c, groups: groups.c, stories: stories.c, channels: channels.c, polls: polls.c, games: games.c, pending_reports: reports.c, reports: reports.c, online_now: online } });
  } catch (e) { res.status(500).json({ error: 'Stats failed' }); }
});

app.get('/api/admin/users', authMiddleware, adminOnly, async (req, res) => {
  const rows = await allQuery('SELECT id, username, email, profile_pic, bio, is_admin, two_fa_enabled, last_seen, created_at FROM users ORDER BY created_at DESC');
  rows.forEach(u => { u.online = isOnline(u.id); });
  res.json({ users: rows });
});

app.delete('/api/admin/users/:id', authMiddleware, adminOnly, async (req, res) => {
  const target = req.params.id;
  if (target === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  const targetUser = await getQuery('SELECT id, is_admin FROM users WHERE id=?', [target]);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });
  if (targetUser.is_admin) return res.status(403).json({ error: 'Remove admin role before deleting an admin' });
  try {
    await runQuery('BEGIN');
    for (const [sql, params] of [
      ['DELETE FROM message_reactions WHERE user_id=? OR message_id IN (SELECT id FROM messages WHERE from_user=? OR to_user=?)', [target, target, target]],
      ['DELETE FROM messages WHERE from_user=? OR to_user=?', [target, target]],
      ['DELETE FROM offline_messages WHERE from_user=? OR to_user=?', [target, target]],
      ['DELETE FROM notifications WHERE user_id=?', [target]],
      ['DELETE FROM quick_replies WHERE user_id=?', [target]],
      ['DELETE FROM blocked_users WHERE user_id=? OR blocked_user=?', [target, target]],
      ['DELETE FROM story_views WHERE viewer_id=? OR story_id IN (SELECT id FROM stories WHERE user_id=?)', [target, target]],
      ['DELETE FROM stories WHERE user_id=?', [target]],
      ['DELETE FROM channel_subscribers WHERE user_id=?', [target]],
      ['DELETE FROM group_members WHERE user_id=?', [target]],
      ['DELETE FROM reports WHERE reporter_id=? OR reported_user=?', [target, target]],
      ['DELETE FROM audit_log WHERE user_id=?', [target]],
      ['DELETE FROM sessions WHERE user_id=?', [target]],
      ['DELETE FROM users WHERE id=?', [target]]
    ]) await runQuery(sql, params);
    await runQuery('COMMIT');
    await audit(req.user.id, 'admin-delete-user', target);
    res.json({ message: 'User deleted' });
  } catch (e) {
    try { await runQuery('ROLLBACK'); } catch {}
    console.error('[admin-delete-user]', e.message);
    res.status(500).json({ error: 'User deletion failed' });
  }
});

app.get('/api/admin/messages', authMiddleware, adminOnly, async (req, res) => {
  const rows = await allQuery(`SELECT m.*, fu.username AS from_name, fu.username AS from_username, tu.username AS to_name, tu.username AS to_username FROM messages m
    LEFT JOIN users fu ON fu.id=m.from_user LEFT JOIN users tu ON tu.id=m.to_user
    ORDER BY m.timestamp DESC LIMIT 500`);
  res.json({ messages: rows.map(decorateMessage) });
});

app.delete('/api/admin/messages/:id', authMiddleware, adminOnly, async (req, res) => {
  const msg = await getQuery('SELECT id FROM messages WHERE id=?', [req.params.id]);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  await runQuery('UPDATE messages SET deleted_for_everyone=1, message=\'\', media_url=NULL WHERE id=?', [req.params.id]);
  await audit(req.user.id, 'admin-delete-message', req.params.id);
  res.json({ message: 'Message removed' });
});

app.get('/api/admin/stories', authMiddleware, adminOnly, async (req, res) => {
  const rows = await allQuery(`SELECT s.*, u.username FROM stories s JOIN users u ON u.id=s.user_id ORDER BY s.created_at DESC`);
  rows.forEach(s => { s.content = decryptText(s.content); s.tags = safeParseArr(s.tags); });
  res.json({ stories: rows });
});

app.delete('/api/admin/stories/:id', authMiddleware, adminOnly, async (req, res) => {
  const story = await getQuery('SELECT media_url FROM stories WHERE id=?', [req.params.id]);
  if (!story) return res.status(404).json({ error: 'Story not found' });
  await runQuery('DELETE FROM stories WHERE id=?', [req.params.id]);
  await runQuery('DELETE FROM story_views WHERE story_id=?', [req.params.id]);
  if (story.media_url) fse.remove(path.join(UPLOADS, story.media_url.replace(/^\/uploads\//, ''))).catch(() => {});
  await audit(req.user.id, 'admin-delete-story', req.params.id);
  res.json({ message: 'Story deleted' });
});

app.get('/api/admin/groups', authMiddleware, adminOnly, async (req, res) => {
  const rows = await allQuery(`SELECT g.*, (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id=g.id) AS member_count,
    u.username AS owner_name FROM groups g LEFT JOIN users u ON u.id=g.created_by ORDER BY g.created_at DESC`);
  for (const g of rows) { if (g.post_mode === null || g.post_mode === undefined) g.post_mode = 'all'; }
  res.json({ groups: rows });
});

/* ---- v5.3.1: ADMIN GROUPS FULL CONTROL ---- */
// Create group as admin
app.post('/api/admin/groups', authMiddleware, adminOnly, async (req, res) => {
  try {
    const name = clean(req.body.name || '');
    const desc = clean(req.body.description || '');
    if (!name) return res.status(400).json({ error: 'Group name required' });
    const id = uuidv4();
    await runQuery(`INSERT INTO groups (id, name, description, avatar, created_by, wallpaper, created_at) VALUES (?,?,?,?,?,?,?)`,
      [id, name, desc, '', req.user.id, '', Date.now()]);
    await runQuery(`INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?,?, 'admin', ?)`,
      [id, req.user.id, Date.now()]);
    await audit(req.user.id, 'admin-create-group', name);
    res.status(201).json({ message: `Group "${name}" created ✅`, group_id: id });
  } catch (e) { console.error('[admin-create-group]', e.message); res.status(500).json({ error: 'Create failed' }); }
});

// Edit group (name / description / wallpaper)
app.put('/api/admin/groups/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const g = await getQuery('SELECT * FROM groups WHERE id=?', [req.params.id]);
    if (!g) return res.status(404).json({ error: 'Group not found' });
    /* v5.4.0: empty/missing name → existing name rakhna (post_mode-only updates allowed) */
    const name = (req.body.name !== undefined && String(clean(req.body.name)).trim() !== '') ? clean(req.body.name) : g.name;
    const description = req.body.description !== undefined ? clean(req.body.description) : g.description;
    const wallpaper = req.body.wallpaper !== undefined ? clean(req.body.wallpaper) : g.wallpaper;
    /* v5.4.0: post_mode — 'all' = sab members post kar sake, 'admin' = sirf admin posting */
    const postMode = req.body.post_mode !== undefined ? (req.body.post_mode === 'admin' ? 'admin' : 'all') : (g.post_mode || 'all');
    if (!name) return res.status(400).json({ error: 'Group name cannot be empty' });
    await runQuery('UPDATE groups SET name=?, description=?, wallpaper=?, post_mode=? WHERE id=?', [name, description, wallpaper, postMode, req.params.id]);
    // Notify all members about the change
    const members = await allQuery('SELECT user_id FROM group_members WHERE group_id=?', [req.params.id]);
    for (const m of members) {
      if (m.user_id !== req.user.id) await pushNotification(m.user_id, 'group', 'Group Updated', `Admin ne "${g.name}" group update kiya`, { group_id: req.params.id });
    }
    await audit(req.user.id, 'admin-edit-group', `${req.params.id}: ${name}${postMode !== (g.post_mode || 'all') ? ' [post_mode=' + postMode + ']' : ''}`);
    res.json({ message: `Group updated ✅`, group: { id: req.params.id, name, description, post_mode: postMode } });
  } catch (e) { console.error('[admin-edit-group]', e.message); res.status(500).json({ error: 'Update failed' }); }
});

// List members of a group
app.get('/api/admin/groups/:id/members', authMiddleware, adminOnly, async (req, res) => {
  const g = await getQuery('SELECT id, name FROM groups WHERE id=?', [req.params.id]);
  if (!g) return res.status(404).json({ error: 'Group not found' });
  const rows = await allQuery(`SELECT gm.user_id AS id, u.username, u.email, u.profile_pic, gm.role, gm.can_post, gm.joined_at,
    CASE WHEN u.last_seen > ? THEN 1 ELSE 0 END AS online
    FROM group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=? ORDER BY gm.joined_at ASC`,
    [Date.now() - 60 * 1000, req.params.id]);
  res.json({ group: g, members: rows });
});

// Add member to group (by user id OR username)
app.post('/api/admin/groups/:id/add-member', authMiddleware, adminOnly, async (req, res) => {
  try {
    const g = await getQuery('SELECT * FROM groups WHERE id=?', [req.params.id]);
    if (!g) return res.status(404).json({ error: 'Group not found' });
    const uid = clean(req.body.userId || req.body.user_id || '');
    const uname = clean(req.body.username || '');
    let target = null;
    if (uid) target = await getQuery('SELECT id, username FROM users WHERE id=?', [uid]);
    else if (uname) target = await getQuery('SELECT id, username FROM users WHERE username=? COLLATE NOCASE', [uname]);
    if (!target) return res.status(404).json({ error: 'User not found' });
    const r = await runQuery('INSERT OR IGNORE INTO group_members (group_id, user_id, role, joined_at) VALUES (?,?,?,?)',
      [req.params.id, target.id, clean(req.body.role || 'member'), Date.now()]);
    if (r.changes > 0) {
      await pushNotification(target.id, 'group', 'Group Me Add Huay', `Admin ne aapko "${g.name}" group me add kiya`, { group_id: req.params.id });
      await audit(req.user.id, 'admin-group-add-member', `${g.name} + ${target.username}`);
      res.status(201).json({ message: `${target.username} ko "${g.name}" me add kiya ✅` });
    } else {
      res.status(409).json({ error: `${target.username} already member hai` });
    }
  } catch (e) { console.error('[admin-group-add-member]', e.message); res.status(500).json({ error: 'Add failed' }); }
});

// v5.4.0: Toggle member posting permission (admin ko control chaahiye kaun post kare)
app.put('/api/admin/groups/:id/members/:userId/can-post', authMiddleware, adminOnly, async (req, res) => {
  try {
    const g = await getQuery('SELECT * FROM groups WHERE id=?', [req.params.id]);
    if (!g) return res.status(404).json({ error: 'Group not found' });
    const target = await getQuery('SELECT username FROM users WHERE id=?', [req.params.userId]);
    if (!target) return res.status(404).json({ error: 'User not found' });
    const val = req.body && req.body.can_post !== undefined ? (req.body.can_post ? 1 : 0) : -1;
    if (val === -1) return res.status(400).json({ error: 'can_post required' });
    const r = await runQuery('UPDATE group_members SET can_post=? WHERE group_id=? AND user_id=?', [val, req.params.id, req.params.userId]);
    if (r.changes > 0) {
      await pushNotification(req.params.userId, 'group',
        val ? 'Posting Allow ✅' : 'Posting Block 🚫',
        `Admin ne "${g.name}" group me aapki posting ${val ? 'ALLOW' : 'BLOCK'} kar di`, { group_id: req.params.id });
      await audit(req.user.id, 'admin-group-can-post', `${g.name}: ${target.username} = ${val}`);
      res.json({ message: `${target.username} ki posting ${val ? 'allow' : 'block'} kar di ✅`, can_post: val });
    } else {
      res.status(404).json({ error: 'Yeh user group me nahi hai' });
    }
  } catch (e) { console.error('[admin-group-can-post]', e.message); res.status(500).json({ error: 'Failed' }); }
});

// Remove member from group
app.delete('/api/admin/groups/:id/members/:userId', authMiddleware, adminOnly, async (req, res) => {
  try {
    const g = await getQuery('SELECT * FROM groups WHERE id=?', [req.params.id]);
    if (!g) return res.status(404).json({ error: 'Group not found' });
    const target = await getQuery('SELECT username FROM users WHERE id=?', [req.params.userId]);
    if (!target) return res.status(404).json({ error: 'User not found' });
    const r = await runQuery('DELETE FROM group_members WHERE group_id=? AND user_id=?', [req.params.id, req.params.userId]);
    if (r.changes > 0) {
      await pushNotification(req.params.userId, 'group', 'Group Se Remove Huay', `Admin ne aapko "${g.name}" group se remove kiya`, { group_id: req.params.id });
      await audit(req.user.id, 'admin-group-remove-member', `${g.name} - ${target.username}`);
      res.json({ message: `${target.username} ko group se remove kiya ✅` });
    } else {
      res.status(404).json({ error: 'Yeh user group me nahi hai' });
    }
  } catch (e) { console.error('[admin-group-remove-member]', e.message); res.status(500).json({ error: 'Remove failed' }); }
});

// Broadcast message to a group as ADMIN
app.post('/api/admin/groups/:id/message', authMiddleware, adminOnly, upload.single('media'), async (req, res) => {
  try {
    const g = await getQuery('SELECT * FROM groups WHERE id=?', [req.params.id]);
    if (!g) return res.status(404).json({ error: 'Group not found' });
    const msg = clean(req.body.message || '');
    const mediaUrl = req.file ? '/uploads/' + path.relative(UPLOADS, req.file.path).split(path.sep).join('/') : null;
    /* v5.4.0: media type detect */
    let type = 'text';
    if (req.file) {
      const mm = (req.file.mimetype || '').toLowerCase();
      type = mm.startsWith('image/') ? 'image' : mm.startsWith('video/') ? 'video' : mm.startsWith('audio/') ? 'audio' : 'file';
    }
    if (!msg && !mediaUrl) return res.status(400).json({ error: 'Message ya media required' });
    const id = uuidv4();
    const ts = Date.now();
    const enc = msg ? encryptText(msg) : null;
    await runQuery(`INSERT INTO group_messages (id, group_id, sender_id, message, type, media_url, media_name, media_size, timestamp) VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, req.params.id, req.user.id, enc, type, mediaUrl, req.file ? req.file.originalname : '', req.file ? req.file.size : 0, ts]);
    const sender = await getQuery('SELECT username FROM users WHERE id=?', [req.user.id]);
    // Broadcast to all members
    const members = await allQuery('SELECT user_id FROM group_members WHERE group_id=? AND user_id<>?', [req.params.id, req.user.id]);
    const payload = { id, group_id: req.params.id, sender_id: req.user.id, sender: { id: req.user.id, username: (sender && sender.username) || 'Admin' }, message: msg, type, media_url: mediaUrl, media_name: req.file ? req.file.originalname : '', timestamp: ts };
    io.to('group_' + req.params.id).emit('new-group-message', payload);
    for (const m of members) {
      emitToUser(m.user_id, 'new-group-message', payload);
      const preview = type === 'text' ? msg.slice(0, 60) : (type === 'image' ? '📷 Photo' : type === 'video' ? '🎬 Video' : type === 'audio' ? '🎵 Audio' : '📎 File');
      await pushNotification(m.user_id, 'group', `📢 ${g.name}`, `${(sender && sender.username) || 'Admin'}: ${preview}`, { group_id: req.params.id });
    }
    await audit(req.user.id, 'admin-group-message', `${g.name}: ${type === 'text' ? msg.slice(0, 40) : '[' + type + '] ' + (req.file ? req.file.originalname : '')}`);
    res.status(201).json({ message: `Group message bhej diya ✅`, message_id: id });
  } catch (e) { console.error('[admin-group-message]', e.message); res.status(500).json({ error: 'Broadcast failed' }); }
});

app.delete('/api/admin/groups/:id', authMiddleware, adminOnly, async (req, res) => {
  const group = await getQuery('SELECT id, avatar, wallpaper FROM groups WHERE id=?', [req.params.id]);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  // v5.3.1: children pehle delete karo (reactions → votes → polls → messages), phir group
  try { await runQuery(`DELETE FROM message_reactions WHERE message_id IN (SELECT id FROM group_messages WHERE group_id=?)`, [req.params.id]); } catch {}
  try { await runQuery(`DELETE FROM poll_votes WHERE poll_id IN (SELECT id FROM polls WHERE context_type='group' AND context_id=?)`, [req.params.id]); } catch {}
  try { await runQuery(`DELETE FROM polls WHERE context_type='group' AND context_id=?`, [req.params.id]); } catch {}
  await runQuery('DELETE FROM group_messages WHERE group_id=?', [req.params.id]);
  await runQuery('DELETE FROM group_members WHERE group_id=?', [req.params.id]);
  await runQuery('DELETE FROM groups WHERE id=?', [req.params.id]);
  try {
    if (group.avatar) fse.remove(path.join(UPLOADS, group.avatar.replace(/^\/uploads\//, ''))).catch(() => {});
    if (group.wallpaper) fse.remove(path.join(UPLOADS, group.wallpaper.replace(/^\/uploads\//, ''))).catch(() => {});
  } catch {}
  await audit(req.user.id, 'admin-delete-group', req.params.id);
  res.json({ message: 'Group deleted' });
});

/* ============================================================
   v5.3.1: ADMIN CHANNELS FULL CONTROL
   ============================================================ */
// List all channels with subscriber count + owner
app.get('/api/admin/channels', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await allQuery(`SELECT c.*, (SELECT COUNT(*) FROM channel_subscribers cs WHERE cs.channel_id=c.id) AS sub_count,
      (SELECT COUNT(*) FROM channel_messages cm WHERE cm.channel_id=c.id) AS message_count,
      u.username AS owner_name
      FROM channels c LEFT JOIN users u ON u.id=c.owner_id ORDER BY c.created_at DESC`);
    res.json({ channels: rows });
  } catch (e) { console.error('[admin-channels]', e.message); res.status(500).json({ error: 'Failed to load channels' }); }
});

/* ---- v16.4.4: Admin channel posts viewer (view + delete individual posts) ---- */
app.get('/api/admin/channels/:id/posts', authMiddleware, adminOnly, async (req, res) => {
  try {
    const ch = await getQuery('SELECT id, name, avatar FROM channels WHERE id=?', [req.params.id]);
    if (!ch) return res.status(404).json({ error: 'Channel not found' });
    const rows = await allQuery(`SELECT cm.*, u.username AS sender_name FROM channel_messages cm
      LEFT JOIN users u ON u.id=cm.sender_id WHERE cm.channel_id=? ORDER BY cm.timestamp DESC LIMIT 200`, [req.params.id]);
    res.json({ channel: ch, posts: rows.map(decorateMessage) });
  } catch (e) { console.error('[admin-ch-posts]', e.message); res.status(500).json({ error: 'Failed to load posts' }); }
});

/* ---- v16.4.4: Admin group messages viewer (view + delete individual messages) ---- */
app.get('/api/admin/groups/:id/messages', authMiddleware, adminOnly, async (req, res) => {
  try {
    const g = await getQuery('SELECT id, name, avatar FROM groups WHERE id=?', [req.params.id]);
    if (!g) return res.status(404).json({ error: 'Group not found' });
    const rows = await allQuery(`SELECT gm.*, u.username AS sender_name FROM group_messages gm
      LEFT JOIN users u ON u.id=gm.sender_id WHERE gm.group_id=? ORDER BY gm.timestamp DESC LIMIT 200`, [req.params.id]);
    res.json({ group: g, messages: rows.map(decorateMessage) });
  } catch (e) { console.error('[admin-grp-msgs]', e.message); res.status(500).json({ error: 'Failed to load messages' }); }
});

/* ---- v16.4.4: Admin Store/Uploads browser ---- */
app.get('/api/admin/store', authMiddleware, adminOnly, async (req, res) => {
  try {
    const fsx = require('fs');
    const pathx = require('path');
    const tab = String(req.query.tab || 'all');
    /* har folder scan karo + owner match karo DB se */
    const items = [];
    const dirScan = async (sub, kind) => {
      const dir = pathx.join(UPLOADS, sub);
      let files = [];
      try { files = fsx.readdirSync(dir); } catch { return; }
      for (const fname of files) {
        const fpath = pathx.join(dir, fname);
        let stat; try { stat = fsx.statSync(fpath); } catch { continue; }
        if (!stat.isFile()) continue;
        const url = '/uploads/' + sub + '/' + fname;
        const isImg = /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(fname);
        const isVid = /\.(mp4|webm|mov|mkv|avi|3gp)$/i.test(fname);
        const isVoc = /\.(mp3|wav|ogg|m4a|aac|opus)$/i.test(fname);
        let type = 'file';
        if (isImg) type = 'image'; else if (isVid) type = 'video'; else if (isVoc) type = 'audio';
        if (tab === 'images' && type !== 'image') continue;
        if (tab === 'videos' && type !== 'video') continue;
        if (tab === 'files' && (type === 'image' || type === 'video')) continue;
        /* owner lookup \u2014 sab tables scan (users profile, messages, group/channel msgs, stories) */
        let owner = '?';
        try {
          if (sub === 'profiles') {
            const u = await getQuery('SELECT username FROM users WHERE profile_pic=?', [url]);
            if (u) owner = u.username + ' (profile)';
          } else if (sub === 'stories') {
            const s = await getQuery(`SELECT u.username FROM stories s JOIN users u ON u.id=s.user_id WHERE s.media_url=?`, [url]);
            if (s) owner = s.username + ' (story)';
          } else if (sub === 'wallpapers') {
            const u = await getQuery('SELECT username FROM users WHERE wallpaper=?', [url]);
            if (u) owner = u.username + ' (wallpaper)';
          } else {
            const m = await getQuery(`SELECT u.username FROM messages m JOIN users u ON u.id=m.from_user WHERE m.media_url=?`, [url]);
            if (m) owner = m.username + ' (DM)';
            else {
              const g = await getQuery(`SELECT u.username FROM group_messages gm JOIN users u ON u.id=gm.sender_id WHERE gm.media_url=?`, [url]);
              if (g) owner = g.username + ' (group)';
              else {
                const chm = await getQuery(`SELECT u.username FROM channel_messages cm JOIN users u ON u.id=cm.sender_id WHERE cm.media_url=?`, [url]);
                if (chm) owner = chm.username + ' (channel)';
              }
            }
          }
        } catch {}
        items.push({ name: fname, url, type, kind: kind, size: stat.size, owner, uploaded_at: stat.mtimeMs });
      }
    };
    await dirScan('profiles', 'profile');
    await dirScan('stories', 'story');
    await dirScan('wallpapers', 'wallpaper');
    await dirScan('images', 'message');
    await dirScan('videos', 'message');
    await dirScan('voice', 'voice');
    await dirScan('files', 'file');
    items.sort((a, b) => b.uploaded_at - a.uploaded_at);
    const totalBytes = items.reduce((s, i) => s + (i.size || 0), 0);
    res.json({ items: items.slice(0, 500), total_bytes: totalBytes });
  } catch (e) { console.error('[admin-store]', e.message); res.status(500).json({ error: 'Store load failed' }); }
});

/* ---- v16.4.4: Admin file delete from store ---- */
app.post('/api/admin/store/delete', authMiddleware, adminOnly, async (req, res) => {
  try {
    const url = clean(req.body.url || '');
    if (!url || !url.startsWith('/uploads/')) return res.status(400).json({ error: 'Invalid file URL' });
    const rel = url.replace('/uploads/', '');
    if (rel.includes('..')) return res.status(400).json({ error: 'Invalid path' });
    const fpath = path.join(UPLOADS, rel);
    if (!fpath.startsWith(UPLOADS)) return res.status(400).json({ error: 'Invalid path' });
    try { fs.unlinkSync(fpath); } catch { return res.status(404).json({ error: 'File not found' }); }
    /* v16.4.4: deleted file ke DB references bhi clear karo (broken images/files se bachne ke liye) */
    try {
      await runQuery('UPDATE channels SET avatar=\'\' WHERE avatar=?', [url]);
      await runQuery('UPDATE users SET profile_pic=\'\' WHERE profile_pic=?', [url]);
      await runQuery('UPDATE users SET wallpaper=\'\' WHERE wallpaper=?', [url]);
      await runQuery('DELETE FROM stories WHERE media_url=?', [url]);
      await runQuery('UPDATE messages SET media_url=\'\' WHERE media_url=?', [url]);
      await runQuery('UPDATE group_messages SET media_url=\'\' WHERE media_url=?', [url]);
      await runQuery('UPDATE channel_messages SET media_url=\'\' WHERE media_url=?', [url]);
    } catch (e2) { console.error('[admin-store-del-refs]', e2.message); }
    await audit(req.user.id, 'admin-delete-file', rel);
    res.json({ message: 'File delete ho gaya \u{1F5D1}\u{FE0F}' });
  } catch (e) { console.error('[admin-store-del]', e.message); res.status(500).json({ error: 'Delete failed' }); }
});

app.post('/api/admin/channels', authMiddleware, adminOnly, async (req, res) => {
  try {
    const name = clean(req.body.name || '');
    const desc = clean(req.body.description || '');
    if (!name) return res.status(400).json({ error: 'Channel name required' });
    const id = uuidv4();
    await runQuery(`INSERT INTO channels (id, name, description, owner_id, subscribers, created_at) VALUES (?,?,?,?,0,?)`,
      [id, name, desc, req.user.id, Date.now()]);
    await runQuery('INSERT INTO channel_subscribers (channel_id, user_id, subscribed_at) VALUES (?,?,?)', [id, req.user.id, Date.now()]);
    await runQuery('UPDATE channels SET subscribers=1 WHERE id=?', [id]);
    await audit(req.user.id, 'admin-create-channel', name);
    res.status(201).json({ message: `Channel "${name}" created 📢`, channel_id: id });
  } catch (e) { console.error('[admin-create-channel]', e.message); res.status(500).json({ error: 'Create failed' }); }
});

// Edit channel (name / description)
app.put('/api/admin/channels/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const c = await getQuery('SELECT * FROM channels WHERE id=?', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Channel not found' });
    const name = req.body.name !== undefined ? clean(req.body.name) : c.name;
    const description = req.body.description !== undefined ? clean(req.body.description) : c.description;
    if (!name) return res.status(400).json({ error: 'Channel name cannot be empty' });
    await runQuery('UPDATE channels SET name=?, description=? WHERE id=?', [name, description, req.params.id]);
    // Notify all subscribers
    const subs = await allQuery('SELECT user_id FROM channel_subscribers WHERE channel_id=? AND user_id<>?', [req.params.id, req.user.id]);
    for (const s of subs) {
      await pushNotification(s.user_id, 'system', 'Channel Updated', `Admin ne "${c.name}" channel update kiya`, { channel_id: req.params.id });
    }
    await audit(req.user.id, 'admin-edit-channel', `${req.params.id}: ${name}`);
    res.json({ message: 'Channel updated ✅', channel: { id: req.params.id, name, description } });
  } catch (e) { console.error('[admin-edit-channel]', e.message); res.status(500).json({ error: 'Update failed' }); }
});

// List subscribers of a channel
app.get('/api/admin/channels/:id/subscribers', authMiddleware, adminOnly, async (req, res) => {
  const c = await getQuery('SELECT id, name FROM channels WHERE id=?', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'Channel not found' });
  const rows = await allQuery(`SELECT cs.user_id AS id, u.username, u.email, u.profile_pic, cs.subscribed_at
    FROM channel_subscribers cs JOIN users u ON u.id=cs.user_id WHERE cs.channel_id=? ORDER BY cs.subscribed_at ASC`, [req.params.id]);
  res.json({ channel: c, subscribers: rows });
});

/* ---- v16.4.4: Channel DP (avatar) change ---- */
app.post('/api/admin/channels/:id/avatar', authMiddleware, adminOnly, upload.single('avatar'), async (req, res) => {
  try {
    const c = await getQuery('SELECT * FROM channels WHERE id=?', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Channel not found' });
    if (!req.file) return res.status(400).json({ error: 'Koi image select nahi hui' });
    const avatarUrl = '/uploads/' + path.relative(UPLOADS, req.file.path).split(path.sep).join('/');
    await runQuery('UPDATE channels SET avatar=? WHERE id=?', [avatarUrl, req.params.id]);
    /* live update: sab subscribers ko naya DP dikhe */
    io.emit('channel-updated', { channel_id: req.params.id, avatar: avatarUrl, name: c.name });
    await audit(req.user.id, 'admin-channel-avatar', `${req.params.id}: ${avatarUrl}`);
    res.json({ message: 'Channel DP update ho gaya \ud83d\udcbc', avatar: avatarUrl });
  } catch (e) { console.error('[admin-channel-avatar]', e.message); res.status(500).json({ error: 'DP update failed' }); }
});

/* ---- v16.4.4: Admin individual channel post delete ---- */
app.delete('/api/admin/channel-messages/:msgId', authMiddleware, adminOnly, async (req, res) => {
  try {
    const m = await getQuery('SELECT * FROM channel_messages WHERE id=?', [req.params.msgId]);
    if (!m) return res.status(404).json({ error: 'Post not found' });
    const oldPath = m.media_url ? path.join(UPLOADS, m.media_url.replace('/uploads/', '')) : null;
    await runQuery('DELETE FROM channel_messages WHERE id=?', [req.params.msgId]);
    if (oldPath) { try { fs.unlinkSync(oldPath); } catch {} }
    io.emit('channel-message-deleted', { id: m.id, channel_id: m.channel_id });
    await audit(req.user.id, 'admin-delete-channel-post', `${m.channel_id}/${m.id}`);
    res.json({ message: 'Channel post delete ho gaya \ud83d\uddd1\ufe0f' });
  } catch (e) { console.error('[admin-del-ch-post]', e.message); res.status(500).json({ error: 'Delete failed' }); }
});

/* ---- v16.4.4: Admin individual group message delete ---- */
app.delete('/api/admin/group-messages/:msgId', authMiddleware, adminOnly, async (req, res) => {
  try {
    const m = await getQuery('SELECT * FROM group_messages WHERE id=?', [req.params.msgId]);
    if (!m) return res.status(404).json({ error: 'Message not found' });
    const oldPath = m.media_url ? path.join(UPLOADS, m.media_url.replace('/uploads/', '')) : null;
    await runQuery('DELETE FROM group_messages WHERE id=?', [req.params.msgId]);
    if (oldPath) { try { fs.unlinkSync(oldPath); } catch {} }
    io.to(`group_${m.group_id}`).emit('message-deleted', { id: m.id });
    await audit(req.user.id, 'admin-delete-group-msg', `${m.group_id}/${m.id}`);
    res.json({ message: 'Group message delete ho gaya \ud83d\uddd1\ufe0f' });
  } catch (e) { console.error('[admin-del-grp-msg]', e.message); res.status(500).json({ error: 'Delete failed' }); }
});

// Delete channel with full cleanup
app.delete('/api/admin/channels/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const c = await getQuery('SELECT id, name FROM channels WHERE id=?', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Channel not found' });
    // Notify subscribers before deletion
    const subs = await allQuery('SELECT user_id FROM channel_subscribers WHERE channel_id=? AND user_id<>?', [req.params.id, req.user.id]);
    await runQuery('DELETE FROM channels WHERE id=?', [req.params.id]);
    await runQuery('DELETE FROM channel_subscribers WHERE channel_id=?', [req.params.id]);
    await runQuery('DELETE FROM channel_messages WHERE channel_id=?', [req.params.id]);
    for (const s of subs) {
      await pushNotification(s.user_id, 'system', 'Channel Deleted', `Admin ne "${c.name}" channel delete kar diya`, {});
    }
    await audit(req.user.id, 'admin-delete-channel', req.params.id);
    res.json({ message: `Channel "${c.name}" deleted 🗑️` });
  } catch (e) { console.error('[admin-delete-channel]', e.message); res.status(500).json({ error: 'Delete failed' }); }
});

// Broadcast to channel as admin (post message)
app.post('/api/admin/channels/:id/message', authMiddleware, adminOnly, upload.single('media'), async (req, res) => {
  try {
    const c = await getQuery('SELECT * FROM channels WHERE id=?', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Channel not found' });
    const msg = clean(req.body.message || '');
    const mediaUrl = req.file ? '/uploads/' + path.relative(UPLOADS, req.file.path).split(path.sep).join('/') : null;
    /* v5.4.0: media type detect */
    let type = 'text';
    if (req.file) {
      const mm = (req.file.mimetype || '').toLowerCase();
      type = mm.startsWith('image/') ? 'image' : mm.startsWith('video/') ? 'video' : mm.startsWith('audio/') ? 'audio' : 'file';
    }
    if (!msg && !mediaUrl) return res.status(400).json({ error: 'Message ya media required' });
    const id = uuidv4();
    const ts = Date.now();
    const enc = msg ? encryptText(msg) : null;
    await runQuery(`INSERT INTO channel_messages (id, channel_id, sender_id, message, type, media_url, timestamp) VALUES (?,?,?,?,?,?,?)`,
      [id, req.params.id, req.user.id, enc, type, mediaUrl, ts]);
    const sender = await getQuery('SELECT username FROM users WHERE id=?', [req.user.id]);
    const payload = { id, channel_id: req.params.id, sender_id: req.user.id, sender: { id: req.user.id, username: (sender && sender.username) || 'Admin' }, message: msg, type, media_url: mediaUrl, media_name: req.file ? req.file.originalname : '', timestamp: ts };
    const subs = await allQuery('SELECT user_id FROM channel_subscribers WHERE channel_id=? AND user_id<>?', [req.params.id, req.user.id]);
    for (const s of subs) {
      emitToUser(s.user_id, 'new-channel-message', payload);
      const preview = type === 'text' ? msg.slice(0, 60) : (type === 'image' ? '📷 Photo' : type === 'video' ? '🎬 Video' : type === 'audio' ? '🎵 Audio' : '📎 File');
      await pushNotification(s.user_id, 'system', `📢 ${c.name}`, `${(sender && sender.username) || 'Admin'}: ${preview}`, { channel_id: req.params.id });
    }
    await audit(req.user.id, 'admin-channel-message', `${c.name}: ${type === 'text' ? msg.slice(0, 40) : '[' + type + '] ' + (req.file ? req.file.originalname : '')}`);
    res.status(201).json({ message: `Channel post publish ho gaya ✅ (${subs.length} subscribers ko gaya)`, message_id: id });
  } catch (e) { console.error('[admin-channel-message]', e.message); res.status(500).json({ error: 'Broadcast failed' }); }
});

// Notify ALL users (system-wide broadcast from a channel context)
app.post('/api/admin/channels/:id/notify', authMiddleware, adminOnly, async (req, res) => {
  try {
    const c = await getQuery('SELECT * FROM channels WHERE id=?', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Channel not found' });
    const title = clean(req.body.title || `📢 ${c.name}`);
    const body = clean(req.body.body || req.body.message || '');
    if (!body) return res.status(400).json({ error: 'Notification body required' });
    // Broadcast to ALL users of the system
    const all = await allQuery('SELECT id FROM users WHERE id<>? AND email<>?', [req.user.id, 'bot@csk4.com']);
    for (const u of all) {
      await pushNotification(u.id, 'system', title, body, { channel_id: req.params.id });
    }
    await audit(req.user.id, 'admin-channel-notify', `${c.name}: ${body.slice(0, 40)}`);
    res.json({ message: `Notification ${all.length} users ko bhej di ✅` });
  } catch (e) { console.error('[admin-channel-notify]', e.message); res.status(500).json({ error: 'Notify failed' }); }
});

// Force subscribe a user to channel
app.post('/api/admin/channels/:id/subscribe-user', authMiddleware, adminOnly, async (req, res) => {
  try {
    const c = await getQuery('SELECT * FROM channels WHERE id=?', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Channel not found' });
    const uid = clean(req.body.userId || req.body.user_id || '');
    const uname = clean(req.body.username || '');
    let target = null;
    if (uid) target = await getQuery('SELECT id, username FROM users WHERE id=?', [uid]);
    else if (uname) target = await getQuery('SELECT id, username FROM users WHERE username=? COLLATE NOCASE', [uname]);
    if (!target) return res.status(404).json({ error: 'User not found' });
    const r = await runQuery('INSERT OR IGNORE INTO channel_subscribers (channel_id, user_id, subscribed_at) VALUES (?,?,?)',
      [req.params.id, target.id, Date.now()]);
    if (r.changes > 0) {
      await runQuery('UPDATE channels SET subscribers = subscribers + 1 WHERE id=?', [req.params.id]);
      await pushNotification(target.id, 'system', 'Channel Subscribe', `Admin ne aapko "${c.name}" channel me add kiya`, { channel_id: req.params.id });
      await audit(req.user.id, 'admin-channel-subscribe-user', `${c.name} + ${target.username}`);
      res.status(201).json({ message: `${target.username} ab "${c.name}" ka subscriber hai ✅` });
    } else {
      res.status(409).json({ error: `${target.username} already subscribed hai` });
    }
  } catch (e) { console.error('[admin-channel-subscribe-user]', e.message); res.status(500).json({ error: 'Subscribe failed' }); }
});

// Force unsubscribe a user from channel
app.delete('/api/admin/channels/:id/subscribers/:userId', authMiddleware, adminOnly, async (req, res) => {
  try {
    const c = await getQuery('SELECT * FROM channels WHERE id=?', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Channel not found' });
    const r = await runQuery('DELETE FROM channel_subscribers WHERE channel_id=? AND user_id=?', [req.params.id, req.params.userId]);
    if (r.changes > 0) {
      await runQuery('UPDATE channels SET subscribers = MAX(subscribers - 1, 0) WHERE id=?', [req.params.id]);
      await pushNotification(req.params.userId, 'system', 'Channel Unsubscribe', `Admin ne aapko "${c.name}" channel se remove kiya`, {});
      await audit(req.user.id, 'admin-channel-unsubscribe-user', `${c.name} - ${req.params.userId}`);
      res.json({ message: 'Subscriber removed ✅' });
    } else {
      res.status(404).json({ error: 'Yeh user subscribed nahi hai' });
    }
  } catch (e) { console.error('[admin-channel-unsubscribe-user]', e.message); res.status(500).json({ error: 'Unsubscribe failed' }); }
});

app.get('/api/admin/reports', authMiddleware, adminOnly, async (req, res) => {
  const rows = await allQuery(`SELECT r.*, ru.username AS reporter_name, ru.username AS reporter_username,
    tu.username AS reported_name, tu.username AS reported_username,
    CASE WHEN r.status='resolved' THEN 1 ELSE 0 END AS resolved
    FROM reports r
    LEFT JOIN users ru ON ru.id=r.reporter_id LEFT JOIN users tu ON tu.id=r.reported_user ORDER BY r.created_at DESC LIMIT 200`);
  res.json({ reports: rows });
});

app.post('/api/admin/report/resolve', authMiddleware, adminOnly, async (req, res) => {
  await runQuery('UPDATE reports SET status=\'resolved\' WHERE id=?', [req.body.id || '']);
  await audit(req.user.id, 'admin-resolve-report', req.body.id || '');
  res.json({ message: 'Report resolved ✅' });
});

app.get('/api/admin/audit', authMiddleware, adminOnly, async (req, res) => {
  const rows = await allQuery(`SELECT a.*, u.username, a.details AS detail, a.timestamp AS created_at
    FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.timestamp DESC LIMIT 300`);
  res.json({ audit: rows });
});

app.get('/api/admin/backup', authMiddleware, adminOnly, async (req, res) => {
  try {
    const tables = ['users','messages','message_reactions','group_messages','groups','group_members','stories','story_views','channels','channel_subscribers','channel_messages','polls','poll_votes','games','notifications','quick_replies','reports','blocked_users','scheduled_messages','offline_messages','audit_log','sessions'];
    const dump = { app: `C$K4 Chat v${APP_VERSION} — FULL ADMIN BACKUP`, exported_at: new Date().toISOString() };
    for (const t of tables) {
      try { dump[t] = await allQuery(`SELECT * FROM ${t}`); } catch { dump[t] = []; }
    }
    res.setHeader('Content-Disposition', `attachment; filename="csk4-admin-backup-${Date.now()}.json"`);
    res.json(dump);
  } catch (e) { res.status(500).json({ error: 'Backup failed' }); }
});

/* ============================================================
   STATIC FILES
   ============================================================ */

// Explicit admin routes FIRST — guarantees admin.html is served and never
// falls through to the main app, and stops the browser caching a stale page.
app.get(['/admin', '/admin/', '/admin/admin.html'], (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(ADMIN_DIR, 'admin.html'));
});

app.use('/uploads', express.static(UPLOADS, { maxAge: '1d' }));
app.use('/admin', express.static(ADMIN_DIR, { maxAge: '10m' }));
app.use(express.static(PUBLIC_DIR, { maxAge: '10m' }));

/* ============================================================
   v5.4.0: SITE SETTINGS (social links, help contacts) — admin controlled
   ============================================================ */
const DEFAULT_SETTINGS = {
  whatsapp_number: '03347382564',
  help_email: 'cryptixshadowkernel@gmail.com',
  tiktok: 'https://www.tiktok.com/@csk4',
  facebook: 'https://www.facebook.com/csk4',
  github: 'https://github.com/csk4',
  x: 'https://x.com/csk4',
  linkedin: 'https://www.linkedin.com/company/csk4',
  telegram: 'https://t.me/csk4',
  telegram_channel: 'https://t.me/csk4channel',
  whatsapp_channel: 'https://whatsapp.com/channel/csk4',
  instagram: 'https://www.instagram.com/csk4',
  youtube: 'https://www.youtube.com/@csk4'
};

app.get('/api/settings', authMiddleware, async (req, res) => {
  try {
    const rows = await allQuery('SELECT key, value FROM site_settings');
    const settings = { ...DEFAULT_SETTINGS };
    for (const r of rows) if (r.value) settings[r.key] = r.value;
    res.json({ settings });
  } catch (e) { res.status(500).json({ error: 'Settings load failed' }); }
});

app.put('/api/admin/settings', authMiddleware, adminOnly, async (req, res) => {
  try {
    const allowed = Object.keys(DEFAULT_SETTINGS);
    let count = 0;
    for (const k of allowed) {
      if (req.body && req.body[k] !== undefined) {
        const v = clean(String(req.body[k] || ''));
        await runQuery('INSERT INTO site_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, v]);
        count++;
      }
    }
    await audit(req.user.id, 'admin-settings-update', count + ' keys');
    res.json({ message: `${count} settings update ho gayi ✅` });
  } catch (e) { console.error('[admin-settings]', e.message); res.status(500).json({ error: 'Settings save failed' }); }
});

/* ============================================================
   v5.4.0: ADS — admin create/activate, sab users ko notification
   ============================================================ */
app.get('/api/ads', authMiddleware, (req, res) => {
  (async () => {
    try {
      const rows = await allQuery('SELECT id, title, body, link_url, link_label, active, created_at FROM ads WHERE active=1 ORDER BY created_at DESC LIMIT 5');
      res.json({ ads: rows });
    } catch (e) { res.status(500).json({ error: 'Ads load failed' }); }
  })();
});

/* v5.4.0: admin — ALL ads (active + inactive) */
app.get('/api/admin/ads/list', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await allQuery('SELECT id, title, body, link_url, link_label, active, created_at FROM ads ORDER BY created_at DESC LIMIT 100');
    res.json({ ads: rows });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/admin/ads', authMiddleware, adminOnly, async (req, res) => {
  try {
    const title = clean(req.body.title || '');
    const body = clean(req.body.body || '');
    const linkUrl = clean(req.body.link_url || '');
    const linkLabel = clean(req.body.link_label || 'Open');
    const notify = req.body.notify !== false;
    if (!title) return res.status(400).json({ error: 'Ad title required' });
    const id = uuidv4();
    await runQuery('INSERT INTO ads (id, title, body, link_url, link_label, active, created_by, created_at) VALUES (?,?,?,?,?,1,?,?)',
      [id, title, body, linkUrl, linkLabel, req.user.id, Date.now()]);
    if (notify) {
      const all = await allQuery('SELECT id FROM users WHERE id<>? AND email<>?', [req.user.id, 'bot@csk4.com']);
      for (const u of all) {
        await pushNotification(u.id, 'system', `🔔 ${title}`, (body || linkUrl).slice(0, 80), { ad_id: id });
      }
    }
    await audit(req.user.id, 'admin-create-ad', title);
    res.status(201).json({ message: `Ad live ho gaya ✅ ${notify ? '(sab users ko notification gaya)' : '(notification skip)'}`, ad_id: id });
  } catch (e) { console.error('[admin-create-ad]', e.message); res.status(500).json({ error: 'Ad create failed' }); }
});

app.put('/api/admin/ads/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const ad = await getQuery('SELECT id, title FROM ads WHERE id=?', [req.params.id]);
    if (!ad) return res.status(404).json({ error: 'Ad not found' });
    const active = req.body && req.body.active !== undefined ? (req.body.active ? 1 : 0) : -1;
    if (active === -1) return res.status(400).json({ error: 'active required' });
    await runQuery('UPDATE ads SET active=? WHERE id=?', [active, req.params.id]);
    await audit(req.user.id, 'admin-toggle-ad', `${ad.title} = ${active}`);
    res.json({ message: `Ad ${active ? 'active' : 'inactive'} kar diya ✅` });
  } catch (e) { console.error('[admin-toggle-ad]', e.message); res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/admin/ads/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const r = await runQuery('DELETE FROM ads WHERE id=?', [req.params.id]);
    if (r.changes > 0) { await audit(req.user.id, 'admin-delete-ad', req.params.id); res.json({ message: 'Ad deleted ✅' }); }
    else res.status(404).json({ error: 'Ad not found' });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

/* ============================================================
   v5.4.0: TOOLS — admin managed links (TikTok downloader, store, etc.)
   ============================================================ */
const SEED_TOOLS = [
  { name: 'TikTok Video Downloader', description: 'Free TikTok videos watermark ke baghair download karo', icon: '🎬', url: 'https://csktiktokvideodownloder.netlify.app/' },
  { name: 'Basim Store', description: 'Online shopping — BasimStore v2', icon: '🛍', url: 'https://basimstore-com.github.io/basimstore-v2/' }
];

app.get('/api/tools', authMiddleware, (req, res) => {
  (async () => {
    try {
      let rows = await allQuery('SELECT * FROM tools WHERE active=1 ORDER BY created_at');
      if (!rows.length) {
        /* first run: seed default tools */
        for (const t of SEED_TOOLS) {
          await runQuery('INSERT INTO tools (id, name, description, icon, url, active, created_at) VALUES (?,?,?,?,?,1,?)',
            [uuidv4(), t.name, t.description, t.icon, t.url, Date.now()]);
        }
        rows = await allQuery('SELECT * FROM tools WHERE active=1 ORDER BY created_at');
      }
      res.json({ tools: rows });
    } catch (e) { res.status(500).json({ error: 'Tools load failed' }); }
  })();
});

/* v5.4.0: admin — ALL tools (active + inactive) */
app.get('/api/admin/tools/list', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await allQuery('SELECT * FROM tools ORDER BY created_at DESC LIMIT 100');
    res.json({ tools: rows });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/admin/tools', authMiddleware, adminOnly, async (req, res) => {
  try {
    const name = clean(req.body.name || '');
    const url = clean(req.body.url || '');
    if (!name || !url) return res.status(400).json({ error: 'Name + URL required' });
    const id = uuidv4();
    await runQuery('INSERT INTO tools (id, name, description, icon, url, active, created_at) VALUES (?,?,?,?,?,1,?)',
      [id, name, clean(req.body.description || ''), clean(req.body.icon || '🔧'), url, Date.now()]);
    await audit(req.user.id, 'admin-create-tool', name);
    res.status(201).json({ message: `Tool "${name}" add ho gaya ✅` });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

app.put('/api/admin/tools/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const t = await getQuery('SELECT id, name FROM tools WHERE id=?', [req.params.id]);
    if (!t) return res.status(404).json({ error: 'Tool not found' });
    const active = req.body && req.body.active !== undefined ? (req.body.active ? 1 : 0) : -1;
    if (active === -1) return res.status(400).json({ error: 'active required' });
    await runQuery('UPDATE tools SET active=? WHERE id=?', [active, req.params.id]);
    await audit(req.user.id, 'admin-toggle-tool', `${t.name} = ${active}`);
    res.json({ message: `Tool ${active ? 'active' : 'inactive'} ✅` });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/admin/tools/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const r = await runQuery('DELETE FROM tools WHERE id=?', [req.params.id]);
    if (r.changes > 0) { await audit(req.user.id, 'admin-delete-tool', req.params.id); res.json({ message: 'Tool deleted ✅' }); }
    else res.status(404).json({ error: 'Tool not found' });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

/* ============================================================
   v5.4.0: SUPPORT TICKETS — user→admin help line chat
   ============================================================ */
app.post('/api/support', authMiddleware, async (req, res) => {
  try {
    const type = ['problem', 'feedback', 'suggestion', 'other'].includes(clean(req.body.type)) ? clean(req.body.type) : 'other';
    const subject = clean(req.body.subject || '').slice(0, 120);
    const message = clean(req.body.message || '').slice(0, 2000);
    if (!message) return res.status(400).json({ error: 'Message likho' });
    const id = uuidv4();
    await runQuery("INSERT INTO support_tickets (id, user_id, type, subject, message, status, created_at) VALUES (?,?,?,?,?,'open',?)",
      [id, req.user.id, type, subject, message, Date.now()]);
    /* sab admins ko live notification */
    const admins = await allQuery('SELECT id FROM users WHERE is_admin=1');
    for (const a of admins) {
      await pushNotification(a.id, 'support', `🆘 SUPPORT: ${type.toUpperCase()}`, `${req.user.username}: ${(subject || message).slice(0, 60)}`, { ticket_id: id });
      emitToUser(a.id, 'new-support-ticket', { id, type, subject, message: message.slice(0, 200), username: req.user.username, created_at: Date.now() });
    }
    res.status(201).json({ message: 'Support message admin ko chala gaya ✅ jald reply aayega', ticket_id: id });
  } catch (e) { console.error('[support-create]', e.message); res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/support/my', authMiddleware, async (req, res) => {
  try {
    const rows = await allQuery('SELECT * FROM support_tickets WHERE user_id=? ORDER BY created_at DESC', [req.user.id]);
    res.json({ tickets: rows });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/admin/support', authMiddleware, adminOnly, async (req, res) => {
  try {
    const rows = await allQuery(`SELECT t.*, u.username, u.email FROM support_tickets t LEFT JOIN users u ON u.id=t.user_id ORDER BY t.created_at DESC LIMIT 300`);
    res.json({ tickets: rows });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

app.put('/api/admin/support/:id/reply', authMiddleware, adminOnly, async (req, res) => {
  try {
    const t = await getQuery('SELECT * FROM support_tickets WHERE id=?', [req.params.id]);
    if (!t) return res.status(404).json({ error: 'Ticket not found' });
    const reply = clean(req.body.reply || '').slice(0, 2000);
    if (!reply) return res.status(400).json({ error: 'Reply likho' });
    await runQuery("UPDATE support_tickets SET admin_reply=?, replied_at=?, status='answered' WHERE id=?", [reply, Date.now(), req.params.id]);
    await pushNotification(t.user_id, 'support', '📝 Admin ne reply kiya', reply.slice(0, 80), { ticket_id: req.params.id });
    emitToUser(t.user_id, 'support-reply', { ticket_id: req.params.id, reply, replied_at: Date.now() });
    await audit(req.user.id, 'admin-support-reply', `ticket ${req.params.id}`);
    res.json({ message: 'Reply bhej diya ✅ user ko notification gaya' });
  } catch (e) { console.error('[admin-support-reply]', e.message); res.status(500).json({ error: 'Failed' }); }
});

app.put('/api/admin/support/:id/close', authMiddleware, adminOnly, async (req, res) => {
  try {
    const r = await runQuery("UPDATE support_tickets SET status='closed' WHERE id=?", [req.params.id]);
    if (r.changes > 0) { await audit(req.user.id, 'admin-support-close', req.params.id); res.json({ message: 'Ticket closed ✅' }); }
    else res.status(404).json({ error: 'Ticket not found' });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', app: `C$K4 Chat v${APP_VERSION}`, online: onlineUsers.size, time: Date.now() }));

app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API endpoint not found' });
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

/* Error handler */
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `File too large (max ${Math.round(MAX_FILE/1048576)}MB)` });
    return res.status(400).json({ error: 'Upload error: ' + err.message });
  }
  if (String(err.message || '').startsWith('File type not allowed')) {
    return res.status(415).json({ error: err.message });
  }
  res.status(500).json({ error: 'Server error: ' + (err.message || 'unknown') });
});

/* ============================================================
   CRON JOBS
   ============================================================ */
/* 1) Scheduled messages sender — every minute */
cron.schedule('* * * * *', async () => {
  try {
    const due = await allQuery('SELECT * FROM scheduled_messages WHERE sent=0 AND scheduled_at<=?', [Date.now()]);
    for (const sm of due) {
      const id = uuidv4();
      const ts = Date.now();
      await runQuery(`INSERT INTO messages (id, from_user, to_user, message, type, timestamp) VALUES (?,?,?,?,?,?)`,
        [id, sm.from_user, sm.to_user, sm.message, 'scheduled', ts]);
      const payload = { id, from_user: sm.from_user, to_user: sm.to_user, message: decryptText(sm.message), type: 'scheduled', timestamp: ts };
      if (isOnline(sm.to_user)) { emitToUser(sm.to_user, 'new-message', payload); }
      else await runQuery(`INSERT INTO offline_messages (id, from_user, to_user, message, type, payload, created_at) VALUES (?,?,?,?,?,?,?)`,
        [uuidv4(), sm.from_user, sm.to_user, sm.message, 'scheduled', '{}', Date.now()]);
      emitToUser(sm.from_user, 'new-message', { ...payload, mine: true });
      await runQuery('UPDATE scheduled_messages SET sent=1 WHERE id=?', [sm.id]);
    }
  } catch (e) { console.error('[cron-scheduled]', e.message); }
});

/* 2) Full DB backup — every 6 hours */
cron.schedule('0 */6 * * *', async () => {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(BACKUP_DIR, `csk4-auto-${stamp}.json`);
    const tables = ['users','messages','message_reactions','group_messages','groups','group_members','stories','channels','channel_messages','polls','poll_votes','games','notifications','reports','blocked_users','scheduled_messages','offline_messages'];
    const dump = { exported_at: new Date().toISOString() };
    for (const t of tables) { try { dump[t] = await allQuery(`SELECT * FROM ${t}`); } catch { dump[t] = []; } }
    await fse.writeJson(dest, dump, { spaces: 2 });
    /* keep only last 10 backups */
    const files = (await fse.readdir(BACKUP_DIR)).filter(f => f.startsWith('csk4-auto-')).sort();
    while (files.length > 10) await fse.remove(path.join(BACKUP_DIR, files.shift()));
    console.log(`  [CRON] Auto-backup saved: ${path.basename(dest)}`);
  } catch (e) { console.error('[cron-backup]', e.message); }
});

/* 3) Story expiry cleanup — every hour */
cron.schedule('0 * * * *', async () => {
  try {
    const expired = await allQuery('SELECT id, media_url FROM stories WHERE expires_at < ? AND expires_at > 0 AND is_highlight=0', [Date.now()]);
    for (const s of expired) {
      if (s.media_url) fse.remove(path.join(UPLOADS, path.basename(s.media_url))).catch(() => {});
    }
    await runQuery('DELETE FROM stories WHERE expires_at < ? AND expires_at > 0 AND is_highlight=0', [Date.now()]);
    await runQuery('DELETE FROM story_views WHERE story_id NOT IN (SELECT id FROM stories)');
    if (expired.length) console.log(`  [CRON] Cleaned ${expired.length} expired stories`);
  } catch (e) { console.error('[cron-stories]', e.message); }
});

/* ============================================================
   STARTUP
   ============================================================ */
async function start() {
  try {
    await initDB();
    await seedUsers();
    /* assign BOT_USER_ID (Feature: AI Bot) */
    try {
      const botRow = await getQuery('SELECT id FROM users WHERE email=?', ['bot@csk4.com']);
      if (botRow) BOT_USER_ID = botRow.id;
    } catch (e) { console.error('  [WARN] bot id lookup failed:', e.message); }
    if (!axios) console.log('  [WARN] axios not installed — weather/reverse-geocode will be limited');
    server.listen(PORT, () => {
      console.log('╔══════════════════════════════════════════════╗');
      console.log(`║   🚀 C$K4 Chat v${APP_VERSION} — SERVER STARTED! 🚀     ║`);
      console.log('╚══════════════════════════════════════════════╝');
      console.log(`  ⚡ App:        http://localhost:${PORT}`);
      console.log(`  🔧 Admin:      http://localhost:${PORT}/admin/admin.html`);
      console.log(`  📊 Health:     http://localhost:${PORT}/api/health`);
      console.log(`  🗄️  Database:  ${DB_PATH}`);
      console.log(`  📁 Uploads:    ${UPLOADS}`);
      console.log(`  🔐 Admin email: ${process.env.ADMIN_EMAIL || 'admin@csk4.com'} (password hidden)`);
      if (NODE_ENV !== 'production' && process.env.ENABLE_DEMO_ACCOUNTS !== 'false') console.log('  👤 Demo account enabled in development');
      console.log(`  🤖 Bot:         bot@csk4.com (chat with CSK4 Bot)`);
      console.log(`  ✅ v${APP_VERSION} features loaded | Socket.io + WebRTC ready`);
    });
  } catch (e) {
    console.error('❌ Failed to start:', e);
    process.exit(1);
  }
}
start();
