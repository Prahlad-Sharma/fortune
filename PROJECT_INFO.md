# 🎰 Lucky Fortune Casino — Project Info
> Yeh file Claude ko upload karo jab bhi nayi session start karo — sab context mil jayega.
> Last Updated: Chicken Road v2 (Realistic UI + Top-to-Bottom Vehicles + Barricades)

---

## 📌 Project Name: Lucky Fortune Casino
## 🗂️ Stack: Node.js + Express + MySQL (port 5000) | Single HTML frontend

---

## 📁 File Structure
```
casino/
├── public/
│   └── index.html        ← Poora frontend (2600+ lines, single file)
├── server.js             ← Main Express server
├── .env                  ← DB credentials + JWT secret
├── database.sql          ← Full MySQL schema
├── config/
│   └── db.js             ← MySQL pool connection
├── middleware/
│   └── auth.js           ← JWT verify middleware
├── routes/
│   ├── auth.js           ← Login, Register, Daily Bonus, Profile, Avatar
│   ├── games.js          ← Slots, Wingo, Cards, Jackpot, Chicken Road
│   ├── wallet.js         ← Balance, Deposit, Withdraw, History, Leaderboard
│   └── admin.js          ← Admin panel: users, payments, game toggles, settings
└── PROJECT_INFO.md       ← Yeh file
```

---

## 🔐 Credentials & Config

| Item | Value |
|------|-------|
| Admin Login | `admin` / `admin123` |
| JWT Secret | `LuckyFortune_SuperSecret_2024_Casino` |
| DB Name | `lucky_fortune_casino` |
| Server Port | `5000` |
| Coin Rate | 1 coin = ₹1 |

---

## 💰 Coin System (IMPORTANT)

| Type | Source | Withdrawable? | Bet Usage |
|------|--------|---------------|-----------|
| **Real Coins** | Deposit / Win | ✅ Yes | Full bet |
| **Bonus Coins** | Daily / Joining / Refer | ❌ No | Max 10% of bet |

- Bonus coins sirf game mein use hote hain, withdraw nahi ho sakte
- Bet ka max 10% bonus se deduct ho sakta hai, baaki real coins se

---

## 🎁 Bonus System

| Bonus | Amount | Condition |
|-------|--------|-----------|
| Joining Bonus | 🪙 50 bonus coins | Sirf refer code se join karne par milta hai |
| Daily Bonus | 🪙 50 bonus coins | Har 24 ghante mein, login ke baad |
| Refer Bonus | 🪙 150 bonus coins | Jab koi tumhara refer code use kare |

- Invalid refer code dalne par register **block** hota hai (error deta hai)
- Daily bonus: 100 se reduce karke 50 kiya gaya

---

## 🎮 Games — Complete List

### 1. 🎰 Slots
- **Route:** `POST /games/slots/spin`
- **Bet:** 10–5000 coins
- **Symbols:** 🍒🍋🍊🍇💎⭐🎰 (weighted)
- **Animation:** 5-second real reel spin, staggered stops (1.2s, 1.7s, 2.2s)
- **Sound:** Casino melody during spin, click per reel, win jingle
- **Gold center line** = winning line marker

### 2. 🎨 Wingo (Color Prediction)
- **Route:** `POST /games/wingo/bet` | `POST /games/wingo/resolve`
- **Bet:** Min 10 coins
- **Period:** 2-minute countdown, frontend-triggered resolve
- **Payouts:** Red/Green=2x | Violet=5x | Small/Big=2x | Number(0–9)=9x
- **Fixed:** game_history INSERT hota hai win+loss dono ke liye
- **Toast:** Sirf betting users ko dikhega

### 3. 🃏 Cards (Find the Ace)
- **Route:** `POST /games/cards/play`
- **Cost:** 20 coins | **Prize:** 50 coins | **Chance:** 1/3

### 4. 💎 Jackpot Lotto
- **Route:** `POST /games/jackpot/buy`
- **Cost:** 100 coins | **Prizes:** 50 / 150 / 300 coins

### 5. 🐔 Chicken Road *(v2 — LATEST)*
- **Routes:** `POST /games/chicken/start` + `POST /games/chicken/end`
- **Bet:** 10–5000 coins

#### Visual Layout (reference image accurate):
- Horizontal road, chicken moves LEFT → RIGHT
- 3 sub-lanes with dashed dividers
- 10 multiplier coin columns on road (circular coins: idle/active/passed states)
- **Vehicles: TOP → BOTTOM only** (emoji rotated 90°, like top-down traffic)
- **Barricades:** CSS-rendered striped orange-black board + 2 metal legs, appear ABOVE safe coin with drop animation

#### Multipliers (0.40x → 100x):
```
Easy:     0.40 → 0.70 → 1.02 → 1.40 → 2.10 → 3.20 → 5.00 → 9.00 → 20x → 45x
Medium:   0.40 → 0.70 → 1.02 → 1.60 → 2.80 → 5.20 → 10x  → 22x  → 50x → 100x
Hard:     0.40 → 0.70 → 1.02 → 1.90 → 3.80 → 8.00 → 18x  → 38x  → 75x → 100x
Hardcore: 0.40 → 0.70 → 1.02 → 2.10 → 5.50 → 14x  → 30x  → 55x  → 85x → 100x
```

#### Crash Probability per step:
```
Easy:     8% → 10% → 12% → 15% → 17% → 20% → 22% → 25% → 28% → 30%
Medium:   15% → 19% → 23% → 28% → 33% → 39% → 45% → 52% → 59% → 66%
Hard:     24% → 30% → 36% → 43% → 50% → 57% → 64% → 71% → 77% → 83%
Hardcore: 38% → 46% → 54% → 62% → 69% → 76% → 82% → 87% → 91% → 94%
```

#### Vehicle Spawn Speed by Difficulty:
- Easy: 1800ms spawn / 1500ms travel
- Medium: 1300ms / 1100ms
- Hard: 850ms / 800ms
- Hardcore: 500ms / 550ms

#### Bottom Panel:
- Difficulty: Easy / Medium / Hard / Hardcore
- Bet chips: 50 / 100 / 500 / 1K + custom input
- **CASH OUT** button with live coin amount shown
- **GO / NEXT ▶** button

---

## 🖥️ Frontend — Pages & Navigation

### Bottom Tab Bar:
`HOME | WALLET | HISTORY | RANKS | REFER`

### All Pages (single HTML file):
`home, slots, wingo, cards, jackpot, chicken, wallet, leaderboard, gamehistory, refer, profile, admin`

### Home Grid:
5 games in 2-column grid — Chicken Road = 5th card

---

## 🎨 UI/UX Features

### Header:
- Left: Emoji Avatar + Username + Real 🪙 + Bonus 🎁 balance
- Right: Telegram button (blue, SVG logo) + `+` deposit button
- `+` → opens deposit form directly

### Avatar System:
- 30 emoji avatars, username-initial se default
- Profile bottom sheet picker
- Synced: header + profile hero + profile mini

### Login Animation:
- Full-screen overlay + spinning 🪙 + progress bar + casino sound

### Favicon: 🎰 emoji

---

## 👤 Profile Page (3-section Accordion)

1. **✏️ Edit Profile** — Avatar + Username + Email
2. **🔐 Change Password**
3. **📱 Customer Support** — Telegram link from admin settings

Footer: 🎰 + site name (from admin DB) + "Developed by Lucky Fortune · 2025"

---

## 💳 Wallet Page Sections

- **Deposit History** — deposits only
- **Withdraw History** — withdrawals only
- **💳 Bonus & Admin** — daily bonus, refer bonus, admin-added coins (NO game transactions)

---

## 📜 Game History Tab

Filters: `🎮 All | 🎰 Slots | 🎨 Wingo | 🃏 Cards | 💎 Jackpot | 🐔 Chicken`

Each row: icon + bet + net gain/loss | Win=green border | Loss=red border

---

## ⚙️ Admin Panel

- Users list, add coins, block users
- Approve/Reject deposits & withdrawals
- **Payment Settings:** UPI ID + Site Name/URL + 📱 Telegram Support Link
- **Game Toggles:** Slots / Wingo / Cards / Jackpot / Chicken Road (ON/OFF)

---

## 🗄️ Key Database Tables

| Table | Purpose |
|-------|---------|
| `users` | id, username, email, password, coins, bonus_coins, avatar, refer_code, referred_by, role |
| `transactions` | id, user_id, type, amount, status, description, created_at |
| `game_history` | id, user_id, game, bet_amount, win_amount, result, created_at |
| `wingo_bets` | id, period, user_id, bet_type, bet_value, bet_amount, status |
| `wingo_results` | id, period, number, color, size, created_at |
| `site_settings` | key, value — (upi_id, site_name, site_url, telegram_link) |
| `game_settings` | game, enabled — (slots/wingo/cards/jackpot/chicken) |

---

## 📡 API Routes Reference

```
POST /auth/login
POST /auth/register
POST /auth/daily-bonus
GET  /auth/profile
PUT  /auth/profile              ← avatar bhi save hota hai

POST /games/slots/spin
POST /games/wingo/bet
POST /games/wingo/resolve
POST /games/cards/play
POST /games/jackpot/buy
POST /games/chicken/start       ← bet deduct karta hai
POST /games/chicken/end         ← win pay karta hai ya loss log karta hai

GET  /wallet/balance
GET  /wallet/transactions
POST /wallet/deposit
POST /wallet/withdraw
GET  /wallet/leaderboard
GET  /wallet/game-history

GET  /admin/users
POST /admin/add-coins
GET  /admin/deposits
POST /admin/approve-deposit
POST /admin/reject-deposit
GET  /admin/payment-settings
POST /admin/payment-settings    ← telegram_link bhi save hota hai
GET  /admin/game-settings
POST /admin/game-settings
```

---

## 🐛 All Bug Fixes (Cumulative)

| Bug | Fix Applied |
|-----|-------------|
| Wingo game_history never inserted | INSERT added in resolve loop (win+loss dono) |
| Telegram link not saving in admin | savePaySettings mein ST.siteSettings update + updateTgBtn() |
| Wallet showing game transactions | loadTx() filters to wallet-only types |
| History filter buttons invisible | flex-shrink:0, min-height, CSS fixed |
| Any fake refer code accepted | Returns error if code not in DB |
| Chicken vehicles left-right | Changed to TOP→BOTTOM (rotate 90°) |
| Barricades wrong position/style | CSS rebuilt: striped board + metal legs, placed ABOVE safe coin |
| Joining bonus given to all | Now sirf refer code wale users ko milta hai |

---

## ✅ Pending / TODO

- [ ] Wingo server-side auto-resolve (abhi frontend timer se)
- [ ] Email on deposit approval
- [ ] Push notifications for Wingo result
- [ ] Refer leaderboard
- [ ] Daily withdrawal limit

---

## 💡 Next Session Mein Kaise Resume Karein

1. **Yeh `PROJECT_INFO.md` Claude ko upload karo**
2. Latest output files bhi do: `index.html`, `games.js`, `auth.js`, `admin.js`
3. Kaho: *"Yeh mera Lucky Fortune Casino project hai, [jo change chahiye] karna hai"*

**Claude apne outputs yahan save karta hai: `/mnt/user-data/outputs/`**