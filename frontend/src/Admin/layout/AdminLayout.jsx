import { Link, Outlet } from "react-router-dom";

export default function AdminLayout() {
  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "Arial" }}>
      
      {/* SIDEBAR */}
      <div style={{
        width: "240px",
        background: "#111",
        color: "#fff",
        padding: 20
      }}>
        <h2>DUKANI</h2>

        <nav style={{ marginTop: 30 }}>
          <Link to="/admin" style={link}>Dashboard</Link>
          <Link to="/admin/shops" style={link}>Shops</Link>
          <Link to="/admin/shopkeepers" style={link}>Shopkeepers</Link>
          <Link to="/admin/assignments" style={link}>Assignments</Link>
          <Link to="/admin/analytics" style={link}>Analytics</Link>
        </nav>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, padding: 20, background: "#f6f6f6" }}>
        <Outlet />
      </div>
    </div>
  );
}

const link = {
  display: "block",
  padding: "10px 0",
  color: "#ccc",
  textDecoration: "none"
};
