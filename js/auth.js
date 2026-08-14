import { supabase } from './supabase-client.js';

const form = document.querySelector('[data-auth-form]');
const statusElement = document.querySelector('[data-auth-status]');
const JWT_CLOCK_ERROR = /jwt.*issued.*future|issued at future|not valid yet/i;

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function waitForAuthenticatedSession(initialAccessToken) {
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (attempt > 0) await wait(500 * attempt);
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token ?? initialAccessToken;
    if (!accessToken) continue;
    const { error } = await supabase.auth.getUser(accessToken);
    if (!error) return;
    lastError = error;
    if (!JWT_CLOCK_ERROR.test(error.message ?? '')) throw error;
  }
  throw lastError ?? new Error('로그인 세션을 확인하지 못했습니다. 다시 시도해 주세요.');
}

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

const queryParams = new URLSearchParams(window.location.search);
if (form?.dataset.mode === 'login' && queryParams.get('signup') === 'success') {
  setStatus('회원가입이 완료되었습니다. 가입한 계정으로 로그인해 주세요.', 'success');
  window.history.replaceState({}, '', window.location.pathname);
}

function authErrorMessage(error) {
  const message = error?.message ?? '';
  if (/invalid login credentials/i.test(message)) return '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (/user already registered/i.test(message)) return '이미 가입된 이메일입니다.';
  if (JWT_CLOCK_ERROR.test(message)) return '로그인 시간을 맞추는 중입니다. 잠시 후 다시 시도해 주세요.';
  return message || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

async function handleLogin(data) {
  const { data: result, error } = await supabase.auth.signInWithPassword({
    email: String(data.get('email')).trim(),
    password: String(data.get('password')),
  });

  if (error) throw error;
  await waitForAuthenticatedSession(result.session?.access_token);
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

  if (password !== passwordConfirm) throw new Error('비밀번호 확인이 일치하지 않습니다.');
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
  if (result.session) await supabase.auth.signOut();
  window.location.replace('./login.html?signup=success');
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
