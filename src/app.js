const state = {
  config: null,
  activeAnnouncement: null,
  previewActive: false,
  lastMemeUrl: null,
  networkTimeBase: null,
  networkTimeFetchedAt: null
};

const elements = {
  clock: document.getElementById('clock'),
  date: document.getElementById('date'),
  clockSync: document.getElementById('clock-sync'),
  browser: document.getElementById('monitoring-browser'),
  browserLoading: document.getElementById('browser-loading'),
  weatherIcon: document.getElementById('weather-icon'),
  weatherTemp: document.getElementById('weather-temp'),
  weatherDescription: document.getElementById('weather-description'),
  weatherLocation: document.getElementById('weather-location'),
  weatherDetails: document.getElementById('weather-details'),
  memeContent: document.getElementById('meme-content'),
  announcement: document.getElementById('announcement'),
  announcementIcon: document.getElementById('announcement-icon'),
  announcementText: document.getElementById('announcement-text'),
  announcementSubtext: document.getElementById('announcement-subtext'),
  announcementClose: document.getElementById('announcement-close')
};

const WEATHER_CODES = {
  0: ['☀️', 'Klar'], 1: ['🌤️', 'Überwiegend klar'], 2: ['⛅', 'Teilweise bewölkt'],
  3: ['☁️', 'Bewölkt'], 45: ['🌫️', 'Nebel'], 48: ['🌫️', 'Reifnebel'],
  51: ['🌦️', 'Leichter Nieselregen'], 53: ['🌦️', 'Nieselregen'], 55: ['🌧️', 'Starker Nieselregen'],
  61: ['🌦️', 'Leichter Regen'], 63: ['🌧️', 'Regen'], 65: ['🌧️', 'Starker Regen'],
  71: ['🌨️', 'Leichter Schneefall'], 73: ['🌨️', 'Schneefall'], 75: ['❄️', 'Starker Schneefall'],
  80: ['🌦️', 'Regenschauer'], 81: ['🌧️', 'Kräftige Schauer'], 82: ['⛈️', 'Starke Schauer'],
  95: ['⛈️', 'Gewitter'], 96: ['⛈️', 'Gewitter mit Hagel'], 99: ['⛈️', 'Starkes Gewitter']
};

function escapeHtml(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function currentNetworkDate() {
  if (!state.networkTimeBase || !state.networkTimeFetchedAt) return new Date();
  return new Date(state.networkTimeBase.getTime() + (Date.now() - state.networkTimeFetchedAt));
}

function getBerlinDateParts(date = currentNetworkDate()) {
  const timeZone = state.config?.time?.timezone || state.config?.schedule?.timezone || 'Europe/Berlin';
  return Object.fromEntries(new Intl.DateTimeFormat('de-DE', {
    timeZone,
    weekday: 'long', year: 'numeric', month: 'long', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

async function syncNetworkTime() {
  try {
    const response = await fetch(state.config.time.syncUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const timestamp = data.unixtime ? Number(data.unixtime) * 1000 : Date.parse(data.datetime);
    if (!Number.isFinite(timestamp)) throw new Error('Ungültige Netzzeit');
    state.networkTimeBase = new Date(timestamp);
    state.networkTimeFetchedAt = Date.now();
    elements.clockSync.textContent = 'NETZZEIT · EUROPE/BERLIN';
    elements.clockSync.classList.add('synced');
  } catch (_error) {
    elements.clockSync.textContent = 'SYSTEMZEIT · NETZSYNC FEHLGESCHLAGEN';
    elements.clockSync.classList.remove('synced');
  }
}

function updateClock() {
  const parts = getBerlinDateParts();
  elements.clock.textContent = `${parts.hour}:${parts.minute}:${parts.second}`;
  elements.date.textContent = `${parts.weekday}, ${parts.day}. ${parts.month} ${parts.year}`;
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value).split(':').map(Number);
  return (hours * 60) + minutes;
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
  const currentMinutes = Number(now.hour) * 60 + Number(now.minute);
  const seconds = Number(now.second);

  if (currentMinutes >= timeToMinutes(schedule.almostLunch) && currentMinutes < timeToMinutes(schedule.lunchStart)) {
    showAnnouncement('almost-lunch', 'Gleich ist Mittag!', 'Noch wenige Minuten durchhalten', '⏰', true); return;
  }
  if (currentMinutes >= timeToMinutes(schedule.lunchStart) && currentMinutes <= timeToMinutes(schedule.lunchEndDisplayUntil)) {
    showAnnouncement('lunch', 'Mahlzeit!', 'Lasst es euch schmecken', '🍽️'); return;
  }
  if (currentMinutes === timeToMinutes(schedule.breakFinished) && seconds < Number(schedule.breakFinishedDurationSeconds || 60)) {
    showAnnouncement('finished', 'Mittagspause zu Ende', 'Weiter geht’s!', '💼', true); return;
  }
  hideAnnouncement();
}

function setupLunchPreview() {
  document.getElementById('lunch-preview').addEventListener('click', () => showAnnouncement('preview', 'Mahlzeit!', 'Testansicht · Lasst es euch schmecken', '🍽️', false, true));
  elements.announcementClose.addEventListener('click', () => { hideAnnouncement(true); evaluateSchedule(); });
}

function setupBrowser() {
  const browser = elements.browser;
  const homeUrl = state.config.monitoringUrl;
  browser.src = homeUrl;
  browser.addEventListener('did-start-loading', () => elements.browserLoading.classList.remove('hidden'));
  browser.addEventListener('did-stop-loading', () => elements.browserLoading.classList.add('hidden'));
  browser.addEventListener('did-fail-load', (event) => {
    if (event.errorCode === -3) return;
    elements.browserLoading.innerHTML = `<p>Monitoring konnte nicht geladen werden<br>${escapeHtml(event.errorDescription)}</p>`;
    elements.browserLoading.classList.remove('hidden');
  });
  browser.addEventListener('new-window', (event) => { event.preventDefault(); browser.loadURL(event.url); });
  document.getElementById('browser-back').addEventListener('click', () => browser.canGoBack() && browser.goBack());
  document.getElementById('browser-forward').addEventListener('click', () => browser.canGoForward() && browser.goForward());
  document.getElementById('browser-home').addEventListener('click', () => browser.loadURL(homeUrl));
  document.getElementById('browser-reload').addEventListener('click', () => browser.reload());
}

async function loadWeather() {
  const weather = state.config.weather;
  const params = new URLSearchParams({
    latitude: String(weather.latitude), longitude: String(weather.longitude), timezone: weather.timezone,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max', forecast_days: '1'
  });
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const current = data.current;
    const [icon, description] = WEATHER_CODES[current.weather_code] || ['🌡️', 'Unbekannt'];
    elements.weatherIcon.textContent = icon;
    elements.weatherTemp.textContent = `${Math.round(current.temperature_2m)}°`;
    elements.weatherDescription.textContent = `${description} · gefühlt ${Math.round(current.apparent_temperature)}°`;
    elements.weatherLocation.textContent = weather.locationName;
    elements.weatherDetails.textContent = `${Math.round(current.wind_speed_10m)} km/h · ${Math.round(current.relative_humidity_2m)} % · ${Math.round(data.daily.temperature_2m_min[0])}–${Math.round(data.daily.temperature_2m_max[0])}°`;
  } catch (_error) {
    elements.weatherIcon.textContent = '⚠️';
    elements.weatherTemp.textContent = '--°';
    elements.weatherDescription.textContent = 'Wetter nicht verfügbar';
    elements.weatherDetails.textContent = 'Neuer Versuch in 10 Minuten';
  }
}

function renderMemeFallback() {
  const fallbacks = [
    ['Admin-Weisheit', 'Ein Neustart ist keine Lösung. Aber erstaunlich oft die Lösung.'],
    ['Monitoring', 'Alles grün. Das macht uns erst recht misstrauisch.'],
    ['Netzwerk', 'Es ist immer DNS. Außer wenn es DHCP ist.'],
    ['Büroalltag', 'Dieses Meeting hätte eine E-Mail sein können.']
  ];
  const item = fallbacks[Math.floor(Date.now() / 1800000) % fallbacks.length];
  elements.memeContent.className = 'meme-content fallback-meme';
  elements.memeContent.innerHTML = `<div><div class="fallback-emoji">😄</div><h2>${escapeHtml(item[0])}</h2><p>${escapeHtml(item[1])}</p></div>`;
}

function isSafeMeme(meme) {
  if (!meme?.url || meme.nsfw || meme.spoiler || meme.url === state.lastMemeUrl) return false;
  if (String(meme.subreddit || '').toLowerCase() !== 'deutschememes') return false;
  const url = String(meme.url).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].some((ext) => url.includes(ext))) return false;
  const searchable = `${meme.title || ''} ${meme.postLink || ''}`.toLowerCase();
  return !(state.config.meme.blockedKeywords || []).some((word) => searchable.includes(String(word).toLowerCase()));
}

async function loadMeme() {
  elements.memeContent.className = 'meme-content loading-card';
  elements.memeContent.textContent = 'Firmentaugliches deutsches Meme wird gesucht …';
  const attempts = Math.max(1, Number(state.config.meme.maxAttempts || 12));
  try {
    for (let i = 0; i < attempts; i += 1) {
      const response = await fetch('https://meme-api.com/gimme/deutschememes', { cache: 'no-store' });
      if (!response.ok) continue;
      const meme = await response.json();
      if (!isSafeMeme(meme)) continue;
      state.lastMemeUrl = meme.url;
      const title = escapeHtml(meme.title || 'Deutsches Meme');
      elements.memeContent.className = 'meme-content';
      elements.memeContent.innerHTML = `<img src="${escapeHtml(meme.url)}" alt="${title}" referrerpolicy="no-referrer"><div class="meme-caption">${title}</div>`;
      return;
    }
    throw new Error('Kein passendes Meme');
  } catch (_error) {
    renderMemeFallback();
  }
}

async function init() {
  state.config = await window.dashboardAPI.getConfig();
  await syncNetworkTime();
  updateClock();
  evaluateSchedule();
  setupLunchPreview();
  setupBrowser();
  loadWeather();
  loadMeme();

  setInterval(() => { updateClock(); evaluateSchedule(); }, 1000);
  setInterval(syncNetworkTime, Math.max(5, Number(state.config.time.resyncMinutes || 15)) * 60000);
  setInterval(loadWeather, Math.max(5, Number(state.config.weather.refreshMinutes || 10)) * 60000);
  setInterval(loadMeme, Math.max(10, Number(state.config.meme.refreshMinutes || 30)) * 60000);
  document.getElementById('meme-refresh').addEventListener('click', loadMeme);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'F5') elements.browser.reload();
    if (event.key === 'Escape' && state.previewActive) hideAnnouncement(true);
    if (event.key === 'F11') event.preventDefault();
  });
}

init().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<div class="fatal-error">Dashboard konnte nicht gestartet werden: ${escapeHtml(error.message)}</div>`;
});
