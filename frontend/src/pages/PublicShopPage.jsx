import { useEffect, useMemo, useState } from "react";
import API from "../api/client";
import CheckoutModal from "../components/CheckoutModal";
import DEFAULT_CATEGORIES, { categoryLabel } from "../constants/categories";
import ProductImage from "../components/ProductImage";
import { toast } from "../utils/toast";

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
  const [pickerChoice, setPickerChoice] = useState({});
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const [cartCollapsed, setCartCollapsed] = useState(false);

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

  const addToCart = (p, choice = {}) => {
    const key = choice.unit_label || choice.variant_name || "default";
    const lineId = `${p._id}::${key}`;
    setCart((prev) => {
      const found = prev.find((x) => x._lineId === lineId);
      if (found) {
        return prev.map((x) =>
          x._lineId === lineId ? { ...x, qty: x.qty + 1 } : x,
        );
      }
      // Resolve the effective price for this choice
      let effectivePrice = Number(p.price || 0);
      let label = "";
      if (p.product_type === "unit_based" && choice.unit_label) {
        const u = (p.selling_units || []).find((x) => x.label === choice.unit_label);
        effectivePrice = Number(u?.price || 0);
        label = ` · ${choice.unit_label}`;
      } else if (p.product_type === "variant" && choice.variant_name) {
        const v = (p.variants || []).find((x) => x.name === choice.variant_name);
        effectivePrice = Number(v?.price || p.price || 0);
        label = ` · ${choice.variant_name}`;
      }
      return [
        ...prev,
        {
          ...p,
          _lineId: lineId,
          qty: 1,
          name: p.name + label,
          price: effectivePrice,
          unit_label: choice.unit_label || null,
          variant_name: choice.variant_name || null,
        },
      ];
    });
    // 📊 Analytics
    API.post("/api/analytics/track", {
      event_type: "add_to_cart",
      shop_id: shop?._id,
      metadata: { product_id: p._id, name: p.name, choice },
    }).catch(() => {});
  };

  const removeFromCart = (lineId) =>
    setCart((prev) => prev.filter((x) => x._lineId !== lineId));

  const changeQty = (lineId, delta) =>
    setCart((prev) =>
      prev
        .map((x) =>
          x._lineId === lineId ? { ...x, qty: Math.max(0, x.qty + delta) } : x,
        )
        .filter((x) => x.qty > 0),
    );

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
    <div
      style={{
        ...shellStyle,
        paddingBottom:
          cart.length > 0 && !cartCollapsed ? 320 : cart.length > 0 ? 80 : 0,
      }}
    >
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
              const isUB = p.product_type === "unit_based" && (p.selling_units || []).length;
              const isVR = p.product_type === "variant" && (p.variants || []).length;
              const choice = pickerChoice[p._id] || {};
              const selectedUnit = isUB
                ? (p.selling_units.find((u) => u.label === choice.unit_label) || p.selling_units[0])
                : null;
              const selectedVariant = isVR
                ? (p.variants.find((v) => v.name === choice.variant_name) || p.variants[0])
                : null;
              const displayPrice = isUB
                ? selectedUnit?.price
                : isVR
                  ? (selectedVariant?.price ?? p.price)
                  : p.price;
              const inStock = isUB
                ? Number(p.base_stock_quantity || 0) >= Number(selectedUnit?.quantity || 0)
                : isVR
                  ? Number(selectedVariant?.stock || 0) > 0
                  : (p.stock ?? 999) > 0;
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

                  {/* Unit picker (sugar/oil/soap) */}
                  {isUB && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0 4px" }}>
                      {p.selling_units.map((u) => {
                        const active = (selectedUnit?.label) === u.label;
                        return (
                          <button
                            key={u.label}
                            data-testid={`unit-pick-${p._id}-${u.label}`}
                            onClick={() =>
                              setPickerChoice((s) => ({
                                ...s,
                                [p._id]: { ...s[p._id], unit_label: u.label },
                              }))
                            }
                            style={{
                              padding: "4px 10px",
                              fontSize: 12,
                              fontWeight: 700,
                              border: active ? "2px solid #0f766e" : "1px solid #cbd5e1",
                              background: active ? "#ccfbf1" : "#fff",
                              color: "#0f172a",
                              borderRadius: 999,
                              cursor: "pointer",
                            }}
                          >
                            {u.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Variant picker (sizes/types) */}
                  {isVR && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0 4px" }}>
                      {p.variants.map((v) => {
                        const active = (selectedVariant?.name) === v.name;
                        const out = Number(v.stock || 0) <= 0;
                        return (
                          <button
                            key={v.name}
                            data-testid={`variant-pick-${p._id}-${v.name}`}
                            disabled={out}
                            onClick={() =>
                              setPickerChoice((s) => ({
                                ...s,
                                [p._id]: { ...s[p._id], variant_name: v.name },
                              }))
                            }
                            style={{
                              padding: "4px 10px",
                              fontSize: 12,
                              fontWeight: 700,
                              border: active ? "2px solid #0f766e" : "1px solid #cbd5e1",
                              background: active ? "#ccfbf1" : out ? "#f1f5f9" : "#fff",
                              color: out ? "#94a3b8" : "#0f172a",
                              borderRadius: 999,
                              textDecoration: out ? "line-through" : "none",
                              cursor: out ? "not-allowed" : "pointer",
                            }}
                          >
                            {v.name}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div style={{ color: "#15803d", fontWeight: 800, marginTop: 4, fontSize: 16 }}>
                    {formatKES(displayPrice)}
                  </div>
                  <button
                    onClick={() =>
                      addToCart(p, {
                        unit_label: isUB ? selectedUnit?.label : undefined,
                        variant_name: isVR ? selectedVariant?.name : undefined,
                      })
                    }
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
        <div
          style={{
            ...cartStyle,
            maxHeight: cartCollapsed ? 56 : "70vh",
            overflowY: cartCollapsed ? "hidden" : "auto",
          }}
          data-testid="public-cart"
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "pointer",
            }}
            onClick={() => setCartCollapsed((v) => !v)}
            data-testid="public-cart-toggle"
          >
            <b>
              🛒 Cart ({cart.reduce((s, c) => s + c.qty, 0)}) ·{" "}
              {formatKES(cartTotal)}
            </b>
            <span
              style={{ color: "#475569", fontSize: 18, lineHeight: 1 }}
              aria-label={cartCollapsed ? "Expand cart" : "Collapse cart"}
            >
              {cartCollapsed ? "▲" : "▼"}
            </span>
          </div>

          {!cartCollapsed && (
            <>
              <div style={{ marginTop: 8 }}>
                {cart.map((c) => (
                  <div
                    key={c._lineId || c._id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 0",
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 13,
                          color: "#0f172a",
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {c.name}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>
                        {formatKES(c.price)} ea
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <button
                        data-testid={`public-cart-decrease-${c._lineId || c._id}`}
                        onClick={() =>
                          changeQty(c._lineId || c._id, -1)
                        }
                        style={qtyBtnStyle}
                        aria-label="Decrease"
                      >
                        −
                      </button>
                      <span
                        data-testid={`public-cart-qty-${c._lineId || c._id}`}
                        style={{
                          minWidth: 22,
                          textAlign: "center",
                          fontWeight: 700,
                          color: "#0f172a",
                        }}
                      >
                        {c.qty}
                      </span>
                      <button
                        data-testid={`public-cart-increase-${c._lineId || c._id}`}
                        onClick={() =>
                          changeQty(c._lineId || c._id, +1)
                        }
                        style={qtyBtnStyle}
                        aria-label="Increase"
                      >
                        +
                      </button>
                      <button
                        onClick={() => removeFromCart(c._lineId || c._id)}
                        data-testid={`public-cart-remove-${c._lineId || c._id}`}
                        style={{
                          ...qtyBtnStyle,
                          color: "#dc2626",
                          marginLeft: 2,
                        }}
                        aria-label="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
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
                  fontWeight: 700,
                  minHeight: 44,
                }}
              >
                Checkout
              </button>
            </>
          )}
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

const qtyBtnStyle = {
  width: 28,
  height: 28,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f1f5f9",
  color: "#0f172a",
  border: "1px solid #e2e8f0",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 14,
  padding: 0,
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
