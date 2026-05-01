import { useEffect, useState } from "react";
import API from "../../api/client";
import POS from "../pos/PosApp";
import ProductModal from "../../components/ProductModal";

function ShopkeeperHome() {
  const [shops, setShops] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState(null);
  const [loading, setLoading] = useState(true);

  // =========================
  // PRODUCT MODAL STATE
  // =========================
  const [showProductModal, setShowProductModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        const res = await API.get("/api/shop/my");
        setShops(res.data || []);
      } catch (err) {
        console.error("Shop load error:", err);
        setShops([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  // =========================
  // REFRESH AFTER PRODUCT SAVE
  // =========================
  const refresh = () => {
    setRefreshKey((k) => k + 1);
  };

  // =========================
  // ENTER POS VIEW
  // =========================
  if (selectedShopId) {
    return (
      <div style={{ padding: 20 }}>
        <button
          onClick={() => setSelectedShopId(null)}
          style={{
            marginBottom: 10,
            padding: 8,
            cursor: "pointer",
          }}
        >
          ← Back to Shops
        </button>

        {/* =========================
            SHOP CONTROLS BAR
        ========================= */}
        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <button
            onClick={() => setShowProductModal(true)}
            style={{
              padding: 10,
              background: "#2563eb",
              color: "white",
              border: "none",
              borderRadius: 6,
            }}
          >
            ➕ Add Product
          </button>

          <button
            onClick={refresh}
            style={{
              padding: 10,
              background: "#111",
              color: "white",
              border: "none",
              borderRadius: 6,
            }}
          >
            🔄 Refresh
          </button>
        </div>

        {/* =========================
            POS SYSTEM
        ========================= */}
        <POS shopId={selectedShopId} key={refreshKey} />

        {/* =========================
            PRODUCT MODAL
        ========================= */}
        <ProductModal
          open={showProductModal}
          shopId={selectedShopId}
          onClose={() => setShowProductModal(false)}
          onSuccess={refresh}
        />
      </div>
    );
  }

  // =========================
  // DASHBOARD
  // =========================
  return (
    <div style={{ padding: 20 }}>
      <h2>👨‍💼 Shopkeeper Dashboard</h2>

      {loading && <p>Loading assigned shops...</p>}

      {!loading && shops.length === 0 && (
        <p>No assigned shops</p>
      )}

      {shops.map((shop) => (
        <div
          key={shop._id}
          style={{
            border: "1px solid #ddd",
            padding: 15,
            marginBottom: 10,
            borderRadius: 8,
          }}
        >
          <h3>🏪 {shop.name}</h3>
          <p>Plan: {shop.subscription_plan}</p>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => setSelectedShopId(shop._id)}
              style={{
                padding: 10,
                background: "green",
                color: "white",
                border: "none",
                cursor: "pointer",
              }}
            >
              Enter POS →
            </button>

            <button
              onClick={() => {
                setSelectedShopId(shop._id);
                setTimeout(() => setShowProductModal(true), 200);
              }}
              style={{
                padding: 10,
                background: "#2563eb",
                color: "white",
                border: "none",
                cursor: "pointer",
              }}
            >
              ➕ Add Product
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default ShopkeeperHome;
