import {
  escapeHtml,
  formatDate,
  getAppContext,
  setupShell,
  showPageError,
  supabase,
} from './app-context.js';

const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
const priorityLabel = { urgent: '긴급', high: '높음', medium: '보통', low: '낮음' };
const priorityClass = { urgent: 'high', high: 'high', medium: 'mid', low: 'low' };

function dDay(value) {
  if (!value) return '-';
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
  if (days === 0) return 'D-Day';
  return days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;
}

function setMetric(card, value, subtext) {
  if (!card) return;
  card.querySelector('.summary-value').textContent = value;
  card.querySelector('.summary-sub').textContent = subtext;
}

function renderPriorities(todos, memberMap) {
  const container = document.querySelector('.task-rows');
  if (!container) return;
  const active = todos
    .filter((todo) => !['done', 'canceled'].includes(todo.status))
    .sort((a, b) => {
      const priority = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priority !== 0) return priority;
      return new Date(a.due_at ?? '9999-12-31') - new Date(b.due_at ?? '9999-12-31');
    })
    .slice(0, 3);

  container.innerHTML = active.length
    ? active.map((todo, index) => `
      <div class="priority-item">
        <div><b>${index + 1}.</b>&nbsp; ${escapeHtml(todo.title)}</div>
        <div><span class="item-meta">${escapeHtml(memberMap.get(todo.assignee_id)?.name ?? '미배정')} · ${dDay(todo.due_at)}</span>
        <span class="badge-purple">${priorityLabel[todo.priority]}</span></div>
      </div>`).join('')
    : '<div class="empty-state">등록된 할 일이 없습니다.</div>';
}

function renderMembers(context, todos) {
  const container = document.querySelector('.member-rows');
  if (!container) return;
  container.innerHTML = context.members.map((member) => {
    const assigned = todos.filter((todo) => todo.assignee_id === member.userId && todo.status !== 'canceled');
    const done = assigned.filter((todo) => todo.status === 'done').length;
    const percent = assigned.length ? Math.round((done / assigned.length) * 100) : 0;
    return `
      <div class="progress-item">
        <div class="progress-header">
          <span><b>${escapeHtml(member.name)}</b> (${member.role === 'owner' ? '팀장' : member.role === 'admin' ? '관리자' : '팀원'})</span>
          <span class="item-meta">${done} / ${assigned.length} (${percent}%)</span>
        </div>
        <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${percent}%;"></div></div>
      </div>`;
  }).join('');
}

function renderSchedules(schedules) {
  const container = document.querySelector('.schedule-rows');
  if (!container) return;
  container.innerHTML = schedules.length
    ? schedules.map((schedule) => `
      <div class="schedule-item">
        <span class="item-meta">${formatDate(schedule.starts_at)}</span>
        <span>${escapeHtml(schedule.title)}</span>
        <span class="badge-purple">${dDay(schedule.starts_at)}</span>
      </div>`).join('')
    : '<div class="empty-state">다가오는 일정이 없습니다.</div>';
}

function renderNotices(notices) {
  const container = document.querySelector('.notice-rows');
  if (!container) return;
  container.innerHTML = notices.length
    ? notices.map((notice) => `
      <div class="notice-item">
        <span class="${notice.category === 'urgent' ? 'badge-red' : 'badge-purple'}">${notice.category === 'urgent' ? '필독' : notice.category === 'event' ? '일정' : '일반'}</span>
        <span>${escapeHtml(notice.title)}</span>
      </div>`).join('')
    : '<div class="empty-state">등록된 공지가 없습니다.</div>';
}

async function initialize() {
  try {
    const context = await getAppContext();
    if (!context) return;
    setupShell(context);

    const [todosResult, schedulesResult, noticesResult, readsResult] = await Promise.all([
      supabase.from('todos').select('id, title, status, priority, due_at, assignee_id').eq('team_id', context.team.id).order('position'),
      supabase.from('schedules').select('id, title, starts_at').eq('team_id', context.team.id).gte('starts_at', new Date().toISOString()).order('starts_at').limit(4),
      supabase.from('notices').select('id, title, category, created_at').eq('team_id', context.team.id).order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(3),
      supabase.from('notice_reads').select('notice_id').eq('user_id', context.user.id),
    ]);
    for (const result of [todosResult, schedulesResult, noticesResult, readsResult]) {
      if (result.error) throw result.error;
    }

    const todos = todosResult.data ?? [];
    const schedules = schedulesResult.data ?? [];
    const notices = noticesResult.data ?? [];
    const readIds = new Set((readsResult.data ?? []).map((row) => row.notice_id));
    const done = todos.filter((todo) => todo.status === 'done').length;
    const activeTodos = todos.filter((todo) => todo.status !== 'canceled');
    const overall = activeTodos.length ? Math.round((done / activeTodos.length) * 100) : 0;
    const myActive = activeTodos.filter((todo) => todo.assignee_id === context.user.id && todo.status !== 'done');
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    const todayDue = myActive.filter((todo) => todo.due_at && new Date(todo.due_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }) === today).length;
    const unread = notices.filter((notice) => !readIds.has(notice.id)).length;

    const projectTag = document.querySelector('.project-tag-info');
    if (projectTag) projectTag.textContent = `${context.team.name} · 팀원 ${context.members.length}명 · 초대 코드 ${context.team.inviteCode}`;
    const cards = document.querySelectorAll('.summary-card');
    setMetric(cards[0], `${overall}%`, activeTodos.length ? `완료 ${done}건` : '새 팀은 0%에서 시작합니다');
    setMetric(cards[1], `${myActive.length}건`, `오늘 마감 ${todayDue}건`);
    setMetric(cards[2], `${done} / ${activeTodos.length}`, '팀 전체 기준');
    setMetric(cards[3], `${unread}`, `새 공지 ${unread}건`);

    const memberMap = new Map(context.members.map((member) => [member.userId, member]));
    renderPriorities(todos, memberMap);
    renderMembers(context, todos);
    renderSchedules(schedules);
    renderNotices(notices);

    const summaryList = document.querySelector('.bullet-list');
    if (summaryList) summaryList.innerHTML = '<li>요약할 팀 대화가 없습니다.</li>';
    document.querySelector('#add-task-btn')?.addEventListener('click', () => {
      window.location.href = './todo.html';
    });
    document.querySelectorAll('.link-action').forEach((link) => {
      if (link.textContent.includes('전체 보기')) link.href = './progress.html';
    });
  } catch (error) {
    showPageError(error);
  }
}

initialize();
