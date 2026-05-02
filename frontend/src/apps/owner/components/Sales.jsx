import { useEffect, useState } from "react";
import API from "../../../api/client";

function Sales() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const formatKES = (num) => "KES " + Number(num || 0).toLocaleString();

  const loadSales = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await API.get("/api/owner/sales");
      setData(res.data);
    } catch (err) {
      console.error("Sales error:", err);
      setError("Failed to load sales data");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSales();
  }, []);

  if (loading) return <h3 data-testid="sales-loading">Loading sales...</h3>;
  if (!data)
    return (
      <div>
        <h3>💰 Sales</h3>
        <p data-testid="sales-error" style={{ color: "#991b1b" }}>
          {error || "No data"}
        </p>
      </div>
    );

  const planBadge = (plan) => {
    const colors = {
      pos_online: "#16a34a",
      online: "#7c3aed",
      pos: "#2563eb",
      trial_pos: "#f59e0b",
      legacy: "#6b7280",
    };
    return (
      <span
        style={{
          background: colors[plan] || "#6b7280",
          color: "white",
          fontSize: 11,
          padding: "2px 8px",
          borderRadius: 4,
          marginLeft: 6,
        }}
      >
        {plan}
      </span>
    );
  };

  return (
    <div data-testid="owner-sales">
      <h2>💰 Owner Sales Dashboard</h2>
      <p style={{ color: "#555", marginTop: 0 }}>
        Revenue split into <b>Physical shop POS</b> and <b>Online store</b>
        &nbsp;(online sales only count for shops on the <code>pos_online</code> plan).
      </p>

      {/* ========== TOP KPI ========== */}
      <div style={{ display: "flex", gap: 15, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={card("#1e88e5")} data-testid="kpi-total-revenue">
          <h4>💰 Total Revenue</h4>
          <h2>{formatKES(data.revenue)}</h2>
        </div>
        <div style={card("#16a34a")} data-testid="kpi-pos-revenue">
          <h4>🧾 Physical POS</h4>
          <h2>{formatKES(data.pos_revenue)}</h2>
        </div>
        <div style={card("#7c3aed")} data-testid="kpi-online-revenue">
          <h4>🌐 Online Store</h4>
          <h2>{formatKES(data.online_revenue)}</h2>
        </div>
        <div style={card("#fb8c00")} data-testid="kpi-profit">
          <h4>📈 Profit</h4>
          <h2>{formatKES(data.profit)}</h2>
        </div>
        <div style={card("#334155")} data-testid="kpi-orders">
          <h4>🧾 Orders</h4>
          <h2>{data.orders}</h2>
        </div>
        <div style={card("#8e24aa")} data-testid="kpi-avg-order">
          <h4>📊 Avg Order</h4>
          <h2>{formatKES(data.avg_order)}</h2>
        </div>
      </div>

      {data.orders === 0 && (
        <p style={{ color: "#555" }}>
          No sales yet. Run a POS checkout or receive an online order (on a <code>pos_online</code> shop) to see data.
        </p>
      )}

      {/* ========== PER SHOP ========== */}
      <h3>🏪 Sales by Shop</h3>
      <div style={{ overflowX: "auto" }}>
        <table
          width="100%"
          border="1"
          cellPadding="8"
          style={{ borderCollapse: "collapse", background: "#fff" }}
        >
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              <th align="left">Shop</th>
              <th align="left">Plan</th>
              <th align="right">POS Revenue</th>
              <th align="right">Online Revenue</th>
              <th align="right">Total</th>
              <th align="right">Orders</th>
            </tr>
          </thead>
          <tbody>
            {data.shops.length === 0 ? (
              <tr>
                <td colSpan="6">No shops yet</td>
              </tr>
            ) : (
              data.shops.map((s) => (
                <tr key={s.shop_id} data-testid={`shop-row-${s.shop_id}`}>
                  <td>{s.shop_name}</td>
                  <td>{planBadge(s.plan)}</td>
                  <td align="right">{formatKES(s.pos_revenue)}</td>
                  <td align="right">
                    {["pos_online", "online", "enterprise"].includes(s.plan)
                      ? formatKES(s.online_revenue)
                      : <span style={{ color: "#999" }}>— not subscribed</span>}
                  </td>
                  <td align="right">
                    <b>{formatKES(s.revenue)}</b>
                  </td>
                  <td align="right">{s.orders}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ========== RECENT ========== */}
      <h3 style={{ marginTop: 24 }}>📅 Recent Transactions</h3>
      {data.recent.length === 0 ? (
        <p>No recent transactions</p>
      ) : (
        data.recent.map((sale) => (
          <div key={sale._id} style={saleCard}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <strong>{sale.shop_name}</strong>
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 4,
                    color: "white",
                    background: sale.source === "online" ? "#7c3aed" : "#16a34a",
                  }}
                >
                  {sale.source === "online" ? "ONLINE" : "POS"}
                </span>
                {sale.payment_method && (
                  <span style={{ marginLeft: 6, fontSize: 12, color: "#555" }}>
                    · {sale.payment_method}
                  </span>
                )}
              </div>
              <b>{formatKES(sale.total)}</b>
            </div>
            <div style={{ fontSize: 12, color: "#777", marginTop: 2 }}>
              {sale._id} · {sale.created_at}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

const card = (bg) => ({
  flex: "1 0 180px",
  padding: 15,
  borderRadius: 10,
  background: bg,
  color: "white",
  boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
});

const saleCard = {
  padding: 10,
  border: "1px solid #e5e7eb",
  marginBottom: 8,
  borderRadius: 8,
  background: "#fff",
};

export default Sales;
