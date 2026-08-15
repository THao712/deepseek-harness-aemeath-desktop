const { contextBridge, ipcRenderer } = require("electron");

function markTheme() {
  document.documentElement?.setAttribute("data-aemeath-theme", "");
  document.body?.setAttribute("data-aemeath-theme", "");
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", markTheme, { once: true });
} else {
  markTheme();
}

contextBridge.exposeInMainWorld("desktopHarness", {
  retry: () => ipcRenderer.invoke("desktop:retry"),
  showLog: () => ipcRenderer.invoke("desktop:show-log"),
});
