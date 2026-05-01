import { useState } from "react";
import API from "../api/client";

function RestockModal({ open, onClose, product, onSuccess }) {
  const [form, setForm] = useState({
    qty: 0,
    total_cost: 0,
    unit_type: product?.unit_type || "piece",
    conversion_factor: product?.conversion_factor || 1,
  });

  const [loading, setLoading] = useState(false);

  if (!open || !product) return null;

  const update = (k, v) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  };

  // =========================
  // 🧠 CALCULATIONS
  // =========================
  const totalUnits =
    form.qty * (form.conversion_factor || 1);

  const costPerUnit =
    totalUnits > 0 ? form.total_cost / totalUnits : 0;

  // =========================
  // SUBMIT
  // =========================
  const submit = async () => {
    if (form.qty <= 0) {
      return alert("Enter valid quantity");
    }

    try {
      setLoading(true);

      await API.post("/api/inventory/restock", {
        product_id: product._id,
        qty: totalUnits,
        buying_price: costPerUnit,
        total_cost: form.total_cost,
      });

      onSuccess?.();
      onClose();
    } catch (err) {
      alert(err?.response?.data?.detail || "Restock failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.backdrop}>
      <div style={styles.modal}>
        <h3>📦 Restock: {product.name}</h3>

        {/* =========================
            INPUTS
        ========================= */}
        <div style={styles.grid}>
          <input
            type="number"
            placeholder="Quantity Bought"
            value={form.qty}
            onChange={(e) =>
              update("qty", Number(e.target.value || 0))
            }
          />

          <input
            type="number"
            placeholder="Total Cost (KES)"
            value={form.total_cost}
            onChange={(e) =>
              update("total_cost", Number(e.target.value || 0))
            }
          />

          <select
            value={form.unit_type}
            onChange={(e) =>
              update("unit_type", e.target.value)
            }
          >
            <option value="piece">Piece</option>
            <option value="kg">Kg</option>
            <option value="dozen">Dozen</option>
            <option value="bundle">Bundle</option>
            <option value="pack">Pack</option>
          </select>

          <input
            type="number"
            placeholder="Units per pack (e.g. 12 for dozen)"
            value={form.conversion_factor}
            onChange={(e) =>
              update(
                "conversion_factor",
                Number(e.target.value || 1)
              )
            }
          />
        </div>

        {/* =========================
            CALCULATIONS DISPLAY
        ========================= */}
        <div style={{ marginTop: 15 }}>
          <p>Total Units: <b>{totalUnits}</b></p>
          <p>Cost per Unit: <b>KES {costPerUnit.toFixed(2)}</b></p>
        </div>

        {/* =========================
            ACTIONS
        ========================= */}
        <div style={styles.actions}>
          <button onClick={onClose}>Cancel</button>

          <button onClick={submit} disabled={loading}>
            {loading ? "Saving..." : "Save Restock"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  modal: {
    width: 420,
    background: "#fff",
    padding: 20,
    borderRadius: 10,
  },
  grid: {
    display: "grid",
    gap: 10,
  },
  actions: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: 20,
  },
};

export default RestockModal;
