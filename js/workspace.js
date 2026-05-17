const API_BASE = 'https://linksphere-5bef.onrender.com/api';

let currentWorkspace   = null;
let currentChannelId   = null;
let currentChannelName = null;
let messagePolling     = null;

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

function setChannelHeader(text) {
  document.querySelector('.channels header').textContent = text;
}

function setChannelContent(html) {
  document.querySelector('.channel-content').innerHTML = html;
}

function showChannelSpinner(message = 'Loading...') {
  setChannelContent(`
    <div class="spinner"></div>
    <p class="status-msg">${message}</p>
  `);
}

function showChannelError(message) {
  setChannelContent(`<p class="status-msg error">⚠ ${message}</p>`);
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
        width: 320px; background: #fff;
        border: 2px solid #000;
        font-family: Arial, Helvetica, sans-serif;
        animation: lsSlideUp 0.2s ease;
      }
      #ls-modal-title {
        background: #000; color: #fff;
        font-size: 13px; font-weight: 900;
        letter-spacing: 3px; padding: 14px 18px;
      }
      #ls-modal-body { padding: 20px 18px; }
      #ls-modal-label {
        display: block; font-size: 11px; font-weight: 900;
        letter-spacing: 1.5px; color: #5e5e5e; margin-bottom: 8px;
      }
      #ls-modal-input {
        width: 100%; height: 42px; border: 2px solid #000;
        padding: 0 12px; font-size: 14px; font-weight: 600;
        font-family: Arial, Helvetica, sans-serif;
        outline: none; background: #f9f9f9; box-sizing: border-box;
      }
      #ls-modal-input:focus { background: #fff; }
      #ls-modal-error {
        font-size: 11px; font-weight: 700; color: #dc2626;
        margin-top: 6px; min-height: 16px; display: block;
      }
      #ls-modal-actions { display: flex; border-top: 2px solid #000; }
      #ls-modal-cancel {
        flex: 1; height: 48px; border: none; border-right: 2px solid #000;
        background: #fff; font-size: 12px; font-weight: 900;
        letter-spacing: 2px; cursor: pointer; font-family: Arial, Helvetica, sans-serif;
      }
      #ls-modal-cancel:hover { background: #f0f0f0; }
      #ls-modal-confirm {
        flex: 1; height: 48px; border: none;
        background: #dc2626; color: #fff;
        font-size: 12px; font-weight: 900;
        letter-spacing: 2px; cursor: pointer; font-family: Arial, Helvetica, sans-serif;
      }
      #ls-modal-confirm:hover { background: #bc0100; }
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
      input.style.borderColor = '#dc2626';
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
    if (e.key !== 'Enter')  { error.textContent = ''; input.style.borderColor = '#000'; }
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
    <div id="ls-modal" style="
      width: 320px; background: #fff;
      border: 2px solid #000;
      font-family: Arial, Helvetica, sans-serif;
      animation: lsSlideUp 0.2s ease;
    ">
      <div style="background:#dc2626; color:#fff; font-size:13px; font-weight:900; letter-spacing:3px; padding:14px 18px;">
        ERROR
      </div>
      <div style="padding: 20px 18px; font-size:13px; font-weight:700; color:#000; line-height:1.5;">
        ${message}
      </div>
      <div style="border-top: 2px solid #000;">
        <button id="ls-error-ok" style="
          width:100%; height:48px; border:none;
          background:#000; color:#fff;
          font-size:12px; font-weight:900; letter-spacing:2px;
          cursor:pointer; font-family:Arial,Helvetica,sans-serif;
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

// ─── Load Workspaces ──────────────────────────────────────────────────────────

async function loadWorkspaces() {
  const token = getToken();
  if (!token) return;

  setChannelHeader('LOADING...');
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
      setChannelHeader('ERROR');
      showChannelError(data.error || 'Failed to load workspaces.');
      return;
    }

    renderWorkspaces(data);

  } catch (err) {
    if (err.name === 'AbortError') {
      setChannelHeader('OFFLINE');
      showChannelError('Server is waking up (Render cold start). Please refresh in 30 seconds.');
    } else {
      setChannelHeader('ERROR');
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
    setChannelHeader('NO WORKSPACE');
    setChannelContent('<p class="status-msg">Create or join a workspace to get started.</p>');
    return;
  }

  workspaces.forEach(ws => {
    const icon = document.createElement('div');
    icon.className   = 'server-icon workspace';
    icon.title       = ws.name;
    icon.textContent = ws.name.charAt(0).toUpperCase();
    icon.dataset.id  = ws.workspace_id;
    icon.addEventListener('click', () => loadWorkspace(ws));
    serverBar.insertBefore(icon, addBtn);
  });

  loadWorkspace(workspaces[0]);
}

// ─── Load Workspace ───────────────────────────────────────────────────────────

async function loadWorkspace(workspace) {
  const token = getToken();
  if (!token) return;

  // Stop any existing message polling when switching workspaces
  if (messagePolling) { clearInterval(messagePolling); messagePolling = null; }

  currentWorkspace = workspace;

  setChannelHeader(workspace.name.toUpperCase());
  document.querySelector('.profile-left strong').textContent = workspace.name.toUpperCase();
  document.querySelector('.profile-left p').textContent      = `#${workspace.name.toLowerCase()}`;

  showChannelSpinner('Loading channels...');

  document.querySelectorAll('.server-icon.workspace').forEach(icon => {
    icon.style.background = icon.dataset.id === workspace.workspace_id ? '#dc2626' : '#fff';
    icon.style.color      = icon.dataset.id === workspace.workspace_id ? '#fff'    : '#000';
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
    if (err.name === 'AbortError') {
      showChannelError('Request timed out. Please try again.');
    } else {
      showChannelError('Could not load channels. Check your connection.');
    }
    console.error('Error loading channels:', err);
  }
}

// ─── Render Channels ──────────────────────────────────────────────────────────

function renderChannels(channels) {
  setChannelContent(`
    <h4>TEXT CHANNELS
      <button id="add-channel-btn" style="
        border: none;
        background: none;
        font-size: 18px;
        cursor: pointer;
        float: right;
        margin-right: 16px;
        font-weight: 900;
        color: #dc2626;
      " title="Add Channel">+</button>
    </h4>
    ${channels.length
      ? channels.map(ch => `
          <button class="channel" data-id="${ch.channel_id}" data-name="${escapeHtml(ch.name)}">
            <span>#</span> ${escapeHtml(ch.name)}
          </button>
        `).join('')
      : '<p class="status-msg">No channels yet. Create one!</p>'
    }
  `);

  document.getElementById('add-channel-btn').addEventListener('click', () => {
    showModal({
      title:       'CREATE CHANNEL',
      label:       'CHANNEL NAME',
      placeholder: 'e.g. announcements',
      confirmText: 'CREATE',
      onConfirm:   (name) => createChannel(name),
    });
  });

  document.querySelectorAll('.channel').forEach(channel => {
    channel.addEventListener('click', () => {
      document.querySelectorAll('.channel').forEach(c => c.classList.remove('active'));
      channel.classList.add('active');
      openChannel(channel.dataset.id, channel.dataset.name);
    });
  });

  const first = document.querySelector('.channel-content .channel');
  if (first) first.click();
}

// ─── Create Channel ───────────────────────────────────────────────────────────

async function createChannel(name) {
  const token = getToken();
  if (!token || !currentWorkspace) return;

  try {
    const res  = await fetch(`${API_BASE}/channels`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, workspace_id: currentWorkspace.workspace_id }),
    });
    const data = await res.json();
    if (!res.ok) {
      showErrorModal(data.error || 'Failed to create channel');
      return;
    }
    loadWorkspace(currentWorkspace);
  } catch (err) {
    console.error('Error creating channel:', err);
    showErrorModal('Could not create channel. Check your connection.');
  }
}

// ─── Open Channel ─────────────────────────────────────────────────────────────

function openChannel(channelId, channelName) {
  // Stop previous polling before starting a new one
  if (messagePolling) { clearInterval(messagePolling); messagePolling = null; }

  currentChannelId   = channelId;
  currentChannelName = channelName;

  document.querySelector('.chat-channel-name').textContent = `# ${channelName}`;
  document.getElementById('chat-input').placeholder        = `Message #${channelName}`;
  document.querySelector('.chat-panel').classList.add('active');

  document.getElementById('chat-messages').innerHTML = '<div class="spinner"></div>';

  loadMessages(channelId);

  // Poll every 8 seconds to avoid hitting the rate limiter
  messagePolling = setInterval(() => loadMessages(channelId), 8000);
}

// ─── Load Messages ────────────────────────────────────────────────────────────

async function loadMessages(channelId) {
  const token = getToken();
  if (!token) return;

  try {
    // ✅ Fixed URL: /api/channels/:channelId/messages
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
  if (!token || !content || !currentChannelId) return;
  input.value = '';

  try {
    // ✅ Fixed URL: /api/channels/:channelId/messages
    const res = await fetch(`${API_BASE}/channels/${currentChannelId}/messages`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ content, channel_id: currentChannelId }),
    });
    const data = await res.json();
    if (!res.ok) { console.error('Failed to send message:', data); return; }
    loadMessages(currentChannelId);
  } catch (err) {
    console.error('Error sending message:', err);
  }
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

// ─── Send Button & Enter Key ──────────────────────────────────────────────────

document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

// ─── Back to Channels (mobile) ────────────────────────────────────────────────

document.querySelector('.back-to-channels').addEventListener('click', () => {
  document.querySelector('.chat-panel').classList.remove('active');
  if (messagePolling) { clearInterval(messagePolling); messagePolling = null; }
});

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

// ─── Add Workspace Button ─────────────────────────────────────────────────────

const addBtn = document.querySelector('.add-btn');
addBtn.addEventListener('click', () => {
  addBtn.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.2) rotate(90deg)' }, { transform: 'scale(1)' }],
    { duration: 400, easing: 'ease' }
  );
  showModal({
    title: 'CREATE WORKSPACE',
    label: 'WORKSPACE NAME',
    placeholder: 'e.g. Design Team',
    confirmText: 'CREATE',
    onConfirm: (name) => { if (name && name.trim()) createWorkspace(name.trim()); }
  });
});

// ─── Bottom Nav ───────────────────────────────────────────────────────────────

const navButtons = document.querySelectorAll('.bottom-nav button');
navButtons.forEach(button => {
  button.addEventListener('click', () => {
    navButtons.forEach(item => item.classList.remove('active-nav'));
    button.classList.add('active-nav');
  });
});
navButtons[0].addEventListener('click', () => { window.location.href = 'interface.html'; });

// ─── Settings ─────────────────────────────────────────────────────────────────

document.querySelector('.settings').addEventListener('click', () => {
  window.location.href = 'profile.html';
});

// ─── Join Workspace ───────────────────────────────────────────────────────────

async function joinWorkspace(code) {
  const token = getToken();
  if (!token) return;

  setChannelHeader('JOINING...');
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

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const action = sessionStorage.getItem('ws_action');

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

  } else {
    loadWorkspaces();
  }
}

init();