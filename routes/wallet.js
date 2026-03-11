const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

// GET BALANCE
router.get('/balance', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT coins,bonus_coins FROM users WHERE id=?', [req.user.id]);
    res.json({ success:true, coins:parseInt(rows[0].coins), bonus_coins:parseInt(rows[0].bonus_coins), total_coins:parseInt(rows[0].coins)+parseInt(rows[0].bonus_coins) });
  } catch(e) { res.json({ success:false, message:e.message }); }
});

// GET TRANSACTIONS
router.get('/transactions', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 40', [req.user.id]);
    res.json({ success:true, transactions:rows });
  } catch(e) { res.json({ success:false, message:e.message }); }
});

// DEPOSIT REQUEST
router.post('/deposit/request', authMiddleware, async (req, res) => {
  try {
    const { amount, payment_method, payment_proof } = req.body;
    if (!amount||parseInt(amount)<100) return res.json({ success:false, message:'Min 100 coins (₹100)' });
    await db.query('INSERT INTO deposit_requests (user_id,type,amount,payment_method,payment_proof,status) VALUES (?,?,?,?,?,"pending")',
      [req.user.id,'deposit',parseInt(amount),payment_method||'UPI',payment_proof||'']);
    res.json({ success:true, message:'Deposit request submitted! Admin will approve shortly.' });
  } catch(e) { res.json({ success:false, message:e.message }); }
});

// WITHDRAW REQUEST — only REAL coins allowed
router.post('/withdraw/request', authMiddleware, async (req, res) => {
  try {
    const { amount, payment_method, account } = req.body;
    const withdrawAmt = parseInt(amount);
    if (!withdrawAmt||withdrawAmt<100) return res.json({ success:false, message:'Min withdrawal 100 coins (₹100)' });
    if (!payment_method||!account) return res.json({ success:false, message:'Payment details required' });

    // Only real coins can be withdrawn
    const [rows] = await db.query('SELECT coins FROM users WHERE id=?', [req.user.id]);
    const realCoins = parseInt(rows[0].coins);
    if (realCoins < withdrawAmt)
      return res.json({ success:false, message:`Insufficient real coins. You have ₹${realCoins} withdrawable. Bonus coins cannot be withdrawn.` });

    await db.query('INSERT INTO deposit_requests (user_id,type,amount,payment_method,payment_proof,status) VALUES (?,?,?,?,?,"pending")',
      [req.user.id,'withdraw',withdrawAmt,payment_method,`Account: ${account}`]);
    res.json({ success:true, message:`Withdrawal request of ₹${withdrawAmt} submitted! Processing in 24–48 hrs.` });
  } catch(e) { res.json({ success:false, message:e.message }); }
});

// DEPOSIT + WITHDRAW HISTORY
router.get('/deposit/history', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM deposit_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 30', [req.user.id]);
    res.json({ success:true, deposits:rows });
  } catch(e) { res.json({ success:false, message:e.message }); }
});

// LEADERBOARD
router.get('/leaderboard', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT username, coins, total_wins,
       (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE user_id=users.id AND type='win') as total_won
       FROM users WHERE is_banned=0 AND role='user' ORDER BY total_won DESC LIMIT 20`);
    res.json({ success:true, leaderboard:rows });
  } catch(e) { res.json({ success:false, message:e.message }); }
});

module.exports = router;

// USER GAME HISTORY
router.get('/game-history', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM game_history WHERE user_id=? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json({ success: true, history: rows });
  } catch(e) { res.json({ success: false, message: e.message }); }
});

// PUBLIC: Get payment settings (UPI for deposit page)
router.get('/payment-settings', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT setting_key, setting_value FROM site_settings');
    const settings = {};
    rows.forEach(r => settings[r.setting_key] = r.setting_value);
    res.json({ success: true, settings });
  } catch(e) { res.json({ success: false, settings: { upi_id: 'luckycasino@upi', site_url: '', site_name: 'Lucky Fortune Casino' } }); }
});
