const eventNameH1 = document.getElementById('eventName');
const flyerDisplayDiv = document.getElementById('flyerDisplay');
const eventDetailsDiv = document.getElementById('eventDetails');
const messageDiv = document.getElementById('message');
const flyerShareMessageSpan = document.getElementById('flyerShareMessage');
const qrModal = document.getElementById('qrModal');
const qrCodeContainer = document.getElementById('qrCodeContainer');

// --- メッセージ表示 ---
function showMessage(text, type = 'error') {
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.classList.remove('hidden');
}
function hideMessage() {
    messageDiv.classList.add('hidden');
    messageDiv.textContent = '';
    messageDiv.className = 'message hidden';
}

// --- ページ読み込み時の処理 ---
async function loadFlyerAndLogClick() {
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('event_id');
    const userId = urlParams.get('user_id'); // 紹介元ユーザーID
    if (!eventId) {
        flyerDisplayDiv.innerHTML = '<p class="message error">イベントIDが指定されていません。</p>';
        return;
    }
    // 1. イベント情報を取得して表示
    try {
        const eventResponse = await fetch(`/api/events/${eventId}`);
        if (!eventResponse.ok) {
             if (eventResponse.status === 404) {
                 flyerDisplayDiv.innerHTML = '<p class="message error">指定されたイベントが見つかりません。</p>';
                 return;
             }
            throw new Error(`イベント情報の取得に失敗しました: ${eventResponse.status}`);
        }
        const event = await eventResponse.json();
        eventNameH1.textContent = event.event_name;
        document.title = `${event.event_name} - イベント紹介システム`; // ページのタイトルも変更

        // フライヤー画像表示
        if (event.flyer) {
            const img = document.createElement('img');
            img.src = event.flyer;
            img.alt = `${event.event_name} フライヤー`;
            img.id = 'flyerImage'; // CSSでスタイルを適用するためIDを付与
            flyerDisplayDiv.innerHTML = ''; // "読み込み中"をクリア
            flyerDisplayDiv.appendChild(img);
        } else {
            flyerDisplayDiv.innerHTML = '<p>フライヤー画像が設定されていません。</p>';
        }

        // イベント詳細情報を表示
        eventDetailsDiv.innerHTML = `
            <p><strong>開催日時:</strong> ${new Date(event.date).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</p>
            <p><strong>価格:</strong> ${event.price ? `¥${Number(event.price).toLocaleString()}` : '未定'}</p>
            <p>${event.description || ''}</p>
        `;

    } catch (error) {
        console.error('Error loading event info:', error);
        flyerDisplayDiv.innerHTML = `<p class="message error">イベント情報の読み込み中にエラーが発生しました。</p>`;
        return; // イベント情報がなければクリックログも記録しない
    }


    // 2. 紹介元ユーザーIDがあれば、クリックログを記録
    if (userId) {
        try {
            const clickResponse = await fetch('/api/clicks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ event_id: eventId, user_id: userId }),
            });

            const clickResult = await clickResponse.json();

            if (clickResponse.ok) {
                 if(clickResult.logged) {
                    console.log('Click logged successfully.');
                    // 必要ならユーザーに通知（例：「紹介ありがとうございます！」）
                    // showMessage('クリックを記録しました。', 'success');
                 } else {
                     console.log('Click already logged (cookie or db).');
                 }
            } else {
                // 期限切れなどのエラーメッセージを表示
                showMessage(clickResult.message || 'クリックの記録に失敗しました。');
                 setTimeout(hideMessage, 5000); // 数秒後に消す
            }
        } catch (error) {
            console.error('Error logging click:', error);
            // ユーザーには通知しないか、一般的なエラーメッセージを表示
            // showMessage('クリック記録中にエラーが発生しました。');
        }
    } else {
        console.log('User ID not found in URL, skipping click log.');
    }
}
function copyFlyerLink(buttonElement) { // buttonElement は無くても良いが、将来的な拡張用に残す
    const text = window.location.href; // 現在のページのURL
    if (!flyerShareMessageSpan) return; // メッセージ表示先がなければ何もしない

    navigator.clipboard.writeText(text).then(() => {
        flyerShareMessageSpan.textContent = 'リンクをコピーしました！';
        flyerShareMessageSpan.style.color = 'green';
        setTimeout(() => { flyerShareMessageSpan.textContent = ''; }, 3000);
    }, (err) => {
        console.error('Clipboard copy failed: ', err);
        flyerShareMessageSpan.textContent = 'コピーに失敗しました。';
        flyerShareMessageSpan.style.color = 'red';
        setTimeout(() => { flyerShareMessageSpan.textContent = ''; }, 5000);
    });
}

// Twitter共有
function shareFlyerOnTwitter() {
    const link = window.location.href;
    const url = encodeURIComponent(link);
    window.open(`https://twitter.com/intent/tweet?url=${url}`, '_blank');
}

// LINE共有
function shareFlyerOnLine() {
    const link = window.location.href;
    const text = encodeURIComponent(`${link}`);
    window.open(`https://line.me/R/msg/text/?${text}`, '_blank');
}

// QRコード表示
function showFlyerQrCode() {
    const link = window.location.href;
    if (!qrCodeContainer || !qrModal) {
        console.error("QR Code container or modal not found.");
        return;
    }
    qrCodeContainer.innerHTML = '';
    try {
         if (typeof QRCode === 'undefined') throw new Error('QRCode library is not loaded.');
         new QRCode(qrCodeContainer, {
            text: link, width: 128, height: 128,
            colorDark : "#000000", colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
        qrModal.classList.remove('hidden');
    } catch(e) {
        console.error("QR Code generation failed:", e);
        if (flyerShareMessageSpan) {
            flyerShareMessageSpan.textContent = `QRコード生成エラー: ${e.message}`;
            flyerShareMessageSpan.style.color = 'red';
            setTimeout(() => { flyerShareMessageSpan.textContent = ''; }, 5000);
        }
    }
}
// QRコードモーダルを閉じる (user.js と同じ)
function closeQrModal() {
     if (!qrModal || !qrCodeContainer) return;
     qrModal.classList.add('hidden');
     qrCodeContainer.innerHTML = '';
}

// Web Share API を使った共有 (login.js からコピー・調整)
async function shareFlyer() {
    const link = window.location.href;
    if (!flyerShareMessageSpan) return;

    const shareData = {
        title: document.title,
        text: ``,
        url: link
    };

    if (navigator.share) {
        try {
            await navigator.share(shareData);
            console.log(`フライヤーリンク (${link}) の共有に成功しました。`);
            // 共有ダイアログはOSが閉じるので、メッセージは不要かも
            // flyerShareMessageSpan.textContent = '共有ダイアログを開きました。';
            // flyerShareMessageSpan.style.color = 'green';
            // setTimeout(() => { flyerShareMessageSpan.textContent = ''; }, 3000);
        } catch (err) {
            console.error('フライヤーリンクの共有エラー:', err);
            if (err.name !== 'AbortError') {
                flyerShareMessageSpan.textContent = '共有に失敗しました。';
                flyerShareMessageSpan.style.color = 'red';
                setTimeout(() => { flyerShareMessageSpan.textContent = ''; }, 5000);
            }
        }
    } else {
        console.warn('Web Share APIはこのブラウザではサポートされていません。');
        flyerShareMessageSpan.textContent = 'お使いのブラウザではこの共有機能は利用できません。';
        flyerShareMessageSpan.style.color = 'orange';
        setTimeout(() => { flyerShareMessageSpan.textContent = ''; }, 5000);
    }
}



// --- 初期化 ---
document.addEventListener('DOMContentLoaded', loadFlyerAndLogClick);