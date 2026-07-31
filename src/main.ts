import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
} from 'electron';
import path from 'node:path';

import {
  ApplicationController,
  type IpcHandlerRegistry,
} from './infrastructure/main/application-controller';
import { toIpcResult } from './shared/ipc-result';
import { ERROR_CODES, FinanceHubError } from './shared/errors';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

let mainWindow: BrowserWindow | null = null;
let controller: ApplicationController | null = null;
let shutdownStarted = false;

const ipcRegistry: IpcHandlerRegistry = {
  handle: (channel, operation) => {
    ipcMain.handle(channel, (_event, ...args: unknown[]) =>
      toIpcResult(() => operation(...args)),
    );
  },
  removeHandler: (channel) => ipcMain.removeHandler(channel),
};

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
  const databasePath = path.join(
    app.getPath('userData'),
    'financehub.db',
  );
  controller = new ApplicationController(
    databasePath,
    ipcRegistry,
    undefined,
    undefined,
    app.getVersion(),
    async (directory) => {
      const message = await shell.openPath(directory);
      if (message) {
        throw new FinanceHubError(
          ERROR_CODES.backupIoFailure,
          '無法開啟備份資料夾。',
        );
      }
    },
    async () => {
      const selection = await dialog.showOpenDialog({
        title: '選擇匯出備份的位置',
        buttonLabel: '匯出到這裡',
        properties: ['openDirectory', 'createDirectory'],
      });
      return selection.canceled ? undefined : selection.filePaths[0];
    },
  );
  controller.registerLockedHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', (event) => {
  if (shutdownStarted || !controller) return;
  event.preventDefault();
  shutdownStarted = true;
  const closingController = controller;
  controller = null;
  void closingController.close().finally(() => app.quit());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
