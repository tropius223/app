// user.js (特典機能改修版)

// --- グローバル変数定義 ---
let currentUserId = null;
let userNameSpan = null;
let eventListDiv = null;
let rewardListDiv = null; // ★ discountListDiv から rewardListDiv に変更
let logoutButton = null;
let messageDiv = null;
let qrModal = null;
let qrCodeContainer = null;

// --- DOMContentLoaded イベントリスナー ---
document.addEventListener('DOMContentLoaded', () => {
    // --- 要素取得 ---
    userNameSpan = document.getElementById('userName');
    eventListDiv = document.getElementById('eventList');
    rewardListDiv = document.getElementById('rewardList'); // ★ IDを変更
    logoutButton = document.getElementById('logoutButton');
    messageDiv = document.getElementById('message');
    qrModal = document.getElementById('qrModal');
    qrCodeContainer = document.getElementById('qrCodeContainer');
    const newUsernameInput = document.getElementById('new-username');
    const saveUsernameBtn = document.getElementById('save-username-btn');
    const showUsernameFormBtn = document.getElementById('show-username-form-btn');
    const usernameEditArea = document.getElementById('username-edit-area');

    // 「ユーザーネームを変更する」リンクのクリックイベント
    if (showUsernameFormBtn) {
        showUsernameFormBtn.addEventListener('click', (e) => {
            e.preventDefault(); // リンクのデフォルト動作をキャンセル
            showUsernameFormBtn.style.display = 'none'; // リンクを隠す
            usernameEditArea.style.display = 'block'; // 入力フォームを表示
            newUsernameInput.focus(); // 入力欄にフォーカスを当てる
        });
    }

    // ユーザーネーム保存ボタンのイベントリスナー
    if (saveUsernameBtn) {
        saveUsernameBtn.addEventListener('click', () => {
            const newUsername = newUsernameInput.value.trim();
            if (!newUsername) {
                showMessage('新しいユーザーネームを入力してください。', 'error');
                return;
            }

            // サーバーに更新リクエストを送信
            fetch('/api/user/update-username', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ newUsername: newUsername }),
            })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => { throw new Error(err.message) });
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    userNameSpan.textContent = data.newUsername;
                    newUsernameInput.value = '';
                    showMessage(data.message, 'success');
                    // 成功したらフォームを閉じてリンクを再表示
                    usernameEditArea.style.display = 'none';
                    showUsernameFormBtn.style.display = 'block';
                } else {
                    showMessage(data.message || '更新に失敗しました。', 'error');
                }
            })
            .catch(error => {
                console.error('更新エラー:', error);
                showMessage(error.message || '更新中にエラーが発生しました。', 'error');
            });
        });
    }

    // ログアウトボタンのイベントリスナー設定
    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }

    // 認証チェックとデータ読み込みを開始
    checkAuthAndLoadData();
});

// --- 関数定義 ---

// メッセージ表示
function showMessage(text, type = 'error') {
    if (!messageDiv) return;
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
        window.location.href = '/login.html';
        return;
    }

    try {
        const response = await fetch('/api/auth/status');
        if (!response.ok) {
            window.location.href = '/login.html';
            return;
        }
        const authData = await response.json();
        if (!authData.isAuthenticated || authData.user.type !== 'user' || authData.user.id !== parseInt(currentUserId, 10)) {
            window.location.href = '/login.html';
            return;
        }

        // 認証成功 -> ユーザー名、イベント、特典情報を読み込む
        loadUserName();
        loadEvents();
        loadRewards(); // ★ loadDiscounts から loadRewards に変更

    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = '/login.html';
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
        }
    } catch (error) {
        console.error('Error loading user name:', error);
    }
}

// イベント一覧読み込み
async function loadEvents() {
    if (!eventListDiv) return;
    eventListDiv.innerHTML = '<p>イベント情報を読み込み中...</p>';
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

/**
 * [新規] 特典情報読み込み関数 (loadDiscountsを置き換え)
 */
async function loadRewards() {
    if (!currentUserId || !rewardListDiv) return;
    rewardListDiv.innerHTML = '<p>特典情報を読み込み中...</p>';
    try {
        // APIエンドポイントを /rewards に変更
        const response = await fetch(`/api/users/${currentUserId}/rewards`);
        if (!response.ok) {
            if (response.status === 403) {
                window.location.href = '/login.html';
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const rewards = await response.json();
        displayRewards(rewards); // ★ displayDiscounts から displayRewards に変更
    } catch (error) {
        console.error('Error loading rewards:', error);
        rewardListDiv.innerHTML = `<p>特典情報の読み込みに失敗しました: ${error.message}</p>`;
    }
}

/**
 * [修正] イベント一覧表示関数 (特典情報を表示するように)
 */
function displayEvents(events) {
    if (!eventListDiv) return;
    eventListDiv.innerHTML = '';

    if (!events || events.length === 0) {
        eventListDiv.innerHTML = '<p>現在、紹介可能なイベントはありません。</p>';
        return;
    }

    events.forEach(event => {
        const accordionItem = document.createElement('div');
        accordionItem.className = 'event-accordion-item';

        // --- 日付のフォーマット ---
        const dateStringForParsing = String(event.date).replace(' ', 'T') + '+09:00';
        const dateObj = new Date(dateStringForParsing);
        const formattedShortDate = !isNaN(dateObj) ? dateObj.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' }) : '---';

        // ★★★ クリック有効期限のフォーマット処理を追加 ★★★
        const expirateStringForParsing = String(event.expirate).replace(' ', 'T') + '+09:00';
        const expirateObj = new Date(expirateStringForParsing);
        const formattedExpirateDate = !isNaN(expirateObj) ? expirateObj.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '---';


        // --- 特典情報のテキストを作成 ---
        let rewardInfoText = '---';
        const clicksForReward = Number(event.clicks_for_reward);
        if (clicksForReward > 0) {
            let rewardContent = '';
            if (event.reward_type === 'discount') {
                rewardContent = `割引 ${event.reward_value}%`;
            } else {
                rewardContent = event.reward_value;
            }
            rewardInfoText = `${clicksForReward}クリックごとに「${rewardContent}」`;
        }

        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'event-summary';
        summaryDiv.onclick = function() { toggleEventDetails(this); };
        summaryDiv.innerHTML = `
            <span class="toggle-icon">▽</span>
            <span class="summary-event-name">${event.event_name}</span>
            <span class="summary-event-date">開催日: ${formattedShortDate}</span>
        `;

        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'event-full-details collapsed';
        const referralLink = `${window.location.origin}/flyer.html?user_id=${currentUserId}&event_id=${event.event_id}`;
        const thumbnail = event.flyer ? `<img src="${event.flyer}" alt="${event.event_name} フライヤー" class="thumbnail">` : '';

        detailsDiv.innerHTML = `
            <div class="event-item-content">
                ${thumbnail}
                <div class="event-details">
                    <p><strong>通常価格:</strong> ${event.price ? `¥${Number(event.price).toLocaleString()}` : '未定'}</p>
                    <p><strong>特典:</strong> ${rewardInfoText}</p>
                    <p><strong>最大獲得数:</strong> ${event.max_rewards}個まで</p>
                    <p><strong>クリック有効期限:</strong> ${formattedExpirateDate}</p>
                    <div class="event-actions">
                        <div class="share-icons">
                            <button title="共有" onclick="shareReferralLink(this, '${event.event_name}', '${referralLink}')">Share</button>
                            <button title="クリップボードにコピー" onclick="copyReferralLink(this, '${referralLink}')">Copy</button>
                            <button title="QRコード表示" onclick="showQrCode('${referralLink}')">QR</button>
                            <button title="Twitterで共有" onclick="shareOnTwitter('${event.event_name}', '${referralLink}')">Twitter</button>
                            <button title="LINEで共有" onclick="shareOnLine('${event.event_name}', '${referralLink}')">LINE</button>
                        </div>
                </div>
            </div>
        `;

        accordionItem.appendChild(summaryDiv);
        accordionItem.appendChild(detailsDiv);
        eventListDiv.appendChild(accordionItem);
    });
}


/**
 * [新規] 特典情報表示関数 (displayDiscountsを置き換え)
 */
function displayRewards(rewards) {
    if (!rewardListDiv) return;
    rewardListDiv.innerHTML = '';

    if (!rewards || rewards.length === 0) {
        rewardListDiv.innerHTML = '<p>獲得済みの特典はありません。</p>';
        return;
    }

    rewards.forEach(reward => {
        const rewardItemCard = document.createElement('div');
        rewardItemCard.className = 'discount-item-card'; // スタイルは流用

        let rewardInfoHtml = '';
        let mainValueHtml = '';

        if (reward.reward_type === 'discount') {
            mainValueHtml = `<div class="discount-card-value payment-price bold">支払額: ¥${Number(reward.payment_price).toLocaleString()}</div>`;
            rewardInfoHtml = `
                <div class="discount-card-label">割引内容</div>
                <div class="discount-card-value">${reward.quantity}回 × ${reward.reward_value}% OFF</div>
                <div class="discount-card-label">元価格</div>
                <div class="discount-card-value original-price">¥${Number(reward.price).toLocaleString()}</div>
            `;
        } else { // 'goods' or 'drink'
            mainValueHtml = `<div class="discount-card-value payment-price bold">${reward.reward_value}</div>`;
            rewardInfoHtml = `
                <div class="discount-card-label">種類</div>
                <div class="discount-card-value">${reward.reward_type === 'goods' ? 'グッズ' : 'ドリンク'}</div>
                <div class="discount-card-label">数量</div>
                <div class="discount-card-value">${reward.quantity} 個</div>
            `;
        }

        const statusText = reward.is_claimed ? '交換済み' : '未交換';
        const claimButtonHtml = !reward.is_claimed
            ? `<button class="claim-button" onclick="claimReward(${reward.user_reward_id})">会場で提示して交換する</button>`
            : '';

        rewardItemCard.innerHTML = `
            <div class="discount-card-row">
                <div class="discount-card-label">イベント名</div>
                <div class="discount-card-value event-name">${reward.event_name}</div>
                ${mainValueHtml}
            </div>
            <div class="discount-card-row">
                ${rewardInfoHtml}
            </div>
            <div class="discount-card-row claim-row ${reward.is_claimed ? 'claimed' : ''}">
                <div class="discount-card-label">状態</div>
                <div class="discount-card-value status">${statusText}</div>
                <div class="claim-action">${claimButtonHtml}</div>
            </div>
        `;
        rewardListDiv.appendChild(rewardItemCard);
    });
}

/**
 * [新規] 特典を交換する関数
 * @param {number} userRewardId - 交換する特典のID
 */
async function claimReward(userRewardId) {
    if (!confirm('この特典を交換しますか？\nこの操作は元に戻せません。会場のスタッフに画面を提示してから押してください。')) {
        return;
    }

    hideMessage();
    try {
        const response = await fetch(`/api/users/${currentUserId}/rewards/${userRewardId}/claim`, {
            method: 'POST'
        });

        const result = await response.json();

        if (response.ok) {
            showMessage('特典を交換しました。', 'success');
            loadRewards(); // 特典一覧を再読み込みして表示を更新
        } else {
            showMessage(result.message || '特典の交換に失敗しました。');
        }
    } catch (error) {
        console.error('Claim reward error:', error);
        showMessage('特典の交換中にエラーが発生しました。');
    } finally {
        setTimeout(hideMessage, 5000);
    }
}


// --- 既存の補助関数 (変更なし) ---
function toggleEventDetails(summaryElement) {
    const detailsElement = summaryElement.nextElementSibling;
    const iconElement = summaryElement.querySelector('.toggle-icon');
    if (detailsElement && detailsElement.classList.contains('event-full-details')) {
        detailsElement.classList.toggle('collapsed');
        if (iconElement) {
            iconElement.textContent = detailsElement.classList.contains('collapsed') ? '▽' : '△';
        }
    }
}
function copyReferralLink(buttonElement, text) {
    const messageSpan = buttonElement.closest('.event-actions')?.querySelector('.share-message');
    if (!messageSpan) return;
    navigator.clipboard.writeText(text).then(() => {
        messageSpan.textContent = 'コピーしました！';
        messageSpan.style.color = 'green';
        setTimeout(() => { messageSpan.textContent = ''; }, 3000);
    }, (err) => {
        console.error('Clipboard copy failed: ', err);
        messageSpan.textContent = 'コピーに失敗しました。';
        messageSpan.style.color = 'red';
        setTimeout(() => { messageSpan.textContent = ''; }, 5000);
    });
}
function shareOnTwitter(eventName, link) {
    const text = encodeURIComponent(`${eventName}のフライヤーとディスカウントはこちら：`);
    const url = encodeURIComponent(link);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
}
function shareOnLine(eventName, link) {
    const text = encodeURIComponent(`${eventName}\n${link}`);
    window.open(`https://line.me/R/msg/text/?${text}`, '_blank');
}
function showQrCode(link) {
    if (!qrCodeContainer || !qrModal) return;
    qrCodeContainer.innerHTML = '';
    try {
        if (typeof QRCode === 'undefined') throw new Error('QRCode library is not loaded.');
        new QRCode(qrCodeContainer, { text: link, width: 128, height: 128, colorDark: "#000000", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H });
        qrModal.classList.remove('hidden');
    } catch (e) {
        console.error("QR Code generation failed:", e);
        showMessage(`QRコードの生成に失敗しました: ${e.message}`);
        setTimeout(hideMessage, 3000);
    }
}
function closeQrModal() {
    if (qrModal) {
        qrModal.classList.add('hidden');
        if (qrCodeContainer) qrCodeContainer.innerHTML = '';
    }
}
async function shareReferralLink(buttonElement, eventName, url) {
    const messageSpan = buttonElement.closest('.event-actions')?.querySelector('.share-message');
    const shareData = { title: `「${eventName}」の共有`, url: url };
    if (navigator.share) {
        try {
            await navigator.share(shareData);
            if (messageSpan) {
                messageSpan.textContent = '共有ダイアログを開きました。';
                messageSpan.style.color = 'green';
                setTimeout(() => { messageSpan.textContent = ''; }, 3000);
            }
        } catch (err) {
            if (err.name !== 'AbortError' && messageSpan) {
                messageSpan.textContent = '共有に失敗しました。';
                messageSpan.style.color = 'red';
                setTimeout(() => { messageSpan.textContent = ''; }, 5000);
            }
        }
    } else {
        if (messageSpan) {
            messageSpan.textContent = 'この共有機能は利用できません。';
            messageSpan.style.color = 'orange';
            setTimeout(() => { messageSpan.textContent = ''; }, 5000);
        }
    }
}
async function handleLogout() {
    try {
        const response = await fetch('/api/logout', { method: 'POST' });
        if (response.ok) {
            window.location.href = '/login.html';
        } else {
            const result = await response.json().catch(() => ({}));
            showMessage(result.message || 'ログアウトに失敗しました。');
            setTimeout(hideMessage, 3000);
        }
    } catch (error) {
        console.error('Logout error:', error);
        showMessage('ログアウト中にエラーが発生しました。');
        setTimeout(hideMessage, 3000);
    }
}
function toggleEventDetails(summaryElement) {
    const detailsElement = summaryElement.nextElementSibling;
    const iconElement = summaryElement.querySelector('.toggle-icon');
    if (detailsElement && detailsElement.classList.contains('event-full-details')) {
        detailsElement.classList.toggle('collapsed');
        if (iconElement) {
            iconElement.textContent = detailsElement.classList.contains('collapsed') ? '▽' : '△';
        }
    }
}
function copyReferralLink(buttonElement, text) {
    const messageSpan = buttonElement.closest('.event-actions')?.querySelector('.share-message');
    if (!messageSpan) return;
    navigator.clipboard.writeText(text).then(() => {
        messageSpan.textContent = 'コピーしました！';
        messageSpan.style.color = 'green';
        setTimeout(() => { messageSpan.textContent = ''; }, 3000);
    }, (err) => {
        console.error('Clipboard copy failed: ', err);
        messageSpan.textContent = 'コピーに失敗しました。';
        messageSpan.style.color = 'red';
        setTimeout(() => { messageSpan.textContent = ''; }, 5000);
    });
}
function shareOnTwitter(eventName, link) {
    const text = encodeURIComponent(`${eventName}のフライヤーとディスカウントはこちら：`);
    const url = encodeURIComponent(link);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
}
function shareOnLine(eventName, link) {
    const text = encodeURIComponent(`${eventName}\n${link}`);
    window.open(`https://line.me/R/msg/text/?${text}`, '_blank');
}
function showQrCode(link) {
    if (!qrCodeContainer || !qrModal) return;
    qrCodeContainer.innerHTML = '';
    try {
        if (typeof QRCode === 'undefined') throw new Error('QRCode library is not loaded.');
        new QRCode(qrCodeContainer, { text: link, width: 128, height: 128, colorDark: "#000000", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H });
        qrModal.classList.remove('hidden');
    } catch (e) {
        console.error("QR Code generation failed:", e);
        showMessage(`QRコードの生成に失敗しました: ${e.message}`);
        setTimeout(hideMessage, 3000);
    }
}
function closeQrModal() {
    if (qrModal) {
        qrModal.classList.add('hidden');
        if (qrCodeContainer) qrCodeContainer.innerHTML = '';
    }
}
async function shareReferralLink(buttonElement, eventName, url) {
    const messageSpan = buttonElement.closest('.event-actions')?.querySelector('.share-message');
    const shareData = { title: `「${eventName}」の共有`, url: url };
    if (navigator.share) {
        try {
            await navigator.share(shareData);
            if (messageSpan) {
                messageSpan.textContent = '共有ダイアログを開きました。';
                messageSpan.style.color = 'green';
                setTimeout(() => { messageSpan.textContent = ''; }, 3000);
            }
        } catch (err) {
            if (err.name !== 'AbortError' && messageSpan) {
                messageSpan.textContent = '共有に失敗しました。';
                messageSpan.style.color = 'red';
                setTimeout(() => { messageSpan.textContent = ''; }, 5000);
            }
        }
    } else {
        if (messageSpan) {
            messageSpan.textContent = 'この共有機能は利用できません。';
            messageSpan.style.color = 'orange';
            setTimeout(() => { messageSpan.textContent = ''; }, 5000);
        }
    }
}
async function claimReward(userRewardId) {
    if (!confirm('この特典を交換しますか？\nこの操作は元に戻せません。会場のスタッフに画面を提示してから押してください。')) {
        return;
    }

    hideMessage();
    try {
        const response = await fetch(`/api/users/${currentUserId}/rewards/${userRewardId}/claim`, {
            method: 'POST'
        });

        const result = await response.json();

        if (response.ok) {
            showMessage('特典を交換しました。', 'success');
            loadRewards();
        } else {
            showMessage(result.message || '特典の交換に失敗しました。');
        }
    } catch (error) {
        console.error('Claim reward error:', error);
        showMessage('特典の交換中にエラーが発生しました。');
    } finally {
        setTimeout(hideMessage, 5000);
    }
}
function displayRewards(rewards) {
    if (!rewardListDiv) return;
    rewardListDiv.innerHTML = '';

    if (!rewards || rewards.length === 0) {
        rewardListDiv.innerHTML = '<p>獲得済みの特典はありません。</p>';
        return;
    }

    rewards.forEach(reward => {
        const rewardItemCard = document.createElement('div');
        rewardItemCard.className = 'discount-item-card';

        let rewardInfoHtml = '';
        let mainValueHtml = '';

        if (reward.reward_type === 'discount') {
            mainValueHtml = `<div class="discount-card-value payment-price bold">支払額: ¥${Number(reward.payment_price).toLocaleString()}</div>`;
            rewardInfoHtml = `
                <div class="discount-card-label">割引内容</div>
                <div class="discount-card-value">${reward.quantity}回 × ${reward.reward_value}% OFF</div>
                <div class="discount-card-label">元価格</div>
                <div class="discount-card-value original-price">¥${Number(reward.price).toLocaleString()}</div>
            `;
        } else {
            mainValueHtml = `<div class="discount-card-value payment-price bold">${reward.reward_value}</div>`;
            rewardInfoHtml = `
                <div class="discount-card-label">種類</div>
                <div class="discount-card-value">${reward.reward_type === 'goods' ? 'グッズ' : 'ドリンク'}</div>
                <div class="discount-card-label">数量</div>
                <div class="discount-card-value">${reward.quantity} 個</div>
            `;
        }

        const statusText = reward.is_claimed ? '交換済み' : '未交換';
        const claimButtonHtml = !reward.is_claimed
            ? `<button class="claim-button" onclick="claimReward(${reward.user_reward_id})">会場で提示して交換する</button>`
            : '';

        rewardItemCard.innerHTML = `
            <div class="discount-card-row">
                <div class="discount-card-label">イベント名</div>
                <div class="discount-card-value event-name">${reward.event_name}</div>
                ${mainValueHtml}
            </div>
            <div class="discount-card-row">
                ${rewardInfoHtml}
            </div>
            <div class="discount-card-row claim-row ${reward.is_claimed ? 'claimed' : ''}">
                <div class="discount-card-label">状態</div>
                <div class="discount-card-value status">${statusText}</div>
                <div class="claim-action">${claimButtonHtml}</div>
            </div>
        `;
        rewardListDiv.appendChild(rewardItemCard);
    });
}