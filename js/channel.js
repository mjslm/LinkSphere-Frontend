// ─── LiveKit SDK ──────────────────────────────────────────────────────────────
const { Room, RoomEvent, Track } = LivekitClient;

// ─── State ────────────────────────────────────────────────────────────────────
let seconds       = 0;
let micEnabled    = false;
let cameraEnabled = false;
let audioContext  = null;
let analyser      = null;
let levelTimer    = null;
let room          = null;

// ─── DOM refs (static — exist in HTML from the start) ────────────────────────
const timerEl      = document.getElementById('timer');
const toast        = document.getElementById('miniToast');
const muteBtn      = document.getElementById('muteBtn');
const videoBtn     = document.getElementById('videoBtn');
const moreBtn      = document.getElementById('moreBtn');
const leaveBtn     = document.getElementById('leaveBtn');
const privacyPanel = document.getElementById('privacyPanel');
const privacyText  = document.getElementById('privacyText');
const privacyBtn   = document.getElementById('privacyBtn');

// ─── Dynamic DOM refs (resolved after tile is injected) ───────────────────────
// These are set in buildLocalTile() after the DOM node exists.
let localVideo  = null;
let voiceMeter  = null;
let micBadge    = null;

// ─── Timer ────────────────────────────────────────────────────────────────────
function formatTime(s) {
  return [Math.floor(s/3600), Math.floor((s%3600)/60), s%60]
    .map(n => String(n).padStart(2,'0')).join(':');
}
const timerInterval = setInterval(() => {
  timerEl.textContent = formatTime(++seconds);
}, 1000);

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 1700);
}

// ─── UI state (safe — only called after tile is built) ───────────────────────
function updateUiState() {
  muteBtn.classList.toggle('is-live', micEnabled);
  videoBtn.classList.toggle('is-live', cameraEnabled);
  if (voiceMeter)  voiceMeter.classList.toggle('listening', micEnabled);
  if (micBadge)    micBadge.style.background = micEnabled ? '#dc2626' : '#000';
  muteBtn.querySelector('span').textContent  = micEnabled    ? 'Mic On'   : 'Mic';
  videoBtn.querySelector('span').textContent = cameraEnabled ? 'Video On' : 'Video';
}

// ─── Avatar HTML helper ───────────────────────────────────────────────────────
// Returns either <img> or a text initial, matching your existing app style.
function avatarInnerHTML(name, avatarUrl) {
  if (avatarUrl) {
    return `<img src="${avatarUrl}" alt="${escapeHtml(name)}"
              style="width:100%;height:100%;object-fit:cover;border-radius:0;display:block;" />`;
  }
  return escapeHtml((name || '?').charAt(0).toUpperCase());
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Build LOCAL participant tile ─────────────────────────────────────────────
function buildLocalTile(user) {
  const section  = document.querySelector('.participants');
  const existing = document.getElementById('local-tile');
  if (existing) existing.remove();

  const initial  = (user.name || user.user_id || '?').charAt(0).toUpperCase();
  const hasAvatar = !!user.avatar_url;

  const article = document.createElement('article');
  article.className = 'participant active';
  article.style     = '--delay:.08s';
  article.id        = 'local-tile';

  article.innerHTML = `
    <div class="tile-content" id="localTileContent">
      <video id="localVideo" autoplay muted playsinline
             style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
                    display:none;z-index:0;"></video>

      <!-- Avatar / profile image -->
      <div class="local-avatar-wrap" id="localAvatarWrap"
           style="position:absolute;inset:0;display:flex;align-items:center;
                  justify-content:center;z-index:1;background:#000;">
        ${hasAvatar
          ? `<img src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(user.name)}"
                  id="localAvatarImg"
                  style="width:100%;height:100%;object-fit:cover;display:block;" />`
          : `<span class="initial" id="localInitial">${initial}</span>`
        }
      </div>

      <button class="mic-badge" id="micBadge" aria-label="Microphone status"
              style="z-index:3;">
        <svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"/></svg>
      </button>

      <span class="name-tag" style="z-index:3;">${escapeHtml(user.name || 'You')}</span>

      <div class="voice-meter" id="voiceMeter" aria-hidden="true" style="z-index:3;">
        <span></span><span></span><span></span><span></span>
      </div>
    </div>
  `;

  section.insertBefore(article, section.firstChild);

  // Resolve dynamic DOM refs now that the tile exists
  localVideo = document.getElementById('localVideo');
  voiceMeter = document.getElementById('voiceMeter');
  micBadge   = document.getElementById('micBadge');
}

// ─── Remote participant tile ──────────────────────────────────────────────────
function addRemoteTile(participant) {
  if (document.getElementById(`tile-${participant.identity}`)) return;

  const section  = document.querySelector('.participants');
  const name     = participant.name || participant.identity || 'User';
  const meta     = parseParticipantMeta(participant);
  const hasAvatar = !!meta.avatarUrl;

  const article = document.createElement('article');
  article.className = 'participant';
  article.id        = `tile-${participant.identity}`;
  article.style     = '--delay:.3s';

  article.innerHTML = `
    <div class="tile-content">
      <!-- Video track (hidden until camera enabled) -->
      <video id="video-${participant.identity}" autoplay playsinline
             style="position:absolute;inset:0;width:100%;height:100%;
                    object-fit:cover;display:none;z-index:0;"></video>

      <!-- Audio (invisible) -->
      <audio id="audio-${participant.identity}" autoplay></audio>

      <!-- Avatar / profile image -->
      <div class="remote-avatar-wrap" id="avatar-wrap-${participant.identity}"
           style="position:absolute;inset:0;display:flex;align-items:center;
                  justify-content:center;z-index:1;background:#000;">
        ${hasAvatar
          ? `<img src="${escapeHtml(meta.avatarUrl)}" alt="${escapeHtml(name)}"
                  style="width:100%;height:100%;object-fit:cover;display:block;" />`
          : `<span class="initial">${escapeHtml(name.charAt(0).toUpperCase())}</span>`
        }
      </div>

      <span class="name-tag" style="z-index:3;">${escapeHtml(name)}</span>

      <!-- Voice activity meter for remote -->
      <div class="voice-meter" id="meter-${participant.identity}" aria-hidden="true"
           style="z-index:3;">
        <span></span><span></span><span></span><span></span>
      </div>
    </div>
  `;

  section.appendChild(article);
}

function removeRemoteTile(participant) {
  document.getElementById(`tile-${participant.identity}`)?.remove();
}

// ─── Parse avatar/name from participant metadata ──────────────────────────────
// LiveKit lets you pass arbitrary metadata as a JSON string.
// We store { avatarUrl } there when requesting the token.
// Falls back gracefully if metadata is absent / malformed.
function parseParticipantMeta(participant) {
  try {
    if (participant.metadata) {
      return JSON.parse(participant.metadata);
    }
  } catch (_) {}
  return { avatarUrl: null };
}

// ─── Track attach / detach ────────────────────────────────────────────────────
function attachTrack(track, participant) {
  if (track.kind === Track.Kind.Video) {
    const videoEl   = document.getElementById(`video-${participant.identity}`);
    const avatarWrap = document.getElementById(`avatar-wrap-${participant.identity}`);
    if (videoEl) {
      track.attach(videoEl);
      videoEl.style.display = 'block';
      if (avatarWrap) avatarWrap.style.display = 'none';
    }
  }
  if (track.kind === Track.Kind.Audio) {
    const audioEl = document.getElementById(`audio-${participant.identity}`);
    if (audioEl) track.attach(audioEl);
  }
}

function detachTrack(track, participant) {
  if (track.kind === Track.Kind.Video) {
    const videoEl    = document.getElementById(`video-${participant.identity}`);
    const avatarWrap = document.getElementById(`avatar-wrap-${participant.identity}`);
    if (videoEl) {
      track.detach(videoEl);
      videoEl.style.display = 'none';
      if (avatarWrap) avatarWrap.style.display = 'flex';
    }
  }
  if (track.kind === Track.Kind.Audio) {
    const audioEl = document.getElementById(`audio-${participant.identity}`);
    if (audioEl) track.detach(audioEl);
  }
}

// ─── Voice meter ──────────────────────────────────────────────────────────────
function startVoiceMeter(stream) {
  const tracks = stream.getAudioTracks();
  if (!tracks.length) return;
  audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
  const source = audioContext.createMediaStreamSource(new MediaStream(tracks));
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  clearInterval(levelTimer);
  levelTimer = setInterval(() => {
    if (!micEnabled || !analyser || !voiceMeter) return;
    analyser.getByteFrequencyData(data);
    const level = data.reduce((s,v) => s+v, 0) / data.length;
    voiceMeter.style.transform = `scaleY(${Math.max(1, Math.min(1.75, 1+level/110))})`;
  }, 120);
}

// ─── Connect to LiveKit ───────────────────────────────────────────────────────
async function connectToLiveKit({ livekitToken, serverUrl, callType='voice', channelName='Lobby', user={} } = {}) {
  // Update header
  const callStatusEl = document.querySelector('.call-status strong');
  if (callStatusEl) callStatusEl.textContent = `#${channelName.toUpperCase()}`;

  if (!livekitToken || !serverUrl) {
    showToast('No call session found');
    privacyText.textContent = 'No call session. Go back and start a call.';
    return;
  }

  try {
    room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl:  true,
      },
    });

    room.on(RoomEvent.ParticipantConnected, (participant) => {
      addRemoteTile(participant);
      showToast(`${participant.name || participant.identity} joined`);
    });

    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      removeRemoteTile(participant);
      showToast(`${participant.name || participant.identity} left`);
    });

    room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
      attachTrack(track, participant);
    });

    room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
      detachTrack(track, participant);
    });

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      // Pulse the voice meter for active speakers
      document.querySelectorAll('.voice-meter').forEach(el => el.classList.remove('listening'));
      speakers.forEach(p => {
        const el = document.getElementById(
          p.isLocal ? 'voiceMeter' : `meter-${p.identity}`
        );
        if (el) el.classList.add('listening');
      });
    });

    room.on(RoomEvent.Disconnected, () => {
      showToast('Disconnected from call');
      cleanup();
    });

    await room.connect(serverUrl, livekitToken);

    // Enable mic (and camera if video call)
    if (callType === 'video') {
      await room.localParticipant.enableCameraAndMicrophone();
      cameraEnabled = true;
      const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      if (camPub?.track && localVideo) {
        camPub.track.attach(localVideo);
        localVideo.style.display = 'block';
        // Hide avatar wrap when camera is on
        const avatarWrap = document.getElementById('localAvatarWrap');
        if (avatarWrap) avatarWrap.style.display = 'none';
      }
    } else {
      await room.localParticipant.setMicrophoneEnabled(true);
    }

    micEnabled = true;

    // Start local voice meter
    const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    if (micPub?.track) {
      startVoiceMeter(new MediaStream([micPub.track.mediaStreamTrack]));
    }

    // Handle participants already in room when we join
    room.remoteParticipants.forEach((participant) => {
      addRemoteTile(participant);
      participant.trackPublications.forEach((pub) => {
        if (pub.track) attachTrack(pub.track, participant);
      });
    });

    privacyPanel.classList.add('allowed');
    privacyBtn.textContent  = 'Connected';
    privacyText.textContent = 'You are connected. Mic is live.';
    updateUiState();
    showToast('Connected to Lobby');

  } catch (err) {
    console.error('LiveKit connection error:', err);
    privacyText.textContent = `Connection failed: ${err.message}`;
    showToast('Failed to connect');
  }
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────
function cleanup() {
  clearInterval(timerInterval);
  clearInterval(levelTimer);
  if (room) { room.disconnect(); room = null; }
  micEnabled = false; cameraEnabled = false;
  updateUiState();
}

// ─── Control buttons ──────────────────────────────────────────────────────────
muteBtn.addEventListener('click', async () => {
  if (!room) return;
  micEnabled = !micEnabled;
  await room.localParticipant.setMicrophoneEnabled(micEnabled);
  updateUiState();
  showToast(micEnabled ? 'Microphone on' : 'Microphone off');
});

videoBtn.addEventListener('click', async () => {
  if (!room) return;
  cameraEnabled = !cameraEnabled;
  await room.localParticipant.setCameraEnabled(cameraEnabled);

  const camPub     = room.localParticipant.getTrackPublication(Track.Source.Camera);
  const avatarWrap = document.getElementById('localAvatarWrap');

  if (cameraEnabled && camPub?.track && localVideo) {
    camPub.track.attach(localVideo);
    localVideo.style.display = 'block';
    if (avatarWrap) avatarWrap.style.display = 'none';
  } else if (!cameraEnabled && localVideo) {
    localVideo.srcObject = null;
    localVideo.style.display = 'none';
    if (avatarWrap) avatarWrap.style.display = 'flex';
  }

  updateUiState();
  showToast(cameraEnabled ? 'Camera on' : 'Camera off');
});

leaveBtn.addEventListener('click', () => {
  leaveBtn.animate(
    [{transform:'scale(1)'},{transform:'scale(.92)'},{transform:'scale(1)'}],
    {duration:260, easing:'ease-out'}
  );
  showToast('Leaving call...');
  setTimeout(() => {
    cleanup();
    window.history.back();
  }, 600);
});

moreBtn.addEventListener('click', () => {
  privacyPanel.scrollIntoView({behavior:'smooth', block:'center'});
  privacyPanel.animate(
    [{transform:'scale(1)'},{transform:'scale(1.03)'},{transform:'scale(1)'}],
    {duration:360, easing:'ease-out'}
  );
  showToast('Privacy controls');
});

privacyBtn.addEventListener('click', () => {
  // Standalone use — no session params
  connectToLiveKit({});
});

// ─── INIT: Voice Channel Join ─────────────────────────────────────────────────
(async () => {
  const voiceChannelId   = sessionStorage.getItem('voice_channel_id');
  const voiceChannelName = sessionStorage.getItem('voice_channel_name');

  if (!voiceChannelId || !voiceChannelName) {
    // Not launched from workspace — show idle state
    privacyText.textContent = 'No voice channel session. Go back and click a voice channel.';
    return;
  }

  // Clear sessionStorage immediately
  sessionStorage.removeItem('voice_channel_id');
  sessionStorage.removeItem('voice_channel_name');

  const authToken = localStorage.getItem('token');
  const userStr   = localStorage.getItem('user') || '{}';
  const user      = JSON.parse(userStr);

  if (!authToken) {
    privacyText.textContent = 'Not authenticated. Please log in.';
    return;
  }

  // ── 1. Build local tile (avatar + name) FIRST ─────────────────────────────
  buildLocalTile(user);

  // ── 2. Update header ───────────────────────────────────────────────────────
  const callStatusEl = document.querySelector('.call-status strong');
  if (callStatusEl) callStatusEl.textContent = `#${voiceChannelName.toUpperCase()}`;

  // ── 3. Fetch LiveKit token & connect ──────────────────────────────────────
  try {
    // Pass avatar_url as participant metadata so other clients can display it
    const metadata = JSON.stringify({ avatarUrl: user.avatar_url || null });

    const res = await fetch('https://linksphere-5bef.onrender.com/api/calls/token', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        roomName:        voiceChannelId,
        participantName: user.name || user.user_id || 'User',
        metadata,                           // ← sent to LiveKit, echoed to all participants
      }),
    });

    if (!res.ok) throw new Error('Failed to get LiveKit token');

    const { token: livekitToken, serverUrl } = await res.json();

    await connectToLiveKit({
      livekitToken,
      serverUrl,
      callType:    'voice',
      channelName: voiceChannelName,
      user,
    });

  } catch (err) {
    console.error('Failed to join voice channel:', err);
    privacyText.textContent = `Failed to connect: ${err.message}`;
    showToast('Connection failed');
  }
})();