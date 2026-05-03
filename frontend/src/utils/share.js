/**
 * One-tap WhatsApp sharing for shop owners.
 *
 * Uses the universal `wa.me` deep link — Android opens the WhatsApp app
 * directly, desktop/iOS opens WhatsApp Web / the installed desktop app.
 * Pops up in a new tab; if the browser blocks the popup we fall back to
 * an in-place navigation so the flow never silently fails.
 */
export function buildShopUrl(slug) {
  if (!slug) return null;
  return `${window.location.origin}/shop/${slug}`;
}

export function buildShareMessage(slug) {
  const shopUrl = buildShopUrl(slug);
  if (!shopUrl) return "";
  return `Check out my shop 🛒\n${shopUrl}\n\nOrder easily and pay with M-Pesa.`;
}

export function shareOnWhatsApp(slug) {
  if (!slug) return false;
  const message = buildShareMessage(slug);
  const url = `https://wa.me/?text=${encodeURIComponent(message)}`;

  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win || win.closed || typeof win.closed === "undefined") {
    // Popup blocked — fall back to same-tab navigation so the user still
    // reaches WhatsApp.
    window.location.href = url;
  }
  return true;
}

export async function copyShopLink(slug) {
  const shopUrl = buildShopUrl(slug);
  if (!shopUrl) return false;
  try {
    await navigator.clipboard.writeText(shopUrl);
    return true;
  } catch {
    // Legacy / insecure-context fallback
    try {
      const ta = document.createElement("textarea");
      ta.value = shopUrl;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}
