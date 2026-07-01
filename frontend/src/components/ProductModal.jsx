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

    // 🆕 Product type model
    product_type: "standard",      // standard | unit_based | variant
    base_unit: "g",                // g | kg | ml | litre
    base_stock_quantity: 0,        // entered in base_unit, normalized server-side
    selling_units: [               // [{ label, quantity, price }]
      { label: "", quantity: 0, price: 0 },
    ],
    variants: [                    // [{ name, stock, price }]
      { name: "", stock: 0, buying_price: 0, price: 0 },
    ],
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

        product_type: product.product_type || "standard",
        base_unit: product.base_unit || "g",
        base_stock_quantity: Number(
          product.base_stock_quantity ?? 0,
        ),
        selling_units: (product.selling_units && product.selling_units.length)
          ? product.selling_units.map((u) => ({ label: u.label || "", quantity: Number(u.quantity || 0), price: Number(u.price || 0) }))
          : [{ label: "", quantity: 0, price: 0 }],
        variants: (product.variants && product.variants.length)
          ? product.variants.map((v) => ({ name: v.name || "", stock: Number(v.stock || 0), buying_price: Number(v.buying_price || product.buying_price || 0), price: Number(v.price || 0) }))
          : [{ name: "", stock: 0, buying_price: 0, price: 0 }],
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

formData.append("product_type", form.product_type || "standard");
if (form.product_type === "unit_based") {
  formData.append("base_unit", form.base_unit || "g");
  formData.append("base_stock_quantity", Number(form.base_stock_quantity || 0));
  formData.append(
    "selling_units",
    JSON.stringify(
      (form.selling_units || [])
        .filter((u) => u.label && Number(u.quantity) > 0 && Number(u.price) > 0)
        .map((u) => ({
          label: u.label,
          quantity: Number(u.quantity),
          price: Number(u.price),
        })),
    ),
  );
}
if (form.product_type === "variant") {
  formData.append(
    "variants",
    JSON.stringify(
      (form.variants || [])
        .filter((v) => v.name)
        .map((v) => ({
          name: v.name,
          stock: Number(v.stock || 0),
            buying_price: Number(v.buying_price || form.cost_per_unit || 0),
          price: Number(v.price || 0),
        })),
    ),
  );
}

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
{image ? (
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
) : product?.image ? (
  <img
    src={product.image?.startsWith("http") ? product.image : (product.image?.startsWith("/static/") ? "/api" + product.image : product.image)}
    alt="current"
    style={{
      width: "100%",
      height: 100,
      objectFit: "cover",
      borderRadius: 8,
      opacity: 0.9
    }}
  />
) : null}
  {/* PRODUCT TYPE SELECTOR */}
  <div style={{ gridColumn: "1 / -1" }}>
    <label style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>
      Product type
    </label>
    <select
      data-testid="product-type-select"
      value={form.product_type}
      onChange={(e) => update("product_type", e.target.value)}
      style={{ width: "100%", padding: 8 }}
    >
      <option value="standard">Standard (sold per item)</option>
      <option value="unit_based">Sold in units (sugar, oil, soap…)</option>
      <option value="variant">Has variants (sizes, types)</option>
    </select>
  </div>

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

{/* ── UNIT-BASED FIELDS ── */}
{form.product_type === "unit_based" && (
  <div style={{ gridColumn: "1 / -1", borderTop: "1px dashed #cbd5e1", paddingTop: 12 }}>
    <h4 style={{ margin: "0 0 8px" }}>⚖️ Bulk → small units</h4>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
      <select
        data-testid="base-unit-select"
        value={form.base_unit}
        onChange={(e) => update("base_unit", e.target.value)}
        style={{ padding: 8 }}
      >
        <option value="g">g (grams)</option>
        <option value="kg">kg (kilograms)</option>
        <option value="ml">ml (millilitres)</option>
        <option value="litre">litre</option>
      </select>
      <input
        data-testid="base-stock-quantity"
        type="number"
        placeholder={`Bulk stock in ${form.base_unit}`}
        value={form.base_stock_quantity || ""}
        onChange={(e) => update("base_stock_quantity", Number(e.target.value))}
      />
    </div>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
        Selling sizes / units
      </div>
      {(form.selling_units || []).map((u, i) => (
        <div
          key={i}
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            padding: 10,
            marginBottom: 10,
            background: "#f8fafc",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            Selling unit #{i + 1}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 700 }}>
              Label
              <input
                placeholder="e.g. 500g"
                value={u.label}
                onChange={(e) => {
                  const next = [...form.selling_units];
                  next[i] = { ...next[i], label: e.target.value };
                  update("selling_units", next);
                }}
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>

            <label style={{ fontSize: 12, fontWeight: 700 }}>
              Quantity in {form.base_unit}
              <input
                type="number"
                placeholder="e.g. 500"
                value={u.quantity || ""}
                onChange={(e) => {
                  const next = [...form.selling_units];
                  next[i] = { ...next[i], quantity: Number(e.target.value) };
                  update("selling_units", next);
                }}
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>

            <label style={{ fontSize: 12, fontWeight: 700 }}>
              Selling price
              <input
                type="number"
                placeholder="e.g. 100"
                value={u.price || ""}
                onChange={(e) => {
                  const next = [...form.selling_units];
                  next[i] = { ...next[i], price: Number(e.target.value) };
                  update("selling_units", next);
                }}
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() => update("selling_units", form.selling_units.filter((_, j) => j !== i))}
            style={{
              marginTop: 8,
              background: "#fee2e2",
              color: "#991b1b",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              padding: "6px 10px",
              fontWeight: 700,
            }}
          >
            Remove selling unit
          </button>
        </div>
      ))}
    <button
      type="button"
      data-testid="add-selling-unit"
      onClick={() =>
        update("selling_units", [
          ...(form.selling_units || []),
          { label: "", quantity: 0, price: 0 },
        ])
      }
      style={{ background: "#0f766e", color: "#fff", border: "none", borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontWeight: 700 }}
    >
      ➕ Add selling unit
    </button>
  </div>
)}

{/* ── VARIANT FIELDS ── */}
{form.product_type === "variant" && (
  <div style={{ gridColumn: "1 / -1", borderTop: "1px dashed #cbd5e1", paddingTop: 12 }}>
    <h4 style={{ margin: "0 0 8px" }}>👕 Variants (sizes / types)</h4>
    {(form.variants || []).map((v, i) => (
      <div
        key={i}
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 32px", gap: 6, marginBottom: 6 }}
      >
        <input
          placeholder="Variant (e.g. Medium)"
          value={v.name}
          onChange={(e) => {
            const next = [...form.variants];
            next[i] = { ...next[i], name: e.target.value };
            update("variants", next);
          }}
        />
        <input
          type="number"
          placeholder="Stock"
          value={v.stock || ""}
          onChange={(e) => {
            const next = [...form.variants];
            next[i] = { ...next[i], stock: Number(e.target.value) };
            update("variants", next);
          }}
        />
          <input
            type="number"
            placeholder="Buying Price"
            value={v.buying_price || ""}
            onChange={(e) => {
              const next = [...form.variants];
              next[i] = { ...next[i], buying_price: Number(e.target.value) };
              update("variants", next);
            }}
          />
        <input
          type="number"
          placeholder="Selling Price"
          value={v.price || ""}
          onChange={(e) => {
            const next = [...form.variants];
            next[i] = { ...next[i], price: Number(e.target.value) };
            update("variants", next);
          }}
        />
        <button
          type="button"
          onClick={() => update("variants", form.variants.filter((_, j) => j !== i))}
          style={{ background: "#fee2e2", border: "none", borderRadius: 6, cursor: "pointer" }}
        >
          ✕
        </button>
      </div>
    ))}
    <button
      type="button"
      data-testid="add-variant"
      onClick={() =>
        update("variants", [
          ...(form.variants || []),
          { name: "", stock: 0, buying_price: 0, price: 0 },
        ])
      }
      style={{ background: "#0f766e", color: "#fff", border: "none", borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontWeight: 700 }}
    >
      ➕ Add variant
    </button>
  </div>
)}
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
