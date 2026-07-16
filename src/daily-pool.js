const MEME_POOL_DAY_KEY = 'mahlzeitDashMemePoolDay';

function getMemePoolDayKey() {
  const parts = getBerlinDateParts(currentDate());
  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function refreshDailyMemePool() {
  const currentDay = getMemePoolDayKey();
  const savedDay = localStorage.getItem(MEME_POOL_DAY_KEY);

  if (savedDay === currentDay) return;

  localStorage.setItem(MEME_POOL_DAY_KEY, currentDay);
  state.memePool = [];

  try {
    await refillMemePool(true);

    // Im Ruhemodus wird der neue Pool nur vorbereitet. Während des aktiven
    // Dashboards wird direkt ein neues Meme aus dem Tagespool angezeigt.
    if (!state.sleepMode) await loadMeme(false);
  } catch (error) {
    console.warn(`Täglicher Meme-Pool konnte nicht erneuert werden: ${error.message}`);
  }
}

setTimeout(refreshDailyMemePool, 1500);
setInterval(refreshDailyMemePool, 60 * 1000);
