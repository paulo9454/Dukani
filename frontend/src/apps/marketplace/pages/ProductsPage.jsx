import { useEffect, useState } from "react";
import { getProducts } from "../../../api/products";
import API from "../../../api/client";

export default function ProductsPage({ shop, onBack }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]); // ✅ NEW
  const [loading, setLoading] = useState(true);

  // =========================
  // LOAD PRODUCTS + CATEGORIES
  // =========================
  useEffect(() => {
    if (!shop) return;

    const loadProducts = async () => {
      try {
        const data = await getProducts({
          shop_id: shop.id,
        });

        setProducts(data || []);
      } catch (err) {
        console.error("Failed to load products:", err);
        setProducts([]);
      }
    };

    // ✅ NEW: load categories
    const loadCategories = async () => {
      try {
        const res = await API.get(
          `/api/categories?shop_id=${shop.id}`
        );
        setCategories(res.data || []);
      } catch (err) {
        console.error("Failed to load categories:", err);
      }
    };

    const loadAll = async () => {
      setLoading(true);
      await Promise.all([loadProducts(), loadCategories()]);
      setLoading(false);
    };

    loadAll();
  }, [shop]);

  // =========================
  // ADD TO CART
  // =========================
  const handleAddToCart = async (product) => {
    try {
      await API.post("/api/customer/cart", {
        product_id: product.id,
        qty: 1,
      });

      alert("✅ Added to cart");
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message;
      alert("❌ " + msg);
    }
  };

  // =========================
  // UI
  // =========================
  return (
    <div style={{ padding: 16 }}>
      <button onClick={onBack}>⬅ Back</button>

      <h3>🏪 {shop?.name || "Shop"} Products</h3>

      {loading && <p>Loading products...</p>}

      {!loading && products.length === 0 && (
        <p>No products available</p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 15,
        }}
      >
        {products.map((p) => {
          const outOfStock = (p.stock || 0) <= 0;
          const notOnline = !p.is_online;

          return (
            <div
              key={p.id}
              style={{
                border: "1px solid #ddd",
                padding: 12,
                borderRadius: 10,
                background: "#fff",
                boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
              }}
            >
              <b>{p.name}</b>

              <div style={{ marginTop: 5 }}>
                <strong>KES {p.price}</strong>
              </div>

              <div style={{ fontSize: 12, color: "#666" }}>
                Stock: {p.stock ?? 0}
              </div>

              {/* ✅ NEW: SHOW CATEGORY */}
              <div style={{ fontSize: 12, color: "#888" }}>
                Category: {p.category_id || "None"}
              </div>

              {/* BUTTON LOGIC */}
              {notOnline ? (
                <small style={{ color: "gray" }}>
                  Not available online
                </small>
              ) : outOfStock ? (
                <small style={{ color: "red" }}>
                  Out of stock
                </small>
              ) : (
                <button
                  onClick={() => handleAddToCart(p)}
                  style={{
                    marginTop: 10,
                    padding: "8px",
                    width: "100%",
                    background: "#00a082",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  Add to Cart
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
