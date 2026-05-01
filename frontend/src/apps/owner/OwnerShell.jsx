import { useState, useEffect } from "react";

import Dashboard from "./components/Dashboard";
import Shops from "./components/Shops";
import Shopkeepers from "./components/Shopkeepers";
import AssignShopkeepers from "./components/AssignShopkeepers";
import Sales from "./components/Sales";
import PosAccess from "./components/PosAccess";

import API from "../../api/client";

// =========================
// NEW MODALS (we will build next)
// =========================
import ProductModal from "../../components/ProductModal";
import RestockModal from "./components/RestockModal";

function OwnerShell() {
  const [activeTab, setActiveTab] = useState("dashboard");

  const [search] = useState("");
  const [toast, setToast] = useState("");

  const [shopId, setShopId] = useState("");
  const [shops, setShops] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [lowStock, setLowStock] = useState([]);

  // =========================
  // MODAL STATES (NEW)
  // =========================
  const [showProductModal, setShowProductModal] = useState(false);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  // =========================
  // LOAD SHOPS
  // =========================
  useEffect(() => {
    const loadShops = async () => {
      try {
        const res = await API.get("/api/owner/shops");
        const data = Array.isArray(res.data) ? res.data : [];

        setShops(data);
        if (data.length > 0) setShopId(data[0]._id);
      } catch (err) {
        console.error("Failed to load shops", err);
      }
    };

    loadShops();
  }, []);

  // =========================
  // LOAD INVENTORY
  // =========================
  useEffect(() => {
    if (!shopId) return;

    const load = async () => {
      try {
        const inv = await API.get(`/api/inventory/shop/${shopId}`);
        const low = await API.get(`/api/inventory/low-stock/${shopId}`);

        setInventory(inv.data.products || []);
        setLowStock(low.data.low_stock_items || []);
      } catch (err) {
        console.error("Inventory load error", err);
      }
    };

    load();
  }, [shopId]);

  // =========================
  // RESTOCK TRIGGER
  // =========================
  const openRestock = (product) => {
    setSelectedProduct(product);
    setShowRestockModal(true);
  };

  const requestRestock = async (productId, qty = 10, buyingPrice = 0) => {
    try {
      await API.post("/api/inventory/restock", {
        shop_id: shopId,
        product_id: productId,
        qty,
        buying_price: buyingPrice,
      });

      showToast("Stock updated + capital recorded");
    } catch (err) {
      showToast("Restock failed");
    }
  };

  // =========================
  // STYLE
  // =========================
  const tabStyle = (tab) => ({
    padding: "10px",
    cursor: "pointer",
    marginBottom: 8,
    borderRadius: 6,
    background: activeTab === tab ? "#2563eb" : "transparent",
    color: activeTab === tab ? "white" : "white",
  });

  // =========================
  // CONTENT
  // =========================
  const renderContent = () => {
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

      case "pos-access":
        return <PosAccess />;

      // =========================
      // 📦 INVENTORY (UPGRADED)
      // =========================
      case "inventory":
        return (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <h2>📦 Inventory</h2>

              <button
                onClick={() => setShowProductModal(true)}
                style={{
                  padding: "8px 12px",
                  background: "green",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                }}
              >
                ➕ Add Product
              </button>
            </div>

            <select
              value={shopId}
              onChange={(e) => setShopId(e.target.value)}
              style={{ marginBottom: 20, padding: 8 }}
            >
              {shops.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name || s._id}
                </option>
              ))}
            </select>

            {inventory.map((p) => (
              <div
                key={p._id}
                style={{
                  border: "1px solid #ddd",
                  padding: 10,
                  marginBottom: 10,
                }}
              >
                <b>{p.name}</b>
                <div>Stock: {p.stock}</div>

                <div style={{ marginTop: 8 }}>
                  <button onClick={() => openRestock(p)}>
                    🔁 Restock
                  </button>
                </div>
              </div>
            ))}
          </div>
        );

      // =========================
      // ALERTS
      // =========================
      case "alerts":
        return (
          <div>
            <h2>🔴 Low Stock Alerts</h2>

            {lowStock.map((p) => (
              <div key={p._id} style={{ border: "1px solid red", padding: 10 }}>
                <b>{p.name}</b>
                <div>Stock: {p.stock}</div>

                <button onClick={() => openRestock(p)}>
                  🚚 Restock
                </button>
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
      
      {/* SIDEBAR */}
      <div style={{ width: 260, background: "#0f172a", color: "white", padding: 20 }}>
        <h3>🏪 Owner Panel</h3>

        <div onClick={() => setActiveTab("dashboard")} style={tabStyle("dashboard")}>📊 Dashboard</div>
        <div onClick={() => setActiveTab("shops")} style={tabStyle("shops")}>🏪 Shops</div>
        <div onClick={() => setActiveTab("shopkeepers")} style={tabStyle("shopkeepers")}>👥 Shopkeepers</div>
        <div onClick={() => setActiveTab("assignments")} style={tabStyle("assignments")}>🔗 Assignments</div>
        <div onClick={() => setActiveTab("sales")} style={tabStyle("sales")}>💰 Sales</div>
        <div onClick={() => setActiveTab("pos-access")} style={tabStyle("pos-access")}>🔐 POS Access</div>
        <div onClick={() => setActiveTab("inventory")} style={tabStyle("inventory")}>📦 Inventory</div>
        <div onClick={() => setActiveTab("alerts")} style={tabStyle("alerts")}>🔴 Alerts</div>
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, padding: 20 }}>
        {renderContent()}
      </div>

      {/* =========================
          MODALS (NEW)
      ========================= */}
      {showProductModal && (
        <ProductModal
          shopId={shopId}
          onClose={() => setShowProductModal(false)}
          onCreated={() => {
            setShowProductModal(false);
            showToast("Product created");
          }}
        />
      )}

      {showRestockModal && selectedProduct && (
        <RestockModal
          product={selectedProduct}
          shopId={shopId}
          onClose={() => setShowRestockModal(false)}
          onRestock={requestRestock}
        />
      )}

      {/* TOAST */}
      {toast && (
        <div style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          background: "#111",
          color: "#fff",
          padding: "10px 15px",
          borderRadius: 6,
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

export default OwnerShell;
