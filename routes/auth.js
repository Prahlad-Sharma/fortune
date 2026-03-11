const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

// Generate unique refer code
function makeReferCode(username) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = username.toUpperCase().slice(0,3);
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const makeToken = (user) => jwt.sign(
  { id: user.id, username: user.username, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES || '7d' }
);

const safeUser = (u) => ({
  id: u.id,
  username: u.username,
  email: u.email,
  coins: parseInt(u.coins || 0),
  bonus_coins: parseInt(u.bonus_coins || 0),
  total_coins: parseInt(u.coins || 0) + parseInt(u.bonus_coins || 0),
  role: u.role,
  is_admin: u.role === 'admin',
  is_banned: u.is_banned,
  total_wins: u.total_wins || 0,
  total_bets: u.total_bets || 0,
  avatar: u.avatar || '🎰',
  refer_code: u.refer_code,
  total_referrals: u.total_referrals || 0,
  created_at: u.created_at
});

// ─── REGISTER ────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, refer_code } = req.body;
    if (!username || !email || !password)
      return res.json({ success: false, message: 'All fields required' });
    if (username.length < 3)
      return res.json({ success: false, errors: [{ msg: 'Username min 3 chars' }] });
    if (password.length < 6)
      return res.json({ success: false, errors: [{ msg: 'Password min 6 chars' }] });

    const [exists] = await db.query('SELECT id FROM users WHERE username=? OR email=?', [username, email]);
    if (exists.length) return res.json({ success: false, message: 'Username or email already taken' });

    // Check referrer - agar code diya toh valid hona chahiye
    let referrerId = null;
    if (refer_code && refer_code.trim()) {
      const [refUser] = await db.query('SELECT id FROM users WHERE refer_code=?', [refer_code.trim().toUpperCase()]);
      if (!refUser.length) return res.json({ success: false, message: '❌ Invalid refer code! Sahi code daalo ya khali chhodo.' });
      referrerId = refUser[0].id;
    }

    const hash = await bcrypt.hash(password, 10);
    const myReferCode = makeReferCode(username);

    // Joining bonus sirf refer code wale ko milega
    const joiningBonus = referrerId ? 50 : 0;
    const [result] = await db.query(
      'INSERT INTO users (username,email,password,coins,bonus_coins,role,refer_code,referred_by) VALUES (?,?,?,0,?,"user",?,?)',
      [username, email, hash, joiningBonus, myReferCode, referrerId]
    );
    const newUserId = result.insertId;

    // Log joining bonus only if refer code used
    if (joiningBonus > 0) {
      await db.query(
        'INSERT INTO transactions (user_id,type,amount,coin_type,description) VALUES (?,?,?,?,?)',
        [newUserId, 'bonus', joiningBonus, 'bonus', '🎁 Joining Bonus (Refer Code Used) — 50 Coins (Not Withdrawable)']
      );
    }

    // Give referrer 150 BONUS coins
    if (referrerId) {
      await db.query('UPDATE users SET bonus_coins=bonus_coins+150, total_referrals=total_referrals+1 WHERE id=?', [referrerId]);
      await db.query(
        'INSERT INTO transactions (user_id,type,amount,coin_type,description) VALUES (?,?,?,?,?)',
        [referrerId, 'refer_bonus', 150, 'bonus', `🤝 Refer Bonus: ${username} joined (Not Withdrawable)`]
      );
      await db.query('INSERT INTO referrals (referrer_id,referred_id,bonus_given) VALUES (?,?,?)', [referrerId, newUserId, 150]);
    }

    const [rows] = await db.query('SELECT * FROM users WHERE id=?', [newUserId]);
    const token = makeToken(rows[0]);
    res.json({ success: true, token, user: safeUser(rows[0]) });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ─── LOGIN ───────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.json({ success: false, message: 'Username and password required' });

    const [rows] = await db.query('SELECT * FROM users WHERE username=?', [username]);
    if (!rows.length) return res.json({ success: false, message: 'Wrong username or password' });

    const user = rows[0];
    if (user.is_banned) return res.json({ success: false, message: 'Account is banned' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.json({ success: false, message: 'Wrong username or password' });

    const token = makeToken(user);
    res.json({ success: true, token, user: safeUser(user) });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ─── PROFILE ─────────────────────────────
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE id=?', [req.user.id]);
    res.json({ success: true, user: safeUser(rows[0]) });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { username, email } = req.body;
    const [exists] = await db.query(
      'SELECT id FROM users WHERE (username=? OR email=?) AND id!=?',
      [username, email, req.user.id]
    );
    if (exists.length) return res.json({ success: false, message: 'Username or email taken' });
    const av=req.body.avatar||null;
    if(av){
      await db.query('UPDATE users SET username=?, email=?, avatar=? WHERE id=?', [username, email, av, req.user.id]);
    } else {
      await db.query('UPDATE users SET username=?, email=? WHERE id=?', [username, email, req.user.id]);
    }
    const [rows] = await db.query('SELECT * FROM users WHERE id=?', [req.user.id]);
    res.json({ success: true, user: safeUser(rows[0]) });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ─── CHANGE PASSWORD ─────────────────────
router.put('/change-password', authMiddleware, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const [rows] = await db.query('SELECT * FROM users WHERE id=?', [req.user.id]);
    const match = await bcrypt.compare(current_password, rows[0].password);
    if (!match) return res.json({ success: false, message: 'Current password wrong' });
    if (new_password.length < 6) return res.json({ success: false, message: 'Min 6 chars' });
    const hash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password=? WHERE id=?', [hash, req.user.id]);
    res.json({ success: true, message: 'Password changed!' });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ─── DAILY BONUS ──────────────────────────
router.post('/daily-bonus', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE id=?', [req.user.id]);
    const user = rows[0];
    const lastBonus = user.last_bonus_at ? new Date(user.last_bonus_at) : null;
    const now = new Date();
    if (lastBonus && (now - lastBonus) < 24 * 60 * 60 * 1000) {
      const next = new Date(lastBonus.getTime() + 24 * 60 * 60 * 1000);
      return res.json({ success: false, message: `Already claimed! Next at: ${next.toLocaleTimeString()}` });
    }
    const bonus = 50;
    // Daily bonus goes to bonus_coins (not withdrawable)
    await db.query('UPDATE users SET bonus_coins=bonus_coins+?, last_bonus_at=NOW() WHERE id=?', [bonus, user.id]);
    await db.query(
      'INSERT INTO transactions (user_id,type,amount,coin_type,description) VALUES (?,?,?,?,?)',
      [user.id, 'daily_bonus', bonus, 'bonus', '🌟 Daily Login Bonus (Not Withdrawable)']
    );
    const [updated] = await db.query('SELECT coins,bonus_coins FROM users WHERE id=?', [user.id]);
    res.json({
      success: true, bonus,
      coins: parseInt(updated[0].coins),
      bonus_coins: parseInt(updated[0].bonus_coins),
      total_coins: parseInt(updated[0].coins) + parseInt(updated[0].bonus_coins)
    });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ─── REFER INFO ──────────────────────────
router.get('/refer-info', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE id=?', [req.user.id]);
    const [refs] = await db.query(
      `SELECT u.username, r.bonus_given, r.created_at
       FROM referrals r JOIN users u ON r.referred_id=u.id
       WHERE r.referrer_id=? ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    res.json({
      success: true,
      refer_code: rows[0].refer_code,
      total_referrals: rows[0].total_referrals || 0,
      total_earned: (rows[0].total_referrals || 0) * 150,
      referrals: refs
    });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

module.exports = router;