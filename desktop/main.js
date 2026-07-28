const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

let mainWindow = null;

// The app is a thin browser shell around the centrally-hosted web app —
// it never runs its own Next.js server or holds DATABASE_URL/AUTH_SECRET.
// Baking those into a locally-run server meant every distributed install
// shipped the real production DB credentials and the JWT signing secret in
// plaintext, extractable by any end user. serverUrl is not a secret, just
// the app's public URL, so it's safe to ship in the package.
function serverUrl() {
  const configPath = path.join(app.getAppPath(), "app-config.json");
  const { serverUrl } = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (!serverUrl || serverUrl.includes("REPLACE-WITH-HOSTED-URL")) {
    throw new Error(`Set a real serverUrl in ${configPath} before packaging`);
  }
  return serverUrl;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(serverUrl());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
