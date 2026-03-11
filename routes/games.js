const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const SYMBOLS = ['🍒','🍋','🍊','⭐','🍇','7️⃣','💎'];
const PAYOUTS = { '💎💎💎':50,'7️⃣7️⃣7️⃣':20,'🍒🍒🍒':10,'⭐⭐⭐':8,'🍇🍇🍇':6,'🍊🍊🍊':5,'🍋🍋🍋':4 };
const COLOR_MAP = { 0:'violet',1:'green',2:'red',3:'green',4:'red',5:'violet',6:'red',7:'green',8:'red',9:'green' };
const SIZE_MAP  = { 0:'small', 1:'small',2:'small',3:'small',4:'small',5:'big',6:'big',7:'big',8:'big',9:'big' };

function genPeriod() {
  const n = new Date(), pad = x => String(x).padStart(2,'0');
  return `${n.getFullYear()}${pad(n.getMonth()+1)}${pad(n.getDate())}${pad(n.getHours())}${pad(Math.floor(n.getMinutes()/2))}`;
}

// New rule:
//  - If user has bonus coins → max 10% of bet can be taken from bonus
//  - Rest (90%+) comes from real coins
//  - If no bonus → 100% from real coins
async function deductCoins(userId, amount, db) {
  const [r] = await db.query('SELECT coins,bonus_coins FROM users WHERE id=?', [userId]);
  const bonus = parseInt(r[0].bonus_coins);
  const real  = parseInt(r[0].coins);

  let fromBonus = 0;
  let fromReal  = amount;

  if (bonus > 0) {
    // Max 10% of bet from bonus coins
    const maxFromBonus = Math.floor(amount * 0.10);
    fromBonus = Math.min(bonus, maxFromBonus);
    fromReal  = amount - fromBonus;
  }

  if (fromBonus > 0) await db.query('UPDATE users SET bonus_coins=bonus_coins-? WHERE id=?', [fromBonus, userId]);
  if (fromReal  > 0) await db.query('UPDATE users SET coins=coins-? WHERE id=?', [fromReal, userId]);
  return { fromBonus, fromReal, coin_type: fromBonus > 0 ? 'mixed' : 'real' };
}

// ─── SLOTS ───────────────────────────────
router.post('/slots/spin', authMiddleware, async (req, res) => {
  try {
    if (!await isGameEnabled('slots', db)) return res.json({ success: false, message: '🚫 Slots is currently disabled by admin.' });
    const bet = parseInt(req.body.bet_amount) || 50;
    if (bet < 10 || bet > 5000) return res.json({ success: false, message: 'Bet 10-5000' });
    const [r] = await db.query('SELECT coins,bonus_coins FROM users WHERE id=?', [req.user.id]);
    const real = parseInt(r[0].coins), bonus = parseInt(r[0].bonus_coins);
    // 10% max from bonus, rest needs real coins
    const maxBonus = Math.floor(bet * 0.10);
    const bonusUse = Math.min(bonus, maxBonus);
    const needReal = bet - bonusUse;
    if (real < needReal) return res.json({ success: false, message: `Not enough coins! Need ₹${needReal} real coins.` });
    const { coin_type } = await deductCoins(req.user.id, bet, db);
    await db.query('UPDATE users SET total_bets=total_bets+1 WHERE id=?', [req.user.id]);
    const s = [SYMBOLS[Math.floor(Math.random()*7)],SYMBOLS[Math.floor(Math.random()*7)],SYMBOLS[Math.floor(Math.random()*7)]];
    const key = s.join('');
    let mult = PAYOUTS[key] || 0;
    if (!mult && (s[0]===s[1]||s[1]===s[2]||s[0]===s[2])) mult = 2;
    let win_amount = 0;
    if (mult > 0) {
      win_amount = bet * mult;
      await db.query('UPDATE users SET coins=coins+?,total_wins=total_wins+1 WHERE id=?', [win_amount, req.user.id]);
      await db.query('INSERT INTO transactions (user_id,type,amount,coin_type,description) VALUES (?,?,?,?,?)', [req.user.id,'win',win_amount,'real',`🎰 Slots Win: ${key} x${mult}`]);
    } else {
      await db.query('INSERT INTO transactions (user_id,type,amount,coin_type,description) VALUES (?,?,?,?,?)', [req.user.id,'loss',bet,coin_type,'🎰 Slots Loss']);
    }
    await db.query('INSERT INTO game_history (user_id,game,bet,result,payout) VALUES (?,?,?,?,?)', [req.user.id,'slots',bet,key,win_amount]);
    const [u] = await db.query('SELECT coins,bonus_coins FROM users WHERE id=?', [req.user.id]);
    res.json({ success:true, symbols:s, is_win:mult>0, win_amount, mult, message:mult>0?`${key} — x${mult}!`:'No match', coins:parseInt(u[0].coins), bonus_coins:parseInt(u[0].bonus_coins), total_coins:parseInt(u[0].coins)+parseInt(u[0].bonus_coins) });
  } catch(e) { res.json({ success:false, message:e.message }); }
});

// ─── WINGO PERIOD ────────────────────────
router.get('/wingo/period', authMiddleware, async (req, res) => {
  try {
    const period = genPeriod();
    await db.query('INSERT IGNORE INTO wingo_periods (period_number,status) VALUES (?,"open")', [period]);
    const [rows] = await db.query('SELECT * FROM wingo_periods WHERE period_number=?', [period]);
    const sec = 120 - (Math.floor(Date.now()/1000) % 120);
    res.json({ success:true, period, seconds_left:sec, has_override: rows[0]?.admin_override !== null && rows[0]?.admin_override !== undefined });
  } catch(e) { res.json({ success:false, message:e.message }); }
});

// ─── WINGO BET ───────────────────────────
router.post('/wingo/bet', authMiddleware, async (req, res) => {
  try {
    if (!await isGameEnabled('wingo', db)) return res.json({ success: false, message: '🚫 Wingo is currently disabled by admin.' });
    const { period_number, bet_type, bet_value, bet_amount } = req.body;
    const bet = parseInt(bet_amount) || 50;
    if (bet < 10) return res.json({ success:false, message:'Min bet 10' });
    if (!['color','number','size'].includes(bet_type)) return res.json({ success:false, message:'Invalid bet type' });
    if (bet_type==='size' && !['small','big'].includes(bet_value)) return res.json({ success:false, message:'Size: small or big' });

    const [r] = await db.query('SELECT coins,bonus_coins FROM users WHERE id=?', [req.user.id]);
    const real2 = parseInt(r[0].coins), bonus2 = parseInt(r[0].bonus_coins);
    const maxBonus2 = Math.floor(bet * 0.10);
    const bonusUse2 = Math.min(bonus2, maxBonus2);
    const needReal2 = bet - bonusUse2;
    if (real2 < needReal2) return res.json({ success:false, message:`Not enough coins! Need ₹${needReal2} real coins.` });

    const [period] = await db.query('SELECT * FROM wingo_periods WHERE period_number=?', [period_number]);
    if (!period.length || period[0].status==='closed') return res.json({ success:false, message:'Period closed' });

    const { coin_type } = await deductCoins(req.user.id, bet, db);
    await db.query('UPDATE users SET total_bets=total_bets+1 WHERE id=?', [req.user.id]);
    await db.query('INSERT INTO wingo_bets (user_id,period_number,bet_type,bet_value,bet_amount) VALUES (?,?,?,?,?)', [req.user.id,period_number,bet_type,bet_value,bet]);
    await db.query('INSERT INTO transactions (user_id,type,amount,coin_type,description) VALUES (?,?,?,?,?)', [req.user.id,'loss',bet,coin_type,`🎨 Wingo Bet: ${bet_type}=${bet_value}`]);

    const [u] = await db.query('SELECT coins,bonus_coins FROM users WHERE id=?', [req.user.id]);
    res.json({ success:true, message:'Bet placed!', coins:parseInt(u[0].coins), bonus_coins:parseInt(u[0].bonus_coins), total_coins:parseInt(u[0].coins)+parseInt(u[0].bonus_coins) });
  } catch(e) { res.json({ success:false, message:e.message }); }
});

// ─── WINGO RESOLVE ───────────────────────
router.post('/wingo/resolve', authMiddleware, async (req, res) => {
  try {
    const { period_number } = req.body;
    const [period] = await db.query('SELECT * FROM wingo_periods WHERE period_number=?', [period_number]);
    if (!period.length || period[0].status==='closed') return res.json({ success:false, message:'Already resolved' });

    // Admin override takes full priority
    const result_number = (period[0].admin_override !== null && period[0].admin_override !== undefined)
      ? parseInt(period[0].admin_override)
      : Math.floor(Math.random()*10);
    const result_color = COLOR_MAP[result_number];
    const result_size  = SIZE_MAP[result_number];

    await db.query('UPDATE wingo_periods SET result_number=?,result_color=?,result_size=?,status="closed" WHERE period_number=?', [result_number,result_color,result_size,period_number]);

    const [bets] = await db.query('SELECT * FROM wingo_bets WHERE period_number=? AND status="pending"', [period_number]);
    for (const bet of bets) {
      let won=false, mult=0;
      if (bet.bet_type==='color'  && bet.bet_value===result_color)        { won=true; mult = result_color==='violet'?5:2; }
      if (bet.bet_type==='number' && parseInt(bet.bet_value)===result_number) { won=true; mult=9; }
      if (bet.bet_type==='size'   && bet.bet_value===result_size)          { won=true; mult=2; }
      if (won) {
        const payout = bet.bet_amount * mult;
        await db.query('UPDATE users SET coins=coins+?,total_wins=total_wins+1 WHERE id=?', [payout, bet.user_id]);
        await db.query('UPDATE wingo_bets SET status="won",payout=? WHERE id=?', [payout, bet.id]);
        await db.query('INSERT INTO transactions (user_id,type,amount,coin_type,description) VALUES (?,?,?,?,?)',
          [bet.user_id,'win',payout,'real',`🎨 Wingo Win: #${result_number} ${result_color} ${result_size} x${mult}`]);
        await db.query('INSERT INTO game_history (user_id,game,bet,result,payout) VALUES (?,?,?,?,?)',
          [bet.user_id, 'wingo', bet.bet_amount,
           `#${result_number} ${result_color} ${result_size} | ${bet.bet_type}=${bet.bet_value} WIN x${mult}`,
           payout]);
      } else {
        await db.query('UPDATE wingo_bets SET status="lost" WHERE id=?', [bet.id]);
        await db.query('INSERT INTO game_history (user_id,game,bet,result,payout) VALUES (?,?,?,?,?)',
          [bet.user_id, 'wingo', bet.bet_amount,
           `#${result_number} ${result_color} ${result_size} | ${bet.bet_type}=${bet.bet_value} LOSS`,
           0]);
      }
    }
    res.json({ success:true, result_number, result_color, result_size });
  } catch(e) { res.json({ success:false, message:e.message }); }
});

// ─── WINGO HISTORY ───────────────────────
router.get('/wingo/history', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM wingo_periods WHERE status="closed" ORDER BY created_at DESC LIMIT 20');
    res.json({ success:true, history:rows });
  } catch(e) { res.json({ success:false, message:e.message }); }
});

// ─── WHEEL ───────────────────────────────
const WHEEL_PRIZES = [200,500,100,1000,50,2000,150,5000];
router.post('/wheel/spin', authMiddleware, async (req, res) => {
  try {
    const cost = 100;
    const [r] = await db.query('SELECT coins,bonus_coins FROM users WHERE id=?', [req.user.id]);
    const maxBonusW = Math.floor(cost * 0.10);
    const bonusUseW = Math.min(parseInt(r[0].bonus_coins), maxBonusW);
    const needRealW = cost - bonusUseW;
    if (parseInt(r[0].coins) < needRealW) return res.json({ success:false, message:`Need ₹${needRealW} real coins to spin!` });
    const { coin_type } = await deductCoins(req.user.id, cost, db);
    await db.query('UPDATE users SET total_bets=total_bets+1 WHERE id=?', [req.user.id]);
    const prize_index = Math.floor(Math.random()*WHEEL_PRIZES.length);
    const prize = WHEEL_PRIZES[prize_index];
    await db.query('UPDATE users SET coins=coins+?,total_wins=total_wins+1 WHERE id=?', [prize, req.user.id]);
    await db.query('INSERT INTO transactions (user_id,type,amount,coin_type,description) VALUES (?,?,?,?,?)', [req.user.id,'win',prize,'real',`🎡 Wheel Win: 🪙${prize}`]);
    await db.query('INSERT INTO game_history (user_id,game,bet,result,payout) VALUES (?,?,?,?,?)', [req.user.id,'wheel',cost,`Prize #${prize_index}`,prize]);
    const [u] = await db.query('SELECT coins,bonus_coins FROM users WHERE id=?', [req.user.id]);
    res.json({ success:true, prize, prize_index, coins:parseInt(u[0].coins), bonus_coins:parseInt(u[0].bonus_coins), total_coins:parseInt(u[0].coins)+parseInt(u[0].bonus_coins) });
  } catch(e) { res.json({ success:false, message:e.message }); }
});

// ─── JACKPOT ─────────────────────────────
// Ticket: 100 coins
// Match prizes:
//   0 match = 0
//   1 match = 50
//   2 match = 50
//   3 match = 150
//   4 match = 150
//   5 match = 150 (+ jackpot bonus)
router.post('/jackpot/buy', authMiddleware, async (req, res) => {
  try {
    if (!await isGameEnabled('jackpot', db)) return res.json({ success: false, message: '🚫 Jackpot is currently disabled by admin.' });
    const { selected_numbers } = req.body;
    const cost = 100; // Changed from 200 to 100

    if (!selected_numbers || selected_numbers.length !== 5)
      return res.json({ success:false, message:'Pick exactly 5 numbers' });

    // Validate all numbers are 1–35
    const parsed = selected_numbers.map(n => parseInt(n));
    if (parsed.some(n => isNaN(n) || n < 1 || n > 35))
      return res.json({ success:false, message:'Numbers must be between 1 and 35' });

    const [r] = await db.query('SELECT coins,bonus_coins FROM users WHERE id=?', [req.user.id]);
    const maxBonusJ = Math.floor(cost * 0.10);
    const bonusUseJ = Math.min(parseInt(r[0].bonus_coins), maxBonusJ);
    const needRealJ = cost - bonusUseJ;
    if (parseInt(r[0].coins) < needRealJ)
      return res.json({ success:false, message:`Need ₹${needRealJ} real coins for ticket!` });

    const { coin_type } = await deductCoins(req.user.id, cost, db);
    await db.query('UPDATE users SET total_bets=total_bets+1 WHERE id=?', [req.user.id]);

    // Generate 5 unique winning numbers 1–35
    const winning = [];
    while (winning.length < 5) {
      const n = Math.floor(Math.random() * 35) + 1;
      if (!winning.includes(n)) winning.push(n);
    }

    // Count matches properly
    let matches = 0;
    const matchedNums = [];
    for (const sel of parsed) {
      if (winning.includes(sel)) {
        matches++;
        matchedNums.push(sel);
      }
    }

    // Prize table: fixed coin prizes (not multipliers)
    // 0 = 0, 1 = 50, 2 = 50, 3 = 150, 4 = 150, 5 = 150
    const prizeMap = { 0:0, 1:50, 2:50, 3:150, 4:150, 5:150 };
    const win_amount = prizeMap[matches];

    if (win_amount > 0) {
      await db.query('UPDATE users SET coins=coins+?,total_wins=total_wins+1 WHERE id=?', [win_amount, req.user.id]);
      await db.query(
        'INSERT INTO transactions (user_id,type,amount,coin_type,description) VALUES (?,?,?,?,?)',
        [req.user.id, 'win', win_amount, 'real',
         `💎 Jackpot: ${matches} match${matches>1?'es':''} [${matchedNums.join(',')}] → +${win_amount}`]
      );
    } else {
      await db.query(
        'INSERT INTO transactions (user_id,type,amount,coin_type,description) VALUES (?,?,?,?,?)',
        [req.user.id, 'loss', cost, coin_type,
         `💎 Jackpot: 0 matches. Winning: ${winning.join(',')}`]
      );
    }

    await db.query(
      'INSERT INTO game_history (user_id,game,bet,result,payout) VALUES (?,?,?,?,?)',
      [req.user.id, 'jackpot', cost, `${matches} matches (${matchedNums.join(',')})`, win_amount]
    );

    const [u] = await db.query('SELECT coins,bonus_coins FROM users WHERE id=?', [req.user.id]);
    res.json({
      success: true,
      winning_numbers: winning,
      selected_numbers: parsed,
      matched_numbers: matchedNums,
      matches,
      win_amount,
      coins: parseInt(u[0].coins),
      bonus_coins: parseInt(u[0].bonus_coins),
      total_coins: parseInt(u[0].coins) + parseInt(u[0].bonus_coins)
    });
  } catch(e) { res.json({ success:false, message:e.message }); }
});

// ─── CHICKEN ROAD ────────────────────────
router.post('/chicken/start', authMiddleware, async (req, res) => {
  try {
    if (!await isGameEnabled('chicken', db)) return res.json({ success: false, message: '🚫 Chicken Road is currently disabled by admin.' });
    const bet = parseInt(req.body.bet_amount);
    if (!bet || bet < 10 || bet > 5000) return res.json({ success: false, message: 'Bet 10–5000 honi chahiye!' });
    const [r] = await db.query('SELECT coins, bonus_coins FROM users WHERE id=?', [req.user.id]);
    const maxBonus = Math.floor(bet * 0.10);
    const bonusUse = Math.min(parseInt(r[0].bonus_coins), maxBonus);
    const needReal = bet - bonusUse;
    if (parseInt(r[0].coins) < needReal) return res.json({ success: false, message: `Need ₹${needReal} real coins!` });
    const { coin_type } = await deductCoins(req.user.id, bet, db);
    await db.query('UPDATE users SET total_bets=total_bets+1 WHERE id=?', [req.user.id]);
    const [u] = await db.query('SELECT coins, bonus_coins FROM users WHERE id=?', [req.user.id]);
    res.json({ success: true, coins: parseInt(u[0].coins), bonus_coins: parseInt(u[0].bonus_coins), total_coins: parseInt(u[0].coins) + parseInt(u[0].bonus_coins) });
  } catch(e) { res.json({ success: false, message: e.message }); }
});

router.post('/chicken/end', authMiddleware, async (req, res) => {
  try {
    const { bet_amount, steps, won, multiplier } = req.body;
    const bet = parseInt(bet_amount);
    const stepsNum = parseInt(steps) || 0;
    if (won && stepsNum > 0) {
      const mult = parseFloat(multiplier) || 1;
      const payout = Math.floor(bet * mult);
      await db.query('UPDATE users SET coins=coins+?, total_wins=total_wins+1 WHERE id=?', [payout, req.user.id]);
      await db.query('INSERT INTO transactions (user_id,type,amount,coin_type,description) VALUES (?,?,?,?,?)',
        [req.user.id, 'win', payout, 'real', `🐔 Chicken Road: ${stepsNum} steps x${mult} = 🪙${payout}`]);
      await db.query('INSERT INTO game_history (user_id,game,bet,result,payout) VALUES (?,?,?,?,?)',
        [req.user.id, 'chicken', bet, `${stepsNum} steps — ${mult}x CASHOUT`, payout]);
    } else {
      await db.query('INSERT INTO transactions (user_id,type,amount,coin_type,description) VALUES (?,?,?,?,?)',
        [req.user.id, 'loss', bet, 'real', `🐔 Chicken Road: Hit at step ${stepsNum} — DEAD 💥`]);
      await db.query('INSERT INTO game_history (user_id,game,bet,result,payout) VALUES (?,?,?,?,?)',
        [req.user.id, 'chicken', bet, `Step ${stepsNum} — DEAD 💥`, 0]);
    }
    const [u] = await db.query('SELECT coins, bonus_coins FROM users WHERE id=?', [req.user.id]);
    res.json({ success: true, coins: parseInt(u[0].coins), bonus_coins: parseInt(u[0].bonus_coins), total_coins: parseInt(u[0].coins) + parseInt(u[0].bonus_coins) });
  } catch(e) { res.json({ success: false, message: e.message }); }
});

module.exports = router;

// ─── GAME STATUS CHECK ────────────────────
async function isGameEnabled(gameName, db) {
  try {
    const [rows] = await db.query('SELECT is_enabled FROM game_settings WHERE game_name=?', [gameName]);
    if (!rows.length) return true; // default enabled
    return rows[0].is_enabled == 1;
  } catch(e) { return true; }
}

// ─── GET ALL GAME STATUSES (for frontend) ─
router.get('/status', async (req, res) => {
  try {
    const games = ['slots','wingo','cards','jackpot','chicken'];
    const settings = {};
    for (const g of games) {
      const [rows] = await db.query('SELECT is_enabled FROM game_settings WHERE game_name=?', [g]);
      settings[g] = rows.length ? rows[0].is_enabled == 1 : true;
    }
    res.json({ success: true, settings });
  } catch(e) { res.json({ success: false, message: e.message }); }
});

// ─── CARDS GAME ───────────────────────────
// 3 face-down cards, one is Ace (Ekka)
// Cost: 20 coins, Win: 50 coins
router.post('/cards/play', authMiddleware, async (req, res) => {
  try {
    const enabled = await isGameEnabled('cards', db);
    if (!enabled) return res.json({ success: false, message: '🚫 Card game is currently disabled by admin.' });

    const { picked_card } = req.body; // 0, 1, or 2
    const pick = parseInt(picked_card);
    if (isNaN(pick) || pick < 0 || pick > 2)
      return res.json({ success: false, message: 'Pick card 0, 1, or 2' });

    const cost = 20;
    const prize = 50;

    const [r] = await db.query('SELECT coins, bonus_coins FROM users WHERE id=?', [req.user.id]);
    const real = parseInt(r[0].coins), bonus = parseInt(r[0].bonus_coins);
    const maxBonus = Math.floor(cost * 0.10); // 10% = 2 coins
    const bonusUse = Math.min(bonus, maxBonus);
    const needReal = cost - bonusUse;
    if (real < needReal)
      return res.json({ success: false, message: `Need ₹${needReal} real coins to play!` });

    // Deduct cost
    if (bonusUse > 0) await db.query('UPDATE users SET bonus_coins=bonus_coins-? WHERE id=?', [bonusUse, req.user.id]);
    if (needReal > 0) await db.query('UPDATE users SET coins=coins-? WHERE id=?', [needReal, req.user.id]);
    await db.query('UPDATE users SET total_bets=total_bets+1 WHERE id=?', [req.user.id]);

    // Randomly place the Ace (Ekka) in one of 3 positions
    const ace_position = Math.floor(Math.random() * 3);
    const is_win = pick === ace_position;

    if (is_win) {
      await db.query('UPDATE users SET coins=coins+?, total_wins=total_wins+1 WHERE id=?', [prize, req.user.id]);
      await db.query('INSERT INTO transactions (user_id,type,amount,coin_type,description) VALUES (?,?,?,?,?)',
        [req.user.id, 'win', prize, 'real', `🃏 Card Game WIN! Picked Ace at position ${pick}`]);
    } else {
      await db.query('INSERT INTO transactions (user_id,type,amount,coin_type,description) VALUES (?,?,?,?,?)',
        [req.user.id, 'loss', cost, bonusUse > 0 ? 'bonus' : 'real', `🃏 Card Game LOSS — Ace was at ${ace_position}`]);
    }

    await db.query('INSERT INTO game_history (user_id,game,bet,result,payout) VALUES (?,?,?,?,?)',
      [req.user.id, 'cards', cost, `Picked:${pick} Ace:${ace_position}`, is_win ? prize : 0]);

    const [u] = await db.query('SELECT coins, bonus_coins FROM users WHERE id=?', [req.user.id]);
    res.json({
      success: true,
      is_win,
      ace_position,
      picked_card: pick,
      prize: is_win ? prize : 0,
      message: is_win ? `🎉 Ekka mila! +🪙${prize}` : `😢 Ace ${ace_position === 0 ? 'pehle' : ace_position === 1 ? 'doosre' : 'teesre'} card mein tha!`,
      coins: parseInt(u[0].coins),
      bonus_coins: parseInt(u[0].bonus_coins),
      total_coins: parseInt(u[0].coins) + parseInt(u[0].bonus_coins)
    });
  } catch(e) { res.json({ success: false, message: e.message }); }
});