const { app, BrowserWindow, ipcMain, session, shell, net, powerSaveBlocker } = require('electron');
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const DEFAULT_CONFIG = {
  monitoringUrl: 'https://example.org',
  weather: {
    locationName: 'Kempten (Allgäu)',
    latitude: 47.7267,
    longitude: 10.3139,
    timezone: 'Europe/Berlin',
    refreshMinutes: 10
  },
  time: { timezone: 'Europe/Berlin', resyncMinutes: 15 },
  meme: {
    enabled: true,
    refreshSeconds: 300,
    sources: ['deutschememes', 'ich_iel'],
    batchSize: 120,
    poolRefreshMinutes: 20,
    blockedKeywords: []
  },
  schedule: {
    timezone: 'Europe/Berlin', wakeTime: '07:30', morningStart: '08:00', morningDurationMinutes: 5,
    almostLunch: '11:50', lunchStart: '11:55', lunchEndDisplayUntil: '12:50',
    breakFinished: '13:00', breakFinishedDurationSeconds: 60,
    almostHomeStart: '16:00', almostHomeDurationMinutes: 5, goodbyeStart: '16:50', sleepStart: '17:00'
  },
  kiosk: true,
  allowDevTools: false
};

let mainWindow;
let config;
let keepAwakeBlockerId = null;
let memePoolCache = { loadedAt: 0, memes: [] };

function readConfig() {
  const configPath = path.join(__dirname, 'config.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      weather: { ...DEFAULT_CONFIG.weather, ...(parsed.weather || {}) },
      time: { ...DEFAULT_CONFIG.time, ...(parsed.time || {}) },
      meme: { ...DEFAULT_CONFIG.meme, ...(parsed.meme || {}) },
      schedule: { ...DEFAULT_CONFIG.schedule, ...(parsed.schedule || {}) }
    };
  } catch (error) {
    console.warn(`config.json konnte nicht gelesen werden: ${error.message}`);
    return DEFAULT_CONFIG;
  }
}

function startKeepAwake() {
  if (keepAwakeBlockerId !== null && powerSaveBlocker.isStarted(keepAwakeBlockerId)) return;
  keepAwakeBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  console.log(`Display-Standby blockiert: ${powerSaveBlocker.isStarted(keepAwakeBlockerId)}`);
}

function stopKeepAwake() {
  if (keepAwakeBlockerId !== null && powerSaveBlocker.isStarted(keepAwakeBlockerId)) {
    powerSaveBlocker.stop(keepAwakeBlockerId);
  }
  keepAwakeBlockerId = null;
}

function readHttpsDate(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'Mahlzeit-Dash/1.4', 'Cache-Control': 'no-cache' } }, (response) => {
      const dateHeader = response.headers.date;
      response.resume();
      if (!dateHeader) return reject(new Error('Kein Date-Header'));
      const timestamp = Date.parse(dateHeader);
      if (!Number.isFinite(timestamp)) return reject(new Error('Ungültiger Date-Header'));
      resolve({ timestamp, source: new URL(url).hostname });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('Zeitüberschreitung')));
    request.on('error', reject);
  });
}

async function getNetworkTime() {
  const sources = [
    'https://www.cloudflare.com/cdn-cgi/trace',
    'https://www.google.com/generate_204',
    'https://api.github.com'
  ];
  const results = await Promise.allSettled(sources.map((url) => readHttpsDate(url)));
  const valid = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  if (!valid.length) return { ok: false, timestamp: Date.now(), source: 'system' };
  valid.sort((a, b) => a.timestamp - b.timestamp);
  const median = valid[Math.floor(valid.length / 2)];
  return { ok: true, timestamp: median.timestamp, source: median.source, samples: valid.length };
}

async function fetchJson(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await net.fetch(url, {
      ...options,
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        ...(options.headers || {})
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('json')) throw new Error(`Unerwarteter Inhalt: ${contentType || 'unbekannt'}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeRedditPost(post) {
  const data = post?.data || {};
  const rawUrl = data.url_overridden_by_dest || data.url || '';
  const previewUrl = data.preview?.images?.[0]?.source?.url?.replaceAll('&amp;', '&') || '';
  const url = rawUrl || previewUrl;
  return {
    postId: data.id || '',
    postLink: data.permalink ? `https://www.reddit.com${data.permalink}` : '',
    subreddit: data.subreddit || '',
    title: data.title || 'Deutsches Meme',
    url,
    nsfw: Boolean(data.over_18),
    spoiler: Boolean(data.spoiler),
    createdUtc: Number(data.created_utc || 0)
  };
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

async function fetchRedditPool(source, limit) {
  const cacheBuster = Date.now();
  const sorts = [
    `new.json?raw_json=1&limit=100&_=${cacheBuster}`,
    `hot.json?raw_json=1&limit=100&_=${cacheBuster + 1}`,
    `top.json?t=week&raw_json=1&limit=100&_=${cacheBuster + 2}`,
    `top.json?t=month&raw_json=1&limit=100&_=${cacheBuster + 3}`
  ];
  const requests = sorts.map(async (suffix) => {
    const payload = await fetchJson(
      `https://www.reddit.com/r/${encodeURIComponent(source)}/${suffix}`,
      { headers: { 'User-Agent': 'Mahlzeit-Dash/1.4 (Electron dashboard)' } },
      10000
    );
    return (payload?.data?.children || []).map(normalizeRedditPost);
  });

  const results = await Promise.allSettled(requests);
  const merged = results.filter((result) => result.status === 'fulfilled').flatMap((result) => result.value);
  const unique = [];
  const seen = new Set();
  for (const meme of merged) {
    const key = meme.postId || meme.url;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(meme);
  }
  return shuffle(unique).slice(0, limit);
}

async function fetchMemeApiPool(source, limit) {
  const count = Math.min(50, Math.max(15, limit));
  const requests = Array.from({ length: count }, (_, index) =>
    fetchJson(
      `https://meme-api.com/gimme/${encodeURIComponent(source)}?t=${Date.now()}-${index}`,
      { headers: { 'User-Agent': 'Mahlzeit-Dash/1.4' } },
      9000
    )
  );
  const results = await Promise.allSettled(requests);
  return results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
}

async function getMemePool(_event, forceRefresh = false) {
  const batchSize = Math.min(250, Math.max(30, Number(config.meme.batchSize || 120)));
  const maxAge = Math.max(5, Number(config.meme.poolRefreshMinutes || 20)) * 60 * 1000;
  if (!forceRefresh && memePoolCache.memes.length && Date.now() - memePoolCache.loadedAt < maxAge) {
    return { ok: true, cached: true, source: 'memory', memes: shuffle(memePoolCache.memes) };
  }

  const sources = Array.isArray(config.meme.sources) && config.meme.sources.length
    ? config.meme.sources
    : [config.meme.source || 'deutschememes', 'ich_iel'];

  const collected = [];
  const errors = [];
  const jobs = [];

  for (const source of sources) {
    jobs.push(
      fetchRedditPool(source, batchSize)
        .then((memes) => collected.push(...memes))
        .catch((error) => errors.push(`Reddit ${source}: ${error.message}`))
    );
    jobs.push(
      fetchMemeApiPool(source, Math.min(batchSize, 50))
        .then((memes) => collected.push(...memes))
        .catch((error) => errors.push(`Meme-API ${source}: ${error.message}`))
    );
  }

  await Promise.allSettled(jobs);

  const unique = [];
  const seen = new Set();
  for (const meme of shuffle(collected)) {
    const key = meme.postId || meme.postLink || meme.url;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(meme);
  }

  if (!unique.length) {
    throw new Error(`Keine Meme-Quelle erreichbar: ${errors.join(' | ') || 'keine Daten'}`);
  }

  memePoolCache = { loadedAt: Date.now(), memes: unique };
  return { ok: true, cached: false, source: 'combined', memes: shuffle(unique) };
}

function createWindow() {
  config = readConfig();
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1100,
    minHeight: 650,
    fullscreen: Boolean(config.kiosk),
    kiosk: Boolean(config.kiosk),
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });
  if (process.argv.includes('--dev') && config.allowDevTools) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(() => {
  startKeepAwake();
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  ipcMain.handle('dashboard:get-config', () => config);
  ipcMain.handle('dashboard:get-network-time', getNetworkTime);
  ipcMain.handle('dashboard:get-meme-pool', getMemePool);
  ipcMain.handle('dashboard:exit-kiosk', () => {
    if (mainWindow && config.allowDevTools) mainWindow.setKiosk(false);
  });
  createWindow();
  app.on('activate', () => {
    startKeepAwake();
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', stopKeepAwake);
app.on('window-all-closed', () => {
  stopKeepAwake();
  if (process.platform !== 'darwin') app.quit();
});
