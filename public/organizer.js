// organizer.js (改訂版・全文)

// グローバルスコープで宣言
let currentOrganizerId = null;
let organizerNameSpan = null;
let addEventForm = null;
let organizerEventTableBody = null;
let discountSummaryListDiv = null;
let logoutButton = null;
let messageDiv = null;
let filterEventSelect = null;
let filterUserInput = null; 
let eventPriceInput = null;
let eventRatePercentInput = null;
let calculatedDiscountYenSpan = null;

// --- DOMContentLoaded イベントリスナー ---
// organizer.js (DOMContentLoaded リスナー修正版)

document.addEventListener('DOMContentLoaded', () => {
    // 要素取得
    organizerNameSpan = document.getElementById('organizerName');
    addEventForm = document.getElementById('addEventForm');
    organizerEventTableBody = document.getElementById('organizerEventTableBody');
    discountSummaryListDiv = document.getElementById('discountSummaryList'); 
    logoutButton = document.getElementById('logoutButton');
    messageDiv = document.getElementById('message');
    filterEventSelect = document.getElementById('filterEvent');
    filterUserInput = document.getElementById('filterUser');
    eventPriceInput = document.getElementById('eventPrice');
    eventRatePercentInput = document.getElementById('eventRatePercent');
    calculatedDiscountYenSpan = document.getElementById('calculatedDiscountYen');

    // --- イベントリスナー設定 ---

    // ログアウトボタン
    if(logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    } else {
        console.error("Logout button not found.");
    }

    // イベント追加フォーム
    if(addEventForm) {
        addEventForm.addEventListener('submit', handleAddEventSubmit);
    } else {
        console.error("Add event form not found.");
    }

    // 割引サマリーの絞り込みボタン (もし使うならセレクタをHTMLに合わせる)
    const filterButton = document.querySelector('#discount-summary-section button'); // 仮のセレクタ注意
    if(filterButton) {
       filterButton.addEventListener('click', loadDiscountSummary);
       console.log("Filter button listener added."); // リスナーが追加されたか確認用ログ
    } else {
       // console.log("Filter button not found or selector is incorrect."); // ボタンがない場合
    }

    // 割引サマリーのイベント絞り込みセレクト
    if (filterEventSelect) {
        filterEventSelect.addEventListener('change', loadDiscountSummary);
        console.log("Filter select listener added."); // リスナーが追加されたか確認用ログ
    } else {
         console.error("Filter select element not found.");
    }
    if (eventPriceInput && eventRatePercentInput && calculatedDiscountYenSpan) {
        eventPriceInput.addEventListener('input', updateCalculatedDiscount);
        eventRatePercentInput.addEventListener('input', updateCalculatedDiscount);
        updateCalculatedDiscount(); // 初期表示のため一度呼び出す
        console.log("Dynamic discount calculation listeners added."); // リスナーが追加されたか確認用ログ
    } else {
        console.error("Elements for dynamic discount calculation not found.");
    }
    // 認証チェックとデータ読み込みを開始
    checkAuthAndLoadData();
}); 

// --- 関数定義 ---
function updateCalculatedDiscount() {
    if (!eventPriceInput || !eventRatePercentInput || !calculatedDiscountYenSpan) return;

    const price = parseFloat(eventPriceInput.value);
    const ratePercent = parseFloat(eventRatePercentInput.value);

    if (!isNaN(price) && price > 0 && !isNaN(ratePercent) && ratePercent >= 0) {
        const discountYen = Math.floor(price * ratePercent / 100); // 円単位に丸める (小数点以下切り捨て)
        calculatedDiscountYenSpan.textContent = `( 約 ${discountYen.toLocaleString()} 円 / クリック )`;
    } else {
        calculatedDiscountYenSpan.textContent = ''; // 無効な入力ならクリア
    }
}
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
    currentOrganizerId = urlParams.get('organizer_id');

    if (!currentOrganizerId) {
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
        if (!authData.isAuthenticated || authData.user.type !== 'organizer' || authData.user.id !== parseInt(currentOrganizerId, 10)) {
            console.warn('Authentication mismatch or failed.', authData);
            window.location.href = '/login.html';
            return;
        }

        loadOrganizerName();
        loadOrganizerEvents(); // イベント一覧読み込み (内部で割引サマリーも呼ぶ)
        // loadDiscountSummary(); // loadOrganizerEventsから呼ばれるので不要かも

    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = '/login.html';
    }
}

// オーガナイザー名読み込み
async function loadOrganizerName() {
    if (!currentOrganizerId || !organizerNameSpan) return;
    try {
        const response = await fetch(`/api/organizers/${currentOrganizerId}`);
        if (response.ok) {
            const orgData = await response.json();
            organizerNameSpan.textContent = orgData.organizer_name;
        } else {
            console.error('Failed to load organizer name');
        }
    } catch (error) {
        console.error('Error loading organizer name:', error);
    }
}

// オーガナイザーのイベント一覧読み込み
async function loadOrganizerEvents() {
    if (!currentOrganizerId || !organizerEventTableBody) return;
    organizerEventTableBody.innerHTML = '<tr><td colspan="4">イベント情報を読み込み中...</td></tr>'; // Colspan 変更
    try {
        const response = await fetch(`/api/organizers/${currentOrganizerId}/events`);
         if (!response.ok) {
             if (response.status === 403) {
                 window.location.href = '/login.html';
                 return;
             }
             // 500エラーなどで result.message を表示
             const result = await response.json().catch(() => ({ message: 'サーバーエラー' }));
             throw new Error(result.message || `HTTP error! status: ${response.status}`);
         }
        const events = await response.json();
        displayOrganizerEvents(events);
        populateEventFilter(events); // 絞り込み用セレクトボックスも更新
        loadDiscountSummary(); // イベント読み込み後に割引サマリーも読み込む
    } catch (error) {
        console.error('Error loading organizer events:', error);
        organizerEventTableBody.innerHTML = `<tr><td colspan="4">イベント情報の読み込みに失敗しました: ${error.message}</td></tr>`;
        // エラー時も割引サマリーは読み込む（別APIなので）
        loadDiscountSummary();
    }
}

// イベント一覧表示 
function displayOrganizerEvents(events) {
    if (!organizerEventTableBody) return;
    organizerEventTableBody.innerHTML = ''; // クリア
    if (!events || events.length === 0) {
        organizerEventTableBody.innerHTML = '<tr><td colspan="5">登録済みのイベントはありません。(開催後30日経過したイベントは表示されません)</td></tr>';
        return;
    }

    events.forEach(event => {
        const row = organizerEventTableBody.insertRow();

        // ★★★ DBからの文字列 "YYYY-MM-DD HH:MM:SS" をJSTとして解釈させるため加工 ★★★
        const eventDateString = event.date ? String(event.date).replace(' ', 'T') + '+09:00' : '';
        const expirateDateString = event.expirate ? String(event.expirate).replace(' ', 'T') + '+09:00' : '';

        // 加工した文字列を new Date() に渡す
        const parsedEventDate = eventDateString ? new Date(eventDateString) : null;
        const parsedExpirateDate = expirateDateString ? new Date(expirateDateString) : null;

        // isNaN で Invalid Date かチェック
        const displayEventDate = parsedEventDate && !isNaN(parsedEventDate)
            ? parsedEventDate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
            : '---';
        const displayExpirateDate = parsedExpirateDate && !isNaN(parsedExpirateDate)
            ? parsedExpirateDate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
            : '---';

        row.innerHTML = `
            <td data-label="イベント名:">${event.event_name}</td>
            <td data-label="開催日時:">${displayEventDate}</td>
            <td data-label="価格:" class="text-right">¥${Number(event.price).toLocaleString()}</td>
            <td data-label="有効期限:">${displayExpirateDate}</td>
            <td data-label="操作:">
                <button class="danger" onclick="confirmAndDeleteEvent(${event.event_id})">削除</button>
            </td>
        `;
    });
}
// 絞り込み用セレクトボックスにイベントを設定
function populateEventFilter(events) {
    if (!filterEventSelect) return;
    const currentFilterValue = filterEventSelect.value; // 現在の選択値を保持
    filterEventSelect.innerHTML = '<option value="">すべてのイベント</option>'; // Reset
    if(events && events.length > 0) {
        events.forEach(event => {
            const option = document.createElement('option');
            option.value = event.event_id;
            option.textContent = event.event_name;
            filterEventSelect.appendChild(option);
        });
    }
     filterEventSelect.value = currentFilterValue; // 可能な限り選択値を復元
}

// 割引状況の読み込み（絞り込み対応）
async function loadDiscountSummary() {
    if (!currentOrganizerId || !discountSummaryListDiv || !filterEventSelect) return;
    discountSummaryListDiv.innerHTML = '<p>割引状況を読み込み中...</p>'; // 初期表示
    hideMessage();
    const filterEventId = filterEventSelect.value;
    let apiUrl = `/api/organizers/${currentOrganizerId}/discount-summary`;
    if (filterEventId) {
        apiUrl += `?event_id=${filterEventId}`;
    }

    try {
        const response = await fetch(apiUrl);
         if (!response.ok) {
            if (response.status === 403) {
                window.location.href = '/login.html';
                return;
            }
            const result = await response.json().catch(() => ({ message: 'サーバーエラー' }));
            throw new Error(result.message || `HTTP error! status: ${response.status}`);
        }
        const summary = await response.json();
        displayDiscountSummary(summary);
    } catch (error) {
        console.error('Error loading discount summary:', error);
        discountSummaryListDiv.innerHTML = `<p>割引状況の読み込みに失敗しました: ${error.message}</p>`;
    }
}

// 割引サマリー表示
function displayDiscountSummary(summary) {
    if (!discountSummaryListDiv) return;
    discountSummaryListDiv.innerHTML = ''; // クリア

    if (!summary || summary.length === 0) {
        discountSummaryListDiv.innerHTML = '<p>割引状況データがありません。(開催後30日経過したイベントは表示されません)</p>';
        return;
    }

    summary.forEach(item => {
        const summaryItemCard = document.createElement('div');
        summaryItemCard.className = 'summary-item-card'; 
        summaryItemCard.innerHTML = `
            <div class="summary-card-row">
                <div class="summary-card-label">イベント名</div>
                <div class="summary-card-value event-name">${item.event_name}</div>
                <div class="summary-card-label">紹介ユーザー</div>
                <div class="summary-card-value user-name">${item.user_name}</div>
                <div class="summary-card-label">支払額</div>
                <div class="summary-card-value payment-price bold">¥${Number(item.payment_price).toLocaleString()}</div>
            </div>
            <div class="summary-card-row">
                <div class="summary-card-label">クリック数</div>
                <div class="summary-card-value click-count">${item.click_count} 回</div>
                <div class="summary-card-label">割引率(%)</div>
                <div class="summary-card-value discount-rate">${item.discount_rate_calc}%</div>
                <div class="summary-card-label">割引額</div>
                <div class="summary-card-value discount-amount">¥${Number(item.discount_amount).toLocaleString()}</div>
            </div>
        `;
        discountSummaryListDiv.appendChild(summaryItemCard);
    });
}

// --- イベント操作 ---

// イベント追加フォーム送信処理
async function handleAddEventSubmit(event) {
    event.preventDefault();
    hideMessage();

    const formData = new FormData(addEventForm);

    const flyerInput = document.getElementById('eventFlyer');
    if (!flyerInput || !flyerInput.files || flyerInput.files.length === 0) {
        showMessage('フライヤー画像を選択してください。');
        return;
    }

    const dateValue = formData.get('date');
    const expirateValue = formData.get('expirate');
    if (dateValue && expirateValue && new Date(expirateValue) >= new Date(dateValue)) {
        showMessage('クリック有効期限は開催日時より前に設定してください。');
        return;
    }

    const priceStr = formData.get('price');
    const ratePercentStr = formData.get('eventRatePercent'); // HTMLのname属性に合わせたキー
    const priceNum = parseFloat(priceStr);
    const ratePercentNum = parseFloat(ratePercentStr);

    if (isNaN(priceNum) || priceNum < 0 || isNaN(ratePercentNum) || ratePercentNum < 0) {
        showMessage('価格または割引率が無効な数値です。');
        return;
    }
    const ratePerClickYen = (priceNum * ratePercentNum / 100);
    formData.append('rate_per_click', ratePerClickYen.toFixed(2)); // 小数点2桁までの文字列として追加

    try {
        console.log('Submitting FormData to add event...');
        const response = await fetch(`/api/organizers/${currentOrganizerId}/events`, {
            method: 'POST',
            body: formData
        });

        let result = {};
        try {
            result = await response.json();
        } catch (jsonError) {
            console.error('Failed to parse response as JSON:', jsonError);
            if (!response.ok) {
                 showMessage(`イベント追加に失敗しました (Status: ${response.status})`);
                 return;
            }
            result = { message: '応答の解析に失敗しました' };
        }

        if (response.ok) {
            showMessage(`イベントを追加しました。画像パス: ${result.flyerPath}`, 'success');
            addEventForm.reset();
            loadOrganizerEvents(); // 再読み込み (内部で割引サマリーも再読み込み)
            const detailsElement = document.querySelector('#addEventFormContainer details');
            if (detailsElement) detailsElement.removeAttribute('open');
        } else {
             if (response.status === 403) {
                 window.location.href = '/login.html';
                 return;
             }
            showMessage(result.message || `イベントの追加に失敗しました (Status: ${response.status})`);
        }
    } catch (error) {
        console.error('Add event fetch error:', error);
        showMessage('イベント追加リクエスト中にネットワークエラーなどが発生しました。');
    } finally {
         setTimeout(hideMessage, 5000);
    }
}

// 削除確認関数
function confirmAndDeleteEvent(eventId) {
    if (confirm(`イベントID: ${eventId} を削除してもよろしいですか？\n注意: クリックログが存在しない場合のみ削除できます。`)) {
        deleteEvent(eventId);
    }
}

// 削除実行関数
async function deleteEvent(eventId) {
    hideMessage();
    try {
        console.log(`Attempting to delete event ${eventId}`);
        const response = await fetch(`/api/organizers/${currentOrganizerId}/events/${eventId}`, {
            method: 'DELETE'
        });

        const result = await response.json().catch(() => ({})); // エラー時も解析試行

        if (response.ok) {
            showMessage(result.message || 'イベントを削除しました。', 'success');
            loadOrganizerEvents(); // イベント一覧を再読み込み
        } else {
            if (response.status === 403) { // 権限なし
                showMessage(result.message || '削除権限がありません。');
            } else if (response.status === 400) { // クリックログあり or 不正なID
                showMessage(result.message || '削除できませんでした。');
            } else if (response.status === 404) { // イベントなし
                 showMessage(result.message || 'イベントが見つかりません。');
            } else { // その他のサーバーエラー
                 showMessage(result.message || `イベント削除中にエラーが発生しました (Status: ${response.status})`);
            }
        }
    } catch (error) {
        console.error(`Error deleting event ${eventId}:`, error);
        showMessage('イベント削除リクエスト中にエラーが発生しました。');
    } finally {
        setTimeout(hideMessage, 5000);
    }
}


// ログアウト処理
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