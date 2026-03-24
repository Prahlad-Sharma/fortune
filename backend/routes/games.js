const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

// ── GAME STATUS (public) ──
router.get('/status', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT game_name, is_enabled FROM game_settings');
    const settings = {};
    rows.forEach(r => { settings[r.game_name] = r.is_enabled === 1; });

    const allGames = ['slots','wingo','cards','jackpot','aviator'];
    for (const g of allGames) {
      if (settings[g] === undefined) {
        settings[g] = true;
        try {
          await db.query('INSERT IGNORE INTO game_settings (game_name, is_enabled) VALUES (?, 1)', [g]);
        } catch(e2) {}
      }
    }

    res.json({ success: true, settings });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ── HELPER: deduct bet ──
async function deductBet(userId, betAmount) {
  // ✅ FIX: Withdrawble coins ko bhi fetch kar rahe hain
  const [u] = await db.query('SELECT coins, bonus_coins, COALESCE(withdrawable_coins,0) as withdrawable_coins FROM users WHERE id=?', [userId]);
  if (!u.length) throw new Error('User not found');
  const user = u[0];
  
  const maxBonus = Math.floor(betAmount * 0.1);
  const bonusUse = Math.min(user.bonus_coins, maxBonus);
  const realNeed = betAmount - bonusUse;
  
  if (user.coins < realNeed) throw new Error('Insufficient coins');
  
  // ✅ FIX: Winnings First Logic. GREATEST(0) ensure karega ki withdrawable 0 se neeche na jaye.
  await db.query('UPDATE users SET coins=coins-?, bonus_coins=bonus_coins-?, withdrawable_coins=GREATEST(0, withdrawable_coins-?) WHERE id=?',
    [realNeed, bonusUse, realNeed, userId]);
    
  return { bonusUsed: bonusUse, realUsed: realNeed };
}

// ── HELPER: pay win ──
async function payWin(userId, amount) {
  await db.query('UPDATE users SET coins=coins+?, withdrawable_coins=withdrawable_coins+? WHERE id=?', [amount, amount, userId]);
}

// ── HELPER: get balance ──
async function getBalance(userId) {
  const [u] = await db.query('SELECT coins, bonus_coins, COALESCE(withdrawable_coins,0) as withdrawable_coins FROM users WHERE id=?', [userId]);
  return u[0];
}

// ════════════════════════════════════════
// 🎰 SLOTS
// ════════════════════════════════════════
const SLOT_SYMBOLS = [
  { sym: '🍒', weight: 30 }, { sym: '🍋', weight: 25 }, { sym: '🍊', weight: 20 },
  { sym: '🍇', weight: 18 }, { sym: '⭐', weight: 12 }, { sym: '💎', weight: 6 },
  { sym: '7️⃣', weight: 4 }
];
function pickSlotSym() {
  const total = SLOT_SYMBOLS.reduce((a, s) => a + s.weight, 0);
  let r = Math.random() * total;
  for (const s of SLOT_SYMBOLS) { r -= s.weight; if (r <= 0) return s.sym; }
  return SLOT_SYMBOLS[0].sym;
}

router.post('/slots/spin', authMiddleware, async (req, res) => {
  try {
    const { bet_amount } = req.body;
    const bet = parseInt(bet_amount);
    if (!bet || bet < 10 || bet > 5000) return res.json({ success: false, message: 'Invalid bet (10-5000)' });

    const [gs] = await db.query("SELECT is_enabled FROM game_settings WHERE game_name='slots'");
    if (gs.length && !gs[0].is_enabled) return res.json({ success: false, message: 'Slots disabled' });

    await deductBet(req.user.id, bet);

    const s = [pickSlotSym(), pickSlotSym(), pickSlotSym()];
    let mult = 0, msg = '';
    if (s[0] === s[1] && s[1] === s[2]) {
      const m = { '💎': 50, '7️⃣': 20, '🍒': 10, '⭐': 8, '🍇': 6, '🍊': 5, '🍋': 4 };
      mult = m[s[0]] || 3;
      msg = `JACKPOT! ${s[0]}${s[1]}${s[2]} = x${mult}`;
    } else if (s[0] === s[1] || s[1] === s[2] || s[0] === s[2]) {
      mult = 2; msg = `2 Match! x2`;
    }

    const win = Math.floor(bet * mult);
    if (win > 0) await payWin(req.user.id, win);

    await db.query('INSERT INTO game_history (user_id, game, bet, payout, result) VALUES (?,?,?,?,?)',
      [req.user.id, 'slots', bet, win, msg || `${s[0]}${s[1]}${s[2]}`]);
    await db.query('INSERT INTO transactions (user_id, type, amount, description, coin_type) VALUES (?,?,?,?,?)',
      [req.user.id, win > 0 ? 'win' : 'loss', bet, `Slots: ${msg || 'No match'}`, 'real']);
    if (win > 0) {
      await db.query('UPDATE users SET total_wins=total_wins+1 WHERE id=?', [req.user.id]);
    }
    await db.query('UPDATE users SET total_bets=total_bets+1 WHERE id=?', [req.user.id]);

    const bal = await getBalance(req.user.id);
    res.json({ success: true, symbols: s, is_win: win > 0, win_amount: win, message: msg, ...bal });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ════════════════════════════════════════
// 🎨 WINGO
// ════════════════════════════════════════
const COLOR_MAP = { 0:'violet',1:'green',2:'red',3:'green',4:'red',5:'violet',6:'red',7:'green',8:'red',9:'green' };
const SIZE_MAP  = { 0:'small',1:'small',2:'small',3:'small',4:'small',5:'big',6:'big',7:'big',8:'big',9:'big' };

function getCurrentPeriod() {
  const n = new Date();
  const pad = x => String(x).padStart(2, '0');
  const period = `${n.getFullYear()}${pad(n.getMonth()+1)}${pad(n.getDate())}${pad(n.getHours())}${pad(Math.floor(n.getMinutes()/2))}`;
  const secondsLeft = 120 - (Math.floor(Date.now()/1000) % 120);
  return { period, secondsLeft };
}

router.get('/wingo/period', authMiddleware, (req, res) => {
  const { period, secondsLeft } = getCurrentPeriod();
  res.json({ success: true, period, seconds_left: secondsLeft });
});

router.post('/wingo/bet', authMiddleware, async (req, res) => {
  try {
    const { period_number, bet_type, bet_value, bet_amount } = req.body;
    const bet = parseInt(bet_amount);
    if (!bet || bet < 10) return res.json({ success: false, message: 'Min bet 10' });

    const [gs] = await db.query("SELECT is_enabled FROM game_settings WHERE game_name='wingo'");
    if (gs.length && !gs[0].is_enabled) return res.json({ success: false, message: 'Wingo disabled' });

    const { secondsLeft } = getCurrentPeriod();
    if (secondsLeft < 5) return res.json({ success: false, message: 'Betting closed!' });

    await deductBet(req.user.id, bet);
    await db.query('INSERT INTO wingo_bets (period_number, user_id, bet_type, bet_value, bet_amount, status) VALUES (?,?,?,?,?,?)',
      [period_number, req.user.id, bet_type, bet_value, bet, 'pending']);

    await db.query('UPDATE users SET total_bets=total_bets+1 WHERE id=?', [req.user.id]);
    const bal = await getBalance(req.user.id);
    res.json({ success: true, ...bal });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

router.post('/wingo/resolve', authMiddleware, async (req, res) => {
  try {
    const { period_number } = req.body;
    const [existing] = await db.query('SELECT * FROM wingo_periods WHERE period_number=? AND status=?', [period_number, 'closed']);
    if (existing.length) {
      const r = existing[0];
      return res.json({ success: true, result_number: r.result_number, result_color: r.result_color, result_size: r.result_size, bettor_ids: [] });
    }

    const [ov] = await db.query('SELECT admin_override FROM wingo_periods WHERE period_number=?', [period_number]);
    let num;
    if (ov.length && ov[0].admin_override !== null && ov[0].admin_override !== undefined) {
      num = parseInt(ov[0].admin_override);
    } else {
      num = Math.floor(Math.random() * 10);
    }

    const color = COLOR_MAP[num];
    const size = SIZE_MAP[num];

    if (ov.length) {
      await db.query(`UPDATE wingo_periods SET result_number=?, result_color=?, result_size=?, status='closed' WHERE period_number=?`,
        [num, color, size, period_number]);
    } else {
      await db.query(`INSERT INTO wingo_periods (period_number, result_number, result_color, result_size, status) VALUES (?,?,?,?,'closed')`,
        [period_number, num, color, size]);
    }

    const [bets] = await db.query('SELECT * FROM wingo_bets WHERE period_number=? AND status=?', [period_number, 'pending']);
    const bettorIds = [];
    for (const bet of bets) {
      let won = false, mult = 0;
      if (bet.bet_type === 'color' && bet.bet_value === color) { won = true; mult = color === 'violet' ? 5 : 2; }
      else if (bet.bet_type === 'size' && bet.bet_value === size) { won = true; mult = 2; }
      else if (bet.bet_type === 'number' && parseInt(bet.bet_value) === num) { won = true; mult = 9; }

      const win = won ? Math.floor(bet.bet_amount * mult) : 0;
      await db.query('UPDATE wingo_bets SET status=? WHERE id=?', [won ? 'won' : 'lost', bet.id]);

      if (won) {
        await payWin(bet.user_id, win);
        await db.query('UPDATE users SET total_wins=total_wins+1 WHERE id=?', [bet.user_id]);
        bettorIds.push(bet.user_id);
      }

      await db.query('INSERT INTO game_history (user_id, game, bet, payout, result) VALUES (?,?,?,?,?)',
        [bet.user_id, 'wingo', bet.bet_amount, win, `#${num} ${color} ${size} | ${bet.bet_type}:${bet.bet_value} | ${won?'WIN':'LOSS'}`]);
    }

    res.json({ success: true, result_number: num, result_color: color, result_size: size, bettor_ids: bettorIds });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

router.get('/wingo/history', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT * FROM wingo_periods WHERE status='closed' ORDER BY id DESC LIMIT 20`);
    res.json({ success: true, history: rows });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ════════════════════════════════════════
// 🃏 CARDS
// ════════════════════════════════════════
router.post('/cards/play', authMiddleware, async (req, res) => {
  try {
    const cardPicked = req.body.selected_card ?? req.body.picked_card;
    const bet = 20;

    const [gs] = await db.query("SELECT is_enabled FROM game_settings WHERE game_name='cards'");
    if (gs.length && !gs[0].is_enabled) return res.json({ success: false, message: 'Card game disabled' });

    await deductBet(req.user.id, bet);

    const acePos = Math.floor(Math.random() * 3);
    const isWin = parseInt(cardPicked) === acePos;
    const win = isWin ? 50 : 0;
    if (win > 0) await payWin(req.user.id, win);

    await db.query('INSERT INTO game_history (user_id, game, bet, payout, result) VALUES (?,?,?,?,?)',
      [req.user.id, 'cards', bet, win, isWin ? 'Found the Ace! WIN' : 'Missed the Ace']);
    await db.query('UPDATE users SET total_bets=total_bets+1 WHERE id=?', [req.user.id]);
    if (isWin) await db.query('UPDATE users SET total_wins=total_wins+1 WHERE id=?', [req.user.id]);

    const bal = await getBalance(req.user.id);
    res.json({ success: true, is_win: isWin, ace_position: acePos, win_amount: win, ...bal });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ════════════════════════════════════════
// 💎 JACKPOT
// ════════════════════════════════════════
router.post('/jackpot/buy', authMiddleware, async (req, res) => {
  try {
    const { selected_numbers } = req.body;
    const bet = 100;

    const [gs] = await db.query("SELECT is_enabled FROM game_settings WHERE game_name='jackpot'");
    if (gs.length && !gs[0].is_enabled) return res.json({ success: false, message: 'Jackpot disabled' });

    if (!selected_numbers || selected_numbers.length !== 5)
      return res.json({ success: false, message: 'Pick exactly 5 numbers' });

    await deductBet(req.user.id, bet);

    const winning = [];
    while (winning.length < 5) {
      const n = Math.floor(Math.random() * 35) + 1;
      if (!winning.includes(n)) winning.push(n);
    }

    const matched = selected_numbers.filter(n => winning.includes(n));
    let win = 0;
    if (matched.length >= 5) win = 300;
    else if (matched.length >= 3) win = 150;
    else if (matched.length >= 1) win = 50;

    if (win > 0) await payWin(req.user.id, win);

    await db.query('INSERT INTO game_history (user_id, game, bet, payout, result) VALUES (?,?,?,?,?)',
      [req.user.id, 'jackpot', bet, win, `${matched.length}/5 match | ${win > 0 ? 'WIN' : 'LOSS'}`]);
    await db.query('UPDATE users SET total_bets=total_bets+1 WHERE id=?', [req.user.id]);
    if (win > 0) await db.query('UPDATE users SET total_wins=total_wins+1 WHERE id=?', [req.user.id]);

    const bal = await getBalance(req.user.id);
    res.json({ success: true, winning_numbers: winning, matched_numbers: matched, matches: matched.length, win_amount: win, ...bal });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ════════════════════════════════════════
// ✈️ AVIATOR
// ════════════════════════════════════════
const aviatorSessions = new Map();

function generateCrashPoint() {
  const r = Math.random();
  if (r < 0.05) return 1.00;
  const crash = Math.max(1.00, (1 / (1 - r * 0.95)) * 0.97);
  return Math.min(Math.round(crash * 100) / 100, 100);
}

router.post('/aviator/start', authMiddleware, async (req, res) => {
  try {
    const { bet_amount } = req.body;
    const bet = parseInt(bet_amount);
    if (!bet || bet < 10 || bet > 5000)
      return res.json({ success: false, message: 'Invalid bet (10–5000)' });

    const [gs] = await db.query("SELECT is_enabled FROM game_settings WHERE game_name='aviator'");
    if (gs.length && !gs[0].is_enabled)
      return res.json({ success: false, message: 'Aviator disabled' });

    await deductBet(req.user.id, bet);
    await db.query('UPDATE users SET total_bets=total_bets+1 WHERE id=?', [req.user.id]);

    const crashAt = generateCrashPoint();
    const sessionId = `av_${req.user.id}_${Date.now()}`;

    aviatorSessions.set(sessionId, {
      userId: req.user.id,
      bet,
      crashAt,
      startTime: Date.now(),
      cashed: false
    });

    setTimeout(() => aviatorSessions.delete(sessionId), 180000);

    const bal = await getBalance(req.user.id);
    res.json({ success: true, session_id: sessionId, crash_at: crashAt, ...bal });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

router.post('/aviator/cashout', authMiddleware, async (req, res) => {
  try {
    const { session_id, multiplier } = req.body;
    const mult = parseFloat(multiplier);

    if (!session_id || !aviatorSessions.has(session_id))
      return res.json({ success: false, message: 'Invalid or expired session' });

    const session = aviatorSessions.get(session_id);

    if (session.userId !== req.user.id)
      return res.json({ success: false, message: 'Not your session' });

    if (session.cashed)
      return res.json({ success: false, message: 'Already cashed out' });

    if (mult > session.crashAt)
      return res.json({ success: false, message: `Crashed at ${session.crashAt}x!` });

    if (mult < 1.00)
      return res.json({ success: false, message: 'Invalid multiplier' });

    session.cashed = true;
    const win = Math.floor(session.bet * mult);
    await payWin(req.user.id, win);

    await db.query('UPDATE users SET total_wins=total_wins+1 WHERE id=?', [req.user.id]);
    await db.query('INSERT INTO game_history (user_id, game, bet, payout, result) VALUES (?,?,?,?,?)',
      [req.user.id, 'aviator', session.bet, win,
       `Cashout at ${mult}x | Crash was ${session.crashAt}x | WIN +🪙${win}`]);

    aviatorSessions.delete(session_id);
    const bal = await getBalance(req.user.id);
    res.json({ success: true, win_amount: win, multiplier: mult, crash_at: session.crashAt, ...bal });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

router.post('/aviator/crash', authMiddleware, async (req, res) => {
  try {
    const { session_id } = req.body;

    if (!session_id || !aviatorSessions.has(session_id))
      return res.json({ success: true });

    const session = aviatorSessions.get(session_id);
    if (session.cashed) return res.json({ success: true });

    session.cashed = true;
    await db.query('INSERT INTO game_history (user_id, game, bet, payout, result) VALUES (?,?,?,?,?)',
      [req.user.id, 'aviator', session.bet, 0,
       `Crashed at ${session.crashAt}x | LOSS -🪙${session.bet}`]);

    aviatorSessions.delete(session_id);
    const bal = await getBalance(req.user.id);
    res.json({ success: true, ...bal });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

router.get('/aviator/history', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT result FROM game_history WHERE game='aviator' ORDER BY id DESC LIMIT 15`
    );
    const history = rows.map(r => {
      const m = r.result.match(/Crash(?:ed)? (?:was |at )?(\d+\.?\d*)x/i);
      return m ? parseFloat(m[1]) : null;
    }).filter(Boolean);
    res.json({ success: true, history });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

module.exports = router;