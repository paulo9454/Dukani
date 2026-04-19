import { useEffect, useState } from "react";
import API from "../../../api/client";

function PosAccess() {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(false);

  // =========================
  // LOAD SHOPS
  // =========================
  const loadShops = async () => {
    try {
      const res = await API.get("/api/dashboard/shops");
      setShops(res.data || []);
    } catch (err) {
      console.error("Failed to load shops:", err);
    }
  };

  useEffect(() => {
    loadShops();
  }, []);

  // =========================
  // PLAN LOGIC
  // =========================
  const getPosAccess = (plan) => {
    return plan === "500" || plan === "1000";
  };

  const getOnlineAccess = (plan) => {
    return plan === "1000";
  };

  const getBadgeStyle = (plan) => {
    if (plan === "1000") return { background: "green" };
    if (plan === "500") return { background: "orange" };
    return { background: "red" };
  };

  const getPlanLabel = (plan) => {
    if (plan === "1000") return "FULL ACCESS (POS + ONLINE)";
    if (plan === "500") return "POS ONLY";
    return "NO ACCESS";
  };

  return (
    <div>
      <h2>🔐 POS & Subscription Access</h2>
      <p style={{ color: "#555" }}>
        SaaS control based on shop subscription plans
      </p>

      {/* =========================
          SHOPS LIST
      ========================= */}
      {shops.length === 0 ? (
        <p>No shops found</p>
      ) : (
        shops.map((shop) => {
          const pos = getPosAccess(shop.subscription_plan);
          const online = getOnlineAccess(shop.subscription_plan);

          return (
            <div
              key={shop._id}
              style={{
                border: "1px solid #ddd",
                padding: 15,
                marginBottom: 12,
                borderRadius: 10,
                background: "#fff",
              }}
            >
              {/* SHOP HEADER */}
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <h3>🏪 {shop.name}</h3>
                  <small>ID: {shop._id}</small>
                </div>

                <span
                  style={{
                    ...getBadgeStyle(shop.subscription_plan),
                    color: "white",
                    padding: "5px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    height: "fit-content",
                  }}
                >
                  {shop.subscription_plan}
                </span>
              </div>

              {/* PLAN STATUS */}
              <div style={{ marginTop: 10 }}>
                <p>
                  <b>Status:</b> {getPlanLabel(shop.subscription_plan)}
                </p>

                {/* ACCESS GRID */}
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    marginTop: 10,
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      padding: 10,
                      borderRadius: 8,
                      background: pos ? "#dcfce7" : "#fee2e2",
                    }}
                  >
                    <b>POS ACCESS</b>
                    <p>{pos ? "✅ Enabled" : "❌ Disabled"}</p>
                  </div>

                  <div
                    style={{
                      flex: 1,
                      padding: 10,
                      borderRadius: 8,
                      background: online ? "#dcfce7" : "#fee2e2",
                    }}
                  >
                    <b>ONLINE SALES</b>
                    <p>{online ? "✅ Enabled" : "❌ Disabled"}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export default PosAccess;
