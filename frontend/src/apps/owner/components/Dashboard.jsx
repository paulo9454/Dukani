import { useEffect, useState } from "react";
import API from "../../../api/client";
import { getOwnerShops } from "../../../api/shops";

function Dashboard() {
  const [stats, setStats] = useState({
    shops: 0,
    shopkeepers: 0,
    assignments: 0,
    revenue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      try {
        setLoading(true);
        setError("");

        // Run in parallel and tolerate partial failures so a single slow/broken
        // endpoint doesn't hang the whole dashboard.
        const [shopsRes, usersRes, overviewRes] = await Promise.allSettled([
          getOwnerShops(),
          API.get("/api/owner/shopkeepers"),
          API.get("/api/dashboard/overview"),
        ]);

        if (cancelled) return;

        const shopsVal =
          shopsRes.status === "fulfilled" ? shopsRes.value : [];
        const shopList = Array.isArray(shopsVal)
          ? shopsVal
          : shopsVal?.data || [];

        const userList =
          usersRes.status === "fulfilled" ? usersRes.value.data || [] : [];

        const revenue =
          overviewRes.status === "fulfilled"
            ? Number(overviewRes.value?.data?.revenue || 0)
            : 0;

        let assignments = 0;
        userList.forEach((u) => {
          if (Array.isArray(u.assigned_shop_ids)) {
            assignments += u.assigned_shop_ids.length;
          }
        });

        setStats({
          shops: shopList.length,
          shopkeepers: userList.length,
          assignments,
          revenue,
        });
      } catch (err) {
        console.error("Dashboard error:", err);
        if (!cancelled) setError("Failed to load dashboard. Please refresh.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchStats();

    return () => {
      cancelled = true;
    };
  }, []);

  const Card = ({ title, value, color, testid }) => (
    <div
      data-testid={testid}
      style={{
        flex: 1,
        padding: 20,
        borderRadius: 12,
        background: color,
        color: "#fff",
        boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
      }}
    >
      <h4 style={{ margin: 0 }}>{title}</h4>
      <h2 style={{ margin: "8px 0 0" }}>{value}</h2>
    </div>
  );

  if (loading) return <h3 data-testid="dashboard-loading">Loading dashboard...</h3>;

  return (
    <div data-testid="owner-dashboard">
      <h2>📊 Owner Dashboard</h2>

      {error && (
        <div
          data-testid="dashboard-error"
          style={{
            background: "#fee2e2",
            color: "#991b1b",
            padding: 10,
            borderRadius: 6,
            marginTop: 10,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 15, marginTop: 20, flexWrap: "wrap" }}>
        <Card testid="stat-shops" title="🏪 Shops" value={stats.shops} color="#1e88e5" />
        <Card testid="stat-shopkeepers" title="👥 Shopkeepers" value={stats.shopkeepers} color="#43a047" />
        <Card testid="stat-assignments" title="🔗 Assignments" value={stats.assignments} color="#fb8c00" />
        <Card testid="stat-revenue" title="💰 Revenue" value={`KES ${stats.revenue}`} color="#8e24aa" />
      </div>

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
          Owner dashboard showing shops, shopkeepers, assignments and revenue
          overview. Use the sidebar to manage shops, add shopkeepers, assign
          them, and launch POS.
        </p>
      </div>
    </div>
  );
}

export default Dashboard;
