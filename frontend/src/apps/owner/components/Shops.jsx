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
          filteredShops.map((shop) => (
            <div
              key={shop._id}
              style={{
                border: "1px solid #ddd",
                padding: 15,
                marginBottom: 10,
                borderRadius: 8,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <div>
                <h4>🏪 {shop.name}</h4>
                <p>Plan: {shop.subscription_plan}</p>
                <small>ID: {shop._id}</small>
              </div>

              <button
                onClick={() => deleteShop(shop._id)}
                style={{
                  background: "red",
                  color: "white",
                  border: "none",
                  padding: 8,
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default Shops;
