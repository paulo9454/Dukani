/**
 * Minimal, dependency-free toast. Fire-and-forget: `toast("Link copied")`.
 * Auto-dismisses after 2s. Uses a single DOM node pool so rapid clicks
 * don't stack toasts on top of each other.
 */
let host = null;

function ensureHost() {
  if (host && document.body.contains(host)) return host;
  host = document.createElement("div");
  host.id = "dk-toast-host";
  Object.assign(host.style, {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    zIndex: "99999",
    pointerEvents: "none",
  });
  document.body.appendChild(host);
  return host;
}

export function toast(message, { variant = "default", duration = 2000 } = {}) {
  if (typeof document === "undefined") return;
  const parent = ensureHost();
  const el = document.createElement("div");
  el.textContent = message;
  el.setAttribute("data-testid", "dk-toast");
  Object.assign(el.style, {
    background: variant === "success" ? "#16a34a" : "#0f172a",
    color: "#fff",
    padding: "10px 16px",
    borderRadius: "10px",
    fontSize: "14px",
    fontWeight: "600",
    boxShadow: "0 8px 24px rgba(15,23,42,0.25)",
    opacity: "0",
    transform: "translateY(6px)",
    transition: "opacity 150ms ease, transform 150ms ease",
    maxWidth: "90vw",
  });
  parent.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
  });
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    setTimeout(() => el.remove(), 200);
  }, duration);
}
