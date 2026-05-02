import { useState } from "react";
import API from "../api/client";

/**
 * Simplified customer checkout — no account, no email.
 * Phone → M-Pesa (or Pay on pickup) → Done.
 */
export default function CheckoutModal({ open, onClose, slug, cart, onSuccess }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [method, setMethod] = useState("mpesa");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  if (!open) return null;

  const total = cart.reduce(
    (sum, c) => sum + Number(c.price || 0) * (c.qty || 0),
    0
  );
  const formatKES = (n) => "KES " + Number(n || 0).toLocaleString();

  const pay = async () => {
    const clean = (phone || "").replace(/\s|-/g, "");
    if (!clean) {
      setError("Please enter your phone number");
      return;
    }

    try {
      setError("");
      setLoading(true);

      const orderRes = await API.post("/api/orders/create", {
        shop_slug: slug,
        customer_info: { name: name || "Customer", phone: clean },
        items: cart.map((c) => ({ product_id: c._id, quantity: c.qty })),
      });
      const orderId = orderRes.data.order_id;
      const receiptNumber = orderRes.data.receipt_number;

      let payRes = null;
      if (method === "mpesa") {
        payRes = await API.post("/api/payments/mpesa/stk-push", {
          order_id: orderId,
          phone: clean,
        });
      }
      // method === "cash": nothing to call, owner fulfils on pickup.

      setResult({
        order_id: orderId,
        receipt_number: receiptNumber,
        method,
        phone: clean,
        total: orderRes.data.total,
        payment: payRes?.data,
        message:
          method === "mpesa"
            ? "Check your phone — approve the M-Pesa prompt to complete payment."
            : "Order placed. Pay on pickup.",
      });

      onSuccess?.(orderId);
    } catch (err) {
      setError(err?.response?.data?.detail || "Checkout failed");
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div style={backdrop}>
        <div style={modal}>
          <h2 style={{ marginTop: 0 }}>🎉 Order placed</h2>
          <p>
            <b>Receipt:</b>{" "}
            <code>{result.receipt_number || result.order_id.slice(0, 8)}</code>
          </p>
          <p>
            <b>Total:</b> {formatKES(result.total)}
          </p>
          <p>
            <b>Phone:</b> {result.phone}
          </p>
          <p style={{ color: "#16a34a" }}>{result.message}</p>
          <a
            href={`/track/${result.order_id}`}
            data-testid="checkout-track-link"
            style={{
              display: "inline-block",
              marginTop: 8,
              color: "#0f766e",
              fontSize: 13,
            }}
          >
            🔎 Track this order →
          </a>
          <button onClick={onClose} style={{ ...primaryBtn, marginTop: 12 }} data-testid="checkout-close">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={backdrop}>
      <div style={modal}>
        <h2 style={{ marginTop: 0 }}>Checkout</h2>
        <p style={{ color: "#64748b", marginTop: 0 }}>
          {cart.length} item{cart.length === 1 ? "" : "s"} · {formatKES(total)}
        </p>

        <input
          data-testid="co-phone"
          placeholder="Phone number (e.g. 254712345678)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={input}
          inputMode="tel"
        />
        <input
          data-testid="co-name"
          placeholder="Your name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ ...input, marginTop: 8 }}
        />

        <div style={{ marginTop: 12, fontWeight: 600 }}>Payment method</div>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          {[
            { v: "mpesa", l: "🟢 M-Pesa" },
            { v: "cash", l: "💵 Pay on pickup" },
          ].map((o) => (
            <button
              key={o.v}
              data-testid={`co-method-${o.v}`}
              onClick={() => setMethod(o.v)}
              style={methodBtn(method === o.v)}
            >
              {o.l}
            </button>
          ))}
        </div>

        {error && (
          <p data-testid="co-error" style={{ color: "#dc2626", fontSize: 13 }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={secondaryBtn} disabled={loading}>
            Cancel
          </button>
          <button
            data-testid="co-pay"
            onClick={pay}
            disabled={loading}
            style={{ ...primaryBtn, opacity: loading ? 0.7 : 1 }}
          >
            {loading
              ? "⏳ Processing…"
              : method === "cash"
              ? `Place order (${formatKES(total)})`
              : `Pay ${formatKES(total)}`}
          </button>
        </div>

        <div
          style={{
            marginTop: 14,
            display: "flex",
            gap: 10,
            justifyContent: "center",
            color: "#64748b",
            fontSize: 12,
            flexWrap: "wrap",
          }}
        >
          <span>🔒 Secure checkout · M-Pesa</span>
        </div>
      </div>
    </div>
  );
}

const backdrop = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
};
const modal = {
  width: 420,
  maxWidth: "92vw",
  background: "white",
  borderRadius: 14,
  padding: 24,
  boxShadow: "0 18px 40px rgba(0,0,0,0.25)",
  fontFamily: "system-ui, sans-serif",
};
const input = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  boxSizing: "border-box",
  marginTop: 8,
};
const methodBtn = (active) => ({
  flex: 1,
  padding: "10px",
  background: active ? "#16a34a" : "#f1f5f9",
  color: active ? "white" : "#0f172a",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
});
const primaryBtn = {
  flex: 1,
  padding: 12,
  background: "#16a34a",
  color: "white",
  border: "none",
  borderRadius: 8,
  fontWeight: 600,
  cursor: "pointer",
};
const secondaryBtn = {
  padding: "12px 16px",
  background: "#f1f5f9",
  color: "#0f172a",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
};
