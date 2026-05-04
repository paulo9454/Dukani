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
        <a href="/" style={{ textDecoration: "none", color: "white" }}>
          <img
            src="/dukayko-logo.jpg"
            alt="Dukayko"
            style={{ height: 32, borderRadius: 6, verticalAlign: "middle" }}
          />
          <span style={{ marginLeft: 10, fontWeight: 700 }}>Dukayko</span>
        </a>
        <span style={{ opacity: 0.7, fontSize: 13 }}>
          🛒 {cart.length} item{cart.length === 1 ? "" : "s"} ·{" "}
          {formatKES(cartTotal)}
        </span>
      </div>

      {/* SHOP HERO */}
      <div style={heroStyle}>
        {shop?.logo && (
          <img
            src={shop.logo}
            alt={shop.name}
            style={{
              width: 80,
              height: 80,
              borderRadius: 12,
              objectFit: "cover",
            }}
          />
        )}
        <div>
          <h1 style={{ margin: 0, color: "#0f172a" }}>{shop?.name}</h1>
          {shop?.description && (
            <p style={{ margin: "6px 0 0", color: "#334155" }}>
              {shop.description}
            </p>
          )}
          <div style={{ marginTop: 6, fontSize: 13, color: "#475569" }}>
            {shop?.category && <span>📂 {shop.category} · </span>}
            {shop?.address && <span>📍 {shop.address}</span>}
          </div>
        </div>
      </div>

      {/* TRACK ORDER TILE */}
      <div style={{ padding: "16px 24px 0" }}>
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
      <div style={{ padding: "20px 24px" }}>
        <h2 style={{ marginTop: 0 }}>Products</h2>

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
            {visibleProducts.map((p) => (
              <div
                key={p._id}
                data-testid={`public-product-${p._id}`}
                className="dk-card"
                style={cardStyle}
              >
                <ProductImage product={p} alt={p.name} height={140} />
                <h3 style={{ margin: "10px 0 4px", fontSize: 15, color: "#0f172a" }}>
                  {p.name}
                </h3>
                {p.category && (
                  <small style={{ color: "#475569" }}>
                    {categoryLabel(p.category)}
                  </small>
                )}
                <div style={{ color: "#15803d", fontWeight: 700, marginTop: 4 }}>
                  {formatKES(p.price)}
                </div>
                <button
                  onClick={() => addToCart(p)}
                  data-testid={`public-add-to-cart-${p._id}`}
                  style={{
                    marginTop: 10,
                    padding: "10px 12px",
                    background: "#16a34a",
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    width: "100%",
                    fontWeight: 700,
                    minHeight: 44,
                  }}
                >
                  Add to cart
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

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
  fontFamily: "system-ui, sans-serif",
};
const headerStyle = {
  background: "#0f172a",
  color: "white",
  padding: "12px 20px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};
const heroStyle = {
  display: "flex",
  gap: 16,
  alignItems: "center",
  padding: "28px 24px",
  background: "white",
  borderBottom: "1px solid #e2e8f0",
};
const cardStyle = {
  background: "white",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 12,
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
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
  boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
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
