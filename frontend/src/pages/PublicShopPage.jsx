import { useEffect, useState } from "react";
import API from "../api/client";
import CheckoutModal from "../components/CheckoutModal";

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
  };

  const removeFromCart = (id) =>
    setCart((prev) => prev.filter((x) => x._id !== id));

  const cartTotal = cart.reduce(
    (sum, x) => sum + Number(x.price || 0) * x.qty,
    0
  );

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
          <h1 style={{ margin: 0 }}>{shop?.name}</h1>
          {shop?.description && (
            <p style={{ margin: "6px 0 0", color: "#475569" }}>
              {shop.description}
            </p>
          )}
          <div style={{ marginTop: 6, fontSize: 13, color: "#64748b" }}>
            {shop?.category && <span>📂 {shop.category} · </span>}
            {shop?.address && <span>📍 {shop.address}</span>}
          </div>
        </div>
      </div>

      {/* PRODUCTS GRID */}
      <div style={{ padding: "20px 24px" }}>
        <h2 style={{ marginTop: 0 }}>Products</h2>
        {products.length === 0 ? (
          <p style={{ color: "#64748b" }}>This shop has no products yet.</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 16,
            }}
            data-testid="public-shop-products"
          >
            {products.map((p) => (
              <div
                key={p._id}
                data-testid={`public-product-${p._id}`}
                style={cardStyle}
              >
                {p.image ? (
                  <img
                    src={p.image}
                    alt={p.name}
                    style={{
                      width: "100%",
                      height: 140,
                      objectFit: "cover",
                      borderRadius: 8,
                      background: "#f1f5f9",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      height: 140,
                      background: "#f1f5f9",
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 30,
                    }}
                  >
                    📦
                  </div>
                )}
                <h3 style={{ margin: "10px 0 4px", fontSize: 15 }}>{p.name}</h3>
                <div style={{ color: "#16a34a", fontWeight: 700 }}>
                  {formatKES(p.price)}
                </div>
                <button
                  onClick={() => addToCart(p)}
                  style={{
                    marginTop: 8,
                    padding: "8px 12px",
                    background: "#16a34a",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    width: "100%",
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
            onClick={() => setCheckoutOpen(true)}
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
  width: 280,
  background: "white",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: 12,
  boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
  fontSize: 13,
};
