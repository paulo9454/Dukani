import { useEffect, useState } from "react";
import API from "../../api/client";

function ProductsApp({ user }) {
  const [shopId, setShopId] = useState(user?.assigned_shop_ids?.[0] || "");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  // =========================
  // FORM STATE
  // =========================
  const [form, setForm] = useState({
    name: "",
    buying_price: 0,
    price: 0,
    wholesale_price: 0,
    stock: 0,
    unit_type: "piece",
    category: "uncategorized",
    barcode: "",
  });

  // =========================
  // LOAD PRODUCTS
  // =========================
  const load = async () => {
    if (!shopId) return;

    setLoading(true);
    try {
      const res = await API.get(`/api/products?shop_id=${shopId}`);
      setProducts(res.data || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [shopId]);

  // =========================
  // CREATE PRODUCT
  // =========================
  const createProduct = async () => {
    try {
      await API.post("/api/products", {
        shop_id: shopId,
        ...form,
      });

      alert("Product created");
      setForm({
        name: "",
        buying_price: 0,
        price: 0,
        wholesale_price: 0,
        stock: 0,
        unit_type: "piece",
        category: "uncategorized",
        barcode: "",
      });

      load();
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed");
    }
  };

  // =========================
  // UI
  // =========================
  return (
    <div style={{ padding: 16 }}>
      <h2>📦 Products</h2>

      {/* ===================== */}
      {/* CREATE PRODUCT FORM */}
      {/* ===================== */}
      <div style={{ background: "#fff", padding: 12, marginBottom: 16 }}>
        <h3>➕ Create Product</h3>

        <input
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />

        <input
          placeholder="Buying Price"
          type="number"
          onChange={(e) =>
            setForm({ ...form, buying_price: Number(e.target.value) })
          }
        />

        <input
          placeholder="Selling Price"
          type="number"
          onChange={(e) =>
            setForm({ ...form, price: Number(e.target.value) })
          }
        />

        <input
          placeholder="Wholesale Price"
          type="number"
          onChange={(e) =>
            setForm({ ...form, wholesale_price: Number(e.target.value) })
          }
        />

        <input
          placeholder="Stock"
          type="number"
          onChange={(e) =>
            setForm({ ...form, stock: Number(e.target.value) })
          }
        />

        <input
          placeholder="Category"
          onChange={(e) =>
            setForm({ ...form, category: e.target.value })
          }
        />

        <button onClick={createProduct}>Create</button>
      </div>

      {/* ===================== */}
      {/* PRODUCT LIST */}
      {/* ===================== */}
      {loading ? (
        <p>Loading...</p>
      ) : (
        products.map((p) => (
          <div
            key={p._id}
            style={{
              padding: 10,
              border: "1px solid #ddd",
              marginBottom: 8,
            }}
          >
            <b>{p.name}</b>
            <div>Stock: {p.stock}</div>
            <div>Buy: {p.buying_price} | Sell: {p.price}</div>
          </div>
        ))
      )}
    </div>
  );
}

export default ProductsApp;
