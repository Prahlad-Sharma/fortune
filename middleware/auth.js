const jwt = require('jsonwebtoken');
const db = require('../config/db');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [decoded.id]);
    if (!rows.length) return res.status(401).json({ success: false, message: 'User not found' });
    if (rows[0].is_banned) return res.status(403).json({ success: false, message: 'Account banned' });
    req.user = rows[0];
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

const adminMiddleware = async (req, res, next) => {
  await authMiddleware(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    next();
  });
};

module.exports = { authMiddleware, adminMiddleware };
