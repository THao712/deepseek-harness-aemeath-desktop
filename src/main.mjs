import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
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
import { createInterface } from "node:readline";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopManifest = JSON.parse(readFileSync(path.join(sourceDirectory, "..", "package.json"), "utf8"));
const desktopVersion = desktopManifest.version;
const updateRepository = "THao712/deepseek-harness-aemeath-desktop";
function getUpdateDirectory() {
  return path.join(path.dirname(realpathSync(app.getPath("userData"))), "updates");
}
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
let latestUpdate;

// Resolve migrated AppData before Chromium opens cookies, caches, or instance locks.
const userDataPath = app.getPath("userData");
if (existsSync(userDataPath)) app.setPath("userData", realpathSync(userDataPath));

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
  // Windows exclusive-create locks fail through some migrated AppData junctions.
  const dshHome = path.join(realpathSync(app.getPath("userData")), "dsh-home");
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
  const text = value.toString().replace(/([?&]token=)[^\s&]+/g, "$1[redacted]");
  logStream?.write(`[${new Date().toISOString()}] ${source}: ${text}`);
}

function recentLog() {
  return "See the application log for details.";
}

function compareVersions(left, right) {
  const parse = (value) => {
    const [numberPart, preRelease = ""] = String(value).replace(/^v/i, "").split("-", 2);
    const numbers = numberPart.split(".").map((part) => Number.parseInt(part, 10) || 0);
    return { numbers: [numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0], preRelease };
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a.numbers[index] !== b.numbers[index]) return a.numbers[index] > b.numbers[index] ? 1 : -1;
  }
  if (!a.preRelease && b.preRelease) return 1;
  if (a.preRelease && !b.preRelease) return -1;
  if (a.preRelease === b.preRelease) return 0;
  return a.preRelease > b.preRelease ? 1 : -1;
}

async function checkForUpdate() {
  const response = await fetch(`https://api.github.com/repos/${updateRepository}/releases/latest`, {
    headers: { accept: "application/vnd.github+json", "user-agent": "DeepSeek-Harness-Aemeath" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`GitHub update check failed (${response.status}).`);
  const release = await response.json();
  const installer = Array.isArray(release.assets)
    ? release.assets.find((asset) => /^DeepSeek-Harness-Aemeath-Setup-.*\.exe$/i.test(asset.name))
    : undefined;
  latestUpdate = {
    currentVersion: desktopVersion,
    latestVersion: String(release.tag_name ?? "").replace(/^v/i, ""),
    updateAvailable: compareVersions(release.tag_name, desktopVersion) > 0,
    releaseUrl: release.html_url,
    downloadUrl: installer?.browser_download_url ?? null,
    installerName: installer?.name ?? null,
  };
  return latestUpdate;
}

async function downloadUpdate(downloadUrl) {
  if (!latestUpdate || latestUpdate.downloadUrl !== downloadUrl) {
    throw new Error("The update download link is no longer valid. Check for updates again.");
  }
  const parsed = new URL(downloadUrl);
  if (parsed.hostname !== "github.com" && parsed.hostname !== "objects.githubusercontent.com") {
    throw new Error("The update source is not a trusted GitHub download.");
  }
  const updateDirectory = getUpdateDirectory();
  mkdirSync(updateDirectory, { recursive: true });
  const filename = latestUpdate.installerName ?? `DeepSeek-Harness-Aemeath-Setup-${latestUpdate.latestVersion}.exe`;
  const installerPath = path.join(updateDirectory, filename);
  const response = await fetch(downloadUrl, {
    headers: { accept: "application/octet-stream", "user-agent": "DeepSeek-Harness-Aemeath" },
    redirect: "follow",
    signal: AbortSignal.timeout(5 * 60_000),
  });
  if (!response.ok || !response.body) throw new Error(`Update download failed (${response.status}).`);
  const file = createWriteStream(installerPath);
  const writeFinished = new Promise((resolve, reject) => {
    file.once("finish", resolve);
    file.once("error", reject);
  });
  try {
    for await (const chunk of response.body) file.write(chunk);
  } finally {
    file.end();
  }
  await writeFinished;
  const installDirectory = path.resolve(app.getAppPath(), "..", "..");
  const choice = await dialog.showMessageBox(mainWindow, {
    type: "question",
    buttons: ["立即安装", "稍后"],
    defaultId: 0,
    cancelId: 1,
    title: "DeepSeek Harness 更新",
    message: `更新 ${latestUpdate.latestVersion} 已下载完成。`,
    detail: "点击“立即安装”后应用会退出，安装程序会覆盖当前版本并保留你的会话与设置。",
  });
  if (choice.response !== 0) return { installed: false, installerPath };
  spawn(installerPath, ["/S", `/D=${installDirectory}`], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  }).unref();
  quitting = true;
  app.quit();
  return { installed: true, installerPath };
}

const updateControlCss = `
  .dsh-desktop-update {
    position: fixed; top: 14px; right: 18px; z-index: 2147483647;
    width: 34px; height: 34px; padding: 0; border: 1px solid rgba(255, 211, 111, .42);
    border-radius: 50%; color: #fff0bd; background: rgba(24, 14, 31, .84);
    box-shadow: 0 0 16px rgba(255, 143, 200, .24); cursor: pointer;
    font: 700 18px/32px "Segoe UI Symbol", sans-serif; text-align: center;
    backdrop-filter: blur(8px); transition: transform 160ms ease, box-shadow 160ms ease;
  }
  .dsh-desktop-update:hover { transform: scale(1.08); box-shadow: 0 0 22px rgba(139, 220, 243, .5); }
  .dsh-desktop-update[data-state="available"] { color: #bdf5ff; border-color: #8bdcf3; animation: dsh-update-pulse 1.8s ease-in-out infinite; }
  .dsh-desktop-update[data-state="busy"] { color: #ffd36f; cursor: wait; }
  @keyframes dsh-update-pulse { 50% { box-shadow: 0 0 26px rgba(139, 220, 243, .72); } }
`;

async function injectUpdateControl() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  await mainWindow.webContents.insertCSS(updateControlCss);
  await mainWindow.webContents.executeJavaScript(`(() => {
    if (document.getElementById("dsh-desktop-update")) return;
    const button = document.createElement("button");
    button.id = "dsh-desktop-update";
    button.className = "dsh-desktop-update";
    button.type = "button";
    button.textContent = "↻";
    button.title = "检查 DeepSeek Harness 更新";
    button.setAttribute("aria-label", button.title);
    document.body.append(button);
    const setState = (state, title, icon = "↻") => {
      button.dataset.state = state;
      button.textContent = icon;
      button.title = title;
      button.setAttribute("aria-label", title);
    };
    const check = async (autoInstall = false) => {
      setState("busy", "正在检查更新", "⋯");
      try {
        const result = await window.desktopHarness.checkForUpdate();
        if (result.updateAvailable && result.downloadUrl) {
          if (autoInstall) {
            setState("busy", "正在下载更新", "⋯");
            await window.desktopHarness.installUpdate(result.downloadUrl);
          } else {
            setState("available", "发现新版本 " + result.latestVersion + "，点击安装", "↓");
          }
        } else if (result.updateAvailable) {
          setState("available", "发现新版本，请打开发布页", "↓");
        } else {
          setState("ready", "当前已是最新版本", "✓");
          setTimeout(() => setState("ready", "检查 DeepSeek Harness 更新", "↻"), 3500);
        }
      } catch (error) {
        setState("error", "检查更新失败，点击重试", "!");
      }
    };
    button.addEventListener("click", async () => {
      if (button.dataset.state === "available") {
        setState("busy", "正在下载更新", "⋯");
        try {
          const result = await window.desktopHarness.checkForUpdate();
          if (!result.updateAvailable || !result.downloadUrl) return check();
          await window.desktopHarness.installUpdate(result.downloadUrl);
        } catch (error) {
          setState("error", "下载更新失败，点击重试", "!");
        }
        return;
      }
      check(true);
    });
    setTimeout(() => check(false), 2500);
  })()`);
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

async function waitForServer(getUrl, child, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Harness stopped during startup (exit code ${child.exitCode}).`);
    }

    try {
      const url = getUrl();
      const response = await fetch(url, {
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(1_500),
      });
      // The browser, not this readiness probe, must retain the auth cookie.
      const authenticatedRedirect =
        response.status === 303 &&
        response.headers.get("location") === "/" &&
        response.headers.has("set-cookie") &&
        new URL(url).searchParams.has("token");
      await response.body?.cancel();
      if (response.ok || authenticatedRedirect) return url;
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
  harnessUrl = url;
  let launchUrl = url;
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
      "--no-open",
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
  createInterface({ input: child.stdout }).on("line", (line) => {
    appendLog("stdout", `${line}\n`);
    if (!line.startsWith("dsh web: http")) return;
    try {
      const advertised = new URL(line.slice("dsh web: ".length).trim());
      if (advertised.origin === url && advertised.pathname === "/") {
        launchUrl = advertised.href;
      }
    } catch {
      // Only accept complete local URLs printed by this child process.
    }
  });
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
    const readyUrl = await waitForServer(() => launchUrl, child);
    if (thisRun !== runNumber || child !== harnessProcess) return;
    ready = true;
    appendLog("desktop", `Harness ready at ${url}\n`);
    await mainWindow.loadURL(readyUrl);
    appendLog("desktop", "Harness UI loaded.\n");
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
    if (ready) {
      injectUpdateControl().catch((error) => {
        appendLog("update-control-error", `${error.stack ?? error}\n`);
      });
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (harnessUrl && new URL(url).origin === harnessUrl) {
      mainWindow?.loadURL(url);
    } else {
      shell.openExternal(url).catch(() => {});
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file:") || (harnessUrl && new URL(url).origin === harnessUrl)) return;
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

ipcMain.handle("desktop:update-check", async () => checkForUpdate());

ipcMain.handle("desktop:update-install", async (_event, downloadUrl) => {
  try {
    return await downloadUpdate(downloadUrl);
  } catch (error) {
    appendLog("update-error", `${error.stack ?? error}\n`);
    throw error;
  }
});

app.whenReady().then(async () => {
  if (!hasLock || quitting) return;
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
