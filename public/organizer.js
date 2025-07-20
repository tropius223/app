// organizer.js (特典機能改修版)

// --- グローバル変数定義 ---
let currentOrganizerId = null;
let organizerNameSpan = null;
let addEventForm = null;
let organizerEventTableBody = null;
let rewardSummaryListDiv = null; // 名前を変更
let logoutButton = null;
let messageDiv = null;
let filterEventSelect = null;

// 特典フォーム用の要素
let rewardTypeSelect = null;
let rewardValueLabel = null;
let rewardValueInput = null;

// --- DOMContentLoaded イベントリスナー ---
document.addEventListener('DOMContentLoaded', () => {
    // --- 要素取得 ---
    organizerNameSpan = document.getElementById('organizerName');
    addEventForm = document.getElementById('addEventForm');
    organizerEventTableBody = document.getElementById('organizerEventTableBody');
    rewardSummaryListDiv = document.getElementById('rewardSummaryList'); // IDを変更
    logoutButton = document.getElementById('logoutButton');
    messageDiv = document.getElementById('message');
    filterEventSelect = document.getElementById('filterEvent');

    // 特典フォーム用の要素を取得
    rewardTypeSelect = document.getElementById('rewardType');
    rewardValueLabel = document.getElementById('rewardValueLabel');
    rewardValueInput = document.getElementById('rewardValue');

    // --- イベントリスナー設定 ---

    // ログアウトボタン
    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }

    // イベント追加フォーム
    if (addEventForm) {
        addEventForm.addEventListener('submit', handleAddEventSubmit);
    }

    // 特典の種類に応じて入力欄を変更するリスナー
    if (rewardTypeSelect) {
        rewardTypeSelect.addEventListener('change', handleRewardTypeChange);
        handleRewardTypeChange(); // 初期表示のため一度呼び出す
    }

    // 特典サマリーのイベント絞り込みセレクト
    if (filterEventSelect) {
        filterEventSelect.addEventListener('change', loadRewardSummary);
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

/**
 * [新規] 特典の種類に応じて入力フィールドのラベルや属性を変更する関数
 */
function handleRewardTypeChange() {
    if (!rewardTypeSelect || !rewardValueLabel || !rewardValueInput) return;

    const selectedType = rewardTypeSelect.value;

    if (selectedType === 'discount') {
        rewardValueLabel.textContent = '割引率 (%):';
        rewardValueInput.type = 'number';
        rewardValueInput.placeholder = '例: 10';
        rewardValueInput.step = '0.1';
        rewardValueInput.min = '0';
        rewardValueInput.max = '100';
        rewardValueInput.value = ''; // タイプ変更時に値をクリア
    } else { // 'goods' または 'drink' の場合
        rewardValueLabel.textContent = '特典の内容 (グッズ名など):';
        rewardValueInput.type = 'text';
        rewardValueInput.placeholder = selectedType === 'goods' ? '例: オリジナルTシャツ' : '例: 1ドリンク';
        // number関連の属性を削除
        rewardValueInput.removeAttribute('step');
        rewardValueInput.removeAttribute('min');
        rewardValueInput.removeAttribute('max');
        rewardValueInput.value = ''; // タイプ変更時に値をクリア
    }
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
        loadOrganizerEvents(); // イベント一覧読み込み (内部で特典サマリーも呼ぶ)

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
    organizerEventTableBody.innerHTML = '<tr><td colspan="5">イベント情報を読み込み中...</td></tr>';
    try {
        const response = await fetch(`/api/organizers/${currentOrganizerId}/events`);
        if (!response.ok) {
            const result = await response.json().catch(() => ({ message: 'サーバーエラー' }));
            throw new Error(result.message || `HTTP error! status: ${response.status}`);
        }
        const events = await response.json();
        displayOrganizerEvents(events);
        populateEventFilter(events);
        loadRewardSummary(); // イベント読み込み後に特典サマリーも読み込む
    } catch (error) {
        console.error('Error loading organizer events:', error);
        organizerEventTableBody.innerHTML = `<tr><td colspan="5">イベント情報の読み込みに失敗しました: ${error.message}</td></tr>`;
        loadRewardSummary(); // エラー時もサマリーは読み込み試行
    }
}

// [修正] イベント一覧表示
function displayOrganizerEvents(events) {
    if (!organizerEventTableBody) return;
    organizerEventTableBody.innerHTML = '';
    if (!events || events.length === 0) {
        organizerEventTableBody.innerHTML = '<tr><td colspan="5">登録済みのイベントはありません。(開催後30日経過したイベントは表示されません)</td></tr>';
        return;
    }

    events.forEach(event => {
        const row = organizerEventTableBody.insertRow();

        const eventDateString = event.date ? String(event.date).replace(' ', 'T') + '+09:00' : '';
        const parsedEventDate = eventDateString ? new Date(eventDateString) : null;
        const displayEventDate = parsedEventDate && !isNaN(parsedEventDate)
            ? parsedEventDate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
            : '---';

        // 特典情報の表示テキストを作成
        let rewardText = '';
        switch (event.reward_type) {
            case 'discount':
                rewardText = `割引: ${event.reward_value}%`;
                break;
            case 'goods':
                rewardText = `グッズ: ${event.reward_value}`;
                break;
            case 'drink':
                rewardText = `ドリンク: ${event.reward_value}`;
                break;
            default:
                rewardText = '未設定';
        }

        row.innerHTML = `
            <td data-label="イベント名:">${event.event_name}</td>
            <td data-label="開催日時:">${displayEventDate}</td>
            <td data-label="価格:" class="text-right">¥${Number(event.price).toLocaleString()}</td>
            <td data-label="特典:">${rewardText}</td>
            <td data-label="操作:">
                <button class="danger" onclick="confirmAndDeleteEvent(${event.event_id})">削除</button>
            </td>
        `;
    });
}

// 絞り込み用セレクトボックスにイベントを設定
function populateEventFilter(events) {
    if (!filterEventSelect) return;
    const currentFilterValue = filterEventSelect.value;
    filterEventSelect.innerHTML = '<option value="">すべてのイベント</option>';
    if (events && events.length > 0) {
        events.forEach(event => {
            const option = document.createElement('option');
            option.value = event.event_id;
            option.textContent = event.event_name;
            filterEventSelect.appendChild(option);
        });
    }
    filterEventSelect.value = currentFilterValue;
}

// [修正] 特典状況の読み込み
async function loadRewardSummary() {
    if (!currentOrganizerId || !rewardSummaryListDiv || !filterEventSelect) return;
    rewardSummaryListDiv.innerHTML = '<p>特典状況を読み込み中...</p>';
    hideMessage();

    const filterEventId = filterEventSelect.value;
    // APIエンドポイントを新しいものに変更
    let apiUrl = `/api/organizers/${currentOrganizerId}/reward-summary`;
    if (filterEventId) {
        apiUrl += `?event_id=${filterEventId}`;
    }

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            const result = await response.json().catch(() => ({ message: 'サーバーエラー' }));
            throw new Error(result.message || `HTTP error! status: ${response.status}`);
        }
        const summary = await response.json();
        displayRewardSummary(summary);
    } catch (error) {
        console.error('Error loading reward summary:', error);
        rewardSummaryListDiv.innerHTML = `<p>特典状況の読み込みに失敗しました: ${error.message}</p>`;
    }
}

// [修正] 特典サマリー表示
function displayRewardSummary(summary) {
    if (!rewardSummaryListDiv) return;
    rewardSummaryListDiv.innerHTML = '';

    if (!summary || summary.length === 0) {
        rewardSummaryListDiv.innerHTML = '<p>特典状況データがありません。(開催後30日経過したイベントは表示されません)</p>';
        return;
    }

    summary.forEach(item => {
        const summaryItemCard = document.createElement('div');
        summaryItemCard.className = 'summary-item-card';

        // 特典情報の表示テキストを作成
        let rewardText = '';
        switch (item.reward_type) {
            case 'discount':
                rewardText = `割引 ${item.reward_value}%`;
                break;
            case 'goods':
                rewardText = `グッズ: ${item.reward_value}`;
                break;
            case 'drink':
                rewardText = `ドリンク: ${item.reward_value}`;
                break;
        }

        const statusText = item.is_claimed ? '交換済み' : '未交換';
        const statusClass = item.is_claimed ? 'claimed' : 'unclaimed';

        summaryItemCard.innerHTML = `
            <div class="summary-card-row">
                <div class="summary-card-label">イベント名</div>
                <div class="summary-card-value event-name">${item.event_name}</div>
                <div class="summary-card-label">紹介ユーザー</div>
                <div class="summary-card-value user-name">${item.user_name}</div>
            </div>
            <div class="summary-card-row">
                <div class="summary-card-label">特典</div>
                <div class="summary-card-value reward-info">${rewardText}</div>
                <div class="summary-card-label">数量</div>
                <div class="summary-card-value quantity">${item.quantity} 個</div>
                <div class="summary-card-label">状態</div>
                <div class="summary-card-value status ${statusClass}">${statusText}</div>
            </div>
        `;
        rewardSummaryListDiv.appendChild(summaryItemCard);
    });
}

// --- イベント操作 ---

// [修正] イベント追加フォーム送信処理
async function handleAddEventSubmit(event) {
    event.preventDefault();
    hideMessage();

    const formData = new FormData(addEventForm);

    // ファイル選択のバリデーション
    const flyerInput = document.getElementById('eventFlyer');
    if (!flyerInput || !flyerInput.files || flyerInput.files.length === 0) {
        showMessage('フライヤー画像を選択してください。');
        return;
    }

    // 日付の前後関係バリデーション
    const dateValue = formData.get('date');
    const expirateValue = formData.get('expirate');
    if (dateValue && expirateValue && new Date(expirateValue) >= new Date(dateValue)) {
        showMessage('クリック有効期限は開催日時より前に設定してください。');
        return;
    }

    // 以前の割引率計算は不要になったため削除

    try {
        const response = await fetch(`/api/organizers/${currentOrganizerId}/events`, {
            method: 'POST',
            body: formData // FormDataをそのまま送信
        });

        const result = await response.json().catch(() => ({}));

        if (response.ok) {
            showMessage(`イベントを追加しました。`, 'success');
            addEventForm.reset();
            handleRewardTypeChange(); // フォームリセット後に表示を更新
            loadOrganizerEvents();
            const detailsElement = document.querySelector('#addEventFormContainer details');
            if (detailsElement) detailsElement.removeAttribute('open');
        } else {
            showMessage(result.message || `イベントの追加に失敗しました (Status: ${response.status})`);
        }
    } catch (error) {
        console.error('Add event fetch error:', error);
        showMessage('イベント追加リクエスト中にネットワークエラーが発生しました。');
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
        const response = await fetch(`/api/organizers/${currentOrganizerId}/events/${eventId}`, {
            method: 'DELETE'
        });

        const result = await response.json().catch(() => ({}));

        if (response.ok) {
            showMessage(result.message || 'イベントを削除しました。', 'success');
            loadOrganizerEvents();
        } else {
            showMessage(result.message || `イベント削除中にエラーが発生しました (Status: ${response.status})`);
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
