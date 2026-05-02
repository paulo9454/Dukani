import { useEffect, useState } from "react";
import API from "../../../api/client";

function Shops({ search = "" }) {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(false);

  // =========================
  // CREATE SHOP STATE (FIXED)
  // =========================
  const [newShop, setNewShop] = useState({
    name: "",
    subscription_plan: "pos", // default = 14-day free POS
  });

  // =========================
  // GET LOCATION
  // =========================
  const getLocation = () => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ latitude: 0, longitude: 0 });
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        },
        () => resolve({ latitude: 0, longitude: 0 })
      );
    });
  };

  // =========================
  // LOAD SHOPS
  // =========================
  const loadShops = async () => {
    try {
      setLoading(true);

      const res = await API.get("/api/owner/shops");

      const data = res?.data;
      setShops(Array.isArray(data) ? data : data?.data || []);
    } catch (err) {
      console.error("Shops error:", err);
      setShops([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShops();
  }, []);

  // =========================
  // CREATE SHOP
  // =========================
  const createShop = async () => {
    if (!newShop.name.trim()) {
      alert("Shop name required");
      return;
    }

    try {
      setLoading(true);

      const location = await getLocation();

      await API.post("/api/owner/shops", {
        name: newShop.name.trim(),
        subscription_plan: newShop.subscription_plan,
        latitude: location.latitude,
        longitude: location.longitude,
        address: "N/A",
      });

      alert("✅ Shop created");

      setNewShop({
        name: "",
        subscription_plan: "pos",
      });

      loadShops();
    } catch (err) {
      console.error("CREATE SHOP ERROR:", err);
      console.error("DETAIL:", err?.response?.data);

      alert(
        err?.response?.data?.detail
          ? JSON.stringify(err.response.data.detail, null, 2)
          : "❌ Failed to create shop"
      );
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // DELETE SHOP
  // =========================
  const deleteShop = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this shop?"
    );

    if (!confirmDelete) return;

    try {
      await API.delete(`/api/owner/shops/${id}`);

      alert("🗑️ Shop deleted");

      setShops((prev) => prev.filter((shop) => shop._id !== id));
    } catch (err) {
      console.error("DELETE ERROR:", err);

      if (err?.response?.status === 404) {
        alert("⚠️ Shop already deleted");
        setShops((prev) => prev.filter((shop) => shop._id !== id));
        return;
      }

      alert(err?.response?.data?.detail || "❌ Failed to delete shop");
    }
  };

  // =========================
  // FILTER
  // =========================
  const filteredShops = shops.filter((shop) =>
    `${shop.name || ""} ${shop.subscription_plan || ""} ${shop._id || ""}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <div>
      <h2>🏪 Shops Management</h2>

      {/* CREATE SHOP */}
      <div
        style={{
          padding: 15,
          border: "1px solid #ddd",
          borderRadius: 10,
          marginBottom: 20,
        }}
      >
        <h3>➕ Create Shop</h3>

        <input
          placeholder="Shop name"
          value={newShop.name}
          onChange={(e) =>
            setNewShop({ ...newShop, name: e.target.value })
          }
          style={{ display: "block", marginBottom: 10, padding: 8 }}
        />

        {/* =========================
            PLAN DROPDOWN (FIXED)
        ========================= */}
        <select
          value={newShop.subscription_plan}
          onChange={(e) =>
            setNewShop({ ...newShop, subscription_plan: e.target.value })
          }
          style={{ display: "block", marginBottom: 10, padding: 8 }}
        >
          <option value="pos">POS (14 days free)</option>
          <option value="pos_online">POS + Online</option>
        </select>

        <p style={{ marginBottom: 10, color: "green" }}>
          🎁 14-day FREE POS trial included
        </p>

        <button onClick={createShop} disabled={loading}>
          ➕ Create Shop
        </button>
      </div>

      {/* LIST */}
      <div>
        <h3>📋 My Shops</h3>

        {loading ? (
          <p>Loading shops...</p>
        ) : filteredShops.length === 0 ? (
          <p>No shops found</p>
        ) : (
          filteredShops.map((shop) => {
            const shareUrl = shop.slug
              ? `${window.location.origin}/shop/${shop.slug}`
              : null;
            const onlineActive =
              shop.subscription_plan === "pos_online" ||
              shop.is_online_enabled ||
              shop.online_enabled;

            const upgradeOnline = async () => {
              try {
                await API.post(`/api/owner/shops/${shop._id}/subscribe`, {
                  plan: "pos_online",
                });
                await loadShops();
                alert("✅ Online store activated!");
              } catch (err) {
                alert(err?.response?.data?.detail || "Failed to subscribe");
              }
            };

            const copyLink = () => {
              if (!shareUrl) return;
              navigator.clipboard?.writeText(shareUrl);
              alert("Link copied: " + shareUrl);
            };

            return (
              <div
                key={shop._id}
                data-testid={`shop-card-${shop._id}`}
                style={{
                  border: "1px solid #e2e8f0",
                  padding: 15,
                  marginBottom: 10,
                  borderRadius: 8,
                  background: "white",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h4 style={{ margin: 0 }}>🏪 {shop.name}</h4>
                    <p style={{ margin: "4px 0", color: "#475569" }}>
                      Plan: <b>{shop.subscription_plan}</b>{" "}
                      {onlineActive ? (
                        <span style={{ color: "#16a34a", fontSize: 12 }}>· 🌐 Online ON</span>
                      ) : (
                        <span style={{ color: "#94a3b8", fontSize: 12 }}>· Online OFF</span>
                      )}
                    </p>
                    {shareUrl && (
                      <div style={{ marginTop: 6, fontSize: 12 }}>
                        🔗 Public link:{" "}
                        <a href={shareUrl} target="_blank" rel="noreferrer" style={{ color: "#0f766e" }}>
                          {shareUrl}
                        </a>{" "}
                        <button
                          data-testid={`copy-link-${shop._id}`}
                          onClick={copyLink}
                          style={{ marginLeft: 6, padding: "2px 6px", fontSize: 11, cursor: "pointer" }}
                        >
                          Copy
                        </button>
                      </div>
                    )}
                    <small style={{ color: "#94a3b8" }}>ID: {shop._id}</small>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                    {!onlineActive && (
                      <button
                        data-testid={`upgrade-online-${shop._id}`}
                        onClick={upgradeOnline}
                        style={{
                          background: "#16a34a",
                          color: "white",
                          border: "none",
                          padding: "8px 12px",
                          cursor: "pointer",
                          borderRadius: 6,
                        }}
                      >
                        🌐 Activate Online Store
                      </button>
                    )}
                    <button
                      onClick={() => (window.location.href = `/pos?shopId=${shop._id}`)}
                      style={{
                        background: "#2563eb",
                        color: "white",
                        border: "none",
                        padding: "8px 12px",
                        cursor: "pointer",
                        borderRadius: 6,
                      }}
                    >
                      🚀 Open POS
                    </button>
                    <button
                      onClick={() => deleteShop(shop._id)}
                      style={{
                        background: "transparent",
                        color: "#dc2626",
                        border: "1px solid #fecaca",
                        padding: "6px 12px",
                        cursor: "pointer",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default Shops;
