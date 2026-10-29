import ExcelJS from 'exceljs';
import { q } from './db.js';
import * as U from './util.js';
import { contracts, STATUS } from './services.js';

const day = (col) => `substr(${col},1,10)`;

export function salesBetween(from, to) {
  const rows = q.all(`SELECT type, COUNT(*) n, SUM(total) s FROM orders
    WHERE confirmed_at IS NOT NULL AND status NOT IN ('cancelled','rejected') AND ${day('confirmed_at')} BETWEEN ? AND ? GROUP BY type`, from, to);
  const g = (t) => rows.find((r) => r.type === t) || { n: 0, s: 0 };
  return { cash: { count: g('cash').n, sum: g('cash').s || 0 }, installment: { count: g('installment').n, sum: g('installment').s || 0 } };
}
export function receiptsBetween(from, to) {
  const rows = q.all(`SELECT method, kind, SUM(amount) s FROM payments WHERE cancelled=0 AND ${day('created_at')} BETWEEN ? AND ? GROUP BY method, kind`, from, to);
  const sum = (f) => rows.filter(f).reduce((a, r) => a + r.s, 0);
  return { cash: sum((r) => r.method === 'cash'), card: sum((r) => r.method === 'card'), installment: sum((r) => r.kind === 'installment'), total: sum(() => true) };
}

export function portfolio(list = contracts()) {
  const active = list.filter((c) => c.status !== 'closed');
  const overdue = active.filter((c) => c.summary.overdue_amount > 0);
  return {
    active: active.length,
    debt: active.reduce((a, c) => a + c.summary.remaining, 0),
    overdue_count: overdue.length,
    overdue_sum: overdue.reduce((a, c) => a + c.summary.overdue_amount, 0),
  };
}

export function dueOn(date, list = contracts()) {
  const out = [];
  for (const c of list) {
    if (c.status === 'closed') continue;
    for (const r of c.schedule) if (r.due_date === date && r.remaining > 0) out.push({ order_id: c.id, name: c.c_name, phone: c.c_phone, product: c.product, amount: r.remaining });
  }
  return out;
}

export function dailyReport(date = U.addDays(U.today(), -1)) {
  const list = contracts();
  const expected = q.get(`SELECT COALESCE(SUM(s.amount),0) v FROM schedule s JOIN orders o ON o.id=s.order_id
    WHERE s.due_date=? AND o.status IN ('confirmed','shipping','delivered','closed')`, date).v;
  return {
    date,
    sales: salesBetween(date, date),
    receipts: receiptsBetween(date, date),
    expected,
    received_installment: receiptsBetween(date, date).installment,
    new_orders: q.get(`SELECT COUNT(*) n FROM orders WHERE ${day('created_at')}=?`, date).n,
    confirmed_orders: q.get(`SELECT COUNT(*) n FROM orders WHERE ${day('confirmed_at')}=?`, date).n,
    portfolio: portfolio(list),
    due_today: dueOn(U.today(), list),
  };
}

export function dailyReportText(r) {
  const f = U.fmt;
  const lines = [
    `📊 <b>Kunlik hisobot — ${U.dmy(r.date)}</b>`,
    '',
    '<b>Savdo:</b>',
    `• Naqd: ${r.sales.cash.count} ta — ${f(r.sales.cash.sum)} so'm`,
    `• Nasiya: ${r.sales.installment.count} ta — ${f(r.sales.installment.sum)} so'm`,
    '',
    '<b>Tushum:</b>',
    `• Naqd: ${f(r.receipts.cash)} so'm`,
    `• Karta: ${f(r.receipts.card)} so'm`,
    `• Jami: ${f(r.receipts.total)} so'm`,
    '',
    `<b>Nasiya to'lovlari:</b> kutilgan ${f(r.expected)} / tushgan ${f(r.received_installment)} so'm`,
    `<b>Buyurtmalar:</b> yangi ${r.new_orders}, tasdiqlangan ${r.confirmed_orders}`,
    `<b>Kechikkanlar:</b> ${r.portfolio.overdue_count} ta — ${f(r.portfolio.overdue_sum)} so'm`,
    `<b>Jami qoldiq qarz (portfel):</b> ${f(r.portfolio.debt)} so'm`,
    '',
    `<b>Bugun to'lashi kerak (${r.due_today.length}):</b>`,
    ...(r.due_today.length ? r.due_today.map((d) => `• ${U.esc(d.name)} — ${f(d.amount)} so'm (#${d.order_id})`) : ['— yo\'q']),
  ];
  return lines.join('\n');
}

export function periodReport(from, to) {
  const list = contracts();
  const inPeriod = list.filter((c) => c.confirmed_at && c.confirmed_at.slice(0, 10) >= from && c.confirmed_at.slice(0, 10) <= to);
  const income = inPeriod.reduce((a, c) => a + (c.installment_total - (c.total - c.down_payment)), 0);
  // Kutilgan tushum: kelgusi oylar bo'yicha to'lanmagan summa
  const expected = {};
  for (const c of list) {
    if (c.status === 'closed') continue;
    for (const r of c.schedule) if (r.remaining > 0) {
      const m = r.due_date < U.today() ? 'Kechikkan' : r.due_date.slice(0, 7);
      expected[m] = (expected[m] || 0) + r.remaining;
    }
  }
  const daily = q.all(`SELECT ${day('created_at')} d, SUM(amount) s FROM payments WHERE cancelled=0 AND ${day('created_at')} BETWEEN ? AND ? GROUP BY d ORDER BY d`, from, to);
  return {
    from, to,
    sales: salesBetween(from, to),
    receipts: receiptsBetween(from, to),
    markup_income: income,
    portfolio: portfolio(list),
    expected: Object.entries(expected).sort(([a], [b]) => (a === 'Kechikkan' ? -1 : b === 'Kechikkan' ? 1 : a.localeCompare(b))).map(([month, sum]) => ({ month, sum })),
    daily,
  };
}

export async function exportExcel(from, to) {
  const r = periodReport(from, to);
  const wb = new ExcelJS.Workbook();
  const head = (ws) => { ws.getRow(1).font = { bold: true }; ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9F2F7' } }; };

  const s = wb.addWorksheet('Umumiy');
  s.columns = [{ header: "Ko'rsatkich", key: 'k', width: 40 }, { header: "Qiymat (so'm)", key: 'v', width: 22 }];
  [
    ['Davr', `${U.dmy(from)} — ${U.dmy(to)}`],
    ['Naqd savdo (soni)', r.sales.cash.count], ['Naqd savdo (summa)', r.sales.cash.sum],
    ['Nasiya savdo (soni)', r.sales.installment.count], ['Nasiya savdo (summa)', r.sales.installment.sum],
    ['Tushum: naqd', r.receipts.cash], ['Tushum: karta', r.receipts.card], ['Tushum: jami', r.receipts.total],
    ['Ustamadan daromad', r.markup_income], ['Jami qoldiq qarz (portfel)', r.portfolio.debt],
    ['Kechikkan shartnomalar', r.portfolio.overdue_count], ['Kechikkan summa', r.portfolio.overdue_sum],
  ].forEach(([k, v]) => s.addRow({ k, v }));
  head(s);

  const o = wb.addWorksheet('Buyurtmalar');
  o.columns = [
    { header: '#', key: 'id', width: 7 }, { header: 'Sana', key: 'd', width: 18 }, { header: 'Mijoz', key: 'n', width: 24 }, { header: 'Telefon', key: 'p', width: 18 },
    { header: 'Turi', key: 't', width: 10 }, { header: 'Holat', key: 's', width: 14 }, { header: 'Mahsulot', key: 'pr', width: 32 }, { header: 'Narx', key: 'tot', width: 14 },
    { header: "Boshlang'ich", key: 'dn', width: 14 }, { header: 'Muddat', key: 'm', width: 8 }, { header: 'Nasiya jami', key: 'it', width: 14 },
  ];
  for (const x of q.all(`SELECT o.*, GROUP_CONCAT(i.name, ', ') pr FROM orders o LEFT JOIN order_items i ON i.order_id=o.id
      WHERE ${day('o.created_at')} BETWEEN ? AND ? GROUP BY o.id ORDER BY o.id`, from, to)) {
    o.addRow({ id: x.id, d: x.created_at, n: x.full_name, p: x.phone, t: x.type === 'cash' ? 'Naqd' : 'Nasiya', s: STATUS[x.status], pr: x.pr,
      tot: x.total, dn: x.down_payment, m: x.months, it: x.installment_total });
  }
  head(o);

  const p = wb.addWorksheet("To'lovlar");
  p.columns = [{ header: '#', key: 'id', width: 7 }, { header: 'Sana', key: 'd', width: 18 }, { header: 'Buyurtma', key: 'o', width: 10 }, { header: 'Mijoz', key: 'n', width: 24 },
    { header: 'Summa', key: 'a', width: 14 }, { header: 'Usul', key: 'm', width: 10 }, { header: 'Turi', key: 'k', width: 14 }, { header: 'Bekor', key: 'c', width: 8 }];
  const kinds = { down: "Boshlang'ich", installment: 'Nasiya', sale: 'Naqd savdo' };
  for (const x of q.all(`SELECT p.*, o.full_name FROM payments p JOIN orders o ON o.id=p.order_id WHERE ${day('p.created_at')} BETWEEN ? AND ? ORDER BY p.id`, from, to)) {
    p.addRow({ id: x.id, d: x.created_at, o: x.order_id, n: x.full_name, a: x.amount, m: x.method === 'card' ? 'Karta' : 'Naqd', k: kinds[x.kind], c: x.cancelled ? 'Ha' : '' });
  }
  head(p);

  const e = wb.addWorksheet('Kutilgan tushum');
  e.columns = [{ header: 'Oy', key: 'm', width: 14 }, { header: "Summa (so'm)", key: 's', width: 18 }];
  r.expected.forEach((x) => e.addRow({ m: x.month, s: x.sum }));
  head(e);

  for (const ws of wb.worksheets) ws.eachRow((row, i) => { if (i > 1) row.eachCell((c) => { if (typeof c.value === 'number' && c.value > 999) c.numFmt = '#,##0'; }); });
  return wb.xlsx.writeBuffer();
}
