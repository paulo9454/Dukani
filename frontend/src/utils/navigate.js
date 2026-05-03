/**
 * Navigate the **top** browsing context to an external URL.
 *
 * The Emergent preview (and many embed hosts) render the app inside an
 * iframe. Setting `window.location.href = "https://checkout.paystack.com/…"`
 * tries to navigate the iframe — but Paystack sends `X-Frame-Options: DENY`,
 * so the iframe gets "refused to connect". Using `window.top.location`
 * breaks out of the frame cleanly. When the app is NOT framed, this behaves
 * identically to a normal navigation.
 */
export function redirectTop(url) {
  if (!url) return;
  try {
    // If we're not framed, `window.top === window` and this is a no-op
    // difference from `window.location.href = url`.
    if (window.top && window.top !== window) {
      window.top.location.href = url;
      return;
    }
  } catch {
    /* Cross-origin framing → we can't touch window.top.location directly.
       Fall through to window.open with _top which the browser honours. */
  }
  const w = window.open(url, "_top");
  if (!w) {
    // Final fallback — same-tab nav.
    window.location.href = url;
  }
}
