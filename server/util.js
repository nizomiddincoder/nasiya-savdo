export const TZ = 'Asia/Tashkent';

const dtf = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
function parts(d = new Date()) {
  const o = {};
  for (const p of dtf.formatToParts(d)) o[p.type] = p.value;
  return o;
}

// Barcha sanalar Toshkent vaqtida, "YYYY-MM-DD" ko'rinishida
export const today = (d) => { const p = parts(d); return `${p.year}-${p.month}-${p.day}`; };
export const nowStr = (d) => { const p = parts(d); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`; };
export const hhmm = (d) => { const p = parts(d); return `${p.hour}:${p.minute}`; };

export function addDays(date, n) {
  const d = new Date(date.slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function addMonths(date, n) {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}
// a - b kunlarda
export const diffDays = (a, b) =>
  Math.round((Date.parse(a.slice(0, 10) + 'T00:00:00Z') - Date.parse(b.slice(0, 10) + 'T00:00:00Z')) / 86400000);

export const fmt = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const dmy = (s) => (s ? s.slice(0, 10).split('-').reverse().join('.') : '');
export const usd = (som, rate) => (rate > 0 ? Math.round(som / rate) : 0);
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const fillTpl = (tpl, vars) => String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));

export const minDown = (price, pct) => Math.ceil((price * pct) / 100 / 1000) * 1000;

// Ustama boshlang'ich to'lovdan keyingi qoldiqqa qo'yiladi.
// Oylik 1 000 so'mga yaxlitlanadi, farq oxirgi oyga qo'shiladi.
export function calcInstallment(price, months, markup, down) {
  const rest = Math.max(0, price - down);
  const total = Math.round(rest * (1 + markup / 100));
  const monthly = Math.floor(total / months / 1000) * 1000;
  const last = total - monthly * (months - 1);
  return { price, months, markup, down, rest, total, monthly, last, grand: down + total, income: total - rest };
}

export function buildSchedule(total, months, start) {
  const base = Math.floor(total / months / 1000) * 1000;
  return Array.from({ length: months }, (_, i) => ({
    idx: i + 1,
    due_date: addMonths(start, i + 1),
    amount: i === months - 1 ? total - base * (months - 1) : base,
  }));
}

export function err(msg, status = 400) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
