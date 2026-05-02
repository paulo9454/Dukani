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

  // =========================
  // PLAN LOGIC aligned with backend taxonomy:
  //   trial_pos | pos | pos_online | online | legacy
  // =========================
  const getPosAccess = (plan) =>
    plan === "trial_pos" || plan === "pos" || plan === "pos_online";

  const getOnlineAccess = (plan) =>
    plan === "pos_online" || plan === "online";

  const getBadgeStyle = (plan) => {
    if (plan === "pos_online") return { background: "green" };
    if (plan === "trial_pos") return { background: "#f59e0b" };
    if (plan === "pos") return { background: "#2563eb" };
    if (plan === "online") return { background: "#7c3aed" };
    return { background: "gray" };
  };

  const getPlanLabel = (plan) => {
    if (plan === "trial_pos") return "FREE POS TRIAL (14 DAYS)";
    if (plan === "pos") return "POS ONLY";
    if (plan === "pos_online") return "FULL ACCESS (POS + ONLINE)";
    if (plan === "online") return "ONLINE ONLY";
    if (plan === "legacy") return "LEGACY PLAN";
    return "UNKNOWN PLAN";
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
          const pos = getPosAccess(shop.subscription_plan);
          const online = getOnlineAccess(shop.subscription_plan);

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

              <div style={{ marginTop: 10 }}>
                <p>
                  <b>Status:</b> {getPlanLabel(shop.subscription_plan)}
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
