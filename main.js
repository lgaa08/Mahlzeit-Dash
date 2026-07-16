const { app, BrowserWindow, ipcMain, session, shell, net } = require('electron');
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');

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
    refreshMinutes: 30,
    source: 'deutschememes',
    batchSize: 50,
    poolRefreshMinutes: 60,
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

function readHttpsDate(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'Mahlzeit-Dash/1.1', 'Cache-Control': 'no-cache' } }, (response) => {
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

async function getMemePool(_event, forceRefresh = false) {
  const batchSize = Math.min(50, Math.max(10, Number(config.meme.batchSize || 50)));
  const maxAge = Math.max(5, Number(config.meme.poolRefreshMinutes || 60)) * 60 * 1000;
  if (!forceRefresh && memePoolCache.memes.length && Date.now() - memePoolCache.loadedAt < maxAge) {
    return { ok: true, cached: true, memes: memePoolCache.memes };
  }

  const source = encodeURIComponent(config.meme.source || 'deutschememes');
  const response = await net.fetch(`https://meme-api.com/gimme/${source}/${batchSize}`, {
    cache: 'no-store',
    headers: { 'User-Agent': 'Mahlzeit-Dash/1.1' }
  });
  if (!response.ok) throw new Error(`Meme-API HTTP ${response.status}`);
  const payload = await response.json();
  const memes = Array.isArray(payload.memes) ? payload.memes : (payload.url ? [payload] : []);
  memePoolCache = { loadedAt: Date.now(), memes };
  return { ok: true, cached: false, memes };
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
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  ipcMain.handle('dashboard:get-config', () => config);
  ipcMain.handle('dashboard:get-network-time', getNetworkTime);
  ipcMain.handle('dashboard:get-meme-pool', getMemePool);
  ipcMain.handle('dashboard:exit-kiosk', () => {
    if (mainWindow && config.allowDevTools) mainWindow.setKiosk(false);
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});