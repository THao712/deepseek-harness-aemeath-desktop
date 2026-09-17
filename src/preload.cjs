const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopHarness", {
  retry: () => ipcRenderer.invoke("desktop:retry"),
  showLog: () => ipcRenderer.invoke("desktop:show-log"),
  checkForUpdate: () => ipcRenderer.invoke("desktop:update-check"),
  installUpdate: (downloadUrl) => ipcRenderer.invoke("desktop:update-install", downloadUrl),
});
