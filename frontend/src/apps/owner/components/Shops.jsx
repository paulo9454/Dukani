import { useEffect, useState } from "react";
import API from "../../../api/client";

function Shops({ search = "" }) {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(false);

  const [newShop, setNewShop] = useState({
    name: "",
    subscription_plan: "online",
  });

  // =========================
  // LOAD SHOPS
  // =========================
  const loadShops = async () => {
    try {
      const res = await API.get("/api/dashboard/shops");
      setShops(res.data || []);
    } catch (err) {
      console.error("Shops error:", err);
    }
  };

  useEffect(() => {
    loadShops();
  }, []);

  // =========================
  // CREATE SHOP
  // =========================
  const createShop = async () => {
    if (!newShop.name) {
      alert("Shop name required");
      return;
    }

    try {
      setLoading(true);

      await API.post("/api/owner/shops", {
        name: newShop.name,
        subscription_plan: newShop.subscription_plan,
      });

      alert("✅ Shop created");

      setNewShop({ name: "", subscription_plan: "online" });

      loadShops();
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.detail || "❌ Failed to create shop");
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // FILTER SHOPS (🔥 SEARCH FIX)
  // =========================
  const filteredShops = shops.filter((shop) =>
    `${shop.name || ""} ${shop.subscription_plan || ""} ${shop._id || ""}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <div>
      <h2>🏪 Shops Management</h2>

      {/* =========================
          CREATE SHOP FORM
      ========================= */}
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

        <select
          value={newShop.subscription_plan}
          onChange={(e) =>
            setNewShop({
              ...newShop,
              subscription_plan: e.target.value,
            })
          }
          style={{ display: "block", marginBottom: 10, padding: 8 }}
        >
          <option value="online">Online</option>
          <option value="pos">POS</option>
          <option value="enterprise">Enterprise</option>
        </select>

        <button onClick={createShop} disabled={loading}>
          ➕ Create Shop
        </button>
      </div>

      {/* =========================
          SHOPS LIST
      ========================= */}
      <div>
        <h3>📋 My Shops</h3>

        {filteredShops.length === 0 ? (
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
