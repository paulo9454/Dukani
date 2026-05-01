import { useEffect, useState } from "react";
import {
  getProducts,
  createProduct,
  restockProduct,
  updateProduct,
} from "../../api/products";

import ProductModal from "../../components/ProductModal";

function ProductsPage({ shopId }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);

  const [restock, setRestock] = useState({
    product_id: "",
    qty: 0,
  });

  // =========================
  // LOAD PRODUCTS
  // =========================
  const load = async () => {
    if (!shopId) return;

    try {
      setLoading(true);
      const data = await getProducts({ shop_id: shopId });
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Product load error:", err);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [shopId]);

  // =========================
  // CREATE PRODUCT (via modal)
  // =========================
  const handleCreate = async (data) => {
    await createProduct({
      shop_id: shopId,
      ...data,
    });

    setShowModal(false);
    setEditProduct(null);
    load();
  };

  // =========================
  // UPDATE PRODUCT
  // =========================
  const handleUpdate = async (data) => {
    await updateProduct(data._id, data);
    setShowModal(false);
    setEditProduct(null);
    load();
  };

  // =========================
  // RESTOCK (SAFE)
  // =========================
  const handleRestock = async () => {
    if (!restock.product_id || restock.qty <= 0) return;

    await restockProduct(restock);

    setRestock({ product_id: "", qty: 0 });
    load();
  };

  // =========================
  // QUICK STOCK ADD
  // =========================
  const quickAddStock = async (productId, qty = 1) => {
    await restockProduct({
      product_id: productId,
      qty,
    });

    load();
  };

  // =========================
  // PROFIT CALC (SAFE)
  // =========================
  const getProfit = (p) => {
    const buy = Number(p?.buying_price ?? 0);
    const sell = Number(p?.price ?? 0);
    return sell - buy;
  };

  // =========================
  // GUARD
  // =========================
  if (!shopId) {
    return <div style={{ padding: 20 }}>No shop selected</div>;
  }

  return (
    <div style={{ padding: 20 }}>

      <h2>📦 Inventory Management</h2>

      {/* =========================
          CREATE BUTTON ONLY
      ========================= */}
      <button
        onClick={() => {
          setEditProduct(null);
          setShowModal(true);
        }}
        style={{
          marginBottom: 15,
          padding: 10,
          background: "green",
          color: "white",
          border: "none",
          borderRadius: 6,
        }}
      >
        ➕ Add Product
      </button>

      {/* =========================
          RESTOCK
      ========================= */}
      <div style={{ padding: 10, border: "1px solid #ddd", marginBottom: 20 }}>
        <h3>📦 Restock Product</h3>

        <select
          value={restock.product_id}
          onChange={(e) =>
            setRestock({ ...restock, product_id: e.target.value })
          }
        >
          <option value="">Select Product</option>
          {products.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>

        <input
          placeholder="Qty Added"
          type="number"
          value={restock.qty}
          onChange={(e) =>
            setRestock({ ...restock, qty: Number(e.target.value) })
          }
        />

        <button onClick={handleRestock}>Restock</button>
      </div>

      {/* =========================
          PRODUCT LIST
      ========================= */}
      <h3>📋 Products</h3>

      {loading && <p>Loading...</p>}

      {products.map((p) => (
        <div
          key={p._id}
          style={{
            border: "1px solid #eee",
            padding: 10,
            marginBottom: 10,
          }}
        >
          <b>{p.name}</b>

          <div>
            Category: {p.category} | Stock: {p.stock} | Unit: {p.unit_type}
          </div>

          <div>
            Buy: {p.buying_price} | Sell: {p.price} | Wholesale: {p.wholesale_price}
          </div>

          <div style={{ color: "green", fontWeight: "bold" }}>
            Profit per unit: KES {getProfit(p)}
          </div>

          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button
              onClick={() => {
                setEditProduct(p);
                setShowModal(true);
              }}
            >
              ✏ Edit
            </button>

            <button onClick={() => quickAddStock(p._id, 1)}>
              ➕ Stock +1
            </button>

            <button onClick={() => quickAddStock(p._id, 10)}>
              ➕ Stock +10
            </button>
          </div>
        </div>
      ))}

      {/* =========================
          PRODUCT MODAL
      ========================= */}
      {showModal && (
        <ProductModal
  product={editProduct}
  categories={categories}
  onClose={() => {
    setShowModal(false);
    setEditProduct(null);
  }}
  onSave={editProduct ? handleUpdate : handleCreate}
/>
      )}
    </div>
  );
}

export default ProductsPage;
