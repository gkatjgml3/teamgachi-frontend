import { escapeHtml, formatDate, getAppContext, setupShell, showPageError, supabase } from './app-context.js';

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
      cells.push(`<td class="${classes}"><div class="date-number">${date.getDate()}</div>${items.slice(0, 3).map((item) => `<div class="event-bar ${item.todo_id ? 'event-orange' : 'event-purple'}" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>`).join('')}</td>`);
    }
    rows.push(`<tr>${cells.join('')}</tr>`);
  }
  document.querySelector('[data-calendar-body]').innerHTML = rows.join('');
  const monthRows = schedules.filter((item) => new Date(item.starts_at).getFullYear() === year && new Date(item.starts_at).getMonth() === month);
  document.querySelector('[data-month-count]').textContent = `${monthRows.length}건`;
  document.querySelector('[data-todo-count]').textContent = `${monthRows.filter((item) => item.todo_id).length}건`;
  const upcoming = schedules.filter((item) => new Date(item.starts_at) >= new Date()).slice(0, 8);
  document.querySelector('[data-upcoming]').innerHTML = upcoming.length ? upcoming.map((item) => `<div class="dday-item ${item.todo_id ? 'warning' : 'info'}"><div><div class="dday-title">${escapeHtml(item.title)}</div><div class="dday-date">${formatDate(item.starts_at)}</div></div><span class="badge-dday">${dDay(item.starts_at)}</span></div>`).join('') : '<div class="empty-state">등록된 일정이 없습니다.</div>';
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
  const title = window.prompt('일정 이름을 입력하세요.')?.trim();
  if (!title) return;
  const dateText = window.prompt('날짜를 YYYY-MM-DD 형식으로 입력하세요.', dayKey(new Date()))?.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText ?? '')) return window.alert('날짜 형식이 올바르지 않습니다.');
  const timeText = window.prompt('시작 시간을 HH:MM 형식으로 입력하세요.', '09:00')?.trim();
  if (!/^\d{2}:\d{2}$/.test(timeText ?? '')) return window.alert('시간 형식이 올바르지 않습니다.');
  const startsAt = new Date(`${dateText}T${timeText}:00`);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  const { error } = await supabase.from('schedules').insert({ team_id: context.team.id, title, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), created_by: context.user.id });
  if (error) return window.alert(error.message);
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
    await loadSchedules();
  } catch (error) { showPageError(error); }
}

initialize();
