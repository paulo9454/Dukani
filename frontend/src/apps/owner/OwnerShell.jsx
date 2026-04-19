import { useState } from "react";

import Dashboard from "./components/Dashboard";
import Shops from "./components/Shops";
import Shopkeepers from "./components/Shopkeepers";
import AssignShopkeepers from "./components/AssignShopkeepers";
import Sales from "./components/Sales";
import PosAccess from "./components/PosAccess"; // ✅ ADDED

function OwnerShell() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading] = useState(false);

  const [search] = useState("");
  const [toast, setToast] = useState("");

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  // =========================
  // TAB STYLE SYSTEM
  // =========================
  const baseTabStyle = {
    padding: "10px",
    cursor: "pointer",
    marginBottom: 8,
    borderRadius: 6,
    transition: "0.2s",
  };

  const activeStyle = {
    ...baseTabStyle,
    background: "#2563eb",
    color: "white",
  };

  const isActive = (tab) =>
    activeTab === tab ? activeStyle : baseTabStyle;

  // =========================
  // RENDER CONTENT
  // =========================
  const renderContent = () => {
    if (loading) {
      return (
        <div style={{ padding: 20 }}>
          <h3>Loading...</h3>
        </div>
      );
    }

    switch (activeTab) {
      case "dashboard":
        return <Dashboard />;

      case "shops":
        return <Shops search={search} />;

      case "shopkeepers":
        return <Shopkeepers search={search} />;

      case "assignments":
        return <AssignShopkeepers />;

      case "sales":
        return <Sales />;

      case "pos-access": // ✅ ADDED
        return <PosAccess />;

      default:
        return <Dashboard />;
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      
      {/* =========================
          SIDEBAR
      ========================= */}
      <div
        style={{
          width: 260,
          background: "#0f172a",
          color: "white",
          padding: 20,
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        <h3 style={{ marginBottom: 20 }}>🏪 Owner Panel</h3>

        <div style={isActive("dashboard")} onClick={() => setActiveTab("dashboard")}>
          📊 Dashboard
        </div>

        <div style={isActive("shops")} onClick={() => setActiveTab("shops")}>
          🏪 Shops
        </div>

        <div style={isActive("shopkeepers")} onClick={() => setActiveTab("shopkeepers")}>
          👥 Shopkeepers
        </div>

        <div style={isActive("assignments")} onClick={() => setActiveTab("assignments")}>
          🔗 Assignments
        </div>

        <div style={isActive("sales")} onClick={() => setActiveTab("sales")}>
          💰 Sales
        </div>

        {/* 🔐 NEW POS ACCESS */}
        <div style={isActive("pos-access")} onClick={() => setActiveTab("pos-access")}>
          🔐 POS Access
        </div>
      </div>

      {/* =========================
          MAIN AREA
      ========================= */}
      <div style={{ flex: 1, padding: 20, background: "#f8fafc" }}>
        {renderContent()}
      </div>

      {/* =========================
          TOAST
      ========================= */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            background: "#111",
            color: "white",
            padding: "10px 15px",
            borderRadius: 6,
            zIndex: 9999,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

export default OwnerShell;
