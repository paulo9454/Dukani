import { useEffect, useState, useCallback } from "react";
import API from "../api/client";

/**
 * CreditorsPanel — reusable list of credit customers + payment actions.
 *
 *  • Pass `shopId` to scope (owner can swap shops; POS hard-binds to one).
 *  • Owner / shopkeeper both use this — backend already enforces tenant.
 *  • Two actions per creditor: Record cash payment, Send M-Pesa STK push.
 */
export default function CreditorsPanel({ shopId, allShops = [], onClose }) {
  const [creditors, setCreditors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [scopeShopId, setScopeShopId] = useState(shopId || "");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get("/api/credit-customers");
      const all = Array.isArray(res.data) ? res.data : [];
      setCreditors(scopeShopId ? all.filter((c) => c.shop_id === scopeShopId) : all);
    } catch (err) {
      console.error("Failed to load creditors", err);
      setCreditors([]);
    } finally {
      setLoading(false);
    }
  }, [scopeShopId]);

  useEffect(() => {
    load();
  }, [load]);

  const recordCash = async (c) => {
    const raw = window.prompt(
      `Cash payment from ${c.name} (owes KES ${(c.balance || 0).toLocaleString()})\nEnter amount received:`,
      String(c.balance || 0),
    );
    if (raw === null) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      return alert("Enter a valid amount greater than 0.");
    }
    setBusyId(c._id);
    try {
      await API.post(`/api/credit-customers/${c._id}/payment`, {
        amount,
        method: "cash",
      });
      await load();
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to record payment");
    } finally {
      setBusyId("");
    }
  };

  const sendStk = async (c) => {
    const raw = window.prompt(
      `Send M-Pesa prompt to ${c.name} (${c.phone})\nAmount in KES:`,
      String(c.balance || 0),
    );
    if (raw === null) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      return alert("Enter a valid amount greater than 0.");
    }
    setBusyId(c._id);
    try {
      const res = await API.post(`/api/credit-customers/${c._id}/payment-stk`, {
        amount,
      });
      alert(
        `M-Pesa prompt sent to ${c.phone} for KES ${amount}.\nReference: ${res.data.reference}\nBalance updates after the customer enters their PIN.`,
      );
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to send STK push");
    } finally {
      setBusyId("");
    }
  };

  const totalOwed = creditors.reduce((s, c) => s + (c.balance || 0), 0);

  return (
    <div data-testid="creditors-panel">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <h2 style={{ margin: 0 }}>💳 Creditors</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {allShops.length > 1 && (
            <select
              data-testid="creditors-shop-select"
              value={scopeShopId}
              onChange={(e) => setScopeShopId(e.target.value)}
              style={{ padding: 6, borderRadius: 6, border: "1px solid #cbd5e1" }}
            >
              <option value="">All shops</option>
              {allShops.map((s) => (
                <option key={s._id} value={s._id}>{s.name || s._id}</option>
              ))}
            </select>
          )}
          {onClose && (
            <button
              onClick={onClose}
              data-testid="creditors-close"
              style={{ padding: "8px 12px", border: "none", background: "#0f172a", color: "#fff", borderRadius: 6, cursor: "pointer" }}
            >
              Close
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          background: "#f8fafc",
          padding: "10px 14px",
          borderRadius: 8,
          marginBottom: 14,
          fontSize: 14,
          color: "#0f172a",
          fontWeight: 600,
        }}
      >
        Total outstanding · <span style={{ color: "#b45309" }}>KES {totalOwed.toLocaleString()}</span>
        <span style={{ marginLeft: 16, color: "#475569", fontWeight: 400 }}>
          {creditors.length} creditor{creditors.length === 1 ? "" : "s"}
        </span>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : creditors.length === 0 ? (
        <p style={{ color: "#64748b" }}>No creditors yet for this scope.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {creditors.map((c) => (
            <div
              key={c._id}
              data-testid={`creditor-row-${c._id}`}
              style={{
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                padding: "12px 14px",
                display: "flex",
                gap: 12,
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: "#0f172a" }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "#475569" }}>
                  📞 {c.phone}
                  {c.credit_limit ? ` · limit KES ${c.credit_limit.toLocaleString()}` : ""}
                </div>
              </div>
              <div
                style={{
                  fontWeight: 800,
                  color: (c.balance || 0) > 0 ? "#b91c1c" : "#15803d",
                  minWidth: 100,
                  textAlign: "right",
                }}
              >
                KES {(c.balance || 0).toLocaleString()}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => recordCash(c)}
                  disabled={busyId === c._id || !c.balance}
                  data-testid={`creditor-${c._id}-cash`}
                  style={btn("#16a34a", busyId === c._id || !c.balance)}
                >
                  💵 Cash paid
                </button>
                <button
                  onClick={() => sendStk(c)}
                  disabled={busyId === c._id || !c.balance}
                  data-testid={`creditor-${c._id}-stk`}
                  style={btn("#0ea5e9", busyId === c._id || !c.balance)}
                >
                  📲 Send M-Pesa
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const btn = (color, disabled) => ({
  padding: "8px 12px",
  background: disabled ? "#cbd5e1" : color,
  color: "#fff",
  border: "none",
  borderRadius: 6,
  fontWeight: 700,
  fontSize: 13,
  cursor: disabled ? "not-allowed" : "pointer",
});
