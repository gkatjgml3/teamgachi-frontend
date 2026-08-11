import { supabase } from './supabase-client.js';

const form = document.querySelector('[data-reset-form]');
const statusElement = document.querySelector('[data-auth-status]');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  if (data.get('password') !== data.get('password_confirm')) {
    statusElement.textContent = '비밀번호 확인이 일치하지 않습니다.';
    statusElement.className = 'auth-status error';
    return;
  }

  const { error } = await supabase.auth.updateUser({ password: data.get('password') });
  statusElement.textContent = error ? error.message : '비밀번호가 변경되었습니다. 로그인 화면으로 이동합니다.';
  statusElement.className = `auth-status ${error ? 'error' : 'success'}`;
  if (!error) window.setTimeout(() => window.location.replace('./login.html'), 1000);
});
