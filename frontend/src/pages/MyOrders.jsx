import { useEffect, useState } from "react";
import API from "../api/client";

export default function MyOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await API.get("/api/orders/me");
        setOrders(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        setError(err?.response?.data?.detail || "Could not load your orders");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const formatKES = (n) => "KES " + Number(n || 0).toLocaleString();
  const badge = (s) => {
    const colors = {
      pending: "#f59e0b", paid: "#16a34a", processing: "#2563eb",
      completed: "#065f46", cancelled: "#dc2626",
    };
    return (
      <span style={{ background: colors[s] || "#6b7280", color: "white", padding: "2px 8px", borderRadius: 4, fontSize: 11 }}>
        {s || "—"}
      </span>
    );
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h2>🧾 My Orders</h2>
      {loading && <p>Loading…</p>}
      {error && <p style={{ color: "#dc2626" }}>{error}</p>}
      {!loading && orders.length === 0 && (
        <p style={{ color: "#64748b" }}>You haven't placed any orders yet.</p>
      )}
      {orders.map((o) => (
        <div key={o._id} style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "white", padding: 14, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <b>{o.shop_slug || o.shop_name || o.shop_id}</b>{" "}
              {badge(o.status)}
              <div style={{ fontSize: 12, color: "#64748b" }}>
                {o.receipt_number || o._id} · {o.created_at}
              </div>
            </div>
            <b>{formatKES(o.total)}</b>
          </div>
          <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 13 }}>
            {(o.items || []).map((i, idx) => (
              <li key={idx}>
                {i.quantity || i.qty}× {i.name} — {formatKES(i.subtotal || (i.price * (i.quantity || i.qty)))}
              </li>
            ))}
          </ul>
          <a href={`/order/${o._id}`} style={{ fontSize: 13, color: "#0f766e" }}>
            Track this order →
          </a>
        </div>
      ))}
    </div>
  );
}
