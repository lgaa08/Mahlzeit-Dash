(() => {
  const announcement = document.getElementById('announcement');
  const textElement = document.getElementById('announcement-text');
  const lunchTestButton = document.getElementById('lunch-preview');
  const alarmTestButton = document.getElementById('alarm-preview');
  if (!announcement || !textElement) return;

  const AUDIO_FILES = {
    amongus: [
      new URL('assets/sounds/amongus.mp3', window.location.href).href,
      'file:///C:/Mahlzeit-Dash/src/assets/sounds/amongus.mp3'
    ],
    alarm: [
      new URL('assets/sounds/alarm.mp3', window.location.href).href,
      'file:///C:/Mahlzeit-Dash/src/assets/sounds/alarm.mp3'
    ]
  };

  let activeAudio = null;
  let lastAlertKey = '';
  let lastPlayAt = 0;

  function stopSound() {
    if (!activeAudio) return;
    try {
      activeAudio.pause();
      activeAudio.currentTime = 0;
      activeAudio.src = '';
      activeAudio.load();
    } catch (_error) {}
    activeAudio = null;
  }

  function playFallback(kind) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const frequencies = kind === 'alarm' ? [880, 660, 880, 1175] : [220, 440, 330, 660];
    frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * 0.16;
      oscillator.type = kind === 'alarm' ? 'square' : 'triangle';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.09, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.16);
    });
    setTimeout(() => context.close().catch(() => {}), 1500);
  }

  async function tryPlayUrl(kind, url) {
    const audio = new Audio();
    activeAudio = audio;
    audio.preload = 'auto';
    audio.volume = kind === 'alarm' ? 0.95 : 1;
    audio.src = url;
    await audio.play();
    audio.addEventListener('ended', () => {
      if (activeAudio === audio) activeAudio = null;
    }, { once: true });
    return true;
  }

  async function playAudioFile(kind, force = false) {
    const now = Date.now();
    if (!force && now - lastPlayAt < 350) return false;
    lastPlayAt = now;
    stopSound();

    const candidates = AUDIO_FILES[kind] || AUDIO_FILES.amongus;
    for (const url of candidates) {
      try {
        await tryPlayUrl(kind, url);
        console.info('Alert-Sound gestartet:', kind, url);
        return true;
      } catch (error) {
        console.warn('Soundpfad fehlgeschlagen:', kind, url, error.message);
        stopSound();
      }
    }

    console.warn('Keine MP3-Datei konnte abgespielt werden, nutze Fallback:', kind);
    playFallback(kind);
    return false;
  }

  function chooseSound() {
    const label = textElement.textContent.trim().toLowerCase();
    if (label.includes('gleich ist mittag') || label.includes('mittagspause zu ende')) return 'alarm';
    return 'amongus';
  }

  const observer = new MutationObserver(() => {
    const visible = announcement.classList.contains('visible');
    const currentKey = visible ? `${textElement.textContent}|${announcement.className}` : '';
    if (visible && currentKey !== lastAlertKey) {
      lastAlertKey = currentKey;
      playAudioFile(chooseSound());
    } else if (!visible) {
      lastAlertKey = '';
      stopSound();
    }
  });

  observer.observe(announcement, {
    attributes: true,
    attributeFilter: ['class'],
    childList: true,
    subtree: true
  });

  lunchTestButton?.addEventListener('click', () => {
    playAudioFile('amongus', true);
  }, { capture: true });

  alarmTestButton?.addEventListener('click', () => {
    playAudioFile('alarm', true);
  }, { capture: true });

  window.alertSounds = {
    playAmongUs: () => playAudioFile('amongus', true),
    playAlarm: () => playAudioFile('alarm', true),
    stop: stopSound
  };

  window.addEventListener('beforeunload', stopSound);
})();
