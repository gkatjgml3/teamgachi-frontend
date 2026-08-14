import { supabase } from './supabase-client.js';

const roleLabels = {
  owner: '팀장',
  admin: '관리자',
  member: '팀원',
};
const JWT_CLOCK_ERROR = /jwt.*issued.*future|issued at future|not valid yet/i;

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function isJwtClockError(error) {
  return JWT_CLOCK_ERROR.test(error?.message ?? '');
}

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function formatDate(value, options = {}) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    ...options,
  }).format(new Date(value));
}

export function formatTime(value) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

export function roleLabel(role) {
  return roleLabels[role] ?? '팀원';
}

async function loadMembers(teamId) {
  const { data, error } = await supabase
    .from('team_members')
    .select('user_id, role, joined_at, profile:profiles!team_members_user_id_fkey(display_name, avatar_url)')
    .eq('team_id', teamId)
    .order('joined_at');
  if (error) throw error;
  return (data ?? []).map((member) => ({
    userId: member.user_id,
    role: member.role,
    name: member.profile?.display_name ?? '팀원',
    avatarUrl: member.profile?.avatar_url ?? null,
  }));
}

async function loadAppContextOnce() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) {
    window.location.replace('./login.html');
    return null;
  }

  const [{ data: profile, error: profileError }, { data: teamRows, error: teamError }] = await Promise.all([
    supabase.from('profiles').select('display_name, avatar_url').eq('id', user.id).maybeSingle(),
    supabase.rpc('ensure_default_team'),
  ]);
  if (profileError) throw profileError;
  if (teamError) throw teamError;

  const ensuredTeam = Array.isArray(teamRows) ? teamRows[0] : teamRows;
  if (!ensuredTeam) throw new Error('팀 정보를 만들지 못했습니다.');
  const { data: memberships, error: membershipError } = await supabase
    .from('team_members')
    .select('team_id, role, team:teams!team_members_team_id_fkey(id, name, invite_code)')
    .eq('user_id', user.id)
    .order('joined_at');
  if (membershipError) throw membershipError;
  const teams = (memberships ?? []).map((membership) => ({
    id: membership.team_id,
    name: membership.team?.name ?? '이름 없는 팀',
    inviteCode: membership.team?.invite_code ?? '',
    role: membership.role,
  }));
  const savedTeamId = window.localStorage.getItem('teamgachi.activeTeamId');
  const teamRow = teams.find((team) => team.id === savedTeamId) ?? teams[0] ?? {
    id: ensuredTeam.team_id,
    name: ensuredTeam.team_name,
    inviteCode: ensuredTeam.invite_code,
    role: ensuredTeam.member_role,
  };
  window.localStorage.setItem('teamgachi.activeTeamId', teamRow.id);
  const members = await loadMembers(teamRow.id);

  return {
    user,
    profile: {
      name: profile?.display_name
        || user.user_metadata?.display_name
        || user.email?.split('@')[0]
        || '팀원',
      avatarUrl: profile?.avatar_url ?? null,
    },
    team: {
      id: teamRow.id,
      name: teamRow.name,
      inviteCode: teamRow.inviteCode,
      role: teamRow.role,
    },
    teams,
    members,
  };
}

export async function getAppContext() {
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await loadAppContextOnce();
    } catch (error) {
      lastError = error;
      if (!isJwtClockError(error)) throw error;
      await wait(500 * (attempt + 1));
    }
  }
  throw lastError ?? new Error('로그인 세션을 확인하지 못했습니다.');
}

function createOverlay(className, title, onClose = () => {}) {
  const previous = document.querySelector(`.${className}`);
  if (previous?.closeModal) previous.closeModal();
  else previous?.remove();
  const template = document.querySelector('#app-modal-template');
  const overlay = template?.content.firstElementChild.cloneNode(true) ?? document.createElement('div');
  overlay.classList.add('app-overlay', className);
  if (!template) {
    overlay.innerHTML = '<section class="app-modal" role="dialog" aria-modal="true" data-modal-dialog><div class="app-modal-header"><h3 data-modal-title></h3><button type="button" data-close aria-label="닫기">×</button></div><div class="app-modal-body"></div></section>';
  }
  const titleElement = overlay.querySelector('[data-modal-title]');
  const titleId = `app-modal-title-${crypto.randomUUID()}`;
  titleElement.id = titleId;
  titleElement.textContent = title;
  overlay.querySelector('[data-modal-dialog]').setAttribute('aria-labelledby', titleId);
  let closed = false;
  overlay.closeModal = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    onClose();
  };
  overlay.querySelector('[data-close]').addEventListener('click', overlay.closeModal);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.closeModal(); });
  overlay.addEventListener('keydown', (event) => { if (event.key === 'Escape') overlay.closeModal(); });
  (document.querySelector('#app-modal-root') ?? document.body).append(overlay);
  return overlay;
}

export function showAppAlert(message, { title = '알림', buttonText = '확인' } = {}) {
  return new Promise((resolve) => {
    const overlay = createOverlay('app-message-overlay', title, resolve);
    const body = overlay.querySelector('.app-modal-body');
    body.innerHTML = `
      <p class="app-modal-message">${escapeHtml(message)}</p>
      <div class="modal-actions single">
        <button type="button" class="modal-button primary" data-confirm>${escapeHtml(buttonText)}</button>
      </div>`;
    body.querySelector('[data-confirm]').addEventListener('click', overlay.closeModal);
    body.querySelector('[data-confirm]').focus();
  });
}

export function showAppConfirm(message, {
  title = '확인',
  confirmText = '확인',
  cancelText = '취소',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    let confirmed = false;
    const overlay = createOverlay('app-confirm-overlay', title, () => resolve(confirmed));
    const body = overlay.querySelector('.app-modal-body');
    body.innerHTML = `
      <p class="app-modal-message">${escapeHtml(message)}</p>
      <div class="modal-actions">
        <button type="button" class="modal-button" data-cancel>${escapeHtml(cancelText)}</button>
        <button type="button" class="modal-button ${danger ? 'danger' : 'primary'}" data-confirm>${escapeHtml(confirmText)}</button>
      </div>`;
    body.querySelector('[data-cancel]').addEventListener('click', overlay.closeModal);
    body.querySelector('[data-confirm]').addEventListener('click', () => {
      confirmed = true;
      overlay.closeModal();
    });
    body.querySelector('[data-cancel]').focus();
  });
}

export function showAppForm({
  title,
  description = '',
  fields = [],
  submitText = '저장',
  cancelText = '취소',
} = {}) {
  return new Promise((resolve) => {
    let result = null;
    const overlay = createOverlay('app-form-overlay', title || '정보 입력', () => resolve(result));
    const body = overlay.querySelector('.app-modal-body');
    const fieldHtml = fields.map((field, index) => {
      const id = `app-modal-field-${index}`;
      const attributes = [
        `id="${id}"`,
        `name="${escapeHtml(field.name)}"`,
        `class="modal-input"`,
        field.required ? 'required' : '',
        field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : '',
        field.min ? `min="${escapeHtml(field.min)}"` : '',
        field.max ? `max="${escapeHtml(field.max)}"` : '',
      ].filter(Boolean).join(' ');
      const control = field.type === 'textarea'
        ? `<textarea ${attributes}>${escapeHtml(field.value ?? '')}</textarea>`
        : `<input type="${escapeHtml(field.type || 'text')}" value="${escapeHtml(field.value ?? '')}" ${attributes}>`;
      return `<div class="modal-field"><label class="modal-label" for="${id}">${escapeHtml(field.label)}</label>${control}<p class="modal-field-error" data-error-for="${escapeHtml(field.name)}"></p></div>`;
    }).join('');
    body.innerHTML = `
      ${description ? `<p class="modal-description">${escapeHtml(description)}</p>` : ''}
      <form class="modal-form" novalidate>
        ${fieldHtml}
        <div class="modal-actions">
          <button type="button" class="modal-button" data-cancel>${escapeHtml(cancelText)}</button>
          <button type="submit" class="modal-button primary">${escapeHtml(submitText)}</button>
        </div>
      </form>`;
    const form = body.querySelector('.modal-form');
    body.querySelector('[data-cancel]').addEventListener('click', overlay.closeModal);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      let valid = true;
      const values = {};
      fields.forEach((field) => {
        const input = form.elements.namedItem(field.name);
        const value = input?.value?.trim() ?? '';
        const error = form.querySelector(`[data-error-for="${CSS.escape(field.name)}"]`);
        let errorMessage = '';
        if (field.required && !value) errorMessage = `${field.label}을(를) 입력해 주세요.`;
        else if (input && !input.validity.valid) errorMessage = `${field.label} 형식을 확인해 주세요.`;
        if (error) error.textContent = errorMessage;
        input?.classList.toggle('invalid', Boolean(errorMessage));
        if (errorMessage) valid = false;
        values[field.name] = value;
      });
      if (!valid) {
        form.querySelector('.modal-input.invalid')?.focus();
        return;
      }
      result = values;
      overlay.closeModal();
    });
    form.querySelector('.modal-input')?.focus();
  });
}

async function runGlobalSearch(context, query) {
  const term = query.trim();
  if (!term) return;
  const escaped = term.replaceAll('%', '\\%').replaceAll('_', '\\_');
  const [todos, schedules, messages, files] = await Promise.all([
    supabase.from('todos').select('id, title, details').eq('team_id', context.team.id).ilike('title', `%${escaped}%`).limit(10),
    supabase.from('schedules').select('id, title, starts_at').eq('team_id', context.team.id).ilike('title', `%${escaped}%`).limit(10),
    supabase.from('messages').select('id, content, created_at').eq('team_id', context.team.id).ilike('content', `%${escaped}%`).limit(10),
    supabase.from('files').select('id, original_name, kind').eq('team_id', context.team.id).ilike('original_name', `%${escaped}%`).limit(10),
  ]);
  const failed = [todos, schedules, messages, files].find((result) => result.error);
  if (failed?.error) throw failed.error;
  const rows = [
    ...(todos.data ?? []).map((item) => ({ type: '할 일', text: item.title, url: './todo.html' })),
    ...(schedules.data ?? []).map((item) => ({ type: '일정', text: item.title, url: './calendar.html' })),
    ...(messages.data ?? []).map((item) => ({ type: '채팅', text: item.content, url: './chat.html' })),
    ...(files.data ?? []).map((item) => ({ type: '자료', text: item.original_name, url: './chat.html' })),
  ];
  const overlay = createOverlay('search-results-overlay', `“${term}” 검색 결과`);
  overlay.querySelector('.app-modal-body').innerHTML = rows.length
    ? rows.map((row) => `<a class="search-result-item" href="${row.url}"><strong>${row.type}</strong><span>${escapeHtml(row.text)}</span></a>`).join('')
    : '<div class="empty-state">검색 결과가 없습니다.</div>';
}

function configureSearch(context) {
  document.querySelectorAll('.header-search input, .search-box input').forEach((input) => {
    input.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      try { await runGlobalSearch(context, input.value); } catch (error) { await showAppAlert(error.message, { title: '검색 실패' }); }
    });
  });
}

function configureTeamMenu(context) {
  let button = document.querySelector('.btn-more-options, [data-team-menu]');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'header-btn-icon team-menu-button';
    button.dataset.teamMenu = '';
    button.textContent = '⋮';
    document.querySelector('.header-right-tools')?.prepend(button);
  }
  button.addEventListener('click', () => {
    const overlay = createOverlay('team-menu-overlay', '팀 관리');
    const body = overlay.querySelector('.app-modal-body');
    body.innerHTML = `
      <label class="modal-label">현재 팀</label>
      <select class="modal-input" data-switch-team>${context.teams.map((team) => `<option value="${team.id}" ${team.id === context.team.id ? 'selected' : ''}>${escapeHtml(team.name)}</option>`).join('')}</select>
      <div class="modal-actions">
        <button type="button" class="modal-button" data-rename-team>팀 이름 변경</button>
        <button type="button" class="modal-button primary" data-create-team>새 팀 만들기</button>
      </div>
      <p class="modal-help">초대 코드: <strong>${escapeHtml(context.team.inviteCode)}</strong></p>`;
    body.querySelector('[data-switch-team]').addEventListener('change', (event) => {
      window.localStorage.setItem('teamgachi.activeTeamId', event.target.value);
      window.location.reload();
    });
    body.querySelector('[data-rename-team]').addEventListener('click', async () => {
      const values = await showAppForm({
        title: '팀 이름 변경',
        description: '팀원들에게 표시할 새로운 팀 이름을 입력해 주세요.',
        fields: [{ name: 'name', label: '팀 이름', value: context.team.name, placeholder: '예: 팀가치', required: true }],
        submitText: '변경하기',
      });
      if (!values) return;
      const name = values.name;
      const { error } = await supabase.from('teams').update({ name }).eq('id', context.team.id);
      if (error) return showAppAlert(error.message, { title: '팀 이름 변경 실패' });
      window.location.reload();
    });
    body.querySelector('[data-create-team]').addEventListener('click', async () => {
      const values = await showAppForm({
        title: '새 팀 만들기',
        description: '새 프로젝트를 함께할 팀의 이름을 정해 주세요.',
        fields: [{ name: 'name', label: '팀 이름', placeholder: '예: 시너지온', required: true }],
        submitText: '팀 만들기',
      });
      if (!values) return;
      const name = values.name;
      const { data, error } = await supabase.from('teams').insert({ name, owner_id: context.user.id }).select('id').single();
      if (error) return showAppAlert(error.message, { title: '팀 생성 실패' });
      window.localStorage.setItem('teamgachi.activeTeamId', data.id);
      window.location.reload();
    });
  });
}

export function setupShell(context) {
  const { profile, team } = context;
  document.querySelectorAll('.profile-name, [data-profile-name], [data-welcome-name]').forEach((element) => {
    element.textContent = profile.name;
  });
  document.querySelectorAll('.profile-role, [data-profile-role]').forEach((element) => {
    element.textContent = `${roleLabel(team.role)} · ${team.name}`;
  });

  const logoutTargets = document.querySelectorAll('.header-profile-avatar, [data-logout]');
  logoutTargets.forEach((target) => {
    target.setAttribute('role', 'button');
    target.setAttribute('tabindex', '0');
    target.setAttribute('title', '로그아웃');
    const logout = async () => {
      await supabase.auth.signOut();
      window.location.replace('./login.html');
    };
    target.addEventListener('click', logout);
    target.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') logout();
    });
  });

  document.querySelectorAll('.sidebar-menu a[href="#"]').forEach((link) => {
    link.addEventListener('click', async (event) => {
      event.preventDefault();
      await showAppAlert(`${link.textContent.trim()} 화면은 다음 단계에서 추가됩니다.`, { title: '준비 중인 기능' });
    });
  });

  configureSearch(context);
  configureTeamMenu(context);

  window.lucide?.createIcons();
}

export function showPageError(error) {
  console.error(error);
  const detail = typeof error?.message === 'string' ? error.message : '';
  const message = detail || '화면을 불러오지 못했습니다.';
  const container = document.querySelector('.dashboard-inner, .chat-container, .progress-container, main');
  if (container) {
    const alert = document.createElement('div');
    alert.className = 'app-error';
    alert.textContent = message;
    container.prepend(alert);
  }
}

export { supabase };
