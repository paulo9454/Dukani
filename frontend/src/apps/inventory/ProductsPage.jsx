import { useEffect, useState } from "react";
import { getProducts } from "../../api/products";

import ProductModal from "../../components/ProductModal";
import RestockModal from "../../components/RestockModal";
import ProductImage from "../../components/ProductImage";
import API from "../../api/client";
import DEFAULT_CATEGORIES, { categoryLabel } from "../../constants/categories";

function ProductsPage({ shopId }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);

  const [restockProductItem, setRestockProductItem] = useState(null);
  const [categories, setCategories] = useState([]);

  // =========================
  // LOAD PRODUCTS
  // =========================
  const load = async () => {
    setLoading(true);
    try {
      const data = await getProducts({ shop_id: shopId });
      setProducts(data || []);
    } catch (err) {
      console.error("Failed to load products", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (shopId) load();
  }, [shopId]);
  
  useEffect(() => {
  if (!shopId) return;

  const loadCategories = async () => {
    try {
      const res = await API.get(`/api/categories?shop_id=${shopId}`);
      setCategories(res.data || []);
    } catch (err) {
      console.error("Failed to load categories", err);
      setCategories([]);
    }
  };

  loadCategories();
}, [shopId]);

  // =========================
  // PROFIT CALC
  // =========================
  
  const getCategoryName = (category_id) => {
  const cat = categories.find((c) => c._id === category_id);
  return cat ? `${cat.icon} ${cat.name}` : "Uncategorized";
};
  const getProfit = (p) => {
    const buy = Number(p.buying_price || 0);
    const sell = Number(p.price || 0);
    return (sell - buy).toFixed(2);
  };

  return (
    <div style={{ padding: 20 }}>

      {/* =========================
          HEADER
      ========================= */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>📦 Products</h2>

        <button
          onClick={() => {
            setEditProduct(null);
            setShowModal(true);
          }}
          style={{
            background: "#2563eb",
            color: "#fff",
            padding: "10px 15px",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          ➕ Add Product
        </button>
      </div>

      {/* =========================
          FILTER BY CATEGORY
      ========================= */}
      <div style={{ margin: "12px 0" }}>
        <label style={{ fontSize: 13, marginRight: 8 }}>Filter by category:</label>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          data-testid="products-category-filter"
          style={{ padding: 6 }}
        >
          <option value="">All categories</option>
          {DEFAULT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* =========================
          LIST
      ========================= */}
      {loading && <p>Loading...</p>}

      {!loading && products.length === 0 && (
        <p>No products yet</p>
      )}

      {products
        .filter((p) => !categoryFilter || p.category === categoryFilter)
        .map((p) => (
        <div
          key={p._id}
          className="dk-card"
          data-testid={`inventory-product-${p._id}`}
          style={{
            border: "1px solid #e2e8f0",
            padding: 12,
            marginTop: 10,
            borderRadius: 10,
            background: "#fff",
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
            boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
          }}
        >
          <div style={{ flexShrink: 0, width: 84 }}>
            <ProductImage product={p} alt={p.name} height={84} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ color: "#0f172a" }}>{p.name}</b>

            <div style={{ fontSize: 13, color: "#334155", marginTop: 2 }}>
              📂 {categoryLabel(p.category) || getCategoryName(p.category_id) || "Uncategorized"} | 📦 {p.stock} | 🧾 {p.unit_type}
            </div>

            <div style={{ marginTop: 4, color: "#0f172a" }}>
              💰 Buy: {p.buying_price} | Sell: {p.price}
              {p.wholesale_price ? ` | Wholesale: ${p.wholesale_price}` : ""}
            </div>

            <div style={{ color: "#15803d", fontWeight: 700 }}>
              Profit: KES {getProfit(p)}
            </div>

            {/* =========================
                ACTIONS
            ========================= */}
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                data-testid={`inventory-edit-${p._id}`}
                onClick={() => {
                  setEditProduct(p);
                  setShowModal(true);
                }}
              >
                ✏ Edit
              </button>

              <button
                data-testid={`inventory-restock-${p._id}`}
                onClick={() => setRestockProductItem(p)}
              >
                📦 Restock
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* =========================
          PRODUCT MODAL
      ========================= */}
      {showModal && (
        <ProductModal
          open={showModal}
          product={editProduct}
          shopId={shopId}
          onClose={() => {
            setShowModal(false);
            setEditProduct(null);
          }}
          onSuccess={load}
        />
      )}

      {/* =========================
          RESTOCK MODAL
      ========================= */}
      {restockProductItem && (
        <RestockModal
          open={true}
          product={restockProductItem}
          onClose={() => setRestockProductItem(null)}
          onSuccess={load}
        />
      )}
    </div>
  );
}

export default ProductsPage;
