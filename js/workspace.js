const API_BASE = 'https://linksphere-5bef.onrender.com/api';

let currentWorkspace   = null;
let currentChannelId   = null;
let currentChannelName = null;
let messagePolling     = null;
let attachedFiles      = [];

// ─── Smooth navigate ──────────────────────────────────────────────────────────

function navigateTo(url) {
  window.location.href = url;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function getToken() {
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = 'login.html'; return null; }
  return token;
}

function getUser() {
  return JSON.parse(localStorage.getItem('user') || 'null');
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────

function setChannelContent(html) {
  document.getElementById('channel-content').innerHTML = html;
}

function showChannelSpinner(message = 'Loading...') {
  setChannelContent(`<div class="spinner"></div><p class="status-msg">${message}</p>`);
}

function showChannelError(message) {
  setChannelContent(`<p class="status-msg error">⚠ ${message}</p>`);
}

function setSidebarWsName(name) {
  document.getElementById('sidebar-ws-name').textContent = name.toUpperCase();
  document.getElementById('profile-ws-name').textContent = name.toUpperCase();
  document.getElementById('profile-ws-slug').textContent = `#${name.toLowerCase()}`;
}

// ─── Chat panel open / close ──────────────────────────────────────────────────

function openChatPanel() {
  document.getElementById('chat-empty').style.display = 'none';
  document.getElementById('chat-inner').style.display = 'flex';
  document.getElementById('chat-panel').classList.add('mobile-open');
  document.querySelector('.sidebar').classList.add('hidden');
}

function closeChatPanel() {
  document.getElementById('chat-inner').style.display = 'none';
  document.getElementById('chat-empty').style.display = '';
  document.getElementById('chat-panel').classList.remove('mobile-open');
  document.querySelector('.sidebar').classList.remove('hidden');
}

// ─── Custom Modal ─────────────────────────────────────────────────────────────

function showModal({ title, label, placeholder, confirmText, onConfirm }) {
  const existing = document.getElementById('ls-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'ls-modal-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999;
  `;

  overlay.innerHTML = `
    <style>
      @keyframes lsSlideUp {
        from { transform: translateY(20px); opacity: 0 }
        to   { transform: translateY(0);    opacity: 1 }
      }
      #ls-modal {
        width: 340px; background: #fff;
        border: 2px solid #111;
        font-family: 'DM Sans', Arial, Helvetica, sans-serif;
        animation: lsSlideUp 0.2s ease;
      }
      #ls-modal-title {
        background: #111; color: #fff;
        font-size: 13px; font-weight: 900;
        letter-spacing: 0.15em; padding: 14px 18px;
        font-family: 'Black Han Sans', sans-serif;
      }
      #ls-modal-body { padding: 20px 18px; }
      #ls-modal-label {
        display: block; font-size: 10px; font-weight: 700;
        letter-spacing: 0.12em; color: #666; margin-bottom: 8px;
        text-transform: uppercase;
      }
      #ls-modal-input {
        width: 100%; height: 42px; border: 2px solid #111;
        padding: 0 12px; font-size: 14px;
        font-family: 'DM Sans', Arial, Helvetica, sans-serif;
        outline: none; background: #f4f4f4; box-sizing: border-box;
      }
      #ls-modal-input:focus { background: #fff; }
      #ls-modal-error {
        font-size: 11px; font-weight: 700; color: #cc1414;
        margin-top: 6px; min-height: 16px; display: block;
      }
      #ls-modal-actions { display: flex; border-top: 2px solid #111; }
      #ls-modal-cancel {
        flex: 1; height: 48px; border: none; border-right: 2px solid #111;
        background: #fff; font-size: 12px; font-weight: 700;
        letter-spacing: 0.12em; cursor: pointer;
        font-family: 'DM Sans', Arial, Helvetica, sans-serif;
        text-transform: uppercase;
      }
      #ls-modal-cancel:hover { background: #f4f4f4; }
      #ls-modal-confirm {
        flex: 1; height: 48px; border: none;
        background: #cc1414; color: #fff;
        font-size: 12px; font-weight: 700;
        letter-spacing: 0.12em; cursor: pointer;
        font-family: 'DM Sans', Arial, Helvetica, sans-serif;
        text-transform: uppercase;
      }
      #ls-modal-confirm:hover { background: #a00f0f; }
    </style>
    <div id="ls-modal">
      <div id="ls-modal-title">${title}</div>
      <div id="ls-modal-body">
        <label id="ls-modal-label" for="ls-modal-input">${label}</label>
        <input id="ls-modal-input" type="text" placeholder="${placeholder}" autocomplete="off" />
        <span id="ls-modal-error"></span>
      </div>
      <div id="ls-modal-actions">
        <button id="ls-modal-cancel">CANCEL</button>
        <button id="ls-modal-confirm">${confirmText}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const input   = document.getElementById('ls-modal-input');
  const error   = document.getElementById('ls-modal-error');
  const cancel  = document.getElementById('ls-modal-cancel');
  const confirm = document.getElementById('ls-modal-confirm');

  input.focus();

  function close() {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.15s ease';
    setTimeout(() => overlay.remove(), 150);
  }

  function submit() {
    const value = input.value.trim();
    if (!value) {
      error.textContent = 'This field cannot be empty.';
      input.style.borderColor = '#cc1414';
      input.focus();
      return;
    }
    close();
    onConfirm(value);
  }

  cancel.addEventListener('click', close);
  confirm.addEventListener('click', submit);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); submit(); }
    if (e.key === 'Escape') close();
    if (e.key !== 'Enter')  { error.textContent = ''; input.style.borderColor = '#111'; }
  });
}

// ─── Error Modal ──────────────────────────────────────────────────────────────

function showErrorModal(message) {
  const existing = document.getElementById('ls-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'ls-modal-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999;
  `;

  overlay.innerHTML = `
    <div style="
      width: 340px; background: #fff;
      border: 2px solid #111;
      font-family: 'DM Sans', Arial, Helvetica, sans-serif;
    ">
      <div style="background:#cc1414; color:#fff; font-size:13px; font-weight:900; letter-spacing:0.15em; padding:14px 18px;">
        ERROR
      </div>
      <div style="padding:20px 18px; font-size:13px; font-weight:600; color:#111; line-height:1.6;">
        ${message}
      </div>
      <div style="border-top: 2px solid #111;">
        <button id="ls-error-ok" style="
          width:100%; height:48px; border:none;
          background:#111; color:#fff;
          font-size:12px; font-weight:700; letter-spacing:0.12em;
          cursor:pointer; font-family:'DM Sans',Arial,Helvetica,sans-serif;
          text-transform:uppercase;
        ">OK</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  function close() {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.15s ease';
    setTimeout(() => overlay.remove(), 150);
  }

  document.getElementById('ls-error-ok').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape' || e.key === 'Enter') { close(); document.removeEventListener('keydown', onKey); }
  });
}

// ─── Workspace Icon Helper ────────────────────────────────────────────────────

function buildWorkspaceIcon(ws) {
  const icon = document.createElement('div');
  icon.className  = 'server-icon workspace';
  icon.title      = ws.name;
  icon.dataset.id = ws.workspace_id;

  if (ws.icon_url) {
    const img = document.createElement('img');
    img.src              = ws.icon_url;
    img.alt              = ws.name;
    img.style.cssText    = 'width:100%;height:100%;object-fit:cover;display:block;';
    icon.style.padding   = '0';
    icon.style.overflow  = 'hidden';
    icon.appendChild(img);
  } else {
    icon.textContent = ws.name.charAt(0).toUpperCase();
  }

  return icon;
}

// ─── File Upload Helpers ──────────────────────────────────────────────────────

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getFileIcon(file) {
  const t = file.type;
  if (t.startsWith('image/')) return '🖼️';
  if (t.startsWith('video/')) return '🎬';
  if (t.startsWith('audio/')) return '🎵';
  if (t.includes('pdf'))      return '📄';
  if (t.includes('zip') || t.includes('rar')) return '🗜️';
  if (t.includes('word') || t.includes('document')) return '📝';
  if (t.includes('sheet') || t.includes('excel') || t.includes('csv')) return '📊';
  return '📎';
}

function renderAttachmentPreview() {
  const preview = document.getElementById('attachments-preview');
  if (!preview) return;

  if (!attachedFiles.length) {
    preview.style.display = 'none';
    return;
  }

  preview.style.display = 'flex';
  preview.innerHTML = '';

  attachedFiles.forEach((file, idx) => {
    const item = document.createElement('div');
    item.className = 'attach-item';

    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      item.innerHTML = `
        <img class="attach-thumb" src="${url}" alt="${escapeHtml(file.name)}" />
        <div class="attach-info">
          <div class="attach-name">${escapeHtml(file.name)}</div>
          <div class="attach-size">${formatSize(file.size)}</div>
        </div>
        <button class="attach-remove" data-idx="${idx}">✕</button>`;
    } else {
      item.innerHTML = `
        <span class="attach-icon">${getFileIcon(file)}</span>
        <div class="attach-info">
          <div class="attach-name">${escapeHtml(file.name)}</div>
          <div class="attach-size">${formatSize(file.size)}</div>
        </div>
        <button class="attach-remove" data-idx="${idx}">✕</button>`;
    }

    preview.appendChild(item);
  });

  preview.querySelectorAll('.attach-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      attachedFiles.splice(parseInt(e.currentTarget.dataset.idx), 1);
      renderAttachmentPreview();
    });
  });
}

// ─── Load Workspaces ──────────────────────────────────────────────────────────

async function loadWorkspaces() {
  const token = getToken();
  if (!token) return;

  setSidebarWsName('Loading');
  showChannelSpinner('Connecting to server...');

  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(`${API_BASE}/workspaces`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal:  controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json();

    if (!res.ok) {
      setSidebarWsName('Error');
      showChannelError(data.error || 'Failed to load workspaces.');
      return;
    }

    renderWorkspaces(data);

  } catch (err) {
    if (err.name === 'AbortError') {
      setSidebarWsName('Offline');
      showChannelError('Server is waking up (Render cold start). Please refresh in 30 seconds.');
    } else {
      setSidebarWsName('Error');
      showChannelError('Could not reach the server. Check your connection.');
    }
    console.error('Error loading workspaces:', err);
  }
}

// ─── Render Workspaces ────────────────────────────────────────────────────────

function renderWorkspaces(workspaces) {
  const serverBar = document.querySelector('.server-bar');
  serverBar.querySelectorAll('.server-icon.workspace').forEach(el => el.remove());
  const addBtn = serverBar.querySelector('.add-btn');

  if (!workspaces.length) {
    setSidebarWsName('No Workspace');
    setChannelContent('<p class="status-msg">Create or join a workspace to get started.</p>');
    return;
  }

  workspaces.forEach(ws => {
    const icon = buildWorkspaceIcon(ws);
    icon.addEventListener('click', () => loadWorkspace(ws));
    serverBar.insertBefore(icon, addBtn);
  });

  window.addEventListener('workspace:icon_updated', (e) => {
    const { workspaceId, iconUrl } = e.detail;
    const el = serverBar.querySelector(`.server-icon.workspace[data-id="${workspaceId}"]`);
    if (!el) return;
    if (iconUrl) {
      el.textContent  = '';
      el.style.padding  = '0';
      el.style.overflow = 'hidden';
      const img = document.createElement('img');
      img.src           = iconUrl;
      img.alt           = '';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
      el.appendChild(img);
    } else {
      el.innerHTML = el.title.charAt(0).toUpperCase();
    }
  });

  loadWorkspace(workspaces[0]);
}

// ─── Load Workspace ───────────────────────────────────────────────────────────

async function loadWorkspace(workspace) {
  const token = getToken();
  if (!token) return;

  if (messagePolling) { clearInterval(messagePolling); messagePolling = null; }

  currentWorkspace = workspace;
  setSidebarWsName(workspace.name);
  showChannelSpinner('Loading channels...');
  closeChatPanel();

  document.querySelectorAll('.server-icon.workspace').forEach(icon => {
    icon.classList.toggle('active-ws', icon.dataset.id === workspace.workspace_id);
  });

  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`${API_BASE}/channels?workspace_id=${workspace.workspace_id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal:  controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json();

    if (!res.ok) {
      showChannelError(data.error || 'Failed to load channels.');
      return;
    }

    renderChannels(data);

  } catch (err) {
    showChannelError(
      err.name === 'AbortError'
        ? 'Request timed out. Please try again.'
        : 'Could not load channels. Check your connection.'
    );
    console.error('Error loading channels:', err);
  }
}

// ─── Render Channels ──────────────────────────────────────────────────────────

function renderChannels(channels) {
  const content = document.getElementById('channel-content');

  const header = document.createElement('h4');
  header.innerHTML = `TEXT CHANNELS <button id="add-channel-btn" title="Add Channel">+</button>`;
  content.innerHTML = '';
  content.appendChild(header);

  document.getElementById('add-channel-btn').addEventListener('click', () => {
    showModal({
      title:       'CREATE CHANNEL',
      label:       'CHANNEL NAME',
      placeholder: 'e.g. announcements',
      confirmText: 'CREATE',
      onConfirm:   (name) => createChannel(name),
    });
  });

  if (!channels.length) {
    const empty = document.createElement('p');
    empty.className   = 'status-msg';
    empty.textContent = 'No channels yet. Create one!';
    content.appendChild(empty);
    return;
  }

  channels.forEach(ch => {
    const btn = document.createElement('button');
    btn.className    = 'channel';
    btn.dataset.id   = ch.channel_id;
    btn.dataset.name = ch.name;
    btn.innerHTML    = `<span>#</span> ${escapeHtml(ch.name)}`;

    btn.addEventListener('click', () => {
      document.querySelectorAll('.channel').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      openChannel(ch.channel_id, ch.name);
    });

    content.appendChild(btn);
  });

  const first = content.querySelector('.channel');
  if (first) first.click();
  
  // Attach the sidebar add button listener
  attachChannelButtonListener();
}

// ─── Create Channel ───────────────────────────────────────────────────────────

async function createChannel(name, type = 'text') {
  const token = getToken();
  if (!token || !currentWorkspace) return;

  try {
    const res  = await fetch(`${API_BASE}/channels`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, type, workspace_id: currentWorkspace.workspace_id }),
    });
    const data = await res.json();
    if (!res.ok) { showErrorModal(data.error || 'Failed to create channel'); return; }
    loadWorkspace(currentWorkspace);
  } catch (err) {
    console.error('Error creating channel:', err);
    showErrorModal('Could not create channel. Check your connection.');
  }
}

// ─── Open Channel ─────────────────────────────────────────────────────────────

function openChannel(channelId, channelName) {
  if (messagePolling) { clearInterval(messagePolling); messagePolling = null; }

  currentChannelId   = channelId;
  currentChannelName = channelName;

  document.querySelector('.chat-channel-name').textContent = `# ${channelName}`;
  document.getElementById('chat-input').placeholder        = `Message #${channelName}`;
  document.getElementById('chat-messages').innerHTML       = '<div class="spinner"></div>';

  // Clear any leftover attachments from the previous channel
  attachedFiles = [];
  renderAttachmentPreview();

  openChatPanel();

  loadMessages(channelId);
  messagePolling = setInterval(() => loadMessages(channelId), 8000);
}

// ─── Load Messages ────────────────────────────────────────────────────────────

async function loadMessages(channelId) {
  const token = getToken();
  if (!token) return;

  try {
    const res  = await fetch(`${API_BASE}/channels/${channelId}/messages`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) { console.error('Failed to load messages:', data); return; }
    renderMessages(data);
  } catch (err) {
    console.error('Error loading messages:', err);
  }
}

// ─── Render Messages ──────────────────────────────────────────────────────────

function renderMessages(messages) {
  const container = document.getElementById('chat-messages');
  const user      = getUser();

  if (!messages.length) {
    container.innerHTML = '<p class="no-messages">No messages yet. Say hello! 👋</p>';
    return;
  }

  const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;

  container.innerHTML = messages.map(msg => {
    const isMe = msg.user?.user_id === user?.user_id;
    const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="message ${isMe ? 'mine' : ''}">
        <div class="message-meta">
          <strong>${isMe ? 'You' : escapeHtml(msg.user?.name || 'Unknown')}</strong>
          <span class="message-time">${time}</span>
        </div>
        <div class="message-bubble">${escapeHtml(msg.content)}</div>
      </div>
    `;
  }).join('');

  if (isAtBottom) container.scrollTop = container.scrollHeight;
}

// ─── Send Message ─────────────────────────────────────────────────────────────

async function sendMessage() {
  const token   = getToken();
  const input   = document.getElementById('chat-input');
  const content = input.value.trim();
  const files   = [...attachedFiles];

  if (!token || (!content && !files.length) || !currentChannelId) return;

  input.value   = '';
  attachedFiles = [];
  renderAttachmentPreview();

  // ── Send text message ─────────────────────────────────────────────────────
  if (content) {
    try {
      const res = await fetch(`${API_BASE}/channels/${currentChannelId}/messages`, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ content, channel_id: currentChannelId }),
      });
      const data = await res.json();
      if (!res.ok) { console.error('Failed to send message:', data); }
    } catch (err) {
      console.error('Error sending message:', err);
    }
  }

  // ── Render file attachments locally ───────────────────────────────────────
  // When your backend supports file uploads, replace this block with a
  // FormData + fetch call to your upload endpoint, then call loadMessages().
  if (files.length) {
    const container = document.getElementById('chat-messages');
    const time      = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const msgEl = document.createElement('div');
    msgEl.className = 'message mine';

    let filesHtml = '';
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        filesHtml += `<img class="message-img" src="${url}" alt="${escapeHtml(file.name)}" />`;
      } else {
        filesHtml += `
          <div class="message-file">
            <span class="message-file-icon">${getFileIcon(file)}</span>
            <div>
              <div class="message-file-name">${escapeHtml(file.name)}</div>
              <div class="message-file-size">${formatSize(file.size)}</div>
            </div>
          </div>`;
      }
    });

    msgEl.innerHTML = `
      <div class="message-meta">
        <strong>You</strong>
        <span class="message-time">${time}</span>
      </div>
      ${filesHtml}`;

    container.appendChild(msgEl);
    container.scrollTop = container.scrollHeight;
  }

  loadMessages(currentChannelId);
}

// ─── XSS Guard ───────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

document.getElementById('send-btn').addEventListener('click', sendMessage);

document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

document.getElementById('file-input').addEventListener('change', e => {
  attachedFiles.push(...Array.from(e.target.files));
  e.target.value = '';
  renderAttachmentPreview();
});

document.querySelector('.back-to-channels').addEventListener('click', () => {
  closeChatPanel();
  attachedFiles = [];
  renderAttachmentPreview();
  document.querySelectorAll('.channel').forEach(c => c.classList.remove('active'));
  if (messagePolling) { clearInterval(messagePolling); messagePolling = null; }
});

document.querySelector('.settings').addEventListener('click', () => {
  if (currentWorkspace) {
    sessionStorage.setItem('settings_ws_id', currentWorkspace.workspace_id);
  }
  navigateTo('../html/server-settings.html');
});

document.querySelector('.server-icon.logo').addEventListener('click', () => {
  navigateTo('messages.html');
});

document.querySelector('.add-btn').addEventListener('click', () => {
  document.querySelector('.add-btn').animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.2) rotate(90deg)' }, { transform: 'scale(1)' }],
    { duration: 400, easing: 'ease' }
  );
  showModal({
    title:       'CREATE WORKSPACE',
    label:       'WORKSPACE NAME',
    placeholder: 'e.g. Design Team',
    confirmText: 'CREATE',
    onConfirm:   (name) => { if (name && name.trim()) createWorkspace(name.trim()); },
  });
});

// ─── Add Channel Button ────────────────────────────────────────────────────────

function attachChannelButtonListener() {
  const sidebarAddBtn = document.querySelector('.sidebar-add-btn');
  if (!sidebarAddBtn) return;
  
  // Clear old listener by cloning and replacing
  const newBtn = sidebarAddBtn.cloneNode(true);
  sidebarAddBtn.parentNode.replaceChild(newBtn, sidebarAddBtn);
  
  newBtn.addEventListener('click', showChannelTypeModal);
}

function showChannelTypeModal() {
  const existing = document.getElementById('channel-type-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'channel-type-modal-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999;
  `;

  overlay.innerHTML = `
    <style>
      @keyframes modalSlideUp {
        from { transform: translateY(20px); opacity: 0 }
        to   { transform: translateY(0);    opacity: 1 }
      }
      #channel-type-modal {
        width: 340px; background: #fff;
        border: 2px solid #111;
        font-family: 'DM Sans', Arial, Helvetica, sans-serif;
        animation: modalSlideUp 0.2s ease;
      }
      #channel-type-modal-title {
        background: #111; color: #fff;
        font-size: 13px; font-weight: 900;
        letter-spacing: 0.15em; padding: 14px 18px;
        font-family: 'Black Han Sans', sans-serif;
        text-transform: uppercase;
      }
      #channel-type-modal-body {
        padding: 20px 18px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .channel-type-btn {
        border: 2px solid #111;
        background: #fff;
        padding: 14px 16px;
        font-family: 'DM Sans', Arial, sans-serif;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 12px;
        transition: background 0.15s, transform 0.1s;
      }
      .channel-type-btn:hover {
        background: #f4f4f4;
        transform: translateY(-2px);
        box-shadow: 0 4px 0 #111;
      }
      .channel-type-icon {
        font-size: 18px;
        font-weight: 900;
        color: #cc1414;
      }
    </style>
    <div id="channel-type-modal">
      <div id="channel-type-modal-title">CREATE CHANNEL</div>
      <div id="channel-type-modal-body">
        <button class="channel-type-btn" data-type="text">
          <span class="channel-type-icon">#</span>
          <span>Text Channel</span>
        </button>
        <button class="channel-type-btn" data-type="voice">
          <span class="channel-type-icon">🔊</span>
          <span>Voice Channel</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  document.querySelectorAll('.channel-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      close();
      
      showModal({
        title:       `CREATE ${type.toUpperCase()} CHANNEL`,
        label:       'CHANNEL NAME',
        placeholder: type === 'text' ? 'e.g. general' : 'e.g. lobby',
        confirmText: 'CREATE',
        onConfirm:   (name) => {
          if (name && name.trim() && currentWorkspace) {
            createChannel(name.trim(), type);
          }
        },
      });
    });
  });
}

// Attach listener on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachChannelButtonListener);
} else {
  attachChannelButtonListener();
}

// ─── Create Workspace ─────────────────────────────────────────────────────────

async function createWorkspace(name) {
  const token = getToken();
  if (!token) return;

  try {
    const res  = await fetch(`${API_BASE}/workspaces`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) { showErrorModal(data.error || 'Failed to create workspace'); return; }
    loadWorkspaces();
  } catch (err) {
    console.error('Error creating workspace:', err);
    showErrorModal('Could not create workspace. Check your connection.');
  }
}

// ─── Join Workspace ───────────────────────────────────────────────────────────

async function joinWorkspace(code) {
  const token = getToken();
  if (!token) return;

  setSidebarWsName('Joining');
  showChannelSpinner('Joining workspace...');

  try {
    const res  = await fetch(`${API_BASE}/workspaces/join`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ invite_code: code }),
    });
    const data = await res.json();
    if (!res.ok) {
      showErrorModal(data.error || 'Invalid invite code. Please try again.');
      showChannelError(data.error || 'Failed to join workspace.');
      return;
    }
    loadWorkspaces();
  } catch (err) {
    console.error('Error joining workspace:', err);
    showChannelError('Could not join workspace. Check your connection.');
  }
}

// ─── Load Workspaces and open a specific one ──────────────────────────────────

async function loadWorkspacesAndOpen(targetId) {
  const token = getToken();
  if (!token) return;

  setSidebarWsName('Loading');
  showChannelSpinner('Loading workspace...');

  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(`${API_BASE}/workspaces`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal:  controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json();

    if (!res.ok) {
      setSidebarWsName('Error');
      showChannelError(data.error || 'Failed to load workspaces.');
      return;
    }

    renderWorkspaces(data);

    const target = data.find(ws => ws.workspace_id === targetId);
    if (target) loadWorkspace(target);

  } catch (err) {
    if (err.name === 'AbortError') {
      setSidebarWsName('Offline');
      showChannelError('Server is waking up. Please refresh in 30 seconds.');
    } else {
      setSidebarWsName('Error');
      showChannelError('Could not reach the server. Check your connection.');
    }
    console.error('Error loading workspaces:', err);
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const action = sessionStorage.getItem('ws_action');
  const openId = sessionStorage.getItem('ws_open_id');

  if (action === 'create') {
    const name = sessionStorage.getItem('ws_name');
    sessionStorage.removeItem('ws_action');
    sessionStorage.removeItem('ws_name');
    if (name) await createWorkspace(name);
    else loadWorkspaces();

  } else if (action === 'join') {
    const code = sessionStorage.getItem('ws_code');
    sessionStorage.removeItem('ws_action');
    sessionStorage.removeItem('ws_code');
    if (code) await joinWorkspace(code);
    else loadWorkspaces();

  } else if (openId) {
    sessionStorage.removeItem('ws_open_id');
    await loadWorkspacesAndOpen(openId);

  } else {
    loadWorkspaces();
  }
}

init();