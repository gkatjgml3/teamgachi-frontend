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
        <span class="ai-badge">AI</span>
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
  const used = files.reduce((sum, file) => sum + Number(file.size_bytes || 0), 0);
  const limit = 1024 * 1024 * 1024;
  const percent = Math.min((used / limit) * 100, 100);
  if (count) count.textContent = `전체 ${files.length}개`;
  if (storageText) storageText.textContent = `${humanFileSize(used)} / 1GB`;
  if (storageBar) storageBar.style.width = `${percent}%`;
  if (!list) return;
  list.innerHTML = files.length
    ? files.map((file) => `
      <li class="file-item">
        <div class="file-type-icon"></div>
        <div class="file-meta-info">
          <div class="file-title">${escapeHtml(file.original_name)}</div>
          <div class="file-sub">${escapeHtml(memberName(file.uploaded_by))} · ${humanFileSize(file.size_bytes)} · ${formatDate(file.created_at)}</div>
        </div>
        <button class="btn-item-more" data-file-path="${escapeHtml(file.storage_path)}" title="다운로드">↓</button>
      </li>`).join('')
    : '<li class="empty-state">업로드한 파일이 없습니다.</li>';

  list.querySelectorAll('[data-file-path]').forEach((button) => {
    button.addEventListener('click', async () => {
      const { data, error } = await supabase.storage.from('team-files').createSignedUrl(button.dataset.filePath, 60);
      if (error) return window.alert(error.message);
      window.open(data.signedUrl, '_blank', 'noopener');
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
    .select('id, uploaded_by, original_name, storage_path, mime_type, size_bytes, created_at')
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

async function uploadFile(file) {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) return window.alert('파일은 최대 20MB까지 업로드할 수 있습니다.');
  const extension = file.name.includes('.') ? `.${file.name.split('.').pop()}` : '';
  const storagePath = `${context.team.id}/${crypto.randomUUID()}${extension}`;
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
  });
  if (recordError) {
    await supabase.storage.from('team-files').remove([storagePath]);
    return window.alert(recordError.message);
  }
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
  fileInput.addEventListener('change', () => uploadFile(fileInput.files?.[0]));
  document.querySelector('.btn-attach')?.addEventListener('click', () => fileInput.click());
  const dropzone = document.querySelector('.upload-dropzone');
  dropzone?.addEventListener('click', () => fileInput.click());
  dropzone?.addEventListener('dragover', (event) => event.preventDefault());
  dropzone?.addEventListener('drop', (event) => {
    event.preventDefault();
    uploadFile(event.dataTransfer.files?.[0]);
  });

  document.querySelector('.btn-ai-summary')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = '요약 중...';
    const { data, error } = await supabase.functions.invoke('summarize-chat', {
      body: { teamId: context.team.id, limit: 100 },
    });
    button.disabled = false;
    button.textContent = 'AI 대화 요약';
    summaryText = error ? `요약 실패: ${error.message}` : data.summary;
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
