export function registerOfflineShell() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
    return;
  if (import.meta.env.DEV) return;
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/offline-sw.js")
      .then((registration) => {
        // Pick up a new build as soon as one is available.
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller)
              worker.postMessage("skip");
          });
        });
        if (registration.waiting) registration.waiting.postMessage("skip");
      })
      .catch(() => {
        /* offline shell unavailable; packages still use the Cache API */
      });
  });
}
