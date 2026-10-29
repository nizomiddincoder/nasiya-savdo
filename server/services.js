import { q, tx, getSettings } from './db.js';
import * as U from './util.js';
import * as tg from './tg.js';

export const STATUS = {
  new: 'Yangi', confirmed: 'Tasdiqlandi', shipping: "Yo'lda", delivered: 'Topshirildi',
  closed: 'Yopildi', rejected: 'Rad etildi', cancelled: 'Bekor qilindi',
};
export const ACTIVE = ['confirmed', 'shipping', 'delivered'];

export function audit(action, entity, entityId, details = {}) {
  q.run('INSERT INTO audit_log(actor,action,entity,entity_id,details,created_at) VALUES(?,?,?,?,?,?)',
    'admin', action, entity, entityId ?? null, JSON.stringify(details), U.nowStr());
}

const J = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };

/* ---------------- Mahsulot ---------------- */
export function parseProduct(p, s = getSettings()) {
  if (!p) return null;
  const r = {
    ...p,
    terms: J(p.terms, []), images: J(p.images, []), colors: J(p.colors, []), storages: J(p.storages, []),
    installment_enabled: !!p.installment_enabled, active: !!p.active,
  };
  r.usd = U.usd(p.price, s.usd_rate);
  r.from_monthly = null;
  if (r.installment_enabled && r.terms.length) {
    const down = U.minDown(p.price, r.min_down_pct);
    let best = null;
    for (const t of r.terms) {
      const c = U.calcInstallment(p.price, t.months, t.markup, down);
      if (!best || c.monthly < best.monthly) best = c;
    }
    r.from_monthly = best.monthly;
    r.from_months = best.months;
  }
  return r;
}

export function unitPrice(p, storage) {
  const st = p.storages.find((s) => s.label === storage);
  return p.price + (st ? Number(st.extra) || 0 : 0);
}

/* ---------------- Buyurtma yaratish ---------------- */
export function createOrders(customer, body, { silent = false, at } = {}) {
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw U.err("Savat bo'sh");
  const full_name = String(body.full_name || '').trim();
  const phone = String(body.phone || customer.phone || '').trim();
  if (!full_name) throw U.err('Ism-familiyani kiriting');
  if (!phone) throw U.err('Telefon raqam kerak');
  const delivery = body.delivery_method === 'delivery' ? 'delivery' : 'pickup';
  if (delivery === 'delivery' && !String(body.address || '').trim() && !body.lat) throw U.err('Yetkazib berish manzilini kiriting');
  const now = at || U.nowStr();
  const s = getSettings();

  const cash = [];
  const inst = [];
  for (const it of items) {
    const p = parseProduct(q.get('SELECT * FROM products WHERE id=? AND active=1', it.product_id), s);
    if (!p) throw U.err('Mahsulot topilmadi');
    const qty = Math.max(1, Math.floor(it.qty || 1));
    if (p.stock < qty) throw U.err(`${p.name}: omborda yetarli emas`);
    const price = unitPrice(p, it.storage);
    const line = { p, qty, price, color: it.color || null, storage: it.storage || null };
    if (it.mode === 'installment') {
      if (!p.installment_enabled) throw U.err(`${p.name} nasiyaga sotilmaydi`);
      const term = p.terms.find((t) => t.months === Number(it.months));
      if (!term) throw U.err(`${p.name}: muddat noto'g'ri`);
      const min = U.minDown(price, p.min_down_pct);
      const down = Math.round(Number(it.down) || 0);
      if (down < min) throw U.err(`${p.name}: boshlang'ich to'lov kamida ${U.fmt(min)} so'm`);
      if (down >= price) throw U.err(`${p.name}: boshlang'ich to'lov narxdan kam bo'lishi kerak`);
      for (let i = 0; i < qty; i++) inst.push({ ...line, qty: 1, term, down });
    } else cash.push(line);
  }

  const ids = tx(() => {
    q.run('UPDATE customers SET full_name=?, phone=? WHERE id=?', full_name, phone, customer.id);
    const base = [customer.id, delivery, body.address || null, body.lat || null, body.lng || null, body.comment || null, full_name, phone, now, now];
    const insOrder = (type, total, extra = {}) => Number(q.run(
      `INSERT INTO orders(customer_id,type,status,total,months,markup_pct,down_payment,monthly,installment_total,
        delivery_method,address,lat,lng,comment,full_name,phone,created_at,updated_at)
       VALUES(?,?, 'new',?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?)`,
      base[0], type, total, extra.months ?? null, extra.markup ?? null, extra.down ?? 0, extra.monthly ?? null, extra.total ?? 0,
      ...base.slice(1)).lastInsertRowid);
    const insItem = (oid, l) => q.run('INSERT INTO order_items(order_id,product_id,name,color,storage,qty,price,image) VALUES(?,?,?,?,?,?,?,?)',
      oid, l.p.id, l.p.name, l.color, l.storage, l.qty, l.price, l.p.images[0] || null);
    const out = [];
    if (cash.length) {
      const oid = insOrder('cash', cash.reduce((a, l) => a + l.price * l.qty, 0));
      cash.forEach((l) => insItem(oid, l));
      out.push(oid);
    }
    for (const l of inst) {
      const c = U.calcInstallment(l.price, l.term.months, l.term.markup, l.down);
      const oid = insOrder('installment', l.price, { months: c.months, markup: c.markup, down: c.down, monthly: c.monthly, total: c.total });
      insItem(oid, l);
      out.push(oid);
    }
    return out;
  });

  if (!silent) {
    for (const id of ids) {
      postGroupCard(id);
      const o = getOrder(id);
      tg.sendCustomer(customer.id,
        `✅ Buyurtmangiz qabul qilindi: <b>#${id}</b>\n${orderShort(o)}\n\nMenejer tez orada bog'lanib, shartlarni tasdiqlaydi.`);
    }
  }
  return ids;
}

/* ---------------- Grafik va to'lovlarni hisoblash ---------------- */
export function contractState(o, scheduleRows, payments) {
  const paid = payments.filter((p) => !p.cancelled && p.kind === 'installment').reduce((a, p) => a + p.amount, 0);
  let left = paid;
  const t = U.today();
  const schedule = scheduleRows.map((r) => {
    const pay = Math.min(left, r.amount);
    left -= pay;
    const remaining = r.amount - pay;
    return { ...r, paid: pay, remaining, status: remaining === 0 ? 'paid' : pay > 0 ? 'partial' : r.due_date < t ? 'overdue' : 'pending' };
  });
  const total = scheduleRows.reduce((a, r) => a + r.amount, 0);
  const unpaid = schedule.filter((r) => r.remaining > 0);
  const overdue = unpaid.filter((r) => r.due_date < t);
  return {
    schedule,
    summary: {
      schedule_total: total,
      paid,
      remaining: total - paid,
      next: unpaid[0] ? { date: unpaid[0].due_date, amount: unpaid[0].remaining } : null,
      overdue_amount: overdue.reduce((a, r) => a + r.remaining, 0),
      overdue_days: overdue[0] ? U.diffDays(t, overdue[0].due_date) : 0,
      due_today: unpaid.filter((r) => r.due_date === t).reduce((a, r) => a + r.remaining, 0),
    },
  };
}

export function getOrder(id) {
  const o = q.get('SELECT * FROM orders WHERE id=?', id);
  if (!o) return null;
  o.items = q.all('SELECT * FROM order_items WHERE order_id=?', id);
  o.customer = q.get('SELECT * FROM customers WHERE id=?', o.customer_id);
  o.payments = q.all('SELECT * FROM payments WHERE order_id=? ORDER BY id', id);
  o.reminder_days = J(o.reminder_days, null);
  o.status_label = STATUS[o.status];
  if (o.type === 'installment') {
    const rows = q.all('SELECT * FROM schedule WHERE order_id=? ORDER BY idx', id);
    if (rows.length) Object.assign(o, contractState(o, rows, o.payments));
    else o.draft = draftSchedule(o);
  }
  o.notes = q.all('SELECT * FROM call_notes WHERE order_id=? ORDER BY id DESC', id);
  return o;
}

export function draftSchedule(o, down = o.down_payment, start = U.today()) {
  const c = U.calcInstallment(o.total, o.months, o.markup_pct, down);
  return { calc: c, rows: U.buildSchedule(c.total, o.months, start) };
}

function validRows(rows) {
  if (!Array.isArray(rows) || !rows.length) throw U.err("Grafik bo'sh");
  return rows.map((r, i) => {
    const amount = Math.round(Number(r.amount));
    if (!(amount > 0)) throw U.err(`${i + 1}-oy summasi noto'g'ri`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.due_date || '')) throw U.err(`${i + 1}-oy sanasi noto'g'ri`);
    return { idx: i + 1, due_date: r.due_date, amount };
  });
}

/* ---------------- Tasdiqlash ---------------- */
export function confirmOrder(id, data = {}, { silent = false, at } = {}) {
  const o = getOrder(id);
  if (!o) throw U.err('Buyurtma topilmadi', 404);
  if (o.status !== 'new') throw U.err('Faqat yangi buyurtma tasdiqlanadi');
  const now = at || U.nowStr();
  const method = data.method === 'card' ? 'card' : 'cash';

  tx(() => {
    if (o.type === 'installment') {
      const down = data.down_payment != null ? Math.round(Number(data.down_payment)) : o.down_payment;
      if (down < 0 || down >= o.total) throw U.err("Boshlang'ich to'lov noto'g'ri");
      const rows = data.schedule ? validRows(data.schedule) : draftSchedule(o, down, now.slice(0, 10)).rows;
      const total = rows.reduce((a, r) => a + r.amount, 0);
      for (const r of rows) q.run('INSERT INTO schedule(order_id,idx,due_date,amount) VALUES(?,?,?,?)', id, r.idx, r.due_date, r.amount);
      q.run('UPDATE orders SET down_payment=?, installment_total=?, monthly=?, imei=? WHERE id=?',
        down, total, rows[0].amount, data.imei ?? o.imei ?? null, id);
      if (down > 0) q.run("INSERT INTO payments(order_id,amount,method,kind,note,created_at) VALUES(?,?,?,'down',?,?)", id, down, method, "Boshlang'ich to'lov", now);
    } else {
      q.run("INSERT INTO payments(order_id,amount,method,kind,note,created_at) VALUES(?,?,?,'sale',?,?)", id, o.total, method, "Naqd savdo", now);
      if (data.imei) q.run('UPDATE orders SET imei=? WHERE id=?', data.imei, id);
    }
    for (const it of o.items) q.run('UPDATE products SET stock=MAX(0, stock-?) WHERE id=?', it.qty, it.product_id);
    q.run("UPDATE orders SET status='confirmed', confirmed_at=?, updated_at=? WHERE id=?", now, now, id);
    audit('order.confirm', 'order', id, { down_payment: data.down_payment, method, imei: data.imei });
  });

  if (!silent) {
    const n = getOrder(id);
    let text = `🎉 Buyurtma <b>#${id}</b> tasdiqlandi!\n${orderShort(n)}`;
    if (n.type === 'installment') text += `\n\n<b>To'lov grafigi:</b>\n${scheduleText(n)}`;
    tg.sendCustomer(n.customer_id, text);
    updateGroupCard(id);
  }
  return getOrder(id);
}

/* ---------------- Holat ---------------- */
const NEXT = {
  new: ['rejected', 'cancelled'],
  confirmed: ['shipping', 'delivered', 'cancelled'],
  shipping: ['delivered', 'cancelled'],
  delivered: ['closed'],
};
export function setStatus(id, status, reason = '') {
  const o = getOrder(id);
  if (!o) throw U.err('Buyurtma topilmadi', 404);
  if (!(NEXT[o.status] || []).includes(status)) throw U.err(`"${STATUS[o.status]}" holatidan "${STATUS[status]}" ga o'tib bo'lmaydi`);
  if (status === 'shipping' && o.delivery_method !== 'delivery') throw U.err("Yo'lda holati faqat yetkazib berish uchun");
  if (status === 'closed' && o.type === 'installment' && o.summary?.remaining > 0) throw U.err("Qarz to'liq to'lanmagan");
  const now = U.nowStr();
  let final = status;
  tx(() => {
    if (status === 'cancelled' && o.status !== 'new') {
      for (const it of o.items) q.run('UPDATE products SET stock=stock+? WHERE id=?', it.qty, it.product_id);
      q.run("UPDATE payments SET cancelled=1, cancelled_at=?, cancel_reason='Buyurtma bekor qilindi' WHERE order_id=? AND cancelled=0", now, id);
    }
    if (status === 'delivered' && (o.type === 'cash' || o.summary?.remaining === 0)) final = 'closed';
    q.run('UPDATE orders SET status=?, reject_reason=COALESCE(?, reject_reason), updated_at=?, closed_at=? WHERE id=?',
      final, reason || null, now, final === 'closed' ? now : null, id);
    audit('order.status', 'order', id, { from: o.status, to: final, reason });
  });
  const msg = {
    rejected: `❌ Buyurtma #${id} rad etildi.${reason ? '\nSabab: ' + U.esc(reason) : ''}`,
    cancelled: `Buyurtma #${id} bekor qilindi.${reason ? '\nSabab: ' + U.esc(reason) : ''}`,
    shipping: `🚚 Buyurtma #${id} yo'lda! Tez orada yetkazib beriladi.`,
    delivered: `📦 Buyurtma #${id} topshirildi. Xaridingiz uchun rahmat!`,
    closed: o.type === 'cash' ? `📦 Buyurtma #${id} topshirildi. Xaridingiz uchun rahmat!` : `✅ Shartnoma #${id} to'liq yopildi. Rahmat!`,
  }[final];
  if (msg) tg.sendCustomer(o.customer_id, msg);
  updateGroupCard(id);
  return getOrder(id);
}

function maybeClose(id) {
  const o = getOrder(id);
  if (o.status === 'delivered' && o.summary.remaining === 0) {
    const now = U.nowStr();
    q.run("UPDATE orders SET status='closed', closed_at=?, updated_at=? WHERE id=?", now, now, id);
    tg.sendCustomer(o.customer_id, `✅ Shartnoma #${id} to'liq yopildi. Rahmat!`);
    updateGroupCard(id);
  }
}

/* ---------------- Grafikni o'zgartirish ---------------- */
export function updateSchedule(id, rows, reason = '') {
  const o = getOrder(id);
  if (!o || o.type !== 'installment' || !o.schedule) throw U.err('Shartnoma topilmadi', 404);
  if (!ACTIVE.includes(o.status)) throw U.err("Bu holatda grafikni o'zgartirib bo'lmaydi");
  const clean = validRows(rows);
  const total = clean.reduce((a, r) => a + r.amount, 0);
  if (total < o.summary.paid) throw U.err(`Grafik summasi to'langan summadan (${U.fmt(o.summary.paid)}) kam bo'lmasin`);
  tx(() => {
    q.run('DELETE FROM schedule WHERE order_id=?', id);
    for (const r of clean) q.run('INSERT INTO schedule(order_id,idx,due_date,amount) VALUES(?,?,?,?)', id, r.idx, r.due_date, r.amount);
    q.run('UPDATE orders SET installment_total=?, updated_at=? WHERE id=?', total, U.nowStr(), id);
    audit('schedule.update', 'order', id, {
      reason,
      old: o.schedule.map((r) => ({ due_date: r.due_date, amount: r.amount })),
      new: clean.map((r) => ({ due_date: r.due_date, amount: r.amount })),
    });
  });
  const n = getOrder(id);
  tg.sendCustomer(n.customer_id, `ℹ️ Shartnoma #${id} grafigi yangilandi:\n${scheduleText(n)}`);
  maybeClose(id);
  return getOrder(id);
}

/* ---------------- To'lovlar ---------------- */
export function addPayment(id, { amount, method, note }, { silent = false, at } = {}) {
  const o = getOrder(id);
  if (!o || o.type !== 'installment' || !o.schedule) throw U.err('Shartnoma topilmadi', 404);
  if (!ACTIVE.includes(o.status)) throw U.err("Bu shartnomaga to'lov qabul qilinmaydi");
  const sum = Math.round(Number(amount));
  if (!(sum > 0)) throw U.err("Summa noto'g'ri");
  if (sum > o.summary.remaining) throw U.err(`Summa qoldiqdan (${U.fmt(o.summary.remaining)}) katta`);
  const now = at || U.nowStr();
  const pid = Number(q.run("INSERT INTO payments(order_id,amount,method,kind,note,created_at) VALUES(?,?,?,'installment',?,?)",
    id, sum, method === 'card' ? 'card' : 'cash', note || null, now).lastInsertRowid);
  audit('payment.add', 'order', id, { payment_id: pid, amount: sum, method });
  const n = getOrder(id);
  if (!silent) {
    const next = n.summary.next;
    tg.sendCustomer(n.customer_id,
      `💰 ${U.fmt(sum)} so'm qabul qilindi. Qoldiq: ${U.fmt(n.summary.remaining)} so'm.` +
      (next ? `\nKeyingi to'lov: ${U.dmy(next.date)}, ${U.fmt(next.amount)} so'm.` : '\nShartnoma to\'liq to\'landi! 🎉'));
    maybeClose(id);
  }
  return getOrder(id);
}

export function cancelPayment(pid, reason = '') {
  const p = q.get('SELECT * FROM payments WHERE id=?', pid);
  if (!p) throw U.err("To'lov topilmadi", 404);
  if (p.cancelled) throw U.err("To'lov allaqachon bekor qilingan");
  const now = U.nowStr();
  q.run('UPDATE payments SET cancelled=1, cancelled_at=?, cancel_reason=? WHERE id=?', now, reason || null, pid);
  audit('payment.cancel', 'order', p.order_id, { payment_id: pid, amount: p.amount, reason });
  const o = getOrder(p.order_id);
  if (o.status === 'closed' && o.type === 'installment' && o.summary.remaining > 0) {
    q.run("UPDATE orders SET status='delivered', closed_at=NULL, updated_at=? WHERE id=?", now, o.id);
  }
  return getOrder(p.order_id);
}

/* ---------------- Ro'yxatlar ---------------- */
export function contracts() {
  const list = q.all(`SELECT o.*, c.full_name AS c_name, c.phone AS c_phone, c.bot_blocked, i.name AS product
    FROM orders o JOIN customers c ON c.id=o.customer_id LEFT JOIN order_items i ON i.order_id=o.id
    WHERE o.type='installment' AND o.status IN ('confirmed','shipping','delivered','closed') GROUP BY o.id ORDER BY o.id DESC`);
  if (!list.length) return [];
  const ids = list.map((o) => o.id).join(',');
  const sch = q.all(`SELECT * FROM schedule WHERE order_id IN (${ids}) ORDER BY idx`);
  const pay = q.all(`SELECT * FROM payments WHERE order_id IN (${ids})`);
  return list.map((o) => {
    const st = contractState(o, sch.filter((r) => r.order_id === o.id), pay.filter((p) => p.order_id === o.id));
    return { ...o, status_label: STATUS[o.status], schedule: st.schedule, summary: st.summary };
  });
}

/* ---------------- Telegram matnlari ---------------- */
export function orderShort(o) {
  const it = o.items.map((i) => `• ${U.esc(i.name)}${i.storage ? ' ' + i.storage : ''}${i.color ? ', ' + U.esc(i.color) : ''}${i.qty > 1 ? ' ×' + i.qty : ''}`).join('\n');
  if (o.type === 'installment') {
    return `${it}\nNasiya: ${o.months} oy, boshlang'ich ${U.fmt(o.down_payment)} so'm, oylik ${U.fmt(o.monthly)} so'm`;
  }
  return `${it}\nNaqd: ${U.fmt(o.total)} so'm`;
}
export function scheduleText(o) {
  return (o.schedule || []).map((r) => `${r.idx}. ${U.dmy(r.due_date)} — ${U.fmt(r.amount)} so'm${r.status === 'paid' ? ' ✅' : ''}`).join('\n');
}

function groupCardText(o) {
  const lines = [
    `🛒 <b>Buyurtma #${o.id}</b> — ${o.type === 'installment' ? '💳 NASIYA' : '💵 NAQD'}`,
    `Holat: <b>${STATUS[o.status]}</b>`,
    '',
    ...o.items.map((i) => `• ${U.esc(i.name)}${i.storage ? ' ' + i.storage : ''}${i.color ? ', ' + U.esc(i.color) : ''} — ${U.fmt(i.price)} so'm${i.qty > 1 ? ' ×' + i.qty : ''}`),
  ];
  if (o.type === 'installment') {
    lines.push(`Muddat: ${o.months} oy (+${o.markup_pct}%)`, `Boshlang'ich: ${U.fmt(o.down_payment)} so'm`, `Oylik: ${U.fmt(o.monthly)} so'm`);
  } else lines.push(`Jami: <b>${U.fmt(o.total)} so'm</b>`);
  lines.push('', `👤 ${U.esc(o.full_name)}`, `📞 ${U.esc(o.phone)}`,
    o.delivery_method === 'delivery' ? `🚚 Yetkazish: ${U.esc(o.address || '')}${o.lat ? ` (lokatsiya: ${o.lat.toFixed(5)}, ${o.lng.toFixed(5)})` : ''}` : "🏬 Do'kondan olib ketish");
  if (o.comment) lines.push(`💬 ${U.esc(o.comment)}`);
  return lines.join('\n');
}
function groupCardKeyboard(o) {
  const rows = [];
  if (o.status === 'new') rows.push([{ text: '✅ Qabul qilish', callback_data: `ord:acc:${o.id}` }, { text: '❌ Rad etish', callback_data: `ord:rej:${o.id}` }]);
  const admin = process.env.ADMIN_URL || `${tg.publicUrl()}/admin`;
  if (admin.startsWith('https://')) rows.push([{ text: '🖥 Panelda ochish', url: `${admin}/orders/${o.id}` }]);
  return { inline_keyboard: rows };
}
export async function postGroupCard(id) {
  const o = getOrder(id);
  const m = await tg.sendGroup(groupCardText(o), { reply_markup: groupCardKeyboard(o) });
  if (m) q.run('UPDATE orders SET group_msg_id=? WHERE id=?', m.message_id, id);
}
export function updateGroupCard(id) {
  const o = getOrder(id);
  if (!o?.group_msg_id) return;
  tg.editChat(getSettings().group_chat_id, o.group_msg_id, groupCardText(o), { reply_markup: groupCardKeyboard(o) });
}

/* ---------------- Kanal posti ---------------- */
export function buildPost(product) {
  const s = getSettings();
  const p = parseProduct(product, s);
  const specs = String(p.specs || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => (l.startsWith('•') ? l : `• ${l}`)).join('\n');
  const nasiya = p.from_monthly ? U.fillTpl(s.post_installment_line, { oylik: U.fmt(p.from_monthly), muddat: p.from_months }) : '';
  const phones = String(s.contact_phones || '').split('\n').map((x) => x.trim()).filter(Boolean).map((x) => `📞Tel: ${x}`);
  const kontakt = [...phones, s.contact_admin ? `\n👨‍💼Admin ${s.contact_admin}` : ''].join('\n').trim();
  const text = U.fillTpl(s.post_template, {
    nomi: p.name, xususiyatlar: specs, narx: U.fmt(p.price), narx_usd: U.fmt(p.usd),
    nasiya, kontaktlar: kontakt, kanal: s.channel_link || '', tavsif: p.description || '',
  }).replace(/\n{3,}/g, '\n\n').trim();
  return { text, image: p.images[0] || null, button_url: tg.productLink(p.id) };
}
