import {
  daysFromToday,
  escapeHtml,
  formatDate,
  formatTime,
  getAppContext,
  profileColorStyle,
  setupShell,
  showAppDetails,
  showPageError,
  supabase,
} from './app-context.js';

const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
const priorityLabel = { urgent: '긴급', high: '높음', medium: '보통', low: '낮음' };
const priorityClass = { urgent: 'tag-very-high', high: 'tag-high', medium: 'tag-medium', low: 'tag-low' };

function cachedChatSummary(teamId) {
  try {
    return JSON.parse(localStorage.getItem(`teamgachi-chat-summary:${teamId}`) || 'null')?.summary ?? '';
  } catch (error) {
    console.warn('임시 저장된 채팅 요약을 읽지 못했습니다.', error);
    return '';
  }
}

function renderChatSummary(value) {
  const summaryList = document.querySelector('.chat-summary-list');
  if (!summaryList) return;
  const lines = String(value || '')
    .split('\n')
    .map((line) => line
      .replace(/^#{1,6}\s*/, '')
      .replace(/^[-*•]\s*/, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .trim())
    .filter(Boolean)
    .slice(0, 3);
  summaryList.innerHTML = lines.length
    ? lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')
    : '<li>채팅에서 AI 대화 요약을 생성하면 여기에 표시됩니다.</li>';
}

function dDay(value) {
  if (!value) return '-';
  const days = daysFromToday(value);
  if (days === 0) return 'D-Day';
  return days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;
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
      <div class="task-item" title="${escapeHtml(memberMap.get(todo.assignee_id)?.name ?? '미배정')} · ${dDay(todo.due_at)}">
        <span class="task-num">${index + 1}</span>
        <span class="task-title">${escapeHtml(todo.title)}</span>
        <span class="priority-tag ${priorityClass[todo.priority]}">${priorityLabel[todo.priority]}</span>
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
      <div class="progress-item" style="${profileColorStyle(member.userId)}">
        <div class="progress-header">
          <span><i class="dashboard-member-avatar"></i><b>${escapeHtml(member.name)}</b> (${member.role === 'owner' ? '팀장' : member.role === 'admin' ? '관리자' : '팀원'})</span>
          <span class="item-meta">${done} / ${assigned.length} (${percent}%)</span>
        </div>
        <div class="progress-bar-bg"><div class="progress-bar-fill profile-colored-progress" style="width: ${percent}%;"></div></div>
      </div>`;
  }).join('');
}

function renderSchedules(schedules) {
  const container = document.querySelector('.schedule-rows');
  if (!container) return;
  container.innerHTML = schedules.length
    ? schedules.map((schedule) => `
      <button type="button" class="schedule-item dashboard-schedule-button" data-schedule-id="${schedule.id}">
        <span class="date-badge">${new Date(schedule.starts_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })}</span>
        <span class="schedule-title">${escapeHtml(schedule.title)}</span>
        <span class="dday-text">${dDay(schedule.starts_at)}</span>
      </button>`).join('')
    : '<div class="empty-state">다가오는 일정이 없습니다.</div>';
  container.querySelectorAll('[data-schedule-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const schedule = schedules.find((item) => item.id === button.dataset.scheduleId);
      if (!schedule) return;
      showAppDetails({
        title: '다가오는 일정',
        heading: schedule.title,
        badge: dDay(schedule.starts_at),
        rows: [
          { label: '날짜', value: formatDate(schedule.starts_at, { year: 'numeric' }) },
          { label: '시간', value: formatTime(schedule.starts_at) },
          { label: '이동', value: '캘린더에서 전체 일정과 상세 내용을 확인할 수 있습니다.' },
        ],
      });
    });
  });
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

    const recentSince = new Date(Date.now() - (7 * 86400000)).toISOString();
    const [todosResult, schedulesResult, noticesResult, readsResult, chatSummaryResult, messagesResult] = await Promise.all([
      supabase.from('todos').select('id, title, status, priority, due_at, assignee_id').eq('team_id', context.team.id).order('position'),
      supabase.from('schedules').select('id, title, starts_at').eq('team_id', context.team.id).gte('starts_at', new Date().toISOString()).order('starts_at').limit(6),
      supabase.from('notices').select('id, title, category, created_at').eq('team_id', context.team.id).order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(3),
      supabase.from('notice_reads').select('notice_id').eq('user_id', context.user.id),
      supabase.from('chat_summaries').select('summary, updated_at').eq('team_id', context.team.id).maybeSingle(),
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('team_id', context.team.id).gte('created_at', recentSince),
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
    const todayAssigned = activeTodos.filter((todo) => todo.assignee_id === context.user.id
      && todo.due_at
      && new Date(todo.due_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }) === today);
    const todayOpen = todayAssigned.filter((todo) => todo.status !== 'done').length;
    const todayDone = todayAssigned.filter((todo) => todo.status === 'done').length;
    const nearestSchedule = schedules[0];
    const rankedTodos = todos
      .filter((todo) => !['done', 'canceled'].includes(todo.status))
      .sort((a, b) => (priorityOrder[a.priority] - priorityOrder[b.priority])
        || (new Date(a.due_at ?? '9999-12-31') - new Date(b.due_at ?? '9999-12-31')));

    const projectTag = document.querySelector('.project-tag-info');
    if (projectTag) projectTag.textContent = `${context.team.name} · 팀원 ${context.members.length}명 · 초대 코드 ${context.team.inviteCode}`;
    const welcomeSub = document.querySelector('[data-welcome-sub]');
    if (welcomeSub) welcomeSub.textContent = myActive.length
      ? `지금 해결해야 할 우선순위 업무가 ${myActive.length}건 있습니다.`
      : '현재 남아 있는 내 업무가 없습니다.';
    document.querySelector('[data-stat-progress]').innerHTML = `${overall}<span class="stat-denom">%</span>`;
    document.querySelector('[data-stat-progress-sub]').textContent = activeTodos.length ? `완료 ${done} / 전체 ${activeTodos.length}` : '새 팀은 0%에서 시작합니다';
    document.querySelector('[data-progress-donut]')?.style.setProperty('--percent', overall);
    document.querySelector('[data-stat-today]').innerHTML = `${todayOpen}<span class="stat-denom">/${todayAssigned.length}</span>`;
    document.querySelector('[data-stat-today-sub]').textContent = `완료 ${todayDone}건`;
    document.querySelector('[data-stat-dday]').textContent = nearestSchedule ? dDay(nearestSchedule.starts_at) : '-';
    document.querySelector('[data-stat-dday-sub]').textContent = nearestSchedule?.title ?? '다가오는 일정이 없습니다';
    document.querySelector('[data-stat-activity]').innerHTML = `${messagesResult.count ?? 0}<span class="stat-denom">건</span>`;
    document.querySelector('[data-ai-priority]').textContent = rankedTodos[0]
      ? `${rankedTodos[0].title} 업무를 먼저 확인해 보세요.`
      : '추천할 진행 중 업무가 없습니다.';

    const memberMap = new Map(context.members.map((member) => [member.userId, member]));
    renderPriorities(todos, memberMap);
    renderSchedules(schedules);

    if (chatSummaryResult.error) console.warn('대시보드 채팅 요약을 불러오지 못했습니다.', chatSummaryResult.error);
    renderChatSummary(chatSummaryResult.data?.summary || cachedChatSummary(context.team.id));
    document.querySelector('#add-task-btn')?.addEventListener('click', () => {
      window.location.href = './todo.html';
    });
  } catch (error) {
    showPageError(error);
  }
}

initialize();
