import { useEffect, useMemo, useState } from "react";
import API from "../api/client";
import { formatBaseStock } from "../utils/productTypes";

function RestockModal({ open, onClose, product, onSuccess }) {
  const [qty, setQty] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [variantName, setVariantName] = useState("");
  const [loading, setLoading] = useState(false);

  const type = product?.product_type || "standard";
  const variants = product?.variants || [];
  const selectedVariant = variants.find((v) => v.name === variantName);
  const factor = type === "unit_based" && ["kg", "litre", "l"].includes(product?.base_unit) ? 1000 : 1;
  const enteredQty = Number(qty);
  const cost = Number(totalCost);
  const valid = Number.isFinite(enteredQty) && enteredQty > 0 &&
    Number.isFinite(cost) && cost > 0 &&
    (type !== "variant" || Boolean(selectedVariant));
  const effectiveQty = enteredQty * factor;
  const buyingPrice = type === "unit_based"
    ? cost / (effectiveQty / 1000)
    : cost / effectiveQty;

  useEffect(() => {
    setQty("");
    setTotalCost("");
    setVariantName(product?.variants?.[0]?.name || "");
  }, [product?._id, open]);

  const stockLabel = useMemo(() => {
    if (!product) return "";
    if (type === "unit_based") return formatBaseStock(product.base_stock_quantity, product.base_unit);
    if (type === "variant") return variants.map((v) => `${v.name}: ${v.stock ?? 0}`).join(" · ");
    return String(product.stock ?? 0);
  }, [product, type, variants]);

  if (!open || !product) return null;

  const submit = async () => {
    if (!valid) return alert("Enter a quantity and total cost greater than zero.");
    const payload = {
      product_id: product._id,
      total_cost: cost,
      ...(type === "variant"
        ? { variant_name: variantName, qty: enteredQty, buying_price: buyingPrice }
        : type === "unit_based"
          ? { base_quantity: effectiveQty, buying_price: buyingPrice }
          : { qty: enteredQty, buying_price: buyingPrice }),
    };
    try {
      setLoading(true);
      await API.post("/api/inventory/restock", payload);
      await onSuccess?.();
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
        <h3>Restock: {product.name}</h3>
        <p style={styles.muted}>Current stock: {stockLabel}</p>

        {type === "variant" && (
          <label style={styles.field}>
            Variant
            <select value={variantName} onChange={(e) => setVariantName(e.target.value)}>
              {variants.map((v) => (
                <option key={v.name} value={v.name}>{v.name} — {v.stock ?? 0} in stock</option>
              ))}
            </select>
          </label>
        )}

        <label style={styles.field}>
          {type === "unit_based" ? `Quantity added (${product.base_unit})` : "Quantity bought"}
          <input type="number" min="0" step="any" value={qty}
            onChange={(e) => setQty(e.target.value)} placeholder="Enter quantity" />
        </label>

        <label style={styles.field}>
          Total purchase cost (KES)
          <input type="number" min="0" step="any" value={totalCost}
            onChange={(e) => setTotalCost(e.target.value)} placeholder="Enter total cost" />
        </label>

        {valid && (
          <div style={styles.calculation}>
            <div>Buying cost per {type === "unit_based" ? "kg / litre" : "unit"}: <b>KES {buyingPrice.toFixed(2)}</b></div>
            {type === "unit_based" && <small>Stock addition: {effectiveQty.toLocaleString()} {product.base_unit === "kg" ? "g" : product.base_unit === "litre" || product.base_unit === "l" ? "ml" : product.base_unit}</small>}
          </div>
        )}

        <div style={styles.actions}>
          <button onClick={onClose} disabled={loading}>Cancel</button>
          <button onClick={submit} disabled={loading || !valid}>
            {loading ? "Saving..." : "Save restock"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 999 },
  modal: { width: 440, maxWidth: "calc(100vw - 32px)", background: "#fff", padding: 20, borderRadius: 10, color: "#222", maxHeight: "90vh", overflowY: "auto" },
  muted: { color: "#666", fontSize: 13 },
  field: { display: "grid", gap: 6, marginTop: 14, fontSize: 14 },
  calculation: { marginTop: 14, padding: 12, background: "#f5f5f5", borderRadius: 8, display: "grid", gap: 5 },
  actions: { display: "flex", justifyContent: "space-between", marginTop: 20 },
};

export default RestockModal;
