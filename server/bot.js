import { q, getSettings, setSetting } from './db.js';
import * as U from './util.js';
import * as tg from './tg.js';
import { confirmOrder, setStatus } from './services.js';

export function upsertCustomer(u) {
  const now = U.nowStr();
  const ex = q.get('SELECT * FROM customers WHERE tg_id=?', u.id);
  if (ex) {
    q.run('UPDATE customers SET first_name=?, last_name=?, username=?, photo_url=COALESCE(?, photo_url), last_seen=?, bot_blocked=0 WHERE id=?',
      u.first_name || null, u.last_name || null, u.username || null, u.photo_url || null, now, ex.id);
    return q.get('SELECT * FROM customers WHERE id=?', ex.id);
  }
  const full = [u.first_name, u.last_name].filter(Boolean).join(' ');
  const id = q.run('INSERT INTO customers(tg_id,first_name,last_name,username,full_name,photo_url,created_at,last_seen) VALUES(?,?,?,?,?,?,?,?)',
    u.id, u.first_name || null, u.last_name || null, u.username || null, full || null, u.photo_url || null, now, now).lastInsertRowid;
  return q.get('SELECT * FROM customers WHERE id=?', id);
}

function shopKeyboard(path = '') {
  const b = tg.webAppButton("🛍 Do'konni ochish", path);
  return b ? { inline_keyboard: [[b]] } : undefined;
}
function shopText(path = '') {
  return tg.isHttps() ? '' : `\n\nDo'kon: ${tg.appUrl(path)}`;
}

export function setupBot(bot) {
  const isAdmin = (ctx) => {
    const a = String(getSettings().admin_tg_id || '');
    return !a || a === String(ctx.from?.id);
  };

  bot.command('start', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    const c = upsertCustomer(ctx.from);
    const arg = ctx.match || '';
    const path = /^p_\d+$/.test(arg) ? `/product/${arg.slice(2)}` : '';
    if (!c.phone) {
      await ctx.reply(`Assalomu alaykum, ${U.esc(ctx.from.first_name)}! 👋\n${U.esc(getSettings().shop_name)} ga xush kelibsiz.\n\nBuyurtma berish uchun telefon raqamingizni yuboring:`, {
        parse_mode: 'HTML',
        reply_markup: { keyboard: [[{ text: '📱 Kontaktni ulashish', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true },
      });
      if (path) q.run('UPDATE customers SET last_seen=? WHERE id=?', U.nowStr(), c.id);
      return;
    }
    await ctx.reply(`Apple mahsulotlarini naqd yoki nasiyaga xarid qiling 🍏${shopText(path)}\n\nSavollar bo'lsa, shu yerga yozing — menejer javob beradi.`, {
      reply_markup: shopKeyboard(path),
    });
  });

  bot.on('message:contact', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    const ct = ctx.message.contact;
    if (ct.user_id && ct.user_id !== ctx.from.id) return ctx.reply("Iltimos, o'zingizning kontaktingizni yuboring.");
    const c = upsertCustomer(ctx.from);
    const phone = ct.phone_number.startsWith('+') ? ct.phone_number : '+' + ct.phone_number;
    q.run('UPDATE customers SET phone=? WHERE id=?', phone, c.id);
    await ctx.reply('Rahmat! Raqamingiz saqlandi ✅', { reply_markup: { remove_keyboard: true } });
    await ctx.reply(`Endi do'konni ochishingiz mumkin 👇${shopText()}`, { reply_markup: shopKeyboard() });
  });

  bot.command('myid', (ctx) => ctx.reply(`Chat ID: <code>${ctx.chat.id}</code>`, { parse_mode: 'HTML' }));

  bot.command('bindgroup', async (ctx) => {
    if (ctx.chat.type === 'private') return ctx.reply('Bu buyruqni buyurtmalar guruhida yuboring.');
    if (!isAdmin(ctx)) return;
    setSetting('group_chat_id', String(ctx.chat.id));
    await ctx.reply('✅ Bu guruh buyurtmalar guruhi sifatida ulandi. Yangi buyurtmalar va kunlik hisobot shu yerga keladi.');
  });

  bot.command('reklama', async (ctx) => {
    const c = upsertCustomer(ctx.from);
    const off = c.ads_off ? 0 : 1;
    q.run('UPDATE customers SET ads_off=? WHERE id=?', off, c.id);
    await ctx.reply(off ? "🔕 Reklama xabarlari o'chirildi. To'lov eslatmalari kelishda davom etadi." : '🔔 Reklama xabarlari yoqildi.');
  });

  bot.on('callback_query:data', async (ctx) => {
    const d = ctx.callbackQuery.data;
    try {
      if (d === 'ads:off') {
        const c = upsertCustomer(ctx.from);
        q.run('UPDATE customers SET ads_off=1 WHERE id=?', c.id);
        return ctx.answerCallbackQuery({ text: "Reklama o'chirildi. Eslatmalar kelishda davom etadi. Qayta yoqish: /reklama", show_alert: true });
      }
      const m = d.match(/^ord:(acc|rej):(\d+)$/);
      if (m) {
        const id = Number(m[2]);
        if (m[1] === 'acc') confirmOrder(id, {});
        else setStatus(id, 'rejected', 'Guruhdan rad etildi');
        return ctx.answerCallbackQuery({ text: m[1] === 'acc' ? 'Tasdiqlandi ✅' : 'Rad etildi' });
      }
      await ctx.answerCallbackQuery();
    } catch (e) {
      await ctx.answerCallbackQuery({ text: e.message, show_alert: true });
    }
  });

  bot.on('my_chat_member', (ctx) => {
    if (ctx.chat.type !== 'private') return;
    const st = ctx.myChatMember.new_chat_member.status;
    q.run('UPDATE customers SET bot_blocked=? WHERE tg_id=?', st === 'kicked' ? 1 : 0, ctx.from.id);
  });

  // Mijoz xabarlari -> admin paneldagi Chatlar
  bot.on('message', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    const m = ctx.message;
    if (m.text?.startsWith('/')) return;
    const c = upsertCustomer(ctx.from);
    let kind = 'text', text = m.text || m.caption || '', file = null;
    if (m.photo) { kind = 'photo'; file = m.photo.at(-1).file_id; }
    else if (m.voice) { kind = 'voice'; file = m.voice.file_id; }
    else if (m.video_note) { kind = 'video'; file = m.video_note.file_id; }
    else if (m.document) { kind = 'document'; file = m.document.file_id; text = text || m.document.file_name; }
    else if (m.location) { kind = 'location'; text = `${m.location.latitude},${m.location.longitude}`; }
    else if (!m.text) { kind = 'other'; text = '[qo\'llab-quvvatlanmaydigan xabar]'; }
    q.run("INSERT INTO messages(customer_id,direction,kind,text,file_id,created_at) VALUES(?,'in',?,?,?,?)", c.id, kind, text, file, U.nowStr());
    const preview = kind === 'text' ? text.slice(0, 100) : `[${kind}] ${text.slice(0, 60)}`;
    tg.notifyAdmin(`💬 <b>${U.esc(c.full_name || c.first_name)}</b>: ${U.esc(preview)}`);
  });

  bot.catch((e) => console.error('[bot]', e.error?.description || e.error?.message || e.message));
}

export async function startBot() {
  const bot = tg.createBot(process.env.BOT_TOKEN);
  if (!bot) {
    console.log("[bot] BOT_TOKEN yo'q — tizim botsiz ishlaydi (xabarlar konsolga yoziladi).");
    return;
  }
  setupBot(bot);
  try {
    tg.state.info = await bot.api.getMe();
    await bot.api.setMyCommands([
      { command: 'start', description: "Do'konni ochish" },
      { command: 'reklama', description: "Reklamani o'chirish/yoqish" },
    ]);
    if (tg.isHttps()) await bot.api.setChatMenuButton({ menu_button: { type: 'web_app', text: "Do'kon", web_app: { url: tg.appUrl() } } });
    bot.start({ allowed_updates: ['message', 'callback_query', 'my_chat_member'], onStart: () => { tg.state.running = true; console.log(`[bot] @${tg.state.info.username} ishga tushdi`); } })
      .catch((e) => { tg.state.running = false; tg.state.error = e.message; console.error('[bot] stop:', e.message); });
  } catch (e) {
    tg.state.error = e.description || e.message;
    tg.state.bot = null;
    console.error('[bot] ulanmadi:', tg.state.error);
  }
}
