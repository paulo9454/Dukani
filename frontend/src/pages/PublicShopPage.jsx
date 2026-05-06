import { useEffect, useMemo, useState } from "react";
import API from "../api/client";
import CheckoutModal from "../components/CheckoutModal";
import DEFAULT_CATEGORIES, { categoryLabel } from "../constants/categories";
import ProductImage from "../components/ProductImage";

/**
 * Public Shop Page — Shopify-style /shop/:slug
 * Anyone (no auth required) can browse a shop's products.
 */
export default function PublicShopPage({ slug }) {
  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cart, setCart] = useState([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");

  // Track-order tile state
  const [trackPhone, setTrackPhone] = useState("");
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState("");

  const visibleProducts = useMemo(() => {
    if (activeCategory === "all") return products;
    return products.filter((p) => (p.category || "") === activeCategory);
  }, [products, activeCategory]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [s, p] = await Promise.all([
          API.get(`/api/public/shop/${slug}`),
          API.get(`/api/public/shop/${slug}/products`),
        ]);
        setShop(s.data);
        // Backward-compat: backend now returns {items, page, total, has_more}
        const list = Array.isArray(p.data) ? p.data : (p.data?.items || []);
        setProducts(list);

        // 🌍 SEO: dynamic title + description
        if (s.data?.name) {
          document.title = `${s.data.name} · Dukayko`;
          let desc = document.querySelector("meta[name=description]");
          if (!desc) {
            desc = document.createElement("meta");
            desc.setAttribute("name", "description");
            document.head.appendChild(desc);
          }
          desc.setAttribute(
            "content",
            s.data.description ||
              `Buy from ${s.data.name} online — fast checkout via M-Pesa or Card.`
          );
        }

        // 📊 Analytics — view_shop
        try {
          await API.post("/api/analytics/track", {
            event_type: "view_shop",
            shop_id: s.data?._id,
          });
        } catch {}
      } catch (err) {
        setError(err?.response?.data?.detail || "Could not load shop");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug]);

  const formatKES = (n) => "KES " + Number(n || 0).toLocaleString();

  const addToCart = (p) => {
    setCart((prev) => {
      const found = prev.find((x) => x._id === p._id);
      if (found) {
        return prev.map((x) =>
          x._id === p._id ? { ...x, qty: x.qty + 1 } : x
        );
      }
      return [...prev, { ...p, qty: 1 }];
    });
    // 📊 Analytics
    API.post("/api/analytics/track", {
      event_type: "add_to_cart",
      shop_id: shop?._id,
      metadata: { product_id: p._id, name: p.name },
    }).catch(() => {});
  };

  const removeFromCart = (id) =>
    setCart((prev) => prev.filter((x) => x._id !== id));

  const cartTotal = cart.reduce(
    (sum, x) => sum + Number(x.price || 0) * x.qty,
    0
  );

  const lookupOrder = async () => {
    const clean = (trackPhone || "").replace(/\s|-/g, "");
    if (!clean || clean.length < 7) {
      setTrackError("Please enter a valid phone number");
      return;
    }
    try {
      setTrackError("");
      setTrackLoading(true);
      const res = await API.get(
        `/api/orders/lookup?phone=${encodeURIComponent(clean)}&slug=${encodeURIComponent(slug)}`
      );
      const id = res.data?.order_id;
      if (id) {
        window.location.href = `/track/${id}?contact=${encodeURIComponent(clean)}`;
      } else {
        setTrackError("No orders found for that phone number.");
      }
    } catch (err) {
      setTrackError(
        err?.response?.status === 404
          ? "No orders found for that phone number."
          : err?.response?.data?.detail || "Could not look up order"
      );
    } finally {
      setTrackLoading(false);
    }
  };

  if (loading)
    return (
      <div style={shellStyle}>
        <div style={{ padding: 40 }}>Loading shop…</div>
      </div>
    );

  if (error)
    return (
      <div style={shellStyle}>
        <div style={{ padding: 40 }}>
          <h2>😕 Shop unavailable</h2>
          <p style={{ color: "#666" }}>{error}</p>
          <button onClick={() => (window.location.href = "/")}>← Home</button>
        </div>
      </div>
    );

  return (
    <div style={shellStyle}>
      {/* HEADER */}
      <div style={headerStyle}>
        <a href="/" style={{ textDecoration: "none", color: "white", display: "flex", alignItems: "center", gap: 8 }}>
          <img
            src="/dukayko-logo.jpg"
            alt="Dukayko"
            style={{ height: 28, borderRadius: 6 }}
          />
          <span style={{ fontWeight: 700 }}>Dukayko</span>
        </a>
        <span style={{ opacity: 0.85, fontSize: 13 }}>
          🛒 {cart.length} item{cart.length === 1 ? "" : "s"} ·{" "}
          {formatKES(cartTotal)}
        </span>
      </div>

      {/* SHOP HERO — premium banner */}
      <div style={heroBanner}>
        <div style={heroBannerInner}>
          {shop?.logo ? (
            <img
              src={shop.logo}
              alt={shop.name}
              style={heroLogo}
            />
          ) : (
            <div style={{ ...heroLogo, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, background: "rgba(255,255,255,0.18)" }}>
              {(shop?.name || "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, opacity: 0.85, textTransform: "uppercase" }}>
              Verified shop on Dukayko
            </div>
            <h1 style={heroTitle}>{shop?.name}</h1>
            {shop?.description && (
              <p style={heroSubtitle}>{shop.description}</p>
            )}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10 }}>
              {shop?.category && (
                <span style={heroChip}>📂 {shop.category}</span>
              )}
              {shop?.address && (
                <a
                  href={
                    shop.latitude && shop.longitude
                      ? `https://www.google.com/maps/search/?api=1&query=${shop.latitude},${shop.longitude}`
                      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.address)}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  data-testid="shop-location-map-link"
                  style={{ ...heroChip, textDecoration: "none", cursor: "pointer" }}
                  title="Open in Google Maps"
                >
                  📍 {shop.address} ↗
                </a>
              )}
              {shop?.phone && (
                <a
                  href={`tel:${shop.phone}`}
                  style={{ ...heroChip, textDecoration: "none" }}
                >
                  📞 {shop.phone}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* TRUST STRIP — "real online store" signals */}
      <div style={trustStrip}>
        <span style={trustItem}>🔒 Secure checkout</span>
        <span style={trustItem}>🟢 M-Pesa & Card</span>
        <span style={trustItem}>📦 Local delivery</span>
        <span style={trustItem}>⭐ Verified shop</span>
      </div>

      {/* TRACK ORDER TILE */}
      <div style={{ padding: "16px 24px 0", maxWidth: 1200, margin: "0 auto" }}>
        <div
          data-testid="track-order-tile"
          style={{
            background: "#f1f5f9",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: 14,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 700, color: "#0f172a", marginRight: 4 }}>
            📦 Already ordered?
          </div>
          <input
            data-testid="track-phone-input"
            type="tel"
            inputMode="tel"
            placeholder="Enter phone number"
            value={trackPhone}
            onChange={(e) => {
              setTrackPhone(e.target.value);
              if (trackError) setTrackError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && lookupOrder()}
            style={{
              flex: "1 1 180px",
              minHeight: 42,
              padding: "10px 12px",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              fontSize: 14,
              background: "white",
            }}
          />
          <button
            data-testid="track-order-btn"
            onClick={lookupOrder}
            disabled={trackLoading}
            style={{
              minHeight: 44,
              padding: "10px 18px",
              background: "#0f172a",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontWeight: 700,
              cursor: trackLoading ? "wait" : "pointer",
              opacity: trackLoading ? 0.7 : 1,
            }}
          >
            {trackLoading ? "Looking up…" : "Track order"}
          </button>
          {trackError && (
            <div
              data-testid="track-order-error"
              style={{
                flexBasis: "100%",
                color: "#dc2626",
                fontSize: 13,
                marginTop: 2,
              }}
            >
              {trackError}
            </div>
          )}
        </div>
      </div>

      {/* PRODUCTS GRID */}
      <div style={{ padding: "20px 24px 100px", maxWidth: 1200, margin: "0 auto" }}>
        <h2 style={{ marginTop: 0, color: "#0f172a", fontSize: 22 }}>
          Shop products
        </h2>
        <p style={{ color: "#64748b", marginTop: -8, fontSize: 14 }}>
          {visibleProducts.length} item{visibleProducts.length === 1 ? "" : "s"} available · prices in KES · order online
        </p>

        {/* 🧩 CATEGORY BAR */}
        {products.length > 0 && (
          <div
            data-testid="public-shop-category-bar"
            style={{
              display: "flex",
              gap: 10,
              overflowX: "auto",
              paddingBottom: 8,
              marginBottom: 16,
            }}
          >
            <button
              onClick={() => setActiveCategory("all")}
              data-testid="public-category-all"
              style={pillStyle(activeCategory === "all")}
            >
              🏪 All
            </button>
            {DEFAULT_CATEGORIES.filter((c) =>
              products.some((p) => p.category === c.value)
            ).map((c) => (
              <button
                key={c.value}
                onClick={() => setActiveCategory(c.value)}
                data-testid={`public-category-${c.value}`}
                style={pillStyle(activeCategory === c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {visibleProducts.length === 0 ? (
          <p style={{ color: "#475569" }}>
            {products.length === 0
              ? "This shop has no products yet."
              : "No products in this category yet."}
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 16,
            }}
            data-testid="public-shop-products"
          >
            {visibleProducts.map((p) => {
              const inStock = (p.stock ?? 999) > 0;
              return (
                <div
                  key={p._id}
                  data-testid={`public-product-${p._id}`}
                  className="dk-card"
                  style={cardStyle}
                >
                  <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", background: "#f1f5f9" }}>
                    <ProductImage product={p} alt={p.name} height={160} />
                    {!inStock && (
                      <span style={outOfStockBadge}>Out of stock</span>
                    )}
                  </div>
                  <h3 style={{ margin: "10px 0 4px", fontSize: 15, color: "#0f172a", lineHeight: 1.3 }}>
                    {p.name}
                  </h3>
                  {p.category && (
                    <small style={{ color: "#475569" }}>
                      {categoryLabel(p.category)}
                    </small>
                  )}
                  <div style={{ color: "#15803d", fontWeight: 800, marginTop: 4, fontSize: 16 }}>
                    {formatKES(p.price)}
                  </div>
                  <button
                    onClick={() => addToCart(p)}
                    disabled={!inStock}
                    data-testid={`public-add-to-cart-${p._id}`}
                    style={{
                      marginTop: 10,
                      padding: "10px 12px",
                      background: inStock ? "#16a34a" : "#cbd5e1",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      cursor: inStock ? "pointer" : "not-allowed",
                      width: "100%",
                      fontWeight: 700,
                      minHeight: 44,
                    }}
                  >
                    {inStock ? "Add to cart" : "Sold out"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FOOTER — credits owner + Dukayko branding */}
      <footer style={footerStyle}>
        <div>
          {shop?.address && (
            <div style={{ fontSize: 13, color: "#94a3b8" }}>
              📍 {shop.address}
            </div>
          )}
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
            Powered by{" "}
            <a href="/" style={{ color: "#0f766e", textDecoration: "none", fontWeight: 700 }}>
              Dukayko
            </a>{" "}
            · Open your own online shop in minutes
          </div>
        </div>
      </footer>

      {/* CART */}
      {cart.length > 0 && (
        <div style={cartStyle}>
          <b>Cart ({cart.length})</b>
          {cart.map((c) => (
            <div
              key={c._id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                margin: "6px 0",
              }}
            >
              <span>
                {c.qty}× {c.name}
              </span>
              <span>
                {formatKES(c.price * c.qty)}{" "}
                <button
                  onClick={() => removeFromCart(c._id)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#dc2626",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </span>
            </div>
          ))}
          <div
            style={{
              borderTop: "1px solid #e2e8f0",
              marginTop: 6,
              paddingTop: 6,
              display: "flex",
              justifyContent: "space-between",
              fontWeight: 700,
            }}
          >
            <span>Total</span>
            <span>{formatKES(cartTotal)}</span>
          </div>
          <button
            data-testid="public-shop-checkout"
            onClick={() => {
              setCheckoutOpen(true);
              API.post("/api/analytics/track", {
                event_type: "checkout_start",
                shop_id: shop?._id,
                metadata: { items: cart.length, total: cartTotal },
              }).catch(() => {});
            }}
            style={{
              marginTop: 8,
              padding: "10px",
              width: "100%",
              background: "#16a34a",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Checkout
          </button>
        </div>
      )}

      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        slug={slug}
        shop={shop}
        cart={cart}
        onSuccess={() => setCart([])}
      />
    </div>
  );
}

const shellStyle = {
  minHeight: "100vh",
  background: "#f8fafc",
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};
const headerStyle = {
  background: "#0f172a",
  color: "white",
  padding: "12px 20px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};
const heroBanner = {
  background: "linear-gradient(135deg, #0f766e 0%, #0e9488 50%, #14b8a6 100%)",
  color: "#fff",
  padding: "32px 24px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};
const heroBannerInner = {
  maxWidth: 1200,
  margin: "0 auto",
  display: "flex",
  gap: 18,
  alignItems: "center",
  flexWrap: "wrap",
};
const heroLogo = {
  width: 84,
  height: 84,
  borderRadius: 14,
  objectFit: "cover",
  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
  background: "#fff",
};
const heroTitle = {
  margin: "4px 0 6px",
  fontSize: "clamp(24px, 3.6vw, 34px)",
  fontWeight: 800,
  letterSpacing: "-0.01em",
};
const heroSubtitle = {
  margin: 0,
  fontSize: 15,
  opacity: 0.95,
  lineHeight: 1.5,
  maxWidth: 720,
};
const heroChip = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "rgba(255,255,255,0.18)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  padding: "6px 12px",
  borderRadius: 999,
  backdropFilter: "blur(6px)",
};
const trustStrip = {
  display: "flex",
  gap: 18,
  flexWrap: "wrap",
  justifyContent: "center",
  background: "#fff",
  borderBottom: "1px solid #e2e8f0",
  padding: "12px 20px",
  fontSize: 13,
  color: "#0f172a",
};
const trustItem = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontWeight: 600,
};
const cardStyle = {
  background: "white",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 12,
  boxShadow: "0 2px 6px rgba(15,23,42,0.05)",
  transition: "transform 150ms ease, box-shadow 150ms ease",
};
const outOfStockBadge = {
  position: "absolute",
  top: 8,
  left: 8,
  background: "rgba(15,23,42,0.85)",
  color: "#fff",
  fontSize: 11,
  fontWeight: 700,
  padding: "3px 8px",
  borderRadius: 999,
};
const footerStyle = {
  background: "#0f172a",
  color: "#cbd5e1",
  padding: "20px 24px",
  borderTop: "1px solid #1e293b",
  textAlign: "center",
};
const cartStyle = {
  position: "fixed",
  bottom: 16,
  right: 16,
  left: 16,
  maxWidth: 320,
  marginLeft: "auto",
  background: "white",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 14,
  boxShadow: "0 8px 24px rgba(15,23,42,0.18)",
  fontSize: 13,
  color: "#0f172a",
  zIndex: 50,
};

const pillStyle = (active) => ({
  padding: "8px 14px",
  borderRadius: 999,
  border: "none",
  background: active ? "#0f172a" : "#e2e8f0",
  color: active ? "white" : "#0f172a",
  whiteSpace: "nowrap",
  fontWeight: active ? 700 : 500,
  cursor: "pointer",
  fontSize: 13,
});
