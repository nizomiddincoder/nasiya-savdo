import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { adminApi } from '../api.js';
import { Icon, fmt, dmy, dmyt, useAsync, toast, today, STATUS } from '../lib.jsx';
import { Loading, Pill } from './pages1.jsx';

/* ---------------- Mijozlar ---------------- */
export function Customers() {
  const nav = useNavigate();
  const [qText, setQ] = useState('');
  const { data } = useAsync(() => adminApi.get(`/customers?q=${encodeURIComponent(qText)}`), [qText]);
  return (
    <>
      <div className="a-head"><h1>Mijozlar</h1><input className="inp" placeholder="Ism, telefon, username" value={qText} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="a-card a-scroll">
        {!data ? <Loading /> : (
          <table className="a-table">
            <thead><tr><th>Mijoz</th><th>Telefon</th><th>Telegram</th><th className="num">Xaridlar</th><th className="num">Qarz</th><th>Bot holati</th><th>Ro'yxatdan o'tgan</th></tr></thead>
            <tbody>{data.map((c) => (
              <tr key={c.id} className="click" onClick={() => nav(`/admin/customers/${c.id}`)}>
                <td><b>{c.full_name || c.first_name}</b></td>
                <td>{c.phone || <span className="muted">—</span>}</td>
                <td className="muted">{c.username ? '@' + c.username : c.tg_id}</td>
                <td className="num">{c.orders_count}</td>
                <td className="num">{c.debt ? <b>{fmt(c.debt)}</b> : <span className="muted">0</span>}</td>
                <td>{c.bot_blocked ? <Pill s="bad">Bloklagan</Pill> : <Pill s="ok">Faol</Pill>} {c.ads_off ? <Pill s="">Reklama o'chiq</Pill> : null}</td>
                <td className="muted">{dmy(c.created_at)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}

function CustomerCard({ c }) {
  return (
    <div className="a-card">
      <div className="row"><div className="av">{(c.full_name || c.first_name || '?')[0]}</div>
        <div><b>{c.full_name || c.first_name}</b><div className="muted" style={{ fontSize: 12.5 }}>{c.phone}{c.username ? ` · @${c.username}` : ''}</div></div></div>
      <div className="row between" style={{ marginTop: 14 }}><span className="muted">Qarz</span><b className="accent" style={{ fontSize: 18 }}>{fmt(c.debt)} so'm</b></div>
      <div className="row between"><span className="muted">Bot</span>{c.bot_blocked ? <Pill s="bad">Bloklagan</Pill> : <Pill s="ok">Faol</Pill>}</div>
      <h3 style={{ marginTop: 16, fontSize: 14 }}>Buyurtmalar</h3>
      {c.orders.map((o) => (
        <Link key={o.id} to={`/admin/orders/${o.id}`} style={{ display: 'block', textDecoration: 'none', padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
          <div className="row between"><b>#{o.id} · {o.type === 'cash' ? 'Naqd' : 'Nasiya'}</b><Pill s={o.status}>{STATUS[o.status]}</Pill></div>
          <div className="muted">{o.items.map((i) => i.name).join(', ')}</div>
          {o.summary && o.status !== 'closed' && <div>Qoldiq: <b>{fmt(o.summary.remaining)}</b>{o.summary.overdue_amount > 0 && <span style={{ color: 'var(--bad)' }}> · kechikkan {fmt(o.summary.overdue_amount)}</span>}</div>}
        </Link>
      ))}
    </div>
  );
}

export function CustomerDetail() {
  const { id } = useParams();
  const { data } = useAsync(() => adminApi.get(`/customers/${id}`), [id]);
  if (!data) return <Loading />;
  return (
    <>
      <div className="a-head"><h1>{data.full_name || data.first_name}</h1><Link className="btn" to={`/admin/chats/${id}`}><Icon name="chat" size={16} />Yozish</Link></div>
      <div style={{ maxWidth: 640 }}><CustomerCard c={data} /></div>
    </>
  );
}

/* ---------------- Chatlar ---------------- */
function MessageBody({ m }) {
  if (m.kind === 'photo') return <>{m.file_id && <img src={adminApi.fileUrl(`/tgfile/${m.file_id}`)} alt="rasm" />}{m.text}</>;
  if (m.kind === 'voice' || m.kind === 'video') return <audio controls src={adminApi.fileUrl(`/tgfile/${m.file_id}`)} style={{ maxWidth: 240 }} />;
  if (m.kind === 'document') return <a href={adminApi.fileUrl(`/tgfile/${m.file_id}`)} target="_blank" rel="noreferrer">📎 {m.text}</a>;
  if (m.kind === 'location') return <a href={`https://maps.google.com/?q=${m.text}`} target="_blank" rel="noreferrer">📍 Lokatsiya</a>;
  return m.text;
}

export function Chats() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: list, reload } = useAsync(() => adminApi.get('/chats'), []);
  const [chat, setChat] = useState(null);
  const [text, setText] = useState('');
  const [settings, setSettings] = useState(null);
  const box = useRef(null);
  useEffect(() => { adminApi.get('/settings').then(setSettings); }, []);
  useEffect(() => {
    if (!id) return setChat(null);
    const load = () => adminApi.get(`/chats/${id}`).then(setChat);
    load();
    const t = setInterval(() => { load(); reload(); }, 8000);
    return () => clearInterval(t);
  }, [id]); // eslint-disable-line
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [chat?.messages.length]);
  const send = async (e) => {
    e?.preventDefault();
    if (!text.trim()) return;
    try {
      const r = await adminApi.post(`/chats/${id}`, { text });
      if (r.warning) toast(r.warning, 'err');
      setText('');
      setChat(await adminApi.get(`/chats/${id}`));
      reload();
    } catch (err) { toast(err.message, 'err'); }
  };
  return (
    <>
      <div className="a-head"><h1>Chatlar</h1></div>
      <div className="chat-wrap">
        <div className="a-card chat-list">
          {!list ? <Loading /> : !list.length ? <div className="empty">Xabarlar yo'q</div> : list.map((c) => (
            <div key={c.id} className={`chat-row ${String(c.id) === id ? 'on' : ''}`} onClick={() => nav(`/admin/chats/${c.id}`)}>
              <div className="av">{(c.full_name || c.first_name || '?')[0]}</div>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row between"><b style={{ fontSize: 14 }}>{c.full_name || c.first_name}</b><span className="muted" style={{ fontSize: 11 }}>{dmy(c.last_at).slice(0, 5)}</span></div>
                <div className="muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.last_kind !== 'text' ? `[${c.last_kind}] ` : ''}{c.last_text}</div>
              </div>
              {c.unread > 0 && <span className="pill bad">{c.unread}</span>}
            </div>
          ))}
        </div>
        <div className="a-card chat-msgs">
          {!chat ? <div className="empty" style={{ margin: 'auto' }}>Chatni tanlang</div> : <>
            <div className="list" ref={box}>
              {chat.messages.map((m) => (
                <div key={m.id} className={`bubble ${m.direction}`}><MessageBody m={m} /><div className="tm">{dmyt(m.created_at)}</div></div>
              ))}
            </div>
            {settings?.quick_replies?.length > 0 && (
              <div className="row" style={{ padding: '8px 12px 0', flexWrap: 'wrap', gap: 6 }}>
                {settings.quick_replies.map((r) => <button key={r.title} className="btn sm sec" onClick={() => setText(r.text)}>{r.title}</button>)}
              </div>
            )}
            <form className="chat-input" onSubmit={send}>
              <textarea className="inp grow" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Javob yozing... (Ctrl+Enter yuborish)"
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }} />
              <button className="btn"><Icon name="send" size={16} /></button>
            </form>
          </>}
        </div>
        <div>{chat && <CustomerCard c={chat.customer} />}</div>
      </div>
    </>
  );
}

/* ---------------- Tarqatmalar ---------------- */
export function Broadcasts() {
  const [sp] = useSearchParams();
  const { data: products } = useAsync(() => adminApi.get('/products'), []);
  const { data: list, reload } = useAsync(() => adminApi.get('/broadcasts'), []);
  const [pid, setPid] = useState(sp.get('product') || '');
  const [post, setPost] = useState(null);
  const [target, setTarget] = useState('both');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!pid) return setPost(null);
    adminApi.post('/broadcasts/preview', { product_id: Number(pid) }).then(setPost, (e) => toast(e.message, 'err'));
  }, [pid]);
  useEffect(() => {
    if (!list?.some((b) => ['queued', 'running'].includes(b.status))) return;
    const t = setInterval(reload, 2000);
    return () => clearInterval(t);
  }, [list]); // eslint-disable-line
  const send = async () => {
    if (!confirm('Yuborilsinmi?')) return;
    setBusy(true);
    try {
      await adminApi.post('/broadcasts', { product_id: Number(pid), target, text: post.text });
      toast('Tarqatma boshlandi');
      reload();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="a-head"><h1>Tarqatmalar va kanal e'loni</h1></div>
      <div className="a-grid2">
        <div className="a-card">
          <h3>Yangi e'lon</h3>
          <label className="fld">Mahsulot
            <select className="inp" value={pid} onChange={(e) => setPid(e.target.value)}>
              <option value="">— tanlang —</option>
              {(products || []).map((p) => <option key={p.id} value={p.id}>{p.name} — {fmt(p.price)}</option>)}
            </select>
          </label>
          {post && <>
            <label className="fld" style={{ marginTop: 12 }}>Matn (tahrirlash mumkin)<textarea className="inp" rows={16} value={post.text} onChange={(e) => setPost({ ...post, text: e.target.value })} /></label>
            <div className="fld" style={{ marginTop: 12 }}>Qayerga</div>
            <div className="a-tabs" style={{ marginTop: 6 }}>
              {[['channel', 'Kanalga'], ['subscribers', 'Bot obunachilariga'], ['both', 'Ikkalasiga']].map(([k, v]) => <button key={k} className={target === k ? 'on' : ''} onClick={() => setTarget(k)}>{v}</button>)}
            </div>
            <button className="btn" disabled={busy} onClick={send}><Icon name="send" size={16} />E'lon qilish</button>
            <p className="muted" style={{ fontSize: 12 }}>Obunachilarga ~25 xabar/sek tezlikda navbat bilan yuboriladi. Har xabar ostida "Reklamani o'chirish" tugmasi bor. Kunlik limit Sozlamalarda.</p>
          </>}
        </div>
        <div className="a-card">
          <h3>Ko'rinishi</h3>
          {post ? (
            <div className="post-preview">
              {post.image && <img src={post.image} alt="" />}
              {post.text}
              <div style={{ marginTop: 10, background: '#fff', borderRadius: 10, padding: 8, textAlign: 'center', fontWeight: 600, color: 'var(--accent-2)' }}>🛍 Sotib olish</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 6, wordBreak: 'break-all' }}>{post.button_url}</div>
            </div>
          ) : <div className="empty">Mahsulotni tanlang</div>}
        </div>
      </div>
      <div className="a-card a-scroll" style={{ marginTop: 16 }}>
        <h3>Tarix</h3>
        {!list?.length ? <div className="empty">Hali tarqatma yo'q</div> : (
          <table className="a-table">
            <thead><tr><th>Sana</th><th>Mahsulot</th><th>Qayerga</th><th>Holat</th><th>Kanal</th><th className="num">Yetkazildi</th><th className="num">Bloklagan</th><th className="num">Xato</th></tr></thead>
            <tbody>{list.map((b) => (
              <tr key={b.id}>
                <td className="muted">{dmyt(b.created_at)}</td><td>{b.product}</td>
                <td>{{ channel: 'Kanal', subscribers: 'Obunachilar', both: 'Ikkalasi' }[b.target]}</td>
                <td><Pill s={b.status === 'done' ? 'ok' : b.status === 'error' ? 'bad' : 'warn'}>{{ queued: 'Navbatda', running: 'Yuborilmoqda', done: 'Tugadi', error: 'Xato' }[b.status]}</Pill></td>
                <td style={{ fontSize: 12 }}>{b.channel_status || '—'}</td>
                <td className="num">{b.delivered}{b.total ? ` / ${b.total}` : ''}</td><td className="num">{b.blocked}</td><td className="num">{b.failed}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}

/* ---------------- Hisobotlar ---------------- */
export function Reports() {
  const t = today();
  const [from, setFrom] = useState(`${t.slice(0, 7)}-01`);
  const [to, setTo] = useState(t);
  const { data: r } = useAsync(() => adminApi.get(`/reports?from=${from}&to=${to}`), [from, to]);
  const [daily, setDaily] = useState(null);
  const preset = (days) => { const d = new Date(); d.setDate(d.getDate() - days); setFrom(d.toISOString().slice(0, 10)); setTo(t); };
  const max = Math.max(1, ...(r?.expected || []).map((x) => x.sum));
  return (
    <>
      <div className="a-head">
        <h1>Hisobotlar</h1>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn sm sec" onClick={() => preset(0)}>Bugun</button>
          <button className="btn sm sec" onClick={() => preset(7)}>7 kun</button>
          <button className="btn sm sec" onClick={() => preset(30)}>30 kun</button>
          <input className="inp" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input className="inp" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <a className="btn" href={adminApi.fileUrl(`/reports/export?from=${from}&to=${to}`)}><Icon name="download" size={16} />Excel</a>
        </div>
      </div>
      {!r ? <Loading /> : <>
        <div className="a-stats">
          <div className="a-card a-stat"><div className="l">Naqd savdo</div><div className="v">{fmt(r.sales.cash.sum)}</div><div className="s">{r.sales.cash.count} ta</div></div>
          <div className="a-card a-stat"><div className="l">Nasiya savdo</div><div className="v">{fmt(r.sales.installment.sum)}</div><div className="s">{r.sales.installment.count} ta</div></div>
          <div className="a-card a-stat"><div className="l">Tushum</div><div className="v accent">{fmt(r.receipts.total)}</div><div className="s">naqd {fmt(r.receipts.cash)} · karta {fmt(r.receipts.card)}</div></div>
          <div className="a-card a-stat"><div className="l">Ustamadan daromad</div><div className="v" style={{ color: 'var(--ok)' }}>{fmt(r.markup_income)}</div><div className="s">davrda tuzilgan shartnomalar</div></div>
          <div className="a-card a-stat"><div className="l">Portfel</div><div className="v">{fmt(r.portfolio.debt)}</div><div className="s">kechikkan {fmt(r.portfolio.overdue_sum)}</div></div>
        </div>
        <div className="a-grid2">
          <div className="a-card">
            <h3>Kutilgan tushum (keyingi oylar)</h3>
            {r.expected.length ? r.expected.map((x) => (
              <div key={x.month} style={{ marginBottom: 10 }}>
                <div className="row between" style={{ fontSize: 13 }}><span style={{ color: x.month === 'Kechikkan' ? 'var(--bad)' : undefined }}>{x.month}</span><b>{fmt(x.sum)}</b></div>
                <div className="m-progress" style={{ margin: '4px 0 0', height: 8 }}><div style={{ width: `${(x.sum / max) * 100}%`, background: x.month === 'Kechikkan' ? 'var(--bad)' : undefined }} /></div>
              </div>
            )) : <div className="empty">Bo'sh</div>}
          </div>
          <div className="a-card">
            <div className="row between"><h3>Kunlik hisobot (bot matni)</h3>
              <div className="row">
                <button className="btn sm sec" onClick={() => adminApi.get('/reports/daily').then((x) => setDaily(x.text))}>Ko'rish</button>
                <button className="btn sm" onClick={() => adminApi.post('/reports/daily/send').then(() => toast('Yuborildi'), (e) => toast(e.message, 'err'))}>Hozir yuborish</button>
              </div></div>
            {daily ? <div className="post-preview" dangerouslySetInnerHTML={{ __html: daily }} /> : <p className="muted" style={{ fontSize: 13 }}>Har kuni belgilangan vaqtda (standart 08:00) guruhga va adminga kechagi kun bo'yicha yuboriladi.</p>}
          </div>
        </div>
      </>}
    </>
  );
}

/* ---------------- Sozlamalar ---------------- */
export function Settings() {
  const { data, setData } = useAsync(() => adminApi.get('/settings'), []);
  const [pw, setPw] = useState({ old: '', password: '', login: '' });
  if (!data) return <Loading />;
  const s = data;
  const set = (k, v) => setData({ ...s, [k]: v });
  const save = async () => {
    try {
      const body = { ...s, reminder_days: typeof s.reminder_days === 'string' ? s.reminder_days : s.reminder_days.join(', ') };
      const r = await adminApi.put('/settings', body);
      setData({ ...s, ...r });
      toast('Saqlandi ✓');
    } catch (e) { toast(e.message, 'err'); }
  };
  const test = (target) => adminApi.post('/settings/test', { target }).then(() => toast('Yuborildi ✓'), (e) => toast(e.message, 'err'));
  const F = ({ k, label, type = 'text', ...p }) => (
    <label className="fld">{label}<input className="inp" type={type} value={s[k] ?? ''} onChange={(e) => set(k, e.target.value)} {...p} /></label>
  );
  return (
    <>
      <div className="a-head"><h1>Sozlamalar</h1><button className="btn" onClick={save}><Icon name="check" size={16} />Saqlash</button></div>
      <div className="a-grid2">
        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <div className="a-card">
            <h3>Narx va nasiya</h3>
            <div className="form-grid">
              {F({ k: 'usd_rate', label: "Dollar kursi (1$ = so'm)", type: 'number' })}
              {F({ k: 'min_down_pct', label: "Min. boshlang'ich to'lov, %", type: 'number' })}
            </div>
            <div className="fld" style={{ marginTop: 12 }}>Standart ustama (yangi mahsulotga avtomatik qo'yiladi)</div>
            <div className="row" style={{ flexWrap: 'wrap', marginTop: 6 }}>
              {s.default_terms.map((t, i) => (
                <label key={t.months} className="row" style={{ background: 'var(--bg-2)', padding: '6px 10px', borderRadius: 12, gap: 6 }}>
                  <b>{t.months} oy</b>
                  <input className="inp" style={{ width: 70, height: 32 }} type="number" step="0.5" value={t.markup}
                    onChange={(e) => set('default_terms', s.default_terms.map((x, j) => (j === i ? { ...x, markup: Number(e.target.value) } : x)))} />%
                </label>
              ))}
            </div>
          </div>
          <div className="a-card">
            <h3>Eslatmalar va hisobot</h3>
            <div className="form-grid">
              <label className="fld">Eslatma kunlari (to'lov kuniga nisbatan)
                <input className="inp" value={Array.isArray(s.reminder_days) ? s.reminder_days.join(', ') : s.reminder_days} onChange={(e) => set('reminder_days', e.target.value)} /></label>
              {F({ k: 'reminder_time', label: 'Eslatma vaqti', type: 'time' })}
              {F({ k: 'report_time', label: 'Kunlik hisobot vaqti', type: 'time' })}
            </div>
            <p className="muted" style={{ fontSize: 12 }}>O'zgaruvchilar: {'{ism} {summa} {sana} {qoldiq}'}</p>
            <label className="fld">Muddatdan oldin<textarea className="inp" rows={2} value={s.tpl_before} onChange={(e) => set('tpl_before', e.target.value)} /></label>
            <label className="fld" style={{ marginTop: 10 }}>To'lov kuni<textarea className="inp" rows={2} value={s.tpl_due} onChange={(e) => set('tpl_due', e.target.value)} /></label>
            <label className="fld" style={{ marginTop: 10 }}>Kechikkanda<textarea className="inp" rows={2} value={s.tpl_overdue} onChange={(e) => set('tpl_overdue', e.target.value)} /></label>
            <button className="btn sm sec" style={{ marginTop: 10 }} onClick={() => adminApi.post('/reminders/run').then((r) => toast(`Yuborildi: ${r.sent}`), (e) => toast(e.message, 'err'))}>Eslatmalarni hozir tekshirish</button>
          </div>
          <div className="a-card">
            <h3>Do'kon va chat</h3>
            <div className="form-grid">
              {F({ k: 'shop_name', label: "Do'kon nomi" })}
              {F({ k: 'work_hours', label: 'Ish vaqti' })}
            </div>
            <label className="fld" style={{ marginTop: 10 }}>Manzil<input className="inp" value={s.shop_address} onChange={(e) => set('shop_address', e.target.value)} /></label>
            <div className="fld" style={{ marginTop: 12 }}>Tayyor javob shablonlari</div>
            {s.quick_replies.map((r, i) => (
              <div key={i} className="row" style={{ marginTop: 6, alignItems: 'flex-start' }}>
                <input className="inp" style={{ width: 140 }} value={r.title} onChange={(e) => set('quick_replies', s.quick_replies.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                <textarea className="inp grow" rows={2} value={r.text} onChange={(e) => set('quick_replies', s.quick_replies.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                <button className="btn sm bad" onClick={() => set('quick_replies', s.quick_replies.filter((_, j) => j !== i))}><Icon name="x" size={13} /></button>
              </div>
            ))}
            <button className="btn sm sec" style={{ marginTop: 8 }} onClick={() => set('quick_replies', [...s.quick_replies, { title: 'Yangi', text: '' }])}><Icon name="plus" size={14} />Shablon</button>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <div className="a-card">
            <h3>Telegram ulash</h3>
            <p style={{ fontSize: 13 }}>{s.bot.running ? <Pill s="ok">Bot ishlayapti: @{s.bot.username}</Pill> : <Pill s="warn">Bot ulanmagan — .env faylida BOT_TOKEN ni kiriting</Pill>}</p>
            <div className="form-grid">
              {F({ k: 'admin_tg_id', label: 'Admin Telegram ID' })}
              {F({ k: 'group_chat_id', label: 'Buyurtmalar guruhi ID' })}
              {F({ k: 'channel_id', label: 'Kanal (@username yoki ID)' })}
              {F({ k: 'miniapp_link', label: 'Miniapp havolasi (t.me/bot/app)' })}
            </div>
            <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
              <button className="btn sm sec" onClick={() => test('admin')}>Adminga test</button>
              <button className="btn sm sec" onClick={() => test('group')}>Guruhga test</button>
              <button className="btn sm sec" onClick={() => test('channel')}>Kanalga test</button>
            </div>
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
              ID olish: botga <code>/myid</code> yozing. Guruhni ulash: botni yopiq guruhga qo'shib, guruhda <code>/bindgroup</code> yuboring.
              Kanal: botni kanalga post huquqi bilan admin qiling. Miniapp ochilishi uchun PUBLIC_URL https bo'lishi kerak (hozir: {s.public_url}).
            </p>
          </div>
          <div className="a-card">
            <h3>Kanal posti shabloni</h3>
            <p className="muted" style={{ fontSize: 12 }}>O'zgaruvchilar: {'{nomi} {xususiyatlar} {narx} {narx_usd} {nasiya} {kontaktlar} {kanal} {tavsif}'}</p>
            <textarea className="inp" rows={13} style={{ width: '100%' }} value={s.post_template} onChange={(e) => set('post_template', e.target.value)} />
            <label className="fld" style={{ marginTop: 10 }}>Nasiya qatori ({'{oylik} {muddat}'})<input className="inp" value={s.post_installment_line} onChange={(e) => set('post_installment_line', e.target.value)} /></label>
            <label className="fld" style={{ marginTop: 10 }}>Telefonlar (har qatorda bittasi)<textarea className="inp" rows={2} value={s.contact_phones} onChange={(e) => set('contact_phones', e.target.value)} /></label>
            <div className="form-grid" style={{ marginTop: 10 }}>
              {F({ k: 'contact_admin', label: 'Admin username' })}
              {F({ k: 'channel_link', label: 'Kanal havolasi' })}
              {F({ k: 'broadcast_daily_limit', label: 'Kunlik tarqatma limiti', type: 'number' })}
            </div>
          </div>
          <div className="a-card">
            <h3>Xavfsizlik</h3>
            <label className="row"><input type="checkbox" checked={!!s.twofa_enabled} onChange={(e) => set('twofa_enabled', e.target.checked)} /> Ikki bosqichli kirish (kod admin Telegramiga keladi)</label>
            <div className="form-grid" style={{ marginTop: 12 }}>
              <label className="fld">Login<input className="inp" value={pw.login || s.admin_login} onChange={(e) => setPw({ ...pw, login: e.target.value })} /></label>
              <label className="fld">Joriy parol<input className="inp" type="password" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} /></label>
              <label className="fld">Yangi parol<input className="inp" type="password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} /></label>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn sm" onClick={() => adminApi.post('/settings/password', pw).then(() => { toast("Parol o'zgardi"); setPw({ old: '', password: '', login: '' }); }, (e) => toast(e.message, 'err'))}>Parolni o'zgartirish</button>
              <button className="btn sm sec" onClick={() => adminApi.post('/backup').then((r) => toast(`Zaxira: ${r.file}`), (e) => toast(e.message, 'err'))}>Zaxira nusxa olish</button>
            </div>
            <p className="muted" style={{ fontSize: 12 }}>Avtomatik zaxira har kuni 03:00 da data/backups papkasiga olinadi (30 kun saqlanadi).</p>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------------- Amallar tarixi ---------------- */
const ACTIONS = {
  'order.confirm': 'Buyurtma tasdiqlandi', 'order.status': "Holat o'zgardi", 'order.meta': "Ma'lumot/eslatma o'zgardi",
  'schedule.update': "Grafik o'zgardi", 'payment.add': "To'lov kiritildi", 'payment.cancel': "To'lov bekor qilindi",
  'product.create': "Mahsulot qo'shildi", 'product.update': 'Mahsulot narxi/qoldig‘i', 'product.delete': "Mahsulot o'chirildi",
  'broadcast.create': 'Tarqatma', 'settings.update': 'Sozlamalar', 'settings.password': "Parol o'zgardi",
};
export function Audit() {
  const { data } = useAsync(() => adminApi.get('/audit'), []);
  return (
    <>
      <div className="a-head"><h1>Amallar tarixi</h1></div>
      <div className="a-card a-scroll">
        {!data ? <Loading /> : !data.length ? <div className="empty">Bo'sh</div> : (
          <table className="a-table">
            <thead><tr><th>Vaqt</th><th>Kim</th><th>Amal</th><th>Obyekt</th><th>Tafsilot</th></tr></thead>
            <tbody>{data.map((a) => (
              <tr key={a.id}>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{dmyt(a.created_at)}</td>
                <td>{a.actor}</td>
                <td><b>{ACTIONS[a.action] || a.action}</b></td>
                <td>{a.entity === 'order' ? <Link to={`/admin/orders/${a.entity_id}`}>#{a.entity_id}</Link> : a.entity_id ? `${a.entity} #${a.entity_id}` : a.entity}</td>
                <td style={{ fontSize: 12, maxWidth: 420, wordBreak: 'break-word' }} className="muted">{JSON.stringify(a.details)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
