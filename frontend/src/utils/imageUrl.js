// Single source of truth for resolving product / asset image URLs.
// Handles every shape we might see in the DB (legacy or new) and returns
// a URL that works in preview AND production.
//
//   http://... / https://...  -> returned as-is
//   /static/products/abc.jpg  -> /api/static/products/abc.jpg (legacy migration)
//   /api/static/products/...  -> returned as-is
//   relative (no leading /)   -> /api/static/<path>
//   null / "" / undefined     -> null   (caller should render placeholder)
//
// If VITE_BACKEND_URL is set (prod build) we prefix it; in preview the
// string is empty and relative paths go through the Emergent ingress.

const BACKEND = import.meta.env.VITE_BACKEND_URL || "";

export function resolveImageUrl(src) {
  if (!src) return null;
  const s = String(src).trim();
  if (!s) return null;
  if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("data:")) {
    return s;
  }
  let path = s;
  if (path.startsWith("/static/")) path = "/api" + path;
  else if (!path.startsWith("/")) path = "/api/static/" + path;
  return `${BACKEND}${path}`;
}

// Convenience helper for product objects that might carry image
// under different keys (image, image_url, images[0]).
export function productImage(p) {
  if (!p) return null;
  return resolveImageUrl(
    p.image || p.image_url || (Array.isArray(p.images) ? p.images[0] : null)
  );
}
