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

function createOverlay(className, title) {
  document.querySelector(`.${className}`)?.remove();
  const overlay = document.createElement('div');
  overlay.className = `app-overlay ${className}`;
  overlay.innerHTML = `<div class="app-modal"><div class="app-modal-header"><h3>${escapeHtml(title)}</h3><button type="button" data-close>×</button></div><div class="app-modal-body"></div></div>`;
  overlay.querySelector('[data-close]').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
  document.body.append(overlay);
  return overlay;
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
      try { await runGlobalSearch(context, input.value); } catch (error) { window.alert(error.message); }
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
      const name = window.prompt('새 팀 이름을 입력하세요.', context.team.name)?.trim();
      if (!name) return;
      const { error } = await supabase.from('teams').update({ name }).eq('id', context.team.id);
      if (error) return window.alert(error.message);
      window.location.reload();
    });
    body.querySelector('[data-create-team]').addEventListener('click', async () => {
      const name = window.prompt('새 팀 이름을 입력하세요.')?.trim();
      if (!name) return;
      const { data, error } = await supabase.from('teams').insert({ name, owner_id: context.user.id }).select('id').single();
      if (error) return window.alert(error.message);
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
    link.addEventListener('click', (event) => {
      event.preventDefault();
      window.alert(`${link.textContent.trim()} 화면은 다음 단계에서 추가됩니다.`);
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
