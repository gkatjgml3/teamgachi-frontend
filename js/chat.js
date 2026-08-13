import {
  escapeHtml,
  formatDate,
  formatTime,
  getAppContext,
  setupShell,
  showPageError,
  supabase,
} from './app-context.js';

let context;
let messages = [];
let files = [];
let summaryText = '요약할 대화가 없습니다.';
let realtimeChannel;
let activeDriveKind = 'file';

function memberName(userId) {
  return context.members.find((member) => member.userId === userId)?.name ?? '팀원';
}

function renderMessages() {
  const body = document.querySelector('.chat-body');
  if (!body) return;
  const summaryLines = summaryText.split('\n').filter(Boolean);
  const messageHtml = messages.length
    ? messages.map((message) => `
      <div class="message-group ${message.author_id === context.user.id ? 'me' : ''}">
        <div class="msg-avatar"></div>
        <div class="msg-content-wrap">
          <div class="msg-meta">
            <span class="msg-sender">${escapeHtml(memberName(message.author_id))}</span>
            <span class="msg-time">${formatTime(message.created_at)}</span>
          </div>
          <div class="msg-bubble ${message.author_id === context.user.id ? 'my-bubble' : ''}">${escapeHtml(message.content)}</div>
        </div>
      </div>`).join('')
    : '<div class="empty-state">첫 메시지를 보내 대화를 시작해 보세요.</div>';

  body.innerHTML = `
    <div class="ai-summary-card">
      <div class="ai-summary-header">
        <span class="ai-badge">자동</span>
        <span class="ai-summary-title">대화 요약 (메시지 ${messages.length}건)</span>
      </div>
      <ul class="ai-summary-list">${summaryLines.map((line) => `<li>${escapeHtml(line.replace(/^[-•]\s*/, ''))}</li>`).join('')}</ul>
    </div>
    <div class="date-divider"><span>${formatDate(new Date(), { year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
    ${messageHtml}`;
  body.scrollTop = body.scrollHeight;
}

function humanFileSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

function renderFiles() {
  const list = document.querySelector('.file-list');
  const count = document.querySelector('.drive-count');
  const storageText = document.querySelector('.storage-value');
  const storageBar = document.querySelector('.storage-bar-fill');
  const visibleFiles = files.filter((file) => {
    if (activeDriveKind === 'image') return file.kind === 'image';
    if (activeDriveKind === 'link') return file.kind === 'link';
    return file.kind === 'file' || file.kind === 'evidence' || !file.kind;
  });
  const used = files.filter((file) => file.kind !== 'link').reduce((sum, file) => sum + Number(file.size_bytes || 0), 0);
  const limit = 1024 * 1024 * 1024;
  const percent = Math.min((used / limit) * 100, 100);
  if (count) count.textContent = `전체 ${visibleFiles.length}개`;
  if (storageText) storageText.textContent = `${humanFileSize(used)} / 1GB`;
  if (storageBar) storageBar.style.width = `${percent}%`;
  if (!list) return;
  list.innerHTML = visibleFiles.length
    ? visibleFiles.map((file) => `
      <li class="file-item">
        <div class="file-type-icon"></div>
        <div class="file-meta-info">
          <div class="file-title">${escapeHtml(file.original_name)}</div>
          <div class="file-sub">${escapeHtml(memberName(file.uploaded_by))} · ${file.kind === 'link' ? '링크' : humanFileSize(file.size_bytes)} · ${formatDate(file.created_at)}</div>
        </div>
        <button class="btn-item-more" data-open-id="${file.id}" title="${file.kind === 'link' ? '열기' : '다운로드'}">${file.kind === 'link' ? '↗' : '↓'}</button>
        <button class="btn-item-more" data-delete-id="${file.id}" title="삭제">×</button>
      </li>`).join('')
    : '<li class="empty-state">업로드한 파일이 없습니다.</li>';

  list.querySelectorAll('[data-open-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const file = files.find((item) => item.id === button.dataset.openId);
      if (!file) return;
      if (file.kind === 'link') return window.open(file.external_url, '_blank', 'noopener');
      const { data, error } = await supabase.storage.from('team-files').createSignedUrl(file.storage_path, 60);
      if (error) return window.alert(error.message);
      window.open(data.signedUrl, '_blank', 'noopener');
    });
  });
  list.querySelectorAll('[data-delete-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('이 자료를 삭제할까요?')) return;
      const file = files.find((item) => item.id === button.dataset.deleteId);
      if (!file) return;
      if (file.kind !== 'link') {
        const { error: storageError } = await supabase.storage.from('team-files').remove([file.storage_path]);
        if (storageError) return window.alert(storageError.message);
      }
      const { error } = await supabase.from('files').delete().eq('id', file.id);
      if (error) return window.alert(error.message);
      await loadFiles();
    });
  });
}

async function loadMessages() {
  const { data, error } = await supabase
    .from('messages')
    .select('id, author_id, content, created_at')
    .eq('team_id', context.team.id)
    .order('created_at')
    .limit(200);
  if (error) throw error;
  messages = data ?? [];
  renderMessages();
}

async function loadFiles() {
  const { data, error } = await supabase
    .from('files')
    .select('id, uploaded_by, original_name, storage_path, mime_type, size_bytes, kind, external_url, created_at')
    .eq('team_id', context.team.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  files = data ?? [];
  renderFiles();
}

async function sendMessage() {
  const input = document.querySelector('.input-msg');
  const content = input?.value.trim();
  if (!content) return;
  const { error } = await supabase.from('messages').insert({
    team_id: context.team.id,
    author_id: context.user.id,
    content,
  });
  if (error) return window.alert(error.message);
  input.value = '';
}

async function uploadFile(file, requestedKind = activeDriveKind) {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) return window.alert('파일은 최대 20MB까지 업로드할 수 있습니다.');
  const extension = file.name.includes('.') ? `.${file.name.split('.').pop()}` : '';
  const kind = requestedKind === 'image' || file.type.startsWith('image/') ? 'image' : 'file';
  const storagePath = `${context.team.id}/${context.user.id}/${crypto.randomUUID()}${extension}`;
  const { error: uploadError } = await supabase.storage
    .from('team-files')
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) return window.alert(uploadError.message);

  const { error: recordError } = await supabase.from('files').insert({
    team_id: context.team.id,
    uploaded_by: context.user.id,
    original_name: file.name,
    storage_path: storagePath,
    mime_type: file.type || 'application/octet-stream',
    size_bytes: file.size,
    kind,
  });
  if (recordError) {
    await supabase.storage.from('team-files').remove([storagePath]);
    return window.alert(recordError.message);
  }
  await loadFiles();
}

async function addLink() {
  const rawUrl = window.prompt('공유할 링크 주소를 입력하세요.');
  if (!rawUrl) return;
  let url;
  try {
    url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
  } catch {
    return window.alert('https:// 또는 http://로 시작하는 올바른 주소를 입력해 주세요.');
  }
  const title = window.prompt('링크 이름을 입력하세요.', url.hostname) || url.hostname;
  const { error } = await supabase.from('files').insert({
    team_id: context.team.id,
    uploaded_by: context.user.id,
    original_name: title,
    storage_path: `link:${crypto.randomUUID()}`,
    mime_type: 'text/uri-list',
    size_bytes: 1,
    kind: 'link',
    external_url: url.toString(),
  });
  if (error) return window.alert(error.message);
  await loadFiles();
}

function configureActions() {
  const input = document.querySelector('.input-msg');
  document.querySelector('.btn-send')?.addEventListener('click', sendMessage);
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.hidden = true;
  fileInput.accept = '.png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,.zip,.docx,.xlsx,.pptx';
  document.body.append(fileInput);
  fileInput.addEventListener('change', async () => {
    await uploadFile(fileInput.files?.[0]);
    fileInput.value = '';
  });
  document.querySelector('.btn-attach')?.addEventListener('click', () => fileInput.click());
  const dropzone = document.querySelector('.upload-dropzone');
  dropzone?.addEventListener('click', () => activeDriveKind === 'link' ? addLink() : fileInput.click());
  dropzone?.addEventListener('dragover', (event) => event.preventDefault());
  dropzone?.addEventListener('drop', (event) => {
    event.preventDefault();
    if (activeDriveKind === 'link') return window.alert('링크 탭에서는 업로드 영역을 클릭해 주소를 입력해 주세요.');
    uploadFile(event.dataTransfer.files?.[0]);
  });

  document.querySelectorAll('.drive-tab').forEach((button, index) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.drive-tab').forEach((tab) => tab.classList.remove('active'));
      button.classList.add('active');
      activeDriveKind = ['file', 'link', 'image'][index] ?? 'file';
      fileInput.accept = activeDriveKind === 'image'
        ? 'image/png,image/jpeg,image/webp'
        : '.png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,.zip,.docx,.xlsx,.pptx';
      const text = document.querySelector('.upload-text');
      if (text) text.textContent = activeDriveKind === 'link'
        ? '클릭해 링크 주소 추가'
        : activeDriveKind === 'image' ? '이미지를 끌어 놓거나 클릭해 업로드' : '파일을 끌어 놓거나 클릭해 업로드';
      renderFiles();
    });
  });

  document.querySelector('.btn-ai-summary')?.addEventListener('click', (event) => {
    const button = event.currentTarget;
    button.textContent = '대화 자동 요약';
    if (!messages.length) {
      summaryText = '요약할 대화가 없습니다.';
    } else {
      const latest = messages.slice(-5);
      summaryText = [
        `최근 ${latest.length}개 메시지를 정리했습니다.`,
        ...latest.map((message) => `${memberName(message.author_id)}: ${message.content}`),
        '외부 AI 요약은 고교 사용 조건에 맞는 제공자 선정 후 연결할 예정입니다.',
      ].join('\n');
    }
    renderMessages();
  });
}

function subscribeRealtime() {
  realtimeChannel = supabase
    .channel(`messages:${context.team.id}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'messages',
      filter: `team_id=eq.${context.team.id}`,
    }, loadMessages)
    .subscribe();
  window.addEventListener('beforeunload', () => {
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  });
}

async function initialize() {
  try {
    context = await getAppContext();
    if (!context) return;
    setupShell(context);
    const count = document.querySelector('.chat-member-count');
    const channelName = document.querySelector('.chat-channel-name');
    if (count) count.textContent = `팀원 ${context.members.length}명`;
    if (channelName) channelName.textContent = `# ${context.team.name}`;
    configureActions();
    await Promise.all([loadMessages(), loadFiles()]);
    subscribeRealtime();
  } catch (error) {
    showPageError(error);
  }
}

initialize();
