import { useState, useEffect } from "react";

import Dashboard from "./components/Dashboard";
import Shops from "./components/Shops";
import Shopkeepers from "./components/Shopkeepers";
import AssignShopkeepers from "./components/AssignShopkeepers";
import Sales from "./components/Sales";
import PosAccess from "./components/PosAccess";

import ProductsPage from "../inventory/ProductsPage";
import API from "../../api/client";

function OwnerShell() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState("");
  const [alerts, setAlerts] = useState([]);
  const [toast, setToast] = useState("");

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  // LOAD SHOPS (for Inventory / Alerts tab shop-picker)
  useEffect(() => {
    const load = async () => {
      try {
        const res = await API.get("/api/owner/shops");
        const data = Array.isArray(res.data) ? res.data : [];
        setShops(data);
        if (data.length > 0 && !shopId) setShopId(data[0]._id);
      } catch (err) {
        console.error("Failed to load shops", err);
      }
    };
    load();
  }, [activeTab]);

  // LOAD STOCK ALERTS
  useEffect(() => {
    if (activeTab !== "alerts") return;
    (async () => {
      try {
        const res = await API.get("/api/notifications/stock");
        setAlerts(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error("Alerts error:", err);
        setAlerts([]);
      }
    })();
  }, [activeTab]);

  const tabStyle = (tab) => ({
    padding: "10px 12px",
    cursor: "pointer",
    marginBottom: 4,
    borderRadius: 6,
    background: activeTab === tab ? "#2563eb" : "transparent",
    color: "white",
    userSelect: "none",
  });

  const Tab = ({ id, label, testid }) => (
    <div
      data-testid={testid}
      onClick={() => setActiveTab(id)}
      style={tabStyle(id)}
    >
      {label}
    </div>
  );

  const launchPos = () => {
    if (!shopId) return alert("Select or create a shop first");
    window.location.href = `/pos?shopId=${shopId}`;
  };

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard />;
      case "shops":
        return <Shops />;
      case "shopkeepers":
        return <AssignShopkeepers />;
      case "assignments":
        return <AssignShopkeepers />;
      case "sales":
        return <Sales />;
      case "pos-access":
        return <PosAccess />;
      case "inventory":
        return (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h2 style={{ margin: 0 }}>📦 Inventory & Products</h2>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <label style={{ color: "#555" }}>Shop: </label>
                <select
                  data-testid="inventory-shop-select"
                  value={shopId}
                  onChange={(e) => setShopId(e.target.value)}
                  style={{ padding: 6 }}
                >
                  {shops.length === 0 && <option value="">No shops yet</option>}
                  {shops.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name || s._id}
                    </option>
                  ))}
                </select>
                {shopId && (
                  <button
                    data-testid="launch-pos-from-inventory"
                    onClick={launchPos}
                    style={{
                      padding: "8px 12px",
                      background: "#16a34a",
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    🚀 Launch POS
                  </button>
                )}
              </div>
            </div>
            {shopId ? (
              <ProductsPage shopId={shopId} />
            ) : (
              <p>Create a shop first from the Shops tab.</p>
            )}
          </div>
        );
      case "alerts":
        return (
          <div>
            <h2>🔴 Stock Alerts</h2>
            {alerts.length === 0 && <p>No alerts right now. 👍</p>}
            {alerts.map((a, i) => (
              <div
                key={i}
                style={{
                  border: "1px solid #fee2e2",
                  background: "#fef2f2",
                  padding: 12,
                  marginBottom: 8,
                  borderRadius: 8,
                }}
              >
                <b>{a.type || "LOW_STOCK"}</b>
                <div style={{ color: "#555" }}>{a.message || a.product_name}</div>
                {typeof a.stock !== "undefined" && (
                  <div style={{ fontSize: 12 }}>
                    Shop: {a.shop_name || a.shop_id} | Stock: {a.stock} / threshold {a.threshold}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      default:
        return <Dashboard />;
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <div style={{ width: 240, background: "#0f172a", color: "white", padding: 18 }}>
        <h3 style={{ marginTop: 0 }}>🏪 Owner Panel</h3>
        <Tab id="dashboard" label="📊 Dashboard" testid="tab-dashboard" />
        <Tab id="shops" label="🏪 Shops" testid="tab-shops" />
        <Tab id="shopkeepers" label="👥 Shopkeepers" testid="tab-shopkeepers" />
        <Tab id="assignments" label="🔗 Assignments" testid="tab-assignments" />
        <Tab id="inventory" label="📦 Inventory" testid="tab-inventory" />
        <Tab id="sales" label="💰 Sales" testid="tab-sales" />
        <Tab id="pos-access" label="🔐 POS Access" testid="tab-pos-access" />
        <Tab id="alerts" label="🔴 Alerts" testid="tab-alerts" />
      </div>

      <div style={{ flex: 1, padding: 20, background: "#f8fafc" }}>
        {renderContent()}
      </div>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            background: "#111",
            color: "#fff",
            padding: "10px 15px",
            borderRadius: 6,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

export default OwnerShell;
