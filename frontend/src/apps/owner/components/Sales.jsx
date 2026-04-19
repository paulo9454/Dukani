import { useEffect, useState } from "react";
import API from "../../../api/client";

function Sales() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // =========================
  // FORMAT CURRENCY (KES)
  // =========================
  const formatKES = (num) => {
    return "KES " + Number(num || 0).toLocaleString();
  };

  // =========================
  // LOAD SALES
  // =========================
  const loadSales = async () => {
    try {
      setLoading(true);

      const res = await API.get("/api/owner/sales");

      const d = res.data;

      const formatted = {
        total_revenue: d.revenue || 0,
        total_orders: d.orders || 0,
        total_shops: d.shops?.length || 0,
        avg_order_value: d.avg_order || 0,

        sales_by_shop: (d.shops || []).map((s) => ({
          name: s.shop_name || s.shop_id, // fallback
          revenue: s.revenue || 0,
          orders: s.orders || 0,
        })),

        recent_sales: (d.recent || []).map((r) => ({
          order_id: r._id,
          shop_name: r.shop_name || r.shop_id,
          amount: r.total || 0,
          date: r.created_at,
        })),
      };

      console.log("SALES DATA:", formatted); // 🔍 debug

      setData(formatted);
    } catch (err) {
      console.error("Sales error:", err);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSales();
  }, []);

  if (loading) return <h3>Loading sales...</h3>;
  if (!data) return <h3>❌ Failed to load sales data</h3>;

  return (
    <div>
      <h2>💰 Owner Sales Dashboard</h2>

      {/* =========================
          KPI CARDS
      ========================= */}
      <div style={{ display: "flex", gap: 15, marginBottom: 20 }}>
        <div style={card}>
          <h4>💰 Revenue</h4>
          <h2>{formatKES(data.total_revenue)}</h2>
        </div>

        <div style={card}>
          <h4>🧾 Orders</h4>
          <h2>{data.total_orders}</h2>
        </div>

        <div style={card}>
          <h4>🏪 Shops</h4>
          <h2>{data.total_shops}</h2>
        </div>

        <div style={card}>
          <h4>📈 Avg Order</h4>
          <h2>{formatKES(data.avg_order_value)}</h2>
        </div>
      </div>

      {/* =========================
          EMPTY STATE
      ========================= */}
      {data.total_orders === 0 && (
        <p>No sales yet. Start selling from POS to see data.</p>
      )}

      {/* =========================
          SALES BY SHOP
      ========================= */}
      <h3>🏪 Sales by Shop</h3>

      <table width="100%" border="1" cellPadding="8">
        <thead>
          <tr>
            <th>Shop</th>
            <th>Revenue</th>
            <th>Orders</th>
          </tr>
        </thead>

        <tbody>
          {data.sales_by_shop.length === 0 ? (
            <tr>
              <td colSpan="3">No shop data</td>
            </tr>
          ) : (
            data.sales_by_shop.map((shop, i) => (
              <tr key={i}>
                <td>{shop.name}</td>
                <td>{formatKES(shop.revenue)}</td>
                <td>{shop.orders}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* =========================
          RECENT SALES
      ========================= */}
      <h3 style={{ marginTop: 20 }}>📅 Recent Transactions</h3>

      {data.recent_sales.length === 0 ? (
        <p>No recent transactions</p>
      ) : (
        data.recent_sales.map((sale, i) => (
          <div key={i} style={saleCard}>
            <div><strong>Order:</strong> {sale.order_id}</div>
            <div><strong>Shop:</strong> {sale.shop_name}</div>
            <div><strong>Amount:</strong> {formatKES(sale.amount)}</div>
            <div><small>{sale.date}</small></div>
          </div>
        ))
      )}
    </div>
  );
}

// =========================
// STYLES
// =========================
const card = {
  flex: 1,
  padding: 15,
  borderRadius: 10,
  background: "#f1f5f9",
};

const saleCard = {
  padding: 10,
  border: "1px solid #ddd",
  marginBottom: 8,
  borderRadius: 8,
};

export default Sales;
