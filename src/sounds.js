(() => {
  const announcement = document.getElementById('announcement');
  const textElement = document.getElementById('announcement-text');
  const testButton = document.getElementById('lunch-preview');
  if (!announcement || !textElement) return;

  const AUDIO_FILES = {
    amongus: new URL('assets/sounds/amongus.mp3', window.location.href).href,
    alarm: new URL('assets/sounds/alarm.mp3', window.location.href).href
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

  async function playAudioFile(kind, force = false) {
    const now = Date.now();
    if (!force && now - lastPlayAt < 350) return;
    lastPlayAt = now;
    stopSound();

    const url = AUDIO_FILES[kind] || AUDIO_FILES.amongus;
    const audio = new Audio();
    activeAudio = audio;
    audio.preload = 'auto';
    audio.volume = kind === 'alarm' ? 0.9 : 1;
    audio.src = url;

    audio.addEventListener('ended', () => {
      if (activeAudio === audio) activeAudio = null;
    }, { once: true });

    audio.addEventListener('error', () => {
      console.error('Alert-Sound konnte nicht geladen werden:', kind, url, audio.error);
      if (activeAudio === audio) activeAudio = null;
    }, { once: true });

    try {
      await audio.play();
      console.info('Alert-Sound gestartet:', kind, url);
    } catch (error) {
      console.error('Alert-Sound konnte nicht abgespielt werden:', kind, url, error);
      if (activeAudio === audio) activeAudio = null;
    }
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

  testButton?.addEventListener('click', () => {
    setTimeout(() => playAudioFile('amongus', true), 80);
  });

  window.addEventListener('beforeunload', stopSound);
})();
