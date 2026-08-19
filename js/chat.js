import {
  escapeHtml,
  formatDate,
  formatTime,
  getAppContext,
  setupShell,
  showAppAlert,
  showAppConfirm,
  showAppForm,
  showPageError,
  supabase,
} from './app-context.js';

let context;
let messages = [];
let files = [];
let summaryText = '요약할 대화가 없습니다.';
let realtimeChannel;
let activeDriveKind = 'file';

function summaryStorageKey() {
  return `teamgachi-chat-summary:${context.team.id}`;
}

function cacheSummary(summary, messageCount = messages.length) {
  try {
    localStorage.setItem(summaryStorageKey(), JSON.stringify({ summary, messageCount, updatedAt: new Date().toISOString() }));
  } catch (error) {
    console.warn('채팅 요약의 브라우저 임시 저장을 건너뜁니다.', error);
  }
}

async function loadLatestSummary() {
  try {
    const cached = JSON.parse(localStorage.getItem(summaryStorageKey()) || 'null');
    if (cached?.summary) summaryText = cached.summary;
  } catch (error) {
    console.warn('임시 저장된 채팅 요약을 읽지 못했습니다.', error);
  }

  const { data, error } = await supabase
    .from('chat_summaries')
    .select('summary, message_count, updated_at')
    .eq('team_id', context.team.id)
    .maybeSingle();
  if (error) {
    console.warn('저장된 채팅 요약을 불러오지 못했습니다.', error);
    renderMessages();
    return;
  }
  if (data?.summary) {
    summaryText = data.summary;
    cacheSummary(data.summary, data.message_count);
  }
  renderMessages();
}

async function saveLatestSummary() {
  cacheSummary(summaryText);
  const { error } = await supabase.from('chat_summaries').upsert({
    team_id: context.team.id,
    summary: summaryText,
    message_count: messages.length,
    generated_by: context.user.id,
  }, { onConflict: 'team_id' });
  if (error) throw error;
}

function setDriveStatus(message, tone = '') {
  const status = document.querySelector('[data-drive-status]');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('success', tone === 'success');
  status.classList.toggle('error', tone === 'error');
}

function memberName(userId) {
  return context.members.find((member) => member.userId === userId)?.name ?? '팀원';
}

function renderSummaryContent(value) {
  const lines = value.split('\n').map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return '<p class="summary-intro">요약할 대화가 없습니다.</p>';

  return lines.map((rawLine, index) => {
    const isHeading = /^#{1,6}\s+/.test(rawLine) || /^\*\*[^*]+\*\*:?$/.test(rawLine);
    const hasBullet = /^[-*•]\s+/.test(rawLine);
    const text = rawLine
      .replace(/^#{1,6}\s*/, '')
      .replace(/^[-*•]\s*/, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .trim();

    if (!text) return '';
    if (isHeading) return `<h4 class="summary-section-title">${escapeHtml(text.replace(/:$/, ''))}</h4>`;
    const className = index === 0 && !hasBullet ? 'summary-intro' : 'summary-item';
    return `<p class="${className}">${escapeHtml(text)}</p>`;
  }).join('');
}

function messageDayKey(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function renderMessageList() {
  if (!messages.length) return '<div class="empty-state">첫 메시지를 보내 대화를 시작해 보세요.</div>';

  let previousDay = '';
  return messages.map((message) => {
    const currentDay = messageDayKey(message.created_at);
    const isOwnMessage = message.author_id === context.user.id;
    const wasEdited = message.updated_at
      && new Date(message.updated_at).getTime() - new Date(message.created_at).getTime() > 1000;
    const dateDivider = currentDay === previousDay ? '' : `
      <div class="chat-date-divider">
        <span class="chat-date-text">${formatDate(message.created_at, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
      </div>`;
    previousDay = currentDay;

    return `${dateDivider}
      <div class="message-item ${isOwnMessage ? 'me' : ''}">
        <div class="msg-avatar"></div>
        <div class="msg-content">
          <div class="msg-meta">
            <span class="msg-author">${escapeHtml(memberName(message.author_id))}</span>
            <span class="msg-time">${formatTime(message.created_at)}</span>
            ${wasEdited ? '<span class="msg-edited">수정됨</span>' : ''}
            ${isOwnMessage ? `<span class="msg-actions">
              <button type="button" data-edit-message="${message.id}" aria-label="메시지 수정">수정</button>
              <button type="button" data-delete-message="${message.id}" aria-label="메시지 삭제">삭제</button>
            </span>` : ''}
          </div>
          <div class="msg-bubble ${isOwnMessage ? 'my-bubble' : ''}">${escapeHtml(message.content)}</div>
        </div>
      </div>`;
  }).join('');
}

function renderSummary() {
  const slot = document.querySelector('.chat-summary-slot');
  if (!slot) return;
  slot.innerHTML = `
    <div class="chat-ai-summary">
      <div class="summary-header">
        <span class="summary-title"><span class="badge-purple">AI</span> 대화 요약 (메시지 ${messages.length}건)</span>
      </div>
      <div class="summary-list">${renderSummaryContent(summaryText)}</div>
    </div>`;
}

function renderMessages() {
  const body = document.querySelector('.chat-body');
  if (!body) return;
  renderSummary();
  body.innerHTML = renderMessageList();
  body.querySelectorAll('[data-edit-message]').forEach((button) => {
    button.addEventListener('click', () => editMessage(button.dataset.editMessage));
  });
  body.querySelectorAll('[data-delete-message]').forEach((button) => {
    button.addEventListener('click', () => deleteMessage(button.dataset.deleteMessage));
  });
  body.scrollTop = body.scrollHeight;
}

async function editMessage(messageId) {
  const message = messages.find((item) => item.id === messageId);
  if (!message || message.author_id !== context.user.id) return;
  const values = await showAppForm({
    title: '메시지 수정',
    description: '수정할 메시지를 입력해 주세요.',
    fields: [{ name: 'content', label: '메시지', type: 'textarea', value: message.content, required: true }],
    submitText: '수정하기',
  });
  if (!values) return;
  if (values.content.length > 5000) {
    return showAppAlert('메시지는 5,000자까지 입력할 수 있습니다.', { title: '메시지 길이 확인' });
  }
  const { error } = await supabase
    .from('messages')
    .update({ content: values.content })
    .eq('id', messageId)
    .eq('author_id', context.user.id);
  if (error) return showAppAlert(error.message, { title: '메시지 수정 실패' });
  await loadMessages();
}

async function deleteMessage(messageId) {
  const message = messages.find((item) => item.id === messageId);
  if (!message || message.author_id !== context.user.id) return;
  const confirmed = await showAppConfirm('삭제한 메시지는 되돌릴 수 없습니다. 이 메시지를 삭제할까요?', {
    title: '메시지 삭제',
    confirmText: '삭제하기',
    danger: true,
  });
  if (!confirmed) return;
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', messageId)
    .eq('author_id', context.user.id);
  if (error) return showAppAlert(error.message, { title: '메시지 삭제 실패' });
  await loadMessages();
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
  const visibleFiles = files.filter((file) => {
    if (activeDriveKind === 'image') return file.kind === 'image';
    if (activeDriveKind === 'link') return file.kind === 'link';
    return file.kind === 'file' || file.kind === 'evidence' || !file.kind;
  });
  const used = files.filter((file) => file.kind !== 'link').reduce((sum, file) => sum + Number(file.size_bytes || 0), 0);
  if (count) count.textContent = `전체 ${visibleFiles.length}개`;
  if (storageText) storageText.textContent = `사용 중 ${humanFileSize(used)}`;
  if (!list) return;
  list.innerHTML = visibleFiles.length
    ? visibleFiles.map((file) => `
      <div class="drive-file-item">
        <div class="drive-file-left"><div class="drive-file-icon"></div>
        <div class="drive-file-details">
          <span class="drive-file-name">${escapeHtml(file.original_name)}</span>
          <span class="drive-file-meta">${escapeHtml(memberName(file.uploaded_by))} · ${file.kind === 'link' ? '링크' : humanFileSize(file.size_bytes)} · ${formatDate(file.created_at)}</span>
        </div>
        </div>
        <div class="drive-file-actions"><button class="drive-more-btn" data-open-id="${file.id}" title="${file.kind === 'link' ? '열기' : '다운로드'}">${file.kind === 'link' ? '↗' : '↓'}</button>
        <button class="drive-more-btn" data-delete-id="${file.id}" title="삭제">×</button></div>
      </div>`).join('')
    : '<div class="empty-state">업로드한 자료가 없습니다.</div>';

  list.querySelectorAll('[data-open-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const file = files.find((item) => item.id === button.dataset.openId);
      if (!file) return;
      if (file.kind === 'link') return window.open(file.external_url, '_blank', 'noopener');
      const { data, error } = await supabase.storage.from('team-files').createSignedUrl(file.storage_path, 60);
      if (error) return showAppAlert(error.message, { title: '자료 열기 실패' });
      const anchor = document.createElement('a');
      anchor.href = data.signedUrl;
      anchor.target = '_blank';
      anchor.rel = 'noopener';
      anchor.download = file.original_name;
      anchor.click();
    });
  });
  list.querySelectorAll('[data-delete-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const confirmed = await showAppConfirm('삭제한 자료는 되돌릴 수 없습니다. 이 자료를 삭제할까요?', {
        title: '자료 삭제',
        confirmText: '삭제하기',
        danger: true,
      });
      if (!confirmed) return;
      const file = files.find((item) => item.id === button.dataset.deleteId);
      if (!file) return;
      if (file.kind !== 'link') {
        const { error: storageError } = await supabase.storage.from('team-files').remove([file.storage_path]);
        if (storageError) return showAppAlert(storageError.message, { title: '자료 삭제 실패' });
      }
      const { error } = await supabase.from('files').delete().eq('id', file.id);
      if (error) return showAppAlert(error.message, { title: '자료 삭제 실패' });
      await loadFiles();
    });
  });
}

async function loadMessages() {
  const { data, error } = await supabase
    .from('messages')
    .select('id, author_id, content, created_at, updated_at')
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
  if (error) return showAppAlert(error.message, { title: '메시지 전송 실패' });
  input.value = '';
}

async function uploadFile(file, requestedKind = activeDriveKind) {
  if (!file) return false;
  if (requestedKind === 'image' && !file.type.startsWith('image/')) {
    await showAppAlert(`${file.name}: 이미지 탭에는 이미지 파일만 올릴 수 있습니다.`, { title: '파일 형식 확인' });
    return false;
  }
  const extension = file.name.includes('.') ? `.${file.name.split('.').pop()}` : '';
  const kind = requestedKind === 'image' || file.type.startsWith('image/') ? 'image' : 'file';
  const storagePath = `${context.team.id}/${context.user.id}/${crypto.randomUUID()}${extension}`;
  const { error: uploadError } = await supabase.storage
    .from('team-files')
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    await showAppAlert(`${file.name}: ${uploadError.message}`, { title: '파일 업로드 실패' });
    return false;
  }

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
    await showAppAlert(`${file.name}: ${recordError.message}`, { title: '파일 저장 실패' });
    return false;
  }
  return true;
}

async function uploadFiles(fileList, requestedKind = activeDriveKind) {
  const selected = [...(fileList ?? [])];
  if (!selected.length) return;
  const uploadButton = document.querySelector('[data-drive-upload]');
  if (uploadButton) uploadButton.disabled = true;
  let succeeded = 0;
  setDriveStatus(`${selected.length}개 자료를 업로드하는 중입니다...`);
  try {
    for (const file of selected) {
      if (await uploadFile(file, requestedKind)) succeeded += 1;
    }
    await loadFiles();
    if (succeeded === selected.length) {
      setDriveStatus(`${succeeded}개 자료를 업로드했습니다.`, 'success');
    } else {
      setDriveStatus(`${succeeded}/${selected.length}개 자료를 업로드했습니다. 실패한 파일을 확인해 주세요.`, 'error');
    }
  } finally {
    if (uploadButton) uploadButton.disabled = false;
  }
}

async function addLink() {
  const values = await showAppForm({
    title: '링크 추가',
    description: '팀원들과 공유할 웹 주소와 표시 이름을 입력해 주세요.',
    fields: [
      { name: 'url', label: '링크 주소', type: 'url', placeholder: 'https://example.com', required: true },
      { name: 'title', label: '링크 이름', placeholder: '예: 프로젝트 참고 자료' },
    ],
    submitText: '링크 추가',
  });
  if (!values) return;
  let url;
  try {
    url = new URL(values.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
  } catch {
    return showAppAlert('https:// 또는 http://로 시작하는 올바른 주소를 입력해 주세요.', { title: '링크 주소 확인' });
  }
  const title = values.title || url.hostname;
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
  if (error) return showAppAlert(error.message, { title: '링크 추가 실패' });
  await loadFiles();
  setDriveStatus('링크를 자료함에 추가했습니다.', 'success');
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

  const fileInput = document.querySelector('[data-drive-file-input]');
  if (!fileInput) return;
  fileInput.accept = '.png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,.zip,.docx,.xlsx,.pptx';
  fileInput.addEventListener('change', async () => {
    await uploadFiles(fileInput.files, activeDriveKind);
    fileInput.value = '';
  });
  document.querySelector('.btn-attach')?.addEventListener('click', () => fileInput.click());
  document.querySelector('[data-drive-upload]')?.addEventListener('click', () => fileInput.click());
  document.querySelector('[data-drive-link]')?.addEventListener('click', addLink);
  const dropzone = document.querySelector('.upload-dropzone');
  dropzone?.addEventListener('click', () => activeDriveKind === 'link' ? addLink() : fileInput.click());
  dropzone?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    activeDriveKind === 'link' ? addLink() : fileInput.click();
  });
  dropzone?.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('is-dragging');
  });
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('is-dragging'));
  dropzone?.addEventListener('drop', async (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-dragging');
    if (activeDriveKind === 'link') {
      return showAppAlert('링크 탭에서는 업로드 영역을 클릭해 주소를 입력해 주세요.', { title: '링크 추가 방법' });
    }
    await uploadFiles(event.dataTransfer.files, activeDriveKind);
  });

  document.querySelectorAll('.drive-tab').forEach((button, index) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.drive-tab').forEach((tab) => tab.classList.remove('active'));
      button.classList.add('active');
      activeDriveKind = ['file', 'link', 'image'][index] ?? 'file';
      fileInput.accept = activeDriveKind === 'image'
        ? 'image/png,image/jpeg,image/webp'
        : '.png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,.zip,.docx,.xlsx,.pptx';
      const uploadButton = document.querySelector('[data-drive-upload]');
      const linkButton = document.querySelector('[data-drive-link]');
      if (uploadButton) {
        uploadButton.hidden = activeDriveKind === 'link';
        uploadButton.textContent = activeDriveKind === 'image' ? '이미지 선택' : '파일 선택';
      }
      if (linkButton) linkButton.hidden = activeDriveKind !== 'link';
      const text = document.querySelector('.upload-text');
      if (text) text.textContent = activeDriveKind === 'link'
        ? '클릭해 링크 주소 추가'
        : activeDriveKind === 'image' ? '이미지를 끌어 놓거나 클릭해 업로드' : '파일을 끌어 놓거나 클릭해 업로드';
      setDriveStatus(activeDriveKind === 'link'
        ? 'https:// 또는 http://로 시작하는 링크를 등록할 수 있습니다.'
        : activeDriveKind === 'image'
          ? 'PNG, JPG, WEBP 이미지를 올릴 수 있습니다. 실제 최대 용량은 Supabase 프로젝트 설정을 따릅니다.'
          : '문서·이미지·압축 파일을 한 번에 여러 개 선택할 수 있습니다.');
      renderFiles();
    });
  });

  document.querySelector('.btn-ai-summary')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'AI 요약 중...';
    try {
      const { data, error } = await supabase.functions.invoke('summarize-chat', {
        body: { teamId: context.team.id, limit: 100 },
      });
      if (error) throw error;
      summaryText = data?.summary || '요약할 대화가 없습니다.';
    } catch (error) {
      console.warn('AI 요약 대신 자동 정리를 표시합니다.', error);
      const latest = messages.slice(-5);
      summaryText = latest.length
        ? [`AI 연결 전 자동 정리입니다.`, ...latest.map((message) => `${memberName(message.author_id)}: ${message.content}`)].join('\n')
        : '요약할 대화가 없습니다.';
    }
    button.disabled = false;
    button.textContent = 'AI 대화 요약';
    renderMessages();
    try {
      await saveLatestSummary();
    } catch (error) {
      console.warn('채팅 요약의 대시보드 저장에 실패했습니다.', error);
      await showAppAlert('요약은 생성됐지만 대시보드에 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.', { title: '요약 저장 실패' });
    }
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
    await Promise.all([loadMessages(), loadFiles(), loadLatestSummary()]);
    subscribeRealtime();
  } catch (error) {
    showPageError(error);
  }
}

initialize();
