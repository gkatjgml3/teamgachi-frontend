import {
  escapeHtml,
  formatDate,
  getAppContext,
  profileColorStyle,
  setupShell,
  showAppAlert,
  showAppDetails,
  showAppForm,
  showPageError,
  supabase,
} from './app-context.js';

const categoryMeta = {
  urgent: { label: '필독', className: 'badge-must' },
  event: { label: '일정', className: 'badge-schedule' },
  general: { label: '일반', className: 'badge-general' },
};

let context;
let notices = [];
let readIds = new Set();
let activeFilter = 'all';
let sortOrder = 'newest';
let realtimeChannel;

function authorName(userId) {
  return context.members.find((member) => member.userId === userId)?.name ?? '팀원';
}

function canWriteNotice() {
  const membership = context.members.find((member) => member.userId === context.user.id);
  return ['owner', 'admin'].includes(context.team.role) || Boolean(membership?.canManageNotices);
}

function categoryBadge(notice) {
  const meta = categoryMeta[notice.category] ?? categoryMeta.general;
  return `<span class="badge ${meta.className}">${meta.label}</span>`;
}

function filteredNotices() {
  const rows = activeFilter === 'all' ? [...notices] : notices.filter((notice) => notice.category === activeFilter);
  return rows.sort((a, b) => sortOrder === 'oldest' ? new Date(a.created_at) - new Date(b.created_at) : new Date(b.created_at) - new Date(a.created_at));
}

function renderFilterCounts() {
  document.querySelectorAll('[data-notice-filter]').forEach((button) => {
    const filter = button.dataset.noticeFilter;
    const count = filter === 'all' ? notices.length : notices.filter((notice) => notice.category === filter).length;
    const counter = button.querySelector('.tab-count');
    if (counter) counter.textContent = count;
  });
}

function noticeItem(notice) {
  return `
    <li class="notice-item ${readIds.has(notice.id) ? '' : 'unread'}" data-notice-id="${escapeHtml(notice.id)}" tabindex="0" role="button">
      <div class="item-head">
        <div class="item-title-box">${categoryBadge(notice)}<span class="title">${escapeHtml(notice.title)}</span></div>
        <div class="item-meta">
          <span class="writer">${escapeHtml(authorName(notice.author_id))}</span>
          <span class="date">${formatDate(notice.created_at)}</span>
          <span class="read-pill ${readIds.has(notice.id) ? 'active' : ''}">${readIds.has(notice.id) ? '읽음' : '미확인'}</span>
        </div>
      </div>
      <p class="summary">${escapeHtml(notice.content.slice(0, 120))}</p>
    </li>`;
}

function renderNotices() {
  renderFilterCounts();
  const grid = document.querySelector('[data-notice-grid]');
  if (!grid) return;
  grid.hidden = false;
  const visible = filteredNotices();
  const pinned = visible.find((notice) => notice.pinned) ?? null;
  const unread = notices.filter((notice) => !readIds.has(notice.id));
  grid.innerHTML = `
    <div class="notice-main">
      ${pinned ? `<article class="pinned-card" data-notice-id="${escapeHtml(pinned.id)}" tabindex="0" role="button">
        <div class="pinned-header">${categoryBadge(pinned)}<span class="badge badge-pin">📌 상단 고정</span><h2 class="pinned-title">${escapeHtml(pinned.title)}</h2><span class="pinned-date">${formatDate(pinned.created_at)}</span></div>
        <p class="pinned-desc">${escapeHtml(pinned.content)}</p>
        <div class="pinned-footer"><div class="author-info"><span class="avatar-circle avatar-sm" style="${profileColorStyle(pinned.author_id)}"></span><span class="author-name">${escapeHtml(authorName(pinned.author_id))}</span></div><span class="read-pill ${readIds.has(pinned.id) ? 'active' : ''}">${readIds.has(pinned.id) ? '읽음' : '미확인'}</span></div>
      </article>` : ''}
      <div class="list-card">
        <div class="list-card-header"><h3>${activeFilter === 'all' ? '전체 공지' : `${categoryMeta[activeFilter].label} 공지`}</h3><span class="total-count">${visible.length}건</span></div>
        <ul class="notice-list">${visible.length ? visible.map(noticeItem).join('') : '<li class="empty-state">등록된 공지가 없습니다.</li>'}</ul>
      </div>
    </div>
    <aside class="notice-side">
      <div class="side-card">
        <div class="side-card-head"><h4>읽지 않은 공지</h4><span class="side-count">${unread.length}건</span></div>
        <ul class="unread-list">${unread.length ? unread.slice(0, 5).map((notice) => `<li data-notice-id="${escapeHtml(notice.id)}" tabindex="0" role="button">${categoryBadge(notice)}<span class="txt">${escapeHtml(notice.title)}</span><span class="date">${formatDate(notice.created_at)}</span></li>`).join('') : '<li class="empty-state">모든 공지를 확인했습니다.</li>'}</ul>
        <button class="outline-btn" data-mark-all-read ${unread.length ? '' : 'disabled'}>모두 읽음 처리</button>
      </div>
      <div class="side-card guide-card"><h4>공지 작성 안내</h4><ul class="guide-list"><li>필독·일정·일반 카테고리를 선택합니다.</li><li>공지 클릭 시 상세 내용과 작성 정보를 확인합니다.</li><li>읽음 여부는 사용자별로 자동 기록됩니다.</li></ul></div>
    </aside>`;
}

async function markRead(noticeId) {
  if (readIds.has(noticeId)) return;
  const { error } = await supabase.from('notice_reads').upsert({ notice_id: noticeId, user_id: context.user.id });
  if (error) return showAppAlert(error.message, { title: '읽음 처리 실패' });
  readIds.add(noticeId);
  renderNotices();
}

async function openNotice(noticeId) {
  const notice = notices.find((item) => item.id === noticeId);
  if (!notice) return;
  await markRead(noticeId);
  const meta = categoryMeta[notice.category] ?? categoryMeta.general;
  await showAppDetails({
    title: '공지 상세',
    heading: notice.title,
    badge: meta.label,
    rows: [
      { label: '작성자', value: authorName(notice.author_id) },
      { label: '작성일', value: formatDate(notice.created_at, { year: 'numeric', month: 'long', day: 'numeric' }) },
      { label: '구분', value: notice.pinned ? `${meta.label} · 상단 고정` : meta.label },
      { label: '내용', value: notice.content },
    ],
  });
}

async function createNotice() {
  if (!canWriteNotice()) return showAppAlert('팀장에게 공지 작성 권한을 요청해 주세요.', { title: '공지 작성 권한' });
  const values = await showAppForm({
    title: '새 공지 작성',
    description: '팀원에게 전달할 공지 내용을 작성해 주세요.',
    fields: [
      { name: 'title', label: '제목', placeholder: '공지 제목', required: true },
      { name: 'content', label: '내용', type: 'textarea', placeholder: '공지 내용을 입력하세요.', required: true },
      { name: 'category', label: '카테고리', type: 'select', value: 'general', options: [
        { value: 'urgent', label: '필독' },
        { value: 'event', label: '일정' },
        { value: 'general', label: '일반' },
      ], required: true },
      { name: 'pinned', label: '상단 고정', type: 'select', value: 'false', options: [
        { value: 'false', label: '고정하지 않음' },
        { value: 'true', label: '상단에 고정' },
      ], required: true },
    ],
    submitText: '공지 등록',
  });
  if (!values) return;
  const { error } = await supabase.from('notices').insert({
    team_id: context.team.id,
    author_id: context.user.id,
    title: values.title,
    content: values.content,
    category: values.category,
    pinned: values.pinned === 'true',
  });
  if (error) return showAppAlert(error.message, { title: '공지 등록 실패' });
  await loadNotices();
}

async function markAllRead() {
  const unreadIds = notices.filter((notice) => !readIds.has(notice.id)).map((notice) => notice.id);
  if (!unreadIds.length) return;
  const { error } = await supabase.from('notice_reads').upsert(unreadIds.map((noticeId) => ({ notice_id: noticeId, user_id: context.user.id })));
  if (error) return showAppAlert(error.message, { title: '읽음 처리 실패' });
  unreadIds.forEach((id) => readIds.add(id));
  renderNotices();
}

async function loadNotices() {
  const [{ data: noticeRows, error: noticeError }, { data: readRows, error: readError }] = await Promise.all([
    supabase.from('notices').select('id, author_id, title, content, category, pinned, created_at, updated_at').eq('team_id', context.team.id).order('pinned', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('notice_reads').select('notice_id').eq('user_id', context.user.id),
  ]);
  if (noticeError) throw noticeError;
  if (readError) throw readError;
  notices = noticeRows ?? [];
  readIds = new Set((readRows ?? []).map((row) => row.notice_id));
  renderNotices();
}

function configureActions() {
  document.querySelectorAll('[data-notice-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = button.dataset.noticeFilter;
      document.querySelectorAll('[data-notice-filter]').forEach((item) => item.classList.toggle('active', item === button));
      renderNotices();
    });
  });
  document.querySelector('[data-create-notice]')?.addEventListener('click', createNotice);
  document.querySelector('[data-notice-sort]')?.addEventListener('change', (event) => {
    sortOrder = event.target.value;
    renderNotices();
  });
  document.querySelector('[data-notice-grid]')?.addEventListener('click', (event) => {
    if (event.target.closest('[data-mark-all-read]')) return markAllRead();
    const target = event.target.closest('[data-notice-id]');
    if (target) openNotice(target.dataset.noticeId);
  });
  document.querySelector('[data-notice-grid]')?.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    const target = event.target.closest('[data-notice-id]');
    if (target) {
      event.preventDefault();
      openNotice(target.dataset.noticeId);
    }
  });
}

function subscribeRealtime() {
  realtimeChannel = supabase.channel(`notices:${context.team.id}`).on('postgres_changes', {
    event: '*', schema: 'public', table: 'notices', filter: `team_id=eq.${context.team.id}`,
  }, loadNotices).subscribe();
  window.addEventListener('beforeunload', () => realtimeChannel && supabase.removeChannel(realtimeChannel));
}

async function initialize() {
  const grid = document.querySelector('[data-notice-grid]');
  if (grid) grid.innerHTML = '<div class="empty-state">공지를 불러오는 중입니다.</div>';
  try {
    context = await getAppContext();
    if (!context) return;
    setupShell(context);
    if (!canWriteNotice()) {
      const createButton = document.querySelector('[data-create-notice]');
      if (createButton) {
        createButton.disabled = true;
        createButton.textContent = '작성 권한 필요';
        createButton.title = '팀장이 공지 작성 권한을 허용하면 작성할 수 있습니다.';
      }
      const help = document.querySelector('[data-notice-author-help]');
      if (help) help.textContent = '팀장이 공지 작성 권한을 허용한 팀원만 새 공지를 작성할 수 있습니다.';
    } else {
      const help = document.querySelector('[data-notice-author-help]');
      if (help) help.textContent = context.team.role === 'owner'
        ? '팀 관리에서 팀원별 공지 작성 권한을 설정할 수 있습니다.'
        : '팀장에게 공지 작성 권한을 받아 새 공지를 작성할 수 있습니다.';
    }
    configureActions();
    await loadNotices();
    subscribeRealtime();
  } catch (error) {
    showPageError(error);
  }
}

initialize();
