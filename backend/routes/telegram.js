const express = require('express');
const router = express.Router();
const db = require('../config/db');
const https = require('https');

const TELEGRAM_TOKEN = '8676809520:AAF1M-RQWTAm-7xiRH-96jbAS2n-hIQ1ns8';

function editMessage(chatId, messageId, newText) {
  const data = JSON.stringify({ chat_id: chatId, message_id: messageId, text: newText, parse_mode: 'HTML' });
  const req = https.request({ hostname: 'api.telegram.org', port: 443, path: `/bot${TELEGRAM_TOKEN}/editMessageText`, method: 'POST', headers: { 'Content-Type': 'application/json' } });
  req.write(data); req.end();
}

function answerCallback(queryId, text) {
  const data = JSON.stringify({ callback_query_id: queryId, text: text });
  const req = https.request({ hostname: 'api.telegram.org', port: 443, path: `/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, method: 'POST', headers: { 'Content-Type': 'application/json' } });
  req.write(data); req.end();
}

// ✅ Yeh route bina kisi Auth ke open hona chahiye taaki Telegram access kar sake
router.post('/webhook', async (req, res) => {
  if (req.body.callback_query) {
    const cb = req.body.callback_query;
    const [action, reqId] = cb.data.split('_'); // e.g., "approve", "105"
    const chatId = cb.message.chat.id;
    const msgId = cb.message.message_id;
    const oldText = cb.message.text;

    try {
      const [deps] = await db.query('SELECT * FROM deposit_requests WHERE id=?', [reqId]);
      if (!deps.length) {
        answerCallback(cb.id, 'Request Not Found!');
        return res.send('OK');
      }

      const dep = deps[0];
      if (dep.status !== 'pending') {
        answerCallback(cb.id, 'Already Processed!');
        editMessage(chatId, msgId, oldText + `\n\n⚠️ <i>Already ${dep.status.toUpperCase()}</i>`);
        return res.send('OK');
      }

      const isWithdraw = dep.type === 'withdraw';
      await db.query('UPDATE deposit_requests SET status=? WHERE id=?', [action === 'approve' ? 'approved' : 'rejected', dep.id]);

      if (action === 'approve') {
        if (isWithdraw) {
          await db.query('INSERT INTO transactions (user_id,type,amount,coin_type,description) VALUES (?,?,?,?,?)', [dep.user_id, 'withdraw', dep.amount, 'real', `📤 Withdrawal Approved ₹${dep.amount}`]);
        } else {
          await db.query('UPDATE users SET coins=coins+? WHERE id=?', [dep.amount, dep.user_id]);
          await db.query('INSERT INTO transactions (user_id,type,amount,coin_type,description) VALUES (?,?,?,?,?)', [dep.user_id, 'deposit', dep.amount, 'real', `📥 Deposit Approved ₹${dep.amount}`]);
        }
        answerCallback(cb.id, '✅ Approved!');
        editMessage(chatId, msgId, oldText + `\n\n✅ <b>APPROVED BY ADMIN</b>`);
      } else {
        if (isWithdraw) {
          await db.query('UPDATE users SET coins=coins+?, withdrawable_coins=withdrawable_coins+? WHERE id=?', [dep.amount, dep.amount, dep.user_id]);
          await db.query('INSERT INTO transactions (user_id,type,amount,coin_type,description) VALUES (?,?,?,?,?)', [dep.user_id, 'refund', dep.amount, 'real', `❌ Withdrawal Rejected - Refund ₹${dep.amount}`]);
        } else {
          await db.query('INSERT INTO transactions (user_id,type,amount,coin_type,description) VALUES (?,?,?,?,?)', [dep.user_id, 'refund', dep.amount, 'real', `❌ Deposit Rejected ₹${dep.amount}`]);
        }
        answerCallback(cb.id, '❌ Rejected & Refunded!');
        editMessage(chatId, msgId, oldText + `\n\n❌ <b>REJECTED BY ADMIN</b>`);
      }
    } catch (e) { console.error("Webhook Error:", e); }
  }
  res.send('OK'); // Telegram ko hamesha 'OK' bhejna hota hai
});

module.exports = router;