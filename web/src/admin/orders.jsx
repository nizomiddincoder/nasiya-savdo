import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { adminApi } from '../api.js';
import { Icon, fmt, dmy, dmyt, useAsync, toast, STATUS } from '../lib.jsx';
import { Loading, Pill } from './pages1.jsx';

/* ---------------- Buyurtmalar ro'yxati ---------------- */
export function Orders() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const status = sp.get('status') || '';
  const type = sp.get('type') || '';
  const [qText, setQ] = useState('');
  const { data } = useAsync(() => adminApi.get(`/orders?status=${status}&type=${type}&q=${encodeURIComponent(qText)}`), [status, type, qText]);
  const setParam = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n); };
  return (
    <>
      <div className="a-head"><h1>Buyurtmalar</h1><input className="inp" placeholder="Qidirish: ism, telefon, #" value={qText} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="a-tabs">
        <button className={!status ? 'on' : ''} onClick={() => setParam('status', '')}>Barchasi</button>
        {Object.entries(STATUS).map(([k, v]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setParam('status', k)}>{v}</button>)}
        <span style={{ width: 16 }} />
        <button className={type === 'cash' ? 'on' : ''} onClick={() => setParam('type', type === 'cash' ? '' : 'cash')}>Naqd</button>
        <button className={type === 'installment' ? 'on' : ''} onClick={() => setParam('type', type === 'installment' ? '' : 'installment')}>Nasiya</button>
      </div>
      <div className="a-card a-scroll">
        {!data ? <Loading /> : !data.length ? <div className="empty">Buyurtma yo'q</div> : (
          <table className="a-table">
            <thead><tr><th>#</th><th>Sana</th><th>Mijoz</th><th>Mahsulot</th><th>Turi</th><th className="num">Summa</th><th>Olish</th><th>Holat</th></tr></thead>
            <tbody>{data.map((o) => (
              <tr key={o.id} className="click" onClick={() => nav(`/admin/orders/${o.id}`)}>
                <td><b>#{o.id}</b></td>
                <td className="muted">{dmyt(o.created_at)}</td>
                <td><b>{o.full_name}</b><div className="muted" style={{ fontSize: 12 }}>{o.phone}</div></td>
                <td style={{ maxWidth: 260 }}>{o.products}</td>
                <td>{o.type === 'cash' ? 'Naqd' : `Nasiya ${o.months} oy`}</td>
                <td className="num"><b>{fmt(o.total)}</b>{o.type === 'installment' && <div className="muted" style={{ fontSize: 12 }}>oyiga {fmt(o.monthly)}</div>}</td>
                <td>{o.delivery_method === 'delivery' ? '🚚' : '🏬'}</td>
                <td><Pill s={o.status}>{STATUS[o.status]}</Pill></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}

/* ---------------- Grafik tahrirlovchi ---------------- */
function ScheduleEditor({ rows, onChange, paidMap }) {
  const upd = (i, k, v) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: k === 'amount' ? v : v } : r)));
  const total = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  return (
    <>
      <table className="a-table sched-edit">
        <thead><tr><th>Oy</th><th>Sana</th><th className="num">Summa</th>{paidMap && <th>Holat</th>}<th /></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td><input className="inp" type="date" value={r.due_date} onChange={(e) => upd(i, 'due_date', e.target.value)} /></td>
              <td><input className="inp" type="number" step="1000" style={{ width: 150, textAlign: 'right' }} value={r.amount} onChange={(e) => upd(i, 'amount', e.target.value)} /></td>
              {paidMap && <td>{paidMap[i] ? <Pill s={paidMap[i].status === 'paid' ? 'ok' : paidMap[i].status === 'overdue' ? 'bad' : paidMap[i].status === 'partial' ? 'warn' : ''}>
                {{ paid: "To'langan", partial: `Qisman ${fmt(paidMap[i].paid)}`, overdue: 'Kechikkan', pending: 'Kutilmoqda' }[paidMap[i].status]}</Pill> : null}</td>}
              <td><button type="button" className="btn sm bad" onClick={() => onChange(rows.filter((_, j) => j !== i))} disabled={rows.length < 2}><Icon name="x" size={13} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row between" style={{ marginTop: 8 }}>
        <button type="button" className="btn sm sec" onClick={() => {
          const last = rows[rows.length - 1];
          const d = new Date(last.due_date); d.setMonth(d.getMonth() + 1);
          onChange([...rows, { due_date: d.toISOString().slice(0, 10), amount: last.amount }]);
        }}><Icon name="plus" size={14} />Oy qo'shish</button>
        <span>Jami: <b>{fmt(total)} so'm</b></span>
      </div>
    </>
  );
}

/* ---------------- Tasdiqlash bloki ---------------- */
function ConfirmBox({ o, onDone }) {
  const [down, setDown] = useState(o.down_payment);
  const [rows, setRows] = useState(o.draft?.rows || []);
  const [imei, setImei] = useState(o.imei || '');
  const [method, setMethod] = useState('cash');
  const [busy, setBusy] = useState(false);
  const recalc = async () => {
    const r = await adminApi.post(`/orders/${o.id}/draft`, { down_payment: down });
    setRows(r.rows);
  };
  const confirm = async () => {
    setBusy(true);
    try {
      const r = await adminApi.post(`/orders/${o.id}/confirm`, { down_payment: Number(down), schedule: o.type === 'installment' ? rows : undefined, imei, method });
      toast('Tasdiqlandi ✓ Mijozga yuborildi');
      onDone(r);
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const reject = async () => {
    const reason = prompt('Rad etish sababi');
    if (reason === null) return;
    try { onDone(await adminApi.post(`/orders/${o.id}/status`, { status: 'rejected', reason })); toast('Rad etildi'); } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <div className="a-card" style={{ border: '2px solid var(--accent)' }}>
      <h3>Tasdiqlash</h3>
      <div className="form-grid">
        {o.type === 'installment' && (
          <label className="fld">Boshlang'ich to'lov (haqiqatda olingan)
            <div className="row"><input className="inp grow" type="number" step="1000" value={down} onChange={(e) => setDown(e.target.value)} />
              <button type="button" className="btn sm sec" onClick={recalc}>Qayta hisoblash</button></div>
          </label>
        )}
        <label className="fld">{o.type === 'installment' ? "Boshlang'ich to'lov usuli" : "To'lov usuli"}
          <select className="inp" value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">Naqd</option><option value="card">Karta</option></select>
        </label>
        <label className="fld">IMEI / seriya raqami<input className="inp" value={imei} onChange={(e) => setImei(e.target.value)} placeholder="35xxxxxxxxxxxxx" /></label>
      </div>
      {o.type === 'installment' && <>
        <div className="fld" style={{ margin: '16px 0 4px' }}>To'lov grafigi (har oyni tahrirlash mumkin)</div>
        <ScheduleEditor rows={rows} onChange={setRows} />
      </>}
      <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="btn bad" onClick={reject}>Rad etish</button>
        <button className="btn ok" disabled={busy} onClick={confirm}><Icon name="check" size={16} />Tasdiqlash</button>
      </div>
    </div>
  );
}

/* ---------------- Buyurtma / shartnoma sahifasi ---------------- */
export function OrderDetail() {
  const { id } = useParams();
  const { data: o, setData, reload } = useAsync(() => adminApi.get(`/orders/${id}`), [id]);
  const [pay, setPay] = useState({ amount: '', method: 'cash', note: '' });
  const [editRows, setEditRows] = useState(null);
  const [note, setNote] = useState('');
  const [rem, setRem] = useState(null);
  useEffect(() => { if (o) setRem({ paused: !!o.reminders_paused, days: (o.reminder_days || []).join(', '), imei: o.imei || '' }); }, [o]);
  if (!o) return <Loading />;
  const refresh = (n) => { setData(n); reload(); };
  const act = async (fn, msg) => {
    try { refresh(await fn()); if (msg) toast(msg); return true; } catch (e) { toast(e.message, 'err'); return false; }
  };
  const s = o.summary;
  const active = ['confirmed', 'shipping', 'delivered'].includes(o.status);
  const next = { confirmed: o.delivery_method === 'delivery' ? ['shipping', 'delivered'] : ['delivered'], shipping: ['delivered'] }[o.status] || [];

  return (
    <>
      <div className="a-head">
        <h1>{o.type === 'installment' ? 'Shartnoma' : 'Buyurtma'} #{o.id} <Pill s={o.status}>{STATUS[o.status]}</Pill></h1>
        <div className="row">
          {next.map((st) => <button key={st} className="btn" onClick={() => act(() => adminApi.post(`/orders/${o.id}/status`, { status: st }), STATUS[st])}>{STATUS[st]} deb belgilash</button>)}
          {['new', 'confirmed', 'shipping'].includes(o.status) && o.status !== 'new' && (
            <button className="btn bad" onClick={() => { const r = prompt('Bekor qilish sababi'); if (r !== null) act(() => adminApi.post(`/orders/${o.id}/status`, { status: 'cancelled', reason: r }), 'Bekor qilindi'); }}>Bekor qilish</button>
          )}
        </div>
      </div>

      <div className="a-grid3" style={{ marginBottom: 16 }}>
        <div className="a-card">
          <h3>Mijoz</h3>
          <div><Link to={`/admin/customers/${o.customer_id}`}><b>{o.full_name}</b></Link></div>
          <div className="muted">{o.phone}</div>
          {o.customer?.username && <div className="muted">@{o.customer.username}</div>}
          {o.customer?.bot_blocked ? <div style={{ marginTop: 6 }}><Pill s="bad">Bot bloklangan — qo'ng'iroq qiling</Pill></div> : null}
          <div style={{ marginTop: 10 }}>{o.delivery_method === 'delivery' ? <>🚚 {o.address}{o.lat && <> · <a href={`https://maps.google.com/?q=${o.lat},${o.lng}`} target="_blank" rel="noreferrer">xaritada</a></>}</> : "🏬 Do'kondan olib ketish"}</div>
          {o.comment && <div className="muted" style={{ marginTop: 6 }}>💬 {o.comment}</div>}
          <div style={{ marginTop: 10 }}><Link className="btn sm sec" to={`/admin/chats/${o.customer_id}`}><Icon name="chat" size={14} />Yozish</Link></div>
        </div>
        <div className="a-card">
          <h3>Mahsulot</h3>
          {o.items.map((i) => (
            <div key={i.id} className="row" style={{ marginBottom: 8 }}>
              {i.image && <img src={i.image} alt="" style={{ width: 44, height: 44, objectFit: 'contain' }} />}
              <div className="grow"><b>{i.name}</b><div className="muted" style={{ fontSize: 12 }}>{[i.storage, i.color].filter(Boolean).join(' · ')}{i.qty > 1 ? ` ×${i.qty}` : ''}</div></div>
              <b>{fmt(i.price * i.qty)}</b>
            </div>
          ))}
          {o.imei && <div className="muted" style={{ fontSize: 13 }}>IMEI: <b style={{ color: 'var(--navy)' }}>{o.imei}</b></div>}
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Yaratildi: {dmyt(o.created_at)}{o.confirmed_at && <> · Tasdiqlandi: {dmyt(o.confirmed_at)}</>}</div>
        </div>
        <div className="a-card">
          <h3>Shartlar</h3>
          {o.type === 'installment' ? <>
            <div className="row between"><span className="muted">Narx</span><b>{fmt(o.total)}</b></div>
            <div className="row between"><span className="muted">Boshlang'ich</span><b>{fmt(o.down_payment)}</b></div>
            <div className="row between"><span className="muted">Muddat / ustama</span><b>{o.months} oy / {o.markup_pct}%</b></div>
            <div className="row between"><span className="muted">Nasiya summasi</span><b>{fmt(o.installment_total || o.draft?.calc.total)}</b></div>
            {s && <>
              <div className="row between" style={{ marginTop: 10 }}><span className="muted">To'langan</span><b style={{ color: 'var(--ok)' }}>{fmt(s.paid)}</b></div>
              <div className="row between"><span className="muted">Qoldiq</span><b className="accent" style={{ fontSize: 18 }}>{fmt(s.remaining)}</b></div>
              {s.overdue_amount > 0 && <div className="row between"><Pill s="bad">Kechikkan {s.overdue_days} kun</Pill><b style={{ color: 'var(--bad)' }}>{fmt(s.overdue_amount)}</b></div>}
            </>}
          </> : <div className="row between"><span className="muted">Jami (naqd)</span><b style={{ fontSize: 18 }}>{fmt(o.total)} so'm</b></div>}
        </div>
      </div>

      {o.status === 'new' && <ConfirmBox o={o} onDone={refresh} />}

      {o.schedule && (
        <div className="a-grid2">
          <div className="a-card">
            <div className="row between"><h3>To'lov grafigi</h3>
              {active && !editRows && <button className="btn sm sec" onClick={() => setEditRows(o.schedule.map((r) => ({ due_date: r.due_date, amount: r.amount })))}><Icon name="edit" size={14} />Tahrirlash</button>}
            </div>
            {editRows ? <>
              <ScheduleEditor rows={editRows} onChange={setEditRows} paidMap={o.schedule} />
              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn sec" onClick={() => setEditRows(null)}>Bekor</button>
                <button className="btn" onClick={() => { const reason = prompt("O'zgarish sababi (tarixga yoziladi)") ?? ''; act(() => adminApi.put(`/orders/${o.id}/schedule`, { rows: editRows, reason }), 'Grafik yangilandi, mijozga yuborildi').then((ok) => ok && setEditRows(null)); }}>Saqlash</button>
              </div>
            </> : (
              <table className="a-table">
                <thead><tr><th>#</th><th>Sana</th><th className="num">Summa</th><th className="num">To'langan</th><th>Holat</th></tr></thead>
                <tbody>{o.schedule.map((r) => (
                  <tr key={r.id}>
                    <td>{r.idx}</td><td>{dmy(r.due_date)}</td><td className="num">{fmt(r.amount)}</td><td className="num">{fmt(r.paid)}</td>
                    <td><Pill s={{ paid: 'ok', overdue: 'bad', partial: 'warn' }[r.status] || ''}>{{ paid: "To'langan", partial: 'Qisman', overdue: 'Kechikkan', pending: 'Kutilmoqda' }[r.status]}</Pill></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
          <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
            {active && (
              <div className="a-card">
                <h3>To'lov qayd etish</h3>
                <form className="row" style={{ flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); act(() => adminApi.post(`/orders/${o.id}/payments`, pay), "To'lov qayd etildi, mijozga xabar ketdi").then((ok) => ok && setPay({ amount: '', method: pay.method, note: '' })); }}>
                  <input className="inp" style={{ width: 150 }} type="number" step="1000" placeholder="Summa" required value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
                  <select className="inp" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}><option value="cash">Naqd</option><option value="card">Karta</option></select>
                  <input className="inp grow" placeholder="Izoh" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} />
                  <button className="btn">Qabul qilish</button>
                </form>
                <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                  {s.next && <button className="btn sm sec" onClick={() => setPay({ ...pay, amount: s.next.amount })}>Keyingi oy: {fmt(s.next.amount)}</button>}
                  {s.overdue_amount > 0 && <button className="btn sm sec" onClick={() => setPay({ ...pay, amount: s.overdue_amount })}>Kechikkan: {fmt(s.overdue_amount)}</button>}
                  <button className="btn sm sec" onClick={() => setPay({ ...pay, amount: s.remaining, note: "Muddatidan oldin yopish" })}>To'liq yopish: {fmt(s.remaining)}</button>
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Summa eng eski to'lanmagan oyga yoziladi. Qisman va oldindan to'lov mumkin. Jarima hisoblanmaydi.</div>
              </div>
            )}
            {rem && o.status !== 'closed' && (
              <div className="a-card">
                <h3>Eslatmalar va IMEI</h3>
                <label className="row" style={{ marginBottom: 10 }}><input type="checkbox" checked={rem.paused} onChange={(e) => setRem({ ...rem, paused: e.target.checked })} /> Eslatmalarni to'xtatish</label>
                <div className="form-grid">
                  <label className="fld">Alohida kunlar (bo'sh = standart)<input className="inp" placeholder="-3, 0, 1, 3, 7" value={rem.days} onChange={(e) => setRem({ ...rem, days: e.target.value })} /></label>
                  <label className="fld">IMEI / seriya<input className="inp" value={rem.imei} onChange={(e) => setRem({ ...rem, imei: e.target.value })} /></label>
                </div>
                <button className="btn sm" style={{ marginTop: 10 }} onClick={() => act(() => adminApi.put(`/orders/${o.id}/meta`, {
                  reminders_paused: rem.paused, imei: rem.imei,
                  reminder_days: rem.days.trim() ? rem.days.split(',').map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x)) : null,
                }), 'Saqlandi')}>Saqlash</button>
              </div>
            )}
          </div>
        </div>
      )}

      {o.status !== 'new' && o.type === 'cash' && (
        <div className="a-card" style={{ marginBottom: 16 }}>
          <h3>IMEI / seriya</h3>
          <form className="row" onSubmit={(e) => { e.preventDefault(); act(() => adminApi.put(`/orders/${o.id}/meta`, { imei: e.target.imei.value }), 'Saqlandi'); }}>
            <input name="imei" className="inp grow" defaultValue={o.imei || ''} /><button className="btn sm">Saqlash</button>
          </form>
        </div>
      )}

      <div className="a-grid2" style={{ marginTop: 16 }}>
        <div className="a-card">
          <h3>To'lovlar</h3>
          {o.payments.length ? (
            <table className="a-table"><tbody>{o.payments.map((p) => (
              <tr key={p.id} style={p.cancelled ? { opacity: 0.5, textDecoration: 'line-through' } : null}>
                <td className="muted">{dmyt(p.created_at)}</td>
                <td>{{ down: "Boshlang'ich", installment: 'Nasiya', sale: 'Naqd savdo' }[p.kind]}{p.note && <div className="muted" style={{ fontSize: 12 }}>{p.note}</div>}</td>
                <td>{p.method === 'card' ? 'Karta' : 'Naqd'}</td>
                <td className="num"><b>{fmt(p.amount)}</b></td>
                <td>{p.cancelled ? <span className="muted" style={{ fontSize: 12, textDecoration: 'none' }}>bekor: {p.cancel_reason}</span>
                  : <button className="btn sm bad" onClick={() => { const r = prompt("To'lovni bekor qilish sababi (o'chirilmaydi, tarixda qoladi)"); if (r !== null) act(() => adminApi.post(`/payments/${p.id}/cancel`, { reason: r }), "To'lov bekor qilindi"); }}>Bekor</button>}</td>
              </tr>
            ))}</tbody></table>
          ) : <div className="empty">To'lov yo'q</div>}
        </div>
        <div className="a-card">
          <h3>Qo'ng'iroq izohlari</h3>
          <form className="row" onSubmit={(e) => { e.preventDefault(); if (note.trim()) act(() => adminApi.post(`/orders/${o.id}/notes`, { text: note })).then((ok) => ok && setNote('')); }}>
            <input className="inp grow" placeholder="Masalan: 25-sanada to'lashga va'da berdi" value={note} onChange={(e) => setNote(e.target.value)} /><button className="btn sm">Qo'shish</button>
          </form>
          {o.notes.map((n) => <div key={n.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}><span className="muted">{dmyt(n.created_at)}</span> — {n.text}</div>)}
        </div>
      </div>

      <div className="a-card" style={{ marginTop: 16 }}>
        <h3>O'zgarishlar tarixi</h3>
        {o.history?.length ? o.history.map((h) => (
          <div key={h.id} style={{ padding: '7px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
            <span className="muted">{dmyt(h.created_at)} · {h.actor}</span> — <b>{h.action}</b> <span className="muted">{JSON.stringify(h.details)}</span>
          </div>
        )) : <div className="muted">Bo'sh</div>}
      </div>
    </>
  );
}

/* ---------------- Shartnomalar ---------------- */
export function Contracts() {
  const nav = useNavigate();
  const [tab, setTab] = useState('active');
  const { data } = useAsync(() => adminApi.get('/contracts'), []);
  if (!data) return <Loading />;
  const list = data.filter((c) => (tab === 'active' ? c.status !== 'closed' : tab === 'closed' ? c.status === 'closed' : c.summary.overdue_amount > 0 && c.status !== 'closed'));
  return (
    <>
      <div className="a-head"><h1>Shartnomalar (nasiya)</h1></div>
      <div className="a-tabs">
        {[['active', 'Faol'], ['overdue', 'Kechikkan'], ['closed', 'Yopilgan']].map(([k, v]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{v}</button>)}
      </div>
      <div className="a-card a-scroll">
        {!list.length ? <div className="empty">Bo'sh</div> : (
          <table className="a-table">
            <thead><tr><th>#</th><th>Mijoz</th><th>Mahsulot</th><th>Muddat</th><th className="num">Nasiya</th><th className="num">To'langan</th><th className="num">Qoldiq</th><th>Keyingi to'lov</th><th>Holat</th></tr></thead>
            <tbody>{list.map((c) => (
              <tr key={c.id} className="click" onClick={() => nav(`/admin/orders/${c.id}`)}>
                <td><b>#{c.id}</b></td>
                <td><b>{c.c_name}</b> {c.bot_blocked ? <Pill s="bad">Bot bloklangan</Pill> : null}<div className="muted" style={{ fontSize: 12 }}>{c.c_phone}</div></td>
                <td>{c.product}</td>
                <td>{c.months} oy</td>
                <td className="num">{fmt(c.summary.schedule_total)}</td>
                <td className="num" style={{ color: 'var(--ok)' }}>{fmt(c.summary.paid)}</td>
                <td className="num"><b>{fmt(c.summary.remaining)}</b></td>
                <td>{c.summary.next ? <>{dmy(c.summary.next.date)} · {fmt(c.summary.next.amount)}</> : '—'}{c.summary.overdue_amount > 0 && <div><Pill s="bad">{c.summary.overdue_days} kun kechikkan</Pill></div>}</td>
                <td><Pill s={c.status}>{STATUS[c.status]}</Pill></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}

/* ---------------- Qarzdorlar ---------------- */
export function Debtors() {
  const nav = useNavigate();
  const [b, setB] = useState('');
  const { data } = useAsync(() => adminApi.get('/debtors'), []);
  if (!data) return <Loading />;
  const groups = ['1-7', '8-30', '30+'];
  const list = data.filter((d) => !b || d.bucket === b);
  return (
    <>
      <div className="a-head"><h1>Qarzdorlar</h1></div>
      <div className="a-stats">
        {groups.map((g) => {
          const x = data.filter((d) => d.bucket === g);
          return (
            <div key={g} className="a-card a-stat" style={{ cursor: 'pointer', outline: b === g ? '2px solid var(--accent)' : 'none' }} onClick={() => setB(b === g ? '' : g)}>
              <div className="l">{g} kun kechikkan</div>
              <div className="v" style={{ color: g === '30+' ? 'var(--bad)' : g === '8-30' ? '#b77700' : 'var(--navy)' }}>{x.length} ta</div>
              <div className="s">{fmt(x.reduce((a, d) => a + d.summary.overdue_amount, 0))} so'm</div>
            </div>
          );
        })}
      </div>
      <div className="a-card a-scroll">
        {!list.length ? <div className="empty">Qarzdorlar yo'q 🎉</div> : (
          <table className="a-table">
            <thead><tr><th>#</th><th>Mijoz</th><th>Mahsulot</th><th>Kechikish</th><th className="num">Kechikkan summa</th><th className="num">Umumiy qoldiq</th><th>Oxirgi izoh</th></tr></thead>
            <tbody>{list.map((d) => (
              <tr key={d.id} className="click" onClick={() => nav(`/admin/orders/${d.id}`)}>
                <td>#{d.id}</td>
                <td><b>{d.c_name}</b><div className="muted" style={{ fontSize: 12 }}>
                  <a href={`tel:${d.c_phone}`} onClick={(e) => e.stopPropagation()}>{d.c_phone}</a></div>
                  {d.bot_blocked ? <Pill s="bad">Bot bloklangan</Pill> : null}{d.reminders_paused ? <Pill s="warn">Eslatma to'xtatilgan</Pill> : null}</td>
                <td>{d.product}</td>
                <td><Pill s={d.bucket === '30+' ? 'bad' : 'warn'}>{d.summary.overdue_days} kun</Pill></td>
                <td className="num"><b style={{ color: 'var(--bad)' }}>{fmt(d.summary.overdue_amount)}</b></td>
                <td className="num">{fmt(d.summary.remaining)}</td>
                <td style={{ maxWidth: 240, fontSize: 12.5 }}>{d.last_note ? <><span className="muted">{dmy(d.last_note.created_at)}:</span> {d.last_note.text}</> : <span className="muted">—</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
