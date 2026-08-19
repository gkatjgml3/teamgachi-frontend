import {
  escapeHtml,
  getAppContext,
  profileColorStyle,
  setupShell,
  showAppAlert,
  showAppConfirm,
  showAppForm,
  showPageError,
  supabase,
} from './app-context.js';

const DEFAULT_SESSION_SECONDS = 25 * 60;
const DAILY_GOAL_SECONDS = 4 * 60 * 60;
const dayLabels = ['월', '화', '수', '목', '금', '토', '일'];

let context;
let todos = [];
let timers = [];
let certifications = [];
let certificationLikes = [];
let certificationFiles = new Map();
let activeTimer = null;
let timerState = 'idle';
let timerMode = 'countdown';
let sessionSeconds = DEFAULT_SESSION_SECONDS;
let remainingSeconds = sessionSeconds;
let intervalId = null;
let accumulatedSeconds = 0;
let runningStartedAtMs = null;
let timerTickPending = false;

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
  if (!activeTimer) return timerMode === 'stopwatch' ? 0 : Math.max(0, sessionSeconds - remainingSeconds);
  const runningSeconds = timerState === 'running' && Number.isFinite(runningStartedAtMs)
    ? Math.max(0, Math.floor((Date.now() - runningStartedAtMs) / 1000))
    : 0;
  const elapsed = Math.max(0, accumulatedSeconds + runningSeconds);
  return timerMode === 'stopwatch' ? elapsed : Math.min(sessionSeconds, elapsed);
}

function syncRemainingFromClock() {
  if (!activeTimer) return;
  remainingSeconds = timerMode === 'stopwatch' ? 0 : Math.max(sessionSeconds - elapsedSeconds(), 0);
}

function formatTimerClock(totalSeconds) {
  const value = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  if (hours) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function renderTimer() {
  const displaySeconds = timerMode === 'stopwatch' ? elapsedSeconds() : remainingSeconds;
  document.querySelector('[data-timer-display]').textContent = formatTimerClock(displaySeconds);
  const status = document.querySelector('[data-timer-status]');
  const toggle = document.querySelector('[data-timer-toggle]');
  const endButton = document.querySelector('[data-timer-end]');
  if (timerState === 'running') {
    status.textContent = timerMode === 'stopwatch' ? '시간 기록 중 · 종료할 때까지 계속됩니다' : '집중 중 · 현재 세션';
    toggle.textContent = '일시정지';
  } else if (timerState === 'paused') {
    status.textContent = timerMode === 'stopwatch' ? '시간 기록 일시정지 · 다시 시작할 수 있습니다' : '일시정지 · 다시 시작할 수 있습니다';
    toggle.textContent = '계속하기';
  } else {
    status.textContent = timerMode === 'stopwatch' ? '기록 준비됨 · 시작 후 기록 종료를 눌러주세요' : '준비됨 · 시작 버튼을 눌러주세요';
    toggle.textContent = '시작';
  }
  if (endButton) endButton.textContent = timerMode === 'stopwatch' ? '기록 종료' : '세션 종료';
  const progress = document.querySelector('[data-timer-progress]');
  if (progress) {
    const circumference = 2 * Math.PI * 80;
    progress.style.strokeDasharray = `${circumference}`;
    progress.style.strokeDashoffset = timerMode === 'stopwatch'
      ? '0'
      : `${circumference * (1 - remainingSeconds / sessionSeconds)}`;
  }
  const taskSelect = document.querySelector('[data-timer-task]');
  if (taskSelect) taskSelect.disabled = timerState !== 'idle';
  const durationSelect = document.querySelector('[data-timer-duration]');
  const durationControl = document.querySelector('[data-timer-duration-control]');
  if (durationSelect) {
    durationSelect.hidden = timerMode === 'stopwatch';
    durationSelect.disabled = timerState !== 'idle' || timerMode === 'stopwatch';
    durationSelect.value = String(sessionSeconds);
  }
  if (durationControl) durationControl.hidden = timerMode === 'stopwatch';
  const modeSelect = document.querySelector('[data-timer-mode]');
  if (modeSelect) {
    modeSelect.disabled = timerState !== 'idle';
    modeSelect.value = timerMode;
  }
  const durationLabel = document.querySelector('[data-timer-duration-label]');
  if (durationLabel) durationLabel.textContent = timerMode === 'stopwatch' ? '시간 기록' : `뽀모도로 ${Math.round(sessionSeconds / 60)}분`;
}

function stopInterval() {
  if (intervalId) window.clearInterval(intervalId);
  intervalId = null;
}

async function tickTimer() {
  if (timerTickPending || timerState !== 'running' || !activeTimer) return;
  timerTickPending = true;
  try {
    syncRemainingFromClock();
    renderTimer();
    if (timerMode === 'countdown' && remainingSeconds === 0) {
      stopInterval();
      await finishSession('completed');
      await showAppAlert(`${Math.round(sessionSeconds / 60)}분 집중 세션을 완료했습니다. 작업 인증 피드에 사진을 올릴 수 있어요.`, { title: '집중 완료' });
    }
  } finally {
    timerTickPending = false;
  }
}

function runInterval() {
  stopInterval();
  void tickTimer();
  intervalId = window.setInterval(() => void tickTimer(), 1000);
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
      target_seconds: sessionSeconds,
      mode: timerMode,
    }).select('id, team_id, user_id, todo_id, status, mode, started_at, ended_at, duration_seconds, target_seconds, created_at, updated_at').single();
    if (error) return showAppAlert(error.message, { title: '타이머 시작 실패' });
    activeTimer = data;
    timerState = 'running';
    accumulatedSeconds = 0;
    runningStartedAtMs = new Date(data.updated_at ?? data.started_at ?? Date.now()).getTime();
    runInterval();
  } else if (timerState === 'running') {
    const elapsed = elapsedSeconds();
    const { data, error } = await supabase.from('timers')
      .update({ status: 'paused', duration_seconds: elapsed })
      .eq('id', activeTimer.id)
      .select('status, duration_seconds, updated_at')
      .single();
    if (error) return showAppAlert(error.message, { title: '타이머 일시정지 실패' });
    activeTimer = { ...activeTimer, ...data };
    timerState = 'paused';
    accumulatedSeconds = elapsed;
    runningStartedAtMs = null;
    stopInterval();
  } else {
    const elapsed = elapsedSeconds();
    const { data, error } = await supabase.from('timers')
      .update({ status: 'running', duration_seconds: elapsed })
      .eq('id', activeTimer.id)
      .select('status, duration_seconds, updated_at')
      .single();
    if (error) return showAppAlert(error.message, { title: '타이머 재시작 실패' });
    activeTimer = { ...activeTimer, ...data };
    timerState = 'running';
    accumulatedSeconds = elapsed;
    runningStartedAtMs = new Date(data.updated_at ?? Date.now()).getTime();
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
  accumulatedSeconds = 0;
  runningStartedAtMs = null;
  remainingSeconds = sessionSeconds;
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
  accumulatedSeconds = 0;
  runningStartedAtMs = null;
  remainingSeconds = sessionSeconds;
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
  const ownToday = completed.filter((timer) => timer.user_id === context.user.id && localDayKey(timer.started_at ?? timer.created_at) === todayKey);
  const todaySeconds = ownToday.reduce((sum, timer) => sum + Number(timer.duration_seconds || 0), 0);
  const todayPercent = Math.min(Math.round((todaySeconds / DAILY_GOAL_SECONDS) * 100), 100);
  document.querySelector('[data-today-focus]').textContent = formatDuration(todaySeconds);
  document.querySelector('[data-today-percent]').textContent = `${todayPercent}%`;
  document.querySelector('[data-today-bar]').style.width = `${todayPercent}%`;
  document.querySelector('[data-session-count]').textContent = `오늘 완료 ${ownToday.length}회`;

  const start = weekStart();
  const weekRows = completed.filter((timer) => new Date(timer.started_at ?? timer.created_at) >= start);
  const ownWeekSeconds = weekRows.filter((timer) => timer.user_id === context.user.id).reduce((sum, timer) => sum + Number(timer.duration_seconds || 0), 0);
  document.querySelector('[data-week-focus]').textContent = `이번 주 ${formatDuration(ownWeekSeconds)}`;

  const daily = dayLabels.map((_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = localDayKey(date);
    return weekRows.filter((timer) => timer.user_id === context.user.id && localDayKey(timer.started_at ?? timer.created_at) === key).reduce((sum, timer) => sum + Number(timer.duration_seconds || 0), 0);
  });
  const maxDaily = Math.max(...daily, 1);
  document.querySelector('[data-weekly-chart]').innerHTML = daily.map((seconds, index) => `<div class="chart-bar-item ${localDayKey(new Date()) === localDayKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)) ? 'active' : ''}"><div class="bar-fill" style="height:${Math.max(Math.round((seconds / maxDaily) * 100), seconds ? 8 : 0)}%"></div><span class="day-label">${dayLabels[index]}</span></div>`).join('');

  const ranking = context.members.map((member) => ({
    ...member,
    seconds: weekRows.filter((timer) => timer.user_id === member.userId).reduce((sum, timer) => sum + Number(timer.duration_seconds || 0), 0),
  })).sort((a, b) => b.seconds - a.seconds);
  document.querySelector('[data-timer-ranking]').innerHTML = ranking.length ? ranking.map((member, index) => `<li class="rank-item"><span class="rank-num">${index + 1}</span><span class="avatar-circle avatar-sm" style="${profileColorStyle(member.userId)}"></span><span class="rank-name">${escapeHtml(member.name)}</span><span class="rank-time">${formatDuration(member.seconds)}</span></li>`).join('') : '<li class="empty-state">팀원 기록이 없습니다.</li>';

  renderCertificationFeed();
}

function relativeTime(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return '방금 전';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
  return `${Math.floor(seconds / 86400)}일 전`;
}

function renderCertificationFeed() {
  const feed = document.querySelector('[data-timer-feed]');
  if (!feed) return;
  const timerMap = new Map(timers.map((timer) => [timer.id, timer]));
  const todoMap = new Map(todos.map((todo) => [todo.id, todo]));
  const memberMap = new Map(context.members.map((member) => [member.userId, member]));
  feed.innerHTML = certifications.length ? certifications.map((certification) => {
    const timer = timerMap.get(certification.timer_id);
    const file = certificationFiles.get(certification.file_id);
    const likes = certificationLikes.filter((like) => like.certification_id === certification.id);
    const liked = likes.some((like) => like.user_id === context.user.id);
    const userName = memberMap.get(certification.user_id)?.name ?? '팀원';
    const taskName = timer?.todo_id ? todoMap.get(timer.todo_id)?.title : '';
    return `<article class="feed-item">
      ${file?.signedUrl ? `<img class="feed-image" src="${escapeHtml(file.signedUrl)}" alt="${escapeHtml(userName)}님의 작업 인증">` : '<div class="feed-img-placeholder"></div>'}
      <div class="feed-content">
        <div class="feed-user"><span class="avatar-circle avatar-sm" style="${profileColorStyle(certification.user_id)}"></span><div class="user-meta"><span class="feed-name">${escapeHtml(userName)}</span><span class="feed-time">${formatDuration(Number(timer?.duration_seconds || 0))} · ${relativeTime(certification.created_at)}</span></div></div>
        <p class="feed-desc">${escapeHtml(certification.note)}</p>
        <div class="feed-footer"><button type="button" class="btn-like ${liked ? 'active' : ''}" data-certification-like="${certification.id}">응원 ${likes.length}</button>${taskName ? `<span class="feed-session-task">${escapeHtml(taskName)}</span>` : ''}</div>
      </div>
    </article>`;
  }).join('') : '<div class="empty-state">아직 작업 인증이 없습니다. 집중 세션을 완료한 뒤 사진과 기록을 올려보세요.</div>';
}

function chooseCertificationImage() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
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

async function createCertification() {
  const usedTimerIds = new Set(certifications.map((item) => item.timer_id));
  const eligible = timers.filter((timer) => timer.user_id === context.user.id && timer.status === 'completed' && Number(timer.duration_seconds || 0) > 0 && !usedTimerIds.has(timer.id));
  if (!eligible.length) return showAppAlert('인증할 수 있는 완료 세션이 없습니다. 집중 세션을 먼저 완료해 주세요.', { title: '작업 인증' });
  const todoMap = new Map(todos.map((todo) => [todo.id, todo]));
  const values = await showAppForm({
    title: '작업 인증 올리기',
    description: '완료한 집중 세션을 선택하고 작업 내용을 적은 뒤 인증 사진을 첨부합니다.',
    fields: [
      { name: 'timerId', label: '완료 세션', type: 'select', required: true, options: eligible.map((timer) => ({ value: timer.id, label: `${formatDuration(Number(timer.duration_seconds || 0))} · ${todoMap.get(timer.todo_id)?.title ?? '작업 미선택'} · ${relativeTime(timer.ended_at ?? timer.created_at)}` })) },
      { name: 'note', label: '작업 내용', type: 'textarea', placeholder: '이번 집중 시간에 완료한 작업을 적어 주세요.', required: true },
    ],
    submitText: '사진 선택',
  });
  if (!values) return;
  const file = await chooseCertificationImage();
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return showAppAlert('PNG, JPG, WEBP 이미지만 올릴 수 있습니다.', { title: '파일 형식 확인' });
  if (file.size > 25 * 1024 * 1024) return showAppAlert('파일 크기는 25MB 이하여야 합니다.', { title: '파일 크기 확인' });
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const storagePath = `${context.team.id}/${context.user.id}/timer/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from('team-files').upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) return showAppAlert(uploadError.message, { title: '인증 사진 업로드 실패' });
  const { data: fileRow, error: fileError } = await supabase.from('files').insert({ team_id: context.team.id, uploaded_by: context.user.id, original_name: file.name, storage_path: storagePath, mime_type: file.type, size_bytes: file.size, kind: 'image' }).select('id').single();
  if (fileError) {
    await supabase.storage.from('team-files').remove([storagePath]);
    return showAppAlert(fileError.message, { title: '인증 정보 저장 실패' });
  }
  const { error } = await supabase.from('timer_certifications').insert({ team_id: context.team.id, timer_id: values.timerId, user_id: context.user.id, file_id: fileRow.id, note: values.note });
  if (error) {
    await supabase.from('files').delete().eq('id', fileRow.id);
    await supabase.storage.from('team-files').remove([storagePath]);
    return showAppAlert(error.message, { title: '작업 인증 저장 실패' });
  }
  await loadTimerData();
}

async function toggleCertificationLike(certificationId) {
  const liked = certificationLikes.some((like) => like.certification_id === certificationId && like.user_id === context.user.id);
  const query = liked
    ? supabase.from('timer_certification_likes').delete().eq('certification_id', certificationId).eq('user_id', context.user.id)
    : supabase.from('timer_certification_likes').insert({ certification_id: certificationId, user_id: context.user.id });
  const { error } = await query;
  if (error) return showAppAlert(error.message, { title: '응원 처리 실패' });
  await loadTimerData();
}

async function loadTimerData() {
  const [todoResult, timerResult, certificationResult, likeResult] = await Promise.all([
    supabase.from('todos').select('id, title, status').eq('team_id', context.team.id).order('created_at'),
    supabase.from('timers').select('id, team_id, user_id, todo_id, status, mode, started_at, ended_at, duration_seconds, target_seconds, created_at, updated_at').eq('team_id', context.team.id).order('created_at', { ascending: false }).limit(500),
    supabase.from('timer_certifications').select('id, team_id, timer_id, user_id, file_id, note, created_at').eq('team_id', context.team.id).order('created_at', { ascending: false }).limit(60),
    supabase.from('timer_certification_likes').select('certification_id, user_id'),
  ]);
  for (const result of [todoResult, timerResult, certificationResult, likeResult]) if (result.error) throw result.error;
  todos = todoResult.data ?? [];
  timers = timerResult.data ?? [];
  certifications = certificationResult.data ?? [];
  certificationLikes = likeResult.data ?? [];
  certificationFiles = new Map();
  const fileIds = [...new Set(certifications.map((item) => item.file_id))];
  if (fileIds.length) {
    const { data: fileRows, error: fileError } = await supabase.from('files').select('id, storage_path').in('id', fileIds);
    if (fileError) throw fileError;
    const paths = (fileRows ?? []).map((file) => file.storage_path);
    const { data: signedRows, error: signedError } = await supabase.storage.from('team-files').createSignedUrls(paths, 3600);
    if (signedError) throw signedError;
    (fileRows ?? []).forEach((file, index) => certificationFiles.set(file.id, { ...file, signedUrl: signedRows?.[index]?.signedUrl ?? '' }));
  }
  activeTimer = timers.find((timer) => timer.user_id === context.user.id && ['running', 'paused'].includes(timer.status)) ?? null;
  if (activeTimer) {
    sessionSeconds = Number(activeTimer.target_seconds || DEFAULT_SESSION_SECONDS);
    timerMode = activeTimer.mode === 'stopwatch' ? 'stopwatch' : 'countdown';
    accumulatedSeconds = Number(activeTimer.duration_seconds || 0);
    timerState = activeTimer.status;
    runningStartedAtMs = timerState === 'running' ? new Date(activeTimer.updated_at).getTime() : null;
    syncRemainingFromClock();
  } else {
    timerState = 'idle';
    accumulatedSeconds = 0;
    runningStartedAtMs = null;
    remainingSeconds = timerMode === 'stopwatch' ? 0 : sessionSeconds;
  }
  renderTasks();
  renderStatistics();
  renderTimer();
  if (timerState === 'running') runInterval();
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
    document.querySelector('[data-timer-mode]').addEventListener('change', (event) => {
      if (timerState !== 'idle') return;
      timerMode = event.target.value === 'stopwatch' ? 'stopwatch' : 'countdown';
      accumulatedSeconds = 0;
      remainingSeconds = timerMode === 'stopwatch' ? 0 : sessionSeconds;
      renderTimer();
    });
    document.querySelector('[data-timer-duration]').addEventListener('change', (event) => {
      if (timerState !== 'idle') return;
      sessionSeconds = Number(event.target.value || DEFAULT_SESSION_SECONDS);
      remainingSeconds = sessionSeconds;
      renderTimer();
    });
    document.querySelector('[data-timer-certify]').addEventListener('click', createCertification);
    document.querySelector('[data-timer-feed]').addEventListener('click', (event) => {
      const button = event.target.closest('[data-certification-like]');
      if (button) toggleCertificationLike(button.dataset.certificationLike);
    });
    await loadTimerData();
  } catch (error) {
    showPageError(error);
  }
}

window.addEventListener('beforeunload', stopInterval);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void tickTimer();
});
initialize();
