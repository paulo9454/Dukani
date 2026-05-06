import { useEffect, useState } from "react";
import API from "../../../api/client";
import { getOwnerShops } from "../../../api/shops";

function Dashboard() {
  const [stats, setStats] = useState({
    shops: 0,
    shopkeepers: 0,
    assignments: 0,
    revenue: 0,
  });
  const [analytics, setAnalytics] = useState([]); // per-shop 30-day summary
  const [trialShops, setTrialShops] = useState([]); // shops on free trial
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      try {
        setLoading(true);
        setError("");

        // Run in parallel and tolerate partial failures so a single slow/broken
        // endpoint doesn't hang the whole dashboard.
        const [shopsRes, usersRes, overviewRes] = await Promise.allSettled([
          getOwnerShops(),
          API.get("/api/owner/shopkeepers"),
          API.get("/api/dashboard/overview"),
        ]);

        if (cancelled) return;

        const shopsVal =
          shopsRes.status === "fulfilled" ? shopsRes.value : [];
        const shopList = Array.isArray(shopsVal)
          ? shopsVal
          : shopsVal?.data || [];

        const userList =
          usersRes.status === "fulfilled" ? usersRes.value.data || [] : [];

        const revenue =
          overviewRes.status === "fulfilled"
            ? Number(overviewRes.value?.data?.revenue || 0)
            : 0;

        let assignments = 0;
        userList.forEach((u) => {
          if (Array.isArray(u.assigned_shop_ids)) {
            assignments += u.assigned_shop_ids.length;
          }
        });

        setStats({
          shops: shopList.length,
          shopkeepers: userList.length,
          assignments,
          revenue,
        });

        // Compute trial badges — show a banner when any shop is on the
        // 30-day free trial so owners know exactly how many days remain.
        if (!cancelled) {
          const now = Date.now();
          const trials = shopList
            .filter((s) => s.trial_end_at || s.subscription_status === "trial")
            .map((s) => {
              const end = s.trial_end_at ? new Date(s.trial_end_at).getTime() : 0;
              const daysLeft = Math.max(0, Math.ceil((end - now) / 86400000));
              const expired = end > 0 && end <= now;
              return { shop: s, daysLeft, expired };
            });
          setTrialShops(trials);
        }

        // Load 30-day analytics for each shop in parallel so owners see the
        // real-world funnel right on the dashboard.
        const analyticsResults = await Promise.allSettled(
          shopList.map((s) =>
            API.get(`/api/analytics/shop/${s._id}`).then((r) => ({
              shop: s,
              data: r.data?.summary || {},
            }))
          )
        );
        if (!cancelled) {
          setAnalytics(
            analyticsResults
              .filter((r) => r.status === "fulfilled")
              .map((r) => r.value)
          );
        }
      } catch (err) {
        console.error("Dashboard error:", err);
        if (!cancelled) setError("Failed to load dashboard. Please refresh.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchStats();

    return () => {
      cancelled = true;
    };
  }, []);

  const Card = ({ title, value, color, testid }) => (
    <div
      data-testid={testid}
      style={{
        flex: 1,
        padding: 20,
        borderRadius: 12,
        background: color,
        color: "#fff",
        boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
      }}
    >
      <h4 style={{ margin: 0 }}>{title}</h4>
      <h2 style={{ margin: "8px 0 0" }}>{value}</h2>
    </div>
  );

  if (loading) return <h3 data-testid="dashboard-loading">Loading dashboard...</h3>;

  return (
    <div data-testid="owner-dashboard">
      <h2>📊 Owner Dashboard</h2>

      {trialShops.map(({ shop, daysLeft, expired }) => {
        const tone = expired
          ? { bg: "#fee2e2", border: "#fecaca", color: "#991b1b" }
          : daysLeft < 5
          ? { bg: "#fef3c7", border: "#fde68a", color: "#92400e" }
          : { bg: "#dcfce7", border: "#bbf7d0", color: "#166534" };
        return (
          <div
            key={shop._id}
            data-testid={`trial-banner-${shop._id}`}
            style={{
              background: tone.bg,
              border: `1px solid ${tone.border}`,
              color: tone.color,
              padding: "10px 14px",
              borderRadius: 8,
              marginTop: 12,
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              justifyContent: "space-between",
            }}
          >
            <span>
              {expired ? "⛔" : daysLeft < 5 ? "⚠️" : "🎉"}
              <b style={{ marginLeft: 6 }}>{shop.name}</b>
              {expired
                ? " — Your free trial has expired. Subscribe to keep selling."
                : ` — Free trial active, ${daysLeft} day${daysLeft === 1 ? "" : "s"} left.`}
            </span>
            {(expired || daysLeft < 5) && (
              <button
                data-testid={`trial-upgrade-${shop._id}`}
                onClick={() => (window.location.hash = "#shops")}
                style={{
                  background: tone.color,
                  color: "#fff",
                  border: "none",
                  padding: "6px 12px",
                  borderRadius: 6,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Subscribe now →
              </button>
            )}
          </div>
        );
      })}

      {error && (
        <div
          data-testid="dashboard-error"
          style={{
            background: "#fee2e2",
            color: "#991b1b",
            padding: 10,
            borderRadius: 6,
            marginTop: 10,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 15, marginTop: 20, flexWrap: "wrap" }}>
        <Card testid="stat-shops" title="🏪 Shops" value={stats.shops} color="#1e88e5" />
        <Card testid="stat-shopkeepers" title="👥 Shopkeepers" value={stats.shopkeepers} color="#43a047" />
        <Card testid="stat-assignments" title="🔗 Assignments" value={stats.assignments} color="#fb8c00" />
        <Card testid="stat-revenue" title="💰 Revenue" value={`KES ${stats.revenue}`} color="#8e24aa" />
      </div>

      <div
        style={{
          marginTop: 30,
          padding: 20,
          border: "1px solid #e2e8f0",
          borderRadius: 10,
          background: "#fff",
        }}
        data-testid="shop-analytics-section"
      >
        <h3 style={{ marginTop: 0 }}>📈 Shop funnel — last 30 days</h3>
        {analytics.length === 0 ? (
          <p style={{ color: "#475569", fontSize: 14 }}>
            No analytics yet — once customers start visiting your shops, views, cart adds, checkouts and paid orders will show here with the live conversion rate.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14,
                minWidth: 640,
              }}
            >
              <thead>
                <tr style={{ textAlign: "left", color: "#334155" }}>
                  <th style={th}>Shop</th>
                  <th style={th}>Views</th>
                  <th style={th}>Add to cart</th>
                  <th style={th}>Checkout</th>
                  <th style={th}>Orders</th>
                  <th style={th}>Paid</th>
                  <th style={th}>Conv. rate</th>
                </tr>
              </thead>
              <tbody>
                {analytics.map(({ shop, data }) => (
                  <tr
                    key={shop._id}
                    data-testid={`shop-funnel-${shop._id}`}
                    style={{ borderTop: "1px solid #e2e8f0" }}
                  >
                    <td style={td}>
                      <b style={{ color: "#0f172a" }}>{shop.name}</b>
                      {shop.slug && (
                        <div style={{ fontSize: 12, color: "#64748b" }}>/shop/{shop.slug}</div>
                      )}
                    </td>
                    <td style={td}>{data.views || 0}</td>
                    <td style={td}>{data.add_to_cart || 0}</td>
                    <td style={td}>{data.checkout_start || 0}</td>
                    <td style={td}>{data.orders || 0}</td>
                    <td style={td}>{data.paid_orders || 0}</td>
                    <td style={{ ...td, fontWeight: 700, color: "#15803d" }}>
                      {(data.conversion_rate || 0).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const th = { padding: "8px 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.3 };
const td = { padding: "10px 10px", color: "#0f172a" };

export default Dashboard;
