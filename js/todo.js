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
let collaboratorMap = new Map();

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
  const collaboratorNames = (collaboratorMap.get(todo.id) ?? [])
    .map((userId) => memberMap.get(userId)?.name)
    .filter(Boolean);
  const assigneeText = [memberMap.get(todo.assignee_id)?.name, ...collaboratorNames]
    .filter(Boolean).join(', ') || '미배정';
  return `
    <div class="todo-item-row ${done ? 'done' : ''}" data-todo-id="${todo.id}">
      <div class="col-task">
        <input type="checkbox" id="todo-${todo.id}" ${done ? 'checked' : ''}>
        <label for="todo-${todo.id}">${escapeHtml(todo.title)}</label>
        ${todo.details ? `<div class="todo-details">${escapeHtml(todo.details)}</div>` : ''}
        ${todo.requires_evidence ? '<span class="evidence-required">증빙 파일 필수</span>' : ''}
      </div>
      <div class="col-assignee"><span class="user-chip"><span class="avatar-sm"></span> ${escapeHtml(assigneeText)}</span></div>
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
      const todo = todos.find((item) => item.id === id);
      if (checkbox.checked && todo?.requires_evidence) {
        const completed = await uploadEvidence(todo);
        if (!completed) {
          checkbox.checked = false;
          return;
        }
      }
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

function chooseEvidenceFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.png,.jpg,.jpeg,.webp,.pdf,.docx,.xlsx,.pptx';
    input.hidden = true;
    document.body.append(input);
    input.addEventListener('change', () => {
      const file = input.files?.[0] ?? null;
      input.remove();
      resolve(file);
    }, { once: true });
    input.click();
    window.setTimeout(() => {
      if (document.body.contains(input) && !input.files?.length) {
        input.remove();
        resolve(null);
      }
    }, 60000);
  });
}

async function uploadEvidence(todo) {
  const file = await chooseEvidenceFile();
  if (!file) return false;
  if (file.size > 20 * 1024 * 1024) {
    window.alert('증빙 파일은 최대 20MB까지 업로드할 수 있습니다.');
    return false;
  }
  const extension = file.name.includes('.') ? `.${file.name.split('.').pop()}` : '';
  const storagePath = `${context.team.id}/${context.user.id}/evidence/${crypto.randomUUID()}${extension}`;
  const { error: uploadError } = await supabase.storage.from('team-files')
    .upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (uploadError) {
    window.alert(uploadError.message);
    return false;
  }
  const { data: record, error: recordError } = await supabase.from('files').insert({
    team_id: context.team.id,
    uploaded_by: context.user.id,
    original_name: file.name,
    storage_path: storagePath,
    mime_type: file.type || 'application/octet-stream',
    size_bytes: file.size,
    kind: 'evidence',
  }).select('id').single();
  if (recordError) {
    await supabase.storage.from('team-files').remove([storagePath]);
    window.alert(recordError.message);
    return false;
  }
  const { error: evidenceError } = await supabase.from('todo_evidence').upsert({
    todo_id: todo.id,
    file_id: record.id,
    submitted_by: context.user.id,
  });
  if (evidenceError) {
    await supabase.from('files').delete().eq('id', record.id);
    await supabase.storage.from('team-files').remove([storagePath]);
    window.alert(evidenceError.message);
    return false;
  }
  return true;
}

async function loadTodos() {
  const { data, error } = await supabase
    .from('todos')
    .select('id, title, description, details, requires_evidence, status, priority, due_at, assignee_id, position, created_at')
    .eq('team_id', context.team.id)
    .order('position')
    .order('created_at');
  if (error) throw error;
  todos = data ?? [];
  collaboratorMap = new Map();
  if (todos.length) {
    const { data: collaborators, error: collaboratorError } = await supabase
      .from('todo_collaborators').select('todo_id, user_id').in('todo_id', todos.map((todo) => todo.id));
    if (collaboratorError) throw collaboratorError;
    (collaborators ?? []).forEach((row) => {
      const ids = collaboratorMap.get(row.todo_id) ?? [];
      ids.push(row.user_id);
      collaboratorMap.set(row.todo_id, ids);
    });
  }
  render();
}

function configureForm() {
  const formBox = document.querySelector('.add-form');
  const titleInput = formBox?.querySelector('[data-todo-title]');
  const detailsInput = formBox?.querySelector('[data-todo-details]');
  const assigneeSelect = formBox?.querySelector('[data-todo-assignee]');
  const dueInput = formBox?.querySelector('[data-todo-date]');
  const collaboratorSelect = formBox?.querySelector('[data-todo-collaborators]');
  const evidenceInput = formBox?.querySelector('[data-todo-evidence]');
  const submitButton = formBox?.querySelector('.btn-submit-add');
  if (!titleInput || !assigneeSelect || !dueInput || !collaboratorSelect || !submitButton) return;

  assigneeSelect.innerHTML = '<option value="">담당자 없음</option>' + context.members
    .map((member) => `<option value="${member.userId}">${escapeHtml(member.name)}</option>`)
    .join('');
  assigneeSelect.value = context.user.id;
  collaboratorSelect.innerHTML = context.members
    .map((member) => `<option value="${member.userId}">${escapeHtml(member.name)}</option>`).join('');

  submitButton.addEventListener('click', async () => {
    const title = titleInput.value.trim();
    if (!title) return window.alert('할 일을 입력해 주세요.');
    let dueAt = null;
    if (dueInput.value) {
      const date = new Date(`${dueInput.value}T23:59:00`);
      dueAt = date.toISOString();
    }
    const collaboratorIds = [...collaboratorSelect.selectedOptions]
      .map((option) => option.value)
      .filter((userId) => userId && userId !== assigneeSelect.value);
    submitButton.disabled = true;
    const { data: createdTodo, error } = await supabase.from('todos').insert({
      team_id: context.team.id,
      title,
      description: detailsInput?.value.trim() || null,
      details: detailsInput?.value.trim() || null,
      assignee_id: assigneeSelect.value || null,
      due_at: dueAt,
      priority: 'medium',
      requires_evidence: Boolean(evidenceInput?.checked),
      created_by: context.user.id,
      position: todos.length,
    }).select('id').single();
    submitButton.disabled = false;
    if (error) return window.alert(error.message);
    if (collaboratorIds.length) {
      const { error: collaboratorError } = await supabase.from('todo_collaborators').insert(
        collaboratorIds.map((userId) => ({ todo_id: createdTodo.id, user_id: userId })),
      );
      if (collaboratorError) return window.alert(collaboratorError.message);
    }
    titleInput.value = '';
    if (detailsInput) detailsInput.value = '';
    dueInput.value = '';
    [...collaboratorSelect.options].forEach((option) => { option.selected = false; });
    if (evidenceInput) evidenceInput.checked = false;
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
    if (banner) banner.innerHTML = '<span>자동</span> 우선순위와 마감일을 기준으로 정렬했습니다.';
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
