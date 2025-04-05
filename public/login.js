const messageDiv = document.getElementById('message');

function openTab(evt, tabName) {
    // すべてのタブコンテンツを非表示にする
    const tabcontent = document.getElementsByClassName("tab-content");
    for (let i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
        tabcontent[i].classList.remove("active");
    }

    // すべてのタブボタンのアクティブ状態を解除する
    const tablinks = document.getElementsByClassName("tab-button");
    for (let i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }

    // クリックされたタブを表示し、ボタンをアクティブにする
    document.getElementById(tabName).style.display = "block";
    document.getElementById(tabName).classList.add("active");
    evt.currentTarget.className += " active";
    hideMessage(); // タブ切り替え時にメッセージを消す
}

function showMessage(text, type = 'error') {
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`; // Add type class ('error' or 'success')
    messageDiv.classList.remove('hidden');
}

function hideMessage() {
    messageDiv.classList.add('hidden');
    messageDiv.textContent = '';
    messageDiv.className = 'message hidden';
}

document.addEventListener('DOMContentLoaded', () => {
    // ★ URLパラメータからエラーメッセージを取得して表示する処理を追加 ★
    const urlParams = new URLSearchParams(window.location.search);
    const errorParam = urlParams.get('error');
    if (errorParam) {
        let errorMessage = 'ログインまたは認証プロセスでエラーが発生しました。';
        if (errorParam === 'google_auth_failed') {
            errorMessage = 'Google 認証に失敗しました。';
        } else if (errorParam === 'facebook_auth_failed') {
            errorMessage = 'Facebook 認証に失敗しました。';
        } else if (errorParam === 'line_auth_failed') {
             errorMessage = 'LINE 認証に失敗しました。';
        } else if (errorParam === 'invalid_state') {
             errorMessage = '不正なリクエストの可能性があります。もう一度お試しください。';
        } else if (errorParam === 'profile_error' || errorParam === 'auth_process_error') {
             errorMessage = '認証情報の処理中にエラーが発生しました。';
        } else if (errorParam === 'session_expired') {
             errorMessage = 'セッションの有効期限が切れました。もう一度ログインしてください。';
        }
        // 他のカスタムエラーメッセージも必要に応じて追加
        showMessage(errorMessage);
        // URLからerrorパラメータを削除して表示をクリーンにする（任意）
        // window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    }

    // デフォルトでユーザーログインタブを開く
    // ★ イベントオブジェクトを模倣する必要があるので null を渡す ★
    const userTabButton = document.querySelector('.tab-button[onclick*="userLogin"]');
    if (userTabButton) {
         openTab({ currentTarget: userTabButton }, 'userLogin');
    }
   });