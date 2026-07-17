(() => {
  const announcement = document.getElementById('announcement');
  const textElement = document.getElementById('announcement-text');
  if (!announcement || !textElement) return;

  let audioContext = null;
  let activeNodes = [];
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

  function playCoffee(ctx, now) {
    [523, 659, 784, 1047].forEach((frequency, index) => tone(ctx, frequency, now + index * 0.11, 0.18, 'sine', 0.09));
    tone(ctx, 180, now + 0.5, 0.34, 'triangle', 0.07, 260);
  }

  function playCountdown(ctx, now) {
    tone(ctx, 880, now, 0.12, 'square', 0.07);
    tone(ctx, 880, now + 0.2, 0.12, 'square', 0.07);
    tone(ctx, 1175, now + 0.4, 0.32, 'square', 0.085, 1500);
  }

  function playLunch(ctx, now) {
    [392, 523, 659, 784].forEach((frequency, index) => tone(ctx, frequency, now + index * 0.1, 0.2, index % 2 ? 'triangle' : 'sine', 0.1));
    tone(ctx, 1047, now + 0.43, 0.45, 'sine', 0.09, 1319);
  }

  function playBackToWork(ctx, now) {
    tone(ctx, 220, now, 0.2, 'sawtooth', 0.065, 330);
    tone(ctx, 330, now + 0.2, 0.2, 'sawtooth', 0.065, 440);
    tone(ctx, 440, now + 0.4, 0.28, 'sawtooth', 0.075, 660);
  }

  function playAlmostHome(ctx, now) {
    [330, 392, 494, 659].forEach((frequency, index) => tone(ctx, frequency, now + index * 0.12, 0.24, 'triangle', 0.085));
    tone(ctx, 180, now + 0.48, 0.28, 'sine', 0.06, 95);
  }

  function playGoodbye(ctx, now) {
    [784, 659, 523, 392].forEach((frequency, index) => tone(ctx, frequency, now + index * 0.16, 0.3, 'sine', 0.09));
    tone(ctx, 262, now + 0.68, 0.5, 'triangle', 0.065, 196);
  }

  function playFunnyFallback(ctx, now) {
    tone(ctx, 240, now, 0.18, 'square', 0.07, 520);
    tone(ctx, 520, now + 0.2, 0.18, 'square', 0.07, 190);
    tone(ctx, 190, now + 0.42, 0.38, 'triangle', 0.08, 760);
  }

  function playAlertSound() {
    const ctx = getAudioContext();
    if (!ctx) return;
    stopSound();
    const label = textElement.textContent.trim().toLowerCase();
    const now = ctx.currentTime + 0.03;

    if (label.includes('guten morgen')) playCoffee(ctx, now);
    else if (label.includes('gleich ist mittag')) playCountdown(ctx, now);
    else if (label.includes('mahlzeit')) playLunch(ctx, now);
    else if (label.includes('mittagspause zu ende')) playBackToWork(ctx, now);
    else if (label.includes('bald heim')) playAlmostHome(ctx, now);
    else if (label.includes('feierabend')) playGoodbye(ctx, now);
    else playFunnyFallback(ctx, now);
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
