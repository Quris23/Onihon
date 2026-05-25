const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

const PORT = 8000;
let mainWindow = null;
let serverProcess = null;

// ── Пути ─────────────────────────────────────────────────────────────────────
const IS_PACKAGED = app.isPackaged;
const APP_ROOT    = IS_PACKAGED
  ? path.join(process.resourcesPath, "app")
  : path.join(__dirname, "..");

const PYTHON = IS_PACKAGED
  ? path.join(APP_ROOT, ".venv", "Scripts", "python.exe")
  : path.join(APP_ROOT, ".venv", "Scripts", "python.exe");

// ── Запуск FastAPI ────────────────────────────────────────────────────────────
function startServer() {
  return new Promise((resolve, reject) => {
    serverProcess = spawn(PYTHON, ["-m", "uvicorn", "main:app",
      "--host", "127.0.0.1", "--port", String(PORT)], {
      cwd: APP_ROOT,
      windowsHide: true,
    });

    serverProcess.stderr.on("data", (data) => {
      const line = data.toString();
      if (line.includes("Application startup complete")) resolve();
    });

    serverProcess.on("error", reject);

    // Таймаут 15 секунд
    setTimeout(resolve, 15000);
  });
}

// ── Ждём пока сервер отвечает ─────────────────────────────────────────────────
function waitForServer(retries = 30) {
  return new Promise((resolve, reject) => {
    const check = (n) => {
      http.get(`http://127.0.0.1:${PORT}/api/kanji/stats`, (res) => {
        resolve();
      }).on("error", () => {
        if (n <= 0) return reject(new Error("Server did not start"));
        setTimeout(() => check(n - 1), 500);
      });
    };
    check(retries);
  });
}

// ── Окно ─────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "日本語 の Web",
    backgroundColor: "#0f0f13",
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    autoHideMenuBar: true,
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
  mainWindow.on("closed", () => { mainWindow = null; });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  try {
    await startServer();
    await waitForServer();
    createWindow();
  } catch (err) {
    dialog.showErrorBox("Ошибка запуска", String(err));
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  if (serverProcess) serverProcess.kill();
});
