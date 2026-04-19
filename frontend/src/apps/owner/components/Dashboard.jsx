import { useEffect, useState } from "react";
import API from "../../../api/client";

function Dashboard() {
  const [stats, setStats] = useState({
    shops: 0,
    shopkeepers: 0,
    assignments: 0,
    revenue: 0,
  });

  const [loading, setLoading] = useState(true);

  // =========================
  // LOAD STATS
  // =========================
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);

        const [shopsRes, usersRes] = await Promise.all([
          API.get("/api/dashboard/shops"),
          API.get("/api/owner/shopkeepers"),
        ]);

        const shops = shopsRes.data || [];
        const users = usersRes.data || [];

        // calculate assignments locally
        let assignments = 0;

        users.forEach((u) => {
          if (Array.isArray(u.assigned_shop_ids)) {
            assignments += u.assigned_shop_ids.length;
          }
        });

        setStats({
          shops: shops.length,
          shopkeepers: users.length,
          assignments,
          revenue: 0, // later from backend
        });
      } catch (err) {
        console.error("Dashboard error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  // =========================
  // CARD UI
  // =========================
  const Card = ({ title, value, color }) => (
    <div
      style={{
        flex: 1,
        padding: 20,
        borderRadius: 12,
        background: color,
        color: "#fff",
        boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
      }}
    >
      <h4>{title}</h4>
      <h2>{value}</h2>
    </div>
  );

  if (loading) {
    return <h3>Loading dashboard...</h3>;
  }

  return (
    <div>
      <h2>📊 Owner Dashboard</h2>

      {/* CARDS ROW */}
      <div style={{ display: "flex", gap: 15, marginTop: 20 }}>
        <Card title="🏪 Shops" value={stats.shops} color="#1e88e5" />
        <Card title="👥 Shopkeepers" value={stats.shopkeepers} color="#43a047" />
        <Card title="🔗 Assignments" value={stats.assignments} color="#fb8c00" />
        <Card title="💰 Revenue" value={`KES ${stats.revenue}`} color="#8e24aa" />
      </div>

      {/* EXTRA SECTION */}
      <div
        style={{
          marginTop: 30,
          padding: 20,
          border: "1px solid #ddd",
          borderRadius: 10,
        }}
      >
        <h3>📈 Overview</h3>
        <p>
          Welcome to your Shopify-style dashboard. Here you can manage shops,
          shopkeepers, assignments, and sales insights.
        </p>
      </div>
    </div>
  );
}

export default Dashboard;
