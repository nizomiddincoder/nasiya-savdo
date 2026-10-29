import { Bot, InputFile } from 'grammy';
import path from 'node:path';
import { q, getSettings, UPLOADS } from './db.js';

export const state = { bot: null, info: null, running: false, error: null };

export function createBot(token) {
  if (!token) return null;
  state.bot = new Bot(token);
  return state.bot;
}

export const publicUrl = () => (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3100}`).replace(/\/$/, '');
export const isHttps = () => publicUrl().startsWith('https://');
export const appUrl = (p = '') => `${publicUrl()}/app${p}`;

function isBlockedErr(e) {
  const c = e?.error_code ?? e?.description;
  return c === 403 || /blocked|deactivated|chat not found/i.test(e?.description || e?.message || '');
}

// Mijozga xabar. Bloklagan bo'lsa bot_blocked=1 qo'yiladi.
export async function sendCustomer(customerId, text, extra = {}) {
  const c = q.get('SELECT * FROM customers WHERE id=?', customerId);
  if (!c) return false;
  if (!state.bot) {
    console.log(`[tg:offline] -> ${c.full_name || c.first_name}: ${text.replace(/<[^>]+>/g, '').slice(0, 120)}`);
    return false;
  }
  try {
    await state.bot.api.sendMessage(c.tg_id, text, { parse_mode: 'HTML', ...extra });
    if (c.bot_blocked) q.run('UPDATE customers SET bot_blocked=0 WHERE id=?', c.id);
    return true;
  } catch (e) {
    if (isBlockedErr(e)) q.run('UPDATE customers SET bot_blocked=1 WHERE id=?', c.id);
    else console.error('[tg] sendCustomer', e.description || e.message);
    return false;
  }
}

export async function sendChat(chatId, text, extra = {}) {
  if (!chatId) return null;
  if (!state.bot) {
    console.log(`[tg:offline] -> chat ${chatId}: ${text.replace(/<[^>]+>/g, '').slice(0, 160)}`);
    return null;
  }
  try {
    return await state.bot.api.sendMessage(chatId, text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });
  } catch (e) {
    console.error('[tg] sendChat', chatId, e.description || e.message);
    return null;
  }
}

export async function editChat(chatId, msgId, text, extra = {}) {
  if (!state.bot || !chatId || !msgId) return;
  try {
    await state.bot.api.editMessageText(chatId, msgId, text, { parse_mode: 'HTML', ...extra });
  } catch (e) {
    if (!/not modified/.test(e.description || '')) console.error('[tg] edit', e.description || e.message);
  }
}

export const notifyAdmin = (text, extra) => sendChat(getSettings().admin_tg_id, text, extra);
export const sendGroup = (text, extra) => sendChat(getSettings().group_chat_id, text, extra);

// Rasm: lokal fayl (/uploads/..) yoki file_id. SVG Telegramda rasm sifatida ketmaydi.
export function photoInput(image) {
  if (!image) return null;
  if (image.startsWith('/uploads/')) {
    if (!/\.(jpe?g|png|webp)$/i.test(image)) return null;
    return new InputFile(path.join(UPLOADS, path.basename(image)));
  }
  return image;
}

export function webAppButton(text, pathPart = '') {
  return isHttps() ? { text, web_app: { url: appUrl(pathPart) } } : null;
}

export function productLink(productId) {
  const s = getSettings();
  if (s.miniapp_link) return `${s.miniapp_link.replace(/\/$/, '')}?startapp=p_${productId}`;
  if (state.info?.username) return `https://t.me/${state.info.username}?start=p_${productId}`;
  return appUrl(`/product/${productId}`);
}
