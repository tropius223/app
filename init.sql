-- データベースが存在しない場合のみ作成
CREATE DATABASE IF NOT EXISTS event_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE event_system;

-- 既存のテーブルを依存関係を考慮して削除し、クリーンな状態から再作成する
DROP TABLE IF EXISTS click_logs;
DROP TABLE IF EXISTS user_rewards;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS organizers;

-- users テーブル
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    social_id VARCHAR(255) NULL UNIQUE,
    mail VARCHAR(255) NULL,
    pass VARCHAR(255) NULL,
    user_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- organizers テーブル
CREATE TABLE organizers (
    organizer_id INT AUTO_INCREMENT PRIMARY KEY,
    social_id VARCHAR(255) NULL UNIQUE,
    mail VARCHAR(255) NULL,
    pass VARCHAR(255) NULL,
    organizer_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- events テーブル (新しい特典の仕様)
CREATE TABLE events (
    event_id INT AUTO_INCREMENT PRIMARY KEY,
    organizer_id INT NOT NULL,
    event_name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    date DATETIME NOT NULL,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    expirate DATETIME NOT NULL,
    flyer VARCHAR(255) NOT NULL,
    reward_type ENUM('discount', 'goods', 'drink') NOT NULL DEFAULT 'discount',
    reward_value VARCHAR(255) NOT NULL,
    clicks_for_reward INT NOT NULL DEFAULT 1,
    max_rewards INT NOT NULL DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (organizer_id) REFERENCES organizers(organizer_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- user_rewards テーブル (新規)
CREATE TABLE user_rewards (
    user_reward_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    event_id INT NOT NULL,
    reward_type ENUM('discount', 'goods', 'drink') NOT NULL,
    reward_value VARCHAR(255) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    is_claimed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- click_logs テーブル
CREATE TABLE click_logs (
    click_id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    user_id INT NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE KEY `uniq_click` (`event_id`, `user_id`, `ip_address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- インデックス
ALTER TABLE events ADD INDEX idx_date (date);
ALTER TABLE events ADD INDEX idx_organizer_id (organizer_id);
ALTER TABLE click_logs ADD INDEX idx_user_event (user_id, event_id);

