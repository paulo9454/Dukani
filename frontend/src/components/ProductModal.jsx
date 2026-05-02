import { useEffect, useState } from "react";
import API from "../api/client";
import DEFAULT_CATEGORIES from "../constants/categories";

function ProductModal({ open, onClose, shopId, onSuccess, product }) {
  const isEdit = !!product;

  const [form, setForm] = useState({
    name: "",
    category: "",
    category_id: "",

    // 💰 SELLING
    selling_price: 0,
    wholesale_price: 0,

    // 📦 BUYING MODEL
    buying_unit: "piece",
    buying_quantity: 1,
    buying_cost: 0,
    items_per_packet: 1,

    // AUTO
    cost_per_unit: 0,
    stock_quantity: 0,

    min_stock_level: 5,
  });
  
  

  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [image, setImage] = useState(null);

  // =========================
  // LOAD EDIT DATA
  // =========================
  useEffect(() => {
    if (product) {
      setForm({
        name: product.name || "",
        category: product.category || "",
        category_id: product.category_id || "",

        selling_price: Number(product.price || 0),
        wholesale_price: Number(product.wholesale_price || 0),

        buying_unit: "piece",
        buying_quantity: product.stock || 1,
        buying_cost: (product.buying_price || 0) * (product.stock || 1),
        items_per_packet: 1,

        cost_per_unit: Number(product.buying_price || 0),
        stock_quantity: Number(product.stock || 0),

        min_stock_level: Number(product.low_stock_threshold || 5),
      });
    } else {
      setForm({
        name: "",
        category: "",
        category_id: "",

        selling_price: 0,
        wholesale_price: 0,
        buying_unit: "piece",
        buying_quantity: 1,
        buying_cost: 0,
        items_per_packet: 1,

        cost_per_unit: 0,
        stock_quantity: 0,

        min_stock_level: 5,
      });
    }
  }, [product, open]);
  
  

  // =========================
  // AUTO CALCULATIONS
  // =========================
  useEffect(() => {
    const unitsPerBuy =
      form.buying_unit === "dozen"
        ? 12
        : form.buying_unit === "packet"
        ? form.items_per_packet || 1
        : 1;

    const totalUnits = form.buying_quantity * unitsPerBuy;

    const costPerUnit =
      totalUnits > 0 ? form.buying_cost / totalUnits : 0;

    setForm((prev) => ({
      ...prev,
      cost_per_unit: costPerUnit,
      stock_quantity: totalUnits,
    }));
  }, [
    form.buying_unit,
    form.buying_quantity,
    form.buying_cost,
    form.items_per_packet,
  ]);
  
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



  if (!open) return null;
  
  

  const update = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };
  
  
  // =========================
  // SUBMIT
  // =========================
  const submit = async () => {
    if (!form.name.trim()) {
      return alert("Product name required");
    }

    try {
      setLoading(true);

      const formData = new FormData();

formData.append("shop_id", shopId);
formData.append("name", form.name);
formData.append("category_id", form.category_id);
formData.append("category", form.category || "");

formData.append("price", Number(form.selling_price || 0));
formData.append("wholesale_price", Number(form.wholesale_price || 0));
formData.append("buying_price", Number(form.cost_per_unit || 0));

formData.append("stock", Number(form.stock_quantity || 0));
formData.append("low_stock_threshold", Number(form.min_stock_level || 5));

formData.append("unit_type", "piece");
formData.append("conversion_factor", 1);

// ✅ IMAGE
if (image) {
  formData.append("image", image);
}

      if (isEdit) {
        await API.put(`/api/products/${product._id}`, formData, {
  headers: { "Content-Type": "multipart/form-data" }
});
      } else {
        await API.post("/api/products", formData, {
  headers: { "Content-Type": "multipart/form-data" }
});
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to save product");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.backdrop}>
      <div style={styles.modal}>
        <h3>{isEdit ? "✏ Edit Product" : "➕ Add Product"}</h3>

        <div style={styles.grid}>
  {/* BASIC */}
  <input
    placeholder="Enter product name"
    value={form.name}
    onChange={(e) => update("name", e.target.value)}
  />

  <select
  value={form.category}
  onChange={(e) => update("category", e.target.value)}
  data-testid="product-category-select"
  style={{ width: "100%", padding: 8 }}
>
  <option value="">Select Category</option>
  {DEFAULT_CATEGORIES.map((c) => (
    <option key={c.value} value={c.value}>
      {c.label}
    </option>
  ))}
</select>
{/* IMAGE UPLOAD */}
<input
  type="file"
  accept="image/*"
  onChange={(e) => setImage(e.target.files[0])}
/>

{/* PREVIEW */}
{image && (
  <img
    src={URL.createObjectURL(image)}
    alt="preview"
    style={{
      width: "100%",
      height: 100,
      objectFit: "cover",
      borderRadius: 8
    }}
  />
)}
  {/* BUYING MODEL */}
  <select
    value={form.buying_unit}
    onChange={(e) => update("buying_unit", e.target.value)}
  >
    <option value="piece">Piece (buy single items)</option>
    <option value="packet">Packet (box, pack)</option>
    <option value="dozen">Dozen (12 items)</option>
  </select>

  <input
  type="number"
  placeholder="Quantity bought"
  value={form.buying_quantity || ""}
  onChange={(e) =>
    update("buying_quantity", Number(e.target.value))
  }
/>

<input
  type="number"
  placeholder="Total buying cost"
  value={form.buying_cost || ""}
  onChange={(e) =>
    update("buying_cost", Number(e.target.value))
  }
/>

{form.buying_unit === "packet" && (
  <input
    type="number"
    placeholder="Items per packet"
    value={form.items_per_packet || ""}
    onChange={(e) =>
      update("items_per_packet", Number(e.target.value))
    }
  />
)}

<input
  type="number"
  placeholder="Selling price per item"
  value={form.selling_price || ""}
  onChange={(e) =>
    update("selling_price", Number(e.target.value))
  }
/>

<input
  type="number"
  placeholder="Wholesale price (optional)"
  value={form.wholesale_price || ""}
  onChange={(e) =>
    update("wholesale_price", Number(e.target.value))
  }
/>

<input
  type="number"
  placeholder="Low stock alert level"
  value={form.min_stock_level || ""}
  onChange={(e) =>
    update("min_stock_level", Number(e.target.value))
  }
/>
</div>

        {/* AUTO CALCULATED DISPLAY */}
        <div style={{ marginTop: 15 }}>
          <div>
            📦 <b>Total Units:</b> {form.stock_quantity}
          </div>
          <div>
            💰 <b>Cost per Unit:</b> KES{" "}
            {form.cost_per_unit.toFixed(2)}
          </div>
        </div>

        {/* ACTIONS */}
        <div style={styles.actions}>
          <button onClick={onClose}>Cancel</button>

          <button onClick={submit} disabled={loading}>
            {loading ? "Saving..." : "Save Product"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  modal: {
    width: 520,
    background: "#fff",
    padding: 20,
    borderRadius: 10,
    maxHeight: "90vh",
    overflowY: "auto",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  actions: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: 20,
  },
};

export default ProductModal;
