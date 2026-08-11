import { supabase } from './supabase-client.js';

const form = document.querySelector('[data-auth-form]');
const statusElement = document.querySelector('[data-auth-status]');

function setStatus(message, type = '') {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.className = `auth-status ${type}`.trim();
}

function setLoading(isLoading) {
  const button = form?.querySelector('button[type="submit"]');
  if (!button) return;
  button.disabled = isLoading;
  button.textContent = isLoading ? '처리 중...' : form.dataset.mode === 'signup' ? '회원가입' : '로그인';
}

function authErrorMessage(error) {
  const message = error?.message ?? '';
  if (/invalid login credentials/i.test(message)) return '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (/user already registered/i.test(message)) return '이미 가입된 이메일입니다.';
  if (/email not confirmed/i.test(message)) return '이메일 인증을 먼저 완료해 주세요.';
  return message || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

async function handleLogin(data) {
  const { error } = await supabase.auth.signInWithPassword({
    email: data.get('email').trim(),
    password: data.get('password'),
  });
  if (error) throw error;
  setStatus('로그인이 완료되었습니다.', 'success');
}

async function handleSignup(data) {
  const password = data.get('password');
  if (password !== data.get('password_confirm')) {
    throw new Error('비밀번호 확인이 일치하지 않습니다.');
  }

  const { data: result, error } = await supabase.auth.signUp({
    email: data.get('email').trim(),
    password,
    options: {
      data: { display_name: data.get('display_name').trim() },
    },
  });
  if (error) throw error;

  if (result.session) {
    form.reset();
    setStatus('회원가입이 완료되었습니다.', 'success');
    return;
  }

  form.reset();
  setStatus('가입 확인 메일을 보냈습니다. 이메일의 인증 링크를 눌러 주세요.', 'success');
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  setLoading(true);
  setStatus('');

  try {
    const data = new FormData(form);
    if (form.dataset.mode === 'signup') await handleSignup(data);
    else await handleLogin(data);
  } catch (error) {
    setStatus(authErrorMessage(error), 'error');
  } finally {
    setLoading(false);
  }
});

document.querySelector('[data-google-login]')?.addEventListener('click', async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/login.html` },
  });
  if (error) setStatus(authErrorMessage(error), 'error');
});
