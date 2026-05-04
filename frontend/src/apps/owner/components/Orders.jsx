import { useEffect, useState } from "react";
import API from "../../../api/client";

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const [oRes, sRes] = await Promise.all([
        API.get("/api/orders" + (filter ? `?status=${filter}` : "")),
        API.get("/api/orders/stats"),
      ]);
      setOrders(Array.isArray(oRes.data) ? oRes.data : []);
      setStats(sRes.data || null);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // auto-refresh every 15s for "real-time" feel
    return () => clearInterval(t);
  }, [filter]);

  const setStatus = async (orderId, status) => {
    try {
      await API.post(`/api/orders/${orderId}/status`, { status });
      await load();
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to update status");
    }
  };

  const confirmPayment = async (orderId) => {
    try {
      await API.post(`/api/orders/${orderId}/confirm-payment`);
      await load();
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to confirm payment");
    }
  };

  const rejectPayment = async (orderId) => {
    const reason = window.prompt(
      "Reject payment? Optional reason (e.g. 'No M-Pesa SMS received'):",
      "",
    );
    if (reason === null) return; // user cancelled
    try {
      await API.post(`/api/orders/${orderId}/reject-payment`, { reason });
      await load();
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to reject payment");
    }
  };

  const formatKES = (n) => "KES " + Number(n || 0).toLocaleString();

  const statusBadge = (s) => {
    const colors = {
      pending: "#f59e0b",
      paid: "#16a34a",
      processing: "#2563eb",
      completed: "#065f46",
      cancelled: "#dc2626",
    };
    return (
      <span
        style={{
          background: colors[s] || "#6b7280",
          color: "white",
          fontSize: 11,
          padding: "2px 8px",
          borderRadius: 4,
        }}
      >
        {s || "—"}
      </span>
    );
  };

  const paymentBadge = (s) => {
    const colors = {
      pending: "#f59e0b",
      pending_confirmation: "#7c3aed",
      success: "#16a34a",
      failed: "#dc2626",
    };
    const labels = {
      pending_confirmation: "awaiting confirm",
    };
    return (
      <span
        style={{
          background: colors[s] || "#6b7280",
          color: "white",
          fontSize: 11,
          padding: "2px 8px",
          borderRadius: 4,
          marginLeft: 6,
        }}
      >
        💳 {labels[s] || s || "—"}
      </span>
    );
  };

  return (
    <div data-testid="owner-orders">
      <h2 style={{ marginTop: 0 }}>🧾 Orders</h2>

      {/* KPIs */}
      {stats && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={kpiCard("#16a34a")}>
            <small>Today's revenue</small>
            <h3 style={{ margin: "4px 0 0" }}>{formatKES(stats.today_revenue)}</h3>
            <small style={{ opacity: 0.8 }}>{stats.today_orders} order{stats.today_orders === 1 ? "" : "s"}</small>
          </div>
          <div style={kpiCard("#f59e0b")}>
            <small>Pending</small>
            <h3 style={{ margin: "4px 0 0" }}>{stats.pending}</h3>
          </div>
          <div style={kpiCard("#2563eb")}>
            <small>Paid</small>
            <h3 style={{ margin: "4px 0 0" }}>{stats.paid}</h3>
          </div>
          <div style={kpiCard("#0f766e")}>
            <small>Processing</small>
            <h3 style={{ margin: "4px 0 0" }}>{stats.processing}</h3>
          </div>
          <div style={kpiCard("#065f46")}>
            <small>Completed</small>
            <h3 style={{ margin: "4px 0 0" }}>{stats.completed}</h3>
          </div>
          <div style={kpiCard("#dc2626")}>
            <small>Cancelled</small>
            <h3 style={{ margin: "4px 0 0" }}>{stats.cancelled}</h3>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 13, marginRight: 8 }}>Filter:</label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          data-testid="orders-filter"
          style={{ padding: 6 }}
        >
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading && <p>Loading orders…</p>}
      {error && <p style={{ color: "#dc2626" }}>{error}</p>}
      {!loading && orders.length === 0 && (
        <p style={{ color: "#64748b" }}>No orders yet.</p>
      )}

      {orders.map((o) => (
        <div
          key={o._id}
          data-testid={`order-card-${o._id}`}
          style={{
            border: "1px solid #e2e8f0",
            background: "white",
            borderRadius: 10,
            padding: 14,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <b>{o.shop_name || o.shop_id}</b>{" "}
              {statusBadge(o.status)}
              {paymentBadge(o.payment_status)}
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                {o._id} · {o.created_at}
              </div>
            </div>
            <div style={{ fontWeight: 700 }}>{formatKES(o.total)}</div>
          </div>

          <div style={{ fontSize: 13, marginTop: 8 }}>
            <b>Customer:</b>{" "}
            {o.customer_info?.name || "Guest"} ·{" "}
            {o.customer_info?.phone || o.customer_info?.email || "—"}{" "}
            <span
              style={{
                fontSize: 11,
                marginLeft: 6,
                padding: "1px 6px",
                borderRadius: 4,
                background: o.order_source === "online" ? "#ede9fe" : "#dcfce7",
                color: o.order_source === "online" ? "#6d28d9" : "#166534",
              }}
            >
              {o.order_source === "online" ? "ONLINE" : "POS"}
            </span>
          </div>

          <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 13 }}>
            {(o.items || []).map((i, idx) => (
              <li key={idx}>
                {i.quantity || i.qty}× {i.name} · {formatKES(i.price)} ={" "}
                {formatKES(i.subtotal || i.price * (i.quantity || i.qty))}
              </li>
            ))}
          </ul>

          {/* Status actions */}
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {o.payment_status === "pending_confirmation" && (
              <>
                <button
                  onClick={() => confirmPayment(o._id)}
                  style={actionBtn("#16a34a")}
                  data-testid={`order-${o._id}-confirm-payment`}
                  title="Mark this order as paid (M-Pesa received)"
                >
                  ✅ Confirm payment
                </button>
                <button
                  onClick={() => rejectPayment(o._id)}
                  style={actionBtn("#b91c1c")}
                  data-testid={`order-${o._id}-reject-payment`}
                  title="No payment received — mark as failed"
                >
                  ❌ Reject payment
                </button>
              </>
            )}
            {o.status === "paid" && (
              <button
                onClick={() => setStatus(o._id, "processing")}
                style={actionBtn("#2563eb")}
                data-testid={`order-${o._id}-processing`}
              >
                Mark Processing
              </button>
            )}
            {(o.status === "paid" || o.status === "processing") && (
              <button
                onClick={() => setStatus(o._id, "completed")}
                style={actionBtn("#065f46")}
                data-testid={`order-${o._id}-complete`}
              >
                Mark Completed
              </button>
            )}
            {o.status !== "cancelled" && o.status !== "completed" && (
              <button
                onClick={() => setStatus(o._id, "cancelled")}
                style={actionBtn("#dc2626")}
                data-testid={`order-${o._id}-cancel`}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const actionBtn = (bg) => ({
  padding: "6px 12px",
  background: bg,
  color: "white",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
});

const kpiCard = (bg) => ({
  flex: "1 0 140px",
  padding: 12,
  borderRadius: 10,
  background: bg,
  color: "white",
  boxShadow: "0 4px 10px rgba(0,0,0,0.05)",
});
