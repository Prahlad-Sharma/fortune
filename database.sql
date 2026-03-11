-- ====================================
-- Lucky Fortune Casino - Full Schema
-- ====================================
CREATE DATABASE IF NOT EXISTS lucky_fortune_casino CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lucky_fortune_casino;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  coins BIGINT DEFAULT 0,            -- REAL coins (withdrawable)
  bonus_coins BIGINT DEFAULT 100,    -- BONUS coins (NOT withdrawable)
  role ENUM('user','admin') DEFAULT 'user',
  is_banned TINYINT DEFAULT 0,
  total_wins INT DEFAULT 0,
  total_bets INT DEFAULT 0,
  avatar VARCHAR(10) DEFAULT '🎰',
  refer_code VARCHAR(20) UNIQUE,
  referred_by INT DEFAULT NULL,
  total_referrals INT DEFAULT 0,
  last_bonus_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('deposit','win','loss','bonus','daily_bonus','refer_bonus','admin_add') NOT NULL,
  amount BIGINT NOT NULL,
  coin_type ENUM('real','bonus') DEFAULT 'real',
  description VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS game_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  game VARCHAR(50) NOT NULL,
  bet BIGINT NOT NULL,
  result VARCHAR(255),
  payout BIGINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deposit_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('deposit','withdraw') DEFAULT 'deposit',
  amount BIGINT NOT NULL,
  payment_method VARCHAR(100) DEFAULT 'UPI',
  payment_proof VARCHAR(255),
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wingo_periods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  period_number VARCHAR(20) UNIQUE NOT NULL,
  result_number INT DEFAULT NULL,
  result_color VARCHAR(10) DEFAULT NULL,
  result_size VARCHAR(10) DEFAULT NULL,
  admin_override INT DEFAULT NULL,   -- Admin sets this 0-9 to force result
  status ENUM('open','closed') DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wingo_bets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  period_number VARCHAR(20) NOT NULL,
  bet_type ENUM('color','number','size') NOT NULL,
  bet_value VARCHAR(10) NOT NULL,
  bet_amount BIGINT NOT NULL,
  payout BIGINT DEFAULT 0,
  status ENUM('pending','won','lost') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS referrals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  referrer_id INT NOT NULL,
  referred_id INT NOT NULL,
  bonus_given INT DEFAULT 150,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (referred_id)  REFERENCES users(id) ON DELETE CASCADE
);

-- Admin account (password: admin123)
INSERT IGNORE INTO users (username,email,password,coins,bonus_coins,role,refer_code)
VALUES ('admin','admin@casino.com','$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',999999,0,'admin','ADMIN000');

-- Game on/off settings
CREATE TABLE IF NOT EXISTS game_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  game_name VARCHAR(30) UNIQUE NOT NULL,
  is_enabled TINYINT DEFAULT 1,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
INSERT IGNORE INTO game_settings (game_name, is_enabled) VALUES ('slots',1),('wingo',1),('cards',1),('jackpot',1);

-- Site settings (UPI, site URL etc)
CREATE TABLE IF NOT EXISTS site_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(50) UNIQUE NOT NULL,
  setting_value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
INSERT IGNORE INTO site_settings (setting_key, setting_value) VALUES
  ('upi_id', 'luckycasino@upi'),
  ('site_url', 'http://localhost:5000'),
  ('site_name', 'Lucky Fortune Casino');
