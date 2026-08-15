import { app, BrowserWindow, ipcMain, shell } from "electron";
import { spawn, spawnSync } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopPatchPath = path.join(sourceDirectory, "desktop.patch.yml");
const loadingPage = path.join(sourceDirectory, "loading.html");
const preloadPath = path.join(sourceDirectory, "preload.cjs");
const aemeathThemePath = path.join(sourceDirectory, "aemeath-theme.css");
const aemeathBackdropPath = path.join(
  sourceDirectory,
  "..",
  "assets",
  "aemeath-main-background.webp",
);
const aemeathAssistantPath = path.join(
  sourceDirectory,
  "..",
  "assets",
  "aemeath-pixel-assistant.webp",
);
const aemeathIconPath = path.join(
  sourceDirectory,
  "..",
  "assets",
  "aemeath-app-icon.png",
);

const aemeathThemeCss = readFileSync(aemeathThemePath, "utf8")
  .replaceAll(
    "__AEMEATH_BACKDROP__",
    `data:image/webp;base64,${readFileSync(aemeathBackdropPath).toString("base64")}`,
  )
  .replaceAll(
    "__AEMEATH_ASSISTANT__",
    `data:image/webp;base64,${readFileSync(aemeathAssistantPath).toString("base64")}`,
  )
  .replaceAll(
    "__AEMEATH_ICON__",
    `data:image/png;base64,${readFileSync(aemeathIconPath).toString("base64")}`,
  );

let mainWindow;
let harnessProcess;
let harnessUrl;
let logPath;
let logStream;
let runNumber = 0;
let quitting = false;
let ready = false;

const hasLock = app.requestSingleInstanceLock();

if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (port) resolve(port);
        else reject(new Error("Could not allocate a local port."));
      });
    });
  });
}

function getDshEntry() {
  const manifest = require.resolve("@deepseek-ai/dsh/package.json");
  return path.join(path.dirname(manifest), "lib", "bin.js");
}

function prepareDshHome(dshEntry) {
  const dshHome = path.join(app.getPath("userData"), "dsh-home");
  const profileDirectory = path.join(dshHome, "profiles", "web");
  const profileModules = path.join(profileDirectory, "node_modules");
  const bundledModules = path.resolve(path.dirname(dshEntry), "..", "..", "..");
  const expectedTarget = realpathSync(bundledModules);

  mkdirSync(profileDirectory, { recursive: true });

  try {
    const existing = lstatSync(profileModules);
    if (!existing.isSymbolicLink()) {
      throw new Error(`Desktop profile path is not a link: ${profileModules}`);
    }

    try {
      if (realpathSync(profileModules) === expectedTarget) return dshHome;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    unlinkSync(profileModules);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  symlinkSync(
    bundledModules,
    profileModules,
    process.platform === "win32" ? "junction" : "dir",
  );
  return dshHome;
}

function appendLog(source, value) {
  const text = value.toString();
  logStream?.write(`[${new Date().toISOString()}] ${source}: ${text}`);
}

function recentLog() {
  return "See the application log for details.";
}

async function showStartupError(error) {
  appendLog("startup-error", `${error.stack ?? error}\n`);
  if (!quitting) {
    await showState("error", `${error.message} ${recentLog()}`);
  }
}

async function captureTestFrame() {
  const outputPath = process.env.DSH_DESKTOP_CAPTURE_PATH;
  if (!outputPath || !mainWindow || mainWindow.isDestroyed()) return;

  await new Promise((resolve) => setTimeout(resolve, 2_000));
  const image = await mainWindow.webContents.capturePage();
  writeFileSync(outputPath, image.toPNG());

  if (process.env.DSH_DESKTOP_TEST_QUIT === "1") {
    setTimeout(() => app.quit(), 150);
  }
}

async function showState(mode, detail = "") {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  await mainWindow.loadFile(loadingPage, {
    query: { mode, detail },
  });
}

async function waitForServer(url, child, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Harness stopped during startup (exit code ${child.exitCode}).`);
    }

    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(1_500),
      });
      if (response.ok) return;
    } catch {
      // The local server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 450));
  }

  throw new Error("Harness did not become ready within three minutes.");
}

function stopHarness() {
  const child = harnessProcess;
  harnessProcess = undefined;
  ready = false;

  if (!child || child.exitCode !== null || !child.pid) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      windowsHide: true,
      stdio: "ignore",
    });
  } else {
    child.kill("SIGTERM");
  }
}

async function launchHarness() {
  const thisRun = ++runNumber;
  stopHarness();
  await showState("starting");

  const port = await findOpenPort();
  const url = `http://127.0.0.1:${port}`;
  const dshEntry = getDshEntry();
  const dshHome = prepareDshHome(dshEntry);

  appendLog("desktop", `Starting ${dshEntry} at ${url}\n`);

  const child = spawn(
    process.execPath,
    [
      "--expose-internals",
      dshEntry,
      "web",
      "--patch",
      desktopPatchPath,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: app.getPath("documents"),
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        DSH_HOME: dshHome,
        NO_COLOR: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );

  harnessProcess = child;
  child.stdout.on("data", (chunk) => appendLog("stdout", chunk));
  child.stderr.on("data", (chunk) => appendLog("stderr", chunk));
  child.on("error", (error) => appendLog("process-error", `${error.stack ?? error}\n`));
  child.on("exit", (code, signal) => {
    appendLog("desktop", `Harness exited with code ${code}, signal ${signal}.\n`);
    if (quitting || thisRun !== runNumber) return;
    if (ready) {
      ready = false;
      showState("error", `Harness stopped unexpectedly. ${recentLog()}`).catch(() => {});
    }
  });

  try {
    await waitForServer(url, child);
    if (thisRun !== runNumber || child !== harnessProcess) return;
    ready = true;
    harnessUrl = url;
    await mainWindow.loadURL(url);
    await captureTestFrame();
  } catch (error) {
    if (thisRun === runNumber) await showStartupError(error);
  }
}

function createWindow() {
  const iconPath = path.join(app.getAppPath(), "build", "icon.png");

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: "DeepSeek Harness Aemeath",
    icon: existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: "#120c18",
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  mainWindow.webContents.on("dom-ready", () => {
    mainWindow?.webContents.insertCSS(aemeathThemeCss).catch((error) => {
      appendLog("theme-error", `${error.stack ?? error}\n`);
    });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (harnessUrl && url.startsWith(harnessUrl)) {
      mainWindow?.loadURL(url);
    } else {
      shell.openExternal(url).catch(() => {});
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file:") || (harnessUrl && url.startsWith(harnessUrl))) return;
    event.preventDefault();
    shell.openExternal(url).catch(() => {});
  });

  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });
}

ipcMain.handle("desktop:retry", async () => {
  try {
    await launchHarness();
  } catch (error) {
    await showStartupError(error);
  }
});

ipcMain.handle("desktop:show-log", async () => {
  if (logPath) shell.showItemInFolder(logPath);
});

app.whenReady().then(async () => {
  app.setAppUserModelId("io.github.thao712.deepseek-harness-aemeath");

  const logDirectory = path.join(app.getPath("userData"), "logs");
  mkdirSync(logDirectory, { recursive: true });
  logPath = path.join(logDirectory, "desktop.log");
  logStream = createWriteStream(logPath, { flags: "a" });

  createWindow();
  try {
    await launchHarness();
  } catch (error) {
    await showStartupError(error);
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
    launchHarness().catch((error) => showStartupError(error));
  }
});

app.on("before-quit", () => {
  quitting = true;
  runNumber += 1;
  stopHarness();
  logStream?.end();
});

app.on("window-all-closed", () => app.quit());
