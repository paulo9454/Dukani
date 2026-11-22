import { useEffect, useState } from "react";
import API from "../../../api/client";

function PosAccess() {
  const [shops, setShops] = useState([]);

  const loadShops = async () => {
    try {
      const res = await API.get("/api/owner/shops");
      setShops(res.data || []);
    } catch (err) {
      console.error("Failed to load shops:", err);
      setShops([]);
    }
  };

  useEffect(() => {
    loadShops();
  }, []);

  // The backend subscription service is the single source of truth.
  // Do not infer feature access from plan names in the frontend.
  const getPlanLabel = (shop) => {
    const plan = shop.subscription_plan;
    const status = shop.subscription_status;

    if (plan === "trial" && status === "trial") {
      const daysLeft = shop.subscription_days_left;
      return Number.isFinite(daysLeft)
        ? `FREE TRIAL – ${daysLeft} ${daysLeft === 1 ? "DAY" : "DAYS"} LEFT`
        : "FREE TRIAL";
    }

    if (plan === "trial" || status === "expired") return "TRIAL EXPIRED";
    if (plan === "pos") return "POS ONLY";
    if (plan === "pos_online") return "FULL ACCESS (POS + ONLINE)";
    return plan ? plan.toUpperCase().replaceAll("_", " ") : "PLAN NOT SET";
  };

  const getBadgeStyle = (shop) => {
    if (shop.subscription_status === "expired") return { background: "#dc2626" };
    if (shop.subscription_plan === "trial") return { background: "#f59e0b" };
    if (shop.subscription_plan === "pos_online") return { background: "green" };
    if (shop.subscription_plan === "pos") return { background: "#2563eb" };
    return { background: "gray" };
  };

  const launchPos = (shopId) => {
    window.location.href = `/pos?shopId=${shopId}`;
  };

  return (
    <div>
      <h2>🔐 POS & Subscription Access</h2>
      <p style={{ color: "#555" }}>
        SaaS control based on shop subscription plans
      </p>

      {shops.length === 0 ? (
        <p data-testid="no-shops-msg">No shops found. Create a shop first.</p>
      ) : (
        shops.map((shop) => {
          const features = shop.subscription_features || {};
          const pos = features.pos === true;
          const online = features.online === true;

          return (
            <div
              key={shop._id}
              data-testid={`pos-access-card-${shop._id}`}
              style={{
                border: "1px solid #ddd",
                padding: 15,
                marginBottom: 12,
                borderRadius: 10,
                background: "#fff",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <h3>🏪 {shop.name}</h3>
                  <small>ID: {shop._id}</small>
                </div>

                <span
                  style={{
                    ...getBadgeStyle(shop),
                    color: "white",
                    padding: "5px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    height: "fit-content",
                  }}
                >
                  {getPlanLabel(shop)}
                </span>
              </div>

              <div style={{ marginTop: 10 }}>
                <p>
                  <b>Status:</b> {getPlanLabel(shop)}
                </p>

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

                {pos && (
                  <button
                    data-testid={`launch-pos-btn-${shop._id}`}
                    onClick={() => launchPos(shop._id)}
                    style={{
                      marginTop: 14,
                      padding: "10px 16px",
                      background: "#16a34a",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    🚀 Launch POS
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export default PosAccess;
