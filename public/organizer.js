// organizer.js (スプレッドシート連携修正版)

// --- グローバル変数定義 ---
let currentOrganizerId = null;
let organizerNameSpan = null;
let addEventForm = null;
let organizerEventTableBody = null;
let rewardSummaryListDiv = null;
let logoutButton = null;
let messageDiv = null;
let filterEventSelect = null;
let openSheetButton = null; // スプレッドシートボタン用の変数

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
    rewardSummaryListDiv = document.getElementById('rewardSummaryList');
    logoutButton = document.getElementById('logoutButton');
    messageDiv = document.getElementById('message');
    filterEventSelect = document.getElementById('filterEvent');
    openSheetButton = document.getElementById('openSheetButton'); // HTMLのIDと一致させる

    rewardTypeSelect = document.getElementById('rewardType');
    rewardValueLabel = document.getElementById('rewardValueLabel');
    rewardValueInput = document.getElementById('rewardValue');

    // --- イベントリスナー設定 ---
    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }
    if (addEventForm) {
        addEventForm.addEventListener('submit', handleAddEventSubmit);
    }
    if (rewardTypeSelect) {
        rewardTypeSelect.addEventListener('change', handleRewardTypeChange);
        handleRewardTypeChange();
    }
    if (filterEventSelect) {
        filterEventSelect.addEventListener('change', () => {
            loadRewardSummary();
            // イベント選択に応じてボタンの有効/無効を切り替え
            if (openSheetButton) {
                openSheetButton.disabled = !filterEventSelect.value;
            }
        });
    }
    // スプレッドシートボタンのクリックイベント
    if (openSheetButton) {
        openSheetButton.addEventListener('click', handleOpenSheet);
    }

    checkAuthAndLoadData();
});

// --- 関数定義 ---

/**
 * スプレッドシートで開く処理
 */
async function handleOpenSheet() {
    if (!filterEventSelect || !filterEventSelect.value) {
        showMessage('スプレッドシートで開くには、まずイベントを選択してください。');
        setTimeout(hideMessage, 3000);
        return;
    }

    const eventId = filterEventSelect.value;
    const apiUrl = `/api/organizers/${currentOrganizerId}/reward-summary/gsheet-url?event_id=${eventId}`;

    // ボタンを一時的に無効化し、ローディング表示
    openSheetButton.disabled = true;
    openSheetButton.textContent = 'URL生成中...';

    try {
        const response = await fetch(apiUrl);
        const data = await response.json();

        if (response.ok) {
            // 新しいタブでGoogleスプレッドシートを開く
            window.open(data.sheetUrl, '_blank');
        } else {
            throw new Error(data.message || 'URLの生成に失敗しました。');
        }
    } catch (error) {
        console.error('Error fetching spreadsheet URL:', error);
        showMessage(error.message);
        setTimeout(hideMessage, 5000);
    } finally {
        // ボタンの状態を元に戻す
        openSheetButton.disabled = false;
        openSheetButton.textContent = 'スプレッドシートで開く';
    }
}

// (以下、変更のない他の関数)
function showMessage(text, type = 'error') {
    if (!messageDiv) return;
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.classList.remove('hidden');
}
function hideMessage() {
    if (!messageDiv) return;
    messageDiv.classList.add('hidden');
    messageDiv.textContent = '';
    messageDiv.className = 'message hidden';
}
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
        rewardValueInput.value = '';
    } else {
        rewardValueLabel.textContent = '特典の内容 (グッズ名など):';
        rewardValueInput.type = 'text';
        rewardValueInput.placeholder = selectedType === 'goods' ? '例: オリジナルTシャツ' : '例: 1ドリンク';
        rewardValueInput.removeAttribute('step');
        rewardValueInput.removeAttribute('min');
        rewardValueInput.removeAttribute('max');
        rewardValueInput.value = '';
    }
}
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
            window.location.href = '/login.html';
            return;
        }
        loadOrganizerName();
        loadOrganizerEvents();
    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = '/login.html';
    }
}
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
        loadRewardSummary();
    } catch (error) {
        console.error('Error loading organizer events:', error);
        organizerEventTableBody.innerHTML = `<tr><td colspan="5">イベント情報の読み込みに失敗しました: ${error.message}</td></tr>`;
        loadRewardSummary();
    }
}
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
async function loadRewardSummary() {
    if (!currentOrganizerId || !rewardSummaryListDiv || !filterEventSelect) return;
    rewardSummaryListDiv.innerHTML = '<p>特典状況を読み込み中...</p>';
    hideMessage();
    const filterEventId = filterEventSelect.value;
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
    try {
        const response = await fetch(`/api/organizers/${currentOrganizerId}/events`, {
            method: 'POST',
            body: formData
        });
        const result = await response.json().catch(() => ({}));
        if (response.ok) {
            showMessage(`イベントを追加しました。`, 'success');
            addEventForm.reset();
            handleRewardTypeChange();
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
function confirmAndDeleteEvent(eventId) {
    if (confirm(`イベントID: ${eventId} を削除してもよろしいですか？\n注意: クリックログが存在しない場合のみ削除できます。`)) {
        deleteEvent(eventId);
    }
}
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
