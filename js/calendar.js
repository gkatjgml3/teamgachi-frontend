import {
  escapeHtml,
  formatDate,
  formatTime,
  getAppContext,
  setupShell,
  showAppAlert,
  showAppDetails,
  showAppForm,
  showPageError,
  supabase,
} from './app-context.js';

let context;
let schedules = [];
let upcomingSchedules = [];
let visibleDate = new Date();
let currentView = 'month';

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value, amount) {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function dayKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dDay(value) {
  const days = Math.ceil((startOfDay(value) - startOfDay(new Date())) / 86400000);
  return days === 0 ? '오늘' : days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;
}

function viewLabel() {
  if (currentView === 'month') return `${visibleDate.getFullYear()}년 ${visibleDate.getMonth() + 1}월`;
  if (currentView === 'day') return `${visibleDate.getFullYear()}년 ${visibleDate.getMonth() + 1}월 ${visibleDate.getDate()}일`;
  const start = addDays(startOfDay(visibleDate), -visibleDate.getDay());
  const end = addDays(start, 6);
  return `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일 – ${end.getMonth() + 1}월 ${end.getDate()}일`;
}

function scheduleButton(item) {
  return `<button type="button" class="event-bar schedule-detail-trigger ${item.todo_id ? 'event-orange' : 'event-purple'}" data-schedule-id="${escapeHtml(item.id)}" title="${escapeHtml(item.title)} 상세 보기">${escapeHtml(item.title)}</button>`;
}

function schedulesByDay() {
  const byDay = new Map();
  schedules.forEach((schedule) => {
    const key = dayKey(schedule.starts_at);
    const list = byDay.get(key) ?? [];
    list.push(schedule);
    byDay.set(key, list);
  });
  return byDay;
}

function renderMonth(byDay) {
  const year = visibleDate.getFullYear();
  const month = visibleDate.getMonth();
  const first = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - first.getDay());
  const rows = [];
  for (let week = 0; week < 6; week += 1) {
    const cells = [];
    for (let day = 0; day < 7; day += 1) {
      const date = addDays(gridStart, week * 7 + day);
      const items = byDay.get(dayKey(date)) ?? [];
      const classes = [date.getMonth() !== month ? 'other-month' : '', dayKey(date) === dayKey(new Date()) ? 'today' : ''].filter(Boolean).join(' ');
      const dateMarkup = dayKey(date) === dayKey(new Date()) ? `<span class="date-num-badge">${date.getDate()}</span>` : date.getDate();
      cells.push(`<td class="${classes}" data-calendar-date="${dayKey(date)}"><button type="button" class="date-number calendar-date-button" data-open-day="${dayKey(date)}">${dateMarkup}</button>${items.slice(0, 3).map(scheduleButton).join('')}${items.length > 3 ? `<span class="calendar-more">+${items.length - 3}개</span>` : ''}</td>`);
    }
    rows.push(`<tr>${cells.join('')}</tr>`);
  }
  document.querySelector('[data-calendar-body]').innerHTML = rows.join('');
}

function renderWeek(byDay) {
  const start = addDays(startOfDay(visibleDate), -visibleDate.getDay());
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  document.querySelector('[data-calendar-agenda]').innerHTML = `<div class="week-grid">${days.map((date) => {
    const items = byDay.get(dayKey(date)) ?? [];
    return `<section class="week-day ${dayKey(date) === dayKey(new Date()) ? 'today' : ''}">
      <button type="button" class="week-day-heading" data-open-day="${dayKey(date)}"><span>${['일','월','화','수','목','금','토'][date.getDay()]}</span><strong>${date.getDate()}</strong></button>
      <div class="week-events">${items.length ? items.map((item) => `<div class="agenda-time">${formatTime(item.starts_at)}</div>${scheduleButton(item)}`).join('') : '<span class="agenda-empty">일정 없음</span>'}</div>
    </section>`;
  }).join('')}</div>`;
}

function renderDay(byDay) {
  const items = byDay.get(dayKey(visibleDate)) ?? [];
  document.querySelector('[data-calendar-agenda]').innerHTML = `<div class="day-agenda">
    <div class="day-agenda-heading"><strong>${formatDate(visibleDate, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</strong><span>${items.length}개 일정</span></div>
    <div class="day-event-list">${items.length ? items.map((item) => `<article class="day-event ${item.todo_id ? 'todo-deadline' : ''}"><time>${formatTime(item.starts_at)}</time><div>${scheduleButton(item)}<span>${item.todo_id ? '할 일 마감' : '팀 일정'}</span></div></article>`).join('') : '<div class="empty-state">이 날에 등록된 일정이 없습니다.</div>'}</div>
  </div>`;
}

function renderSummary() {
  const year = visibleDate.getFullYear();
  const month = visibleDate.getMonth();
  const monthRows = schedules.filter((item) => {
    const date = new Date(item.starts_at);
    return date.getFullYear() === year && date.getMonth() === month;
  });
  document.querySelector('[data-month-label]').textContent = `${year}.${String(month + 1).padStart(2, '0')}`;
  document.querySelector('[data-month-count]').textContent = `${monthRows.length}건`;
  document.querySelector('[data-todo-count]').textContent = `${monthRows.filter((item) => item.todo_id).length}건`;
  const upcoming = document.querySelector('[data-upcoming]');
  upcoming.innerHTML = upcomingSchedules.length ? upcomingSchedules.map((item) => `<button type="button" class="dday-item schedule-detail-trigger ${item.todo_id ? 'warning' : 'info'}" data-schedule-id="${escapeHtml(item.id)}" title="${escapeHtml(item.title)} 상세 보기"><span><span class="dday-title">${escapeHtml(item.title)}</span><span class="dday-date">${formatDate(item.starts_at)}</span></span><span class="badge-dday">${dDay(item.starts_at)}</span></button>`).join('') : '<div class="empty-state">다가오는 일정이나 할 일 마감이 없습니다.</div>';
}

function renderCalendar() {
  document.querySelector('.current-month-text').textContent = viewLabel();
  document.querySelectorAll('[data-calendar-view]').forEach((button) => {
    const active = button.dataset.calendarView === currentView;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const table = document.querySelector('[data-calendar-table]');
  const agenda = document.querySelector('[data-calendar-agenda]');
  table.hidden = currentView !== 'month';
  agenda.hidden = currentView === 'month';
  const byDay = schedulesByDay();
  if (currentView === 'month') renderMonth(byDay);
  if (currentView === 'week') renderWeek(byDay);
  if (currentView === 'day') renderDay(byDay);
  renderSummary();
}

function showScheduleDetails(scheduleId) {
  const schedule = schedules.find((item) => item.id === scheduleId);
  if (!schedule) return;
  const dateText = formatDate(schedule.starts_at, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  const timeText = schedule.ends_at ? `${formatTime(schedule.starts_at)} ~ ${formatTime(schedule.ends_at)}` : formatTime(schedule.starts_at);
  showAppDetails({
    title: '일정 상세',
    heading: schedule.title,
    badge: schedule.todo_id ? '할 일 마감' : '팀 일정',
    rows: [
      { label: '날짜', value: dateText },
      { label: '시간', value: timeText },
      { label: '구분', value: schedule.todo_id ? '할 일에서 연동된 마감 일정' : '직접 등록한 팀 일정' },
      { label: '남은 기간', value: dDay(schedule.starts_at) },
    ],
  });
}

function configureScheduleDetails() {
  document.querySelector('.content-body')?.addEventListener('click', (event) => {
    const dayTrigger = event.target.closest('[data-open-day]');
    if (dayTrigger) {
      visibleDate = new Date(`${dayTrigger.dataset.openDay}T12:00:00`);
      currentView = 'day';
      renderCalendar();
      return;
    }
    const trigger = event.target.closest('[data-schedule-id]');
    if (trigger) showScheduleDetails(trigger.dataset.scheduleId);
  });
}

function mergeUnique(items) {
  const map = new Map();
  items.forEach((item) => {
    const key = item.todo_id ? `todo:${item.todo_id}` : `schedule:${item.id}`;
    if (!map.has(key)) map.set(key, item);
  });
  return [...map.values()].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
}

async function loadSchedules() {
  const rangeStart = new Date(visibleDate.getFullYear(), visibleDate.getMonth() - 1, 1).toISOString();
  const rangeEnd = new Date(visibleDate.getFullYear(), visibleDate.getMonth() + 2, 1).toISOString();
  const today = startOfDay(new Date()).toISOString();
  const [visibleResult, upcomingResult, todoResult] = await Promise.all([
    supabase.from('schedules').select('id, title, starts_at, ends_at, todo_id').eq('team_id', context.team.id).gte('starts_at', rangeStart).lt('starts_at', rangeEnd).order('starts_at'),
    supabase.from('schedules').select('id, title, starts_at, ends_at, todo_id').eq('team_id', context.team.id).gte('starts_at', today).order('starts_at').limit(12),
    supabase.from('todos').select('id, title, due_at, status').eq('team_id', context.team.id).gte('due_at', today).in('status', ['todo', 'in_progress']).order('due_at').limit(12),
  ]);
  for (const result of [visibleResult, upcomingResult, todoResult]) if (result.error) throw result.error;
  const activeTodos = todoResult.data ?? [];
  const activeTodoIds = new Set(activeTodos.map((todo) => todo.id));
  const todoDeadlines = activeTodos.map((todo) => ({ id: `todo-${todo.id}`, title: todo.title, starts_at: todo.due_at, ends_at: todo.due_at, todo_id: todo.id }));
  const upcomingTeamSchedules = (upcomingResult.data ?? []).filter((schedule) => !schedule.todo_id || activeTodoIds.has(schedule.todo_id));
  upcomingSchedules = mergeUnique([...upcomingTeamSchedules, ...todoDeadlines]).slice(0, 8);
  schedules = mergeUnique([...(visibleResult.data ?? []), ...upcomingSchedules]);
  renderCalendar();
}

async function addSchedule() {
  const values = await showAppForm({
    title: '새 일정 추가',
    description: '일정 이름과 정확한 날짜·시작 시간을 입력해 주세요.',
    fields: [
      { name: 'title', label: '일정 이름', placeholder: '예: 중간 점검 회의', required: true },
      { name: 'date', label: '날짜', type: 'date', value: dayKey(visibleDate), required: true },
      { name: 'time', label: '시작 시간', type: 'time', value: '09:00', required: true },
    ],
    submitText: '일정 추가',
  });
  if (!values) return;
  const startsAt = new Date(`${values.date}T${values.time}:00`);
  if (Number.isNaN(startsAt.getTime())) return showAppAlert('날짜와 시간을 다시 확인해 주세요.', { title: '일정 확인' });
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  const { error } = await supabase.from('schedules').insert({ team_id: context.team.id, title: values.title, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), created_by: context.user.id });
  if (error) return showAppAlert(error.message, { title: '일정 추가 실패' });
  visibleDate = startsAt;
  await loadSchedules();
}

async function moveCalendar(direction) {
  if (currentView === 'month') visibleDate.setMonth(visibleDate.getMonth() + direction);
  if (currentView === 'week') visibleDate.setDate(visibleDate.getDate() + direction * 7);
  if (currentView === 'day') visibleDate.setDate(visibleDate.getDate() + direction);
  await loadSchedules();
}

async function initialize() {
  try {
    context = await getAppContext();
    if (!context) return;
    setupShell(context);
    document.querySelector('[data-prev]').addEventListener('click', () => moveCalendar(-1));
    document.querySelector('[data-next]').addEventListener('click', () => moveCalendar(1));
    document.querySelector('[data-today]').addEventListener('click', async () => { visibleDate = new Date(); await loadSchedules(); });
    document.querySelectorAll('[data-calendar-view]').forEach((button) => button.addEventListener('click', async () => { currentView = button.dataset.calendarView; await loadSchedules(); }));
    document.querySelector('[data-add-schedule]').addEventListener('click', addSchedule);
    configureScheduleDetails();
    await loadSchedules();
  } catch (error) { showPageError(error); }
}

initialize();
