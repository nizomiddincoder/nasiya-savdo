import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { appApi } from '../api.js';
import { Icon, Toaster, toast } from '../lib.jsx';
import { Home, Product, Cart, Checkout, Success, Cabinet, Favorites } from './pages.jsx';

const Ctx = createContext(null);
export const useShop = () => useContext(Ctx);
const tg = window.Telegram?.WebApp;

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

export default function MiniApp() {
  const nav = useNavigate();
  const [boot, setBoot] = useState(null);
  const [error, setError] = useState(null);
  const [cart, setCart] = useState(() => load('cart', []));
  const [favs, setFavs] = useState(() => load('favs', []));

  useEffect(() => {
    document.title = 'Do‘kon';
    if (tg) {
      tg.ready();
      tg.expand();
      try { tg.setHeaderColor('#d6eef9'); tg.setBackgroundColor('#d6eef9'); } catch { /* old clients */ }
    }
    appApi.get('/bootstrap').then((b) => {
      setBoot(b);
      document.title = b.settings.shop_name;
      const sp = tg?.initDataUnsafe?.start_param;
      if (sp && /^p_\d+$/.test(sp)) nav(`/app/product/${sp.slice(2)}`, { replace: true });
    }, setError);
  }, []); // eslint-disable-line

  useEffect(() => save('cart', cart), [cart]);
  useEffect(() => save('favs', favs), [favs]);

  const value = useMemo(() => ({
    boot, setBoot, cart, favs,
    rate: boot?.settings.usd_rate || 0,
    addToCart: (item) => {
      setCart((c) => {
        if (item.mode === 'cash') {
          const ex = c.find((x) => x.mode === 'cash' && x.product_id === item.product_id && x.color === item.color && x.storage === item.storage);
          if (ex) return c.map((x) => (x === ex ? { ...x, qty: x.qty + 1 } : x));
        }
        return [...c, { ...item, key: Date.now() + Math.random() }];
      });
      toast("Savatga qo'shildi ✓");
      tg?.HapticFeedback?.notificationOccurred('success');
    },
    updateCart: (key, patch) => setCart((c) => c.map((x) => (x.key === key ? { ...x, ...patch } : x))),
    removeFromCart: (key) => setCart((c) => c.filter((x) => x.key !== key)),
    clearCart: () => setCart([]),
    toggleFav: (id) => setFavs((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id])),
    openChat: () => {
      const u = boot?.bot_username;
      if (!u) return toast("Menejer bilan bog'lanish: botga xabar yozing", 'ok');
      const link = `https://t.me/${u}`;
      if (tg?.openTelegramLink && tg.initData) tg.openTelegramLink(link);
      else window.open(link, '_blank');
    },
  }), [boot, cart, favs]);

  if (error) return <div className="m-shell"><div className="empty" style={{ paddingTop: 120 }}>{error.message}<br /><br /><button className="m-btn" onClick={() => location.reload()}>Qayta urinish</button></div></div>;
  if (!boot) return <div className="loader-page"><div className="spinner" /></div>;

  return (
    <Ctx.Provider value={value}>
      <div className="m-shell">
        <Routes>
          <Route index element={<Home />} />
          <Route path="product/:id" element={<Product />} />
          <Route path="cart" element={<Cart />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="success" element={<Success />} />
          <Route path="cabinet" element={<Cabinet />} />
          <Route path="favorites" element={<Favorites />} />
        </Routes>
        <BottomNav />
        <Toaster />
      </div>
    </Ctx.Provider>
  );
}

function BottomNav() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const { cart, favs, openChat } = useShop();
  if (/\/(product|checkout)/.test(pathname)) return null;
  const items = [
    ['home', '/app'], ['chat', null], ['heart', '/app/favorites'], ['bag', '/app/cart'], ['user', '/app/cabinet'],
  ];
  return (
    <nav className="m-nav">
      <div className="m-nav-in">
        {items.map(([icon, to]) => (
          <button key={icon} className={to && (pathname === to || (to !== '/app' && pathname.startsWith(to))) ? 'on' : ''}
            onClick={() => (to ? nav(to) : openChat())} aria-label={icon}>
            <Icon name={icon} size={24} />
            {icon === 'bag' && cart.length > 0 && <span className="dot">{cart.length}</span>}
            {icon === 'heart' && favs.length > 0 && <span className="dot">{favs.length}</span>}
          </button>
        ))}
      </div>
    </nav>
  );
}
