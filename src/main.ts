import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';

import { openBootstrapDatabase } from './infrastructure/database/bootstrap-database';
import {
  BootstrapStatus,
  IPC_CHANNELS,
} from './shared/bootstrap';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

let mainWindow: BrowserWindow | null = null;
let closeDatabase: (() => void) | null = null;

function registerApplicationHandlers(databaseReady: boolean): void {
  ipcMain.handle(
    IPC_CHANNELS.getBootstrapStatus,
    (): BootstrapStatus => ({
      appName: 'FinanceHub',
      databaseReady,
      storagePolicy: 'sample-data-only',
    }),
  );
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    show: false,
    backgroundColor: '#f5f7f4',
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.removeMenu();
  void mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

void app.whenReady().then(() => {
  const databasePath = path.join(app.getPath('userData'), 'financehub.dev.db');
  const bootstrapDatabase = openBootstrapDatabase(databasePath);
  closeDatabase = bootstrapDatabase.close;

  registerApplicationHandlers(true);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  closeDatabase?.();
  closeDatabase = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
