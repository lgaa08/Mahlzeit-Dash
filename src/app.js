const state = {
  config: null,
  memeTimer: null,
  activeAnnouncement: null,
  lastMemeUrl: null,
  previewActive: false
};

const elements = {
  appTitle: document.getElementById('app-title'),
  clock: document.getElementById('clock'),
  date: document.getElementById('date'),
  browser: document.getElementById('monitoring-browser'),
  browserLoading: document.getElementById('browser-loading'),
  weatherLocation: document.getElementById('weather-location'),
  weatherContent: document.getElementById('weather-content'),
  memeContent: document.getElementById('meme-content'),
  announcement: document.getElementById('announcement'),
  announcementIcon: document.getElementById('announcement-icon'),
  announcementText: document.getElementById('announcement-text'),
  announcementSubtext: document.getElementById('announcement-subtext'),
  announcementClose: document.getElementById('announcement-close')
};

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getBerlinDateParts(date = new Date()) {
  const timeZone = state.config?.schedule?.timezone || 'Europe/Berlin';
  const parts = new Intl.DateTimeFormat('de-DE', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);

  return Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
  );
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value).split(':').map(Number);
  return (hours * 60) + minutes;
}

function updateClock() {
  const parts = getBerlinDateParts();
  elements.clock.textContent = `${parts.hour}:${parts.minute}:${parts.second}`;
  elements.date.textContent = `${parts.weekday}, ${parts.day}. ${parts.month} ${parts.year}`;
}

function showAnnouncement(type, text, subtext, icon, blinking = false, preview = false) {
  if (state.activeAnnouncement === type && !preview) return;
  state.activeAnnouncement = type;
  state.previewActive = preview;
  elements.announcementText.textContent = text;
  elements.announcementSubtext.textContent = subtext || '';
  elements.announcementIcon.textContent = icon || '🍽️';
  elements.announcement.classList.toggle('blinking', blinking);
  elements.announcement.classList.add('visible');
  elements.announcement.setAttribute('aria-hidden', 'false');
  elements.announcementClose.style.display = preview ? 'block' : 'none';
}

function hideAnnouncement(force = false) {
  if (state.previewActive && !force) return;
  state.activeAnnouncement = null;
  state.previewActive = false;
  elements.announcement.classList.remove('visible', 'blinking');
  elements.announcement.setAttribute('aria-hidden', 'true');
  elements.announcementClose.style.display = 'none';
}

function evaluateSchedule() {
  if (state.previewActive) return;

  const schedule = state.config.schedule;
  const now = getBerlinDateParts();
  const currentMinutes = (Number(now.hour) * 60) + Number(now.minute);
  const seconds = Number(now.second);
  const almostLunch = timeToMinutes(schedule.almostLunch);
  const lunchStart = timeToMinutes(schedule.lunchStart);
  const lunchEnd = timeToMinutes(schedule.lunchEndDisplayUntil);
  const breakFinished = timeToMinutes(schedule.breakFinished);
  const finishedDuration = Math.max(1, Number(schedule.breakFinishedDurationSeconds || 60));

  if (currentMinutes >= almostLunch && currentMinutes < lunchStart) {
    showAnnouncement('almost-lunch', 'Gleich ist Mittag!', 'Noch wenige Minuten durchhalten', '⏰', true);
    return;
  }

  if (currentMinutes >= lunchStart && currentMinutes <= lunchEnd) {
    showAnnouncement('lunch', 'Mahlzeit!', 'Lasst es euch schmecken', '🍽️');
    return;
  }

  if (currentMinutes === breakFinished && seconds < finishedDuration) {
    showAnnouncement('finished', 'Mittagspause zu Ende', 'Weiter geht’s!', '💼', true);
    return;
  }

  hideAnnouncement();
}

function setupLunchPreview() {
  document.getElementById('lunch-preview').addEventListener('click', () => {
    showAnnouncement('preview-lunch', 'Mahlzeit!', 'Testansicht · Lasst es euch schmecken', '🍽️', false, true);
  });

  elements.announcementClose.addEventListener('click', () => {
    hideAnnouncement(true);
    evaluateSchedule();
  });
}

function setupBrowser() {
  const browser = elements.browser;
  const homeUrl = state.config.monitoringUrl;
  browser.src = homeUrl;

  browser.addEventListener('did-start-loading', () => elements.browserLoading.classList.remove('hidden'));
  browser.addEventListener('did-stop-loading', () => elements.browserLoading.classList.add('hidden'));
  browser.addEventListener('did-fail-load', (event) => {
    if (event.errorCode === -3) return;
    elements.browserLoading.textContent = `Monitoring konnte nicht geladen werden (${event.errorDescription}).`;
    elements.browserLoading.classList.remove('hidden');
  });

  browser.addEventListener('new-window', (event) => {
    event.preventDefault();
    browser.loadURL(event.url);
  });

  document.getElementById('browser-back').addEventListener('click', () => browser.canGoBack() && browser.goBack());
  document.getElementById('browser-forward').addEventListener('click', () => browser.canGoForward() && browser.goForward());
  document.getElementById('browser-home').addEventListener('click', () => browser.loadURL(homeUrl));
  document.getElementById('browser-reload').addEventListener('click', () => browser.reload());
}

function loadWeatherOnline() {
  const weather = state.config.weather;
  elements.weatherLocation.textContent = weather.locationName;
  elements.weatherContent.className = 'weather-content';
  elements.weatherContent.innerHTML = '';

  const weatherView = document.createElement('webview');
  weatherView.id = 'weather-online-browser';
  weatherView.setAttribute('partition', 'persist:weatheronline');
  weatherView.setAttribute('src', weather.pageUrl);
  weatherView.setAttribute('allowpopups', 'false');
  weatherView.style.width = '100%';
  weatherView.style.height = '100%';
  weatherView.style.display = 'flex';
  weatherView.style.background = '#fff';

  weatherView.addEventListener('did-fail-load', (event) => {
    if (event.errorCode === -3) return;
    elements.weatherContent.innerHTML = `<div class="error-card">WetterOnline konnte nicht geladen werden.<br>${escapeHtml(event.errorDescription)}</div>`;
  });

  weatherView.addEventListener('new-window', (event) => event.preventDefault());
  elements.weatherContent.appendChild(weatherView);
}

function renderMemeFallback() {
  const fallbacks = [
    ['Admin-Weisheit', 'Ein Neustart ist keine Lösung. Aber erstaunlich oft die Lösung.'],
    ['Monitoring', 'Alles grün. Das macht uns erst recht misstrauisch.'],
    ['Kaffee-Service', 'System läuft stabil. Administrator noch nicht.'],
    ['Freitag 16:59', 'Wer jetzt noch ein Update startet, übernimmt auch den Bereitschaftsdienst.'],
    ['Ticket-Status', 'Problem konnte nicht reproduziert werden. Benutzer leider schon.'],
    ['Netzwerk', 'Es ist immer DNS. Außer wenn es DHCP ist.'],
    ['Büroalltag', 'Dieses Meeting hätte eine E-Mail sein können.'],
    ['Montag', 'Authentifizierung fehlgeschlagen: Motivation nicht gefunden.']
  ];
  const slot = Math.floor(Date.now() / (30 * 60 * 1000));
  const item = fallbacks[slot % fallbacks.length];
  elements.memeContent.className = 'meme-content';
  elements.memeContent.innerHTML = `
    <div class="loading-card" style="height:100%;padding:28px;text-align:center">
      <div><div style="font-size:52px">😄</div><h2 style="font-size:30px;margin:14px 0 8px">${escapeHtml(item[0])}</h2><p style="color:#aab2c0;font-size:20px;margin:0">${escapeHtml(item[1])}</p></div>
    </div>`;
}

function isSafeGermanMeme(meme) {
  if (!meme?.url || meme.nsfw || meme.spoiler || meme.url === state.lastMemeUrl) return false;
  const allowedSources = (state.config.meme.sources || []).map((source) => source.toLowerCase());
  if (!allowedSources.includes(String(meme.subreddit || '').toLowerCase())) return false;

  const imageUrl = String(meme.url).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].some((ext) => imageUrl.includes(ext))) return false;

  const searchable = `${meme.title || ''} ${meme.postLink || ''}`.toLowerCase();
  return !(state.config.meme.blockedKeywords || []).some((word) => searchable.includes(String(word).toLowerCase()));
}

async function fetchSafeGermanMeme() {
  const sources = state.config.meme.sources || ['ich_iel', 'deutschememes', 'GermanMemes'];
  const maxAttempts = Math.max(1, Number(state.config.meme.maxAttempts || 8));

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const source = sources[Math.floor(Math.random() * sources.length)];
    try {
      const response = await fetch(`https://meme-api.com/gimme/${encodeURIComponent(source)}`, { cache: 'no-store' });
      if (!response.ok) continue;
      const meme = await response.json();
      if (isSafeGermanMeme(meme)) return meme;
    } catch (_error) {
      // Nächste deutsche Quelle versuchen.
    }
  }

  throw new Error('Kein geeignetes deutsches Meme gefunden');
}

async function loadMeme() {
  if (!state.config.meme.enabled) {
    elements.memeContent.innerHTML = '<div class="loading-card" style="height:100%">Meme-Anzeige deaktiviert</div>';
    return;
  }

  elements.memeContent.className = 'meme-content loading-card';
  elements.memeContent.textContent = 'Deutsches, firmentaugliches Meme wird gesucht …';

  try {
    const meme = await fetchSafeGermanMeme();
    state.lastMemeUrl = meme.url;
    const title = escapeHtml(meme.title || 'Deutsches Meme');
    const source = escapeHtml(`r/${meme.subreddit}`);
    elements.memeContent.className = 'meme-content';
    elements.memeContent.innerHTML = `<img src="${escapeHtml(meme.url)}" alt="${title}" referrerpolicy="no-referrer"><div class="meme-caption">${title} · ${source}</div>`;
  } catch (_error) {
    renderMemeFallback();
  }
}

async function init() {
  state.config = await window.dashboardAPI.getConfig();
  elements.appTitle.textContent = state.config.appTitle;
  document.title = state.config.appTitle;

  updateClock();
  evaluateSchedule();
  setupLunchPreview();
  setupBrowser();
  loadWeatherOnline();
  loadMeme();

  setInterval(() => {
    updateClock();
    evaluateSchedule();
  }, 1000);

  setInterval(loadWeatherOnline, 30 * 60 * 1000);
  const refreshMinutes = Math.max(10, Number(state.config.meme.refreshMinutes || 30));
  state.memeTimer = setInterval(loadMeme, refreshMinutes * 60 * 1000);

  document.getElementById('meme-refresh').addEventListener('click', loadMeme);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'F5') elements.browser.reload();
    if (event.key === 'Escape' && state.previewActive) hideAnnouncement(true);
    if (event.key === 'F11') event.preventDefault();
  });
}

init().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<div class="error-card">Dashboard konnte nicht gestartet werden: ${escapeHtml(error.message)}</div>`;
});
