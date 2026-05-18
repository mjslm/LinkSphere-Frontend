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

  // ─── Delete Workspace ─────────────────────────────────────────────────────

  function showDeleteConfirmation() {
    const existing = document.getElementById('delete-confirm-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'delete-confirm-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.6);
      display: flex; align-items: center; justify-content: center;
      z-index: 10000;
    `;

    overlay.innerHTML = `
      <style>
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0 }
          to   { transform: translateY(0);    opacity: 1 }
        }
        #delete-confirm-modal {
          width: 360px; background: #fff;
          border: 2px solid #111;
          font-family: 'Inter', sans-serif;
          animation: slideUp 0.2s ease;
        }
        #delete-confirm-header {
          background: #cc1414; color: #fff;
          font-size: 13px; font-weight: 900;
          letter-spacing: 0.15em; padding: 16px 20px;
          text-transform: uppercase;
        }
        #delete-confirm-body {
          padding: 24px 20px;
          font-size: 14px; color: #333; line-height: 1.6;
        }
        #delete-confirm-body p { margin: 0 0 16px 0; }
        #delete-confirm-body strong { font-weight: 700; }
        #delete-confirm-actions {
          display: flex; border-top: 2px solid #111;
        }
        .delete-confirm-cancel {
          flex: 1; height: 48px; border: none; border-right: 2px solid #111;
          background: #f4f4f4; font-size: 12px; font-weight: 700;
          letter-spacing: 0.12em; cursor: pointer; text-transform: uppercase;
          font-family: 'Inter', sans-serif;
          transition: background 0.15s;
        }
        .delete-confirm-cancel:hover { background: #e0e0e0; }
        .delete-confirm-delete {
          flex: 1; height: 48px; border: none;
          background: #cc1414; color: #fff;
          font-size: 12px; font-weight: 700;
          letter-spacing: 0.12em; cursor: pointer; text-transform: uppercase;
          font-family: 'Inter', sans-serif;
          transition: background 0.15s;
        }
        .delete-confirm-delete:hover { background: #a00f0f; }
        .delete-confirm-delete:disabled {
          background: #999; cursor: not-allowed;
        }
      </style>
      <div id="delete-confirm-modal">
        <div id="delete-confirm-header">DELETE WORKSPACE</div>
        <div id="delete-confirm-body">
          <p>Are you sure you want to delete this workspace?</p>
          <p><strong>This action cannot be undone.</strong> All channels, messages, and members will be permanently deleted.</p>
        </div>
        <div id="delete-confirm-actions">
          <button class="delete-confirm-cancel">CANCEL</button>
          <button class="delete-confirm-delete">DELETE WORKSPACE</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const cancelBtn = overlay.querySelector('.delete-confirm-cancel');
    const deleteConfirmBtn = overlay.querySelector('.delete-confirm-delete');

    function close() {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.15s ease';
      setTimeout(() => overlay.remove(), 150);
    }

    cancelBtn.addEventListener('click', close);
    deleteConfirmBtn.addEventListener('click', () => {
      deleteConfirmBtn.disabled = true;
      deleteConfirmBtn.textContent = 'DELETING...';
      deleteWorkspace(deleteConfirmBtn, close);
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    // Auto-focus delete button
    setTimeout(() => deleteConfirmBtn.focus(), 100);
  }

  async function deleteWorkspace(btn, closeModal) {
    const token = getToken();
    const wsId  = getWorkspaceId();

    if (!token || !wsId) {
      showToast('ERROR: Workspace not found');
      btn.disabled = false;
      btn.textContent = 'DELETE WORKSPACE';
      return;
    }

    try {
      // Step 1: Get all channels in the workspace
      btn.textContent = 'LOADING CHANNELS...';
      const channelsRes = await fetch(`${API_BASE}/channels?workspace_id=${wsId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const channels = channelsRes.ok ? await channelsRes.json() : [];

      // Step 2: Delete messages and related data (reactions, files)
      btn.textContent = 'DELETING MESSAGES...';
      for (const channel of channels) {
        try {
          const messagesRes = await fetch(`${API_BASE}/channels/${channel.channel_id}/messages`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          
          if (messagesRes.ok) {
            const messages = await messagesRes.json();
            
            for (const message of messages) {
              try {
                // Delete reactions (FK to message_id)
                await fetch(`${API_BASE}/channels/${channel.channel_id}/messages/${message.message_id}/reactions`, {
                  method:  'DELETE',
                  headers: { 'Authorization': `Bearer ${token}` },
                }).catch(() => {}); // Ignore if endpoint doesn't exist

                // Delete files (FK to message_id)
                await fetch(`${API_BASE}/channels/${channel.channel_id}/messages/${message.message_id}/files`, {
                  method:  'DELETE',
                  headers: { 'Authorization': `Bearer ${token}` },
                }).catch(() => {}); // Ignore if endpoint doesn't exist

                // Delete the message
                await fetch(`${API_BASE}/channels/${channel.channel_id}/messages/${message.message_id}`, {
                  method:  'DELETE',
                  headers: { 'Authorization': `Bearer ${token}` },
                }).catch(() => {});
              } catch (err) {
                console.error('Error deleting message:', err);
              }
            }
          }
        } catch (err) {
          console.error('Error processing channel messages:', err);
        }
      }

      // Step 3: Delete calls and call participants
      btn.textContent = 'DELETING CALLS...';
      for (const channel of channels) {
        try {
          // Delete call participants
          await fetch(`${API_BASE}/channels/${channel.channel_id}/calls/participants`, {
            method:  'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
          }).catch(() => {});

          // Delete calls
          await fetch(`${API_BASE}/channels/${channel.channel_id}/calls`, {
            method:  'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
          }).catch(() => {});
        } catch (err) {
          console.error('Error deleting calls:', err);
        }
      }

      // Step 4: Delete channel members and audit logs
      btn.textContent = 'CLEANING UP...';
      for (const channel of channels) {
        try {
          // Delete channel members
          await fetch(`${API_BASE}/channels/${channel.channel_id}/members`, {
            method:  'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
          }).catch(() => {});

          // Delete audit logs for this channel
          await fetch(`${API_BASE}/workspaces/${wsId}/audit?channel_id=${channel.channel_id}`, {
            method:  'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
          }).catch(() => {});
        } catch (err) {
          console.error('Error cleaning up:', err);
        }
      }

      // Step 5: Delete all channels
      btn.textContent = 'DELETING CHANNELS...';
      for (const channel of channels) {
        try {
          await fetch(`${API_BASE}/channels/${channel.channel_id}`, {
            method:  'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
          }).catch(() => {});
        } catch (err) {
          console.error('Error deleting channel:', err);
        }
      }

      // Step 6: Delete audit logs for workspace
      btn.textContent = 'DELETING AUDIT LOGS...';
      try {
        await fetch(`${API_BASE}/workspaces/${wsId}/audit`, {
          method:  'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        }).catch(() => {});
      } catch (err) {
        console.error('Error deleting audit logs:', err);
      }

      // Step 7: Delete workspace members
      btn.textContent = 'REMOVING MEMBERS...';
      try {
        const membersRes = await fetch(`${API_BASE}/workspaces/${wsId}/members`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        
        if (membersRes.ok) {
          const members = await membersRes.json();
          
          for (const member of members) {
            try {
              await fetch(`${API_BASE}/workspaces/${wsId}/members/${member.user_id}`, {
                method:  'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
              }).catch(() => {});
            } catch (err) {
              console.error('Error removing member:', err);
            }
          }
        }
      } catch (err) {
        console.error('Error deleting members:', err);
      }

      // Step 8: Delete subscriptions
      btn.textContent = 'DELETING SUBSCRIPTION...';
      try {
        await fetch(`${API_BASE}/workspaces/${wsId}/subscription`, {
          method:  'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        }).catch(() => {});
      } catch (err) {
        console.error('Error deleting subscription:', err);
      }

      // Step 9: Finally, delete the workspace
      btn.textContent = 'DELETING WORKSPACE...';
      
      const res = await fetch(`${API_BASE}/workspaces/${wsId}`, {
        method:  'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.ok) {
        closeModal();
        showToast('WORKSPACE DELETED');
        
        // Clear session storage
        sessionStorage.removeItem('settings_ws_id');
        
        // Redirect to workspace list after a short delay
        setTimeout(() => {
          window.location.href = '../html/workspace.html';
        }, 800);
      } else {
        const data = await res.json().catch(() => ({}));
        console.error('Delete workspace error:', data);
        showToast(data.error || 'FAILED TO DELETE WORKSPACE');
        btn.disabled = false;
        btn.textContent = 'DELETE WORKSPACE';
      }

    } catch (err) {
      console.error('Delete workspace error:', err);
      showToast('COULD NOT REACH SERVER');
      btn.disabled = false;
      btn.textContent = 'DELETE WORKSPACE';
    }
  }

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

  deleteBtn.addEventListener('click', showDeleteConfirmation);

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