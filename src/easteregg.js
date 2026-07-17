(() => {
  const sequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let position = 0;
  let overlay = null;

  function closeEgg() {
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => {
      overlay?.remove();
      overlay = null;
    }, 350);
    window.alertSounds?.stop?.();
  }

  function launchEgg() {
    if (overlay) return;
    overlay = document.createElement('section');
    overlay.className = 'easteregg-overlay visible';
    overlay.innerHTML = `
      <div class="easteregg-stars"></div>
      <div class="easteregg-card">
        <div class="easteregg-siren">🚨</div>
        <div class="easteregg-title">MAHLZEIT.EXE</div>
        <div class="easteregg-subtitle">NOTFALLMODUS AKTIVIERT</div>
        <div class="easteregg-dancers" aria-hidden="true">
          <span>ඞ</span><span>🍕</span><span>ඞ</span><span>🥙</span><span>ඞ</span>
        </div>
        <p>Produktivität wurde erfolgreich beendet.</p>
        <button type="button" class="glow-button easteregg-close">Okay, zurück an die Arbeit</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.easteregg-close')?.addEventListener('click', closeEgg);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeEgg();
    });
    window.alertSounds?.playAlarm?.();
    setTimeout(() => window.alertSounds?.playAmongUs?.(), 1200);
  }

  document.addEventListener('keydown', (event) => {
    const expected = sequence[position];
    const pressed = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (pressed === expected) {
      position += 1;
      if (position === sequence.length) {
        position = 0;
        launchEgg();
      }
    } else {
      position = pressed === sequence[0] ? 1 : 0;
    }
    if (event.key === 'Escape' && overlay) closeEgg();
  });

  let clockClicks = 0;
  let clockTimer = null;
  document.getElementById('clock')?.addEventListener('click', () => {
    clockClicks += 1;
    clearTimeout(clockTimer);
    clockTimer = setTimeout(() => { clockClicks = 0; }, 1300);
    if (clockClicks >= 5) {
      clockClicks = 0;
      launchEgg();
    }
  });
})();
