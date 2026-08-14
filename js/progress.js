import {
  escapeHtml,
  formatDate,
  getAppContext,
  setupShell,
  showAppAlert,
  showPageError,
  supabase,
} from './app-context.js';

let context;
let todos = [];

function dDay(value) {
  if (!value) return '기한 없음';
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
  if (days === 0) return '오늘';
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
  const table = document.querySelector('.team-table');
  if (!table) return;
  table.querySelectorAll('.team-table-row').forEach((row) => row.remove());
  context.members.forEach((member) => {
    const assigned = todos.filter((todo) => todo.assignee_id === member.userId && todo.status !== 'canceled');
    const done = assigned.filter((todo) => todo.status === 'done').length;
    const delayed = assigned.filter((todo) => todo.status !== 'done' && todo.due_at && new Date(todo.due_at) < new Date()).length;
    const percent = assigned.length ? Math.round((done / assigned.length) * 100) : 0;
    const titles = assigned.filter((todo) => todo.status !== 'done').slice(0, 2).map((todo) => todo.title).join(' · ') || '배정된 업무 없음';
    const row = document.createElement('div');
    row.className = 'team-table-row';
    row.innerHTML = `
      <div class="col-member"><span class="avatar-sm"></span> <strong>${escapeHtml(member.name)}</strong></div>
      <div class="col-role">${member.role === 'owner' ? '팀장' : member.role === 'admin' ? '관리자' : '팀원'}</div>
      <div class="col-task">${escapeHtml(titles)}</div>
      <div class="col-progress">
        <div class="bar-bg-sm"><div class="bar-fill-sm" style="width: ${percent}%;"></div></div>
        <span class="percent-txt">${percent}%</span>
      </div>
      <div class="col-done">${done} / ${assigned.length}</div>
      <div class="col-delay"><span class="${delayed ? 'pill-warning' : 'pill-zero'}">${delayed}건</span></div>`;
    table.append(row);
  });
}

function taskCard(todo) {
  const member = context.members.find((item) => item.userId === todo.assignee_id);
  return `
    <div class="kanban-card" draggable="true" data-todo-id="${todo.id}">
      <span class="category-tag ${todo.priority === 'high' || todo.priority === 'urgent' ? 'backend' : 'planning'}">${todo.priority === 'urgent' ? '긴급' : todo.priority === 'high' ? '높음' : todo.priority === 'medium' ? '보통' : '낮음'}</span>
      <div class="card-task-title">${escapeHtml(todo.title)}</div>
      <div class="card-footer">
        <div class="assignee-info"><span class="avatar-xs"></span> ${escapeHtml(member?.name ?? '미배정')}</div>
        <span class="dday-text">${dDay(todo.due_at)}</span>
      </div>
    </div>`;
}

function renderBoard() {
  const grid = document.querySelector('.kanban-grid');
  if (!grid) return;
  const columns = [
    { status: 'todo', label: '대기' },
    { status: 'in_progress', label: '진행 중' },
    { status: 'done', label: '완료' },
  ];
  grid.innerHTML = columns.map((column) => {
    const rows = todos.filter((todo) => todo.status === column.status);
    return `
      <div class="kanban-column" data-status="${column.status}">
        <div class="column-title-bar">
          <span class="col-name">${column.label} <span class="badge-num">${rows.length}</span></span>
          <button class="btn-add-item" data-go-todo>+</button>
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
