const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({ windowMs: 15*60*1000, max: 500, message: { success:false, message:'Too many requests' } });
const gameLimiter = rateLimit({ windowMs: 1000, max: 10, message: { success:false, message:'Slow down!' } });
app.use('/api', limiter);
app.use('/api/games', gameLimiter);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/games', require('./routes/games'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/admin', require('./routes/admin'));

app.get('/api/health', (req, res) => res.json({ success:true, message:'🎰 Lucky Fortune API Running!' }));

// ===== CREATE ADMIN (EK BAAR USE KAR KE DELETE KARO) =====
app.get('/create-admin', async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const db = require('./config/db');
    const hash = await bcrypt.hash('admin123', 10);
    const [ex] = await db.query('SELECT id FROM users WHERE username=?', ['admin']);
    if (ex.length) {
      await db.query('UPDATE users SET password=?,role="admin",coins=999999 WHERE username=?', [hash,'admin']);
      return res.send('<h2 style="color:green;font-family:sans-serif">✅ Admin password RESET!<br>Username: admin | Password: admin123<br><br>⚠️ Ab is route ko server.js se DELETE karo!</h2>');
    }
    await db.query('INSERT INTO users (username,email,password,coins,role) VALUES (?,?,?,?,?)',
      ['admin','admin@casino.com',hash,999999,'admin']);
    res.send('<h2 style="color:green;font-family:sans-serif">✅ Admin CREATED!<br>Username: admin | Password: admin123<br><br>⚠️ Ab is route ko server.js se DELETE karo!</h2>');
  } catch(e) {
    res.send('<h2 style="color:red;font-family:sans-serif">❌ Error: '+e.message+'</h2>');
  }
});
// ===== UPAR WALA BLOCK DELETE KARO LOGIN KE BAAD =====

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success:false, message:'Server error' });
});

app.listen(PORT, () => {
  console.log(`
  ====================================
  🎰 Lucky Fortune Casino Backend
  ====================================
  🚀 Port: ${PORT}
  📡 API:  http://localhost:${PORT}/api
  🔧 Admin Setup: http://localhost:${PORT}/create-admin
  ====================================
  `);
});

module.exports = app;
