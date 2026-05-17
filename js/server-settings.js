const API_BASE = 'https://linksphere-5bef.onrender.com/api';

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  const toast     = document.getElementById('toast');
  const saveBtn   = document.getElementById('saveBtn');
  const deleteBtn = document.querySelector('.delete-btn');
  const nameInput = document.getElementById('serverName');
  const codeEl    = document.getElementById('inviteCode');
  const hintEl    = document.getElementById('inviteHint');
  const copyBtn   = document.getElementById('copyBtn');
  const regenBtn  = document.getElementById('regenBtn');

  // ─── Toast helper ──────────────────────────────────────────────────────────

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────

  function getToken() {
    return localStorage.getItem('token');
  }

  function getUser() {
    return JSON.parse(localStorage.getItem('user') || 'null');
  }

  // ─── Workspace ID ──────────────────────────────────────────────────────────

  function getWorkspaceId() {
    return sessionStorage.getItem('settings_ws_id') || null;
  }

  // ─── Tab switching ─────────────────────────────────────────────────────────

  const settingsView = document.getElementById('settings-view');
  const membersView  = document.getElementById('members-view');
  const topbarTitle  = document.getElementById('topbar-title');
  const navBtns      = document.querySelectorAll('.bottom-nav button[data-tab]');

  function switchTab(tab) {
    navBtns.forEach(b => b.classList.toggle('selected', b.dataset.tab === tab));

    if (tab === 'members') {
      settingsView.style.display = 'none';
      membersView.style.display  = '';
      topbarTitle.textContent    = 'Members';
      saveBtn.style.visibility   = 'hidden';
      loadMembers();
    } else {
      settingsView.style.display = '';
      membersView.style.display  = 'none';
      topbarTitle.textContent    = 'Server Settings';
      saveBtn.style.visibility   = 'visible';
    }
  }

  navBtns.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  // ─── Load invite code ──────────────────────────────────────────────────────

  async function loadInviteCode() {
    const token = getToken();
    const wsId  = getWorkspaceId();

    if (!token) { setHint('Not logged in.', true); return; }

    codeEl.textContent = '––––––––';
    codeEl.classList.add('loading');
    setHint('Loading invite code…', false);

    try {
      let code = null;

      if (wsId) {
        const res = await fetch(`${API_BASE}/workspaces/${wsId}/invite`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          code = data.invite_code || data.code || null;
        }
      }

      if (!code) {
        const res  = await fetch(`${API_BASE}/workspaces`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && Array.isArray(data) && data.length) {
          const ws = wsId ? data.find(w => w.workspace_id === wsId) || data[0] : data[0];
          code = ws.invite_code || ws.code || null;
          if (ws.workspace_id) sessionStorage.setItem('settings_ws_id', ws.workspace_id);
        }
      }

      codeEl.classList.remove('loading');

      if (code) {
        codeEl.textContent = code.toUpperCase();
        setHint('Anyone with this code can join your workspace.', false);
      } else {
        codeEl.textContent = 'N/A';
        setHint('Invite codes not supported by server.', true);
      }

    } catch (err) {
      codeEl.classList.remove('loading');
      codeEl.textContent = 'ERROR';
      setHint('Could not load invite code. Check connection.', true);
      console.error('Invite code error:', err);
    }
  }

  // ─── Regenerate invite code ────────────────────────────────────────────────

  async function regenInviteCode() {
    const token = getToken();
    const wsId  = getWorkspaceId();

    if (!token || !wsId) { setHint('Cannot regenerate: no workspace found.', true); return; }

    regenBtn.classList.add('spinning');
    setHint('Generating new code…', false);

    try {
      const res = await fetch(`${API_BASE}/workspaces/${wsId}/invite/regenerate`, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });

      regenBtn.classList.remove('spinning');

      if (res.ok) {
        const data = await res.json();
        const code = data.invite_code || data.code || null;
        if (code) {
          codeEl.textContent = code.toUpperCase();
          codeEl.classList.remove('copied');
          setHint('New code generated. Old code is now invalid.', false);
          showToast('New invite code generated');
        } else {
          setHint('Regenerated, but no code returned.', true);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setHint(data.error || 'Failed to regenerate code.', true);
      }

    } catch (err) {
      regenBtn.classList.remove('spinning');
      setHint('Could not regenerate. Check connection.', true);
      console.error('Regen error:', err);
    }
  }

  // ─── Copy to clipboard ─────────────────────────────────────────────────────

  async function copyCode() {
    const code = codeEl.textContent.trim();
    if (!code || code === '––––––––' || code === 'N/A' || code === 'ERROR') return;

    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }

    codeEl.classList.add('copied');
    copyBtn.classList.add('copied');
    lucide.createIcons();
    setHint('Copied to clipboard!', false);
    showToast('Invite code copied');

    setTimeout(() => {
      codeEl.classList.remove('copied');
      copyBtn.classList.remove('copied');
      setHint('Anyone with this code can join your workspace.', false);
    }, 2000);
  }

  function setHint(text, isError) {
    hintEl.textContent = text;
    hintEl.classList.toggle('error', isError);
  }

  // ─── Load Members ──────────────────────────────────────────────────────────

  let membersCache = null; // { members: [], myRole: '' }

  async function loadMembers() {
    if (membersCache) { renderMembers(membersCache.members, membersCache.myRole); return; }

    const token = getToken();
    const wsId  = getWorkspaceId();
    const list  = document.getElementById('members-list');
    const count = document.getElementById('membersCount');

    if (!token || !wsId) {
      list.innerHTML = '<p class="members-empty">No workspace selected.</p>';
      return;
    }

    list.innerHTML = '<div class="spinner-wrap"><div class="members-spinner"></div></div>';

    try {
      const res  = await fetch(`${API_BASE}/workspaces/${wsId}/members`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) {
        list.innerHTML = `<p class="members-empty">⚠ ${escapeHtml(data.error || 'Failed to load members.')}</p>`;
        return;
      }

      const me     = getUser();
      const myself = data.find(m => m.user_id === me?.user_id);
      const myRole = myself?.role || 'member';

      membersCache = { members: data, myRole };
      count.textContent = data.length;
      renderMembers(data, myRole);

    } catch (err) {
      list.innerHTML = '<p class="members-empty">Could not reach server.</p>';
      console.error('Members error:', err);
    }
  }

  function renderMembers(members, myRole) {
    const me   = getUser();
    const list = document.getElementById('members-list');

    const order = { owner: 0, admin: 1, member: 2 };
    const sorted = [...members].sort((a, b) =>
      (order[a.role] ?? 3) - (order[b.role] ?? 3) ||
      (a.name || '').localeCompare(b.name || '')
    );

    list.innerHTML = '';

    sorted.forEach((m, i) => {
      const isMe    = me && m.user_id === me.user_id;
      const isOwner = m.role === 'owner';
      const joinDate = m.join_at
        ? new Date(m.join_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
        : '—';

      const row = document.createElement('div');
      row.className      = 'member-row';
      row.dataset.userId = m.user_id;
      row.dataset.role   = m.role;
      row.style.animationDelay = `${i * 0.04}s`;

      row.innerHTML = `
        <div class="member-avatar">${(m.name || '?').charAt(0).toUpperCase()}</div>
        <div class="member-info">
          <div class="member-name">
            ${escapeHtml(m.name || 'Unknown')}
            ${isMe ? '<span class="member-you">YOU</span>' : ''}
          </div>
          <div class="member-meta">${escapeHtml(m.email || '')} · JOINED ${joinDate}</div>
        </div>
      `;

      const controls = document.createElement('div');
      controls.className = 'member-controls';

      if (!isMe && !isOwner) {
        // Role dropdown — owners only
        if (myRole === 'owner') {
          const select = document.createElement('select');
          select.className = 'role-select';
          select.innerHTML = `
            <option value="admin"  ${m.role === 'admin'  ? 'selected' : ''}>ADMIN</option>
            <option value="member" ${m.role === 'member' ? 'selected' : ''}>MEMBER</option>
          `;
          select.addEventListener('change', () => changeRole(m.user_id, select.value, select));
          controls.appendChild(select);
        } else {
          const badge = document.createElement('span');
          badge.className = `member-badge member-badge--${m.role}`;
          badge.textContent = m.role.toUpperCase();
          controls.appendChild(badge);
        }

        // Kick button — owners and admins
        if (myRole === 'owner' || myRole === 'admin') {
          const kickBtn = document.createElement('button');
          kickBtn.className = 'kick-btn';
          kickBtn.title     = 'Remove member';
          kickBtn.innerHTML = '<i data-lucide="user-x"></i>';
          kickBtn.addEventListener('click', () => confirmKick(kickBtn, m.user_id, m.name));
          controls.appendChild(kickBtn);
        }

      } else {
        // Own row or owner: static badge only
        const badge = document.createElement('span');
        badge.className = `member-badge member-badge--${m.role}`;
        badge.textContent = m.role.toUpperCase();
        controls.appendChild(badge);
      }

      row.appendChild(controls);
      list.appendChild(row);
    });

    lucide.createIcons();
  }

  // ─── Change Role ───────────────────────────────────────────────────────────

  async function changeRole(userId, newRole, selectEl) {
    const token = getToken();
    const wsId  = getWorkspaceId();
    if (!token || !wsId) return;

    selectEl.disabled = true;

    try {
      const res = await fetch(`${API_BASE}/workspaces/${wsId}/members/${userId}`, {
        method:  'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ role: newRole }),
      });

      if (res.ok) {
        if (membersCache) {
          const m = membersCache.members.find(m => m.user_id === userId);
          if (m) m.role = newRole;
        }
        showToast(`ROLE UPDATED TO ${newRole.toUpperCase()}`);
        selectEl.classList.add('role-saved');
        setTimeout(() => selectEl.classList.remove('role-saved'), 1200);
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'FAILED TO UPDATE ROLE');
        // Revert
        const cached = membersCache?.members.find(m => m.user_id === userId);
        if (cached) selectEl.value = cached.role;
      }

    } catch (err) {
      showToast('COULD NOT REACH SERVER');
      console.error('changeRole error:', err);
    } finally {
      selectEl.disabled = false;
    }
  }

  // ─── Kick Member ───────────────────────────────────────────────────────────
  // Tap once → armed (shakes, turns red). Tap again within 3s → fires.

  let armedKick = null;

  function confirmKick(btn, userId, name) {
    if (armedKick && armedKick.userId === userId) {
      clearTimeout(armedKick.timer);
      armedKick = null;
      kickMember(btn, userId, name);
      return;
    }

    if (armedKick) {
      armedKick.btn.classList.remove('armed');
      clearTimeout(armedKick.timer);
    }

    btn.classList.add('armed');
    btn.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' },
       { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }],
      { duration: 300, easing: 'ease-in-out' }
    );

    const timer = setTimeout(() => {
      btn.classList.remove('armed');
      armedKick = null;
    }, 3000);

    armedKick = { btn, userId, timer };
  }

  async function kickMember(btn, userId, name) {
    const token = getToken();
    const wsId  = getWorkspaceId();
    if (!token || !wsId) return;

    btn.disabled = true;

    try {
      const res = await fetch(`${API_BASE}/workspaces/${wsId}/members/${userId}`, {
        method:  'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.ok) {
        if (membersCache) {
          membersCache.members = membersCache.members.filter(m => m.user_id !== userId);
          document.getElementById('membersCount').textContent = membersCache.members.length;
        }
        const row = document.querySelector(`.member-row[data-user-id="${userId}"]`);
        if (row) {
          row.style.transition = 'opacity 0.25s, transform 0.25s';
          row.style.opacity    = '0';
          row.style.transform  = 'translateX(20px)';
          setTimeout(() => row.remove(), 260);
        }
        showToast(`${(name || 'MEMBER').toUpperCase()} REMOVED`);
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'FAILED TO REMOVE MEMBER');
        btn.disabled = false;
      }

    } catch (err) {
      showToast('COULD NOT REACH SERVER');
      btn.disabled = false;
      console.error('kickMember error:', err);
    }
  }

  document.addEventListener('click', (e) => {
    if (armedKick && !armedKick.btn.contains(e.target)) {
      armedKick.btn.classList.remove('armed');
      clearTimeout(armedKick.timer);
      armedKick = null;
    }
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ─── Event listeners ──────────────────────────────────────────────────────

  saveBtn.addEventListener('click', () => showToast(`Saved: ${nameInput.value || 'Untitled server'}`));

  deleteBtn.addEventListener('click', () => {
    deleteBtn.animate([
      { transform: 'translateX(0)' }, { transform: 'translateX(-8px)' },
      { transform: 'translateX(8px)' }, { transform: 'translateX(0)' },
    ], { duration: 280, easing: 'ease-in-out' });
  });

  copyBtn.addEventListener('click', copyCode);
  regenBtn.addEventListener('click', regenInviteCode);

  // ─── Ripple ────────────────────────────────────────────────────────────────

  document.querySelectorAll('[data-ripple]').forEach((button) => {
    button.style.position = 'relative';
    button.style.overflow = 'hidden';
    button.addEventListener('click', (event) => {
      const rect   = button.getBoundingClientRect();
      const circle = document.createElement('span');
      const size   = Math.max(rect.width, rect.height);
      circle.className    = 'ripple';
      circle.style.width  = circle.style.height = `${size}px`;
      circle.style.left   = `${event.clientX - rect.left - size / 2}px`;
      circle.style.top    = `${event.clientY - rect.top  - size / 2}px`;
      button.appendChild(circle);
      circle.addEventListener('animationend', () => circle.remove());
    });
  });

  // ─── Init ──────────────────────────────────────────────────────────────────

  loadInviteCode();
});