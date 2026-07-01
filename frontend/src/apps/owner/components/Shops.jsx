import { useEffect, useState } from "react";
import API from "../../../api/client";
import MPesaSettingsModal from "../../../components/MPesaSettingsModal";
import { shareOnWhatsApp, copyShopLink } from "../../../utils/share";
import { toast } from "../../../utils/toast";
import { redirectTop } from "../../../utils/navigate";

// Compact M-Pesa onboarding badge for shop cards. Source of truth is the
// MPesaSettingsModal — this version is a lightweight read-only mirror.
function shopMpesaBadge(shop) {
  const stkOk = Boolean(
    shop?.mpesa_consumer_key &&
      shop?.mpesa_consumer_secret &&
      shop?.mpesa_passkey &&
      shop?.mpesa_shortcode,
  );
  const stkPartial =
    !stkOk &&
    Boolean(
      shop?.mpesa_consumer_key ||
        shop?.mpesa_consumer_secret ||
        shop?.mpesa_passkey ||
        shop?.mpesa_shortcode,
    );
  const hasManual = Boolean(shop?.mpesa_till_number || shop?.mpesa_paybill_number);

  if (stkOk) {
    return { code: "ready", icon: "🟢", label: "M-Pesa Ready", bg: "#dcfce7", fg: "#15803d" };
  }
  if (stkPartial) {
    return { code: "incomplete", icon: "🟡", label: "Incomplete", bg: "#fef3c7", fg: "#92400e" };
  }
  if (hasManual) {
    return { code: "manual_only", icon: "🟡", label: "Manual only", bg: "#fef3c7", fg: "#92400e" };
  }
  return { code: "none", icon: "🔴", label: "Not configured", bg: "#fee2e2", fg: "#991b1b" };
}

function Shops({ search = "" }) {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mpesaShop, setMpesaShop] = useState(null);

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
                const res = await API.post(`/api/owner/shops/${shop._id}/subscribe`, {
                  plan: "pos_online",
                  callback_url: `${window.location.origin}/payment-success`,
                });
                if (res.data?.activated) {
                  await loadShops();
                  toast("✅ Online store activated.", { variant: "success" });
                  return;
                }
                const url = res.data?.authorization_url;
                if (url) {
                  toast("Redirecting to Paystack…");
                  redirectTop(url);
                } else {
                  toast("Could not start payment — please try again.");
                }
              } catch (err) {
                toast(err?.response?.data?.detail || "Failed to subscribe");
              }
            };

            const copyLink = async () => {
              if (!shop.slug) return;
              const ok = await copyShopLink(shop.slug);
              toast(ok ? "Link copied" : "Could not copy link", {
                variant: ok ? "success" : "default",
              });
            };

            const whatsappShare = () => {
              if (!shop.slug) return;
              shareOnWhatsApp(shop.slug);
              toast("Opening WhatsApp…");
            };

            const recoverActivation = async () => {
              const ref = window.prompt(
                "Already paid via Paystack but the link still says 'shop unavailable'?\n\nPaste the Paystack reference (or leave blank to auto-find your latest paid subscription):",
                "",
              );
              if (ref === null) return;
              try {
                const res = await API.post(
                  `/api/owner/shops/${shop._id}/recover-activation`,
                  { paystack_reference: (ref || "").trim() || undefined },
                );
                if (res.data?.activated) {
                  toast("✅ Online activation recovered.", { variant: "success" });
                } else {
                  toast("Activation already in place.", { variant: "success" });
                }
                await loadShops();
              } catch (err) {
                toast(
                  err?.response?.data?.detail || "Could not recover activation",
                );
              }
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
                      <div style={{ marginTop: 6, fontSize: 12, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                        🔗 Public link:{" "}
                        <a href={shareUrl} target="_blank" rel="noreferrer" style={{ color: "#0f766e", wordBreak: "break-all" }}>
                          {shareUrl}
                        </a>
                        <button
                          data-testid={`copy-link-${shop._id}`}
                          onClick={copyLink}
                          style={{
                            padding: "6px 10px",
                            minHeight: 32,
                            fontSize: 12,
                            cursor: "pointer",
                            borderRadius: 6,
                            border: "1px solid #e2e8f0",
                            background: "white",
                            color: "#0f172a",
                            fontWeight: 600,
                          }}
                        >
                          📋 Copy link
                        </button>
                      </div>
                    )}
                    <small style={{ color: "#94a3b8" }}>ID: {shop._id}</small>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "stretch", minWidth: 170 }}>
                    {shop.slug && (
                      <button
                        data-testid={`whatsapp-share-${shop._id}`}
                        onClick={whatsappShare}
                        style={{
                          background: "#25D366",
                          color: "white",
                          border: "none",
                          padding: "10px 14px",
                          minHeight: 44,
                          cursor: "pointer",
                          borderRadius: 8,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                        }}
                      >
                        📲 Share on WhatsApp
                      </button>
                    )}
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
                      data-testid={`recover-activation-${shop._id}`}
                      onClick={recoverActivation}
                      title="Already paid? Re-run activation against your Paystack receipt"
                      style={{
                        background: "transparent",
                        color: "#0f766e",
                        border: "1px dashed #0f766e",
                        padding: "6px 10px",
                        cursor: "pointer",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      🛟 Already paid? Recover
                    </button>
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
                      data-testid={`mpesa-settings-btn-${shop._id}`}
                      onClick={() => setMpesaShop(shop)}
                      style={{
                        background: "#0f172a",
                        color: "white",
                        border: "none",
                        padding: "8px 12px",
                        cursor: "pointer",
                        borderRadius: 6,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      💳 M-Pesa settings
                      {(() => {
                        const b = shopMpesaBadge(shop);
                        return (
                          <span
                            data-testid={`mpesa-badge-${shop._id}-${b.code}`}
                            style={{
                              background: b.bg,
                              color: b.fg,
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "2px 6px",
                              borderRadius: 999,
                              letterSpacing: 0.2,
                            }}
                          >
                            {b.icon} {b.label}
                          </span>
                        );
                      })()}
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

      <MPesaSettingsModal
        open={!!mpesaShop}
        shop={mpesaShop}
        onClose={() => setMpesaShop(null)}
        onSaved={loadShops}
      />
    </div>
  );
}

export default Shops;
