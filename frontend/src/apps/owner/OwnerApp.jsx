import { useEffect, useState } from "react";
import API from "../../api/client";
import ShopSelector from "../../components/ShopSelector";
import AssignShopkeepers from "./components/AssignShopkeepers";

function OwnerApp() {
  const [sales, setSales] = useState({ revenue: 0, orders: 0 });
  const [shops, setShops] = useState([]);
  const [activeShop, setActiveShop] = useState("");
  const [view, setView] = useState("sales");

  // =========================
  // LOAD SHOPS
  // =========================
  useEffect(() => {
    API.get("/api/dashboard/shops")
      .then((res) => setShops(res.data || []))
      .catch((err) => console.error("Shops load error:", err));
  }, []);

  // =========================
  // LOAD SALES
  // =========================
  useEffect(() => {
    API.get("/api/dashboard/vendor/daily-sales")
      .then((res) => setSales(res.data || { revenue: 0, orders: 0 }))
      .catch((err) => console.error("Sales load error:", err));
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2>🏪 Owner Dashboard</h2>

      <ShopSelector onSelect={setActiveShop} />

      <div style={{ marginTop: 10 }}>
        <button onClick={() => setView("sales")}>📊 Sales</button>{" "}
        <button onClick={() => setView("shops")}>🏬 Shops</button>
      </div>

      {/* SALES VIEW */}
      {view === "sales" && (
        <div style={{ marginTop: 20 }}>
          <h3>📊 Business Overview</h3>
          <p>Total Orders: {sales.orders}</p>
          <p>Revenue: KES {sales.revenue}</p>
        </div>
      )}

      {/* SHOPS VIEW */}
      {view === "shops" && (
        <div style={{ marginTop: 20 }}>
          <h3>🏬 My Shops</h3>

          {/* Assign UI */}
          <AssignShopkeepers />

          {shops.length === 0 ? (
            <p>No shops found</p>
          ) : (
            shops.map((s) => (
              <div
                key={s._id}
                style={{
                  border: "1px solid #ddd",
                  padding: 10,
                  marginBottom: 8,
                  borderRadius: 6,
                }}
              >
                <strong>{s.name}</strong>
                <p>ID: {s._id}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default OwnerApp;
