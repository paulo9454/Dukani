/**
 * PWA glue — service worker registration + install-prompt capture.
 *
 *  - Registers /sw.js at window load.
 *  - Captures the `beforeinstallprompt` event and stashes it on
 *    `window.__dukaykoInstallPrompt` so React components can fire
 *    `prompt()` on demand.
 *  - Emits a `dukayko:install-available` / `dukayko:install-cleared`
 *    CustomEvent so components can toggle their Install button.
 */
const INSTALL_EVENT_AVAILABLE = "dukayko:install-available";
const INSTALL_EVENT_CLEARED = "dukayko:install-cleared";

export function registerPwa() {
  if (typeof window === "undefined") return;

  // 1) Register SW (skip during `vite dev` if hosts it over a non-https origin
  //    or when the API isn't available).
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("[dukayko] SW registration failed:", err);
      });
    });
  }

  // 2) Capture the native install prompt.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    window.__dukaykoInstallPrompt = e;
    window.dispatchEvent(new CustomEvent(INSTALL_EVENT_AVAILABLE));
  });

  // 3) Clear once installed.
  window.addEventListener("appinstalled", () => {
    window.__dukaykoInstallPrompt = null;
    window.dispatchEvent(new CustomEvent(INSTALL_EVENT_CLEARED));
  });
}

export async function promptInstall() {
  const p = typeof window !== "undefined" ? window.__dukaykoInstallPrompt : null;
  if (!p) return { ok: false, reason: "no-prompt" };
  try {
    p.prompt();
    const { outcome } = await p.userChoice;
    // The event is single-use; clear it regardless of outcome.
    window.__dukaykoInstallPrompt = null;
    window.dispatchEvent(new CustomEvent(INSTALL_EVENT_CLEARED));
    return { ok: outcome === "accepted", reason: outcome };
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

export function isIos() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  return /iPad|iPhone|iPod/i.test(ua) && !/CriOS|FxiOS/i.test(ua);
}

export { INSTALL_EVENT_AVAILABLE, INSTALL_EVENT_CLEARED };
