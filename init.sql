-- データベースが存在しない場合のみ作成
CREATE DATABASE IF NOT EXISTS event_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE event_system;

-- users テーブル
CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    social_id VARCHAR(255) NULL, -- ソーシャルログイン用ID (NULL許容)
    mail VARCHAR(255) NOT NULL UNIQUE,
    pass VARCHAR(255) NOT NULL, -- ハッシュ化されたパスワード
    user_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- organizers テーブル
CREATE TABLE IF NOT EXISTS organizers (
    organizer_id INT AUTO_INCREMENT PRIMARY KEY,
    social_id VARCHAR(255) NULL, -- ソーシャルログイン用ID (NULL許容)
    mail VARCHAR(255) NOT NULL UNIQUE,
    pass VARCHAR(255) NOT NULL, -- ハッシュ化されたパスワード
    organizer_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- events テーブル
CREATE TABLE IF NOT EXISTS events (
    event_id INT AUTO_INCREMENT PRIMARY KEY,
    organizer_id INT NOT NULL,
    event_name VARCHAR(255) NOT NULL,
    description TEXT,
    date DATETIME NOT NULL, -- イベント開催日時
    price DECIMAL(10, 2) NOT NULL DEFAULT 0.00, -- 通常価格
    rate_per_click DECIMAL(10, 2) NOT NULL DEFAULT 0.00, -- 1クリックあたりの割引"額"
    max_discount_rate DECIMAL(5, 2) NOT NULL DEFAULT 100.00, -- 最大割引"率" (%)
    expirate DATETIME NOT NULL, -- クリックカウント有効期限
    flyer VARCHAR(255) NOT NULL, -- フライヤー画像のパス (例: /uploads/flyer_image.jpg)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (organizer_id) REFERENCES organizers(organizer_id) ON DELETE CASCADE -- 主催者が削除されたらイベントも削除
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- click_logs テーブル
CREATE TABLE IF NOT EXISTS click_logs (
    click_id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    user_id INT NOT NULL, -- 紹介元ユーザーID
    ip_address VARCHAR(45) NOT NULL, -- IPv4/IPv6対応
    clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE, 
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE, 
    UNIQUE KEY uniq_click_per_day (event_id, user_id, ip_address, DATE(clicked_at)) 
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 必要に応じてインデックスを追加
ALTER TABLE events ADD INDEX idx_date (date);
ALTER TABLE events ADD INDEX idx_organizer_id (organizer_id);
ALTER TABLE click_logs ADD INDEX idx_user_event (user_id, event_id);

-- --- サンプルデータ (任意) ---
-- -- パスワードは 'password' をハッシュ化したもの (bcryptで生成したものに置き換える)
-- -- 例: $2b$10$examplehash... (実際のハッシュ値を使うこと)
-- INSERT INTO users (mail, pass, user_name) VALUES
-- ('user1@example.com', '$2b$10$dummyhash1...', 'テストユーザー1'),
-- ('user2@example.com', '$2b$10$dummyhash2...', 'テストユーザー2');

-- INSERT INTO organizers (mail, pass, organizer_name) VALUES
-- ('org1@example.com', '$2b$10$dummyhash3...', 'テスト主催者1');

-- INSERT INTO events (organizer_id, event_name, description, date, price, rate_per_click, max_discount_rate, expirate, flyer) VALUES
-- (1, '春の技術交流会', 'エンジニア向けの交流イベントです。', '2025-05-15 19:00:00', 3000.00, 100.00, 50.00, '2025-05-14 23:59:59', '/uploads/tech_event.jpg'),
-- (1, 'デザイン勉強会', '最新のデザインツールについて学びます。', '2025-06-10 18:30:00', 1500.00, 50.00, 100.00, '2025-06-09 23:59:59', '/uploads/design_study.png');