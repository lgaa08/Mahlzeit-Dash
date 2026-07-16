const { app, BrowserWindow, ipcMain, session, shell, net, nativeImage } = require('electron');
const crypto = require('node:crypto');
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
    sources: ['deutschememes'],
    blockedKeywords: [],
    maxAttempts: 25,
    perceptualHashDistance: 5
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
    const request = https.get(url, { headers: { 'User-Agent': 'Mahlzeit-Dash/1.0', 'Cache-Control': 'no-cache' } }, (response) => {
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

function createDHash(image) {
  const resized = image.resize({ width: 9, height: 8, quality: 'good' });
  const bitmap = resized.toBitmap();
  let bits = '';
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = (y * 9 + x) * 4;
      const right = (y * 9 + x + 1) * 4;
      const leftGray = bitmap[left + 2] * 0.299 + bitmap[left + 1] * 0.587 + bitmap[left] * 0.114;
      const rightGray = bitmap[right + 2] * 0.299 + bitmap[right + 1] * 0.587 + bitmap[right] * 0.114;
      bits += leftGray > rightGray ? '1' : '0';
    }
  }
  return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
}

async function fingerprintImage(_event, url) {
  if (!/^https:\/\//i.test(String(url))) throw new Error('Nur HTTPS-Bilder erlaubt');
  const response = await net.fetch(url, {
    cache: 'no-store',
    headers: { 'User-Agent': 'Mahlzeit-Dash/1.0' }
  });
  if (!response.ok) throw new Error(`Bilddownload fehlgeschlagen: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > 20 * 1024 * 1024) throw new Error('Ungültige Bildgröße');
  const image = nativeImage.createFromBuffer(buffer);
  if (image.isEmpty()) throw new Error('Bild konnte nicht gelesen werden');
  return {
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    dHash: createDHash(image),
    size: buffer.length
  };
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
  ipcMain.handle('dashboard:fingerprint-image', fingerprintImage);
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