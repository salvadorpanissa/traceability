const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const { spawn } = require("node:child_process");
const http = require("node:http");
const getPort = require("get-port");

let serverProcess = null;
let mainWindow = null;

function serverEntryPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app", "server.js")
    : path.join(__dirname, "build-input", "server.js");
}

function waitForServer(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/" }, (res) => {
        res.destroy();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > deadline) {
          reject(new Error(`Server did not respond on port ${port} within ${timeoutMs}ms`));
          return;
        }
        setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

async function startServer() {
  const port = await getPort();
  serverProcess = spawn(process.execPath, [serverEntryPath()], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProcess.stdout.on("data", (chunk) => process.stdout.write(`[next] ${chunk}`));
  serverProcess.stderr.on("data", (chunk) => process.stderr.write(`[next] ${chunk}`));

  await waitForServer(port);
  return port;
}

function stopServer() {
  if (!serverProcess) return;
  serverProcess.kill("SIGTERM");
  setTimeout(() => {
    if (serverProcess && !serverProcess.killed) serverProcess.kill("SIGKILL");
  }, 5000);
  serverProcess = null;
}

async function createWindow() {
  const port = await startServer();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  stopServer();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", stopServer);

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
