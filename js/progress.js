import {
  daysFromToday,
  escapeHtml,
  formatDate,
  getAppContext,
  profileColorStyle,
  setupShell,
  showAppAlert,
  showPageError,
  supabase,
} from './app-context.js';

let context;
let todos = [];

function dDay(value) {
  if (!value) return '기한 없음';
  const days = daysFromToday(value);
  if (days === 0) return 'D-Day';
  return days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;
}

function renderSummary() {
  const active = todos.filter((todo) => todo.status !== 'canceled');
  const done = active.filter((todo) => todo.status === 'done').length;
  const inProgress = active.filter((todo) => todo.status === 'in_progress').length;
  const pending = active.filter((todo) => todo.status === 'todo').length;
  const percent = active.length ? Math.round((done / active.length) * 100) : 0;
  const percentElement = document.querySelector('.percent-big');
  const bar = document.querySelector('.bar-fill-lg');
  const counts = document.querySelectorAll('.status-count-group strong');
  const dday = document.querySelector('.dday-tag');
  if (percentElement) percentElement.textContent = `${percent}%`;
  if (bar) bar.style.width = `${percent}%`;
  if (counts[0]) counts[0].textContent = done;
  if (counts[1]) counts[1].textContent = inProgress;
  if (counts[2]) counts[2].textContent = pending;
  const dueDates = active.map((todo) => todo.due_at).filter(Boolean).sort();
  if (dday) dday.textContent = dueDates.length ? `가장 가까운 마감 ${formatDate(dueDates[0])} · ${dDay(dueDates[0])}` : '등록된 마감일 없음';
}

function renderMembers() {
  const table = document.querySelector('[data-team-table]');
  if (!table) return;
  table.hidden = false;
  table.innerHTML = context.members.map((member) => {
    const assigned = todos.filter((todo) => todo.assignee_id === member.userId && todo.status !== 'canceled');
    const done = assigned.filter((todo) => todo.status === 'done').length;
    const delayed = assigned.filter((todo) => todo.status !== 'done' && todo.due_at && new Date(todo.due_at) < new Date()).length;
    const percent = assigned.length ? Math.round((done / assigned.length) * 100) : 0;
    const titles = assigned.filter((todo) => todo.status !== 'done').slice(0, 2).map((todo) => todo.title).join(' · ') || '배정된 업무 없음';
    return `<tr class="team-table-row" style="${profileColorStyle(member.userId)}">
      <td><div class="member-info"><span class="member-avatar pastel-avatar"></span><span class="member-name">${escapeHtml(member.name)}</span></div></td>
      <td>${member.role === 'owner' ? '팀장' : member.role === 'admin' ? '관리자' : '팀원'}</td>
      <td>${escapeHtml(titles)}</td>
      <td><div class="table-progress-wrap"><div class="table-progress-bar"><div class="table-progress-fill profile-colored-progress" style="width:${percent}%"></div></div><strong>${percent}%</strong></div></td>
      <td>${done} / ${assigned.length}</td>
      <td><span class="${delayed ? 'badge-delay-exist' : 'badge-delay-zero'}">${delayed}건</span></td>
    </tr>`;
  }).join('');
}

function taskCard(todo) {
  const member = context.members.find((item) => item.userId === todo.assignee_id);
  return `
    <div class="kanban-card" draggable="true" data-todo-id="${todo.id}" style="${profileColorStyle(member?.userId ?? todo.id)}">
      <span class="kanban-card-tag ${todo.priority === 'high' || todo.priority === 'urgent' ? 'tag-back' : 'tag-plan'}">${todo.priority === 'urgent' ? '긴급' : todo.priority === 'high' ? '높음' : todo.priority === 'medium' ? '보통' : '낮음'}</span>
      <div class="kanban-card-title">${escapeHtml(todo.title)}</div>
      <div class="kanban-card-footer">
        <div class="kanban-assignee"><span class="kanban-assignee-img pastel-avatar"></span> ${escapeHtml(member?.name ?? '미배정')}</div>
        <span class="kanban-dday">${dDay(todo.due_at)}</span>
      </div>
    </div>`;
}

function renderBoard() {
  const grid = document.querySelector('.kanban-grid');
  if (!grid) return;
  grid.hidden = false;
  const columns = [
    { status: 'todo', label: '대기' },
    { status: 'in_progress', label: '진행 중' },
    { status: 'done', label: '완료' },
  ];
  grid.innerHTML = columns.map((column) => {
    const rows = todos.filter((todo) => todo.status === column.status);
    return `
      <div class="kanban-column" data-status="${column.status}">
        <div class="kanban-col-header">
          <span class="kanban-col-title">${column.label} <span class="count-badge">${rows.length}</span></span>
          <button class="kanban-add-btn" data-go-todo>+</button>
        </div>
        ${rows.length ? rows.map(taskCard).join('') : '<div class="empty-state">업무가 없습니다.</div>'}
      </div>`;
  }).join('');

  grid.querySelectorAll('.kanban-card').forEach((card) => {
    card.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', card.dataset.todoId);
    });
  });
  grid.querySelectorAll('.kanban-column').forEach((column) => {
    column.addEventListener('dragover', (event) => event.preventDefault());
    column.addEventListener('drop', async (event) => {
      event.preventDefault();
      const todoId = event.dataTransfer.getData('text/plain');
      const { error } = await supabase.from('todos').update({ status: column.dataset.status }).eq('id', todoId);
      if (error) return showAppAlert(error.message, { title: '업무 상태 변경 실패' });
      await loadTodos();
    });
  });
  grid.querySelectorAll('[data-go-todo]').forEach((button) => {
    button.addEventListener('click', () => { window.location.href = './todo.html'; });
  });
}

async function loadTodos() {
  const { data, error } = await supabase
    .from('todos')
    .select('id, title, status, priority, due_at, assignee_id')
    .eq('team_id', context.team.id)
    .neq('status', 'canceled')
    .order('position');
  if (error) throw error;
  todos = data ?? [];
  renderSummary();
  renderMembers();
  renderBoard();
}

async function initialize() {
  try {
    context = await getAppContext();
    if (!context) return;
    setupShell(context);
    document.querySelector('.btn-assign')?.addEventListener('click', () => {
      window.location.href = './todo.html';
    });
    await loadTodos();
  } catch (error) {
    showPageError(error);
  }
}

initialize();
