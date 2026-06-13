import { app, BrowserWindow, Tray, Menu, nativeImage } from "electron";
import * as path from "path";
import { spawn, ChildProcess } from "child_process";
import * as net from "net";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let apiProcess: ChildProcess | null = null;
let isQuitting = false;

const API_PORT = 3001;
const WEB_PORT = 5173;

function checkPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(true));
    server.once("listening", () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
}

async function startBackend(): Promise<void> {
  const apiInUse = await checkPortInUse(API_PORT);
  if (apiInUse) {
    console.log(`Backend already running on port ${API_PORT}`);
    return;
  }

  const rootDir = path.join(__dirname, "..", "..", "..");
  const apiDir = path.join(rootDir, "apps", "api");

  apiProcess = spawn("pnpm", ["start"], {
    cwd: apiDir,
    shell: true,
    stdio: "inherit",
  });

  apiProcess.on("error", (err) => {
    console.error("Failed to start backend:", err);
  });

  await new Promise((resolve) => setTimeout(resolve, 3000));
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, "assets", "icon.png"),
  });

  if (app.isPackaged) {
    const webPath = path.join(__dirname, "..", "..", "web", "dist", "index.html");
    mainWindow.loadFile(webPath);
  } else {
    mainWindow.loadURL(`http://localhost:${WEB_PORT}`);
  }

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray(): void {
  const iconPath = path.join(__dirname, "assets", "icon.png");
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "显示主窗口",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("Content Factory");
  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}

app.on("ready", async () => {
  await startBackend();
  createWindow();
  createTray();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Keep running in system tray
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  if (apiProcess) {
    apiProcess.kill();
    apiProcess = null;
  }
});
