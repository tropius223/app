# イベント紹介割引システム

## 概要

この Web アプリケーションは、イベント主催者（オーガナイザー）と参加者（ユーザー）向けのシステムです。
オーガナイザーはイベント情報を登録でき、ユーザーはそのイベントの紹介リンクを生成・共有できます。
紹介リンクがクリックされると、その回数に応じて紹介元のユーザーがイベント参加費の割引を受けられます。

ログイン/登録は Google, Facebook, LINE のソーシャルアカウントを利用します。。
新規オーガナイザー登録には、別途管理者から提供される招待コードが必要です。

## 主な機能

### オーガナイザー向け

* ソーシャルアカウント (Google, Facebook, LINE) での登録・ログイン
    * 注意: 初回のソーシャルアカウントでのオーガナイザー登録には招待コードが必要です。
* 新規イベントの登録
    * イベント名、開催日時、通常価格、1クリックあたりの割引率(%)、最大割引率(%)、クリック有効期限、フライヤー画像（アップロード）
* 登録済みイベントの一覧表示
    * 開催日から 30 日以上経過したイベントは自動的に非表示になります。
* イベントの削除
    * 注意: そのイベントに対するクリックログが 1 件以上存在する場合は削除できません。
* 割引状況サマリーの表示
    * イベント別、紹介ユーザー（エンドユーザー）別に、クリック数、割引率、割引額、最終支払額を確認できます。
    * 開催日から 30 日以上経過したイベントのサマリーは表示されません。
    * イベント名での絞り込みが可能です。

### ユーザー（エンドユーザー）向け

* ソーシャルアカウント (Google, Facebook, LINE) での登録・ログイン
* 開催予定イベントの一覧表示
* イベントごとの紹介リンク生成
* 紹介リンクの共有機能
    * クリップボードへコピー
    * Twitter で共有
    * LINE で共有
    * QR コード表示
* 自身の紹介活動による割引情報の確認
    * イベントごとに、有効クリック数、割引額、割引後の支払額、元価格を一覧表示します。

### 紹介リンククリック処理

* 紹介リンクからアクセスすると、イベントのフライヤー画像と詳細が表示されます。
* アクセス時にクリックログ（イベントID、紹介元ユーザーID、IPアドレス）が記録されます。
    * 同一イベント・同一紹介元・同一IPアドレスからの短期間での重複記録は防止されます（DB制約およびCookie）。
    * イベントごとに設定されたクリック有効期限 (`expirate`) を過ぎたクリックはカウントされません。

## 技術スタック

* **バックエンド:** Node.js, Express.js
* **データベース:** MySQL 8.0
* **認証:** JWT (JSON Web Tokens) via HttpOnly Cookies, Passport.js (Google, Facebook, LINE Strategy)
* **ファイルアップロード:** Multer
* **フロントエンド:** Vanilla JavaScript, HTML5, CSS3
* **コンテナ化:** Docker, Docker Compose
* **開発環境:** GitHub Codespace (主な動作環境として想定)

## ディレクトリ構造
├── public/             # フロントエンドファイル (HTML, CSS, JS, Libs) 静的配信
│   ├── lib/            # フロントエンド用ライブラリ (例: qrcode.min.js)
│   └── uploads/        # アップロードされたフライヤー画像 (ブラウザからは /uploads/ でアクセス)
├── Dockerfile          # Node.js アプリケーションのイメージ定義
├── docker-compose.yml  # 各サービス (app, db, phpmyadmin) の定義
├── app.js              # バックエンド Express アプリケーション本体
├── init.sql            # データベーススキーマ初期化用SQL
├── package.json        # Node.js 依存パッケージ定義
├── .env                # 環境変数ファイル (要作成)
├── .gitignore          # Git 管理除外ファイル定義
└── README.md           # このファイル

## セットアップと実行方法

**前提条件:**

* Docker および Docker Compose がインストールされていること。
* Google, Meta (Facebook), LINE の開発者アカウントがあり、各プラットフォームでアプリ登録・認証情報取得が可能であること。

**手順:**

1.  **リポジトリのクローン:** (もし Git リポジトリがあれば)
    ```bash
    git clone <repository_url>
    cd <repository_directory>
    ```

2.  **環境変数ファイル `.env` の作成:**
    * プロジェクトのルートディレクトリに `.env` という名前のファイルを作成します。
    * 以下の内容を参考に、必要な値を設定してください。**`<...>` や `YOUR_...` の部分は実際の値に置き換えてください。**
        ```dotenv
        # データベース接続情報 (docker-compose.yml の設定に合わせる)
        DB_HOST=db
        DB_USER=user           # docker-compose.yml で設定したユーザー名
        DB_PASSWORD=password       # ★★★ 強力なパスワードを設定 ★★★
        DB_DATABASE=event_system # docker-compose.yml で設定したDB名
        DB_PORT=3306

        # JWT & Cookie Secrets (★ ランダムで強力な文字列を生成して設定 ★)
        JWT_SECRET=YOUR_JWT_STRONG_SECRET
        JWT_EXPIRES_IN=1d
        COOKIE_SECRET=YOUR_COOKIE_STRONG_SECRET

        # サーバーポート
        PORT=3000

        # Google OAuth Credentials (Google Cloud Console で取得)
        GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
        GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
        # ↓ Codespace のポート3000転送URL + /auth/google/callback
        GOOGLE_CALLBACK_URL=https://<YOUR_CODESPACE_NAME>-3000.app.github.dev/auth/google/callback

        # Facebook App Credentials (Meta for Developers で取得)
        FACEBOOK_APP_ID=YOUR_FACEBOOK_APP_ID
        FACEBOOK_APP_SECRET=YOUR_FACEBOOK_APP_SECRET
        # ↓ Codespace のポート3000転送URL + /auth/facebook/callback
        FACEBOOK_CALLBACK_URL=https://<YOUR_CODESPACE_NAME>-3000.app.github.dev/auth/facebook/callback

        # LINE Login Credentials (LINE Developers Console で取得)
        LINE_CHANNEL_ID=YOUR_LINE_CHANNEL_ID
        LINE_CHANNEL_SECRET=YOUR_LINE_CHANNEL_SECRET
        # ↓ Codespace のポート3000転送URL + /auth/line/callback
        LINE_CALLBACK_URL=https://<YOUR_CODESPACE_NAME>-3000.app.github.dev/auth/line/callback

        # Session Secret (★ ランダムで強力な文字列を生成して設定 ★)
        SESSION_SECRET=YOUR_SESSION_STRONG_SECRET

        # Organizer Invitation Code (新規オーガナイザー登録用)
        ORGANIZER_INVITE_CODE=SET_YOUR_INVITE_CODE_HERE
        ```
    * **注意:** `<YOUR_CODESPACE_NAME>` は実際の Codespace の URL に合わせてください。各ソーシャルログインの認証情報とコールバック URL は、それぞれの開発者プラットフォームで取得・設定したものと一致させる必要があります。

3.  **ソーシャルログイン設定:**
    * Google Cloud Console, Meta for Developers, LINE Developers Console でアプリケーションを登録し、必要な API を有効化してください。
    * 各プラットフォームで、「承認済みの JavaScript 生成元」（例: `https://<YOUR_CODESPACE_NAME>-3000.app.github.dev`）と「有効な OAuth リダイレクト URI」（`.env` に設定したコールバック URL）を正しく設定してください。
    * 必要なスコープ（`profile`, `email`, `openid` など）を有効化してください（Facebook/LINE の email スコープは別途申請が必要な場合があります）。

4.  **データベーススキーマ:**
    * `init.sql` ファイルが、コンテナ初回起動時に `db` サービスによって自動的に実行され、テーブルが作成されます。
    * `users` と `organizers` テーブルの `mail` カラムと `pass` カラムが `NULL` を許容し、`social_id` カラムが存在することを確認してください。

5.  **依存関係のインストール:** (通常 Docker ビルド時に行われる)
    ```bash
    npm install
    ```

6.  **Docker イメージのビルドとコンテナの起動:**
    * **初回または依存関係変更時:** `--no-cache` オプションを付けてビルドし、依存関係を確実にインストールします。
        ```bash
        docker-compose build --no-cache app
        docker-compose up -d
        ```
    * **通常の起動:**
        ```bash
        docker-compose up -d
        ```
    * **ログの確認:**
        ```bash
        docker-compose logs -f app
        ```
    * **停止:**
        ```bash
        docker-compose down
        ```

## アプリケーションへのアクセス (Codespace 環境)

* **Web アプリケーション:** `docker-compose up -d` 実行後、Codespace の「ポート」タブで **ポート 3000** に転送されたアドレス（例: `https://<YOUR_CODESPACE_NAME>-3000.app.github.dev/`）をブラウザで開きます。最初に `/login.html` にアクセスしてください。
* **phpMyAdmin:** 「ポート」タブで **ポート 8080** に転送されたアドレスを開くと phpMyAdmin にアクセスできます。ログイン情報は `.env` または `docker-compose.yml` で設定したデータベースの認証情報を使用します（サーバー名: `db`, ユーザー名: `root` または `user`）。

## 使い方

1.  **オーガナイザーとして利用:**
    * ログインページの「オーガナイザーとしてログイン」タブを選択します。
    * Google, Facebook, LINE のいずれかのボタンをクリックします。
    * 各サービスの認証を行います。
    * **初回登録の場合のみ、** `/register/organizer/invite` ページにリダイレクトされるので、管理者から提供された招待コード (`.env` の `ORGANIZER_INVITE_CODE`) を入力して「登録を完了する」をクリックします。
    * ログイン/登録が成功すると、オーガナイザーページ (`organizer.html`) に遷移します。イベントの追加・削除、割引状況の確認ができます。
2.  **ユーザーとして利用:**
    * ログインページの「ユーザーとしてログイン」タブを選択します。
    * Google, Facebook, LINE のいずれかのボタンをクリックします。
    * 各サービスの認証を行います（新規ユーザーは自動的に作成されます）。
    * ログイン/登録が成功すると、ユーザーページ (`user.html`) に遷移します。イベント一覧の閲覧、紹介リンクの生成・共有、割引状況の確認ができます。

## 注意事項

* この README はプロジェクトの現在の状態に基づいています。機能追加・変更によって内容は古くなる可能性があります。
* 招待コードの検証は、現在 `.env` ファイルに記述された単一のコードとの比較のみです。本番運用には、より安全な（例: データベースでのコード管理・使用状況追跡）仕組みが必要です。
* エラーハンドリングは基本的なものです。必要に応じて詳細化してください。