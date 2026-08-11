import { supabase } from './supabase-client.js';

const profileName = document.querySelector('[data-profile-name]');
const profileEmail = document.querySelector('[data-profile-email]');
const statusElement = document.querySelector('[data-dashboard-status]');
const teamSelect = document.querySelector('[data-team-select]');
const teamForm = document.querySelector('[data-team-form]');
const teamGuide = document.querySelector('[data-team-guide]');
const todoSection = document.querySelector('[data-todo-section]');
const todoForm = document.querySelector('[data-todo-form]');
const todoList = document.querySelector('[data-todo-list]');
const todoEmpty = document.querySelector('[data-todo-empty]');

let currentUser;
let currentTeamId;
let todoChannel;

function setStatus(message, type = '') {
  statusElement.textContent = message;
  statusElement.className = `connection-status ${type}`.trim();
  statusElement.hidden = !message;
}

async function loadTodos() {
  if (!currentTeamId) return;
  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .eq('team_id', currentTeamId)
    .order('position')
    .order('created_at');

  if (error) {
    setStatus(`할 일 조회 실패: ${error.message}`, 'error');
    return;
  }

  todoList.replaceChildren();
  todoEmpty.hidden = data.length > 0;

  for (const todo of data) {
    const item = document.createElement('li');
    item.className = `todo-item ${todo.status === 'done' ? 'done' : ''}`;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = todo.status === 'done';
    checkbox.setAttribute('aria-label', `${todo.title} 완료`);
    checkbox.addEventListener('change', async () => {
      const { error: updateError } = await supabase
        .from('todos')
        .update({ status: checkbox.checked ? 'done' : 'todo' })
        .eq('id', todo.id);
      if (updateError) setStatus(`완료 상태 변경 실패: ${updateError.message}`, 'error');
    });

    const content = document.createElement('div');
    content.className = 'todo-content';
    const title = document.createElement('strong');
    title.textContent = todo.title;
    content.append(title);
    if (todo.due_at) {
      const due = document.createElement('small');
      due.textContent = `마감 ${new Date(todo.due_at).toLocaleString('ko-KR')}`;
      content.append(due);
    }

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'todo-delete';
    deleteButton.textContent = '삭제';
    deleteButton.addEventListener('click', async () => {
      const { error: deleteError } = await supabase.from('todos').delete().eq('id', todo.id);
      if (deleteError) setStatus(`삭제 실패: ${deleteError.message}`, 'error');
    });

    item.append(checkbox, content, deleteButton);
    todoList.append(item);
  }
}

async function selectTeam(teamId) {
  currentTeamId = teamId || null;
  todoSection.hidden = !currentTeamId;
  if (!currentTeamId) return;

  if (todoChannel) await supabase.removeChannel(todoChannel);
  todoChannel = supabase
    .channel(`todos:${currentTeamId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'todos', filter: `team_id=eq.${currentTeamId}` }, loadTodos)
    .subscribe();

  await loadTodos();
}

async function loadTeams(preferredTeamId) {
  const { data, error } = await supabase
    .from('team_members')
    .select('team_id, role, team:teams(id, name)')
    .eq('user_id', currentUser.id)
    .order('joined_at');

  if (error) {
    setStatus(`팀 조회 실패: ${error.message}`, 'error');
    return;
  }

  teamSelect.replaceChildren();
  const teams = data.map((row) => Array.isArray(row.team) ? row.team[0] : row.team).filter(Boolean);
  teamGuide.hidden = teams.length > 0;

  if (teams.length === 0) {
    const option = document.createElement('option');
    option.textContent = '참여 중인 팀 없음';
    option.value = '';
    teamSelect.append(option);
    await selectTeam(null);
    return;
  }

  for (const team of teams) {
    const option = document.createElement('option');
    option.value = team.id;
    option.textContent = team.name;
    teamSelect.append(option);
  }

  const selected = teams.some((team) => team.id === preferredTeamId) ? preferredTeamId : teams[0].id;
  teamSelect.value = selected;
  await selectTeam(selected);
}

teamSelect.addEventListener('change', () => selectTeam(teamSelect.value));

teamForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(teamForm);
  const { data: team, error } = await supabase
    .from('teams')
    .insert({ name: data.get('team_name').trim(), owner_id: currentUser.id })
    .select()
    .single();

  if (error) {
    setStatus(`팀 생성 실패: ${error.message}`, 'error');
    return;
  }

  teamForm.reset();
  setStatus('팀이 생성되었습니다.', 'success');
  await loadTeams(team.id);
});

todoForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(todoForm);
  const dueValue = data.get('due_at');
  const { error } = await supabase.from('todos').insert({
    team_id: currentTeamId,
    title: data.get('title').trim(),
    due_at: dueValue ? new Date(dueValue).toISOString() : null,
    created_by: currentUser.id,
  });

  if (error) {
    setStatus(`할 일 등록 실패: ${error.message}`, 'error');
    return;
  }

  todoForm.reset();
  setStatus('할 일이 등록되었습니다.', 'success');
});

document.querySelector('[data-logout]').addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.replace('./login.html');
});

async function initialize() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    window.location.replace('./login.html');
    return;
  }

  currentUser = user;
  profileEmail.textContent = user.email;

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();
  profileName.textContent = profile?.display_name || user.user_metadata?.display_name || '팀가치 사용자';

  setStatus('');
  await loadTeams();
  window.lucide?.createIcons();
}

initialize();
