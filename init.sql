-- データベースが存在しない場合のみ作成
CREATE DATABASE IF NOT EXISTS event_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE event_system;

-- users テーブル (修正)
CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    social_id VARCHAR(255) NULL UNIQUE, -- ★ UNIQUE制約追加
    mail VARCHAR(255) NULL,             -- ★ NULL許容に変更, UNIQUE削除
    pass VARCHAR(255) NULL,             -- ★ NULL許容に変更
    user_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- organizers テーブル (修正)
CREATE TABLE IF NOT EXISTS organizers (
    organizer_id INT AUTO_INCREMENT PRIMARY KEY,
    social_id VARCHAR(255) NULL UNIQUE, -- ★ UNIQUE制約追加
    mail VARCHAR(255) NULL,             -- ★ NULL許容に変更, UNIQUE削除
    pass VARCHAR(255) NULL,             -- ★ NULL許容に変更
    organizer_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- events テーブル (修正)
CREATE TABLE IF NOT EXISTS events (
    event_id INT AUTO_INCREMENT PRIMARY KEY,
    organizer_id INT NOT NULL,
    event_name VARCHAR(255) NOT NULL,
    description TEXT NULL, -- ★ NULL許容を明記
    date DATETIME NOT NULL,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    rate_per_click DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    max_discount_rate DECIMAL(5, 2) NOT NULL DEFAULT 100.00,
    expirate DATETIME NOT NULL,
    flyer VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (organizer_id) REFERENCES organizers(organizer_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- click_logs テーブル (修正)
CREATE TABLE IF NOT EXISTS click_logs (
    click_id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    user_id INT NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    -- ★ UNIQUE KEY をシンプルに変更 (event_id, user_id, ip_address の組み合わせで一意) ★
    UNIQUE KEY `uniq_click` (`event_id`, `user_id`, `ip_address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- インデックス (変更なし)
ALTER TABLE events ADD INDEX idx_date (date);
ALTER TABLE events ADD INDEX idx_organizer_id (organizer_id);
ALTER TABLE click_logs ADD INDEX idx_user_event (user_id, event_id);

-- --- サンプルデータ (任意) ---
-- (変更なし、必要なら social_id を使うなど修正)
