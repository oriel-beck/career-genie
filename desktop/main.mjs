import { app, BrowserWindow, dialog, shell } from 'electron';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 3847;
const HOST = '127.0.0.1';
const APP_URL = `http://${HOST}:${PORT}`;

const rootDir = path.dirname(fileURLToPath(import.meta.url));
let serverProcess = null;
let mainWindow = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function standaloneRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app');
  }
  return path.join(rootDir, '..', 'dist', 'career-genie', 'app');
}

function waitForPort(port, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = createConnection({ host: HOST, port });
      socket.once('connect', () => {
        socket.end();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for ${APP_URL}`));
          return;
        }
        setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

function startServer() {
  const appRoot = standaloneRoot();
  const serverJs = path.join(appRoot, 'server.js');
  serverProcess = spawn(process.execPath, [serverJs], {
    cwd: appRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(PORT),
      HOSTNAME: HOST,
    },
    stdio: 'inherit',
  });

  serverProcess.on('exit', (code) => {
    if (code !== 0 && code !== null && mainWindow && !mainWindow.isDestroyed()) {
      void dialog.showErrorBox(
        'Career Genie stopped',
        `The local server exited unexpectedly (code ${code}).`,
      );
      app.quit();
    }
  });
}

function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
  serverProcess = null;
}

function isAppUrl(url) {
  return url === APP_URL || url.startsWith(`${APP_URL}/`);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 360,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    title: 'Career Genie',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) return { action: 'allow' };
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });

  void mainWindow.loadURL(APP_URL);
}

async function boot() {
  try {
    startServer();
    await waitForPort(PORT, 30_000);
    createWindow();
  } catch (error) {
    stopServer();
    const message = error instanceof Error ? error.message : String(error);
    await dialog.showErrorBox('Career Genie failed to start', message);
    app.quit();
  }
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(() => {
  void boot();
});

app.on('before-quit', stopServer);

app.on('window-all-closed', () => {
  app.quit();
});
