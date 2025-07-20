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
const { google } = require('googleapis');

// --- Express アプリケーションの初期化 ---
const app = express();
const port = process.env.PORT || 3000;

// --- ミドルウェア設定 ---
app.use(cors({
    origin: true,
    credentials: true,
}));
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: 60 * 60 * 1000
  }
}));
app.use(passport.initialize());

// --- Passport Strategy 設定 ---
// (既存のPassport設定は変更なしのため、ここでは省略します。元のコードをそのまま使用してください)
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
        scope: ['profile', 'openid', 'email'],
        passReqToCallback: true,
        kid: process.env.LINE_KID
      },
      async (req, accessToken, refreshToken, profile, done) => {
        console.log('LINE Profile Received:', profile);
        const lineId = profile.id;
        const email = profile.email || null;
        const displayName = profile.displayName;

        const intendedType = req.session.authType;
        console.log('Intended auth type:', intendedType);
        console.log(`LINE Profile Info: ID=${lineId}, Email=${email}, Name=${displayName}`);

        try {
            let user = null;
            let [organizers] = await pool.query('SELECT organizer_id as id FROM organizers WHERE social_id = ?', [lineId]);
            if (organizers.length > 0) { user = { id: organizers[0].id, type: 'organizer' }; req.session.authType = null; return done(null, user); }
            let [users] = await pool.query('SELECT user_id as id FROM users WHERE social_id = ?', [lineId]);
            if (users.length > 0) { user = { id: users[0].id, type: 'user' }; req.session.authType = null; return done(null, user); }

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
            }

            if (!email && intendedType === 'organizer') {
                req.session.authType = null;
                return done(new Error('オーガナイザー登録にはメールアドレスが必要です。LINEアカウントにメールアドレスを登録・連携してください。'), null);
            }
            if (!email && intendedType === 'user') {
                 req.session.authType = null;
                 return done(new Error('ユーザー登録にはメールアドレスが必要です。LINEアカウントにメールアドレスを登録・連携してください。'), null);
             }

            if (intendedType === 'user') {
                console.log('Creating new user with LINE profile (email may be null)');
                const [newUserResult] = await pool.query('INSERT INTO users (mail, user_name, social_id, pass) VALUES (?, ?, ?, NULL)', [email, displayName, lineId]);
                user = { id: newUserResult.insertId, type: 'user' }; req.session.authType = null; return done(null, user);
            } else if (intendedType === 'organizer') {
                console.log('New organizer registration attempt via LINE (email may be null), redirecting to invite code page');
                req.session.pendingLineProfile = { lineId, email, displayName };
                req.session.authType = null; return done(null, { type: 'pending_organizer' });
            } else { req.session.authType = null; return done(new Error('認証プロセスエラー: ログインタイプ不明'), null); }

        } catch (err) {
             console.error('Error in LINE Strategy verify callback:', err);
             req.session.authType = null; req.session.pendingLineProfile = null;
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
        dateStrings: true
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

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/api/organizers/:organizerId/reward-summary/gsheet-url', authenticateToken, async (req, res) => {
    const targetOrganizerId = parseInt(req.params.organizerId, 10);
    if (req.user.type !== 'organizer' || req.user.id !== targetOrganizerId) {
        return res.status(403).json({ message: 'アクセス権限がありません' });
    }

    const { event_id } = req.query;
    if (!event_id) {
        return res.status(400).json({ message: 'イベントIDが指定されていません。' });
    }

    try {
        // --- Google API 認証 ---
        const auth = new google.auth.GoogleAuth({
            keyFile: path.join(__dirname, 'credentials.json'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'],
        });
        const sheets = google.sheets({ version: 'v4', auth });
        const drive = google.drive({ version: 'v3', auth });

        // --- データベースからデータを取得 ---
        const [eventRows] = await pool.query(
            'SELECT event_name, price, reward_type FROM events WHERE event_id = ? AND organizer_id = ?',
            [event_id, targetOrganizerId]
        );
        if (eventRows.length === 0) {
            return res.status(404).json({ message: 'イベントが見つからないか、アクセス権限がありません。' });
        }
        const event = eventRows[0];

        const sql = `
            SELECT u.user_name, ur.reward_type, ur.reward_value, ur.quantity, ur.is_claimed
            FROM user_rewards ur JOIN users u ON ur.user_id = u.user_id
            WHERE ur.event_id = ? ORDER BY u.user_name ASC`;
        const [summaryRows] = await pool.query(sql, [event_id]);

        // --- スプレッドシート用のデータ整形 ---
        const manualLine = '入場者が画面上で交換ボタンを押したことを目視で確認してください。';
        let headers = ['紹介ユーザー名', '特典タイプ', '特典内容', '数量', '状態'];
        if (event.reward_type === 'discount') {
            headers.push('通常価格', '支払金額(計算式)');
        }

        const dataForSheet = summaryRows.map((row, index) => {
            const status = row.is_claimed ? '交換済み' : '未交換';
            const rowNum = index + 3;
            let rowData = [row.user_name, row.reward_type, row.reward_value, row.quantity, status];
            if (row.reward_type === 'discount') {
                const formula = `=F${rowNum}-(F${rowNum}*(C${rowNum}/100)*D${rowNum})`;
                rowData.push(event.price, { formulaValue: formula });
            }
            return { values: rowData.map(cell => (typeof cell === 'object' && cell.formulaValue) ? { userEnteredValue: { formulaValue: cell.formulaValue } } : { userEnteredValue: { stringValue: String(cell) } }) };
        });

        // --- Google Sheets API 実行 ---
        // 1. 新しいスプレッドシートを作成
        const spreadsheet = await sheets.spreadsheets.create({
            resource: { properties: { title: `${event.event_name} 特典サマリー` } },
            fields: 'spreadsheetId,spreadsheetUrl',
        });
        const spreadsheetId = spreadsheet.data.spreadsheetId;
        const spreadsheetUrl = spreadsheet.data.spreadsheetUrl;

        // 2. ★★★ 権限を「リンクを知っている全員が閲覧可」に変更 ★★★
        await drive.permissions.create({
            fileId: spreadsheetId,
            requestBody: {
                role: 'reader',
                type: 'anyone', // 'user'から'anyone'に変更
            },
        });
        
        // 3. 作成したシートを指定のDriveフォルダに移動
        await drive.files.update({
            fileId: spreadsheetId,
            addParents: process.env.GOOGLE_DRIVE_FOLDER_ID,
            removeParents: 'root',
            fields: 'id, parents',
        });
        
        // 4. データをシートに書き込み
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            resource: {
                data: [
                    { range: 'A1', values: [[manualLine]] },
                    { range: 'A2', values: [headers] },
                    { range: 'A3', values: dataForSheet.map(r => r.values.map(c => c.userEnteredValue.formulaValue || c.userEnteredValue.stringValue)) }
                ],
                valueInputOption: 'USER_ENTERED'
            }
        });

        res.json({ sheetUrl: spreadsheetUrl });

    } catch (error) {
        console.error('Error with Google Sheets API:', error);
        res.status(500).json({ message: 'スプレッドシートの作成中にエラーが発生しました。' });
    }
});


// --- 認証関連 ---
app.get('/auth/google/user', (req, res, next) => { req.session.authType = 'user'; passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next); });
app.get('/auth/google/organizer', (req, res, next) => { req.session.authType = 'organizer'; passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next); });
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login.html?error=google_auth_failed', session: false }), (req, res) => { handleSocialAuthCallback(req, res); });
app.get('/auth/facebook/user', (req, res, next) => { req.session.authType = 'user'; passport.authenticate('facebook', { scope: ['email', 'public_profile'] })(req, res, next); });
app.get('/auth/facebook/organizer', (req, res, next) => { req.session.authType = 'organizer'; passport.authenticate('facebook', { scope: ['email', 'public_profile'] })(req, res, next); });
app.get('/auth/facebook/callback', passport.authenticate('facebook', { failureRedirect: '/login.html?error=facebook_auth_failed', session: false }), (req, res) => { handleSocialAuthCallback(req, res); });
app.get('/auth/line/user', (req, res, next) => {
    req.session.authType = 'user';
    const state = Math.random().toString(36).substring(7);
    req.session.lineAuthState = state;
    passport.authenticate('line', { scope: ['profile', 'openid', 'email'], state: state })(req, res, next);
  });
  app.get('/auth/line/organizer', (req, res, next) => {
    req.session.authType = 'organizer';
    const state = Math.random().toString(36).substring(7);
    req.session.lineAuthState = state;
    passport.authenticate('line', { scope: ['profile', 'openid', 'email'], state: state })(req, res, next);
  });
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
function handleSocialAuthCallback(req, res) {
    console.log('Social Auth callback processing, req.user:', req.user);

    if (req.user && req.user.type === 'pending_organizer') {
        if (req.session.pendingGoogleProfile || req.session.pendingFacebookProfile || req.session.pendingLineProfile) {
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
app.get('/register/organizer/invite', (req, res) => {
    if (!req.session.pendingGoogleProfile && !req.session.pendingFacebookProfile && !req.session.pendingLineProfile) {
        console.log('Access to invite page without pending profile.');
        return res.redirect('/login.html?error=session_expired');
    }
    res.sendFile(path.join(__dirname, 'public', 'organizer_invite.html'));
});
app.post('/register/organizer/invite', async (req, res) => {
    const pendingProfile = req.session.pendingGoogleProfile || req.session.pendingFacebookProfile || req.session.pendingLineProfile;

    if (!pendingProfile) { return res.status(400).json({ message: 'セッション情報が見つかりません。' }); }

    const { inviteCode } = req.body;
    const correctInviteCode = process.env.ORGANIZER_INVITE_CODE;

    if (!inviteCode || inviteCode !== correctInviteCode) { return res.status(400).json({ message: '招待コードが正しくありません。' }); }

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
app.post('/api/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'ログアウトしました' });
});
app.get('/api/auth/status', authenticateToken, (req, res) => {
    res.json({ isAuthenticated: true, user: req.user });
});

// --- ユーザー関連 API ---
app.get('/api/users/:userId', authenticateToken, async (req, res) => {
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
// 【修正】イベント一覧取得API (特典情報も取得)
app.get('/api/events', async (req, res) => {
    try {
        const now = new Date();
        const [rows] = await pool.query(
            `SELECT e.event_id, e.event_name, e.date, e.price, e.expirate, e.flyer,
                 e.reward_type, e.reward_value, e.clicks_for_reward, e.max_rewards, o.organizer_name
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

// 【修正】特定のイベント情報取得API (特典情報も取得)
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

// --- クリックログ記録 API (変更なし) ---
app.post('/api/clicks', async (req, res) => {
    const { event_id, user_id } = req.body;
    const ip_address = req.ip;

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
            [event_id, user_id, ip_address]
        );

        res.cookie(cookieName, '1', {
             maxAge: 24 * 60 * 60 * 1000,
             httpOnly: true,
             secure: process.env.NODE_ENV === 'production',
             sameSite: 'Lax'
        });

        res.status(201).json({ message: 'クリックを記録しました', logged: true });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
             res.cookie(cookieName, '1', { maxAge: 24 * 60 * 60 * 1000, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Lax' });
             return res.status(200).json({ message: 'クリック済みです (DB)', logged: false });
        }
        console.error('Log click error:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
});

// --- 【新規】ユーザーの特典情報取得 API ---
// 既存の /api/users/:userId/discounts をこのAPIに置き換えます。
app.get('/api/users/:userId/rewards', authenticateToken, async (req, res) => {
    const targetUserId = parseInt(req.params.userId, 10);
    if (req.user.type !== 'user' || req.user.id !== targetUserId) {
        return res.status(403).json({ message: 'アクセス権限がありません' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. ユーザーがクリックしたイベントの一覧とクリック数を取得
        const [clickCounts] = await connection.query(
            `SELECT
                cl.event_id,
                COUNT(cl.click_id) AS valid_clicks,
                e.reward_type,
                e.reward_value,
                e.clicks_for_reward,
                e.max_rewards
             FROM click_logs cl
             JOIN events e ON cl.event_id = e.event_id
             WHERE cl.user_id = ? AND cl.clicked_at <= e.expirate
             GROUP BY cl.event_id, e.reward_type, e.reward_value, e.clicks_for_reward, e.max_rewards`,
            [targetUserId]
        );

        // 2. イベントごとに、発行済みの特典数を取得
        const [issuedRewards] = await connection.query(
            `SELECT event_id, SUM(quantity) as issued_count
             FROM user_rewards
             WHERE user_id = ?
             GROUP BY event_id`,
            [targetUserId]
        );
        const issuedMap = issuedRewards.reduce((map, row) => {
            map[row.event_id] = row.issued_count;
            return map;
        }, {});

        // 3. 新しく発行すべき特典を計算し、DBに挿入
        for (const clickInfo of clickCounts) {
            const issuedCount = issuedMap[clickInfo.event_id] || 0;
            const totalPossibleRewards = Math.floor(clickInfo.valid_clicks / clickInfo.clicks_for_reward);
            const rewardsToIssue = Math.min(totalPossibleRewards, clickInfo.max_rewards) - issuedCount;

            if (rewardsToIssue > 0) {
                const [existingReward] = await connection.query(
                    `SELECT user_reward_id FROM user_rewards
                     WHERE user_id = ? AND event_id = ? AND is_claimed = FALSE`,
                    [targetUserId, clickInfo.event_id]
                );

                if (existingReward.length > 0) {
                    await connection.query(
                        `UPDATE user_rewards SET quantity = quantity + ? WHERE user_reward_id = ?`,
                        [rewardsToIssue, existingReward[0].user_reward_id]
                    );
                } else {
                    await connection.query(
                        `INSERT INTO user_rewards (user_id, event_id, reward_type, reward_value, quantity, is_claimed)
                         VALUES (?, ?, ?, ?, ?, FALSE)`,
                        [targetUserId, clickInfo.event_id, clickInfo.reward_type, clickInfo.reward_value, rewardsToIssue]
                    );
                }
            }
        }

        // 4. 最終的な特典一覧をDBから取得して返す
        // ★★★ WHERE句にイベント終了後24時間以内の条件を追加 ★★★
        const [finalRewards] = await connection.query(
            `SELECT ur.*, e.event_name, e.price
             FROM user_rewards ur
             JOIN events e ON ur.event_id = e.event_id
             WHERE ur.user_id = ? AND e.date >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
             ORDER BY e.date DESC, ur.created_at DESC`,
            [targetUserId]
        );

        await connection.commit();
        connection.release();

        const rewardsWithPrice = finalRewards.map(reward => {
            if (reward.reward_type === 'discount') {
                const priceNum = parseFloat(reward.price);
                const discountRate = parseFloat(reward.reward_value);
                const discountAmount = priceNum * (discountRate / 100) * reward.quantity;
                const payment_price = Math.max(0, Math.floor(priceNum - discountAmount));
                return { ...reward, payment_price };
            }
            return reward;
        });

        res.json(rewardsWithPrice);

    } catch (error) {
        if (connection) {
            await connection.rollback();
            connection.release();
        }
        console.error('Get/Process user rewards error:', error);
        res.status(500).json({ message: '特典情報の処理中にエラーが発生しました' });
    }
});

// --- 【新規】特典交換API ---
app.post('/api/users/:userId/rewards/:userRewardId/claim', authenticateToken, async (req, res) => {
    const targetUserId = parseInt(req.params.userId, 10);
    const userRewardId = parseInt(req.params.userRewardId, 10);

    if (req.user.type !== 'user' || req.user.id !== targetUserId) {
        return res.status(403).json({ message: 'アクセス権限がありません' });
    }

    try {
        const [result] = await pool.query(
            'UPDATE user_rewards SET is_claimed = TRUE WHERE user_reward_id = ? AND user_id = ? AND is_claimed = FALSE',
            [userRewardId, targetUserId]
        );

        if (result.affectedRows > 0) {
            res.json({ message: '特典を交換しました' });
        } else {
            res.status(404).json({ message: '交換対象の特典が見つからないか、既に使用済みです' });
        }
    } catch (error) {
        console.error('Claim reward error:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
});


// --- オーガナイザー関連 API ---
// (情報取得、イベント一覧取得、イベント削除APIは変更なしのため省略)
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
app.get('/api/organizers/:organizerId/events', authenticateToken, async (req, res) => {
    const targetOrganizerId = parseInt(req.params.organizerId, 10);
    if (req.user.type !== 'organizer' || req.user.id !== targetOrganizerId) {
        return res.status(403).json({ message: 'アクセス権限がありません' });
    }
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [rows] = await pool.query(
            `SELECT event_id, event_name, date, price, reward_type, reward_value, clicks_for_reward, max_rewards, expirate, flyer
             FROM events
             WHERE organizer_id = ? AND date >= ? ORDER BY date DESC`,
            [targetOrganizerId, thirtyDaysAgo]
        );
        res.json(rows);
    } catch (error) {
        console.error('Get organizer events error:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
});
app.delete('/api/organizers/:organizerId/events/:eventId', authenticateToken, async (req, res) => {
    const targetOrganizerId = parseInt(req.params.organizerId, 10);
    const eventIdToDelete = parseInt(req.params.eventId, 10);

    if (req.user.type !== 'organizer' || req.user.id !== targetOrganizerId) {
        return res.status(403).json({ message: 'イベントを削除する権限がありません' });
    }
    if (isNaN(eventIdToDelete)) {
        return res.status(400).json({ message: '無効なイベントIDです' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [eventRows] = await connection.query(
            'SELECT flyer FROM events WHERE event_id = ? AND organizer_id = ?',
            [eventIdToDelete, targetOrganizerId]
        );

        if (eventRows.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ message: '削除対象のイベントが見つからないか、あなたが所有者ではありません' });
        }
        const flyerPathToDelete = eventRows[0].flyer;

        const [clickRows] = await connection.query(
            'SELECT COUNT(*) as click_count FROM click_logs WHERE event_id = ?',
            [eventIdToDelete]
        );
        const clickCount = clickRows[0].click_count;

        if (clickCount > 0) {
            await connection.rollback();
            connection.release();
            console.log(`Event ${eventIdToDelete} has ${clickCount} clicks, deletion denied.`);
            return res.status(400).json({ message: `クリックログが ${clickCount} 件存在するため削除できません` });
        }

        console.log(`Attempting to delete event ${eventIdToDelete} (click count: 0)...`);
        const [deleteResult] = await connection.query(
            'DELETE FROM events WHERE event_id = ?',
            [eventIdToDelete]
        );

        if (deleteResult.affectedRows === 0) {
             throw new Error('Event deletion failed unexpectedly.');
        }

        if (flyerPathToDelete) {
            const absolutePath = path.join(__dirname, 'public', flyerPathToDelete);
            console.log(`Attempting to delete flyer image: ${absolutePath}`);
            try {
                await fs.promises.unlink(absolutePath);
                console.log(`Successfully deleted flyer image: ${absolutePath}`);
            } catch (fileError) {
                console.warn(`Failed to delete flyer image (${absolutePath}):`, fileError.message);
            }
        }

        await connection.commit();
        console.log(`Event ${eventIdToDelete} deleted successfully.`);
        res.json({ message: 'イベントを削除しました' });

    } catch (error) {
        console.error(`Error deleting event ${eventIdToDelete}:`, error);
        if (connection) {
            await connection.rollback();
        }
        res.status(500).json({ message: 'イベント削除中にエラーが発生しました' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});


// --- 【修正】新規イベント追加 API (Multer対応・特典対応版) ---
app.post('/api/organizers/:organizerId/events', authenticateToken, upload.single('flyerImageFile'), async (req, res) => {
    const targetOrganizerId = parseInt(req.params.organizerId, 10);
    if (req.user.type !== 'organizer' || req.user.id !== targetOrganizerId) {
        if (req.file) { fs.unlink(req.file.path, (err) => { if (err) console.error("Failed to delete file on auth error:", err); }); }
        return res.status(403).json({ message: 'アクセス権限がありません' });
    }

    const { event_name, date, price, expirate, reward_type, reward_value, clicks_for_reward, max_rewards } = req.body;

    if (!req.file) {
        return res.status(400).json({ message: 'フライヤー画像ファイルは必須です' });
    }

    const flyerUrlPath = `/uploads/${req.file.filename}`;
    const priceNum = parseFloat(price);
    const clicksForRewardNum = parseInt(clicks_for_reward, 10);
    const maxRewardsNum = parseInt(max_rewards, 10);

    if (!event_name || !date || !expirate || !reward_type || !reward_value || isNaN(priceNum) || isNaN(clicksForRewardNum) || isNaN(maxRewardsNum)) {
        fs.unlink(req.file.path, (err) => { if (err) console.error("Failed to delete file on validation error:", err); });
        return res.status(400).json({ message: '必須項目が不足しているか、数値が無効です' });
    }

    const formatDateTimeForDB = (dateTimeLocalString) => {
        if (!dateTimeLocalString || typeof dateTimeLocalString !== 'string') return null;
        return dateTimeLocalString.replace('T', ' ') + ':00';
    };
    const dbDate = formatDateTimeForDB(date);
    const dbExpirate = formatDateTimeForDB(expirate);

    if (!dbDate || !dbExpirate) {
        fs.unlink(req.file.path, (err) => { if (err) console.error("Failed to delete file on date format error:", err); });
        return res.status(400).json({ message: '日付または有効期限の形式が無効です' });
    }

    try {
        const sql = `INSERT INTO events
            (organizer_id, event_name, date, price, expirate, flyer, reward_type, reward_value, clicks_for_reward, max_rewards)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const values = [targetOrganizerId, event_name, dbDate, priceNum, dbExpirate, flyerUrlPath, reward_type, reward_value, clicksForRewardNum, maxRewardsNum];

        const [result] = await pool.query(sql, values);
        res.status(201).json({ message: 'イベントを追加しました', eventId: result.insertId, flyerPath: flyerUrlPath });
    } catch (error) {
        console.error('Add event DB error:', error);
        fs.unlink(req.file.path, (err) => { if (err) console.error("Failed to delete file on DB error:", err); });
        res.status(500).json({ message: 'データベースエラーが発生しました' });
    }
});

// --- 【修正】オーガナイザー向け特典状況確認 API ---
// /api/organizers/:organizerId/discount-summary をこのAPIに置き換えます。
app.get('/api/organizers/:organizerId/reward-summary', authenticateToken, async (req, res) => {
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
                u.user_name,
                ur.reward_type,
                ur.reward_value,
                ur.quantity,
                ur.is_claimed
            FROM user_rewards ur
            JOIN events e ON ur.event_id = e.event_id
            JOIN users u ON ur.user_id = u.user_id
            WHERE e.organizer_id = ? AND e.date >= ?
        `;
        const params = [targetOrganizerId, thirtyDaysAgo];

        if (filterEventId) {
            sql += ' AND ur.event_id = ?';
            params.push(filterEventId);
        }
        sql += ' ORDER BY e.date DESC, u.user_name ASC';

        const [rows] = await pool.query(sql, params);
        res.json(rows);

    } catch (error) {
        console.error('Get organizer reward summary error:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました' });
    }
});

// --- サーバー起動 ---
app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
});

// --- エラーハンドリング ---
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        console.error('Multer error:', err);
        return res.status(400).json({ message: `ファイルアップロードエラー: ${err.message}` });
    } else if (err) {
        if (err.message === '画像ファイルのみアップロード可能です') {
             return res.status(400).json({ message: err.message });
        }
    }
    next(err);
});
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.stack);
    res.status(500).json({ message: '予期せぬサーバーエラーが発生しました。' });
});
