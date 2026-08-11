import {
  escapeHtml,
  formatDate,
  getAppContext,
  setupShell,
  showPageError,
  supabase,
} from './app-context.js';

const priorityLabel = { urgent: '긴급', high: '높음', medium: '보통', low: '낮음' };
const priorityClass = { urgent: 'high', high: 'high', medium: 'mid', low: 'low' };
const priorityScore = { urgent: 4, high: 3, medium: 2, low: 1 };
const statusLabel = { todo: '대기', in_progress: '진행 중', done: '완료', canceled: '취소' };

let context;
let todos = [];
let activeFilter = '전체';
let aiSorted = false;

function dueDateLabel(value) {
  if (!value) return '마감일 없음';
  const due = new Date(value);
  const days = Math.ceil((due.getTime() - Date.now()) / 86400000);
  const suffix = days === 0 ? '오늘' : days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;
  return `${formatDate(value)} (${suffix})`;
}

function filteredTodos() {
  let rows = todos.filter((todo) => todo.status !== 'canceled');
  if (activeFilter === '내 할 일') rows = rows.filter((todo) => todo.assignee_id === context.user.id);
  if (activeFilter === '팀 할 일') rows = rows.filter((todo) => todo.assignee_id !== context.user.id);
  if (aiSorted) {
    rows = [...rows].sort((a, b) => {
      const score = priorityScore[b.priority] - priorityScore[a.priority];
      if (score !== 0) return score;
      return new Date(a.due_at ?? '9999-12-31') - new Date(b.due_at ?? '9999-12-31');
    });
  }
  return rows;
}

function todoRow(todo, memberMap) {
  const done = todo.status === 'done';
  const statusClass = done ? 'completed' : todo.status === 'in_progress' ? 'in-progress' : 'pending';
  return `
    <div class="todo-item-row ${done ? 'done' : ''}" data-todo-id="${todo.id}">
      <div class="col-task">
        <input type="checkbox" id="todo-${todo.id}" ${done ? 'checked' : ''}>
        <label for="todo-${todo.id}">${escapeHtml(todo.title)}</label>
      </div>
      <div class="col-assignee"><span class="user-chip"><span class="avatar-sm"></span> ${escapeHtml(memberMap.get(todo.assignee_id)?.name ?? '미배정')}</span></div>
      <div class="col-duedate">${dueDateLabel(todo.due_at)}</div>
      <div class="col-priority"><span class="pill-priority ${priorityClass[todo.priority]}">${priorityLabel[todo.priority]}</span></div>
      <div class="col-status">
        <span class="status-pill ${statusClass}">${statusLabel[todo.status]}</span>
        <button type="button" class="todo-delete-btn" data-delete-id="${todo.id}">삭제</button>
      </div>
    </div>`;
}

function render() {
  const card = document.querySelector('.todo-list-card');
  if (!card) return;
  card.querySelectorAll('.todo-group').forEach((group) => group.remove());
  const rows = filteredTodos();
  const memberMap = new Map(context.members.map((member) => [member.userId, member]));
  const active = rows.filter((todo) => todo.status !== 'done');
  const done = rows.filter((todo) => todo.status === 'done');

  const groups = [
    { title: `진행할 일 · ${active.length}건`, rows: active },
    { title: `완료 · ${done.length}건`, rows: done },
  ];
  const fragment = document.createDocumentFragment();
  groups.forEach((group) => {
    const element = document.createElement('div');
    element.className = 'todo-group';
    element.innerHTML = `<div class="group-title">${group.title}</div>${
      group.rows.length
        ? group.rows.map((todo) => todoRow(todo, memberMap)).join('')
        : '<div class="empty-state">표시할 할 일이 없습니다.</div>'
    }`;
    fragment.append(element);
  });
  card.append(fragment);

  card.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener('change', async () => {
      const id = checkbox.closest('[data-todo-id]').dataset.todoId;
      const { error } = await supabase.from('todos').update({ status: checkbox.checked ? 'done' : 'todo' }).eq('id', id);
      if (error) return window.alert(error.message);
      await loadTodos();
    });
  });
  card.querySelectorAll('[data-delete-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('이 할 일을 삭제할까요?')) return;
      const { error } = await supabase.from('todos').delete().eq('id', button.dataset.deleteId);
      if (error) return window.alert(error.message);
      await loadTodos();
    });
  });

  const mine = todos.filter((todo) => todo.assignee_id === context.user.id && todo.status !== 'canceled');
  const mineDone = mine.filter((todo) => todo.status === 'done').length;
  const rate = mine.length ? Math.round((mineDone / mine.length) * 100) : 0;
  const rateElement = document.querySelector('.rate-percent');
  const fractionElement = document.querySelector('.rate-fraction');
  const barElement = document.querySelector('.completion-rate-box .bar-fill');
  if (rateElement) rateElement.textContent = `${rate}%`;
  if (fractionElement) fractionElement.textContent = `${mineDone}/${mine.length}`;
  if (barElement) barElement.style.width = `${rate}%`;
}

async function loadTodos() {
  const { data, error } = await supabase
    .from('todos')
    .select('id, title, description, status, priority, due_at, assignee_id, position, created_at')
    .eq('team_id', context.team.id)
    .order('position')
    .order('created_at');
  if (error) throw error;
  todos = data ?? [];
  render();
}

function configureForm() {
  const formBox = document.querySelector('.add-form');
  const titleInput = formBox?.querySelector('.form-input');
  const selects = formBox?.querySelectorAll('.form-select');
  const assigneeSelect = selects?.[0];
  const dueSelect = selects?.[1];
  const submitButton = formBox?.querySelector('.btn-submit-add');
  if (!titleInput || !assigneeSelect || !dueSelect || !submitButton) return;

  assigneeSelect.innerHTML = '<option value="">담당자 없음</option>' + context.members
    .map((member) => `<option value="${member.userId}">${escapeHtml(member.name)}</option>`)
    .join('');
  assigneeSelect.value = context.user.id;
  dueSelect.innerHTML = `
    <option value="">마감일 없음</option>
    <option value="today">오늘</option>
    <option value="tomorrow">내일</option>
    <option value="week">일주일 후</option>`;

  submitButton.addEventListener('click', async () => {
    const title = titleInput.value.trim();
    if (!title) return window.alert('할 일을 입력해 주세요.');
    let dueAt = null;
    if (dueSelect.value) {
      const date = new Date();
      if (dueSelect.value === 'tomorrow') date.setDate(date.getDate() + 1);
      if (dueSelect.value === 'week') date.setDate(date.getDate() + 7);
      date.setHours(23, 59, 0, 0);
      dueAt = date.toISOString();
    }
    submitButton.disabled = true;
    const { error } = await supabase.from('todos').insert({
      team_id: context.team.id,
      title,
      assignee_id: assigneeSelect.value || null,
      due_at: dueAt,
      priority: 'medium',
      created_by: context.user.id,
      position: todos.length,
    });
    submitButton.disabled = false;
    if (error) return window.alert(error.message);
    titleInput.value = '';
    await loadTodos();
  });
}

function configureFilters() {
  document.querySelectorAll('.tab-btn').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      activeFilter = button.textContent.trim();
      render();
    });
  });
  document.querySelector('.btn-ai-sort')?.addEventListener('click', () => {
    aiSorted = true;
    const banner = document.querySelector('.ai-banner-text');
    if (banner) banner.innerHTML = '<span>AI</span> 우선순위와 마감일을 기준으로 정렬했습니다.';
    render();
  });
  document.querySelector('.ai-reset-link')?.addEventListener('click', (event) => {
    event.preventDefault();
    aiSorted = false;
    render();
  });
}

async function initialize() {
  try {
    context = await getAppContext();
    if (!context) return;
    setupShell(context);
    configureForm();
    configureFilters();
    await loadTodos();
  } catch (error) {
    showPageError(error);
  }
}

initialize();
