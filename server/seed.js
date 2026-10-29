import fs from 'node:fs';
import path from 'node:path';
import { q, getSettings, UPLOADS } from './db.js';
import * as U from './util.js';
import { createOrders, confirmOrder, addPayment, setStatus } from './services.js';

// Demo rasmlar: oddiy SVG illyustratsiyalar (admin keyin haqiqiy rasm yuklaydi)
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c * k)));
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, '0')).join('');
}
function svg(kind, color) {
  const d = shade(color, 0.72);
  const l = shade(color, 1.18);
  const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${l}"/><stop offset="1" stop-color="${d}"/></linearGradient>
  <radialGradient id="s"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>`;
  const shadow = '<ellipse cx="200" cy="370" rx="130" ry="16" fill="url(#s)"/>';
  const body = {
    phone: `<g transform="rotate(-12 200 200)"><rect x="128" y="40" width="150" height="310" rx="34" fill="url(#g)"/><rect x="128" y="40" width="150" height="310" rx="34" fill="none" stroke="${d}" stroke-width="4"/>
      <rect x="142" y="56" width="78" height="82" rx="22" fill="${d}" opacity=".55"/><circle cx="163" cy="78" r="15" fill="#1d2433"/><circle cx="163" cy="116" r="15" fill="#1d2433"/><circle cx="199" cy="97" r="15" fill="#1d2433"/>
      <circle cx="163" cy="78" r="6" fill="#3d5a80"/><circle cx="163" cy="116" r="6" fill="#3d5a80"/><circle cx="199" cy="97" r="6" fill="#3d5a80"/></g>`,
    laptop: `<rect x="70" y="80" width="260" height="175" rx="14" fill="#1d2433"/><rect x="80" y="90" width="240" height="155" rx="6" fill="url(#g)"/>
      <path d="M40 262 h320 l-18 30 h-284z" fill="${l}" stroke="${d}" stroke-width="3"/><rect x="170" y="262" width="60" height="8" rx="4" fill="${d}"/>`,
    tablet: `<g transform="rotate(-8 200 200)"><rect x="95" y="45" width="210" height="300" rx="26" fill="#1d2433"/><rect x="107" y="57" width="186" height="276" rx="16" fill="url(#g)"/><circle cx="200" cy="51" r="3" fill="#555"/></g>`,
    earbuds: `<rect x="110" y="150" width="180" height="150" rx="58" fill="#f4f6fa" stroke="#d5dbe6" stroke-width="4"/><line x1="112" y1="205" x2="288" y2="205" stroke="#d5dbe6" stroke-width="3"/>
      <circle cx="200" cy="250" r="5" fill="${color}"/><g fill="#fff" stroke="#d5dbe6" stroke-width="3"><ellipse cx="150" cy="105" rx="26" ry="30"/><rect x="140" y="110" width="16" height="60" rx="8"/><ellipse cx="250" cy="105" rx="26" ry="30"/><rect x="244" y="110" width="16" height="60" rx="8"/></g>`,
    watch: `<rect x="160" y="30" width="80" height="340" rx="30" fill="url(#g)"/><rect x="118" y="120" width="164" height="190" rx="46" fill="#1d2433"/><rect x="130" y="132" width="140" height="166" rx="36" fill="#0b0f19"/>
      <circle cx="200" cy="215" r="44" fill="none" stroke="${l}" stroke-width="10"/><circle cx="200" cy="215" r="28" fill="none" stroke="${color}" stroke-width="8" stroke-dasharray="120 60"/><rect x="282" y="175" width="10" height="34" rx="5" fill="${d}"/>`,
    case: `<g transform="rotate(-10 200 200)"><rect x="125" y="40" width="160" height="320" rx="38" fill="url(#g)"/><rect x="140" y="55" width="86" height="90" rx="24" fill="#fff" opacity=".85"/><circle cx="205" cy="230" r="34" fill="none" stroke="${d}" stroke-width="5" opacity=".5"/></g>`,
    charger: `<path d="M200 230 C 200 320, 330 300, 330 360" fill="none" stroke="#e8ecf2" stroke-width="12" stroke-linecap="round"/><circle cx="200" cy="180" r="110" fill="#f4f6fa" stroke="#d5dbe6" stroke-width="5"/><circle cx="200" cy="180" r="60" fill="none" stroke="${color}" stroke-width="10"/><circle cx="200" cy="180" r="20" fill="${color}"/>`,
    adapter: `<rect x="120" y="120" width="160" height="160" rx="30" fill="#f4f6fa" stroke="#d5dbe6" stroke-width="5"/><rect x="160" y="70" width="18" height="55" rx="6" fill="#b9c1cf"/><rect x="222" y="70" width="18" height="55" rx="6" fill="#b9c1cf"/><rect x="178" y="225" width="44" height="16" rx="8" fill="${color}"/>`,
  }[kind];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">${defs}${shadow}${body}</svg>`;
}
function image(slug, kind, color) {
  const file = `seed-${slug}.svg`;
  fs.writeFileSync(path.join(UPLOADS, file), svg(kind, color));
  return `/uploads/${file}`;
}

const NO = [];
const C = {
  iphone: 'iPhone', mac: 'MacBook', ipad: 'iPad', airpods: 'AirPods', watch: 'Apple Watch', acc: 'Aksessuarlar',
};

// [kategoriya, nomi, narx (so'm), ombor, rasm turi, rang(lar), xotiralar, xususiyatlar, tavsif]
const PRODUCTS = [
  ['iphone', 'iPhone 17 Pro Max', 19900000, 6, 'phone', ['#e8772e', '#2c4a7a', '#d9dce1'], [['256GB', 0], ['512GB', 3000000], ['1TB', 6500000]],
    "Holati: Yangi\nXotira: 256GB\nRo'yxatdan o'tgan\nKafolat: 1 yil", "Eng kuchli iPhone: A19 Pro chip, 48MP uchlik kamera, titan-alyuminiy korpus va eng uzun batareya."],
  ['iphone', 'iPhone 17 Pro', 17400000, 5, 'phone', ['#2c4a7a', '#e8772e', '#d9dce1'], [['256GB', 0], ['512GB', 3000000]],
    "Holati: Yangi\nXotira: 256GB\nRo'yxatdan o'tgan\nKafolat: 1 yil", "Pro darajadagi kamera va ProMotion 120Hz displey ixcham korpusda."],
  ['iphone', 'iPhone 17', 12000000, 8, 'phone', ['#9aa7c7', '#c9e0c8', '#1f2330'], [['256GB', 0], ['512GB', 2800000]],
    "Holati: Yangi\nXotira: 256GB\nRo'yxatdan o'tgan\nKafolat: 1 yil", "120Hz ProMotion displey, 48MP kamera va kun bo'yi yetadigan batareya."],
  ['iphone', 'iPhone 16 Pro Max', 11000000, 3, 'phone', ['#c7b299', '#3a3a3c'], [['128GB', 0], ['256GB', 1300000]],
    "Holati: 10/10\nXotira: 128GB\nRo'yxatdan o'tgan\nKaropkasi yo'q\nBatareya 91%\nKafolat beriladi", "Ishlatilgan, ideal holatda. Batareya sig'imi 91%."],
  ['iphone', 'iPhone 16', 9200000, 7, 'phone', ['#5b7bd5', '#f2b5c8', '#1f2330'], [['128GB', 0], ['256GB', 1300000]],
    "Holati: Yangi\nXotira: 128GB\nRo'yxatdan o'tgan\nKafolat: 1 yil", "Camera Control tugmasi, A18 chip va Apple Intelligence."],
  ['iphone', 'iPhone 15', 7600000, 0, 'phone', ['#f5d9a8', '#1f2330'], [['128GB', 0]],
    "Holati: Yangi\nXotira: 128GB\nKafolat: 1 yil", "Dynamic Island va USB‑C bilan qulay iPhone."],

  ['mac', 'MacBook Air 13" M4', 15900000, 4, 'laptop', ['#9cc3e6', '#d9dce1'], [['16/256GB', 0], ['16/512GB', 2600000]],
    'Holati: Yangi\nProtsessor: Apple M4\nRAM: 16GB\nKafolat: 1 yil', "Yupqa, yengil va 18 soatgacha batareya. O'qish va ish uchun ideal."],
  ['mac', 'MacBook Air 15" M4', 19500000, 3, 'laptop', ['#2b3a55', '#d9dce1'], [['16/256GB', 0], ['24/512GB', 4500000]],
    'Holati: Yangi\nProtsessor: Apple M4\nRAM: 16GB\nKafolat: 1 yil', '15 dyuymli katta Liquid Retina displey, olti dinamikli ovoz tizimi.'],
  ['mac', 'MacBook Pro 14" M5', 24500000, 2, 'laptop', ['#3a3a3c', '#d9dce1'], [['16/512GB', 0], ['24/1TB', 6400000]],
    'Holati: Yangi\nProtsessor: Apple M5\nRAM: 16GB\nKafolat: 1 yil', 'Professional ishlar uchun: XDR displey, kuchli grafika va sovutish.'],
  ['mac', 'MacBook Pro 16" M4 Pro', 38900000, 1, 'laptop', ['#1f2330', '#d9dce1'], [['24/512GB', 0]],
    'Holati: Yangi\nProtsessor: Apple M4 Pro\nRAM: 24GB\nKafolat: 1 yil', 'Video montaj va 3D uchun eng katta ekranli MacBook.'],
  ['mac', 'MacBook Air 13" M2', 10900000, 5, 'laptop', ['#c7b299', '#d9dce1'], [['8/256GB', 0]],
    'Holati: Yangi\nProtsessor: Apple M2\nRAM: 8GB\nKafolat: 1 yil', 'Arzon narxdagi ishonchli MacBook.'],

  ['ipad', 'iPad Pro 11" M5', 14800000, 3, 'tablet', ['#3a3a3c', '#d9dce1'], [['256GB', 0], ['512GB', 2600000]],
    'Holati: Yangi\nDispley: Ultra Retina XDR\nKafolat: 1 yil', 'Eng yupqa va kuchli iPad, OLED displey.'],
  ['ipad', 'iPad Air 11" M3', 8900000, 4, 'tablet', ['#8fa8d8', '#b9a7d6'], [['128GB', 0], ['256GB', 1400000]],
    'Holati: Yangi\nProtsessor: Apple M3\nKafolat: 1 yil', "O'qish va ijod uchun kuchli va yengil planshet."],
  ['ipad', 'iPad 11" A16', 5600000, 6, 'tablet', ['#f2c94c', '#7fb3e6', '#f2b5c8'], [['128GB', 0], ['256GB', 1300000]],
    'Holati: Yangi\nProtsessor: A16\nKafolat: 1 yil', 'Kundalik foydalanish uchun rangli va qulay iPad.'],
  ['ipad', 'iPad mini 7', 6900000, 4, 'tablet', ['#b9a7d6', '#3a3a3c'], [['128GB', 0], ['256GB', 1300000]],
    'Holati: Yangi\nProtsessor: A17 Pro\nKafolat: 1 yil', "Cho'ntakka sig'adigan kuchli iPad, Apple Pencil Pro bilan."],
  ['ipad', 'iPad Pro 13" M5', 19900000, 2, 'tablet', ['#3a3a3c', '#d9dce1'], [['256GB', 0], ['1TB', 7800000]],
    'Holati: Yangi\nDispley: 13" Ultra Retina XDR\nKafolat: 1 yil', 'Katta ekranli professional planshet.'],

  ['airpods', 'AirPods Pro 3', 3400000, 10, 'earbuds', ['#19c6d3'], NO,
    "Holati: Yangi\nShovqinni bekor qilish (ANC)\nYurak urishi sensori\nKafolat: 1 yil", "Yangi avlod ANC va yurak urishini o'lchash funksiyasi."],
  ['airpods', 'AirPods 4 ANC', 2400000, 12, 'earbuds', ['#5b7bd5'], NO,
    'Holati: Yangi\nShovqinni bekor qilish (ANC)\nKafolat: 1 yil', 'Ochiq dizayn va faol shovqinni bekor qilish.'],
  ['airpods', 'AirPods 4', 1900000, 15, 'earbuds', ['#9aa7c7'], NO,
    'Holati: Yangi\nUSB‑C quvvatlash\nKafolat: 1 yil', 'Qulay va yengil simsiz quloqchinlar.'],
  ['airpods', 'AirPods Max (USB‑C)', 7900000, 3, 'earbuds', ['#e8772e'], NO,
    'Holati: Yangi\nShovqinni bekor qilish (ANC)\nKafolat: 1 yil', "To'liq o'lchamli premium naushniklar."],
  ['airpods', 'AirPods Pro 2', 2700000, 0, 'earbuds', ['#19c6d3'], NO,
    'Holati: Yangi\nKafolat: 1 yil', 'Mashhur Pro quloqchinlar, MagSafe g‘ilof.'],

  ['watch', 'Apple Watch Series 11', 5600000, 6, 'watch', ['#f06b8a', '#1f2330', '#d9dce1'], [['42mm', 0], ['46mm', 500000]],
    'Holati: Yangi\nGPS\nKafolat: 1 yil', "Sog'liq va sport uchun eng mashhur Apple Watch."],
  ['watch', 'Apple Watch Ultra 3', 10900000, 3, 'watch', ['#e8772e', '#1f2330'], [['49mm', 0]],
    'Holati: Yangi\nGPS + Cellular\nTitan korpus\nKafolat: 1 yil', 'Ekstremal sport va sayohatlar uchun titan soat.'],
  ['watch', 'Apple Watch SE 3', 3500000, 8, 'watch', ['#c9e0c8', '#1f2330'], [['40mm', 0], ['44mm', 400000]],
    'Holati: Yangi\nGPS\nKafolat: 1 yil', 'Asosiy funksiyalar hamyonbop narxda.'],
  ['watch', 'Apple Watch Series 10', 4700000, 4, 'watch', ['#5b7bd5', '#d9dce1'], [['42mm', 0], ['46mm', 500000]],
    'Holati: Yangi\nGPS\nKafolat: 1 yil', 'Eng yupqa Apple Watch, katta displey.'],
  ['watch', 'Apple Watch Ultra 2', 9200000, 2, 'watch', ['#1f2330'], [['49mm', 0]],
    'Holati: Yangi\nGPS + Cellular\nKafolat: 1 yil', 'Qora titan, 36 soatgacha batareya.'],

  ['acc', 'MagSafe Charger 25W', 650000, 20, 'charger', ['#19c6d3'], NO, 'Holati: Yangi\nOriginal', 'iPhone uchun tez simsiz quvvatlagich.', false],
  ['acc', 'iPhone 17 Pro Silicone Case', 450000, 25, 'case', ['#f06b8a', '#5b7bd5', '#c9e0c8'], NO, 'Holati: Yangi\nMagSafe bilan\nOriginal', "Yumshoq silikon g'ilof, MagSafe qo'llab-quvvatlaydi.", false],
  ['acc', 'USB‑C 20W Power Adapter', 290000, 40, 'adapter', ['#19c6d3'], NO, 'Holati: Yangi\nOriginal', 'iPhone va iPad uchun tez quvvatlagich.', false],
  ['acc', 'Apple Pencil Pro', 1750000, 6, 'adapter', ['#d9dce1'], NO, 'Holati: Yangi\nOriginal\nKafolat: 1 yil', 'iPad uchun bosimga sezgir qalam.', true],
  ['acc', 'AirTag (4 dona)', 1350000, 10, 'charger', ['#d9dce1'], NO, 'Holati: Yangi\nOriginal', 'Kalit, sumka va buyumlarni topish uchun.', false],
  ['acc', 'MagSafe Battery Pack', 1250000, 0, 'case', ['#f4f6fa'], NO, 'Holati: Yangi\nOriginal', "iPhone uchun magnitli qo'shimcha batareya.", false],
];

export function seedIfEmpty() {
  if (q.get('SELECT COUNT(*) n FROM products').n > 0) return;
  console.log('[seed] demo ma\'lumotlar qo\'shilmoqda...');
  const s = getSettings();
  const catId = {};
  Object.entries(C).forEach(([k, name], i) => {
    catId[k] = Number(q.run('INSERT INTO categories(name,sort) VALUES(?,?)', name, i).lastInsertRowid);
  });
  const now = U.nowStr();
  PRODUCTS.forEach(([cat, name, price, stock, kind, colors, storages, specs, desc, inst = true], i) => {
    const slug = `${i + 1}`;
    const images = colors.slice(0, 3).map((c, j) => image(`${slug}-${j}`, kind, c));
    const colorNames = { '#e8772e': "To'q sariq", '#2c4a7a': "To'q ko'k", '#d9dce1': 'Kumush', '#9aa7c7': 'Lavanda', '#c9e0c8': 'Yalpiz', '#1f2330': 'Qora',
      '#c7b299': 'Desert', '#3a3a3c': 'Kulrang', '#5b7bd5': 'Ultramarin', '#f2b5c8': 'Pushti', '#f5d9a8': 'Sariq', '#9cc3e6': 'Osmon',
      '#2b3a55': 'Yarim tun', '#8fa8d8': "Ko'k", '#b9a7d6': 'Binafsha', '#f2c94c': 'Sariq', '#7fb3e6': "Ko'k", '#f06b8a': 'Pushti', '#19c6d3': 'Oq', '#f4f6fa': 'Oq' };
    q.run(`INSERT INTO products(name,description,specs,category_id,price,stock,installment_enabled,terms,min_down_pct,images,colors,storages,active,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?)`,
    name, desc, specs, catId[cat], price, stock, inst ? 1 : 0, JSON.stringify(inst ? s.default_terms : []), s.min_down_pct,
    JSON.stringify(images), JSON.stringify(colors.length > 1 ? colors.map((c) => colorNames[c] || c) : []),
    JSON.stringify(storages.map(([label, extra]) => ({ label, extra }))), now);
  });

  if (process.env.SEED_DEMO === '0') return;
  const cust = (tg_id, full_name, phone) => {
    const id = Number(q.run('INSERT INTO customers(tg_id,first_name,full_name,phone,created_at,last_seen) VALUES(?,?,?,?,?,?)',
      tg_id, full_name.split(' ')[0], full_name, phone, now, now).lastInsertRowid);
    return q.get('SELECT * FROM customers WHERE id=?', id);
  };
  const aziz = cust(900000101, 'Aziz Karimov', '+998 90 123 45 67');
  const dilnoza = cust(900000102, 'Dilnoza Rahimova', '+998 93 765 43 21');
  const bobur = cust(900000103, 'Bobur Toshmatov', '+998 97 111 22 33');
  const pid = (name) => q.get('SELECT id FROM products WHERE name=?', name).id;
  const at = (days) => `${U.addDays(U.today(), -days)} 12:00:00`;
  const opt = (days) => ({ silent: true, at: at(days) });
  const base = { delivery_method: 'pickup' };

  // 1) 75 kun oldin: iPhone 17, 6 oy, 30% boshlang'ich -> 2-oy kechikkan
  let [o1] = createOrders(aziz, { ...base, full_name: aziz.full_name, phone: aziz.phone,
    items: [{ product_id: pid('iPhone 17'), mode: 'installment', months: 6, down: 3600000, storage: '256GB', color: 'Lavanda' }] }, opt(75));
  confirmOrder(o1, { imei: '356789104512345', method: 'cash' }, opt(75));
  setStatus(o1, 'delivered');
  addPayment(o1, { amount: 1680000, method: 'card' }, opt(44));

  // 2) 20 kun oldin: MacBook Air, 12 oy
  const [o2] = createOrders(dilnoza, { delivery_method: 'delivery', address: 'Yunusobod 4-kvartal, 12-uy', full_name: dilnoza.full_name, phone: dilnoza.phone,
    items: [{ product_id: pid('MacBook Air 13" M4'), mode: 'installment', months: 12, down: 4000000, storage: '16/256GB', color: 'Osmon' }] }, opt(20));
  confirmOrder(o2, { imei: 'C02XK1ABCD12', method: 'card' }, opt(20));
  setStatus(o2, 'delivered');

  // 3) 32 kun oldin: Apple Watch, 3 oy — bugun to'lov kuni
  const [o3] = createOrders(bobur, { ...base, full_name: bobur.full_name, phone: bobur.phone,
    items: [{ product_id: pid('Apple Watch Series 11'), mode: 'installment', months: 3, down: 1200000, storage: '42mm', color: 'Qora' }] }, opt(32));
  confirmOrder(o3, { imei: 'GW11-55667788', method: 'cash' }, opt(32));
  setStatus(o3, 'delivered');
  const s3 = q.get('SELECT id FROM schedule WHERE order_id=? AND idx=1', o3);
  q.run('UPDATE schedule SET due_date=? WHERE id=?', U.today(), s3.id);

  // 4) Kecha: naqd savdo
  const [o4] = createOrders(bobur, { ...base, full_name: bobur.full_name, phone: bobur.phone,
    items: [{ product_id: pid('AirPods Pro 3'), mode: 'cash', qty: 1 }, { product_id: pid('USB‑C 20W Power Adapter'), mode: 'cash', qty: 1 }] }, opt(1));
  confirmOrder(o4, { method: 'cash' }, opt(1));

  // 5) Yangi buyurtma — tasdiqlash kutilmoqda
  createOrders(dilnoza, { ...base, full_name: dilnoza.full_name, phone: dilnoza.phone, comment: 'Ertaga kechqurun olib ketaman',
    items: [{ product_id: pid('iPhone 17 Pro'), mode: 'installment', months: 12, down: 5000000, storage: '256GB', color: "To'q ko'k" }] }, { silent: true });

  q.run("INSERT INTO messages(customer_id,direction,kind,text,is_read,created_at) VALUES(?,'in','text',?,0,?)", aziz.id, "Assalomu alaykum, to'lovni ertaga qilsam bo'ladimi?", at(0));
  q.run("INSERT INTO messages(customer_id,direction,kind,text,is_read,created_at) VALUES(?,'in','text',?,1,?)", dilnoza.id, 'MacBook qachon yetib keladi?', at(19));
  q.run("INSERT INTO messages(customer_id,direction,kind,text,is_read,created_at) VALUES(?,'out','text',?,1,?)", dilnoza.id, 'Bugun kechqurun kuryer olib boradi.', at(19));
  // Demo ma'lumotlar audit tarixini to'ldirmasin
  q.run('DELETE FROM audit_log');
}
