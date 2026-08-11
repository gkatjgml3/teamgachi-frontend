import { supabase } from './supabase-client.js';

const roleLabels = {
  owner: '팀장',
  admin: '관리자',
  member: '팀원',
};

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

export async function getAppContext() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    window.location.replace('./login.html');
    return null;
  }

  const [{ data: profile, error: profileError }, { data: teamRows, error: teamError }] = await Promise.all([
    supabase.from('profiles').select('display_name, avatar_url').eq('id', user.id).maybeSingle(),
    supabase.rpc('ensure_default_team'),
  ]);
  if (profileError) throw profileError;
  if (teamError) throw teamError;

  const teamRow = Array.isArray(teamRows) ? teamRows[0] : teamRows;
  if (!teamRow) throw new Error('팀 정보를 만들지 못했습니다.');
  const members = await loadMembers(teamRow.team_id);

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
      id: teamRow.team_id,
      name: teamRow.team_name,
      inviteCode: teamRow.invite_code,
      role: teamRow.member_role,
    },
    members,
  };
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
