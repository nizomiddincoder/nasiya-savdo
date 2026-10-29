import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const UPLOADS = path.join(DATA_DIR, 'uploads');
export const BACKUPS = path.join(DATA_DIR, 'backups');
export const DB_FILE = path.join(DATA_DIR, 'nasiya.db');
for (const d of [DATA_DIR, UPLOADS, BACKUPS]) fs.mkdirSync(d, { recursive: true });

export const db = new DatabaseSync(DB_FILE);
db.exec(`
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY, name TEXT NOT NULL, sort INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS products(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', specs TEXT DEFAULT '',
  category_id INTEGER, price INTEGER NOT NULL DEFAULT 0, stock INTEGER NOT NULL DEFAULT 0,
  installment_enabled INTEGER DEFAULT 1, terms TEXT DEFAULT '[]', min_down_pct REAL DEFAULT 20,
  images TEXT DEFAULT '[]', colors TEXT DEFAULT '[]', storages TEXT DEFAULT '[]',
  active INTEGER DEFAULT 1, created_at TEXT);
CREATE TABLE IF NOT EXISTS customers(
  id INTEGER PRIMARY KEY, tg_id INTEGER UNIQUE, first_name TEXT, last_name TEXT, username TEXT,
  full_name TEXT, phone TEXT, photo_url TEXT, bot_blocked INTEGER DEFAULT 0, ads_off INTEGER DEFAULT 0,
  created_at TEXT, last_seen TEXT);
CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY, customer_id INTEGER, type TEXT, status TEXT DEFAULT 'new',
  total INTEGER DEFAULT 0, months INTEGER, markup_pct REAL, down_payment INTEGER DEFAULT 0,
  monthly INTEGER, installment_total INTEGER DEFAULT 0,
  delivery_method TEXT, address TEXT, lat REAL, lng REAL, comment TEXT, full_name TEXT, phone TEXT,
  imei TEXT, group_msg_id INTEGER, reminders_paused INTEGER DEFAULT 0, reminder_days TEXT,
  reject_reason TEXT, created_at TEXT, confirmed_at TEXT, closed_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS order_items(
  id INTEGER PRIMARY KEY, order_id INTEGER, product_id INTEGER, name TEXT, color TEXT, storage TEXT,
  qty INTEGER, price INTEGER, image TEXT);
CREATE TABLE IF NOT EXISTS schedule(id INTEGER PRIMARY KEY, order_id INTEGER, idx INTEGER, due_date TEXT, amount INTEGER);
CREATE TABLE IF NOT EXISTS payments(
  id INTEGER PRIMARY KEY, order_id INTEGER, amount INTEGER, method TEXT, kind TEXT, note TEXT,
  created_at TEXT, cancelled INTEGER DEFAULT 0, cancelled_at TEXT, cancel_reason TEXT);
CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY, actor TEXT, action TEXT, entity TEXT, entity_id INTEGER, details TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS reminders_sent(order_id INTEGER, schedule_id INTEGER, offset_days INTEGER, sent_on TEXT, PRIMARY KEY(schedule_id, offset_days));
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, customer_id INTEGER, direction TEXT, kind TEXT, text TEXT, file_id TEXT, is_read INTEGER DEFAULT 0, created_at TEXT);
CREATE TABLE IF NOT EXISTS broadcasts(
  id INTEGER PRIMARY KEY, product_id INTEGER, target TEXT, text TEXT, image TEXT, button_url TEXT,
  status TEXT, total INTEGER DEFAULT 0, delivered INTEGER DEFAULT 0, blocked INTEGER DEFAULT 0, failed INTEGER DEFAULT 0,
  channel_status TEXT, created_at TEXT, finished_at TEXT);
CREATE TABLE IF NOT EXISTS call_notes(id INTEGER PRIMARY KEY, order_id INTEGER, text TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, created_at TEXT, expires_at INTEGER);
CREATE TABLE IF NOT EXISTS login_codes(challenge TEXT PRIMARY KEY, code TEXT, expires_at INTEGER);
CREATE TABLE IF NOT EXISTS job_runs(job TEXT, run_on TEXT, PRIMARY KEY(job, run_on));
CREATE INDEX IF NOT EXISTS ix_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS ix_schedule_order ON schedule(order_id);
CREATE INDEX IF NOT EXISTS ix_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS ix_messages_customer ON messages(customer_id);
`);

const norm = (p) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));
export const q = {
  get: (sql, ...p) => db.prepare(sql).get(...norm(p)),
  all: (sql, ...p) => db.prepare(sql).all(...norm(p)),
  run: (sql, ...p) => db.prepare(sql).run(...norm(p)),
};
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const DEFAULT_SETTINGS = {
  shop_name: 'Ayfonchi Nasiya',
  shop_address: "Toshkent sh., Chilonzor tumani, 1-mavze",
  work_hours: '10:00 – 21:00, har kuni',
  usd_rate: 12800,
  default_terms: [
    { months: 3, markup: 10 },
    { months: 6, markup: 20 },
    { months: 9, markup: 28 },
    { months: 12, markup: 36 },
  ],
  min_down_pct: 20,
  reminder_days: [-3, 0, 1, 3, 7],
  reminder_time: '10:00',
  report_time: '08:00',
  tpl_before: "Assalomu alaykum, {ism}! Eslatma: {sana} kuni {summa} so'm nasiya to'lovi muddati. Umumiy qoldiq: {qoldiq} so'm.",
  tpl_due: "Assalomu alaykum, {ism}! Bugun ({sana}) {summa} so'm nasiya to'lovi kuni. Umumiy qoldiq: {qoldiq} so'm.",
  tpl_overdue: "Hurmatli {ism}, {sana} kungi {summa} so'm to'lov hali amalga oshirilmagan. Iltimos, to'lovni tezroq amalga oshiring. Umumiy qoldiq: {qoldiq} so'm.",
  // Kanal / tarqatma posti shabloni
  post_template: [
    '• {nomi}',
    '{xususiyatlar}',
    '',
    "💵 Narxi: {narx} so'm (≈ {narx_usd}$)✅",
    '{nasiya}',
    '',
    'Murojaat Uchun',
    '',
    '{kontaktlar}',
    '',
    'Telegram Kanalimiz',
    '👇👇👇👇👇👇',
    '{kanal}',
  ].join('\n'),
  post_installment_line: "💳 Nasiyaga: oyiga {oylik} so'mdan ({muddat} oy)",
  contact_phones: '+998 94 757 3333\n+998 99 050 1999',
  contact_admin: '@azzamovich_3333',
  channel_link: 'https://t.me/ayfonchii_uz',
  group_chat_id: '',
  channel_id: '',
  admin_tg_id: '',
  miniapp_link: '',
  broadcast_daily_limit: 2,
  twofa_enabled: false,
  quick_replies: [
    { title: 'Manzil', text: "Do'konimiz manzili: Toshkent sh., Chilonzor tumani, 1-mavze. Mo'ljal: metro yonida." },
    { title: 'Ish vaqti', text: 'Har kuni 10:00 dan 21:00 gacha ishlaymiz.' },
    { title: "To'lov rekvizitlari", text: "Karta: 8600 0000 0000 0000 (F.I.O.). To'lovdan keyin chekni shu yerga yuboring." },
  ],
};
const HIDDEN = ['admin_login', 'admin_pass_hash'];

export function getSettings({ withSecrets = false } = {}) {
  const s = { ...DEFAULT_SETTINGS };
  for (const r of q.all('SELECT key, value FROM settings')) {
    try { s[r.key] = JSON.parse(r.value); } catch { s[r.key] = r.value; }
  }
  if (!withSecrets) for (const k of HIDDEN) delete s[k];
  return s;
}
export function setSetting(key, value) {
  q.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, JSON.stringify(value));
}

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex');
}
export function checkPassword(pw, stored) {
  if (!stored) return false;
  const [salt, h] = stored.split(':');
  const a = Buffer.from(h, 'hex');
  const b = crypto.scryptSync(pw, salt, 32);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function ensureAdmin() {
  const s = getSettings({ withSecrets: true });
  if (!s.admin_pass_hash) {
    setSetting('admin_login', process.env.ADMIN_LOGIN || 'admin');
    setSetting('admin_pass_hash', hashPassword(process.env.ADMIN_PASSWORD || 'admin123'));
  }
}
