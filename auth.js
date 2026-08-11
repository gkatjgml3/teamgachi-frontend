import { supabase } from './supabase-client.js';

const form = document.querySelector('[data-auth-form]');
const statusElement = document.querySelector('[data-auth-status]');

function setStatus(message, type = '') {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.className = `auth-status ${type}`.trim();
  statusElement.hidden = !message;
}

function setLoading(isLoading) {
  const button = form?.querySelector('button[type="submit"]');
  if (!button) return;
  button.disabled = isLoading;
  button.textContent = isLoading
    ? '처리 중...'
    : form.dataset.mode === 'signup'
      ? '회원가입'
      : '로그인';
}

function authErrorMessage(error) {
  const message = error?.message ?? '';
  if (/invalid login credentials/i.test(message)) return '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (/user already registered/i.test(message)) return '이미 가입된 이메일입니다.';
  return message || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

async function handleLogin(data) {
  const { error } = await supabase.auth.signInWithPassword({
    email: String(data.get('email')).trim(),
    password: String(data.get('password')),
  });

  if (error) throw error;
  window.location.replace('./dashboard.html');
}

async function validateInviteCode(inviteCode) {
  if (!inviteCode) return;

  const { data: isValid, error } = await supabase.rpc('validate_team_invite', {
    p_invite_code: inviteCode,
  });

  if (error) throw error;
  if (!isValid) throw new Error('유효하지 않은 팀 초대 코드입니다.');
}

async function handleSignup(data) {
  const password = String(data.get('password'));
  const passwordConfirm = String(data.get('password_confirm'));
  const inviteCode = String(data.get('invite_code') ?? '').trim().toUpperCase();

  if (password !== passwordConfirm) {
    throw new Error('비밀번호 확인이 일치하지 않습니다.');
  }

  await validateInviteCode(inviteCode);

  const { data: result, error } = await supabase.auth.signUp({
    email: String(data.get('email')).trim(),
    password,
    options: {
      data: {
        display_name: String(data.get('display_name')).trim(),
        invite_code: inviteCode || null,
      },
    },
  });

  if (error) throw error;

  if (result.session) {
    window.location.replace('./dashboard.html');
    return;
  }

  form.reset();
  setStatus('회원가입이 완료되었습니다. 로그인 화면에서 로그인해 주세요.', 'success');
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
    options: { redirectTo: `${window.location.origin}/dashboard.html` },
  });

  if (error) setStatus(authErrorMessage(error), 'error');
});

document.querySelector('[data-forgot-password]')?.addEventListener('click', async (event) => {
  event.preventDefault();
  const email = form.elements.email.value.trim();

  if (!email) {
    setStatus('비밀번호를 재설정할 이메일을 먼저 입력해 주세요.', 'error');
    form.elements.email.focus();
    return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password.html`,
  });

  setStatus(
    error ? authErrorMessage(error) : '비밀번호 재설정 메일을 보냈습니다.',
    error ? 'error' : 'success',
  );
});
