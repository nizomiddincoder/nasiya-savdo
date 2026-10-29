import { Router } from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import multer from 'multer';
import { q, getSettings, setSetting, checkPassword, hashPassword, UPLOADS, DEFAULT_SETTINGS } from '../db.js';
import * as U from '../util.js';
import * as tg from '../tg.js';
import * as S from '../services.js';
import { h } from './app.js';
import { dailyReport, dailyReportText, periodReport, exportExcel, portfolio, dueOn, salesBetween, receiptsBetween } from '../reports.js';
import { runReminders, sendDailyReport, runBroadcast, backup } from '../jobs.js';

const r = Router();
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, f, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${path.extname(f.originalname).toLowerCase() || '.jpg'}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, f, cb) => cb(null, /^image\//.test(f.mimetype)),
});

/* ---------------- Kirish ---------------- */
function newSession() {
  const token = crypto.randomBytes(24).toString('hex');
  q.run('INSERT INTO sessions(token,created_at,expires_at) VALUES(?,?,?)', token, U.nowStr(), Date.now() + 7 * 86400000);
  return { token };
}

r.post('/login', h(async (req) => {
  const s = getSettings({ withSecrets: true });
  const { login, password } = req.body || {};
  if (login !== s.admin_login || !checkPassword(String(password || ''), s.admin_pass_hash)) throw U.err("Login yoki parol noto'g'ri", 401);
  if (s.twofa_enabled && s.admin_tg_id && tg.state.bot) {
    const code = String(crypto.randomInt(100000, 999999));
    const challenge = crypto.randomBytes(16).toString('hex');
    q.run('INSERT INTO login_codes(challenge,code,expires_at) VALUES(?,?,?)', challenge, code, Date.now() + 5 * 60000);
    await tg.sendChat(s.admin_tg_id, `🔐 Admin panelga kirish kodi: <code>${code}</code>\n5 daqiqa amal qiladi.`);
    return { need_code: true, challenge };
  }
  return newSession();
}));

r.post('/login/verify', h((req) => {
  const row = q.get('SELECT * FROM login_codes WHERE challenge=?', req.body.challenge);
  if (!row || row.expires_at < Date.now() || row.code !== String(req.body.code).trim()) throw U.err("Kod noto'g'ri yoki eskirgan", 401);
  q.run('DELETE FROM login_codes WHERE challenge=?', row.challenge);
  return newSession();
}));

r.use((req, res, next) => {
  const token = (req.get('authorization') || '').replace(/^Bearer /, '') || req.query.t;
  const s = token && q.get('SELECT * FROM sessions WHERE token=?', token);
  if (!s || s.expires_at < Date.now()) return res.status(401).json({ error: 'Avtorizatsiya kerak' });
  next();
});

r.post('/logout', h((req) => {
  q.run('DELETE FROM sessions WHERE token=?', (req.get('authorization') || '').replace(/^Bearer /, ''));
  return { ok: true };
}));

/* ---------------- Bosh sahifa ---------------- */
r.get('/dashboard', h(() => {
  const t = U.today();
  const list = S.contracts();
  const overdue = list.filter((c) => c.status !== 'closed' && c.summary.overdue_amount > 0)
    .sort((a, b) => b.summary.overdue_days - a.summary.overdue_days)
    .map((c) => ({ id: c.id, name: c.c_name, phone: c.c_phone, product: c.product, amount: c.summary.overdue_amount, days: c.summary.overdue_days, bot_blocked: c.bot_blocked }));
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = U.addDays(t, -i);
    week.push({ date: d, receipts: receiptsBetween(d, d).total, sales: (({ cash, installment }) => cash.sum + installment.sum)(salesBetween(d, d)) });
  }
  return {
    today: t,
    sales: salesBetween(t, t),
    receipts: receiptsBetween(t, t),
    due_today: dueOn(t, list),
    overdue,
    portfolio: portfolio(list),
    new_orders: q.get("SELECT COUNT(*) n FROM orders WHERE status='new'").n,
    unread: q.get("SELECT COUNT(*) n FROM messages WHERE direction='in' AND is_read=0").n,
    week,
    bot: { running: tg.state.running, username: tg.state.info?.username, error: tg.state.error },
  };
}));

r.get('/counters', h(() => ({
  new_orders: q.get("SELECT COUNT(*) n FROM orders WHERE status='new'").n,
  unread: q.get("SELECT COUNT(*) n FROM messages WHERE direction='in' AND is_read=0").n,
})));

/* ---------------- Kategoriya va mahsulotlar ---------------- */
r.get('/categories', h(() => q.all('SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.active=1) n FROM categories c ORDER BY sort, id')));
r.post('/categories', h((req) => {
  const id = q.run('INSERT INTO categories(name,sort) VALUES(?, (SELECT COALESCE(MAX(sort),0)+1 FROM categories))', String(req.body.name || '').trim() || 'Yangi').lastInsertRowid;
  return q.get('SELECT * FROM categories WHERE id=?', id);
}));
r.put('/categories/:id', h((req) => { q.run('UPDATE categories SET name=? WHERE id=?', req.body.name, req.params.id); return { ok: true }; }));
r.delete('/categories/:id', h((req) => {
  if (q.get('SELECT COUNT(*) n FROM products WHERE category_id=? AND active=1', req.params.id).n) throw U.err('Kategoriyada mahsulotlar bor');
  q.run('DELETE FROM categories WHERE id=?', req.params.id);
  return { ok: true };
}));

r.get('/products', h(() => {
  const s = getSettings();
  return q.all('SELECT p.*, c.name AS category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.active=1 ORDER BY p.category_id, p.id').map((p) => S.parseProduct(p, s));
}));
r.get('/products/:id', h((req) => S.parseProduct(q.get('SELECT * FROM products WHERE id=?', req.params.id))));

function productFields(b) {
  const terms = (b.terms || []).map((t) => ({ months: Number(t.months), markup: Number(t.markup) || 0 })).filter((t) => [3, 6, 9, 12].includes(t.months));
  if (!String(b.name || '').trim()) throw U.err('Nomini kiriting');
  if (!(Number(b.price) > 0)) throw U.err('Narxni kiriting');
  return [
    String(b.name).trim(), b.description || '', b.specs || '', b.category_id || null, Math.round(Number(b.price)), Math.max(0, Math.round(Number(b.stock) || 0)),
    b.installment_enabled ? 1 : 0, JSON.stringify(terms), Number(b.min_down_pct) || 0, JSON.stringify(b.images || []),
    JSON.stringify((b.colors || []).filter(Boolean)), JSON.stringify((b.storages || []).filter((x) => x.label).map((x) => ({ label: x.label, extra: Math.round(Number(x.extra) || 0) }))),
  ];
}
r.post('/products', h((req) => {
  const id = q.run(`INSERT INTO products(name,description,specs,category_id,price,stock,installment_enabled,terms,min_down_pct,images,colors,storages,active,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?)`, ...productFields(req.body), U.nowStr()).lastInsertRowid;
  S.audit('product.create', 'product', id, { name: req.body.name, price: req.body.price });
  return S.parseProduct(q.get('SELECT * FROM products WHERE id=?', id));
}));
r.put('/products/:id', h((req) => {
  const old = q.get('SELECT price, stock FROM products WHERE id=?', req.params.id);
  q.run(`UPDATE products SET name=?,description=?,specs=?,category_id=?,price=?,stock=?,installment_enabled=?,terms=?,min_down_pct=?,images=?,colors=?,storages=? WHERE id=?`,
    ...productFields(req.body), req.params.id);
  if (old && (old.price !== Math.round(req.body.price) || old.stock !== Math.round(req.body.stock))) S.audit('product.update', 'product', Number(req.params.id), { price: [old.price, req.body.price], stock: [old.stock, req.body.stock] });
  return S.parseProduct(q.get('SELECT * FROM products WHERE id=?', req.params.id));
}));
r.delete('/products/:id', h((req) => { q.run('UPDATE products SET active=0 WHERE id=?', req.params.id); S.audit('product.delete', 'product', Number(req.params.id)); return { ok: true }; }));
r.post('/upload', upload.array('files', 10), h((req) => ({ urls: (req.files || []).map((f) => `/uploads/${f.filename}`) })));

/* ---------------- Buyurtmalar ---------------- */
r.get('/orders', h((req) => {
  const where = ['1=1'];
  const p = [];
  if (req.query.status) { where.push('o.status=?'); p.push(req.query.status); }
  if (req.query.type) { where.push('o.type=?'); p.push(req.query.type); }
  if (req.query.q) { where.push('(o.full_name LIKE ? OR o.phone LIKE ? OR o.id=?)'); p.push(`%${req.query.q}%`, `%${req.query.q}%`, Number(req.query.q) || 0); }
  return q.all(`SELECT o.*, GROUP_CONCAT(i.name || COALESCE(' '||i.storage,''), ', ') AS products FROM orders o LEFT JOIN order_items i ON i.order_id=o.id
    WHERE ${where.join(' AND ')} GROUP BY o.id ORDER BY o.id DESC LIMIT 300`, ...p).map((o) => ({ ...o, status_label: S.STATUS[o.status] }));
}));
r.get('/orders/:id', h((req) => {
  const o = S.getOrder(req.params.id);
  if (!o) throw U.err('Topilmadi', 404);
  o.history = q.all("SELECT * FROM audit_log WHERE entity='order' AND entity_id=? ORDER BY id DESC", o.id).map((a) => ({ ...a, details: JSON.parse(a.details || '{}') }));
  return o;
}));
r.post('/orders/:id/draft', h((req) => {
  const o = S.getOrder(req.params.id);
  return S.draftSchedule(o, Math.round(Number(req.body.down_payment ?? o.down_payment)), req.body.start || U.today());
}));
r.post('/orders/:id/confirm', h((req) => S.confirmOrder(Number(req.params.id), req.body)));
r.post('/orders/:id/status', h((req) => S.setStatus(Number(req.params.id), req.body.status, req.body.reason)));
r.put('/orders/:id/schedule', h((req) => S.updateSchedule(Number(req.params.id), req.body.rows, req.body.reason)));
r.put('/orders/:id/meta', h((req) => {
  const o = S.getOrder(req.params.id);
  const b = req.body;
  q.run('UPDATE orders SET imei=?, reminders_paused=?, reminder_days=?, updated_at=? WHERE id=?',
    b.imei ?? o.imei, b.reminders_paused ? 1 : 0, b.reminder_days ? JSON.stringify(b.reminder_days) : null, U.nowStr(), o.id);
  S.audit('order.meta', 'order', o.id, { imei: b.imei, reminders_paused: !!b.reminders_paused, reminder_days: b.reminder_days || null });
  return S.getOrder(o.id);
}));
r.post('/orders/:id/payments', h((req) => S.addPayment(Number(req.params.id), req.body)));
r.post('/payments/:id/cancel', h((req) => S.cancelPayment(Number(req.params.id), req.body.reason)));
r.post('/orders/:id/notes', h((req) => {
  q.run('INSERT INTO call_notes(order_id,text,created_at) VALUES(?,?,?)', req.params.id, String(req.body.text || '').trim(), U.nowStr());
  return S.getOrder(req.params.id);
}));

/* ---------------- Shartnomalar va qarzdorlar ---------------- */
r.get('/contracts', h(() => S.contracts().map(({ schedule, ...c }) => c)));
r.get('/debtors', h(() => S.contracts().filter((c) => c.status !== 'closed' && c.summary.overdue_amount > 0).map(({ schedule, ...c }) => ({
  ...c,
  bucket: c.summary.overdue_days <= 7 ? '1-7' : c.summary.overdue_days <= 30 ? '8-30' : '30+',
  last_note: q.get('SELECT * FROM call_notes WHERE order_id=? ORDER BY id DESC LIMIT 1', c.id) || null,
})).sort((a, b) => b.summary.overdue_days - a.summary.overdue_days)));

/* ---------------- Mijozlar ---------------- */
r.get('/customers', h((req) => {
  const s = req.query.q ? `%${req.query.q}%` : '%';
  const list = q.all(`SELECT c.*, (SELECT COUNT(*) FROM orders o WHERE o.customer_id=c.id AND o.status NOT IN ('rejected','cancelled')) orders_count
    FROM customers c WHERE COALESCE(c.full_name,'') LIKE ? OR COALESCE(c.phone,'') LIKE ? OR COALESCE(c.username,'') LIKE ? ORDER BY c.id DESC`, s, s, s);
  const debt = {};
  for (const c of S.contracts()) if (c.status !== 'closed') debt[c.customer_id] = (debt[c.customer_id] || 0) + c.summary.remaining;
  return list.map((c) => ({ ...c, debt: debt[c.id] || 0 }));
}));
function customerInfo(id) {
  const c = q.get('SELECT * FROM customers WHERE id=?', id);
  if (!c) throw U.err('Topilmadi', 404);
  const orders = q.all('SELECT id FROM orders WHERE customer_id=? ORDER BY id DESC', id).map((o) => {
    const x = S.getOrder(o.id);
    return { id: x.id, type: x.type, status: x.status, status_label: x.status_label, total: x.total, created_at: x.created_at, items: x.items, summary: x.summary || null };
  });
  const debt = orders.filter((o) => o.summary && o.status !== 'closed').reduce((a, o) => a + o.summary.remaining, 0);
  return { ...c, orders, debt };
}
r.get('/customers/:id', h((req) => customerInfo(req.params.id)));

/* ---------------- Chatlar ---------------- */
r.get('/chats', h(() => q.all(`SELECT c.id, c.full_name, c.first_name, c.phone, c.username, c.bot_blocked,
    (SELECT COUNT(*) FROM messages m WHERE m.customer_id=c.id AND m.direction='in' AND m.is_read=0) unread,
    (SELECT text FROM messages m WHERE m.customer_id=c.id ORDER BY id DESC LIMIT 1) last_text,
    (SELECT kind FROM messages m WHERE m.customer_id=c.id ORDER BY id DESC LIMIT 1) last_kind,
    (SELECT created_at FROM messages m WHERE m.customer_id=c.id ORDER BY id DESC LIMIT 1) last_at
  FROM customers c WHERE EXISTS(SELECT 1 FROM messages m WHERE m.customer_id=c.id)
  ORDER BY unread > 0 DESC, last_at DESC`)));
r.get('/chats/:id', h((req) => {
  q.run("UPDATE messages SET is_read=1 WHERE customer_id=? AND direction='in'", req.params.id);
  return { customer: customerInfo(req.params.id), messages: q.all('SELECT * FROM messages WHERE customer_id=? ORDER BY id', req.params.id) };
}));
r.post('/chats/:id', h(async (req) => {
  const text = String(req.body.text || '').trim();
  if (!text) throw U.err("Xabar bo'sh");
  const ok = await tg.sendCustomer(Number(req.params.id), U.esc(text));
  q.run("INSERT INTO messages(customer_id,direction,kind,text,is_read,created_at) VALUES(?,'out','text',?,1,?)", req.params.id, text, U.nowStr());
  return { ok, warning: ok ? null : tg.state.bot ? 'Xabar yetkazilmadi (mijoz botni bloklagan)' : "Bot ulanmagan — xabar faqat saqlandi" };
}));
r.get('/tgfile/:fileId', h(async (req, res) => {
  if (!tg.state.bot) throw U.err('Bot ulanmagan', 404);
  const f = await tg.state.bot.api.getFile(req.params.fileId);
  const resp = await fetch(`https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${f.file_path}`);
  res.set('content-type', resp.headers.get('content-type') || 'application/octet-stream');
  res.send(Buffer.from(await resp.arrayBuffer()));
}));

/* ---------------- Tarqatmalar ---------------- */
r.get('/broadcasts', h(() => q.all('SELECT b.*, p.name AS product FROM broadcasts b LEFT JOIN products p ON p.id=b.product_id ORDER BY b.id DESC LIMIT 100')));
r.get('/broadcasts/:id', h((req) => q.get('SELECT * FROM broadcasts WHERE id=?', req.params.id)));
r.post('/broadcasts/preview', h((req) => {
  const p = q.get('SELECT * FROM products WHERE id=?', req.body.product_id);
  if (!p) throw U.err('Mahsulot topilmadi');
  return S.buildPost(p);
}));
r.post('/broadcasts', h((req) => {
  const { product_id, target, text } = req.body;
  if (!['channel', 'subscribers', 'both'].includes(target)) throw U.err("Qayerga yuborishni tanlang");
  const p = q.get('SELECT * FROM products WHERE id=?', product_id);
  if (!p) throw U.err('Mahsulot topilmadi');
  const s = getSettings();
  if (target !== 'channel') {
    const n = q.get("SELECT COUNT(*) n FROM broadcasts WHERE target!='channel' AND substr(created_at,1,10)=?", U.today()).n;
    if (n >= s.broadcast_daily_limit) throw U.err(`Bugungi tarqatma limiti tugadi (${s.broadcast_daily_limit} ta). Mijozlar botni bloklamasligi uchun cheklov qo'yilgan.`);
  }
  const post = S.buildPost(p);
  const id = Number(q.run("INSERT INTO broadcasts(product_id,target,text,image,button_url,status,created_at) VALUES(?,?,?,?,?,'queued',?)",
    p.id, target, String(text || post.text), req.body.image ?? post.image, post.button_url, U.nowStr()).lastInsertRowid);
  S.audit('broadcast.create', 'broadcast', id, { product_id: p.id, target });
  runBroadcast(id);
  return q.get('SELECT * FROM broadcasts WHERE id=?', id);
}));

/* ---------------- Hisobotlar ---------------- */
const period = (req) => {
  const to = req.query.to || U.today();
  const from = req.query.from || `${to.slice(0, 7)}-01`;
  return [from, to];
};
r.get('/reports', h((req) => periodReport(...period(req))));
r.get('/reports/export', h(async (req, res) => {
  const [from, to] = period(req);
  const buf = await exportExcel(from, to);
  res.set('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('content-disposition', `attachment; filename="hisobot_${from}_${to}.xlsx"`);
  res.send(Buffer.from(buf));
}));
r.get('/reports/daily', h((req) => ({ text: dailyReportText(dailyReport(req.query.date)) })));
r.post('/reports/daily/send', h(async () => ({ text: await sendDailyReport() })));
r.post('/reminders/run', h(async () => ({ sent: await runReminders() })));
r.post('/backup', h(() => ({ file: path.basename(backup()) })));

/* ---------------- Sozlamalar ---------------- */
r.get('/settings', h(() => ({ ...getSettings(), admin_login: getSettings({ withSecrets: true }).admin_login, bot: { running: tg.state.running, username: tg.state.info?.username, error: tg.state.error }, public_url: tg.publicUrl() })));
r.put('/settings', h((req) => {
  const changed = {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (req.body[k] === undefined) continue;
    let v = req.body[k];
    if (['usd_rate', 'min_down_pct', 'broadcast_daily_limit'].includes(k)) v = Number(v) || 0;
    if (k === 'reminder_days') v = (Array.isArray(v) ? v : String(v).split(',')).map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x));
    if (JSON.stringify(getSettings()[k]) !== JSON.stringify(v)) changed[k] = v;
    setSetting(k, v);
  }
  if (Object.keys(changed).length) S.audit('settings.update', 'settings', null, { keys: Object.keys(changed), usd_rate: changed.usd_rate });
  return getSettings();
}));
r.post('/settings/password', h((req) => {
  const s = getSettings({ withSecrets: true });
  if (!checkPassword(String(req.body.old || ''), s.admin_pass_hash)) throw U.err("Joriy parol noto'g'ri");
  if (String(req.body.password || '').length < 6) throw U.err("Yangi parol kamida 6 belgi bo'lsin");
  setSetting('admin_pass_hash', hashPassword(req.body.password));
  if (req.body.login) setSetting('admin_login', String(req.body.login).trim());
  S.audit('settings.password', 'settings', null, {});
  return { ok: true };
}));
r.post('/settings/test', h(async (req) => {
  const s = getSettings();
  const target = req.body.target === 'channel' ? s.channel_id : req.body.target === 'admin' ? s.admin_tg_id : s.group_chat_id;
  const m = await tg.sendChat(target, '✅ Test xabar: bot ulangan.');
  if (!m) throw U.err(tg.state.bot ? "Yuborilmadi: ID ni va bot huquqlarini tekshiring" : 'Bot ulanmagan (BOT_TOKEN)');
  return { ok: true };
}));

/* ---------------- Amallar tarixi ---------------- */
r.get('/audit', h(() => q.all('SELECT * FROM audit_log ORDER BY id DESC LIMIT 500').map((a) => ({ ...a, details: JSON.parse(a.details || '{}') }))));

export default r;
