let installPrompt = null;

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

function setupInstallPrompt() {
  const btn = document.getElementById("install-app-btn");
  if (!btn) return;

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if (isStandalone) {
    btn.hidden = true;
    return;
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e;
    btn.hidden = false;
  });

  btn.addEventListener("click", async () => {
    if (!installPrompt) {
      alert("Install: use your browser menu → Add to Home Screen / Install app.");
      return;
    }
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    btn.hidden = true;
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    btn.hidden = true;
  });
}

registerServiceWorker();
setupInstallPrompt();
