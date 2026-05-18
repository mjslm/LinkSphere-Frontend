// ─── LiveKit SDK (loaded from CDN in channel.html) ───────────────────────────
// Make sure channel.html has this in <head> BEFORE channel.js:
// <script src="https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.umd.min.js"></script>

const { Room, RoomEvent, Track } = LivekitClient;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const timerEl      = document.getElementById('timer');
const toast        = document.getElementById('miniToast');
const muteBtn      = document.getElementById('muteBtn');
const videoBtn     = document.getElementById('videoBtn');
const moreBtn      = document.getElementById('moreBtn');
const leaveBtn     = document.getElementById('leaveBtn');
const privacyBtn   = document.getElementById('privacyBtn');
const privacyPanel = document.getElementById('privacyPanel');
const privacyText  = document.getElementById('privacyText');
const localVideo   = document.getElementById('localVideo');
const markTile     = document.getElementById('markTile');
const voiceMeter   = document.getElementById('voiceMeter');
const micBadge     = document.getElementById('micBadge');

// ─── State ────────────────────────────────────────────────────────────────────
let seconds       = 0;
let micEnabled    = false;
let cameraEnabled = false;
let audioContext  = null;
let analyser      = null;
let levelTimer    = null;
let room          = null;   // LiveKit Room instance
let onLeaveCallback = null; // called when user ends the call

// ─── Timer ────────────────────────────────────────────────────────────────────
function formatTime(totalSeconds) {
  const hrs  = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const mins = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const secs = String(totalSeconds % 60).padStart(2, '0');
  return `${hrs}:${mins}:${secs}`;
}

const timerInterval = setInterval(() => {
  seconds += 1;
  timerEl.textContent = formatTime(seconds);
}, 1000);

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove('show'), 1700);
}

// ─── UI state ─────────────────────────────────────────────────────────────────
function updateUiState() {
  muteBtn.classList.toggle('is-live', micEnabled);
  videoBtn.classList.toggle('is-live', cameraEnabled);
  voiceMeter.classList.toggle('listening', micEnabled);
  markTile.classList.toggle('has-camera', cameraEnabled);
  micBadge.style.background = micEnabled ? '#dc2626' : '#000';
  muteBtn.querySelector('span').textContent  = micEnabled    ? 'Mic On'    : 'Mic';
  videoBtn.querySelector('span').textContent = cameraEnabled ? 'Video On'  : 'Video';
}

// ─── Voice meter ──────────────────────────────────────────────────────────────
function startVoiceMeter(stream) {
  const audioTracks = stream.getAudioTracks();
  if (!audioTracks.length) return;
  audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
  const source = audioContext.createMediaStreamSource(new MediaStream(audioTracks));
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  clearInterval(levelTimer);
  levelTimer = setInterval(() => {
    if (!micEnabled || !analyser) return;
    analyser.getByteFrequencyData(data);
    const level = data.reduce((s, v) => s + v, 0) / data.length;
    voiceMeter.style.transform = `scaleY(${Math.max(1, Math.min(1.75, 1 + level / 110))})`;
  }, 120);
}

// ─── Remote participant tile ──────────────────────────────────────────────────
function addRemoteTile(participant) {
  if (document.getElementById(`tile-${participant.identity}`)) return;

  const section = document.querySelector('.participants');

  const article = document.createElement('article');
  article.className = 'participant';
  article.id        = `tile-${participant.identity}`;
  article.style     = '--delay: .3s';

  const initial = (participant.name || participant.identity || '?').charAt(0).toUpperCase();

  article.innerHTML = `
    <div class="tile-content">
      <video id="video-${participant.identity}" autoplay playsinline
             style="width:100%;height:100%;object-fit:cover;display:none;"></video>
      <audio id="audio-${participant.identity}" autoplay></audio>
      <span class="initial">${initial}</span>
      <span class="name-tag">${participant.name || participant.identity}</span>
    </div>
  `;

  section.appendChild(article);
}

function removeRemoteTile(participant) {
  document.getElementById(`tile-${participant.identity}`)?.remove();
}

function attachTrack(track, participant) {
  if (track.kind === Track.Kind.Video) {
    const el = document.getElementById(`video-${participant.identity}`);
    if (el) {
      track.attach(el);
      el.style.display = 'block';
      el.closest('.tile-content')?.querySelector('.initial')?.style.setProperty('display', 'none');
    }
  }
  if (track.kind === Track.Kind.Audio) {
    const el = document.getElementById(`audio-${participant.identity}`);
    if (el) track.attach(el);
  }
}

function detachTrack(track, participant) {
  if (track.kind === Track.Kind.Video) {
    const el = document.getElementById(`video-${participant.identity}`);
    if (el) {
      track.detach(el);
      el.style.display = 'none';
      el.closest('.tile-content')?.querySelector('.initial')?.style.removeProperty('display');
    }
  }
  if (track.kind === Track.Kind.Audio) {
    const el = document.getElementById(`audio-${participant.identity}`);
    if (el) track.detach(el);
  }
}

// ─── Connect to LiveKit ───────────────────────────────────────────────────────
// Now accepts params directly instead of reading from localStorage
async function connectToLiveKit({ livekitToken, serverUrl, callType = 'voice', peerName = 'User' } = {}) {
  // Update header with peer name
  const callStatusEl = document.querySelector('.call-status strong');
  if (callStatusEl) callStatusEl.textContent = `# CALL WITH ${peerName.toUpperCase()}`;

  if (!livekitToken || !serverUrl) {
    showToast('No call session found');
    privacyText.textContent = 'No call session. Go back and start a call.';
    return;
  }

  try {
    room = new Room({
      adaptiveStream: true,
      dynacast:       true,
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

    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      attachTrack(track, participant);
    });

    room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      detachTrack(track, participant);
    });

    room.on(RoomEvent.Disconnected, () => {
      showToast('Disconnected from call');
      cleanup();
    });

    await room.connect(serverUrl, livekitToken);

    if (callType === 'video') {
      await room.localParticipant.enableCameraAndMicrophone();
      cameraEnabled = true;
      const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      if (camPub?.track) camPub.track.attach(localVideo);
    } else {
      await room.localParticipant.setMicrophoneEnabled(true);
    }

    micEnabled = true;

    const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    if (micPub?.track) {
      const stream = new MediaStream([micPub.track.mediaStreamTrack]);
      startVoiceMeter(stream);
    }

    room.remoteParticipants.forEach((participant) => {
      addRemoteTile(participant);
      participant.trackPublications.forEach((pub) => {
        if (pub.track) attachTrack(pub.track, participant);
      });
    });

    privacyPanel.classList.add('allowed');
    privacyBtn.textContent  = 'Connected';
    privacyText.textContent = 'You are connected. Mic and camera are live.';
    updateUiState();
    showToast('Connected to call');

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

  if (room) {
    room.disconnect();
    room = null;
  }

  micEnabled    = false;
  cameraEnabled = false;
  updateUiState();

  if (typeof onLeaveCallback === 'function') {
    onLeaveCallback();
  }
}

// ─── Controls ─────────────────────────────────────────────────────────────────

privacyBtn.addEventListener('click', () => {
  // When used standalone (channel.html directly), prompt for params
  // When embedded from messages.js, connectToLiveKit() is called with params directly
  connectToLiveKit({});
});

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

  const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
  if (cameraEnabled && camPub?.track) {
    camPub.track.attach(localVideo);
  } else if (!cameraEnabled) {
    localVideo.srcObject = null;
  }

  updateUiState();
  showToast(cameraEnabled ? 'Camera on' : 'Camera off');
});

leaveBtn.addEventListener('click', () => {
  leaveBtn.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(.92)' }, { transform: 'scale(1)' }],
    { duration: 260, easing: 'ease-out' }
  );
  showToast('Leaving call...');
  setTimeout(() => cleanup(), 600);
});

moreBtn.addEventListener('click', () => {
  privacyPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  privacyPanel.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }],
    { duration: 360, easing: 'ease-out' }
  );
  showToast('Privacy controls opened');
});

// ─── Init ─────────────────────────────────────────────────────────────────────
updateUiState();
// Note: connectToLiveKit() is no longer called automatically here.
// When channel.html is used standalone for workspace calls, call it manually.
// When embedded from messages.js DM calls, message.js calls connectToLiveKit() with params.