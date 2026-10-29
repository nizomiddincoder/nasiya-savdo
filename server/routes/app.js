import { Router } from 'express';
import crypto from 'node:crypto';
import { q, getSettings } from '../db.js';
import * as U from '../util.js';
import * as tg from '../tg.js';
import { parseProduct, createOrders, getOrder, STATUS } from '../services.js';
import { upsertCustomer } from '../bot.js';

export const h = (fn) => (req, res, next) =>
  Promise.resolve()
    .then(() => fn(req, res))
    .then((r) => { if (r !== undefined && !res.headersSent) res.json(r); })
    .catch(next);

function checkInitData(initData, token) {
  if (!initData || !token) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const calc = crypto.createHmac('sha256', secret).update(check).digest('hex');
  if (calc !== hash) return null;
  if (Date.now() / 1000 - Number(params.get('auth_date')) > 86400 * 7) return null;
  return JSON.parse(params.get('user') || 'null');
}

const r = Router();

r.use((req, res, next) => {
  const user = checkInitData(req.get('x-tg-init-data'), process.env.BOT_TOKEN);
  if (user) {
    req.customer = upsertCustomer(user);
    return next();
  }
  const dev = req.get('x-dev-user');
  if (process.env.DEV_LOGIN !== '0' && dev) {
    req.customer = upsertCustomer({ id: 900000000 + (Number(dev) || 1), first_name: 'Demo', last_name: 'Mijoz' });
    return next();
  }
  res.status(401).json({ error: 'Telegram orqali oching' });
});

r.get('/bootstrap', h((req) => {
  const s = getSettings();
  return {
    me: req.customer,
    settings: {
      shop_name: s.shop_name, usd_rate: s.usd_rate, min_down_pct: s.min_down_pct,
      shop_address: s.shop_address, work_hours: s.work_hours, contact_phones: s.contact_phones,
    },
    categories: q.all('SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.active=1) n FROM categories c ORDER BY sort, id'),
    bot_username: tg.state.info?.username || null,
  };
}));

r.get('/products', h((req) => {
  const s = getSettings();
  const where = ['active=1'];
  const p = [];
  if (req.query.category) { where.push('category_id=?'); p.push(Number(req.query.category)); }
  if (req.query.q) { where.push('(name LIKE ? OR description LIKE ?)'); p.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  if (req.query.ids) {
    const ids = String(req.query.ids).split(',').map(Number).filter(Boolean);
    where.push(`id IN (${ids.join(',') || 0})`);
  }
  return q.all(`SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY stock=0, category_id, id`, ...p).map((x) => parseProduct(x, s));
}));

r.get('/products/:id', h((req) => {
  const p = parseProduct(q.get('SELECT p.*, c.name AS category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=? AND p.active=1', req.params.id));
  if (!p) throw U.err('Mahsulot topilmadi', 404);
  return p;
}));

r.post('/me', h((req) => {
  const { full_name, phone } = req.body;
  q.run('UPDATE customers SET full_name=COALESCE(?, full_name), phone=COALESCE(?, phone) WHERE id=?', full_name || null, phone || null, req.customer.id);
  return q.get('SELECT * FROM customers WHERE id=?', req.customer.id);
}));

r.post('/orders', h((req) => ({ ids: createOrders(req.customer, req.body) })));

r.get('/orders', h((req) => q.all('SELECT id FROM orders WHERE customer_id=? ORDER BY id DESC', req.customer.id).map((o) => {
  const x = getOrder(o.id);
  delete x.customer; delete x.notes; delete x.imei; delete x.group_msg_id;
  return x;
})));

r.get('/orders/:id', h((req) => {
  const o = getOrder(req.params.id);
  if (!o || o.customer_id !== req.customer.id) throw U.err('Topilmadi', 404);
  delete o.notes; delete o.group_msg_id;
  return o;
}));

r.get('/statuses', h(() => STATUS));

export default r;
