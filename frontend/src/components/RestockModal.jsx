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

  const update = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // The API stores stock in the product's smallest selling unit.
  // Keep the existing conversion and weighted-cost calculation unchanged.
  const purchaseQty = Number(form.qty) || 0;
  const unitsPerPurchase = Number(form.conversion_factor) || 0;
  const totalUnits = purchaseQty * unitsPerPurchase;
  const totalCost = Number(form.total_cost) || 0;
  const costPerUnit = totalUnits > 0 ? totalCost / totalUnits : 0;
  const currentStock = Number(product.stock) || 0;
  const newStock = currentStock + totalUnits;
  const stockUnit = product.unit || product.stock_unit || "unit(s)";

  const submit = async () => {
    if (purchaseQty <= 0) {
      return alert("Enter how many purchase units you bought.");
    }
    if (unitsPerPurchase <= 0) {
      return alert("Enter how many stock units are in each purchase unit.");
    }
    if (totalCost < 0) {
      return alert("Total cost cannot be negative.");
    }

    try {
      setLoading(true);
      await API.post("/api/inventory/restock", {
        product_id: product._id,
        qty: totalUnits,
        buying_price: costPerUnit,
        total_cost: totalCost,
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      alert(err?.response?.data?.detail || "Restock failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.backdrop}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <div>
            <h3 style={styles.title}>📦 Restock: {product.name}</h3>
            <p style={styles.subtitle}>
              Enter what you purchased. Dukayko will calculate how much stock to add.
            </p>
          </div>
          <button type="button" onClick={onClose} style={styles.closeButton} aria-label="Close">
            ×
          </button>
        </div>

        <div style={styles.stockSummary}>
          <span>Current stock</span>
          <strong>{currentStock} {stockUnit}</strong>
        </div>

        <div style={styles.field}>
          <label style={styles.label} htmlFor="restock-qty">1. How many did you buy?</label>
          <input
            id="restock-qty"
            style={styles.input}
            type="number"
            min="0"
            step="any"
            placeholder="e.g. 2"
            value={form.qty}
            onChange={(e) => update("qty", Number(e.target.value || 0))}
          />
          <small style={styles.help}>Example: enter 2 if you bought two packets, bags or cartons.</small>
        </div>

        <div style={styles.field}>
          <label style={styles.label} htmlFor="restock-unit">2. What did you buy?</label>
          <select
            id="restock-unit"
            style={styles.input}
            value={form.unit_type}
            onChange={(e) => update("unit_type", e.target.value)}
          >
            <option value="piece">Piece</option>
            <option value="kg">Kilogram (kg)</option>
            <option value="dozen">Dozen</option>
            <option value="bundle">Bundle</option>
            <option value="pack">Pack / packet</option>
          </select>
          <small style={styles.help}>Choose the way your supplier sells this item.</small>
        </div>

        <div style={styles.field}>
          <label style={styles.label} htmlFor="restock-conversion">
            3. How many {stockUnit} are in each {form.unit_type}?
          </label>
          <input
            id="restock-conversion"
            style={styles.input}
            type="number"
            min="0"
            step="any"
            placeholder="e.g. 12"
            value={form.conversion_factor}
            onChange={(e) => update("conversion_factor", Number(e.target.value || 0))}
          />
          <small style={styles.help}>
            If you buy single items, enter 1. If one carton contains 12 pieces, enter 12.
          </small>
        </div>

        <div style={styles.field}>
          <label style={styles.label} htmlFor="restock-cost">4. How much did you pay in total? (KES)</label>
          <input
            id="restock-cost"
            style={styles.input}
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 480"
            value={form.total_cost}
            onChange={(e) => update("total_cost", Number(e.target.value || 0))}
          />
          <small style={styles.help}>Enter the full amount paid to the supplier for this purchase.</small>
        </div>

        <div style={styles.calculation}>
          <h4 style={styles.calculationTitle}>Stock update preview</h4>
          <div style={styles.calcRow}>
            <span>Purchase quantity</span>
            <strong>{purchaseQty} {form.unit_type}</strong>
          </div>
          <div style={styles.calcRow}>
            <span>Stock units to add</span>
            <strong>{totalUnits.toLocaleString()} {stockUnit}</strong>
          </div>
          <div style={styles.calcRow}>
            <span>Cost per stock unit</span>
            <strong>KES {costPerUnit.toFixed(2)}</strong>
          </div>
          <div style={styles.calcTotal}>
            <span>New stock after saving</span>
            <strong>{newStock.toLocaleString()} {stockUnit}</strong>
          </div>
          <p style={styles.example}>
            Calculation: {purchaseQty} × {unitsPerPurchase} = {totalUnits} {stockUnit}
          </p>
        </div>

        <div style={styles.actions}>
          <button type="button" onClick={onClose} style={styles.cancelButton} disabled={loading}>
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            style={styles.saveButton}
            disabled={loading || purchaseQty <= 0 || unitsPerPurchase <= 0 || totalCost < 0}
          >
            {loading ? "Saving..." : `Confirm and add ${totalUnits.toLocaleString()} to stock`}
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
    background: "rgba(15, 23, 42, 0.58)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    zIndex: 999,
    overflowY: "auto",
  },
  modal: {
    width: "100%",
    maxWidth: 540,
    maxHeight: "92vh",
    overflowY: "auto",
    background: "#fff",
    padding: 22,
    borderRadius: 16,
    boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },
  title: { margin: 0, color: "#111827", fontSize: 20 },
  subtitle: { margin: "7px 0 0", color: "#64748b", lineHeight: 1.45, fontSize: 13 },
  closeButton: {
    border: 0,
    background: "#f1f5f9",
    borderRadius: 8,
    width: 34,
    height: 34,
    fontSize: 24,
    cursor: "pointer",
    color: "#334155",
    flexShrink: 0,
  },
  stockSummary: {
    display: "flex",
    justifyContent: "space-between",
    padding: "12px 14px",
    borderRadius: 10,
    background: "#eff6ff",
    color: "#1e40af",
    marginBottom: 18,
  },
  field: { display: "grid", gap: 6, marginBottom: 15 },
  label: { fontWeight: 700, color: "#1f2937", fontSize: 14 },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 13px",
    border: "1px solid #cbd5e1",
    borderRadius: 9,
    fontSize: 15,
    background: "#fff",
    color: "#111827",
  },
  help: { color: "#64748b", fontSize: 12, lineHeight: 1.4 },
  calculation: {
    marginTop: 8,
    padding: 15,
    background: "#f8fafc",
    border: "1px solid #dbeafe",
    borderRadius: 12,
  },
  calculationTitle: { margin: "0 0 10px", color: "#1e3a8a", fontSize: 15 },
  calcRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "5px 0",
    color: "#475569",
    fontSize: 13,
  },
  calcTotal: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    borderTop: "1px solid #cbd5e1",
    marginTop: 8,
    paddingTop: 12,
    color: "#166534",
    fontSize: 15,
    fontWeight: 700,
  },
  example: { margin: "10px 0 0", color: "#64748b", fontSize: 12 },
  actions: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 20,
  },
  cancelButton: {
    padding: "11px 16px",
    border: "1px solid #cbd5e1",
    borderRadius: 9,
    background: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  },
  saveButton: {
    flex: 1,
    padding: "11px 14px",
    border: 0,
    borderRadius: 9,
    background: "#16a34a",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
  },
};

export default RestockModal;
