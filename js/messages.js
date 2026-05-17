const API_BASE = 'https://linksphere-5bef.onrender.com/api';

let currentDmUser = null;
let dmPolling     = null;

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function timeAgo(dateStr) {
  const now  = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60)     return 'NOW';
  if (diff < 3600)   return `${Math.floor(diff / 60)}M AGO`;
  if (diff < 86400)  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 604800) return 'YESTERDAY';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase();
}

function avatarEl(name, avatarUrl, className = 'avatar') {
  const el = document.createElement('div');
  el.className = className;
  if (avatarUrl) {
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = name;
    el.appendChild(img);
  } else {
    el.textContent = (name || '?').charAt(0).toUpperCase();
  }
  return el;
}

// ─── Self Info ────────────────────────────────────────────────────────────────

function populateSelfInfo() {
  const me = getUser();
  if (!me) return;
  const nameEl   = document.getElementById('self-name-el');
  const avatarEl = document.getElementById('self-avatar-el');
  if (nameEl)   nameEl.textContent = (me.name || 'YOU').toUpperCase();
  if (avatarEl) {
    if (me.avatar_url) {
      const img = document.createElement('img');
      img.src = me.avatar_url;
      img.alt = me.name;
      avatarEl.innerHTML = '';
      avatarEl.appendChild(img);
    } else {
      avatarEl.textContent = (me.name || 'Y').charAt(0).toUpperCase();
    }
  }
}

// ─── Sidebar search filter ────────────────────────────────────────────────────

document.getElementById('sidebar-search-input').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('#conversation-list .message-card').forEach(card => {
    const name = card.dataset.name || '';
    card.style.display = name.toLowerCase().includes(q) ? '' : 'none';
  });
});

// ─── Load Conversations ───────────────────────────────────────────────────────

async function loadConversations() {
  const token = getToken();
  if (!token) return;

  const list = document.getElementById('conversation-list');
  list.innerHTML = '<div class="spinner"></div>';

  try {
    const res  = await fetch(`${API_BASE}/dm/conversations`, {  // ✅ Fixed
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json();

    if (!res.ok) {
      list.innerHTML = `<p class="empty-state">⚠ ${escapeHtml(data.error || 'Failed to load.')}</p>`;
      return;
    }

    renderConversations(data);
  } catch (err) {
    list.innerHTML = '<p class="empty-state"><span class="empty-icon">⚠</span>Could not reach server.</p>';
    console.error(err);
  }
}

function renderConversations(conversations) {
  const list = document.getElementById('conversation-list');

  if (!conversations.length) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">✉</span>
        NO MESSAGES YET<br>TAP + TO START A CONVERSATION
      </div>
    `;
    return;
  }

  list.innerHTML = '';
  conversations.forEach((conv, i) => {
    const card = document.createElement('article');
    card.className        = 'message-card';
    card.dataset.name     = conv.name || '';
    card.style.animationDelay = `${i * 0.05}s`;

    const av = avatarEl(conv.name, conv.avatar_url);

    const info = document.createElement('div');
    info.className = 'message-info';
    info.innerHTML = `
      <div class="message-top">
        <h3>${escapeHtml(conv.name || 'Unknown')}</h3>
        <span>${conv.last_message_at ? timeAgo(conv.last_message_at) : ''}</span>
      </div>
      <p>${escapeHtml(conv.last_message || 'No messages yet')}</p>
    `;

    card.appendChild(av);
    card.appendChild(info);

    if (conv.unread_count > 0) {
      const badge = document.createElement('div');
      badge.className   = 'unread-badge';
      badge.textContent = conv.unread_count > 9 ? '9+' : conv.unread_count;
      card.appendChild(badge);
    }

    card.addEventListener('click', () => {
      document.querySelectorAll('#conversation-list .message-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      card.classList.add('clicked');
      setTimeout(() => card.classList.remove('clicked'), 250);

      const badge = card.querySelector('.unread-badge');
      if (badge) badge.remove();

      openDm(conv);
    });

    list.appendChild(card);
  });
}

// ─── Open DM Panel ────────────────────────────────────────────────────────────

function openDm(user) {
  currentDmUser = user;

  const panelAvatar = document.getElementById('dm-panel-avatar');
  if (user.avatar_url) {
    const img = document.createElement('img');
    img.src = user.avatar_url;
    img.alt = user.name;
    panelAvatar.innerHTML = '';
    panelAvatar.appendChild(img);
  } else {
    panelAvatar.textContent = (user.name || '?').charAt(0).toUpperCase();
  }

  document.getElementById('dm-panel-name').textContent    = user.name || 'Unknown';
  document.getElementById('dm-input').placeholder         = `Message ${user.name || ''}...`;
  document.getElementById('dm-messages').innerHTML        = '<div class="spinner"></div>';

  document.getElementById('chat-empty').style.display = 'none';
  document.getElementById('chat-inner').style.display = 'flex';

  document.getElementById('dm-panel').classList.add('open');
  if (window.innerWidth <= 700) document.querySelector('.sidebar').classList.add('hidden');

  loadDmMessages();
  if (dmPolling) clearInterval(dmPolling);
  dmPolling = setInterval(loadDmMessages, 6000);
}

function closeDm() {
  document.getElementById('chat-inner').style.display = 'none';
  document.getElementById('chat-empty').style.display = '';

  document.getElementById('dm-panel').classList.remove('open');
  if (window.innerWidth <= 700) document.querySelector('.sidebar').classList.remove('hidden');

  document.querySelectorAll('#conversation-list .message-card').forEach(c => c.classList.remove('active'));

  if (dmPolling) { clearInterval(dmPolling); dmPolling = null; }
  currentDmUser = null;
  loadConversations();
}

// ─── Load DM Messages ─────────────────────────────────────────────────────────

async function loadDmMessages() {
  if (!currentDmUser) return;
  const token = getToken();
  if (!token) return;

  const container = document.getElementById('dm-messages');

  try {
    const res  = await fetch(`${API_BASE}/dm/${currentDmUser.user_id}`, {  // ✅ Fixed
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('Failed to load DMs:', data);
      container.innerHTML = '<p class="no-dm-messages">⚠ Failed to load messages.</p>';
      return;
    }
    renderDmMessages(data);
  } catch (err) {
    console.error('Error loading DMs:', err);
    container.innerHTML = '<p class="no-dm-messages">⚠ Could not reach server.</p>';
  }
}

function renderDmMessages(messages) {
  const container = document.getElementById('dm-messages');
  const me        = getUser();

  if (!messages.length) {
    container.innerHTML = '<p class="no-dm-messages">NO MESSAGES YET<br>SAY HELLO! 👋</p>';
    return;
  }

  const wasAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 60;

  container.innerHTML = messages.map(msg => {
    const isMe = msg.sender_id === me?.user_id;
    const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="dm-message ${isMe ? 'mine' : 'theirs'}">
        <div class="dm-bubble">${escapeHtml(msg.content)}</div>
        <span class="dm-meta">${time}</span>
      </div>
    `;
  }).join('');

  if (wasAtBottom) container.scrollTop = container.scrollHeight;
}

// ─── Send DM ──────────────────────────────────────────────────────────────────

async function sendDm() {
  if (!currentDmUser) return;
  const token   = getToken();
  const input   = document.getElementById('dm-input');
  const content = input.value.trim();
  if (!token || !content) return;
  input.value = '';
  input.style.height = 'auto';

  try {
    const res = await fetch(`${API_BASE}/dm`, {  // ✅ Fixed
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ receiver_id: currentDmUser.user_id, content }),
    });
    if (!res.ok) { console.error('Failed to send DM'); return; }
    loadDmMessages();
  } catch (err) {
    console.error('Error sending DM:', err);
  }
}

// ─── Auto-resize textarea ─────────────────────────────────────────────────────

document.getElementById('dm-input').addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

// ─── User Search (New DM) ─────────────────────────────────────────────────────

let searchTimeout = null;

function openNewDmModal() {
  document.getElementById('new-dm-modal').style.display = 'flex';
  document.getElementById('user-search-input').value    = '';
  document.getElementById('user-search-results').innerHTML = '';
  setTimeout(() => document.getElementById('user-search-input').focus(), 100);
}

function closeNewDmModal() {
  document.getElementById('new-dm-modal').style.display = 'none';
}

document.getElementById('user-search-input').addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  const query = e.target.value.trim();
  if (!query) {
    document.getElementById('user-search-results').innerHTML = '';
    return;
  }
  searchTimeout = setTimeout(() => searchUsers(query), 300);
});

async function searchUsers(query) {
  const token = getToken();
  if (!token) return;

  const results = document.getElementById('user-search-results');
  results.innerHTML = '<div class="spinner" style="margin:16px auto;width:20px;height:20px;border-width:3px;"></div>';

  try {
    const res  = await fetch(`${API_BASE}/users/search?query=${encodeURIComponent(query)}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json();

    if (!res.ok || !data.length) {
      results.innerHTML = '<p style="font-size:12px;font-weight:700;color:#999;padding:8px;">No users found.</p>';
      return;
    }

    const me = getUser();
    results.innerHTML = '';
    data
      .filter(u => u.user_id !== me?.user_id)
      .forEach(user => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.innerHTML = `
          <div class="search-result-avatar">${(user.name || '?').charAt(0).toUpperCase()}</div>
          <div class="search-result-info">
            <strong>${escapeHtml(user.name || 'Unknown')}</strong>
            <span>${escapeHtml(user.email || '')}</span>
          </div>
        `;
        item.addEventListener('click', () => {
          closeNewDmModal();
          openDm(user);
        });
        results.appendChild(item);
      });
  } catch (err) {
    results.innerHTML = '<p style="font-size:12px;font-weight:700;color:#999;padding:8px;">Error searching.</p>';
  }
}

// ─── Load Workspaces into Rail ────────────────────────────────────────────────

async function loadWorkspacesIntoRail() {
  const token = getToken();
  if (!token) return;

  const rail   = document.querySelector('.server-bar');
  const addBtn = rail.querySelector('.rail-add-ws');

  try {
    const res  = await fetch(`${API_BASE}/workspaces`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) return;

    rail.querySelectorAll('.server-icon.workspace').forEach(el => el.remove());

    data.forEach(ws => {
      const icon = document.createElement('div');
      icon.className   = 'server-icon workspace';
      icon.title       = ws.name;
      icon.textContent = ws.name.charAt(0).toUpperCase();
      icon.dataset.id  = ws.workspace_id;
      icon.addEventListener('click', () => {
        sessionStorage.setItem('ws_open_id', ws.workspace_id);
        navigateTo('workspace.html');
      });
      rail.insertBefore(icon, addBtn);
    });
  } catch (err) {
    console.error('Could not load workspaces into rail:', err);
  }
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

document.getElementById('new-dm-btn').addEventListener('click', () => {
  document.getElementById('new-dm-btn').animate(
    [{ transform: 'scale(1) rotate(0deg)' }, { transform: 'scale(0.85) rotate(10deg)' }, { transform: 'scale(1) rotate(0deg)' }],
    { duration: 280, easing: 'ease-out' }
  );
  openNewDmModal();
});

document.getElementById('dm-modal-cancel').addEventListener('click', closeNewDmModal);
document.getElementById('new-dm-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('new-dm-modal')) closeNewDmModal();
});

document.getElementById('dm-back').addEventListener('click', closeDm);
document.getElementById('dm-send-btn').addEventListener('click', sendDm);
document.getElementById('dm-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDm(); }
});

document.querySelector('.settings-icon-btn').addEventListener('click', () => {
  document.querySelector('.settings-icon-btn').animate(
    [{ transform: 'rotate(0deg)' }, { transform: 'rotate(60deg)' }, { transform: 'rotate(0deg)' }],
    { duration: 300, easing: 'ease-out' }
  );
});

// Rail: home logo → already on messages, refresh
document.getElementById('rail-home').addEventListener('click', () => {
  loadConversations();
});

// Rail: + button → go to workspace
document.querySelector('.rail-add-ws').addEventListener('click', () => {
  navigateTo('workspace.html');
});

// ─── Init ─────────────────────────────────────────────────────────────────────

populateSelfInfo();
loadConversations();
loadWorkspacesIntoRail();