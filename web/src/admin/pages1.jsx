import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminApi } from '../api.js';
import { Icon, fmt, dmy, useAsync, toast, calcInstallment, minDown } from '../lib.jsx';

export const Loading = () => <div className="loader-page" style={{ minHeight: 240 }}><div className="spinner" /></div>;
export const Pill = ({ s, children }) => <span className={`pill ${s}`}>{children}</span>;

/* ---------------- Bosh sahifa ---------------- */
export function Dashboard() {
  const nav = useNavigate();
  const { data: d } = useAsync(() => adminApi.get('/dashboard'), []);
  if (!d) return <Loading />;
  const max = Math.max(1, ...d.week.map((w) => w.receipts));
  return (
    <>
      <div className="a-head">
        <h1>Bosh sahifa</h1>
        <div className="row">
          {d.bot.running ? <Pill s="ok">Bot: @{d.bot.username}</Pill> : <Pill s="warn">Bot ulanmagan{d.bot.error ? `: ${d.bot.error}` : ''}</Pill>}
          <span className="muted">{dmy(d.today)}</span>
        </div>
      </div>
      <div className="a-stats">
        <div className="a-card a-stat"><div className="l">Bugungi savdo</div><div className="v">{fmt(d.sales.cash.sum + d.sales.installment.sum)}</div>
          <div className="s">naqd {d.sales.cash.count} ta · nasiya {d.sales.installment.count} ta</div></div>
        <div className="a-card a-stat"><div className="l">Bugungi tushum</div><div className="v accent">{fmt(d.receipts.total)}</div>
          <div className="s">naqd {fmt(d.receipts.cash)} · karta {fmt(d.receipts.card)}</div></div>
        <div className="a-card a-stat" style={{ cursor: 'pointer' }} onClick={() => nav('/admin/orders?status=new')}><div className="l">Yangi buyurtmalar</div><div className="v">{d.new_orders}</div><div className="s">tasdiqlash kutilmoqda</div></div>
        <div className="a-card a-stat"><div className="l">Portfel (qoldiq qarz)</div><div className="v">{fmt(d.portfolio.debt)}</div><div className="s">{d.portfolio.active} ta faol shartnoma</div></div>
        <div className="a-card a-stat" style={{ cursor: 'pointer' }} onClick={() => nav('/admin/debtors')}><div className="l">Kechikkan</div><div className="v" style={{ color: 'var(--bad)' }}>{fmt(d.portfolio.overdue_sum)}</div><div className="s">{d.portfolio.overdue_count} ta shartnoma</div></div>
      </div>
      <div className="a-grid2">
        <div className="a-card">
          <h3>Bugun to'lashi kerak ({d.due_today.length})</h3>
          {d.due_today.length ? (
            <table className="a-table"><tbody>
              {d.due_today.map((x) => (
                <tr key={x.order_id} className="click" onClick={() => nav(`/admin/orders/${x.order_id}`)}>
                  <td><b>{x.name}</b><div className="muted" style={{ fontSize: 12 }}>{x.phone} · {x.product}</div></td>
                  <td className="num"><b>{fmt(x.amount)}</b></td>
                </tr>
              ))}
            </tbody></table>
          ) : <div className="empty">Bugun to'lov yo'q</div>}
        </div>
        <div className="a-card">
          <h3>Kechikkanlar ({d.overdue.length})</h3>
          {d.overdue.length ? (
            <table className="a-table"><tbody>
              {d.overdue.slice(0, 8).map((x) => (
                <tr key={x.id} className="click" onClick={() => nav(`/admin/orders/${x.id}`)}>
                  <td><b>{x.name}</b> {x.bot_blocked ? <Pill s="bad">Bot bloklangan</Pill> : null}<div className="muted" style={{ fontSize: 12 }}>{x.phone} · {x.product}</div></td>
                  <td><Pill s="bad">{x.days} kun</Pill></td>
                  <td className="num"><b>{fmt(x.amount)}</b></td>
                </tr>
              ))}
            </tbody></table>
          ) : <div className="empty">Kechikkan to'lovlar yo'q 🎉</div>}
        </div>
      </div>
      <div className="a-card" style={{ marginTop: 16 }}>
        <h3>So'nggi 7 kun tushumi</h3>
        <div className="bars">
          {d.week.map((w) => (
            <div className="b" key={w.date} title={`${fmt(w.receipts)} so'm`}>
              <span style={{ fontSize: 10.5 }}>{w.receipts ? fmt(Math.round(w.receipts / 1000)) + 'k' : ''}</span>
              <div style={{ height: `${(w.receipts / max) * 100}%` }} />
              <span>{dmy(w.date).slice(0, 5)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ---------------- Mahsulotlar ---------------- */
const MONTHS = [3, 6, 9, 12];

function ProductForm({ product, categories, settings, onClose, onSaved }) {
  const [f, setF] = useState(() => product ? {
    ...product,
    colorsText: product.colors.join(', '),
  } : {
    name: '', description: '', specs: '', category_id: categories[0]?.id || null, price: '', stock: 1, installment_enabled: true,
    terms: settings.default_terms, min_down_pct: settings.min_down_pct, images: [], colorsText: '', storages: [],
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const termOf = (m) => f.terms.find((t) => t.months === m);
  const toggleTerm = (m) => set('terms', termOf(m) ? f.terms.filter((t) => t.months !== m)
    : [...f.terms, { months: m, markup: settings.default_terms.find((t) => t.months === m)?.markup || 0 }].sort((a, b) => a.months - b.months));

  const upload = async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    try {
      const r = await adminApi.upload(files);
      set('images', [...f.images, ...r.urls]);
    } catch (err) { toast(err.message, 'err'); }
    e.target.value = '';
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...f, colors: f.colorsText.split(',').map((x) => x.trim()).filter(Boolean) };
      const r = product ? await adminApi.put(`/products/${product.id}`, body) : await adminApi.post('/products', body);
      toast('Saqlandi ✓');
      onSaved(r);
    } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  };
  const price = Number(f.price) || 0;
  const ex = f.installment_enabled && price && f.terms.length ? f.terms.map((t) => ({ ...t, c: calcInstallment(price, t.months, Number(t.markup), minDown(price, f.min_down_pct)) })) : [];

  return (
    <div className="modal-bg" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2>{product ? 'Mahsulotni tahrirlash' : "Yangi mahsulot"}</h2>
        <div className="form-grid">
          <label className="fld" style={{ gridColumn: 'span 2' }}>Nomi<input className="inp" required value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
          <label className="fld">Kategoriya
            <select className="inp" value={f.category_id || ''} onChange={(e) => set('category_id', Number(e.target.value))}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="fld">Narx (so'm)<input className="inp" required type="number" min="0" step="1000" value={f.price} onChange={(e) => set('price', e.target.value)} />
            <span className="muted" style={{ fontWeight: 500 }}>≈ ${fmt(price / settings.usd_rate)}</span></label>
          <label className="fld">Ombordagi soni<input className="inp" type="number" min="0" value={f.stock} onChange={(e) => set('stock', e.target.value)} /></label>
          <label className="fld">Ranglar (vergul bilan)<input className="inp" value={f.colorsText} onChange={(e) => set('colorsText', e.target.value)} placeholder="Qora, Oq" /></label>
        </div>
        <label className="fld" style={{ marginTop: 14 }}>Tavsif<textarea className="inp" rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} /></label>
        <label className="fld" style={{ marginTop: 14 }}>Xususiyatlar (har qatorda bittasi — post va mahsulot sahifasida chiqadi)
          <textarea className="inp" rows={5} value={f.specs} onChange={(e) => set('specs', e.target.value)} placeholder={"Holati: 10/10\nXotira: 128GB\nBatareya 91%\nKafolat beriladi"} /></label>

        <div className="fld" style={{ marginTop: 14 }}>Xotira / variantlar (asosiy narxga qo'shimcha)</div>
        {f.storages.map((s, i) => (
          <div className="row" key={i} style={{ marginTop: 6 }}>
            <input className="inp" placeholder="256GB" value={s.label} onChange={(e) => set('storages', f.storages.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <input className="inp" type="number" placeholder="+ so'm" value={s.extra} onChange={(e) => set('storages', f.storages.map((x, j) => (j === i ? { ...x, extra: e.target.value } : x)))} />
            <button type="button" className="btn sm bad" onClick={() => set('storages', f.storages.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button>
          </div>
        ))}
        <button type="button" className="btn sm sec" style={{ marginTop: 8 }} onClick={() => set('storages', [...f.storages, { label: '', extra: 0 }])}><Icon name="plus" size={14} />Variant</button>

        <div className="fld" style={{ marginTop: 16 }}>Rasmlar</div>
        <div className="thumbs" style={{ marginTop: 6 }}>
          {f.images.map((u, i) => (
            <div className="t" key={u}><img src={u} alt="" /><button type="button" onClick={() => set('images', f.images.filter((x) => x !== u))}><Icon name="x" size={12} /></button>
              {i > 0 && <button type="button" style={{ left: -6, right: 'auto', background: 'var(--navy)' }} title="Asosiy qilish" onClick={() => set('images', [u, ...f.images.filter((x) => x !== u)])}><Icon name="left" size={12} /></button>}
            </div>
          ))}
          <label className="t" style={{ cursor: 'pointer', border: '2px dashed var(--line)' }}><Icon name="image" /><input type="file" accept="image/*" multiple hidden onChange={upload} /></label>
        </div>

        <div className="a-card" style={{ background: 'var(--bg-2)', marginTop: 16 }}>
          <label className="row" style={{ fontWeight: 700 }}><input type="checkbox" checked={f.installment_enabled} onChange={(e) => set('installment_enabled', e.target.checked)} /> Nasiyaga ruxsat</label>
          {f.installment_enabled && <>
            <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
              {MONTHS.map((m) => (
                <div key={m} className="row" style={{ background: '#fff', padding: '6px 10px', borderRadius: 12 }}>
                  <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={!!termOf(m)} onChange={() => toggleTerm(m)} /><b>{m} oy</b></label>
                  {termOf(m) && <><input className="inp" style={{ width: 70, height: 32 }} type="number" step="0.5" value={termOf(m).markup}
                    onChange={(e) => set('terms', f.terms.map((t) => (t.months === m ? { ...t, markup: e.target.value } : t)))} />%</>}
                </div>
              ))}
              <label className="row" style={{ gap: 6 }}>Min. boshlang'ich<input className="inp" style={{ width: 70, height: 32 }} type="number" value={f.min_down_pct} onChange={(e) => set('min_down_pct', e.target.value)} />%</label>
            </div>
            {ex.length > 0 && <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
              Minimal boshlang'ich ({fmt(minDown(price, f.min_down_pct))}) bilan oylik: {ex.map((t) => `${t.months} oy — ${fmt(t.c.monthly)}`).join(' · ')}
            </div>}
          </>}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
          <button type="button" className="btn sec" onClick={onClose}>Bekor</button>
          <button className="btn" disabled={busy}>Saqlash</button>
        </div>
      </form>
    </div>
  );
}

export function Products() {
  const { data, reload } = useAsync(() => Promise.all([adminApi.get('/products'), adminApi.get('/categories'), adminApi.get('/settings')]), []);
  const [edit, setEdit] = useState(null);
  const [cat, setCat] = useState('');
  const nav = useNavigate();
  if (!data) return <Loading />;
  const [products, categories, settings] = data;
  const list = products.filter((p) => !cat || p.category_id === Number(cat));
  const addCat = async () => {
    const name = prompt('Kategoriya nomi');
    if (name) { await adminApi.post('/categories', { name }); reload(); }
  };
  const del = async (p) => {
    if (!confirm(`"${p.name}" o'chirilsinmi?`)) return;
    await adminApi.del(`/products/${p.id}`);
    toast("O'chirildi");
    reload();
  };
  return (
    <>
      <div className="a-head">
        <h1>Mahsulotlar <span className="muted" style={{ fontSize: 16 }}>{products.length}</span></h1>
        <div className="row">
          <button className="btn sec" onClick={addCat}><Icon name="plus" size={16} />Kategoriya</button>
          <button className="btn" onClick={() => setEdit('new')}><Icon name="plus" size={16} />Mahsulot</button>
        </div>
      </div>
      <div className="a-tabs">
        <button className={!cat ? 'on' : ''} onClick={() => setCat('')}>Barchasi</button>
        {categories.map((c) => <button key={c.id} className={String(c.id) === cat ? 'on' : ''} onClick={() => setCat(String(c.id))}>{c.name} · {c.n}</button>)}
      </div>
      <div className="a-card a-scroll">
        <table className="a-table">
          <thead><tr><th /><th>Nomi</th><th>Kategoriya</th><th className="num">Narx</th><th className="num">≈ $</th><th className="num">Qoldiq</th><th>Nasiya</th><th /></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="click" onClick={() => setEdit(p)}>
                <td style={{ width: 54 }}>{p.images[0] && <img src={p.images[0]} alt="" style={{ width: 44, height: 44, objectFit: 'contain' }} />}</td>
                <td><b>{p.name}</b><div className="muted" style={{ fontSize: 12 }}>{p.storages.map((s) => s.label).join(' / ')}</div></td>
                <td>{p.category}</td>
                <td className="num"><b>{fmt(p.price)}</b></td>
                <td className="num muted">{fmt(p.usd)}</td>
                <td className="num">{p.stock > 0 ? p.stock : <Pill s="bad">Tugagan</Pill>}</td>
                <td>{p.installment_enabled ? <span style={{ fontSize: 12 }}>{p.terms.map((t) => `${t.months}oy ${t.markup}%`).join(', ')}</span> : <span className="muted">yo'q</span>}</td>
                <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn sm" onClick={() => nav(`/admin/broadcasts?product=${p.id}`)} title="E'lon qilish"><Icon name="megaphone" size={15} />E'lon</button>{' '}
                  <button className="btn sm bad" onClick={() => del(p)} title="O'chirish"><Icon name="trash" size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && <ProductForm product={edit === 'new' ? null : edit} categories={categories} settings={settings}
        onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      <p className="muted" style={{ fontSize: 12.5 }}>Dollar kursi: 1$ = {fmt(settings.usd_rate)} so'm (<Link to="/admin/settings">o'zgartirish</Link>). Kurs o'zgarsa faqat $ ko'rinishi yangilanadi.</p>
    </>
  );
}
