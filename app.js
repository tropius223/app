require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const LineStrategy = require('passport-line').Strategy;

// --- Express アプリケーションの初期化 ---
const app = express();
const port = process.env.PORT || 3000;

// --- ミドルウェア設定 ---
// CORS設定
app.use(cors({
    origin: true, // Codespace環境など、オリジンが変動する場合に対応 (本番では具体的なオリジンを指定推奨)
    credentials: true,
}));
// Body Parsers (JSONとURLエンコードされたデータ用)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Cookie Parser
app.use(cookieParser(process.env.COOKIE_SECRET));
// Session 設定 (Passport 認証フロー中の情報保持に使用)
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: 60 * 60 * 1000 // 1時間
  }
}));
// Passport 初期化
app.use(passport.initialize());

// --- Passport Strategy 設定 ---
try {
    // Google Strategy
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
        passReqToCallback: true
      },
      async (req, accessToken, refreshToken, profile, done) => {
        console.log('Google Profile Received:', profile);
        const googleId = profile.id;
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
        const displayName = profile.displayName || profile.name?.givenName || email;
        const intendedType = req.session.authType;
        console.log('Intended auth type:', intendedType);

        if (!email) { return done(new Error('Google アカウントにメールアドレスが関連付けられていません。'), null); }

        try {
          let user = null;
          // 既存アカウントチェック (Google ID)
          let [organizers] = await pool.query('SELECT organizer_id as id FROM organizers WHERE social_id = ?', [googleId]);
          if (organizers.length > 0) { user = { id: organizers[0].id, type: 'organizer' }; req.session.authType = null; return done(null, user); }
          let [users] = await pool.query('SELECT user_id as id FROM users WHERE social_id = ?', [googleId]);
          if (users.length > 0) { user = { id: users[0].id, type: 'user' }; req.session.authType = null; return done(null, user); }

          // 既存アカウントチェック (Email) & 紐付け
          [organizers] = await pool.query('SELECT organizer_id as id, social_id FROM organizers WHERE mail = ?', [email]);
          if (organizers.length > 0) {
            if (!organizers[0].social_id) {
               await pool.query('UPDATE organizers SET social_id = ? WHERE organizer_id = ?', [googleId, organizers[0].id]);
               user = { id: organizers[0].id, type: 'organizer' }; req.session.authType = null; return done(null, user);
            } else { req.session.authType = null; return done(new Error(`メールアドレス ${email} は別の方法で登録済みのオーガナイザーアカウントです。`), null); }
          }
          [users] = await pool.query('SELECT user_id as id, social_id FROM users WHERE mail = ?', [email]);
          if (users.length > 0) {
            if (!users[0].social_id) {
               await pool.query('UPDATE users SET social_id = ? WHERE user_id = ?', [googleId, users[0].id]);
               user = { id: users[0].id, type: 'user' }; req.session.authType = null; return done(null, user);
            } else { req.session.authType = null; return done(new Error(`メールアドレス ${email} は別の方法で登録済みのユーザーアカウントです。`), null); }
          }

          // 新規登録処理
          if (intendedType === 'user') {
            const [newUserResult] = await pool.query('INSERT INTO users (mail, user_name, social_id, pass) VALUES (?, ?, ?, NULL)', [email, displayName, googleId]);
            user = { id: newUserResult.insertId, type: 'user' }; req.session.authType = null; return done(null, user);
          } else if (intendedType === 'organizer') {
            req.session.pendingGoogleProfile = { googleId, email, displayName }; req.session.authType = null; return done(null, { type: 'pending_organizer' });
          } else { req.session.authType = null; return done(new Error('認証プロセスエラー: ログインタイプ不明'), null); }
        } catch (err) { req.session.authType = null; req.session.pendingGoogleProfile = null; return done(err, null); }
      }
    ));
    console.log('Google Strategy configured.');

    // Facebook Strategy
    passport.use(new FacebookStrategy({
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL: process.env.FACEBOOK_CALLBACK_URL,
        profileFields: ['id', 'displayName', 'emails'],
        passReqToCallback: true
      },
      async (req, accessToken, refreshToken, profile, done) => {
        console.log('Facebook Profile Received:', profile);
        const facebookId = profile.id;
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
        const displayName = profile.displayName || `FacebookUser_${facebookId}`;
        const intendedType = req.session.authType;
        console.log('Intended auth type:', intendedType);
        console.log(`Facebook Profile Info: ID=${facebookId}, Email=${email}, Name=${displayName}`);

        try {
          let user = null;
          // 既存アカウントチェック (Facebook ID)
          let [organizers] = await pool.query('SELECT organizer_id as id FROM organizers WHERE social_id = ?', [facebookId]);
          if (organizers.length > 0) { user = { id: organizers[0].id, type: 'organizer' }; req.session.authType = null; return done(null, user); }
          let [users] = await pool.query('SELECT user_id as id FROM users WHERE social_id = ?', [facebookId]);
          if (users.length > 0) { user = { id: users[0].id, type: 'user' }; req.session.authType = null; return done(null, user); }

          // 既存アカウントチェック (Email) & 紐付け (Emailがあれば)
          if (email) {
            console.log(`Facebook ID not found, checking by email: ${email}`);
            [organizers] = await pool.query('SELECT organizer_id as id, social_id FROM organizers WHERE mail = ?', [email]);
            if (organizers.length > 0) {
              if (!organizers[0].social_id) {
                 await pool.query('UPDATE organizers SET social_id = ? WHERE organizer_id = ?', [facebookId, organizers[0].id]);
                 user = { id: organizers[0].id, type: 'organizer' }; req.session.authType = null; return done(null, user);
              } else { req.session.authType = null; return done(new Error(`メールアドレス ${email} は別の方法で登録済みのオーガナイザーアカウントです。`), null); }
            }
            [users] = await pool.query('SELECT user_id as id, social_id FROM users WHERE mail = ?', [email]);
            if (users.length > 0) {
              if (!users[0].social_id) {
                 await pool.query('UPDATE users SET social_id = ? WHERE user_id = ?', [facebookId, users[0].id]);
                 user = { id: users[0].id, type: 'user' }; req.session.authType = null; return done(null, user);
              } else { req.session.authType = null; return done(new Error(`メールアドレス ${email} は別の方法で登録済みのユーザーアカウントです。`), null); }
            }
          } else { console.log("Email not provided by Facebook, skipping email check for linking."); }

          // 新規登録処理 (Emailなくても social_id があればOK)
          if (intendedType === 'user') {
            console.log('Creating new user with Facebook profile (email may be null)');
            const [newUserResult] = await pool.query('INSERT INTO users (mail, user_name, social_id, pass) VALUES (?, ?, ?, NULL)', [email, displayName, facebookId]);
            user = { id: newUserResult.insertId, type: 'user' }; req.session.authType = null; return done(null, user);
          } else if (intendedType === 'organizer') {
            console.log('New organizer registration attempt via Facebook (email may be null), redirecting to invite code page');
            req.session.pendingFacebookProfile = { facebookId, email, displayName }; req.session.authType = null; return done(null, { type: 'pending_organizer' });
          } else { req.session.authType = null; return done(new Error('認証プロセスエラー: ログインタイプ不明'), null); }
        } catch (err) { req.session.authType = null; req.session.pendingFacebookProfile = null; return done(err, null); }
      }
    ));
    console.log('Facebook Strategy configured.');
    passport.use(new LineStrategy({
        channelID: process.env.LINE_CHANNEL_ID,
        channelSecret: process.env.LINE_CHANNEL_SECRET,
        callbackURL: process.env.LINE_CALLBACK_URL,
        scope: ['profile', 'openid', 'email'], // 要求するスコープ (emailは要審査)
        passReqToCallback: true
      },
      // LINE からプロフィール情報が返ってきたときの処理 (Verify Callback)
      async (req, accessToken, refreshToken, profile, done) => {
        console.log('LINE Profile Received:', profile);
        const lineId = profile.id; // LINE User ID
        // ★ LINEはemailを返さない、または要申請なので注意 ★
        const email = profile.email || null; // emailがあれば使う、なければnull
        const displayName = profile.displayName;

        const intendedType = req.session.authType;
        console.log('Intended auth type:', intendedType);
        console.log(`LINE Profile Info: ID=${lineId}, Email=${email}, Name=${displayName}`);

        try {
            let user = null;
             // --- 既存アカウントチェック (LINE ID) ---
            let [organizers] = await pool.query('SELECT organizer_id as id FROM organizers WHERE social_id = ?', [lineId]);
            if (organizers.length > 0) { user = { id: organizers[0].id, type: 'organizer' }; req.session.authType = null; return done(null, user); }
            let [users] = await pool.query('SELECT user_id as id FROM users WHERE social_id = ?', [lineId]);
            if (users.length > 0) { user = { id: users[0].id, type: 'user' }; req.session.authType = null; return done(null, user); }

            // --- メールでの紐付けチェック (Emailが取得できた場合のみ) ---
            if (email) {
                console.log(`LINE ID not found, checking by email: ${email}`);
                [organizers] = await pool.query('SELECT organizer_id as id, social_id FROM organizers WHERE mail = ?', [email]);
                if (organizers.length > 0) {
                  if (!organizers[0].social_id) {
                     await pool.query('UPDATE organizers SET social_id = ? WHERE organizer_id = ?', [lineId, organizers[0].id]);
                     user = { id: organizers[0].id, type: 'organizer' }; req.session.authType = null; return done(null, user);
                  } else { req.session.authType = null; return done(new Error(`メールアドレス ${email} は別の方法で登録済みのオーガナイザーアカウントです。`), null); }
                }
                [users] = await pool.query('SELECT user_id as id, social_id FROM users WHERE mail = ?', [email]);
                if (users.length > 0) {
                  if (!users[0].social_id) {
                     await pool.query('UPDATE users SET social_id = ? WHERE user_id = ?', [lineId, users[0].id]);
                     user = { id: users[0].id, type: 'user' }; req.session.authType = null; return done(null, user);
                  } else { req.session.authType = null; return done(new Error(`メールアドレス ${email} は別の方法で登録済みのユーザーアカウントです。`), null); }
                }
            } else {
                console.log("Email not available from LINE profile, skipping email check for linking.");
                // Emailがない場合、メールでの紐付けはできない
                // 新規登録に進むか、エラーにするか (今回は新規登録に進む)
            }

            // --- 新規登録処理 ---
            if (!email && intendedType === 'organizer') {
                // オーガナイザー登録にはEmailを必須とする場合（例）
                // またはEmailなしでも登録を許可するならこのチェックは不要
                req.session.authType = null;
                return done(new Error('オーガナイザー登録にはメールアドレスが必要です。LINEアカウントにメールアドレスを登録・連携してください。'), null);
            }
            if (!email && intendedType === 'user') {
                 // ユーザー登録にもEmailを必須とする場合（例）
                 req.session.authType = null;
                 return done(new Error('ユーザー登録にはメールアドレスが必要です。LINEアカウントにメールアドレスを登録・連携してください。'), null);
             }
             // ★ 上記 Email 必須チェックが不要な場合は、以下の登録処理を実行 ★

            if (intendedType === 'user') {
                console.log('Creating new user with LINE profile (email may be null)');
                const [newUserResult] = await pool.query('INSERT INTO users (mail, user_name, social_id, pass) VALUES (?, ?, ?, NULL)', [email, displayName, lineId]);
                user = { id: newUserResult.insertId, type: 'user' }; req.session.authType = null; return done(null, user);
            } else if (intendedType === 'organizer') {
                console.log('New organizer registration attempt via LINE (email may be null), redirecting to invite code page');
                req.session.pendingLineProfile = { lineId, email, displayName }; // LINE ID を保存
                req.session.authType = null; return done(null, { type: 'pending_organizer' });
            } else { req.session.authType = null; return done(new Error('認証プロセスエラー: ログインタイプ不明'), null); }

        } catch (err) { // エラー処理
             console.error('Error in LINE Strategy verify callback:', err);
             req.session.authType = null; req.session.pendingLineProfile = null; // LINE用セッションクリア
             return done(err, null);
        }
      }
    ));
    console.log('LINE Strategy configured.');
} catch (passportError) {
    console.error("!!! Error during Passport strategy configuration !!!", passportError);
    process.exit(1);
}

// --- 静的ファイル配信 ---
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// --- Multer 設定 ---
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)){ try { fs.mkdirSync(uploadDir, { recursive: true }); console.log(`Created upload directory: ${uploadDir}`); } catch(err){ console.error(`Error creating upload directory: ${uploadDir}`, err); process.exit(1); } } else { console.log(`Upload directory exists: ${uploadDir}`); }
const storage = multer.diskStorage({ destination: uploadDir, filename: (req, file, cb) => { const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9); const extension = path.extname(file.originalname); cb(null, file.fieldname + '-' + uniqueSuffix + extension); } });
const upload = multer({ storage: storage, fileFilter: (req, file, cb) => { if (file.mimetype.startsWith('image/')) { cb(null, true); } else { cb(new Error('画像ファイルのみアップロード可能です'), false); } } });
console.log('Static files and Multer setup done.');

// --- データベース接続プール ---
console.log('Creating DB pool...');
let pool;
try {
    pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        dateStrings: true // ★ 日付を文字列で取得
    });
    console.log('DB pool created.');
} catch (dbError) {
     console.error("!!! Error creating DB pool !!!", dbError);
     process.exit(1);
}

// --- JWT認証ミドルウェア ---
const authenticateToken = (req, res, next) => {
    const token = req.cookies.token;
    if (token == null) return res.status(401).json({ message: '認証トークンが必要です' });
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) { console.error('JWT Verification Error:', err.message); return res.status(403).json({ message: '無効なトークンです' }); }
        req.user = user;
        next();
    });
};
console.log('JWT middleware defined.');

// --- ルーティング ---
console.log('Defining routes...');

// ルート - ログインページを表示
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// --- 認証関連 ---
// Google 認証開始
app.get('/auth/google/user', (req, res, next) => { req.session.authType = 'user'; passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next); });
app.get('/auth/google/organizer', (req, res, next) => { req.session.authType = 'organizer'; passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next); });
// Google コールバック
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login.html?error=google_auth_failed', session: false }), (req, res) => { handleSocialAuthCallback(req, res); });

// Facebook 認証開始
app.get('/auth/facebook/user', (req, res, next) => { req.session.authType = 'user'; passport.authenticate('facebook', { scope: ['email', 'public_profile'] })(req, res, next); });
app.get('/auth/facebook/organizer', (req, res, next) => { req.session.authType = 'organizer'; passport.authenticate('facebook', { scope: ['email', 'public_profile'] })(req, res, next); });
// Facebook コールバック
app.get('/auth/facebook/callback', passport.authenticate('facebook', { failureRedirect: '/login.html?error=facebook_auth_failed', session: false }), (req, res) => { handleSocialAuthCallback(req, res); });

// LINE 認証開始 (ユーザーとオーガナイザーで分ける)
app.get('/auth/line/user', (req, res, next) => {
    req.session.authType = 'user';
    // state パラメータを追加して CSRF 対策 (値はセッションにも保存して後で検証するのが望ましい)
    const state = Math.random().toString(36).substring(7); // 簡単なランダム文字列
    req.session.lineAuthState = state; // セッションに保存
    passport.authenticate('line', { scope: ['profile', 'openid', 'email'], state: state })(req, res, next);
  });
  app.get('/auth/line/organizer', (req, res, next) => {
    req.session.authType = 'organizer';
    const state = Math.random().toString(36).substring(7);
    req.session.lineAuthState = state;
    passport.authenticate('line', { scope: ['profile', 'openid', 'email'], state: state })(req, res, next);
  });
 
// ★★★ LINE 認証後のコールバックルート ★★★
app.get('/auth/line/callback', 
    (req, res, next) => { 
      if (!req.query.state || req.query.state !== req.session.lineAuthState) {
          console.error('Invalid state parameter in LINE callback.');
          return res.redirect('/login.html?error=invalid_state');
      }; 
      next(); 
    }, 
    passport.authenticate('line', { 
      failureRedirect: '/login.html?error=line_auth_failed', 
      session: false,
      callbackURL: process.env.LINE_CALLBACK_URL 
    }), 
    (req, res) => {
    handleSocialAuthCallback(req, res);
}
  );

// ソーシャル認証コールバック共通処理
function handleSocialAuthCallback(req, res) {
    console.log('Social Auth callback processing, req.user:', req.user);

    if (req.user && req.user.type === 'pending_organizer') {
        // Google/Facebookのプロフィールがセッションにあるか確認
        if (req.session.pendingGoogleProfile || req.session.pendingFacebookProfile) {
           console.log('Redirecting to organizer invite code page');
           return res.redirect('/register/organizer/invite');
        } else {
           console.error('Pending organizer profile not found in session.');
           return res.redirect('/login.html?error=profile_error');
        }
    }

    if (!req.user || !req.user.id || !req.user.type) {
         console.error('User object not found or incomplete after social auth callback');
         return res.redirect('/login.html?error=auth_process_error');
    }

    const payload = { id: req.user.id, type: req.user.type };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
    res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        maxAge: 24 * 60 * 60 * 1000
    });

    const redirectUrl = req.user.type === 'user'
        ? `/user.html?user_id=${req.user.id}`
        : `/organizer.html?organizer_id=${req.user.id}`;
    console.log(`Redirecting authenticated user to ${redirectUrl}`);
    res.redirect(redirectUrl);
}

// 招待コード入力ページ表示 (GET)
app.get('/register/organizer/invite', (req, res) => {
    if (!req.session.pendingGoogleProfile && !req.session.pendingFacebookProfile) {
        console.log('Access to invite page without pending profile.');
        return res.redirect('/login.html?error=session_expired');
    }
    res.sendFile(path.join(__dirname, 'public', 'organizer_invite.html'));
});

// 招待コード検証とオーガナイザー登録 (POST)
app.post('/register/organizer/invite', async (req, res) => {
    // ★ Google / Facebook / LINE の保留中プロフィールを取得 ★
    const pendingProfile = req.session.pendingGoogleProfile || req.session.pendingFacebookProfile || req.session.pendingLineProfile;

    if (!pendingProfile) { return res.status(400).json({ message: 'セッション情報が見つかりません。' }); }

    const { inviteCode } = req.body;
    const correctInviteCode = process.env.ORGANIZER_INVITE_CODE;

    if (!inviteCode || inviteCode !== correctInviteCode) { return res.status(400).json({ message: '招待コードが正しくありません。' }); }

    // ★ socialId を Google/Facebook/LINE から取得 ★
    const socialId = pendingProfile.googleId || pendingProfile.facebookId || pendingProfile.lineId;
    const email = pendingProfile.email;
    const displayName = pendingProfile.displayName;

    if (!socialId) { return res.status(400).json({ message: '登録に必要な情報(ソーシャルID)が不足しています。' }); }

    try {
        console.log(`Invite code correct. Creating organizer for social ID ${socialId} (email: ${email})`);
        let existingCheckSql = 'SELECT organizer_id FROM organizers WHERE social_id = ?';
        let existingCheckParams = [socialId];
        if (email) { existingCheckSql += ' OR mail = ?'; existingCheckParams.push(email); }
        const [existing] = await pool.query(existingCheckSql, existingCheckParams);

        if (existing.length > 0) {
             req.session.pendingGoogleProfile = null; req.session.pendingFacebookProfile = null;
             req.session.pendingLineProfile = null;
             return res.status(409).json({ message: 'このアカウントは既にオーガナイザーとして存在するようです。' });
        }

        const [newOrgResult] = await pool.query(
            'INSERT INTO organizers (mail, organizer_name, social_id, pass) VALUES (?, ?, ?, NULL)',
            [email, displayName, socialId]
        );
        const organizerId = newOrgResult.insertId;
        console.log(`Organizer created with ID: ${organizerId}`);

        req.session.pendingGoogleProfile = null; req.session.pendingFacebookProfile = null;
        req.session.pendingLineProfile = null;

        const payload = { id: organizerId, type: 'organizer' };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
        res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Lax', maxAge: 24 * 60 * 60 * 1000 });
        res.json({ message: 'オーガナイザー登録成功', redirectTo: `/organizer.html?organizer_id=${organizerId}` });
    } catch(err) {
        console.error('Error creating organizer after invite code validation:', err);
        req.session.pendingGoogleProfile = null; req.session.pendingFacebookProfile = null;
        req.session.pendingLineProfile = null;
        res.status(500).json({ message: 'オーガナイザー登録中にサーバーエラーが発生しました。' });
    }
});

// ログアウト API
app.post('/api/logout', (req, res) => {
    res.clearCookie('token'); // Cookieからトークンを削除
    res.json({ message: 'ログアウトしました' });
});

// 認証状態確認 API
app.get('/api/auth/status', authenticateToken, (req, res) => {
    // authenticateTokenミドルウェアが成功すれば、ユーザーは認証済み
    res.json({ isAuthenticated: true, user: req.user });
});


// --- ユーザー関連 API ---
// ユーザー情報取得 API (特定のユーザー)
app.get('/api/users/:userId', authenticateToken, async (req, res) => {
    // 認証ミドルウェアは通っているので、ログインはしている
    // req.user に { id: XX, type: 'user' or 'organizer' } が入っている

    // オーガナイザーもユーザー情報を取得できるよう、アクセス制限は緩めておく
    // (必要なら、req.user.type === 'organizer' などのチェックを追加)

    try {
        const [rows] = await pool.query('SELECT user_id, user_name, mail FROM users WHERE user_id = ?', [req.params.userId]);
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ message: 'ユーザーが見つかりません' });
        }
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
});


// --- イベント関連 API ---
// イベント一覧取得 API (開催日が未来のもの)
app.get('/api/events', async (req, res) => {
    try {
        const now = new Date();
        const [rows] = await pool.query(
            `SELECT e.event_id, e.event_name, e.date, e.price, e.expirate, e.flyer,
                 e.rate_per_click, e.max_discount_rate, o.organizer_name
             FROM events e
             JOIN organizers o ON e.organizer_id = o.organizer_id
             WHERE e.date > ? ORDER BY e.date ASC`,
            [now]
        );
        res.json(rows);
    } catch (error) {
        console.error('Get events error:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
});

// 特定のイベント情報取得 API
app.get('/api/events/:eventId', async (req, res) => {
     try {
        const [rows] = await pool.query(
            `SELECT e.*, o.organizer_name
             FROM events e
             JOIN organizers o ON e.organizer_id = o.organizer_id
             WHERE e.event_id = ?`,
            [req.params.eventId]
        );
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ message: 'イベントが見つかりません' });
        }
    } catch (error) {
        console.error('Get event error:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
});

// --- 割引・クリック関連 API ---
// ユーザーの割引情報取得 API
app.get('/api/users/:userId/discounts', authenticateToken, async (req, res) => {
    const targetUserId = parseInt(req.params.userId, 10);

    // 本人確認
    if (req.user.type !== 'user' || req.user.id !== targetUserId) {
        return res.status(403).json({ message: 'アクセス権限がありません' });
    }

    try {
        const now = new Date();
        // 有効期限内のクリック数をイベントごとに集計
        const [clickCounts] = await pool.query(
            `SELECT event_id, COUNT(*) as valid_clicks
             FROM click_logs
             WHERE user_id = ? AND clicked_at <= (SELECT expirate FROM events WHERE event_id = click_logs.event_id)
             GROUP BY event_id`,
            [targetUserId]
        );

        if (clickCounts.length === 0) {
            return res.json([]); // クリックログがない場合は空配列を返す
        }

        const eventIds = clickCounts.map(c => c.event_id);
        // イベント情報を取得
        const [events] = await pool.query(
            `SELECT event_id, event_name, price, rate_per_click, max_discount_rate
             FROM events
             WHERE event_id IN (?)`,
            [eventIds]
        );

        const eventsMap = events.reduce((map, event) => {
            map[event.event_id] = event;
            return map;
        }, {});

        // 割引情報を計算して整形
        const discounts = clickCounts.map(count => {
            const event = eventsMap[count.event_id];
            if (!event) return null;

            // ★★★ 文字列の可能性があるので parseFloat で数値に変換 ★★★
            const priceNum = parseFloat(event.price);
            const ratePerClickNum = parseFloat(event.rate_per_click);
            const maxDiscountRateNum = parseFloat(event.max_discount_rate); // これもDECIMALなら変換

            // ★★★ 数値変数を使って計算 ★★★
            const potentialDiscount = count.valid_clicks * ratePerClickNum;
            const maxDiscountAmount = priceNum * (maxDiscountRateNum / 100);
            const actualDiscount = Math.min(potentialDiscount, maxDiscountAmount);
            const finalPrice = Math.max(0, priceNum - actualDiscount);

            const discountRate = priceNum > 0 ? (actualDiscount / priceNum) * 100 : 0;

            return {
                event_id: event.event_id,
                event_name: event.event_name,
                click_count: count.valid_clicks,
                discount_rate_calc: discountRate.toFixed(2), // 計算上の割引率
                discount_amount: actualDiscount.toFixed(0), // 割引額 (切り捨て)
                // ★★★ 数値変数を使って toFixed を呼び出す ★★★
                original_price: priceNum.toFixed(0),
                payment_price: Math.floor(finalPrice) // 最終支払額 (切り捨て)
            };
        }).filter(d => d !== null); // nullを除外
        res.json(discounts);

    } catch (error) {
        console.error('Get user discounts error:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
});

// クリックログ記録 API (フライヤーページ用)
app.post('/api/clicks', async (req, res) => {
    const { event_id, user_id } = req.body;
    const ip_address = req.ip; // ExpressがIPアドレスを取得

    if (!event_id || !user_id) {
        return res.status(400).json({ message: 'イベントIDとユーザーIDは必須です' });
    }

    const cookieName = `click_${event_id}_${user_id}`;
    if (req.cookies[cookieName]) {
        return res.status(200).json({ message: 'クリック済みです (Cookie)', logged: false });
    }

    try {
        const [eventRows] = await pool.query('SELECT expirate FROM events WHERE event_id = ?', [event_id]);
        if (eventRows.length === 0) {
            return res.status(404).json({ message: 'イベントが見つかりません' });
        }
        const expirate = new Date(eventRows[0].expirate);
        const now = new Date();

        if (now > expirate) {
            return res.status(400).json({ message: 'この紹介リンクの有効期限は切れています' });
        }

        await pool.query(
            'INSERT INTO click_logs (event_id, user_id, ip_address) VALUES (?, ?, ?)',
             // ★注意: 以前UNIQUE KEYにDATE()を含められなかったので、ここでのON DUPLICATE KEY UPDATEは不要かも
             // 代わりに、INSERTが成功したか、DUPLICATE KEYエラーになったかで判断する
            [event_id, user_id, ip_address]
        );

        // Cookieを発行
        res.cookie(cookieName, '1', {
             maxAge: 24 * 60 * 60 * 1000, // 1日
             httpOnly: true,
             secure: process.env.NODE_ENV === 'production',
             sameSite: 'Lax'
        });

        res.status(201).json({ message: 'クリックを記録しました', logged: true });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
             // DBのUNIQUE制約による重複の場合もCookieを発行
             res.cookie(cookieName, '1', { maxAge: 24 * 60 * 60 * 1000, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Lax' });
             return res.status(200).json({ message: 'クリック済みです (DB)', logged: false });
        }
        console.error('Log click error:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
});


// --- オーガナイザー関連 API ---
// オーガナイザー情報取得 API
app.get('/api/organizers/:organizerId', authenticateToken, async (req, res) => {
    const targetOrganizerId = parseInt(req.params.organizerId, 10);
    if (req.user.type !== 'organizer' || req.user.id !== targetOrganizerId) {
        return res.status(403).json({ message: 'アクセス権限がありません' });
    }
    try {
        const [rows] = await pool.query('SELECT organizer_id, organizer_name, mail FROM organizers WHERE organizer_id = ?', [targetOrganizerId]);
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ message: 'オーガナイザーが見つかりません' });
        }
    } catch (error) {
        console.error('Get organizer error:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
});

// オーガナイザーが登録したイベント一覧取得 API
// app.js の GET /api/organizers/:organizerId/events 部分

app.get('/api/organizers/:organizerId/events', authenticateToken, async (req, res) => {
    const targetOrganizerId = parseInt(req.params.organizerId, 10);
    if (req.user.type !== 'organizer' || req.user.id !== targetOrganizerId) {
        return res.status(403).json({ message: 'アクセス権限がありません' });
    }
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [rows] = await pool.query(
            `SELECT event_id, event_name, date, price, rate_per_click, max_discount_rate, expirate, flyer
             FROM events
             WHERE organizer_id = ? AND date >= ? ORDER BY date DESC`,
            [targetOrganizerId, thirtyDaysAgo]
        );

        // ★★★ フロントエンドに送る直前のデータをログに出力 ★★★
        console.log('--- Sending events data to frontend ---');
        // JSON.stringifyで見やすく整形して出力
        console.log(JSON.stringify(rows, null, 2));
        // ★★★ ログ出力ここまで ★★★

        res.json(rows); // フロントエンドに応答を返す
    } catch (error) {
        console.error('Get organizer events error:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
});

app.delete('/api/organizers/:organizerId/events/:eventId', authenticateToken, async (req, res) => {
    const targetOrganizerId = parseInt(req.params.organizerId, 10);
    const eventIdToDelete = parseInt(req.params.eventId, 10);

    // 認証チェック (オーガナイザー本人か)
    if (req.user.type !== 'organizer' || req.user.id !== targetOrganizerId) {
        return res.status(403).json({ message: 'イベントを削除する権限がありません' });
    }

    // パラメータチェック
    if (isNaN(eventIdToDelete)) {
        return res.status(400).json({ message: '無効なイベントIDです' });
    }

    let connection; // コネクションを保持する変数
    try {
        connection = await pool.getConnection(); // プールからコネクション取得
        await connection.beginTransaction(); // トランザクション開始

        // 1. イベント所有権とフライヤーパスを確認
        const [eventRows] = await connection.query(
            'SELECT flyer FROM events WHERE event_id = ? AND organizer_id = ?',
            [eventIdToDelete, targetOrganizerId]
        );

        if (eventRows.length === 0) {
            await connection.rollback(); // ロールバック
            connection.release(); // コネクション解放
            return res.status(404).json({ message: '削除対象のイベントが見つからないか、あなたが所有者ではありません' });
        }
        const flyerPathToDelete = eventRows[0].flyer; // /uploads/filename.png など

        // 2. クリックログの存在を確認
        const [clickRows] = await connection.query(
            'SELECT COUNT(*) as click_count FROM click_logs WHERE event_id = ?',
            [eventIdToDelete]
        );
        const clickCount = clickRows[0].click_count;

        if (clickCount > 0) {
            await connection.rollback(); // ロールバック
            connection.release(); // コネクション解放
            console.log(`Event ${eventIdToDelete} has ${clickCount} clicks, deletion denied.`);
            // 400 Bad Request または 403 Forbidden を返す
            return res.status(400).json({ message: `クリックログが ${clickCount} 件存在するため削除できません` });
        }

        // 3. クリック数が0ならイベントを削除
        console.log(`Attempting to delete event ${eventIdToDelete} (click count: 0)...`);
        const [deleteResult] = await connection.query(
            'DELETE FROM events WHERE event_id = ?',
            [eventIdToDelete]
        );

        if (deleteResult.affectedRows === 0) {
             // 通常ここには来ないはずだが念のため
             throw new Error('Event deletion failed unexpectedly.');
        }

        // 4. フライヤー画像を削除
        if (flyerPathToDelete) {
            // 相対パス (/uploads/...) から絶対パスに変換
            const absolutePath = path.join(__dirname, 'public', flyerPathToDelete);
            console.log(`Attempting to delete flyer image: ${absolutePath}`);
            try {
                // fs.promises を使って非同期で削除
                await fs.promises.unlink(absolutePath);
                console.log(`Successfully deleted flyer image: ${absolutePath}`);
            } catch (fileError) {
                // ファイル削除のエラーはログには出すが、DB削除は成功しているので警告に留める
                console.warn(`Failed to delete flyer image (${absolutePath}):`, fileError.message);
                // ここでトランザクションをロールバックするかは要件による
                // (DB削除は成功、ファイルだけ残ることを許容するかどうか)
                // 今回はファイル削除失敗は許容し、コミットする
            }
        }

        // 5. トランザクションをコミット
        await connection.commit();
        console.log(`Event ${eventIdToDelete} deleted successfully.`);
        res.json({ message: 'イベントを削除しました' });

    } catch (error) {
        console.error(`Error deleting event ${eventIdToDelete}:`, error);
        if (connection) {
            await connection.rollback(); // エラー発生時はロールバック
        }
        res.status(500).json({ message: 'イベント削除中にエラーが発生しました' });
    } finally {
        if (connection) {
            connection.release(); // 最後に必ずコネクションを解放
        }
    }
});


// ★★★ 新規イベント追加 API (Multer対応版) ★★★
// Multerミドルウェア upload.single('flyerImageFile') をルートハンドラの直前に追加
app.post('/api/organizers/:organizerId/events', authenticateToken, upload.single('flyerImageFile'), async (req, res) => {
    console.log('Received request to add event for organizer:', req.params.organizerId); // リクエスト受信ログ
    console.log('Request body:', req.body); // テキストフィールドの内容
    console.log('Uploaded file:', req.file); // アップロードされたファイル情報

    const targetOrganizerId = parseInt(req.params.organizerId, 10);
    if (req.user.type !== 'organizer' || req.user.id !== targetOrganizerId) {
        console.log('Authorization failed for adding event.');
        // アップロードされたファイルがあれば削除する（権限がないため）
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error("Failed to delete uploaded file on auth error:", err);
                else console.log("Deleted uploaded file due to auth error:", req.file.path);
            });
        }
        return res.status(403).json({ message: 'アクセス権限がありません' });
    }

    // リクエストボディから必要な情報を取得
    const { event_name, date, price, rate_per_click, max_discount_rate, expirate } = req.body;

    // アップロードされたファイル情報のチェック
    if (!req.file) {
        console.log('Flyer image file is required.');
        return res.status(400).json({ message: 'フライヤー画像ファイルは必須です' });
    }

    // DBに保存するファイルパス (URL形式) を生成
    const flyerUrlPath = `/uploads/${req.file.filename}`; // 例: /uploads/flyerImageFile-1678886400000-123456789.jpg
    console.log(`Generated flyer URL path: ${flyerUrlPath}`);

    // 簡単なバリデーション (数値変換を含む)
    const priceNum = parseFloat(price);
    const rateNum = parseFloat(rate_per_click);
    const maxRateNum = parseFloat(max_discount_rate);

    if (!event_name || !date || isNaN(priceNum) || isNaN(rateNum) || isNaN(maxRateNum) || !expirate) {
         console.log('Validation failed for event data.');
         // エラーの場合はアップロードされたファイルを削除
        fs.unlink(req.file.path, (err) => {
            if (err) console.error("Failed to delete uploaded file on validation error:", err);
            else console.log("Deleted uploaded file due to validation error:", req.file.path);
        });
        return res.status(400).json({ message: '必須項目が不足しているか、数値が無効です' });
    }

    try {
        console.log('Inserting event into database...');

        // ★★★ フロントエンドからの日時文字列をDB用形式にフォーマット ★★★
        // input type="datetime-local" からは "YYYY-MM-DDTHH:MM" 形式で来る想定
        const formatDateTimeForDB = (dateTimeLocalString) => {
            if (!dateTimeLocalString || typeof dateTimeLocalString !== 'string') {
                return null; // またはエラー処理
            }
            // 'T' をスペースに置き換え、秒 (:00) を追加
            return dateTimeLocalString.replace('T', ' ') + ':00';
        };

        const dbDate = formatDateTimeForDB(date);
        const dbExpirate = formatDateTimeForDB(expirate);

        if (!dbDate || !dbExpirate) {
            fs.unlink(req.file.path, (err) => { /* ... エラー処理 ... */ });
            return res.status(400).json({ message: '日付または有効期限の形式が無効です' });
        }

        const sql = 'INSERT INTO events (organizer_id, event_name, date, price, rate_per_click, max_discount_rate, expirate, flyer) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
        const values = [targetOrganizerId, event_name, dbDate, priceNum, rateNum, maxRateNum, dbExpirate, flyerUrlPath];

        console.log('Executing SQL:', sql);
        console.log('With Values:', values);

        const [result] = await pool.query(sql, values);

        console.log('Event added successfully, ID:', result.insertId);
        res.status(201).json({ message: 'イベントを追加しました', eventId: result.insertId, flyerPath: flyerUrlPath });
    } catch (error) { 
        console.error('Add event DB error:', error);
         // DBエラーの場合もアップロードされたファイルを削除
        fs.unlink(req.file.path, (err) => {
            if (err) console.error("Failed to delete uploaded file on DB error:", err);
            else console.log("Deleted uploaded file due to DB error:", req.file.path);
        });
        res.status(500).json({ message: 'データベースエラーが発生しました' });
    }
});


// オーガナイザー向け割引状況確認 API
app.get('/api/organizers/:organizerId/discount-summary', authenticateToken, async (req, res) => {
    const targetOrganizerId = parseInt(req.params.organizerId, 10);
    if (req.user.type !== 'organizer' || req.user.id !== targetOrganizerId) {
        return res.status(403).json({ message: 'アクセス権限がありません' });
    }

    const filterEventId = req.query.event_id;

    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        let sql = `
            SELECT
                e.event_name,
                u.user_name,           -- ★ 表示する
                cl.user_id,            -- ★ GROUP BY のために必要
                COUNT(cl.click_id) AS click_count,
                e.price,               -- ★ 計算用に必要
                e.rate_per_click,
                e.max_discount_rate
            FROM click_logs cl
            JOIN events e ON cl.event_id = e.event_id
            JOIN users u ON cl.user_id = u.user_id
            WHERE e.organizer_id = ?
              AND cl.clicked_at <= e.expirate
              AND e.date >= ?
        `;
        const params = [targetOrganizerId, thirtyDaysAgo];

        if (filterEventId) {
            sql += ' AND cl.event_id = ?';
            params.push(filterEventId);
        }

        // ★★★ GROUP BY に user_id を含める (user_name を確定するため) ★★★
        sql += ' GROUP BY e.event_id, e.event_name, cl.user_id, u.user_name, e.price, e.rate_per_click, e.max_discount_rate ORDER BY e.event_name, u.user_name';

        const [rows] = await pool.query(sql, params);

        const summary = rows.map(row => {
            const priceNum = parseFloat(row.price);
            const ratePerClickNum = parseFloat(row.rate_per_click);
            const maxDiscountRateNum = parseFloat(row.max_discount_rate);
            const clickCount = parseInt(row.click_count, 10);

            if (isNaN(priceNum) || isNaN(ratePerClickNum) || isNaN(maxDiscountRateNum) || isNaN(clickCount)) {
                // ... (エラーハンドリング: 少なくとも表示に必要なものを返す)
                return {
                    event_name: row.event_name || 'エラー',
                    user_name: row.user_name || 'エラー',
                    click_count: row.click_count || 'エラー',
                    discount_rate_calc: 'Error',
                    discount_amount: 'Error',
                    payment_price: 'Error'
                };
            }

            const potentialDiscount = clickCount * ratePerClickNum;
            const maxDiscountAmount = priceNum * (maxDiscountRateNum / 100);
            const actualDiscount = Math.min(potentialDiscount, maxDiscountAmount);
            const finalPrice = Math.max(0, priceNum - actualDiscount);
            const discountRate = priceNum > 0 ? (actualDiscount / priceNum) * 100 : 0;
            return {
                event_name: row.event_name,
                user_name: row.user_name,          // 紹介ユーザー名
                click_count: clickCount,           // クリック数
                discount_rate_calc: discountRate.toFixed(2), // 割引率(%)
                discount_amount: actualDiscount.toFixed(0),   // 割引額(円)
                payment_price: Math.floor(finalPrice)         // 支払額(円)
                // original_price は含めない
                // user_id は含めない
            };
        });

        console.log('--- Sending discount summary data: ---');
        console.log(JSON.stringify(summary, null, 2));
        res.json(summary);

    } catch (error) {
        console.error('Get organizer discount summary error:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
});


// --- サーバー起動 ---
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Access the app via the forwarded URL in Codespace Ports tab.`);
    console.log(`phpMyAdmin should be available on the forwarded URL for port 8080.`);
    });

// --- エラーハンドリング (簡易) ---
// Multerのエラーハンドリングを追加 (任意)
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        // Multer固有のエラー (例: ファイルサイズ超過など)
        console.error('Multer error:', err);
        return res.status(400).json({ message: `ファイルアップロードエラー: ${err.message}` });
    } else if (err) {
        // MulterのfileFilterで発生したエラーなど
        console.error('File filter error or other error:', err);
        if (err.message === '画像ファイルのみアップロード可能です') {
             return res.status(400).json({ message: err.message });
        }
    }
    // その他のエラーは次のミドルウェアへ
    next(err);
});

// 最終的なエラーハンドラ
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.stack);
    res.status(500).json({ message: '予期せぬサーバーエラーが発生しました。既に他のSNSアカウントで登録済みの可能性があります。' });
}
);
