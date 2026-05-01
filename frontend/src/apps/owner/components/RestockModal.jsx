import { useState } from "react";
import API from "../../../api/client";

function RestockModal({ open, onClose, product, onSuccess }) {
  const [qty, setQty] = useState(0);
  const [buyingPrice, setBuyingPrice] = useState(product?.buying_price || 0);
  const [loading, setLoading] = useState(false);

  if (!open || !product) return null;

  const submit = async () => {
    if (qty <= 0) {
      return alert("Enter valid quantity");
    }

    try {
      setLoading(true);

      await API.post("/api/inventory/restock", {
        product_id: product._id,
        qty,
        buying_price: buyingPrice, // ✅ track capital
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
        <h3>📦 Restock Product</h3>

        <p><b>{product.name}</b></p>

        <input
          type="number"
          placeholder="Quantity"
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
        />

        <input
          type="number"
          placeholder="Buying Price (per unit)"
          value={buyingPrice}
          onChange={(e) => setBuyingPrice(Number(e.target.value))}
        />

        <div style={styles.actions}>
          <button onClick={onClose}>Cancel</button>

          <button onClick={submit} disabled={loading}>
            {loading ? "Saving..." : "Restock"}
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
    width: 400,
    background: "#fff",
    padding: 20,
    borderRadius: 10,
  },
  actions: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: 15,
  },
};

export default RestockModal;
