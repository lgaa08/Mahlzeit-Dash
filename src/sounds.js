(() => {
  const announcement = document.getElementById('announcement');
  const textElement = document.getElementById('announcement-text');
  if (!announcement || !textElement) return;

  const AUDIO_FILES = {
    amongus: './assets/sounds/amongus.mp3',
    alarm: './assets/sounds/alarm.mp3'
  };

  let audioContext = null;
  let activeNodes = [];
  let activeAudio = null;
  let lastAlertKey = '';

  function getAudioContext() {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      audioContext = new AudioContextClass();
    }
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    return audioContext;
  }

  function stopSound() {
    if (activeAudio) {
      try {
        activeAudio.pause();
        activeAudio.currentTime = 0;
      } catch (_error) {}
      activeAudio = null;
    }

    for (const node of activeNodes) {
      try { node.stop?.(); } catch (_error) {}
      try { node.disconnect?.(); } catch (_error) {}
    }
    activeNodes = [];
  }

  function tone(ctx, frequency, start, duration, type = 'sine', volume = 0.11, slideTo = null) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
    activeNodes.push(oscillator, gain);
  }

  function playFallback(kind) {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime + 0.03;

    if (kind === 'alarm') {
      [880, 880, 1175, 880, 1175].forEach((frequency, index) => {
        tone(ctx, frequency, now + index * 0.18, 0.13, 'square', 0.075);
      });
      return;
    }

    tone(ctx, 240, now, 0.18, 'square', 0.07, 520);
    tone(ctx, 520, now + 0.2, 0.18, 'square', 0.07, 190);
    tone(ctx, 190, now + 0.42, 0.38, 'triangle', 0.08, 760);
  }

  async function playAudioFile(kind) {
    stopSound();
    const audio = new Audio(AUDIO_FILES[kind]);
    activeAudio = audio;
    audio.preload = 'auto';
    audio.volume = kind === 'alarm' ? 0.82 : 0.9;
    audio.addEventListener('ended', () => {
      if (activeAudio === audio) activeAudio = null;
    }, { once: true });
    audio.addEventListener('error', () => {
      if (activeAudio === audio) activeAudio = null;
      playFallback(kind);
    }, { once: true });

    try {
      await audio.play();
    } catch (_error) {
      if (activeAudio === audio) activeAudio = null;
      playFallback(kind);
    }
  }

  function chooseSound() {
    const label = textElement.textContent.trim().toLowerCase();
    if (label.includes('gleich ist mittag') || label.includes('mittagspause zu ende')) return 'alarm';
    return 'amongus';
  }

  function playAlertSound() {
    playAudioFile(chooseSound());
  }

  const observer = new MutationObserver(() => {
    const visible = announcement.classList.contains('visible');
    const currentKey = visible ? `${textElement.textContent}|${announcement.className}` : '';
    if (visible && currentKey !== lastAlertKey) {
      lastAlertKey = currentKey;
      playAlertSound();
    } else if (!visible) {
      lastAlertKey = '';
      stopSound();
    }
  });

  observer.observe(announcement, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
  window.addEventListener('beforeunload', stopSound);
})();
