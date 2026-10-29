# Nasiya Miniapp

Apple mahsulotlarini Telegram miniapp orqali naqd yoki nasiyaga (3/6/9/12 oy) sotish, to'lovlarni kuzatish va eslatmalarni avtomatlashtirish tizimi.

- **Miniapp** (mijoz): katalog, nasiya kalkulyatori, savat, buyurtma, "Mening nasiyalarim"
- **Admin panel**: buyurtmalar, tasdiqlash va grafik, to'lovlar, qarzdorlar, mijozlar, chatlar, tarqatmalar, hisobotlar (Excel), sozlamalar, amallar tarixi
- **Telegram bot**: /start + kontakt, guruhga buyurtma kartasi, eslatmalar, kunlik hisobot, kanal e'loni, mijoz–admin chat

Texnologiyalar: Node.js 22 (Express, grammY, node-cron), SQLite (`node:sqlite`, o'rnatish shart emas), React + Vite.

## Ishga tushirish (lokal)

```bash
npm install
```

```bash
npm start
```

Keyin oching:

- Miniapp: http://localhost:3100/app
- Admin panel: http://localhost:3100/admin — login/parol `.env` faylidagi `ADMIN_LOGIN` / `ADMIN_PASSWORD` (birinchi kirishdan keyin Sozlamalardan o'zgartiring)

Brauzerda (Telegramsiz) miniapp "Demo Mijoz" sifatida ochiladi (`DEV_LOGIN=1`).

Ishlab chiqish rejimi (kod o'zgarsa avtomatik yangilanadi): `npm run dev`, so'ng http://localhost:5173/app va /admin.

## Demo ma'lumotlar

Birinchi ishga tushishda avtomatik qo'shiladi:

- 6 kategoriya (iPhone, MacBook, iPad, AirPods, Apple Watch, Aksessuarlar), har birida 5–6 tadan, jami 32 mahsulot
- 3 mijoz, 3 faol shartnoma (biri kechikkan, birida bugun to'lov kuni), 1 naqd savdo, 1 yangi buyurtma, chat xabarlari

Toza boshlash uchun serverni to'xtatib `data` papkasini o'chiring. Demo mijoz/shartnomalarsiz boshlash: `.env` da `SEED_DEMO=0`.

## Telegram botni ulash

1. @BotFather'dan token oling va `.env` dagi `BOT_TOKEN=` ga yozing, serverni qayta ishga tushiring.
2. Botga `/myid` yozing → olingan ID ni Admin panel → Sozlamalar → "Admin Telegram ID" ga kiriting.
3. Botni yopiq buyurtmalar guruhiga qo'shing va guruhda `/bindgroup` yuboring.
4. Botni kanalga post huquqi bilan admin qiling, Sozlamalarda kanal `@username` ini kiriting.
5. Miniapp Telegram ichida ochilishi uchun HTTPS manzil kerak. Lokal sinov uchun tunnel ishlating (masalan `ngrok http 3100`) va `.env` dagi `PUBLIC_URL` ni shu https manzilga o'zgartiring. BotFather'da `/newapp` bilan miniapp yaratsangiz, havolasini (`https://t.me/bot/app`) Sozlamalar → "Miniapp havolasi" ga yozing — kanal postidagi "Sotib olish" tugmasi mahsulotni to'g'ridan-to'g'ri ochadi.

Token bo'lmasa tizim to'liq ishlaydi, faqat Telegram xabarlari konsolga yoziladi.

## Nasiya formulasi

- Qoldiq = Narx − Boshlang'ich to'lov
- Jami nasiya = Qoldiq × (1 + Ustama %)
- Oylik = Jami ÷ Oylar, 1 000 so'mga yaxlitlanadi (pastga), farq oxirgi oyga qo'shiladi

Misol: 12 000 000 so'm, 6 oy, 20%, 30% boshlang'ich → oylik 1 680 000 so'm.

To'lov eng eski to'lanmagan oyga yoziladi; qisman va oldindan to'lov mumkin; bekor qilingan to'lov o'chirilmaydi. Jarima yo'q. Muddatidan oldin yopishda ustama qayta hisoblanmaydi.

## Kanal posti shabloni

Sozlamalar → "Kanal posti shabloni". O'zgaruvchilar: `{nomi} {xususiyatlar} {narx} {narx_usd} {nasiya} {kontaktlar} {kanal} {tavsif}`. Xususiyatlar har bir mahsulotning "Xususiyatlar" maydonidan (har qatorda bittasi) olinadi. Telefonlar, admin username va kanal havolasi alohida maydonlarda.

## Avtomatik vazifalar (Toshkent vaqti)

- Eslatmalar — har kuni sozlangan vaqtda (standart 10:00), kunlar: −3, 0, +1, +3, +7
- Kunlik hisobot — 08:00 da guruhga va adminga
- Zaxira nusxa — har kuni 03:00 da `data/backups/` ga (30 kun saqlanadi)

## Papkalar

```
server/      backend: db.js, services.js (nasiya logikasi), bot.js, jobs.js, reports.js, routes/
web/src/     frontend: miniapp/, admin/, styles.css
data/        SQLite baza, yuklangan rasmlar, zaxiralar (gitga kirmaydi)
```
