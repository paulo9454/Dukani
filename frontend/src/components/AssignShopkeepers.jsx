import { useEffect, useState } from "react";
import API from "../../../api/client";

function AssignShopkeepers() {
  const [shops, setShops] = useState([]);
  const [shopkeepers, setShopkeepers] = useState([]);
  const [shopId, setShopId] = useState("");
  const [shopkeeperId, setShopkeeperId] = useState("");
  const [loading, setLoading] = useState(false);

  // =========================
  // LOAD SHOPS (OWNER API)
  // =========================
  useEffect(() => {
    API.get("/api/owner/shops")
      .then((res) => setShops(res.data || []))
      .catch((err) => console.error("Shops error:", err));
  }, []);

  // =========================
  // LOAD SHOPKEEPERS
  // NOTE: If backend doesn't exist yet, replace later
  // =========================
  useEffect(() => {
    API.get("/api/auth/me")
      .then((res) => {
        const user = res.data;

        // fallback: if backend doesn't expose list yet
        if (user.role === "shopkeeper") {
          setShopkeepers([user]);
        } else {
          setShopkeepers([]);
        }
      })
      .catch((err) => console.error("Shopkeepers error:", err));
  }, []);

  // =========================
  // ASSIGN SHOPKEEPER
  // =========================
  const assign = async () => {
    if (!shopId || !shopkeeperId) {
      alert("Select shop and shopkeeper");
      return;
    }

    try {
      setLoading(true);

      await API.post(
        `/api/owner/shops/${shopId}/shopkeepers/${shopkeeperId}`
      );

      alert("✅ Shopkeeper assigned successfully");

      setShopkeeperId("");
    } catch (err) {
      console.error(err);
      alert("❌ Failed to assign shopkeeper");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: 20, padding: 15, border: "1px solid #ddd" }}>
      <h3>👥 Assign Shopkeepers</h3>

      {/* SHOP SELECT */}
      <div style={{ marginBottom: 10 }}>
        <label>🏬 Shop: </label>
        <select value={shopId} onChange={(e) => setShopId(e.target.value)}>
          <option value="">Select shop</option>
          {shops.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* SHOPKEEPER SELECT */}
      <div style={{ marginBottom: 10 }}>
        <label>👤 Shopkeeper: </label>
        <select
          value={shopkeeperId}
          onChange={(e) => setShopkeeperId(e.target.value)}
        >
          <option value="">Select shopkeeper</option>
          {shopkeepers.map((u) => (
            <option key={u.id || u._id} value={u.id || u._id}>
              {u.name || "Shopkeeper"} ({u.email})
            </option>
          ))}
        </select>
      </div>

      {/* ACTION */}
      <button onClick={assign} disabled={loading}>
        {loading ? "Assigning..." : "➕ Assign Shopkeeper"}
      </button>
    </div>
  );
}

export default AssignShopkeepers;
