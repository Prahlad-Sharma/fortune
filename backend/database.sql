CREATE DATABASE IF NOT EXISTS lucky_fortune_casino CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lucky_fortune_casino;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  coins DECIMAL(15,2) DEFAULT 0,
  bonus_coins DECIMAL(15,2) DEFAULT 0,
  role ENUM('user','admin') DEFAULT 'user',
  avatar VARCHAR(10) DEFAULT '🎰',
  refer_code VARCHAR(20) UNIQUE,
  referred_by INT DEFAULT NULL,
  total_wins INT DEFAULT 0,
  total_bets INT DEFAULT 0,
  total_referrals INT DEFAULT 0,
  is_banned TINYINT(1) DEFAULT 0,
  last_bonus_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(30) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  coin_type ENUM('real','bonus') DEFAULT 'real',
  description TEXT,
  status VARCHAR(20) DEFAULT 'completed',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deposit_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('deposit','withdraw') DEFAULT 'deposit',
  amount DECIMAL(15,2) NOT NULL,
  payment_method VARCHAR(50) DEFAULT 'UPI',
  payment_proof VARCHAR(255),
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS game_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  game VARCHAR(30) NOT NULL,
  bet DECIMAL(15,2) NOT NULL,
  payout DECIMAL(15,2) DEFAULT 0,
  result TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wingo_bets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  period_number VARCHAR(30) NOT NULL,
  user_id INT NOT NULL,
  bet_type VARCHAR(20) NOT NULL,
  bet_value VARCHAR(20) NOT NULL,
  bet_amount DECIMAL(15,2) NOT NULL,
  status ENUM('pending','won','lost') DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wingo_periods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  period_number VARCHAR(30) UNIQUE NOT NULL,
  result_number INT,
  result_color VARCHAR(10),
  result_size VARCHAR(10),
  admin_override INT DEFAULT NULL,
  status ENUM('open','closed') DEFAULT 'open',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS referrals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  referrer_id INT NOT NULL,
  referred_id INT NOT NULL,
  bonus_given INT DEFAULT 150,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(50) UNIQUE NOT NULL,
  setting_value TEXT
);

CREATE TABLE IF NOT EXISTS game_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  game_name VARCHAR(30) UNIQUE NOT NULL,
  is_enabled TINYINT(1) DEFAULT 1
);

-- Default settings
INSERT IGNORE INTO site_settings (setting_key, setting_value) VALUES
  ('upi_id', 'luckycasino@upi'),
  ('site_name', 'Lucky Fortune Casino'),
  ('site_url', 'http://localhost:5173'),
  ('telegram_link', '');

INSERT IGNORE INTO game_settings (game_name, is_enabled) VALUES
  ('aviator', 1), ('slots', 1), ('wingo', 1), ('cards', 1), ('jackpot', 1);

-- Add withdrawable coins column (only game winnings)
ALTER TABLE users ADD COLUMN IF NOT EXISTS withdrawable_coins DECIMAL(15,2) DEFAULT 0;

-- Run this if upgrading existing DB:
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS withdrawable_coins DECIMAL(15,2) DEFAULT 0;
