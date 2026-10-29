import cron from 'node-cron';
import path from 'node:path';
import fs from 'node:fs';
import { db, q, getSettings, BACKUPS } from './db.js';
import * as U from './util.js';
import * as tg from './tg.js';
import { contracts } from './services.js';
import { dailyReport, dailyReportText } from './reports.js';

// Bir kunda bir marta ishlashi uchun belgi
function once(job, date) {
  try {
    q.run('INSERT INTO job_runs(job, run_on) VALUES(?,?)', job, date);
    return true;
  } catch {
    return false;
  }
}

/* ---------------- Eslatmalar ---------------- */
export async function runReminders() {
  const s = getSettings();
  const t = U.today();
  let sent = 0;
  for (const c of contracts()) {
    if (c.status === 'closed' || c.reminders_paused || c.bot_blocked) continue;
    const days = (() => { try { return JSON.parse(c.reminder_days) || s.reminder_days; } catch { return s.reminder_days; } })();
    for (const r of c.schedule) {
      if (r.remaining <= 0) continue;
      const offset = U.diffDays(t, r.due_date);
      if (!days.includes(offset)) continue;
      if (q.get('SELECT 1 FROM reminders_sent WHERE schedule_id=? AND offset_days=?', r.id, offset)) continue;
      const tpl = offset < 0 ? s.tpl_before : offset === 0 ? s.tpl_due : s.tpl_overdue;
      const text = U.fillTpl(tpl, {
        ism: U.esc(c.c_name || ''), summa: U.fmt(r.remaining), sana: U.dmy(r.due_date), qoldiq: U.fmt(c.summary.remaining),
      });
      const ok = await tg.sendCustomer(c.customer_id, text);
      q.run('INSERT OR IGNORE INTO reminders_sent(order_id,schedule_id,offset_days,sent_on) VALUES(?,?,?,?)', c.id, r.id, offset, t);
      if (ok) sent++;
      await U.sleep(50);
    }
  }
  console.log(`[jobs] eslatmalar yuborildi: ${sent}`);
  return sent;
}

/* ---------------- Kunlik hisobot ---------------- */
export async function sendDailyReport() {
  const text = dailyReportText(dailyReport());
  const s = getSettings();
  await tg.sendChat(s.group_chat_id, text);
  if (String(s.admin_tg_id) !== String(s.group_chat_id)) await tg.sendChat(s.admin_tg_id, text);
  return text;
}

/* ---------------- Zaxira nusxa ---------------- */
export function backup() {
  const file = path.join(BACKUPS, `nasiya-${U.today()}.db`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  // 30 kundan eskilarini o'chirish
  const files = fs.readdirSync(BACKUPS).filter((f) => f.endsWith('.db')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - 30))) fs.unlinkSync(path.join(BACKUPS, f));
  console.log('[jobs] backup:', file);
  return file;
}

/* ---------------- Tarqatma ---------------- */
const running = new Set();
export async function runBroadcast(id) {
  if (running.has(id)) return;
  running.add(id);
  const b = q.get('SELECT * FROM broadcasts WHERE id=?', id);
  const s = getSettings();
  const kb = (withAdsOff) => ({
    inline_keyboard: [
      [{ text: '🛍 Sotib olish', url: b.button_url }],
      ...(withAdsOff ? [[{ text: "🔕 Reklamani o'chirish", callback_data: 'ads:off' }]] : []),
    ],
  });
  let photo = tg.photoInput(b.image);
  const send = async (chatId, withAdsOff) => {
    if (photo) {
      const m = await tg.state.bot.api.sendPhoto(chatId, photo, { caption: b.text.slice(0, 1024), reply_markup: kb(withAdsOff) });
      if (typeof photo !== 'string') photo = m.photo.at(-1).file_id; // keyingilarga file_id
    } else {
      await tg.state.bot.api.sendMessage(chatId, b.text, { reply_markup: kb(withAdsOff), link_preview_options: { is_disabled: true } });
    }
  };
  try {
    q.run("UPDATE broadcasts SET status='running' WHERE id=?", id);
    if (!tg.state.bot) throw new Error("Bot ulanmagan (BOT_TOKEN yo'q)");
    if (b.target !== 'subscribers') {
      try {
        if (!s.channel_id) throw new Error('Kanal ulanmagan');
        await send(s.channel_id, false);
        q.run("UPDATE broadcasts SET channel_status='ok' WHERE id=?", id);
      } catch (e) {
        q.run('UPDATE broadcasts SET channel_status=? WHERE id=?', 'Xato: ' + (e.description || e.message), id);
      }
    }
    if (b.target !== 'channel') {
      const list = q.all('SELECT id, tg_id FROM customers WHERE bot_blocked=0 AND ads_off=0 AND tg_id < 900000000');
      q.run('UPDATE broadcasts SET total=? WHERE id=?', list.length, id);
      let delivered = 0, blocked = 0, failed = 0;
      for (const [i, c] of list.entries()) {
        try {
          await send(c.tg_id, true);
          delivered++;
        } catch (e) {
          if (e.error_code === 429) { await U.sleep((e.parameters?.retry_after || 3) * 1000); }
          if (e.error_code === 403) { blocked++; q.run('UPDATE customers SET bot_blocked=1 WHERE id=?', c.id); } else failed++;
        }
        if (i % 10 === 0 || i === list.length - 1) q.run('UPDATE broadcasts SET delivered=?, blocked=?, failed=? WHERE id=?', delivered, blocked, failed, id);
        await U.sleep(40); // ~25 xabar/sek
      }
    }
    q.run("UPDATE broadcasts SET status='done', finished_at=? WHERE id=?", U.nowStr(), id);
  } catch (e) {
    q.run("UPDATE broadcasts SET status='error', channel_status=COALESCE(channel_status, ?), finished_at=? WHERE id=?", e.message, U.nowStr(), id);
  } finally {
    running.delete(id);
  }
}

export function startJobs() {
  cron.schedule('* * * * *', async () => {
    const s = getSettings();
    const now = U.hhmm();
    const t = U.today();
    try {
      if (now >= s.report_time && once('report', t)) await sendDailyReport();
      if (now >= s.reminder_time && once('reminders', t)) await runReminders();
      if (now >= '03:00' && once('backup', t)) backup();
    } catch (e) {
      console.error('[jobs]', e);
    }
  }, { timezone: U.TZ });
  // Server o'chiq turganda qolib ketgan backupni darhol olish
  if (once('backup', U.today())) backup();
}
