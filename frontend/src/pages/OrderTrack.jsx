import { useState } from "react";
import API from "../api/client";

export default function OrderTrack({ orderId }) {
  const [contact, setContact] = useState("");
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const lookup = async () => {
    if (!contact) return setError("Enter the email or phone you used at checkout");
    try {
      setError("");
      setLoading(true);
      const res = await API.get(`/api/orders/track/${orderId}?contact=${encodeURIComponent(contact)}`);
      setOrder(res.data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Order not found");
      setOrder(null);
    } finally {
      setLoading(false);
    }
  };

  const formatKES = (n) => "KES " + Number(n || 0).toLocaleString();
  const badge = (s) => {
    const colors = {
      pending: "#f59e0b", paid: "#16a34a", processing: "#2563eb",
      completed: "#065f46", cancelled: "#dc2626",
    };
    return (
      <span style={{ background: colors[s] || "#6b7280", color: "white", padding: "2px 10px", borderRadius: 6, fontSize: 12 }}>
        {s || "—"}
      </span>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", background: "white", padding: 24, borderRadius: 12, boxShadow: "0 4px 14px rgba(0,0,0,0.05)" }}>
        <a href="/" style={{ textDecoration: "none", color: "#0f766e" }}>← Home</a>
        <h2 style={{ marginTop: 12 }}>🔎 Track your order</h2>
        <p style={{ color: "#64748b", fontSize: 13 }}>Order ID: <code>{orderId}</code></p>

        {!order && (
          <>
            <input
              data-testid="track-contact"
              placeholder="Email or phone you used at checkout"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #cbd5e1", boxSizing: "border-box", marginTop: 10 }}
              onKeyDown={(e) => e.key === "Enter" && lookup()}
            />
            {error && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}
            <button
              data-testid="track-lookup"
              onClick={lookup}
              disabled={loading}
              style={{ marginTop: 10, padding: 12, width: "100%", background: "#16a34a", color: "white", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}
            >
              {loading ? "Looking up…" : "Track order"}
            </button>
          </>
        )}

        {order && (
          <div style={{ marginTop: 12 }}>
            <p>
              Status: {badge(order.status)} · Payment: {badge(order.payment_status)}
            </p>
            <p style={{ color: "#64748b", fontSize: 13 }}>{order.created_at}</p>
            <ul style={{ paddingLeft: 18 }}>
              {(order.items || []).map((i, idx) => (
                <li key={idx}>
                  {i.quantity || i.qty}× {i.name} — {formatKES(i.subtotal || (i.price * (i.quantity || i.qty)))}
                </li>
              ))}
            </ul>
            <p style={{ fontWeight: 700, fontSize: 18, marginTop: 8 }}>Total: {formatKES(order.total)}</p>
            {order.shop_slug && (
              <a href={`/shop/${order.shop_slug}`} style={{ color: "#0f766e" }}>
                ← Back to {order.shop_slug}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
