let installPrompt = null;

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register("/sw.js")
    .then((reg) => {
      reg.update();
      // When a new SW takes control, reload once to pick up fresh assets
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
      // A waiting worker means an update is ready — activate it now
      if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) {
            sw.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
    })
    .catch(() => {});
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
