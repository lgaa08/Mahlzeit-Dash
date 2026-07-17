const state = {
  config: null,
  activeAnnouncement: null,
  previewActive: false,
  dismissedAnnouncement: null,
  networkTimeBase: null,
  networkTimeFetchedAt: null,
  memeHistory: { urls: [], postIds: [] },
  memePool: [],
  memePoolDate: null,
  memeLoading: false,
  hasVisibleMeme: false,
  browserReady: false,
  pendingBrowserMute: false,
  sleepMode: null
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
  announcementClose: document.getElementById('announcement-close'),
  sleepScreen: document.getElementById('sleep-screen')
};

const WEATHER_CODES = {
  0: ['☀️', 'Klar'], 1: ['🌤️', 'Überwiegend klar'], 2: ['⛅', 'Teilweise bewölkt'], 3: ['☁️', 'Bewölkt'],
  45: ['🌫️', 'Nebel'], 48: ['🌫️', 'Reifnebel'], 51: ['🌦️', 'Leichter Nieselregen'], 53: ['🌦️', 'Nieselregen'],
  55: ['🌧️', 'Starker Nieselregen'], 61: ['🌦️', 'Leichter Regen'], 63: ['🌧️', 'Regen'], 65: ['🌧️', 'Starker Regen'],
  71: ['🌨️', 'Leichter Schneefall'], 73: ['🌨️', 'Schneefall'], 75: ['❄️', 'Starker Schneefall'],
  80: ['🌦️', 'Regenschauer'], 81: ['🌧️', 'Kräftige Schauer'], 82: ['⛈️', 'Starke Schauer'],
  95: ['⛈️', 'Gewitter'], 96: ['⛈️', 'Gewitter mit Hagel'], 99: ['⛈️', 'Starkes Gewitter']
};

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function currentDate() {
  if (!state.networkTimeBase || !state.networkTimeFetchedAt) return new Date();
  return new Date(state.networkTimeBase + (Date.now() - state.networkTimeFetchedAt));
}

function getBerlinDateParts(date = currentDate()) {
  const timezone = state.config?.time?.timezone || 'Europe/Berlin';
  return Object.fromEntries(new Intl.DateTimeFormat('de-DE', {
    timeZone: timezone,
    weekday: 'long', year: 'numeric', month: 'long', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

function getPoolDateKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: state.config?.time?.timezone || 'Europe/Berlin',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(currentDate());
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function syncNetworkTime() {
  const result = await window.dashboardAPI.getNetworkTime();
  state.networkTimeBase = Number(result.timestamp);
  state.networkTimeFetchedAt = Date.now();
  elements.clockSync.textContent = result.ok
    ? `NETZZEIT · ${String(result.source).toUpperCase()}`
    : 'SYSTEMZEIT · NTP DES CLIENTS';
  elements.clockSync.classList.toggle('synced', Boolean(result.ok));
}

function updateClock() {
  const parts = getBerlinDateParts();
  elements.clock.textContent = `${parts.hour}:${parts.minute}:${parts.second}`;
  elements.date.textContent = `${parts.weekday}, ${parts.day}. ${parts.month} ${parts.year}`;
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value).split(':').map(Number);
  return hours * 60 + minutes;
}

function showAnnouncement(type, text, subtext, icon, blinking = false, preview = false) {
  if (state.dismissedAnnouncement === type && !preview) return;
  if (state.activeAnnouncement === type && !preview) return;
  state.activeAnnouncement = type;
  state.previewActive = preview;
  elements.announcementText.textContent = text;
  elements.announcementSubtext.textContent = subtext || '';
  elements.announcementIcon.textContent = icon || '📢';
  elements.announcement.classList.toggle('blinking', blinking);
  elements.announcement.classList.add('visible');
  elements.announcement.setAttribute('aria-hidden', 'false');
  elements.announcementClose.style.display = 'block';
}

function hideAnnouncement(force = false) {
  if (state.previewActive && !force) return;
  state.activeAnnouncement = null;
  state.previewActive = false;
  elements.announcement.classList.remove('visible', 'blinking');
  elements.announcement.setAttribute('aria-hidden', 'true');
  elements.announcementClose.style.display = 'none';
}

function dismissAnnouncement() {
  if (state.previewActive) {
    hideAnnouncement(true);
    evaluateSchedule();
    return;
  }
  if (state.activeAnnouncement) state.dismissedAnnouncement = state.activeAnnouncement;
  hideAnnouncement(true);
}

function runBrowserAction(action) {
  if (!state.browserReady || !elements.browser?.isConnected) return false;
  try {
    action(elements.browser);
    return true;
  } catch (error) {
    console.warn(`WebView-Aktion übersprungen: ${error.message}`);
    return false;
  }
}

function setSleepMode(enabled) {
  if (state.sleepMode === enabled) return;
  state.sleepMode = enabled;
  elements.sleepScreen.classList.toggle('visible', enabled);
  elements.sleepScreen.setAttribute('aria-hidden', enabled ? 'false' : 'true');
  document.body.classList.toggle('sleeping', enabled);
  state.pendingBrowserMute = enabled;
  runBrowserAction((browser) => browser.setAudioMuted(enabled));
}

function evaluateSchedule() {
  if (state.previewActive) return;
  const schedule = state.config.schedule;
  const now = getBerlinDateParts();
  const minutes = Number(now.hour) * 60 + Number(now.minute);
  const seconds = Number(now.second);
  const wake = timeToMinutes(schedule.wakeTime);
  const sleep = timeToMinutes(schedule.sleepStart);
  const sleeping = minutes >= sleep || minutes < wake;
  setSleepMode(sleeping);

  if (sleeping) {
    state.dismissedAnnouncement = null;
    hideAnnouncement();
    return;
  }

  let currentType = null;
  const morningStart = timeToMinutes(schedule.morningStart);
  if (minutes >= morningStart && minutes < morningStart + Number(schedule.morningDurationMinutes || 5)) {
    currentType = 'morning';
    showAnnouncement(currentType, 'Guten Morgen!', 'Auf zum Kaffee holen ☕', '☀️');
  } else if (minutes >= timeToMinutes(schedule.almostLunch) && minutes < timeToMinutes(schedule.lunchStart)) {
    currentType = 'almost-lunch';
    showAnnouncement(currentType, 'Gleich ist Mittag!', 'Noch wenige Minuten durchhalten', '⏰', true);
  } else if (minutes >= timeToMinutes(schedule.lunchStart) && minutes <= timeToMinutes(schedule.lunchEndDisplayUntil)) {
    currentType = 'lunch';
    showAnnouncement(currentType, 'Mahlzeit!', 'Lasst es euch schmecken', '🍽️');
  } else if (minutes === timeToMinutes(schedule.breakFinished) && seconds < Number(schedule.breakFinishedDurationSeconds || 60)) {
    currentType = 'finished';
    showAnnouncement(currentType, 'Mittagspause zu Ende', 'Weiter geht’s!', '💼', true);
  } else {
    const almostHome = timeToMinutes(schedule.almostHomeStart);
    if (minutes >= almostHome && minutes < almostHome + Number(schedule.almostHomeDurationMinutes || 5)) {
      currentType = 'almost-home';
      showAnnouncement(currentType, 'Jetzt geht’s bald heim!', 'Endspurt – ihr habt es fast geschafft', '🏁');
    } else if (minutes >= timeToMinutes(schedule.goodbyeStart) && minutes < sleep) {
      currentType = 'goodbye';
      showAnnouncement(currentType, 'Schönen Feierabend!', 'Bis morgen 👋', '🌙');
    }
  }

  if (!currentType) {
    state.dismissedAnnouncement = null;
    hideAnnouncement();
  } else if (state.dismissedAnnouncement && state.dismissedAnnouncement !== currentType) {
    state.dismissedAnnouncement = null;
  }
}

function setupAnnouncementControls() {
  document.getElementById('lunch-preview').addEventListener('click', () => {
    showAnnouncement('preview', 'Mahlzeit!', 'Testansicht · Lasst es euch schmecken', '🍽️', false, true);
  });
  elements.announcementClose.addEventListener('click', (event) => {
    event.stopPropagation();
    dismissAnnouncement();
  });
  elements.announcement.addEventListener('click', dismissAnnouncement);
}

function setupBrowser() {
  const browser = elements.browser;
  const homeUrl = state.config.monitoringUrl;
  browser.addEventListener('dom-ready', () => {
    state.browserReady = true;
    runBrowserAction((readyBrowser) => readyBrowser.setAudioMuted(state.pendingBrowserMute));
  });
  browser.addEventListener('destroyed', () => { state.browserReady = false; });
  browser.addEventListener('did-start-loading', () => elements.browserLoading.classList.remove('hidden'));
  browser.addEventListener('did-stop-loading', () => elements.browserLoading.classList.add('hidden'));
  browser.addEventListener('did-fail-load', (event) => {
    if (event.errorCode === -3) return;
    elements.browserLoading.innerHTML = `<p>Monitoring konnte nicht geladen werden<br>${escapeHtml(event.errorDescription)}</p>`;
    elements.browserLoading.classList.remove('hidden');
  });
  browser.addEventListener('new-window', (event) => {
    event.preventDefault();
    runBrowserAction((readyBrowser) => readyBrowser.loadURL(event.url));
  });
  document.getElementById('browser-back').addEventListener('click', () => runBrowserAction((readyBrowser) => { if (readyBrowser.canGoBack()) readyBrowser.goBack(); }));
  document.getElementById('browser-forward').addEventListener('click', () => runBrowserAction((readyBrowser) => { if (readyBrowser.canGoForward()) readyBrowser.goForward(); }));
  document.getElementById('browser-home').addEventListener('click', () => runBrowserAction((readyBrowser) => readyBrowser.loadURL(homeUrl)));
  document.getElementById('browser-reload').addEventListener('click', () => runBrowserAction((readyBrowser) => readyBrowser.reload()));
  browser.src = homeUrl;
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

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === 'string' && value))];
}

function loadMemeHistory() {
  try {
    const current = JSON.parse(localStorage.getItem('mahlzeitDashMemeHistoryV3') || '{}');
    const previous = JSON.parse(localStorage.getItem('mahlzeitDashMemeHistoryV2') || '{}');
    state.memeHistory = {
      urls: uniqueStrings([...(current.urls || []), ...(previous.urls || [])]),
      postIds: uniqueStrings([...(current.postIds || []), ...(previous.postIds || [])])
    };
    saveMemeHistory();
  } catch (_error) {
    state.memeHistory = { urls: [], postIds: [] };
  }
}

function saveMemeHistory() {
  localStorage.setItem('mahlzeitDashMemeHistoryV3', JSON.stringify(state.memeHistory));
}

function extractPostId(meme) {
  const explicit = String(meme?.postId || meme?.postLink || '');
  const match = explicit.match(/comments\/([a-z0-9]+)/i);
  return match?.[1] || explicit || '';
}

function isSafeNewMeme(meme) {
  if (!meme?.url || meme.nsfw || meme.spoiler) return false;
  const allowedSources = (state.config.meme.sources || ['deutschememes']).map((source) => String(source).toLowerCase());
  if (!allowedSources.includes(String(meme.subreddit || '').toLowerCase())) return false;
  if (state.memeHistory.urls.includes(meme.url)) return false;
  const postId = extractPostId(meme);
  if (postId && state.memeHistory.postIds.includes(postId)) return false;
  const url = String(meme.url).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].some((extension) => url.includes(extension))) return false;
  const searchable = `${meme.title || ''} ${meme.postLink || ''}`.toLowerCase();
  return !(state.config.meme.blockedKeywords || []).some((word) => searchable.includes(String(word).toLowerCase()));
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

async function refillMemePool(forceRefresh = false) {
  const result = await window.dashboardAPI.getMemePool(forceRefresh);
  const candidates = Array.isArray(result?.memes) ? result.memes.filter(isSafeNewMeme) : [];
  state.memePool = shuffle(candidates);
  state.memePoolDate = getPoolDateKey();
  return state.memePool.length;
}

function displayMeme(meme) {
  const postId = extractPostId(meme);
  state.memeHistory.urls = uniqueStrings([...state.memeHistory.urls, meme.url]);
  state.memeHistory.postIds = uniqueStrings([...state.memeHistory.postIds, postId]);
  saveMemeHistory();
  const title = escapeHtml(meme.title || 'Deutsches Meme');
  elements.memeContent.className = 'meme-content meme-switching';
  elements.memeContent.innerHTML = `<img class="meme-image-enter" src="${escapeHtml(meme.url)}" alt="${title}" referrerpolicy="no-referrer"><div class="meme-caption meme-caption-enter">${title}</div>`;
  state.hasVisibleMeme = true;
}

async function loadMeme(forceRefresh = false) {
  if (state.memeLoading || state.sleepMode) return;
  state.memeLoading = true;
  const previousHtml = elements.memeContent.innerHTML;
  try {
    if (!state.hasVisibleMeme) {
      elements.memeContent.className = 'meme-content loading-card';
      elements.memeContent.textContent = 'Deutsche Memes werden geladen …';
    }

    const today = getPoolDateKey();
    if (state.memePoolDate && state.memePoolDate !== today) {
      state.memePool = [];
      forceRefresh = true;
    }

    state.memePool = state.memePool.filter(isSafeNewMeme);
    if (!state.memePool.length) await refillMemePool(forceRefresh);
    if (!state.memePool.length && !forceRefresh) await refillMemePool(true);
    const meme = state.memePool.shift();
    if (!meme) throw new Error('Kein unbekanntes Meme im aktuellen Pool');
    displayMeme(meme);
  } catch (error) {
    console.warn(`Meme konnte nicht geladen werden: ${error.message}`);
    if (state.hasVisibleMeme) {
      elements.memeContent.className = 'meme-content';
      elements.memeContent.innerHTML = previousHtml;
    } else {
      elements.memeContent.className = 'meme-content fallback-meme';
      elements.memeContent.innerHTML = '<div><div class="fallback-emoji">🔄</div><h2>Meme-Pool wird neu aufgebaut</h2><p>Reddit oder die Fallback-API ist gerade nicht erreichbar. Neuer Versuch folgt automatisch.</p></div>';
    }
  } finally {
    state.memeLoading = false;
  }
}

async function checkDailyMemePool() {
  const today = getPoolDateKey();
  if (state.memePoolDate && state.memePoolDate !== today) {
    state.memePool = [];
    await loadMeme(true);
  }
}

async function init() {
  state.config = await window.dashboardAPI.getConfig();
  loadMemeHistory();
  setupBrowser();
  await syncNetworkTime();
  updateClock();
  evaluateSchedule();
  setupAnnouncementControls();
  loadWeather();
  loadMeme(true);

  setInterval(() => { updateClock(); evaluateSchedule(); }, 1000);
  setInterval(syncNetworkTime, Math.max(5, Number(state.config.time.resyncMinutes || 15)) * 60000);
  setInterval(loadWeather, Math.max(5, Number(state.config.weather.refreshMinutes || 10)) * 60000);
  setInterval(() => loadMeme(false), Math.max(5, Number(state.config.meme.refreshSeconds || 10)) * 1000);
  setInterval(checkDailyMemePool, 60000);
  document.getElementById('meme-refresh').addEventListener('click', () => loadMeme(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'F5') { event.preventDefault(); runBrowserAction((browser) => browser.reload()); }
    if (event.key === 'Escape' && elements.announcement.classList.contains('visible')) dismissAnnouncement();
    if (event.key === 'F11') event.preventDefault();
  });
}

init().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<div class="fatal-error">Dashboard konnte nicht gestartet werden: ${escapeHtml(error.message)}</div>`;
});