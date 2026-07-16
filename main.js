const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CONFIG = {
  appTitle: 'Office Info Dashboard',
  monitoringUrl: 'https://example.org',
  weather: {
    locationName: 'Kempten (Allgäu)',
    latitude: 47.7267,
    longitude: 10.3139,
    timezone: 'Europe/Berlin'
  },
  meme: {
    enabled: true,
    refreshMinutes: 360
  },
  schedule: {
    timezone: 'Europe/Berlin',
    almostLunch: '11:50',
    lunchStart: '11:55',
    lunchEndDisplayUntil: '12:50',
    breakFinished: '13:00',
    breakFinishedDurationSeconds: 60
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
      meme: { ...DEFAULT_CONFIG.meme, ...(parsed.meme || {}) },
      schedule: { ...DEFAULT_CONFIG.schedule, ...(parsed.schedule || {}) }
    };
  } catch (error) {
    console.warn(`config.json konnte nicht gelesen werden: ${error.message}`);
    return DEFAULT_CONFIG;
  }
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
    backgroundColor: '#070a0f',
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

  if (process.argv.includes('--dev') && config.allowDevTools) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

  ipcMain.handle('dashboard:get-config', () => config);
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
