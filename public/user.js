// user.js (改訂版)

// グローバルスコープで宣言だけしておく
let currentUserId = null;
let userNameSpan = null;
let eventListDiv = null;
let discountListDiv = null;
let logoutButton = null;
let messageDiv = null;
let qrModal = null;
let qrCodeContainer = null;

// --- DOMContentLoaded イベントリスナー ---
// DOMが読み込まれた後に要素を取得し、初期化処理を実行
document.addEventListener('DOMContentLoaded', () => {
    // ★要素取得をここで行う
    userNameSpan = document.getElementById('userName');
    eventListDiv = document.getElementById('eventList');
    discountListDiv = document.getElementById('discountList'); 
    logoutButton = document.getElementById('logoutButton');
    messageDiv = document.getElementById('message');
    qrModal = document.getElementById('qrModal');
    qrCodeContainer = document.getElementById('qrCodeContainer');

    // null チェック (念のため)
    if (!userNameSpan) console.error('DOM Ready: userNameSpan element not found!');
    if (!eventListDiv) console.error('DOM Ready: eventListDiv element not found!');
    if (!logoutButton) console.error('DOM Ready: logoutButton element not found!');
    if (!messageDiv) console.error('DOM Ready: messageDiv element not found!');
    if (!qrModal) console.error('DOM Ready: qrModal element not found!');
    if (!qrCodeContainer) console.error('DOM Ready: qrCodeContainer element not found!');


    // ログアウトボタンのイベントリスナー設定
     if(logoutButton) {
        logoutButton.addEventListener('click', handleLogout); // 関数名を指定
     } else {
         console.error("Logout button not found, cannot add event listener.");
     }

    // 認証チェックとデータ読み込みを開始
    checkAuthAndLoadData();
});

// --- 関数定義 ---

// メッセージ表示
function showMessage(text, type = 'error') {
    if (!messageDiv) return; // 要素がなければ何もしない
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.classList.remove('hidden');
}

// メッセージ非表示
function hideMessage() {
    if (!messageDiv) return;
    messageDiv.classList.add('hidden');
    messageDiv.textContent = '';
    messageDiv.className = 'message hidden';
}

// 認証チェックとデータ読み込み
async function checkAuthAndLoadData() {
    const urlParams = new URLSearchParams(window.location.search);
    currentUserId = urlParams.get('user_id');

    if (!currentUserId) {
        console.log("User ID not found in URL, redirecting to login.");
        window.location.href = '/login.html'; // IDがなければログインへ
        return;
    }

    try {
        const response = await fetch('/api/auth/status'); // Cookieのトークンで認証
        if (!response.ok) {
            console.log("Auth status check failed, redirecting to login.");
            window.location.href = '/login.html';
            return;
        }
        const authData = await response.json();
        if (!authData.isAuthenticated || authData.user.type !== 'user' || authData.user.id !== parseInt(currentUserId, 10)) {
             console.warn('Authentication mismatch or failed, redirecting to login.', authData);
             window.location.href = '/login.html';
             return;
        }

        // 認証成功 -> ユーザー名、イベント、割引情報を読み込む
        console.log("Authentication successful. Loading user data...");
        loadUserName();
        loadEvents();
        loadDiscounts();

    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = '/login.html'; // エラー時もログインへ
    }
}

// ユーザー名読み込み
async function loadUserName() {
    if (!currentUserId || !userNameSpan) return;
    try {
        const response = await fetch(`/api/users/${currentUserId}`);
        if (response.ok) {
            const userData = await response.json();
            userNameSpan.textContent = userData.user_name;
        } else {
            console.error('Failed to load user name');
            userNameSpan.textContent = '取得失敗';
        }
    } catch (error) {
        console.error('Error loading user name:', error);
        userNameSpan.textContent = 'エラー';
    }
}

// イベント一覧読み込み
async function loadEvents() {
    if (!eventListDiv) return;
    eventListDiv.innerHTML = '<p>イベント情報を読み込み中...</p>'; // 初期表示
    try {
        const response = await fetch('/api/events');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const events = await response.json();
        displayEvents(events);
    } catch (error) {
        console.error('Error loading events:', error);
        eventListDiv.innerHTML = '<p>イベント情報の読み込みに失敗しました。</p>';
    }
}

// 割引情報読み込み
async function loadDiscounts() {
    if (!currentUserId || !discountListDiv) return; // 
    discountListDiv.innerHTML = '<p>割引情報を読み込み中...</p>'; // 初期表示 
    try {
        const response = await fetch(`/api/users/${currentUserId}/discounts`);
        if (!response.ok) {
            if (response.status === 403) {
                 window.location.href = '/login.html';
                 return;
             }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const discounts = await response.json();
        displayDiscounts(discounts);
    } catch (error) {
        console.error('Error loading discounts:', error);
        discountListDiv.innerHTML = `<p>割引情報の読み込みに失敗しました: ${error.message}</p>`;
    }
}

function displayEvents(events) {
    const eventListDiv = document.getElementById('eventList');
    if (!eventListDiv) return;
    eventListDiv.innerHTML = ''; // クリア

    if (!events || events.length === 0) {
        eventListDiv.innerHTML = '<p>現在、紹介可能なイベントはありません。</p>';
        return;
    }

    events.forEach((event, index) => { 
        const accordionItem = document.createElement('div');
        accordionItem.className = 'event-accordion-item';

        // --- 日付のフォーマット ---
        let formattedShortDate = '---';
        let formattedLongDate = '---';
        let formattedExpirateDate = '---';
        if (event.date) {
            try {
                // new Date() に渡す前に JST として解釈させる加工
                const dateStringForParsing = String(event.date).replace(' ', 'T') + '+09:00';
                const dateObj = new Date(dateStringForParsing);

                if (!isNaN(dateObj)) {
                    // 短い形式: MM月DD日
                    formattedShortDate = dateObj.toLocaleDateString('ja-JP', {
                        month: 'numeric',
                        day: 'numeric',
                        timeZone: 'Asia/Tokyo' // 出力もJST指定
                    });
                    // 長い形式: YYYY/MM/DD HH:MM:SS (既存の形式)
                    formattedLongDate = dateObj.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
                }
            } catch (e) {
                console.error(`Error formatting date for event ${event.event_id}:`, e);
            }
        }
        if (event.expirate) {
            try {
               const expirateStringForParsing = String(event.expirate).replace(' ', 'T') + '+09:00';
               const expirateObj = new Date(expirateStringForParsing);

               if (!isNaN(expirateObj)) { // ★ isNaN で Invalid Date かチェック
                   formattedExpirateDate = expirateObj.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
               } else {
                    console.error(`  Failed to parse event.expirate: "${expirateStringForParsing}" resulted in Invalid Date`);
                    formattedExpirateDate = '---'; // パース失敗時は '---' を明示
               }
           } catch (e) {
                console.error(`Error formatting expirate date for event ${event.event_id}:`, e);
                formattedExpirateDate = '---'; // エラー時も '---'
           }
       } else {
            formattedExpirateDate = '---'; // null/空の場合も '---'
       }

       // --- ★★★ 最安料金の計算 ★★★ ---
       let minimumPriceText = '---';
       const priceNum = parseFloat(event.price);
       const maxRateNum = parseFloat(event.max_discount_rate);
       if (!isNaN(priceNum) && priceNum > 0 && !isNaN(maxRateNum) && maxRateNum >= 0) {
           const minPrice = Math.floor(priceNum * (1 - maxRateNum / 100));
           minimumPriceText = `¥${minPrice.toLocaleString()}`;
       }

       // --- ★★★ 1クリックあたり割引額の準備 ★★★ ---
       let ratePerClickText = '---';
       const rateNum = parseFloat(event.rate_per_click);
       if (!isNaN(rateNum)) {
        ratePerClickText = `¥${Math.floor(rateNum).toLocaleString()}`;
       }

        // --- 要素の作成 ---
        
        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'event-summary';
        // ★ クリックで詳細を開閉する関数を呼び出す (this = summaryDiv)
        summaryDiv.onclick = function() { toggleEventDetails(this); };

        summaryDiv.innerHTML = `
            <span class="toggle-icon">▽</span>
            <span class="summary-event-name">${event.event_name}</span>
            <span class="summary-event-date">開催日: ${formattedShortDate}</span>
        `;

        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'event-full-details collapsed'; // ★ 最初は collapsed クラスを付与

        const referralLink = `${window.location.origin}/flyer.html?user_id=${currentUserId}&event_id=${event.event_id}`;
        const thumbnail = event.flyer ? `<img src="${event.flyer}" alt="${event.event_name} フライヤー" class="thumbnail">` : '';

        detailsDiv.innerHTML = `
            <div class="event-item-content"> ${/* サムネイルと詳細を囲むdiv */''}
                ${thumbnail}
                <div class="event-details">
                    ${/* イベント名はサマリーにあるので、タイトルは不要かも */''}
                    ${/* <h3>${event.event_name}</h3> */''}
                    <p><strong>通常価格:</strong> ${event.price ? `¥${Number(event.price).toLocaleString()}` : '未定'}</p>
                    <p><strong>クリック有効期限:</strong> ${formattedExpirateDate}</p>
                    <p><strong>割引額/クリック:</strong> ${ratePerClickText}</p> <p><strong>最安料金(割引上限):</strong> ${minimumPriceText}</p> <p>${event.description || ''}</p>
                    <div class="event-actions">
                        <div class="share-icons">
                            <button title="共有" onclick="shareReferralLink(this, '${event.event_name}', '${referralLink}')">Share</button>
                            <button title="クリップボードにコピー" onclick="copyReferralLink(this, '${referralLink}')">Copy</button>
                            <button title="QRコード表示" onclick="showQrCode('${referralLink}')">QR</button>
                            <button title="Twitterで共有" onclick="shareOnTwitter('${event.event_name}', '${referralLink}')">Twitter</button>
                            <button title="LINEで共有" onclick="shareOnLine('${event.event_name}', '${referralLink}')">LINE</button>
                        </div>
                        <span class="share-message" style="display: block; width: 100%; margin-top: 8px; font-size: 0.9em; color: blue;"></span>
                    </div>
                </div>
            </div>
        `;

        accordionItem.appendChild(summaryDiv);
        accordionItem.appendChild(detailsDiv);
        eventListDiv.appendChild(accordionItem);
    });
}

function toggleEventDetails(summaryElement) {
    // summaryElement の兄弟要素である詳細部分を取得
    const detailsElement = summaryElement.nextElementSibling;
    // summaryElement 内のアイコンを取得
    const iconElement = summaryElement.querySelector('.toggle-icon');

    if (detailsElement && detailsElement.classList.contains('event-full-details')) {
        // collapsed クラスを付け外しして表示を切り替える
        detailsElement.classList.toggle('collapsed');

        // アイコンの表示を切り替える
        if (iconElement) {
            if (detailsElement.classList.contains('collapsed')) {
                iconElement.textContent = '▽'; // 閉じている状態
            } else {
                iconElement.textContent = '△'; // 開いている状態

                // --- オプション: 他の項目を閉じる ---
                // 同じ親要素(eventListDiv) 内の他の accordion-item を探す
                const allItems = summaryElement.closest('#eventList')?.querySelectorAll('.event-accordion-item');
                if (allItems) {
                    allItems.forEach(item => {
                        // 現在クリックされた項目以外で開いているものを探す
                        const otherSummary = item.querySelector('.event-summary');
                        const otherDetails = item.querySelector('.event-full-details');
                        const otherIcon = item.querySelector('.toggle-icon');
                        // 自分自身でなく、かつ閉じられていない場合
                        if (otherSummary !== summaryElement && otherDetails && !otherDetails.classList.contains('collapsed')) {
                            otherDetails.classList.add('collapsed'); // 閉じる
                            if (otherIcon) otherIcon.textContent = '▽'; // アイコンを戻す
                        }
                    });
                }
                // --- ここまでオプション ---
            }
        }
    } else {
        console.error("Could not find details element for toggling.");
    }
}

// 割引情報表示
function displayDiscounts(discounts) {
    // ★ コンテナ要素を取得 (ID を discountList に変更) ★
    const discountListDiv = document.getElementById('discountList');
    if (!discountListDiv) {
        console.error("Discount list container '#discountList' not found.");
        return;
    }

    discountListDiv.innerHTML = ''; // 中身をクリア

    if (!discounts || discounts.length === 0) {
        discountListDiv.innerHTML = '<p>適用可能な割引はありません。</p>';
        return;
    }

    discounts.forEach(discount => {
        // 各割引情報のエントリを div で作成
        const discountItemCard = document.createElement('div');
        discountItemCard.className = 'discount-item-card'; // スタイル付け用のクラス

        discountItemCard.innerHTML = `
            <div class="discount-card-row">
                <div class="discount-card-label">イベント名</div>
                <div class="discount-card-value event-name">${discount.event_name}</div>
            </div>
            <div class="discount-card-row">
                <div class="discount-card-label">支払額</div>
                <div class="discount-card-value payment-price bold">¥${Number(discount.payment_price).toLocaleString()}</div>
            </div>
            <div class="discount-card-row">
                <div class="discount-card-label">有効クリック/割引額</div>
                <div class="discount-card-value click-discount">
                    ${discount.click_count} 回 / ¥${Number(discount.discount_amount).toLocaleString()} (${discount.discount_rate_calc}%)
                </div>
            </div>
            <div class="discount-card-row">
                <div class="discount-card-label">元価格</div>
                <div class="discount-card-value original-price">¥${Number(discount.original_price).toLocaleString()}</div>
            </div>
        `;
        discountListDiv.appendChild(discountItemCard);
    });
}

// クリップボードにコピー
function copyReferralLink(buttonElement, text) {
    // ボタンの親要素 (event-actions) 内にあるメッセージ表示用のspanを探す
    const messageSpan = buttonElement.closest('.event-actions')?.querySelector('.share-message');
    if (!messageSpan) {
        console.error("Could not find message span for copy action.");
        // フォールバックとしてグローバルメッセージを使うことも可能
        // showMessage('メッセージ表示欄が見つかりません。');
        return;
    }

    navigator.clipboard.writeText(text).then(() => {
        messageSpan.textContent = 'コピーしました！';
        messageSpan.style.color = 'green';
        // 3秒後にメッセージを消す
        setTimeout(() => {
            messageSpan.textContent = '';
        }, 3000);
    }, (err) => {
        console.error('Clipboard copy failed: ', err);
        messageSpan.textContent = 'コピーに失敗しました。';
        messageSpan.style.color = 'red';
         // 5秒後にメッセージを消す
        setTimeout(() => {
            messageSpan.textContent = '';
        }, 5000);
    });
}

// Twitter共有
function shareOnTwitter(eventName, link) {
    const text = encodeURIComponent(`${eventName}のフライヤーとディスカウントはこちら：`);
    const url = encodeURIComponent(link);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
}

// LINE共有
function shareOnLine(eventName, link) {
    const text = encodeURIComponent(`${eventName}\n${link}`);
    window.open(`https://line.me/R/msg/text/?${text}`, '_blank');
}

// QRコード表示
function showQrCode(link) {
    if (!qrCodeContainer || !qrModal) {
        console.error("QR Code container or modal not found.");
        return;
    }
    qrCodeContainer.innerHTML = ''; // 前のQRコードをクリア
    try {
         // QRCode ライブラリがグローバルスコープに存在するか確認
         if (typeof QRCode === 'undefined') {
             throw new Error('QRCode library is not loaded.');
         }
         new QRCode(qrCodeContainer, {
            text: link,
            width: 128,
            height: 128,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
        qrModal.classList.remove('hidden'); // モーダルを表示
    } catch(e) {
        console.error("QR Code generation failed:", e);
        showMessage(`QRコードの生成に失敗しました: ${e.message}`);
         setTimeout(hideMessage, 3000);
    }
}

// QRコードモーダルを閉じる
function closeQrModal() {
    console.log('closeQrModal function called!');
    console.log('qrModal variable:', qrModal);
    if (qrModal) {
        qrModal.classList.add('hidden'); // モーダルを非表示
        if (qrCodeContainer) qrCodeContainer.innerHTML = ''; // 中身もクリア
        console.log('hidden クラスを追加しようとしました。');
    } else {
        console.error('qrModal 要素が見つかりません！ IDを確認してください。');
    }
}

async function shareReferralLink(buttonElement, eventName, url) {
    const messageSpan = buttonElement.closest('.event-actions')?.querySelector('.share-message');

    // 共有するデータを作成
    const shareData = {
        title: `「${eventName}」の共有`, 
        url: url // 紹介リンクのURL
    };

    // Web Share API が使えるか確認
    if (navigator.share) {
        try {
            // OSの共有ダイアログを呼び出す
            await navigator.share(shareData);
            console.log(`紹介リンク (${url}) の共有に成功しました。`);
            // 必要なら成功メッセージを表示
            if (messageSpan) {
                 messageSpan.textContent = '共有ダイアログを開きました。';
                 messageSpan.style.color = 'green';
                 setTimeout(() => { messageSpan.textContent = ''; }, 3000);
            }
        } catch (err) {
            console.error('紹介リンクの共有エラー:', err);
            // ユーザーがキャンセルした場合 (AbortError) はメッセージを表示しない
            if (err.name !== 'AbortError' && messageSpan) {
                messageSpan.textContent = '共有に失敗しました。';
                messageSpan.style.color = 'red';
                setTimeout(() => { messageSpan.textContent = ''; }, 5000);
            }
        }
    } else {
        // Web Share API が使えないブラウザの場合
        console.warn('Web Share APIはこのブラウザではサポートされていません。');
        if (messageSpan) {
            messageSpan.textContent = 'お使いのブラウザではこの共有機能は利用できません。';
            messageSpan.style.color = 'orange';
             setTimeout(() => { messageSpan.textContent = ''; }, 5000);
        }
        // alert('お使いのブラウザではこの共有機能は利用できません。\nお手数ですが、他の共有ボタン（コピー、Twitter、LINE）をご利用ください。');
    }
}

// ログアウト処理
async function handleLogout() {
     try {
        const response = await fetch('/api/logout', { method: 'POST' });
        if (response.ok) {
            window.location.href = '/login.html';
        } else {
            const result = await response.json().catch(() => ({})); // エラー時もjson解析試行
            showMessage(result.message || 'ログアウトに失敗しました。');
            setTimeout(hideMessage, 3000);
        }
    } catch (error) {
        console.error('Logout error:', error);
        showMessage('ログアウト中にエラーが発生しました。');
        setTimeout(hideMessage, 3000);
    }
}