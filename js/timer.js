import {
  escapeHtml,
  getAppContext,
  setupShell,
  showAppAlert,
  showAppConfirm,
  showPageError,
  supabase,
} from './app-context.js';

const SESSION_SECONDS = 25 * 60;
const DAILY_GOAL_SECONDS = 4 * 60 * 60;
const dayLabels = ['월', '화', '수', '목', '금', '토', '일'];

let context;
let todos = [];
let timers = [];
let activeTimer = null;
let timerState = 'idle';
let remainingSeconds = SESSION_SECONDS;
let intervalId = null;

function localDayKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function weekStart(value = new Date()) {
  const date = new Date(value);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${minutes}분`;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

function elapsedSeconds() {
  return Math.max(0, SESSION_SECONDS - remainingSeconds);
}

function renderTimer() {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  document.querySelector('[data-timer-display]').textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const status = document.querySelector('[data-timer-status]');
  const toggle = document.querySelector('[data-timer-toggle]');
  if (timerState === 'running') {
    status.textContent = '집중 중 · 현재 세션';
    toggle.textContent = '일시정지';
  } else if (timerState === 'paused') {
    status.textContent = '일시정지 · 다시 시작할 수 있습니다';
    toggle.textContent = '계속하기';
  } else {
    status.textContent = '준비됨 · 시작 버튼을 눌러주세요';
    toggle.textContent = '시작';
  }
  const progress = document.querySelector('[data-timer-progress]');
  if (progress) {
    const circumference = 2 * Math.PI * 80;
    progress.style.strokeDasharray = `${circumference}`;
    progress.style.strokeDashoffset = `${circumference * (1 - remainingSeconds / SESSION_SECONDS)}`;
  }
  const taskSelect = document.querySelector('[data-timer-task]');
  if (taskSelect) taskSelect.disabled = timerState !== 'idle';
}

function stopInterval() {
  if (intervalId) window.clearInterval(intervalId);
  intervalId = null;
}

function runInterval() {
  stopInterval();
  intervalId = window.setInterval(async () => {
    if (timerState !== 'running') return;
    remainingSeconds = Math.max(remainingSeconds - 1, 0);
    renderTimer();
    if (remainingSeconds === 0) {
      stopInterval();
      await finishSession('completed');
      await showAppAlert('25분 집중 세션을 완료했습니다!', { title: '집중 완료' });
    }
  }, 1000);
}

async function startOrPause() {
  if (timerState === 'idle') {
    const todoId = document.querySelector('[data-timer-task]')?.value || null;
    const { data, error } = await supabase.from('timers').insert({
      team_id: context.team.id,
      user_id: context.user.id,
      todo_id: todoId,
      status: 'running',
      duration_seconds: 0,
    }).select('id, team_id, user_id, todo_id, status, started_at, ended_at, duration_seconds, created_at, updated_at').single();
    if (error) return showAppAlert(error.message, { title: '타이머 시작 실패' });
    activeTimer = data;
    timerState = 'running';
    runInterval();
  } else if (timerState === 'running') {
    const { error } = await supabase.from('timers').update({ status: 'paused', duration_seconds: elapsedSeconds() }).eq('id', activeTimer.id);
    if (error) return showAppAlert(error.message, { title: '타이머 일시정지 실패' });
    timerState = 'paused';
    stopInterval();
  } else {
    const { error } = await supabase.from('timers').update({ status: 'running', duration_seconds: elapsedSeconds() }).eq('id', activeTimer.id);
    if (error) return showAppAlert(error.message, { title: '타이머 재시작 실패' });
    timerState = 'running';
    runInterval();
  }
  renderTimer();
}

async function finishSession(status = 'completed') {
  if (!activeTimer) return;
  const { error } = await supabase.from('timers').update({
    status,
    ended_at: new Date().toISOString(),
    duration_seconds: elapsedSeconds(),
  }).eq('id', activeTimer.id);
  if (error) return showAppAlert(error.message, { title: '세션 저장 실패' });
  stopInterval();
  activeTimer = null;
  timerState = 'idle';
  remainingSeconds = SESSION_SECONDS;
  await loadTimerData();
}

async function endSession() {
  if (!activeTimer) return showAppAlert('진행 중인 세션이 없습니다.', { title: '집중 타이머' });
  const confirmed = await showAppConfirm('현재까지 집중한 시간을 저장하고 세션을 종료할까요?', { title: '세션 종료', confirmText: '종료하기' });
  if (confirmed) await finishSession('completed');
}

async function resetTimer() {
  if (activeTimer) {
    const confirmed = await showAppConfirm('현재 세션 기록을 취소하고 타이머를 초기화할까요?', { title: '타이머 초기화', confirmText: '초기화', danger: true });
    if (!confirmed) return;
    const { error } = await supabase.from('timers').update({ status: 'canceled', ended_at: new Date().toISOString(), duration_seconds: elapsedSeconds() }).eq('id', activeTimer.id);
    if (error) return showAppAlert(error.message, { title: '초기화 실패' });
  }
  stopInterval();
  activeTimer = null;
  timerState = 'idle';
  remainingSeconds = SESSION_SECONDS;
  renderTimer();
  await loadTimerData();
}

function renderTasks() {
  const select = document.querySelector('[data-timer-task]');
  if (!select) return;
  const activeTodos = todos.filter((todo) => !['done', 'canceled'].includes(todo.status));
  select.innerHTML = '<option value="">작업 선택 안 함</option>' + activeTodos.map((todo) => `<option value="${escapeHtml(todo.id)}">${escapeHtml(todo.title)}</option>`).join('');
  if (activeTimer?.todo_id) select.value = activeTimer.todo_id;
}

function renderStatistics() {
  document.querySelector('[data-weekly-chart]').hidden = false;
  document.querySelector('[data-timer-ranking]').hidden = false;
  document.querySelector('[data-timer-feed]').hidden = false;
  const completed = timers.filter((timer) => timer.status === 'completed');
  const todayKey = localDayKey(new Date());
  const ownToday = completed.filter((timer) => timer.user_id === context.user.id && localDayKey(timer.created_at) === todayKey);
  const todaySeconds = ownToday.reduce((sum, timer) => sum + Number(timer.duration_seconds || 0), 0);
  const todayPercent = Math.min(Math.round((todaySeconds / DAILY_GOAL_SECONDS) * 100), 100);
  document.querySelector('[data-today-focus]').textContent = formatDuration(todaySeconds);
  document.querySelector('[data-today-percent]').textContent = `${todayPercent}%`;
  document.querySelector('[data-today-bar]').style.width = `${todayPercent}%`;
  document.querySelector('[data-session-count]').textContent = `오늘 완료 ${ownToday.length}회`;

  const start = weekStart();
  const weekRows = completed.filter((timer) => new Date(timer.created_at) >= start);
  const ownWeekSeconds = weekRows.filter((timer) => timer.user_id === context.user.id).reduce((sum, timer) => sum + Number(timer.duration_seconds || 0), 0);
  document.querySelector('[data-week-focus]').textContent = `이번 주 ${formatDuration(ownWeekSeconds)}`;

  const daily = dayLabels.map((_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = localDayKey(date);
    return weekRows.filter((timer) => timer.user_id === context.user.id && localDayKey(timer.created_at) === key).reduce((sum, timer) => sum + Number(timer.duration_seconds || 0), 0);
  });
  const maxDaily = Math.max(...daily, 1);
  document.querySelector('[data-weekly-chart]').innerHTML = daily.map((seconds, index) => `<div class="chart-bar-item ${localDayKey(new Date()) === localDayKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)) ? 'active' : ''}"><div class="bar-fill" style="height:${Math.max(Math.round((seconds / maxDaily) * 100), seconds ? 8 : 0)}%"></div><span class="day-label">${dayLabels[index]}</span></div>`).join('');

  const ranking = context.members.map((member) => ({
    ...member,
    seconds: weekRows.filter((timer) => timer.user_id === member.userId).reduce((sum, timer) => sum + Number(timer.duration_seconds || 0), 0),
  })).sort((a, b) => b.seconds - a.seconds);
  document.querySelector('[data-timer-ranking]').innerHTML = ranking.length ? ranking.map((member, index) => `<li class="rank-item"><span class="rank-num">${index + 1}</span><span class="avatar-circle avatar-sm"></span><span class="rank-name">${escapeHtml(member.name)}</span><span class="rank-time">${formatDuration(member.seconds)}</span></li>`).join('') : '<li class="empty-state">팀원 기록이 없습니다.</li>';

  const feed = document.querySelector('[data-timer-feed]');
  if (feed) feed.innerHTML = '<div class="empty-state">완료한 집중 세션의 작업 인증 기능은 다음 단계에서 연결됩니다.</div>';
}

async function loadTimerData() {
  const [{ data: todoRows, error: todoError }, { data: timerRows, error: timerError }] = await Promise.all([
    supabase.from('todos').select('id, title, status').eq('team_id', context.team.id).order('created_at'),
    supabase.from('timers').select('id, team_id, user_id, todo_id, status, started_at, ended_at, duration_seconds, created_at, updated_at').eq('team_id', context.team.id).order('created_at', { ascending: false }).limit(500),
  ]);
  if (todoError) throw todoError;
  if (timerError) throw timerError;
  todos = todoRows ?? [];
  timers = timerRows ?? [];
  activeTimer = timers.find((timer) => timer.user_id === context.user.id && ['running', 'paused'].includes(timer.status)) ?? null;
  if (activeTimer) {
    let elapsed = Number(activeTimer.duration_seconds || 0);
    if (activeTimer.status === 'running') elapsed += Math.max(0, Math.floor((Date.now() - new Date(activeTimer.updated_at).getTime()) / 1000));
    remainingSeconds = Math.max(SESSION_SECONDS - elapsed, 0);
    timerState = activeTimer.status;
    if (timerState === 'running' && remainingSeconds > 0) runInterval();
  } else {
    timerState = 'idle';
    remainingSeconds = SESSION_SECONDS;
  }
  renderTasks();
  renderStatistics();
  renderTimer();
}

async function initialize() {
  document.querySelector('[data-timer-display]').textContent = '25:00';
  document.querySelector('[data-today-focus]').textContent = '0분';
  document.querySelector('[data-week-focus]').textContent = '이번 주 0분';
  document.querySelector('[data-timer-ranking]').innerHTML = '<li class="empty-state">기록을 불러오는 중입니다.</li>';
  document.querySelector('[data-timer-feed]').innerHTML = '<div class="empty-state">기록을 불러오는 중입니다.</div>';
  try {
    context = await getAppContext();
    if (!context) return;
    setupShell(context);
    document.querySelector('[data-timer-toggle]').addEventListener('click', startOrPause);
    document.querySelector('[data-timer-end]').addEventListener('click', endSession);
    document.querySelector('[data-timer-reset]').addEventListener('click', resetTimer);
    await loadTimerData();
  } catch (error) {
    showPageError(error);
  }
}

window.addEventListener('beforeunload', stopInterval);
initialize();
