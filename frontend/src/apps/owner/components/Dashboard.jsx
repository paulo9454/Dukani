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

// =========================
// LOAD STATS
// =========================
useEffect(() => {
  const fetchStats = async () => {
    try {
      setLoading(true);

      const [shops, users, dashboard] = await Promise.all([
        getOwnerShops(),
        API.get("/api/owner/shopkeepers"),
        API.get("/api/dashboard/overview"),
      ]);

      const shopList = Array.isArray(shops) ? shops : shops?.data || [];
      const userList = users?.data || [];

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
        revenue: dashboard.data.revenue, // ✅ THIS IS THE FIX
      });

    } catch (err) {
      console.error("Dashboard error:", err);
    } finally {
      setLoading(false);
    }
  };

  fetchStats();
}, []);

<button
  onClick={() => window.location.href = "/pos?create=1"}
  style={{
    padding: "10px 16px",
    background: "#1e88e5",
    color: "white",
    border: "none",
    borderRadius: 6,
    marginBottom: 15,
  }}
>
  ➕ Create Product
</button>
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

if (loading) return <h3>Loading dashboard...</h3>;

return (
<div>
<h2>📊 Owner Dashboard</h2>

<div style={{ display: "flex", gap: 15, marginTop: 20 }}>  
    <Card title="🏪 Shops" value={stats.shops} color="#1e88e5" />  
    <Card title="👥 Shopkeepers" value={stats.shopkeepers} color="#43a047" />  
    <Card title="🔗 Assignments" value={stats.assignments} color="#fb8c00" />  
    <Card title="💰 Revenue" value={`KES ${stats.revenue}`} color="#8e24aa" />  
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
      Owner dashboard showing shops, shopkeepers, assignments and revenue overview.  
    </p>  
  </div>  
</div>

);
}

export default Dashboard;
