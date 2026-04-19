import { useEffect, useState } from "react";
import API from "../../../api/client";

export default function ProductsPage({ shop, onBack }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // =========================
  // LOAD PRODUCTS
  // =========================
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const res = await API.get(`/api/public/products?shop_id=${shop._id}`);
        setProducts(res.data || []);
      } catch (err) {
        console.error("Failed to load products:", err);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, [shop]);

  // =========================
  // ADD TO CART
  // =========================
  const handleAddToCart = async (product) => {
    try {
      await API.post("/api/customer/cart", {
        product_id: product._id,
        qty: 1,
      });

      alert("✅ Added to cart");
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message;
      alert("❌ " + msg);
    }
  };

  return (
    <div>
      <button onClick={onBack}>⬅ Back</button>

      <h3>🏪 {shop.name} Products</h3>

      {loading && <p>Loading products...</p>}

      {!loading && products.length === 0 && (
        <p>No products available</p>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {products.map((p) => {
          const outOfStock = (p.stock || 0) <= 0;
          const notOnline = !p.is_online;

          return (
            <div
              key={p._id}
              style={{
                border: "1px solid #ddd",
                padding: 12,
                borderRadius: 8,
                background: "#fafafa",
              }}
            >
              <b>{p.name}</b>

              <div>KES {p.price}</div>

              <div style={{ fontSize: 12, color: "#666" }}>
                Stock: {p.stock ?? 0}
              </div>

              {/* =========================
                  BUTTON LOGIC (FIXED)
              ========================= */}
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
                    marginTop: 8,
                    padding: "6px 10px",
                    background: "green",
                    color: "white",
                    border: "none",
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
