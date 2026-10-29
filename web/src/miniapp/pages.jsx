import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { appApi } from '../api.js';
import { Icon, fmt, dmy, calcInstallment, minDown, useAsync, toast, STATUS } from '../lib.jsx';
import { useShop } from './App.jsx';

const usd = (som, rate) => (rate ? fmt(Math.round(som / rate)) : '—');
const tg = window.Telegram?.WebApp;

function Avatar() {
  const { boot } = useShop();
  const nav = useNavigate();
  const u = tg?.initDataUnsafe?.user;
  const name = boot.me.full_name || boot.me.first_name || 'M';
  return (
    <button className="m-avatar" onClick={() => nav('/app/cabinet')} aria-label="Kabinet">
      {u?.photo_url ? <img src={u.photo_url} alt="" /> : name[0].toUpperCase()}
    </button>
  );
}

function Heart({ id }) {
  const { favs, toggleFav } = useShop();
  const on = favs.includes(id);
  return (
    <button className={`m-heart ${on ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); toggleFav(id); }} aria-label="Sevimli">
      <Icon name="heart" size={20} />
    </button>
  );
}

function ProductCard({ p }) {
  const nav = useNavigate();
  const { rate } = useShop();
  return (
    <div className="m-card" onClick={() => nav(`/app/product/${p.id}`)} role="button">
      <div className="price">{fmt(p.price)} <small>so'm</small></div>
      <div className="usd">≈ ${usd(p.price, rate)}</div>
      <Heart id={p.id} />
      <div className="img">{p.images[0] && <img src={p.images[0]} alt={p.name} loading="lazy" />}</div>
      <div className="name">{p.name}</div>
      {p.from_monthly && <span className="m-badge">oyiga {fmt(p.from_monthly)} so'mdan</span>}
      {p.stock <= 0 && <div className="m-out"><span>Tugagan</span></div>}
    </div>
  );
}

/* ---------------- Katalog ---------------- */
export function Home() {
  const { boot } = useShop();
  const [cat, setCat] = useState(() => sessionStorage.getItem('cat') || '');
  const [qText, setQText] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => { try { sessionStorage.setItem('cat', cat); } catch { /* */ } }, [cat]);
  useEffect(() => { const t = setTimeout(() => setSearch(qText.trim()), 300); return () => clearTimeout(t); }, [qText]);
  const { data, loading } = useAsync(() => appApi.get(`/products?category=${cat}&q=${encodeURIComponent(search)}`), [cat, search]);

  return (
    <div className="m-page">
      <div className="m-top">
        <div className="row" style={{ gap: 8 }}>
          <span className="m-iconbtn" style={{ width: 'auto' }}><Icon name="menu" size={26} /></span>
          <b style={{ fontSize: 15 }}>{boot.settings.shop_name}</b>
        </div>
        <Avatar />
      </div>
      <form className="m-search" onSubmit={(e) => { e.preventDefault(); setSearch(qText.trim()); }}>
        <input placeholder="Mahsulot qidirish" value={qText} onChange={(e) => setQText(e.target.value)} />
        <button type="submit" aria-label="Qidirish"><Icon name="search" size={20} /></button>
      </form>
      <h1 className="m-h1">Kategoriyalar</h1>
      <div className="m-tabs">
        <button className={`m-tab ${!cat ? 'on' : ''}`} onClick={() => setCat('')}>Barchasi</button>
        {boot.categories.map((c) => (
          <button key={c.id} className={`m-tab ${String(c.id) === String(cat) ? 'on' : ''}`} onClick={() => setCat(String(c.id))}>{c.name}</button>
        ))}
      </div>
      {loading && !data ? <div className="loader-page" style={{ minHeight: 200 }}><div className="spinner" /></div>
        : !data?.length ? <div className="empty">Hech narsa topilmadi</div>
          : <div className="m-grid">{data.map((p) => <ProductCard key={p.id} p={p} />)}</div>}
    </div>
  );
}

export function Favorites() {
  const { favs } = useShop();
  const { data } = useAsync(() => (favs.length ? appApi.get(`/products?ids=${favs.join(',')}`) : []), [favs.join(',')]);
  return (
    <div className="m-page">
      <div className="m-top"><h1 className="m-h1" style={{ margin: 0, fontSize: 24 }}>Sevimlilar</h1><Avatar /></div>
      {!favs.length ? <div className="empty">Yoqqan mahsulotlarga ♥ bosing — ular shu yerda saqlanadi</div>
        : <div className="m-grid">{(data || []).map((p) => <ProductCard key={p.id} p={p} />)}</div>}
    </div>
  );
}

/* ---------------- Mahsulot ---------------- */
export function Product() {
  const { id } = useParams();
  const nav = useNavigate();
  const { rate, addToCart } = useShop();
  const { data: p, error } = useAsync(() => appApi.get(`/products/${id}`), [id]);
  const [img, setImg] = useState(0);
  const [color, setColor] = useState(null);
  const [storage, setStorage] = useState(null);
  const [mode, setMode] = useState('cash');
  const [months, setMonths] = useState(null);
  const [down, setDown] = useState(0);

  useEffect(() => {
    if (!p) return;
    setColor(p.colors[0] || null);
    setStorage(p.storages[0]?.label || null);
    if (p.installment_enabled && p.terms.length) {
      setMonths(p.terms[Math.min(1, p.terms.length - 1)].months);
      setMode('installment');
    }
  }, [p]);

  const price = useMemo(() => (p ? p.price + (Number(p.storages.find((s) => s.label === storage)?.extra) || 0) : 0), [p, storage]);
  const min = p ? minDown(price, p.min_down_pct) : 0;
  const max = Math.floor((price * 0.9) / 1000) * 1000;
  useEffect(() => { setDown(min); }, [min]);
  useEffect(() => { if (p && p.colors.length > 1) setImg(Math.max(0, Math.min(p.colors.indexOf(color), p.images.length - 1))); }, [color]); // eslint-disable-line

  if (error) return <div className="m-page"><button className="m-iconbtn solid" onClick={() => nav(-1)}><Icon name="back" /></button><div className="empty">{error.message}</div></div>;
  if (!p) return <div className="loader-page"><div className="spinner" /></div>;

  const term = p.terms.find((t) => t.months === months);
  const calc = mode === 'installment' && term ? calcInstallment(price, months, term.markup, down) : null;
  const out = p.stock <= 0;
  const specs = String(p.specs || '').split('\n').map((s) => s.replace(/^•\s*/, '').trim()).filter(Boolean);

  return (
    <div style={{ background: 'var(--bg)' }}>
      <div className="m-detail-top">
        <div className="m-top">
          <button className="m-iconbtn solid" onClick={() => (history.length > 1 ? nav(-1) : nav('/app'))} aria-label="Orqaga"><Icon name="back" /></button>
          <Avatar />
        </div>
        <div className="m-brand">Apple · {p.category}</div>
        <h1 className="m-title">{p.name}</h1>
        <div className="m-sub">{p.stock > 0 ? `Omborda: ${p.stock} dona` : 'Hozircha tugagan'}</div>
        <div className="m-pricerow">
          <span className="p">{fmt(price)} so'm</span>
          <span className="u">≈ ${usd(price, rate)}</span>
          <span className="grow" />
          <span style={{ position: 'relative', width: 32, height: 32 }}><Heart id={p.id} /></span>
        </div>
        <div className="m-gallery">
          <button className="arrow" disabled={img === 0} onClick={() => setImg(img - 1)} aria-label="Oldingi"><Icon name="left" size={18} stroke={2.5} /></button>
          <div className="stage">{p.images[img] && <img src={p.images[img]} alt={p.name} />}</div>
          <button className="arrow" disabled={img >= p.images.length - 1} onClick={() => setImg(img + 1)} aria-label="Keyingi"><Icon name="right" size={18} stroke={2.5} /></button>
        </div>
        {p.images.length > 1 && <div className="m-dots">{p.images.map((_, i) => <span key={i} className={i === img ? 'on' : ''} />)}</div>}
      </div>

      <div className="m-panel">
        <h2 className="m-h2">Tavsif</h2>
        {p.description && <p className="m-desc">{p.description}</p>}
        {specs.length > 0 && (
          <ul className="m-specs">{specs.map((s) => <li key={s}><Icon name="right" size={16} stroke={3} />{s}</li>)}</ul>
        )}

        {p.colors.length > 0 && <>
          <div className="m-label">Rang</div>
          <div className="m-chips">{p.colors.map((c) => <button key={c} className={`m-chip ${c === color ? 'on' : ''}`} onClick={() => setColor(c)}>{c}</button>)}</div>
        </>}
        {p.storages.length > 0 && <>
          <div className="m-label">Variant / xotira</div>
          <div className="m-chips">{p.storages.map((s) => (
            <button key={s.label} className={`m-chip ${s.label === storage ? 'on' : ''}`} onClick={() => setStorage(s.label)}>
              {s.label}<small>{s.extra ? `+${fmt(s.extra)}` : 'asosiy'}</small>
            </button>
          ))}</div>
        </>}

        <div className="m-label">To'lov turi</div>
        <div className="m-seg">
          <button className={mode === 'cash' ? 'on' : ''} onClick={() => setMode('cash')}>Naqd</button>
          <button className={mode === 'installment' ? 'on' : ''} disabled={!p.installment_enabled || !p.terms.length} onClick={() => setMode('installment')}>
            Nasiya
          </button>
        </div>
        {!p.installment_enabled && <div className="m-note">Bu mahsulot faqat naqd sotiladi</div>}

        {calc && (
          <div className="m-calc">
            <div className="m-label" style={{ marginTop: 0 }}>Muddat</div>
            <div className="months">
              {p.terms.map((t) => (
                <button key={t.months} className={t.months === months ? 'on' : ''} onClick={() => setMonths(t.months)}>
                  {t.months} oy<small>+{t.markup}%</small>
                </button>
              ))}
            </div>
            <div className="m-label">Boshlang'ich to'lov</div>
            <div className="m-kv"><span className="muted">min {p.min_down_pct}% · {fmt(min)}</span><b>{fmt(down)} so'm</b></div>
            <input className="m-range" type="range" min={min} max={max} step={100000} value={down}
              onChange={(e) => setDown(Math.max(min, Math.round(Number(e.target.value) / 1000) * 1000))} />
            <div className="m-kv" style={{ marginTop: 8 }}><span className="muted">Oylik to'lov</span><span className="m-big">{fmt(calc.monthly)} so'm</span></div>
            {calc.last !== calc.monthly && <div className="m-kv"><span className="muted">Oxirgi oy</span><span>{fmt(calc.last)} so'm</span></div>}
            <div className="m-kv"><span className="muted">Nasiya summasi ({months} oy)</span><b>{fmt(calc.total)} so'm</b></div>
            <div className="m-kv"><span className="muted">Jami (boshlang'ich bilan)</span><b>{fmt(calc.grand)} so'm</b></div>
          </div>
        )}
        {calc && <div className="m-note">Summa taxminiy, yakuniy shartlarni menejer tasdiqlaydi</div>}
      </div>

      <div className="m-cta">
        <button className="m-btn" disabled={out}
          onClick={() => addToCart({
            product_id: p.id, name: p.name, image: p.images[0], color, storage, price, qty: 1, mode,
            months: calc ? months : null, markup: term?.markup, down: calc ? down : null, monthly: calc?.monthly,
          })}>
          {out ? 'Tugagan' : "Savatga qo'shish"} <Icon name="bag" size={20} />
        </button>
      </div>
    </div>
  );
}

/* ---------------- Savat ---------------- */
export function Cart() {
  const nav = useNavigate();
  const { cart, updateCart, removeFromCart } = useShop();
  const cash = cart.filter((x) => x.mode === 'cash');
  const inst = cart.filter((x) => x.mode === 'installment');
  const cashTotal = cash.reduce((a, x) => a + x.price * x.qty, 0);
  const downTotal = inst.reduce((a, x) => a + x.down, 0);

  const Item = ({ x }) => (
    <div className="m-item">
      <div className="thumb">{x.image && <img src={x.image} alt="" />}</div>
      <div className="grow">
        <div className="t">{x.name}</div>
        <div className="s">{[x.storage, x.color].filter(Boolean).join(' · ')}</div>
        {x.mode === 'cash'
          ? <div className="accent" style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}>{fmt(x.price * x.qty)} so'm</div>
          : <div className="s" style={{ color: 'var(--navy)' }}>{x.months} oy · oyiga <b className="accent">{fmt(x.monthly)}</b> · boshl. {fmt(x.down)}</div>}
      </div>
      {x.mode === 'cash' ? (
        <div className="m-qty">
          <button onClick={() => (x.qty > 1 ? updateCart(x.key, { qty: x.qty - 1 }) : removeFromCart(x.key))}><Icon name={x.qty > 1 ? 'minus' : 'trash'} size={15} /></button>
          <b style={{ minWidth: 14, textAlign: 'center', fontSize: 14 }}>{x.qty}</b>
          <button onClick={() => updateCart(x.key, { qty: x.qty + 1 })}><Icon name="plus" size={15} /></button>
        </div>
      ) : <button className="m-iconbtn" onClick={() => removeFromCart(x.key)} aria-label="O'chirish"><Icon name="trash" size={19} /></button>}
    </div>
  );

  return (
    <div className="m-page">
      <div className="m-top"><h1 className="m-h1" style={{ margin: 0, fontSize: 24 }}>Savat</h1><Avatar /></div>
      {!cart.length ? (
        <div className="empty"><Icon name="bag" size={48} /><br /><br />Savat bo'sh<br /><br /><button className="m-btn" onClick={() => nav('/app')}>Katalogga o'tish</button></div>
      ) : <>
        {cash.length > 0 && (
          <div className="m-section">
            <div className="row between"><b>💵 Naqd buyurtma</b><span className="m-pill">1 buyurtma</span></div>
            {cash.map((x) => <Item key={x.key} x={x} />)}
            <div className="m-kv" style={{ marginTop: 6 }}><span className="muted">Jami</span><b className="accent">{fmt(cashTotal)} so'm</b></div>
          </div>
        )}
        {inst.length > 0 && (
          <div className="m-section">
            <div className="row between"><b>💳 Nasiya</b><span className="m-pill">{inst.length} ta shartnoma</span></div>
            <div className="s muted" style={{ fontSize: 12, marginTop: 4 }}>Har bir nasiya mahsuloti alohida grafik bilan rasmiylashtiriladi</div>
            {inst.map((x) => <Item key={x.key} x={x} />)}
            <div className="m-kv" style={{ marginTop: 6 }}><span className="muted">Boshlang'ich to'lovlar</span><b className="accent">{fmt(downTotal)} so'm</b></div>
          </div>
        )}
        <div style={{ marginTop: 20 }}>
          <button className="m-btn" onClick={() => nav('/app/checkout')}>Rasmiylashtirish <Icon name="right" size={20} /></button>
        </div>
      </>}
    </div>
  );
}

/* ---------------- Rasmiylashtirish ---------------- */
export function Checkout() {
  const nav = useNavigate();
  const { boot, setBoot, cart, clearCart } = useShop();
  const me = boot.me;
  const [f, setF] = useState({
    full_name: me.full_name || [me.first_name, me.last_name].filter(Boolean).join(' '),
    phone: me.phone || '', delivery_method: 'pickup', address: '', comment: '', lat: null, lng: null,
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const requestPhone = () => {
    if (tg?.requestContact) {
      tg.requestContact((ok, res) => {
        const phone = res?.responseUnsafe?.contact?.phone_number;
        if (ok && phone) setF((x) => ({ ...x, phone: phone.startsWith('+') ? phone : '+' + phone }));
      });
    }
  };
  const getLocation = () => {
    if (!navigator.geolocation) return toast('Lokatsiya mavjud emas', 'err');
    navigator.geolocation.getCurrentPosition(
      (p) => { setF((x) => ({ ...x, lat: p.coords.latitude, lng: p.coords.longitude })); toast('Lokatsiya olindi ✓'); },
      () => toast("Lokatsiyaga ruxsat berilmadi", 'err'),
    );
  };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await appApi.post('/orders', {
        ...f,
        items: cart.map((x) => ({ product_id: x.product_id, color: x.color, storage: x.storage, qty: x.qty, mode: x.mode, months: x.months, down: x.down })),
      });
      clearCart();
      setBoot({ ...boot, me: { ...me, full_name: f.full_name, phone: f.phone } });
      tg?.HapticFeedback?.notificationOccurred('success');
      nav('/app/success', { replace: true, state: { ids: r.ids } });
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  if (!cart.length) return <div className="m-page"><div className="empty">Savat bo'sh</div></div>;
  const hasInst = cart.some((x) => x.mode === 'installment');
  return (
    <form className="m-page" onSubmit={submit} style={{ paddingBottom: 120 }}>
      <div className="m-top">
        <button type="button" className="m-iconbtn solid" onClick={() => nav(-1)} aria-label="Orqaga"><Icon name="back" /></button>
        <b style={{ fontSize: 17 }}>Rasmiylashtirish</b>
        <span style={{ width: 40 }} />
      </div>
      <div className="m-section">
        <label className="m-field"><span>Ism-familiya</span><input className="m-input" required value={f.full_name} onChange={set('full_name')} /></label>
        <label className="m-field"><span>Telefon</span>
          <div className="row">
            <input className="m-input" required value={f.phone} onChange={set('phone')} placeholder="+998 __ ___ __ __" inputMode="tel" />
            {tg?.initData && !f.phone && <button type="button" className="m-chip" onClick={requestPhone}>Ulashish</button>}
          </div>
        </label>
      </div>
      <div className="m-section">
        <div className="m-label" style={{ marginTop: 0 }}>Olish usuli</div>
        <div className="m-seg">
          <button type="button" className={f.delivery_method === 'pickup' ? 'on' : ''} onClick={() => setF({ ...f, delivery_method: 'pickup' })}>Olib ketish</button>
          <button type="button" className={f.delivery_method === 'delivery' ? 'on' : ''} onClick={() => setF({ ...f, delivery_method: 'delivery' })}>Yetkazib berish</button>
        </div>
        {f.delivery_method === 'pickup' ? (
          <div className="m-kv" style={{ marginTop: 10, alignItems: 'flex-start', gap: 8, justifyContent: 'flex-start' }}>
            <Icon name="pin" size={18} className="accent" /><span>{boot.settings.shop_address}<br /><span className="muted">{boot.settings.work_hours}</span></span>
          </div>
        ) : <>
          <label className="m-field"><span>Manzil</span><textarea className="m-input" value={f.address} onChange={set('address')} placeholder="Tuman, ko'cha, uy, mo'ljal" /></label>
          <button type="button" className="m-btn ghost" style={{ height: 46, marginTop: 10, fontSize: 14 }} onClick={getLocation}>
            <Icon name="pin" size={18} /> {f.lat ? `Lokatsiya: ${f.lat.toFixed(4)}, ${f.lng.toFixed(4)}` : 'Lokatsiyani yuborish'}
          </button>
        </>}
        <label className="m-field"><span>Izoh (ixtiyoriy)</span><textarea className="m-input" value={f.comment} onChange={set('comment')} /></label>
      </div>
      {hasInst && <div className="m-warn">Summa taxminiy, yakuniy shartlarni menejer tasdiqlaydi. Nasiya uchun pasport talab qilinadi.</div>}
      <div className="m-cta" style={{ background: 'linear-gradient(transparent, var(--bg) 30%)' }}>
        <button className="m-btn" disabled={busy}>{busy ? 'Yuborilmoqda...' : 'Buyurtma berish'} <Icon name="check" size={20} /></button>
      </div>
    </form>
  );
}

export function Success() {
  const nav = useNavigate();
  const ids = useLocation().state?.ids || [];
  return (
    <div className="m-page">
      <div className="m-success">
        <div className="ic"><Icon name="check" size={42} stroke={3} /></div>
        <h1 className="m-h1" style={{ margin: '0 0 8px' }}>Rahmat!</h1>
        <p className="muted" style={{ lineHeight: 1.5 }}>
          Buyurtma{ids.length > 1 ? 'lar' : ''} {ids.map((i) => `#${i}`).join(', ')} qabul qilindi.<br />Menejer tez orada bog'lanadi. Holatni botda va kabinetda kuzatishingiz mumkin.
        </p>
      </div>
      <button className="m-btn" onClick={() => nav('/app/cabinet', { replace: true })}>Buyurtmalarim</button>
      <button className="m-btn ghost" style={{ marginTop: 10 }} onClick={() => nav('/app', { replace: true })}>Katalogga qaytish</button>
    </div>
  );
}

/* ---------------- Kabinet: nasiyalar va buyurtmalar ---------------- */
const pillCls = (s) => ({ new: 'new', rejected: 'bad', cancelled: 'bad', closed: 'ok', shipping: 'warn' }[s] || '');

function ContractCard({ o }) {
  const [open, setOpen] = useState(false);
  const s = o.summary;
  const pct = s ? Math.round((s.paid / s.schedule_total) * 100) : 0;
  const it = o.items[0];
  return (
    <div className="m-section">
      <div className="m-item" style={{ padding: 0, border: 0 }}>
        <div className="thumb">{it?.image && <img src={it.image} alt="" />}</div>
        <div className="grow">
          <div className="t">{it?.name} {it?.storage}</div>
          <div className="s">Shartnoma #{o.id} · {o.months} oy</div>
        </div>
        <span className={`m-pill ${pillCls(o.status)}`}>{STATUS[o.status]}</span>
      </div>
      {s ? <>
        <div className="m-progress"><div style={{ width: `${pct}%` }} /></div>
        <div className="m-kv"><span className="muted">To'langan</span><b>{fmt(s.paid)} / {fmt(s.schedule_total)}</b></div>
        <div className="m-kv"><span className="muted">Qolgan</span><b className="accent">{fmt(s.remaining)} so'm</b></div>
        {s.next && <div className="m-kv"><span className="muted">Keyingi to'lov</span><b>{dmy(s.next.date)} · {fmt(s.next.amount)}</b></div>}
        {s.overdue_amount > 0 && <div className="m-kv"><span className="m-pill bad">Kechikkan {s.overdue_days} kun</span><b style={{ color: 'var(--bad)' }}>{fmt(s.overdue_amount)} so'm</b></div>}
        <button className="m-chip" style={{ width: '100%', marginTop: 8 }} onClick={() => setOpen(!open)}>{open ? 'Grafikni yopish' : "To'lov grafigi"}</button>
        {open && (
          <div className="m-sched">
            {o.schedule.map((r) => (
              <div className="r" key={r.id}>
                <span>{r.idx}. {dmy(r.due_date)}</span>
                <span className="row" style={{ gap: 8 }}>
                  <b>{fmt(r.amount)}</b>
                  {r.status === 'paid' ? <span className="m-pill ok">to'langan</span>
                    : r.status === 'partial' ? <span className="m-pill warn">qisman</span>
                      : r.status === 'overdue' ? <span className="m-pill bad">kechikkan</span> : <span className="m-pill">kutilmoqda</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </> : (
        <div className="m-kv" style={{ marginTop: 8 }}><span className="muted">Taxminiy oylik</span><b>{fmt(o.monthly)} so'm</b></div>
      )}
    </div>
  );
}

export function Cabinet() {
  const { boot, openChat } = useShop();
  const [tab, setTab] = useState('contracts');
  const { data, loading } = useAsync(() => appApi.get('/orders'), []);
  const contracts = (data || []).filter((o) => o.type === 'installment' && o.schedule);
  const orders = data || [];
  const debt = contracts.filter((o) => o.status !== 'closed').reduce((a, o) => a + o.summary.remaining, 0);

  return (
    <div className="m-page">
      <div className="m-top"><h1 className="m-h1" style={{ margin: 0, fontSize: 24 }}>Kabinet</h1><Avatar /></div>
      <div className="m-section" style={{ background: 'var(--navy)', color: '#fff' }}>
        <div style={{ fontSize: 13, opacity: 0.7 }}>{boot.me.full_name || boot.me.first_name} · {boot.me.phone || 'telefon kiritilmagan'}</div>
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 12 }}>Jami qoldiq qarz</div>
        <div style={{ fontSize: 28, fontWeight: 800, marginTop: 2 }}>{fmt(debt)} so'm</div>
        <button className="m-btn" style={{ height: 46, marginTop: 14, fontSize: 14 }} onClick={openChat}><Icon name="chat" size={18} /> Menejerga yozish</button>
      </div>
      <div className="m-seg" style={{ marginTop: 16 }}>
        <button className={tab === 'contracts' ? 'on' : ''} onClick={() => setTab('contracts')}>Nasiyalarim</button>
        <button className={tab === 'orders' ? 'on' : ''} onClick={() => setTab('orders')}>Buyurtmalarim</button>
      </div>
      {loading && !data ? <div className="loader-page" style={{ minHeight: 160 }}><div className="spinner" /></div>
        : tab === 'contracts' ? (contracts.length ? contracts.map((o) => <ContractCard key={o.id} o={o} />) : <div className="empty">Faol nasiya shartnomalari yo'q</div>)
          : orders.length ? orders.map((o) => (
            <div className="m-section" key={o.id}>
              <div className="row between">
                <b>#{o.id} · {o.type === 'cash' ? 'Naqd' : `Nasiya ${o.months} oy`}</b>
                <span className={`m-pill ${pillCls(o.status)}`}>{STATUS[o.status]}</span>
              </div>
              {o.items.map((i) => <div key={i.id} className="m-kv"><span>{i.name} {i.storage}{i.qty > 1 ? ` ×${i.qty}` : ''}</span><span className="muted">{fmt(i.price * i.qty)}</span></div>)}
              <div className="m-kv"><span className="muted">{dmy(o.created_at)}</span>
                <b className="accent">{o.type === 'cash' ? `${fmt(o.total)} so'm` : `oyiga ${fmt(o.monthly)} so'm`}</b></div>
              {o.reject_reason && <div className="muted" style={{ fontSize: 12 }}>Izoh: {o.reject_reason}</div>}
            </div>
          )) : <div className="empty">Hali buyurtma yo'q</div>}
    </div>
  );
}
