import { useEffect, useState } from "react";
import {
  promptInstall,
  isStandalone,
  isIos,
  INSTALL_EVENT_AVAILABLE,
  INSTALL_EVENT_CLEARED,
} from "../utils/pwa";
import { toast } from "../utils/toast";

/**
 * InstallButton — small, subtle "Install Dukayko" button.
 *
 *  - Renders nothing if the app is already running standalone.
 *  - On Android/desktop Chrome, shows when `beforeinstallprompt` has fired
 *    and triggers the native prompt on click.
 *  - On iOS Safari (no install prompt API), shows a lightweight instructions
 *    tooltip when the user taps it.
 *
 * Variants: `header` (compact) or `hero` (full-width on mobile).
 */
export default function InstallButton({ variant = "header", testId = "install-btn" }) {
  const [available, setAvailable] = useState(
    typeof window !== "undefined" && !!window.__dukaykoInstallPrompt
  );
  const [showIosHint, setShowIosHint] = useState(false);
  const standalone = isStandalone();
  const ios = isIos();

  useEffect(() => {
    const onAvail = () => setAvailable(true);
    const onClear = () => setAvailable(false);
    window.addEventListener(INSTALL_EVENT_AVAILABLE, onAvail);
    window.addEventListener(INSTALL_EVENT_CLEARED, onClear);
    return () => {
      window.removeEventListener(INSTALL_EVENT_AVAILABLE, onAvail);
      window.removeEventListener(INSTALL_EVENT_CLEARED, onClear);
    };
  }, []);

  // Already installed — never show.
  if (standalone) return null;

  // Nothing to offer: not iOS (which can still add to home screen manually)
  // and no native prompt has fired. Hide quietly.
  if (!available && !ios) return null;

  const onClick = async () => {
    if (ios) {
      setShowIosHint((v) => !v);
      return;
    }
    const res = await promptInstall();
    if (res.ok) {
      toast("Installing Dukayko…", { variant: "success" });
    } else if (res.reason === "no-prompt") {
      toast("Your browser can't install this app right now — open browser menu → Add to Home Screen.");
    }
  };

  const base = {
    border: "none",
    cursor: "pointer",
    fontWeight: 700,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  };
  const style = variant === "hero"
    ? {
        ...base,
        background: "#16a34a",
        color: "#fff",
        padding: "12px 18px",
        minHeight: 46,
        borderRadius: 999,
        fontSize: 14,
      }
    : {
        ...base,
        background: "#dcfce7",
        color: "#15803d",
        padding: "8px 12px",
        minHeight: 36,
        borderRadius: 999,
        fontSize: 13,
      };

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        data-testid={testId}
        onClick={onClick}
        style={style}
      >
        📲 Install Dukayko
      </button>
      {showIosHint && (
        <div
          data-testid={`${testId}-ios-hint`}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 1000,
            width: 240,
            background: "#0f172a",
            color: "#fff",
            padding: 10,
            borderRadius: 10,
            fontSize: 12,
            lineHeight: 1.5,
            boxShadow: "0 8px 24px rgba(15,23,42,0.25)",
          }}
        >
          Tap the <b>Share</b> icon in Safari, then <b>Add to Home Screen</b>.
          <div
            style={{ marginTop: 6, color: "#cbd5e1", cursor: "pointer", fontWeight: 600 }}
            onClick={() => setShowIosHint(false)}
          >
            Got it ✕
          </div>
        </div>
      )}
    </div>
  );
}
