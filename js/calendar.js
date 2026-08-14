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
let visibleMonth = new Date();
visibleMonth.setDate(1);

function dayKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dDay(value) {
  const days = Math.ceil((new Date(value).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  return days === 0 ? '오늘' : days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;
}

function renderCalendar() {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  document.querySelector('.current-month-text').textContent = `${year}년 ${month + 1}월`;
  const monthLabel = document.querySelector('[data-month-label]');
  if (monthLabel) monthLabel.textContent = `${year}.${String(month + 1).padStart(2, '0')}`;
  const first = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - first.getDay());
  const byDay = new Map();
  schedules.forEach((schedule) => {
    const key = dayKey(schedule.starts_at);
    const list = byDay.get(key) ?? [];
    list.push(schedule);
    byDay.set(key, list);
  });
  const rows = [];
  for (let week = 0; week < 6; week += 1) {
    const cells = [];
    for (let day = 0; day < 7; day += 1) {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + week * 7 + day);
      const items = byDay.get(dayKey(date)) ?? [];
      const classes = [date.getMonth() !== month ? 'other-month' : '', dayKey(date) === dayKey(new Date()) ? 'today' : ''].filter(Boolean).join(' ');
      cells.push(`<td class="${classes}"><div class="date-number">${date.getDate()}</div>${items.slice(0, 3).map((item) => `<button type="button" class="event-bar schedule-detail-trigger ${item.todo_id ? 'event-orange' : 'event-purple'}" data-schedule-id="${escapeHtml(item.id)}" title="${escapeHtml(item.title)} 상세 보기">${escapeHtml(item.title)}</button>`).join('')}</td>`);
    }
    rows.push(`<tr>${cells.join('')}</tr>`);
  }
  document.querySelector('[data-calendar-body]').innerHTML = rows.join('');
  const monthRows = schedules.filter((item) => new Date(item.starts_at).getFullYear() === year && new Date(item.starts_at).getMonth() === month);
  document.querySelector('[data-month-count]').textContent = `${monthRows.length}건`;
  document.querySelector('[data-todo-count]').textContent = `${monthRows.filter((item) => item.todo_id).length}건`;
  const upcoming = schedules.filter((item) => new Date(item.starts_at) >= new Date()).slice(0, 8);
  document.querySelector('[data-upcoming]').innerHTML = upcoming.length ? upcoming.map((item) => `<button type="button" class="dday-item schedule-detail-trigger ${item.todo_id ? 'warning' : 'info'}" data-schedule-id="${escapeHtml(item.id)}" title="${escapeHtml(item.title)} 상세 보기"><span><span class="dday-title">${escapeHtml(item.title)}</span><span class="dday-date">${formatDate(item.starts_at)}</span></span><span class="badge-dday">${dDay(item.starts_at)}</span></button>`).join('') : '<div class="empty-state">등록된 일정이 없습니다.</div>';
}

function showScheduleDetails(scheduleId) {
  const schedule = schedules.find((item) => item.id === scheduleId);
  if (!schedule) return;
  const dateText = formatDate(schedule.starts_at, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
  const timeText = schedule.ends_at
    ? `${formatTime(schedule.starts_at)} ~ ${formatTime(schedule.ends_at)}`
    : formatTime(schedule.starts_at);
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
    const trigger = event.target.closest('[data-schedule-id]');
    if (trigger) showScheduleDetails(trigger.dataset.scheduleId);
  });
}

async function loadSchedules() {
  const start = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1).toISOString();
  const end = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 2, 1).toISOString();
  const { data, error } = await supabase.from('schedules').select('id, title, starts_at, ends_at, todo_id').eq('team_id', context.team.id).gte('starts_at', start).lt('starts_at', end).order('starts_at');
  if (error) throw error;
  schedules = data ?? [];
  renderCalendar();
}

async function addSchedule() {
  const values = await showAppForm({
    title: '새 일정 추가',
    description: '일정 이름과 정확한 날짜·시작 시간을 입력해 주세요.',
    fields: [
      { name: 'title', label: '일정 이름', placeholder: '예: 중간 점검 회의', required: true },
      { name: 'date', label: '날짜', type: 'date', value: dayKey(new Date()), required: true },
      { name: 'time', label: '시작 시간', type: 'time', value: '09:00', required: true },
    ],
    submitText: '일정 추가',
  });
  if (!values) return;
  const { title, date: dateText, time: timeText } = values;
  const startsAt = new Date(`${dateText}T${timeText}:00`);
  if (Number.isNaN(startsAt.getTime())) {
    await showAppAlert('날짜와 시간을 다시 확인해 주세요.', { title: '일정 확인' });
    return;
  }
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  const { error } = await supabase.from('schedules').insert({ team_id: context.team.id, title, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), created_by: context.user.id });
  if (error) return showAppAlert(error.message, { title: '일정 추가 실패' });
  await loadSchedules();
}

async function initialize() {
  try {
    context = await getAppContext();
    if (!context) return;
    setupShell(context);
    document.querySelector('[data-prev]').addEventListener('click', async () => { visibleMonth.setMonth(visibleMonth.getMonth() - 1); await loadSchedules(); });
    document.querySelector('[data-next]').addEventListener('click', async () => { visibleMonth.setMonth(visibleMonth.getMonth() + 1); await loadSchedules(); });
    document.querySelector('[data-today]').addEventListener('click', async () => { visibleMonth = new Date(); visibleMonth.setDate(1); await loadSchedules(); });
    document.querySelector('[data-add-schedule]').addEventListener('click', addSchedule);
    configureScheduleDetails();
    await loadSchedules();
  } catch (error) { showPageError(error); }
}

initialize();
