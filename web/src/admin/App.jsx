import React, { useEffect, useState } from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { adminApi, adminToken } from '../api.js';
import { Icon, Toaster, toast } from '../lib.jsx';
import { Dashboard, Products } from './pages1.jsx';
import { Orders, OrderDetail, Contracts, Debtors } from './orders.jsx';
import { Customers, CustomerDetail, Chats, Broadcasts, Reports, Settings, Audit } from './pages2.jsx';

function Login({ onDone }) {
  const [f, setF] = useState({ login: '', password: '', code: '' });
  const [challenge, setChallenge] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = challenge
        ? await adminApi.post('/login/verify', { challenge, code: f.code })
        : await adminApi.post('/login', { login: f.login, password: f.password });
      if (r.need_code) { setChallenge(r.challenge); toast('Kod Telegramga yuborildi'); return; }
      adminToken.set(r.token);
      onDone();
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="a-login">
      <form onSubmit={submit}>
        <div className="a-logo" style={{ padding: 0 }}><span className="mk"><Icon name="bag" size={20} /></span>Admin panel</div>
        {!challenge ? <>
          <label className="fld">Login<input className="inp" value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} autoFocus /></label>
          <label className="fld">Parol<input className="inp" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
        </> : (
          <label className="fld">Telegramga kelgan kod<input className="inp" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} autoFocus inputMode="numeric" /></label>
        )}
        <button className="btn" style={{ justifyContent: 'center', height: 46 }} disabled={busy}>Kirish</button>
      </form>
      <Toaster />
    </div>
  );
}

const MENU = [
  ['', 'grid', 'Bosh sahifa'],
  ['orders', 'bag', 'Buyurtmalar', 'new_orders'],
  ['contracts', 'file', 'Shartnomalar'],
  ['debtors', 'alert', 'Qarzdorlar'],
  ['products', 'box', 'Mahsulotlar'],
  ['customers', 'users', 'Mijozlar'],
  ['chats', 'chat', 'Chatlar', 'unread'],
  ['broadcasts', 'megaphone', 'Tarqatmalar'],
  ['reports', 'chart', 'Hisobotlar'],
  ['settings', 'gear', 'Sozlamalar'],
  ['audit', 'history', 'Amallar tarixi'],
];

export default function Admin() {
  const [authed, setAuthed] = useState(!!adminToken.get());
  const [counters, setCounters] = useState({});
  const nav = useNavigate();
  useEffect(() => {
    document.title = 'Admin panel';
    const off = () => setAuthed(false);
    window.addEventListener('admin-logout', off);
    return () => window.removeEventListener('admin-logout', off);
  }, []);
  useEffect(() => {
    if (!authed) return;
    const load = () => adminApi.get('/counters').then(setCounters, () => {});
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [authed]);
  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  const logout = async () => { await adminApi.post('/logout').catch(() => {}); adminToken.set(null); setAuthed(false); nav('/admin'); };

  return (
    <div className="a-shell">
      <aside className="a-side">
        <div className="a-logo"><span className="mk"><Icon name="bag" size={20} /></span>Nasiya admin</div>
        {MENU.map(([to, icon, label, cnt]) => (
          <NavLink key={to} to={`/admin${to ? '/' + to : ''}`} end={!to} className={({ isActive }) => `a-link ${isActive ? 'active' : ''}`}>
            <Icon name={icon} size={19} />{label}{cnt && counters[cnt] > 0 && <span className="cnt">{counters[cnt]}</span>}
          </NavLink>
        ))}
        <div className="grow" />
        <a className="a-link" href="/app" target="_blank" rel="noreferrer"><Icon name="phone" size={19} />Miniappni ochish</a>
        <button className="a-link" onClick={logout} style={{ width: '100%' }}><Icon name="logout" size={19} />Chiqish</button>
      </aside>
      <main className="a-main">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="contracts" element={<Contracts />} />
          <Route path="debtors" element={<Debtors />} />
          <Route path="products" element={<Products />} />
          <Route path="customers" element={<Customers />} />
          <Route path="customers/:id" element={<CustomerDetail />} />
          <Route path="chats" element={<Chats />} />
          <Route path="chats/:id" element={<Chats />} />
          <Route path="broadcasts" element={<Broadcasts />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="audit" element={<Audit />} />
        </Routes>
      </main>
      <Toaster />
    </div>
  );
}
