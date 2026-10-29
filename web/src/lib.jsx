import React from 'react';

export const fmt = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const dmy = (s) => (s ? s.slice(0, 10).split('-').reverse().join('.') : '');
export const dmyt = (s) => (s ? `${dmy(s)} ${s.slice(11, 16)}` : '');
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
export const minDown = (price, pct) => Math.ceil((price * pct) / 100 / 1000) * 1000;

// Server bilan bir xil formula
export function calcInstallment(price, months, markup, down) {
  const rest = Math.max(0, price - down);
  const total = Math.round(rest * (1 + markup / 100));
  const monthly = Math.floor(total / months / 1000) * 1000;
  const last = total - monthly * (months - 1);
  return { rest, total, monthly, last, grand: down + total, income: total - rest };
}
export function addMonths(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, lastDay));
  return t.toISOString().slice(0, 10);
}

export const STATUS = {
  new: 'Yangi', confirmed: 'Tasdiqlandi', shipping: "Yo'lda", delivered: 'Topshirildi',
  closed: 'Yopildi', rejected: 'Rad etildi', cancelled: 'Bekor qilindi',
};

const P = {
  menu: <><path d="M4 7h11" /><path d="M4 12h16" /><path d="M4 17h8" /><circle cx="19" cy="6" r="2" fill="currentColor" stroke="none" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  home: <><path d="M4 11 12 4l8 7" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></>,
  chat: <><path d="M5 5h14v10H9l-4 4z" /><path d="M9 9h6M9 12h4" /></>,
  bag: <><path d="M5 8h14l-1 12H6z" /><path d="M9 8a3 3 0 0 1 6 0" /><path d="M9.5 13a2.5 2.5 0 0 0 5 0" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 20c1.5-4 4.5-5 8-5s6.5 1 8 5" /></>,
  back: <path d="m14 6-6 6 6 6" />,
  left: <path d="m14 7-5 5 5 5" />,
  right: <path d="m10 7 5 5-5 5" />,
  down: <path d="m7 10 5 5 5-5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12 5 5 9-10" />,
  trash: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>,
  pin: <><path d="M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11z" /><circle cx="12" cy="10" r="2" /></>,
  card: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /></>,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>,
  file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>,
  alert: <><path d="M12 4 2.5 20h19z" /><path d="M12 10v4M12 17v.5" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 19c1-3.5 3.5-4.5 6.5-4.5s5.5 1 6.5 4.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .6 3 2 3.5 4.5" /></>,
  send: <path d="M4 12 20 4l-6 16-3-7z" />,
  chart: <><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-5M12 16V8M16 16v-3" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
  history: <><path d="M4 12a8 8 0 1 0 2.5-5.8" /><path d="M4 4v4h4" /><path d="M12 8v4l3 2" /></>,
  logout: <><path d="M15 4h4v16h-4" /><path d="M10 8l-4 4 4 4M6 12h10" /></>,
  phone: <path d="M6 3h3l2 5-2 1.5a11 11 0 0 0 5.5 5.5L16 13l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z" />,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13 7 4 4" /></>,
  image: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 8" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  download: <><path d="M12 4v11M7 10l5 5 5-5" /><path d="M5 20h14" /></>,
  megaphone: <><path d="M4 10v4h3l8 4V6L7 10z" /><path d="M18 9a4 4 0 0 1 0 6" /></>,
};
export function Icon({ name, size = 22, stroke = 2, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      {P[name]}
    </svg>
  );
}

export function useAsync(fn, deps = []) {
  const [state, set] = React.useState({ loading: true, data: null, error: null });
  const load = React.useCallback(() => {
    set((s) => ({ ...s, loading: true }));
    return Promise.resolve(fn()).then((data) => set({ loading: false, data, error: null }), (error) => set({ loading: false, data: null, error }));
  }, deps); // eslint-disable-line
  React.useEffect(() => { load(); }, [load]);
  return { ...state, reload: load, setData: (data) => set((s) => ({ ...s, data })) };
}

// Kichik bildirishnoma
let toastFn = null;
export function toast(msg, type = 'ok') { toastFn?.(msg, type); }
export function Toaster() {
  const [t, setT] = React.useState(null);
  React.useEffect(() => {
    toastFn = (msg, type) => { setT({ msg, type, id: Date.now() }); };
    return () => { toastFn = null; };
  }, []);
  React.useEffect(() => {
    if (!t) return;
    const id = setTimeout(() => setT(null), 3200);
    return () => clearTimeout(id);
  }, [t]);
  return t ? <div className={`toast toast-${t.type}`} key={t.id}>{t.msg}</div> : null;
}
