const state = {
  config: null,
  memeTimer: null,
  activeAnnouncement: null,
  lastMemeUrl: null
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
  announcementSubtext: document.getElementById('announcement-subtext')
};

const WEATHER_CODES = {
  0: ['☀️', 'Klar'],
  1: ['🌤️', 'Überwiegend klar'],
  2: ['⛅', 'Teilweise bewölkt'],
  3: ['☁️', 'Bewölkt'],
  45: ['🌫️', 'Nebel'],
  48: ['🌫️', 'Reifnebel'],
  51: ['🌦️', 'Leichter Nieselregen'],
  53: ['🌦️', 'Nieselregen'],
  55: ['🌧️', 'Starker Nieselregen'],
  61: ['🌦️', 'Leichter Regen'],
  63: ['🌧️', 'Regen'],
  65: ['🌧️', 'Starker Regen'],
  71: ['🌨️', 'Leichter Schneefall'],
  73: ['🌨️', 'Schneefall'],
  75: ['❄️', 'Starker Schneefall'],
  80: ['🌦️', 'Regenschauer'],
  81: ['🌧️', 'Kräftige Regenschauer'],
  82: ['⛈️', 'Starke Regenschauer'],
  95: ['⛈️', 'Gewitter'],
  96: ['⛈️', 'Gewitter mit Hagel'],
  99: ['⛈️', 'Starkes Gewitter mit Hagel']
};

function getBerlinDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('de-DE', {
    timeZone: state.config?.schedule?.timezone || 'Europe/Berlin',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  return Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours * 60) + minutes;
}

function updateClock() {
  const parts = getBerlinDateParts();
  elements.clock.textContent = `${parts.hour}:${parts.minute}:${parts.second}`;
  elements.date.textContent = `${parts.weekday}, ${parts.day}. ${parts.month} ${parts.year}`;
}

function showAnnouncement(type, text, subtext, icon, blinking = false) {
  if (state.activeAnnouncement === type) return;
  state.activeAnnouncement = type;
  elements.announcementText.textContent = text;
  elements.announcementSubtext.textContent = subtext || '';
  elements.announcementIcon.textContent = icon || '🍽️';
  elements.announcement.classList.toggle('blinking', blinking);
  elements.announcement.classList.add('visible');
  elements.announcement.setAttribute('aria-hidden', 'false');
}

function hideAnnouncement() {
  if (!state.activeAnnouncement) return;
  state.activeAnnouncement = null;
  elements.announcement.classList.remove('visible', 'blinking');
  elements.announcement.setAttribute('aria-hidden', 'true');
}

function evaluateSchedule() {
  const schedule = state.config.schedule;
  const now = getBerlinDateParts();
  const currentMinutes = (Number(now.hour) * 60) + Number(now.minute);
  const seconds = Number(now.second);

  const almostLunch = timeToMinutes(schedule.almostLunch);
  const lunchStart = timeToMinutes(schedule.lunchStart);
  const lunchEndDisplayUntil = timeToMinutes(schedule.lunchEndDisplayUntil);
  const breakFinished = timeToMinutes(schedule.breakFinished);
  const finishedDuration = Math.max(1, Number(schedule.breakFinishedDurationSeconds || 60));

  if (currentMinutes >= almostLunch && currentMinutes < lunchStart) {
    showAnnouncement('almost-lunch', 'Gleich ist Mittag!', 'Noch wenige Minuten durchhalten', '⏰', true);
    return;
  }

  if (currentMinutes >= lunchStart && currentMinutes <= lunchEndDisplayUntil) {
    showAnnouncement('lunch', 'Mahlzeit!', 'Lasst es euch schmecken', '🍽️', false);
    return;
  }

  if (currentMinutes === breakFinished && seconds < finishedDuration) {
    showAnnouncement('finished', 'Mittagspause zu Ende', 'Weiter geht’s!', '💼', true);
    return;
  }

  hideAnnouncement();
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

  document.getElementById('browser-back').addEventListener('click', () => {
    if (browser.canGoBack()) browser.goBack();
  });
  document.getElementById('browser-forward').addEventListener('click', () => {
    if (browser.canGoForward()) browser.goForward();
  });
  document.getElementById('browser-home').addEventListener('click', () => browser.loadURL(homeUrl));
  document.getElementById('browser-reload').addEventListener('click', () => browser.reload());
}

async function loadWeather() {
  const { latitude, longitude, locationName, timezone } = state.config.weather;
  elements.weatherLocation.textContent = locationName;

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    timezone,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    forecast_days: '1'
  });

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const current = data.current;
    const [icon, description] = WEATHER_CODES[current.weather_code] || ['🌡️', 'Unbekannt'];

    elements.weatherContent.className = 'weather-content';
    elements.weatherContent.innerHTML = `
      <div class="weather-current">
        <div class="weather-icon">${icon}</div>
        <div>
          <div class="weather-temp">${Math.round(current.temperature_2m)}°</div>
          <div class="weather-description">${description} · gefühlt ${Math.round(current.apparent_temperature)}°C</div>
        </div>
      </div>
      <div class="weather-details">
        <div class="weather-detail"><span>Luftfeuchte</span><strong>${Math.round(current.relative_humidity_2m)} %</strong></div>
        <div class="weather-detail"><span>Wind</span><strong>${Math.round(current.wind_speed_10m)} km/h</strong></div>
        <div class="weather-detail"><span>Heute</span><strong>${Math.round(data.daily.temperature_2m_min[0])}–${Math.round(data.daily.temperature_2m_max[0])} °C</strong></div>
      </div>
    `;
  } catch (error) {
    elements.weatherContent.className = 'weather-content error-card';
    elements.weatherContent.textContent = `Wetter aktuell nicht verfügbar. ${error.message}`;
  }
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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
  const halfHourSlot = Math.floor(Date.now() / (30 * 60 * 1000));
  const item = fallbacks[halfHourSlot % fallbacks.length];
  elements.memeContent.className = 'meme-content';
  elements.memeContent.innerHTML = `
    <div class="loading-card" style="height:100%;padding:28px;text-align:center">
      <div>
        <div style="font-size:52px">😄</div>
        <h2 style="font-size:30px;margin:14px 0 8px">${escapeHtml(item[0])}</h2>
        <p style="color:#aab2c0;font-size:20px;margin:0">${escapeHtml(item[1])}</p>
      </div>
    </div>
  `;
}

function isSafeMeme(meme) {
  if (!meme || !meme.url || meme.nsfw || meme.spoiler) return false;
  if (meme.url === state.lastMemeUrl) return false;

  const imageUrl = String(meme.url).toLowerCase();
  const allowedImage = ['.jpg', '.jpeg', '.png', '.webp'].some((extension) => imageUrl.includes(extension));
  if (!allowedImage) return false;

  const blockedKeywords = state.config.meme.blockedKeywords || [];
  const searchableText = `${meme.title || ''} ${meme.postLink || ''} ${meme.subreddit || ''}`.toLowerCase();
  return !blockedKeywords.some((keyword) => searchableText.includes(String(keyword).toLowerCase()));
}

async function fetchSafeMeme() {
  const sources = state.config.meme.sources?.length
    ? state.config.meme.sources
    : ['memes', 'wholesomememes', 'AdviceAnimals', 'sysadminhumor'];
  const maxAttempts = Math.max(1, Number(state.config.meme.maxAttempts || 6));

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const source = sources[Math.floor(Math.random() * sources.length)];
    const response = await fetch(`https://meme-api.com/gimme/${encodeURIComponent(source)}`, { cache: 'no-store' });
    if (!response.ok) continue;

    const meme = await response.json();
    if (isSafeMeme(meme)) return meme;
  }

  throw new Error('Kein firmentaugliches Meme gefunden');
}

async function loadMeme() {
  if (!state.config.meme.enabled) {
    elements.memeContent.innerHTML = '<div class="loading-card" style="height:100%">Meme-Anzeige deaktiviert</div>';
    return;
  }

  elements.memeContent.className = 'meme-content loading-card';
  elements.memeContent.textContent = 'Firmentaugliches Meme wird gesucht …';

  try {
    const meme = await fetchSafeMeme();
    state.lastMemeUrl = meme.url;
    const title = escapeHtml(meme.title || 'Meme');
    const source = escapeHtml(meme.subreddit ? `r/${meme.subreddit}` : 'Meme');

    elements.memeContent.className = 'meme-content';
    elements.memeContent.innerHTML = `
      <img src="${escapeHtml(meme.url)}" alt="${title}" referrerpolicy="no-referrer">
      <div class="meme-caption">${title} · ${source}</div>
    `;
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
  setupBrowser();
  loadWeather();
  loadMeme();

  setInterval(() => {
    updateClock();
    evaluateSchedule();
  }, 1000);

  setInterval(loadWeather, 10 * 60 * 1000);
  const refreshMinutes = Math.max(10, Number(state.config.meme.refreshMinutes || 30));
  state.memeTimer = setInterval(loadMeme, refreshMinutes * 60 * 1000);

  document.getElementById('meme-refresh').addEventListener('click', loadMeme);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'F5') elements.browser.reload();
    if (event.key === 'F11' || event.key === 'Escape') event.preventDefault();
  });
}

init().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<div class="error-card">Dashboard konnte nicht gestartet werden: ${escapeHtml(error.message)}</div>`;
});