import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, UPLOADS, ensureAdmin } from './db.js';
import { seedIfEmpty } from './seed.js';
import appRoutes from './routes/app.js';
import adminRoutes from './routes/admin.js';
import { startBot } from './bot.js';
import { startJobs } from './jobs.js';

ensureAdmin();
seedIfEmpty();

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use('/uploads', express.static(UPLOADS, { maxAge: '7d' }));
app.use('/api/app', appRoutes);
app.use('/api/admin', adminRoutes);

const dist = path.join(ROOT, 'web', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(['/', '/app', '/app/*', '/admin', '/admin/*'], (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, next) => {
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server xatosi' });
});

const PORT = Number(process.env.PORT) || 3100;
app.listen(PORT, () => {
  console.log(`\n  Server:      http://localhost:${PORT}`);
  console.log(`  Miniapp:     http://localhost:${PORT}/app   (dev: http://localhost:5173/app)`);
  console.log(`  Admin panel: http://localhost:${PORT}/admin (dev: http://localhost:5173/admin)\n`);
});

startBot();
startJobs();
