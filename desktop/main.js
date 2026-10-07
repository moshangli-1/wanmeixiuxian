// ============================================================
// 《完美修仙》桌面端入口（Electron）
// 使用：npm run desktop:install && npm run desktop
// 逻辑：自动拉起游戏服务器 → 等待就绪 → 打开游戏窗口
// ============================================================
'use strict';
const { app, BrowserWindow, Menu } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const PORT = process.env.PORT || 3000;
const URL = `http://localhost:${PORT}`;
let win = null;
let serverProc = null;

function waitForServer(url, tries = 40) {
  return new Promise((resolve, reject) => {
    const ping = (n) => {
      const req = http.get(url, () => resolve());
      req.on('error', () => {
        if (n <= 0) return reject(new Error('server not reachable'));
        setTimeout(() => ping(n - 1), 250);
      });
    };
    ping(tries);
  });
}

async function bootstrap() {
  // 开发模式下由 Electron 主动拉起 Node 服务器
  if (process.env.NO_SPAWN !== '1') {
    serverProc = spawn(process.platform === 'win32' ? 'node' : 'node',
      [path.join(__dirname, '..', 'server', 'server.js')],
      { env: { ...process.env, PORT: String(PORT) }, stdio: 'inherit' });
    serverProc.on('error', (e) => console.error('[server spawn]', e.message));
  }
  try { await waitForServer(URL); } catch { /* 服务器可能已在外部运行 */ }

  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 380, minHeight: 600,
    backgroundColor: '#0b0e1a',
    title: '完美修仙',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  Menu.setApplicationMenu(null);
  await win.loadURL(URL);
  win.on('closed', () => { win = null; });
}

app.whenReady().then(bootstrap);
app.on('window-all-closed', () => {
  if (serverProc) serverProc.kill();
  app.quit();
});
