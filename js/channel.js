const timer = document.getElementById('timer');
const toast = document.getElementById('miniToast');
const muteBtn = document.getElementById('muteBtn');
const videoBtn = document.getElementById('videoBtn');
const moreBtn = document.getElementById('moreBtn');
const leaveBtn = document.getElementById('leaveBtn');
const privacyBtn = document.getElementById('privacyBtn');
const privacyPanel = document.getElementById('privacyPanel');
const privacyText = document.getElementById('privacyText');
const localVideo = document.getElementById('localVideo');
const markTile = document.getElementById('markTile');
const voiceMeter = document.getElementById('voiceMeter');
const micBadge = document.getElementById('micBadge');

let seconds = (4 * 60 * 60) + (22 * 60) + 15;
let localStream = null;
let micEnabled = false;
let cameraEnabled = false;
let audioContext = null;
let analyser = null;
let levelTimer = null;

function formatTime(totalSeconds) {
  const hrs = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const mins = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const secs = String(totalSeconds % 60).padStart(2, '0');
  return `${hrs}:${mins}:${secs}`;
}

setInterval(() => {
  seconds += 1;
  timer.textContent = formatTime(seconds);
}, 1000);

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.hideTimer);
  showToast.hideTimer = setTimeout(() => toast.classList.remove('show'), 1700);
}

function updatePrivacyText(message) {
  privacyText.textContent = message;
}

function setTrackState(kind, enabled) {
  if (!localStream) return;
  localStream.getTracks().filter(track => track.kind === kind).forEach(track => {
    track.enabled = enabled;
  });
}

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
    const level = data.reduce((sum, value) => sum + value, 0) / data.length;
    voiceMeter.style.transform = `scaleY(${Math.max(1, Math.min(1.75, 1 + level / 110))})`;
  }, 120);
}

async function requestPrivacy({ audio = true, video = true } = {}) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Browser does not support mic/camera access');
    updatePrivacyText('Use a modern browser and open this through localhost or HTTPS.');
    return null;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio, video });
    localStream = stream;
    localVideo.srcObject = stream;

    micEnabled = stream.getAudioTracks().length > 0;
    cameraEnabled = stream.getVideoTracks().length > 0;

    setTrackState('audio', micEnabled);
    setTrackState('video', cameraEnabled);
    startVoiceMeter(stream);
    updateUiState();

    privacyPanel.classList.add('allowed');
    privacyBtn.textContent = 'Privacy allowed';
    updatePrivacyText('Mic, voice activity, and camera are now connected. You can turn them off anytime.');
    showToast('Mic and camera allowed');
    return stream;
  } catch (error) {
    console.error(error);
    privacyPanel.classList.remove('allowed');
    updatePrivacyText('Permission was blocked. Click the browser lock icon and allow microphone/camera access.');
    showToast('Permission blocked');
    return null;
  }
}

function updateUiState() {
  muteBtn.classList.toggle('is-live', micEnabled);
  videoBtn.classList.toggle('is-live', cameraEnabled);
  voiceMeter.classList.toggle('listening', micEnabled);
  markTile.classList.toggle('has-camera', cameraEnabled);
  micBadge.style.background = micEnabled ? '#dc2626' : '#000';
  muteBtn.querySelector('span').textContent = micEnabled ? 'Mic On' : 'Mic';
  videoBtn.querySelector('span').textContent = cameraEnabled ? 'Video On' : 'Video';
}

async function ensureStream(kind) {
  if (!localStream) {
    return await requestPrivacy({ audio: true, video: kind === 'video' });
  }
  return localStream;
}

privacyBtn.addEventListener('click', () => requestPrivacy({ audio: true, video: true }));

muteBtn.addEventListener('click', async () => {
  await ensureStream('audio');
  if (!localStream) return;
  micEnabled = !micEnabled;
  setTrackState('audio', micEnabled);
  updateUiState();
  showToast(micEnabled ? 'Microphone and voice on' : 'Microphone private/off');
});

videoBtn.addEventListener('click', async () => {
  await ensureStream('video');
  if (!localStream) return;
  const videoTracks = localStream.getVideoTracks();
  if (!videoTracks.length) {
    await requestPrivacy({ audio: micEnabled, video: true });
    return;
  }
  cameraEnabled = !cameraEnabled;
  setTrackState('video', cameraEnabled);
  updateUiState();
  showToast(cameraEnabled ? 'Camera opened' : 'Camera private/off');
});

moreBtn.addEventListener('click', () => {
  privacyPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  privacyPanel.animate([
    { transform: 'scale(1)' },
    { transform: 'scale(1.03)' },
    { transform: 'scale(1)' }
  ], { duration: 360, easing: 'ease-out' });
  showToast('Privacy controls opened');
});

leaveBtn.addEventListener('click', () => {
  leaveBtn.animate([
    { transform: 'scale(1)' },
    { transform: 'scale(.92)' },
    { transform: 'scale(1)' }
  ], { duration: 260, easing: 'ease-out' });

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  micEnabled = false;
  cameraEnabled = false;
  clearInterval(levelTimer);
  localVideo.srcObject = null;
  privacyPanel.classList.remove('allowed');
  privacyBtn.textContent = 'Allow mic + camera';
  updatePrivacyText('Call ended. Mic and camera are closed.');
  updateUiState();
  showToast('Leaving call...');
});

updateUiState();