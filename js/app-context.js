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

export function daysFromToday(value, now = new Date()) {
  const dayNumber = (input) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(input));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
  };
  return Math.round((dayNumber(value) - dayNumber(now)) / 86400000);
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

export function showAppDetails({
  title = '상세 정보',
  heading = '',
  badge = '',
  rows = [],
  buttonText = '닫기',
} = {}) {
  return new Promise((resolve) => {
    const overlay = createOverlay('app-detail-overlay', title, resolve);
    const body = overlay.querySelector('.app-modal-body');
    body.innerHTML = `
      <div class="app-detail-heading">
        ${badge ? `<span class="app-detail-badge">${escapeHtml(badge)}</span>` : ''}
        ${heading ? `<strong>${escapeHtml(heading)}</strong>` : ''}
      </div>
      <dl class="app-detail-list">
        ${rows.map((row) => `<div class="app-detail-row"><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value || '-')}</dd></div>`).join('')}
      </dl>
      <div class="modal-actions single">
        <button type="button" class="modal-button primary" data-confirm>${escapeHtml(buttonText)}</button>
      </div>`;
    body.querySelector('[data-confirm]').addEventListener('click', overlay.closeModal);
    body.querySelector('[data-confirm]').focus();
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
      let control;
      if (field.type === 'textarea') {
        control = `<textarea ${attributes}>${escapeHtml(field.value ?? '')}</textarea>`;
      } else if (field.type === 'select') {
        control = `<select ${attributes}>${(field.options ?? []).map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === field.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select>`;
      } else {
        control = `<input type="${escapeHtml(field.type || 'text')}" value="${escapeHtml(field.value ?? '')}" ${attributes}>`;
      }
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
    if (input.dataset.searchReady === 'true') return;
    input.dataset.searchReady = 'true';
    input.setAttribute('aria-label', '팀 자료 통합 검색');
    const wrapper = input.closest('.header-search, .search-box');
    let button = wrapper?.querySelector('[data-search-submit]');
    if (!button && wrapper) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'header-search-submit';
      button.dataset.searchSubmit = '';
      button.textContent = '검색';
      button.setAttribute('aria-label', '검색 실행');
      wrapper.append(button);
    }
    const search = async () => {
      if (!input.value.trim()) {
        input.focus();
        return showAppAlert('검색어를 입력해 주세요.', { title: '통합 검색' });
      }
      if (button) button.disabled = true;
      try { await runGlobalSearch(context, input.value); }
      catch (error) { await showAppAlert(error.message, { title: '검색 실패' }); }
      finally { if (button) button.disabled = false; }
    };
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      search();
    });
    button?.addEventListener('click', search);
  });
}

function configureTeamMenu(context) {
  const openTeamMenu = () => {
    const overlay = createOverlay('team-menu-overlay', '팀 관리');
    const body = overlay.querySelector('.app-modal-body');
    body.innerHTML = `
      <label class="modal-label">현재 팀</label>
      <select class="modal-input" data-switch-team>${context.teams.map((team) => `<option value="${team.id}" ${team.id === context.team.id ? 'selected' : ''}>${escapeHtml(team.name)}</option>`).join('')}</select>
      <div class="modal-actions">
        <button type="button" class="modal-button" data-rename-team ${['owner', 'admin'].includes(context.team.role) ? '' : 'disabled'}>팀 이름 변경</button>
        <button type="button" class="modal-button primary" data-create-team>새 팀 만들기</button>
      </div>
      <button type="button" class="modal-button" data-join-team>초대 코드로 팀 참여</button>
      <p class="modal-help team-invite-line">초대 코드: <strong>${escapeHtml(context.team.inviteCode)}</strong> <button type="button" class="inline-copy-button" data-copy-invite>복사</button></p>
      ${['owner', 'admin'].includes(context.team.role) ? '' : '<p class="modal-help">팀 이름은 팀장·관리자만 변경할 수 있습니다.</p>'}`;
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
    body.querySelector('[data-copy-invite]').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(context.team.inviteCode);
        await showAppAlert('초대 코드를 복사했습니다.', { title: '초대 코드' });
      } catch {
        await showAppAlert(`초대 코드: ${context.team.inviteCode}`, { title: '초대 코드' });
      }
    });
    body.querySelector('[data-join-team]').addEventListener('click', async () => {
      const values = await showAppForm({
        title: '초대 코드로 팀 참여',
        description: '팀장에게 받은 8자리 초대 코드를 입력해 주세요.',
        fields: [{ name: 'code', label: '초대 코드', placeholder: '예: A1B2C3D4', required: true }],
        submitText: '팀 참여하기',
      });
      if (!values) return;
      const code = values.code.replace(/\s/g, '').toUpperCase();
      if (!/^[A-F0-9]{8}$/.test(code)) {
        return showAppAlert('영문 A~F와 숫자로 된 8자리 초대 코드를 입력해 주세요.', { title: '초대 코드 확인' });
      }
      const { data, error } = await supabase.rpc('join_team_by_invite', { p_invite_code: code });
      if (error) return showAppAlert(error.message, { title: '팀 참여 실패' });
      const joined = Array.isArray(data) ? data[0] : data;
      if (joined?.team_id) window.localStorage.setItem('teamgachi.activeTeamId', joined.team_id);
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
  };
  let button = document.querySelector('[data-team-menu]');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'header-btn-icon team-menu-button';
    button.dataset.teamMenu = '';
    button.textContent = '⋮';
    button.setAttribute('aria-label', '팀 관리');
    button.title = '팀 관리';
    document.querySelector('.header-right-tools')?.prepend(button);
  }
  button?.addEventListener('click', openTeamMenu);
  return openTeamMenu;
}

function configureProfileMenu(context, { openTeamMenu, openFeatureGuide } = {}) {
  const targets = document.querySelectorAll('.header-profile-avatar, .sidebar-profile, [data-profile-menu]');
  targets.forEach((target) => {
    target.setAttribute('role', 'button');
    target.setAttribute('tabindex', '0');
    target.setAttribute('title', '내 프로필');
    const open = () => {
      const overlay = createOverlay('profile-menu-overlay', '내 프로필');
      const body = overlay.querySelector('.app-modal-body');
      body.innerHTML = `
        <div class="profile-menu-summary"><span class="profile-menu-avatar pastel-avatar"></span><div><strong>${escapeHtml(context.profile.name)}</strong><span>${escapeHtml(context.user.email ?? '')}</span></div></div>
        <div class="profile-menu-links">
          ${openTeamMenu ? '<button type="button" class="modal-button" data-profile-team>팀 관리</button>' : ''}
          ${openFeatureGuide ? '<button type="button" class="modal-button" data-profile-guide>화면 기능 안내</button>' : ''}
        </div>
        <div class="modal-actions">
          <button type="button" class="modal-button" data-edit-profile>이름 변경</button>
          <button type="button" class="modal-button danger" data-profile-logout>로그아웃</button>
        </div>`;
      body.querySelector('[data-profile-team]')?.addEventListener('click', () => {
        overlay.closeModal();
        openTeamMenu();
      });
      body.querySelector('[data-profile-guide]')?.addEventListener('click', () => {
        overlay.closeModal();
        openFeatureGuide();
      });
      body.querySelector('[data-edit-profile]').addEventListener('click', async () => {
        const values = await showAppForm({
          title: '프로필 이름 변경',
          description: '팀 화면에 표시할 이름을 입력해 주세요.',
          fields: [{ name: 'name', label: '이름', value: context.profile.name, required: true }],
          submitText: '변경하기',
        });
        if (!values) return;
        const name = values.name.trim().slice(0, 50);
        const { error } = await supabase.from('profiles').update({ display_name: name }).eq('id', context.user.id);
        if (error) return showAppAlert(error.message, { title: '프로필 변경 실패' });
        window.location.reload();
      });
      body.querySelector('[data-profile-logout]').addEventListener('click', async () => {
        const confirmed = await showAppConfirm('팀가치에서 로그아웃할까요?', { title: '로그아웃', confirmText: '로그아웃' });
        if (!confirmed) return;
        await supabase.auth.signOut();
        window.location.replace('./login.html');
      });
    };
    target.addEventListener('click', open);
    target.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      open();
    });
  });
}

const featureGuides = {
  dashboard: {
    title: '대시보드 기능 안내',
    heading: '팀의 현재 상태를 한눈에 확인하는 시작 화면',
    rows: [
      { label: '요약 카드', value: '전체 진행률, 내 할 일, 완료 업무, 읽지 않은 공지를 표시합니다.' },
      { label: '우선순위', value: '마감일과 중요도를 기준으로 지금 먼저 할 업무를 보여줍니다.' },
      { label: '전체 보기', value: '진척도·캘린더·채팅·공지사항의 해당 전체 화면으로 이동합니다.' },
    ],
  },
  todo: {
    title: '할 일 기능 안내',
    heading: '업무를 등록하고 담당자·마감일·완료 상태를 관리합니다.',
    rows: [
      { label: '내 할 일', value: '내가 담당하거나 공동 작업자로 지정된 업무만 모아봅니다.' },
      { label: '완료 처리', value: '체크박스로 완료하며, 증빙 필수 업무는 파일을 올려야 완료됩니다.' },
      { label: 'AI 추천', value: 'AI가 연결되면 추천 결과를, 미연결 시 중요도와 마감일 자동 정렬을 사용합니다.' },
    ],
  },
  chat: {
    title: '채팅·자료함 기능 안내',
    heading: '팀 대화와 파일·이미지·링크를 한 공간에서 공유합니다.',
    rows: [
      { label: '실시간 채팅', value: '팀원이 보낸 메시지가 새로고침 없이 표시됩니다.' },
      { label: '자료함', value: '팀 파일, 이미지와 웹 링크를 업로드하고 열거나 내려받습니다.' },
      { label: 'AI 요약', value: '최근 대화를 AI로 요약하며 API 미연결 시 자동 규칙 요약을 제공합니다.' },
    ],
  },
  calendar: {
    title: '캘린더 기능 안내',
    heading: '팀 일정과 할 일 마감일을 월·주·일 단위로 확인합니다.',
    rows: [
      { label: '월·주·일', value: '오른쪽 보기 버튼으로 달력 범위를 전환하고 날짜를 누르면 일 보기로 이동합니다.' },
      { label: '마감 연동', value: '마감일이 있는 할 일은 캘린더와 다가오는 마감에 자동 표시됩니다.' },
      { label: '일정 추가', value: '날짜와 시작 시간을 지정해 팀 일정을 직접 등록합니다.' },
    ],
  },
  progress: {
    title: '업무·진척도 기능 안내',
    heading: '팀원별 업무 배정과 완료율을 비교합니다.',
    rows: [
      { label: '진행률', value: '담당 업무 중 완료한 업무 비율을 팀원별로 계산합니다.' },
      { label: '업무 현황', value: '대기·진행 중·완료 상태를 기준으로 프로젝트 흐름을 확인합니다.' },
      { label: '필터', value: '팀원 또는 상태별로 필요한 업무만 골라봅니다.' },
    ],
  },
  timer: {
    title: '집중 타이머 기능 안내',
    heading: '15·25·45·60분 집중 세션과 작업 인증 기록을 관리합니다.',
    rows: [
      { label: '집중 시간', value: '시작 전에 원하는 시간을 선택하며 25분으로만 제한되지 않습니다.' },
      { label: '통계', value: '완료한 세션으로 오늘·주간 집중 시간과 팀 랭킹을 계산합니다.' },
      { label: '인증 피드', value: '완료 세션을 선택해 작업 사진과 설명을 올리고 팀원이 응원할 수 있습니다.' },
    ],
  },
  notice: {
    title: '공지사항 기능 안내',
    heading: '중요한 팀 소식을 분류해 공유하고 읽음 여부를 관리합니다.',
    rows: [
      { label: '공지 작성', value: '팀장·관리자가 화면 오른쪽 위 + 공지 작성 버튼에서 등록합니다.' },
      { label: '분류', value: '필독·일정·일반 탭과 최신순·오래된순 정렬을 사용할 수 있습니다.' },
      { label: '확인', value: '공지를 열면 읽음 처리되며 미확인 공지를 따로 확인할 수 있습니다.' },
    ],
  },
};

function configureFeatureGuide() {
  const page = window.location.pathname.split('/').pop()?.replace('.html', '') || 'dashboard';
  const guide = featureGuides[page];
  if (!guide) return null;
  return () => showAppDetails({ ...guide, badge: '기능 안내' });
}

export function setupShell(context) {
  const { profile, team } = context;
  document.querySelectorAll('.profile-name, [data-profile-name], [data-welcome-name]').forEach((element) => {
    element.textContent = profile.name;
  });
  document.querySelectorAll('.profile-role, [data-profile-role]').forEach((element) => {
    element.textContent = `${roleLabel(team.role)} · ${team.name}`;
  });

  document.querySelectorAll('[data-logout]').forEach((target) => {
    target.addEventListener('click', async () => {
      await supabase.auth.signOut();
      window.location.replace('./login.html');
    });
  });

  document.querySelectorAll('.sidebar-menu a[href="#"]').forEach((link) => {
    link.addEventListener('click', async (event) => {
      event.preventDefault();
      await showAppAlert(`${link.textContent.trim()} 화면은 다음 단계에서 추가됩니다.`, { title: '준비 중인 기능' });
    });
  });

  configureSearch(context);
  const openTeamMenu = configureTeamMenu(context);
  const openFeatureGuide = configureFeatureGuide();
  configureProfileMenu(context, { openTeamMenu, openFeatureGuide });

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
