import { useEffect, useState, useCallback } from "react";
import API from "../api/client";

/**
 * CreditorsPanel — debt ledger UI used in Owner sidebar + POS modal.
 *
 *   • Lists credits (open + paid) scoped by tenant
 *   • Add existing debt (manual import from paper books)
 *   • Record payment with method selector (cash / m-pesa / manual)
 *   • Send M-Pesa STK push to debtor — auto-deducts on Daraja success
 *   • View transaction history per credit
 */
export default function CreditorsPanel({ shopId, allShops = [], onClose }) {
  const [credits, setCredits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [scopeShopId, setScopeShopId] = useState(shopId || "");
  const [filter, setFilter] = useState("open"); // open | paid | all
  const [showAdd, setShowAdd] = useState(false);
  const [historyFor, setHistoryFor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (scopeShopId) params.set("shop_id", scopeShopId);
      params.set("status", filter);
      const res = await API.get(`/api/credits?${params.toString()}`);
      setCredits(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load credits", err);
      setCredits([]);
    } finally {
      setLoading(false);
    }
  }, [scopeShopId, filter]);

  useEffect(() => { load(); }, [load]);

  const recordPayment = async (c) => {
    const method = window.prompt(
      `Record payment for ${c.customer_name || c.name} (owes KES ${(c.balance || 0).toLocaleString()})\n\nType payment method:\n  cash\n  mpesa\n  manual`,
      "cash",
    );
    if (method === null) return;
    const m = (method || "").toLowerCase().trim();
    if (!["cash", "mpesa", "manual"].includes(m)) {
      return alert("Method must be cash, mpesa, or manual.");
    }
    if (m === "mpesa") {
      return sendStk(c);
    }
    const raw = window.prompt(
      `Amount in KES (max ${c.balance || 0}):`,
      String(c.balance || 0),
    );
    if (raw === null) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      return alert("Enter a valid amount > 0.");
    }
    setBusyId(c._id);
    try {
      await API.post(`/api/credits/${c._id}/repay`, { amount, method: m });
      await load();
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to record payment");
    } finally {
      setBusyId("");
    }
  };

  const sendStk = async (c) => {
    const phone = c.phone || window.prompt("Customer phone (254…):", "");
    if (!phone) return alert("Phone is required for M-Pesa STK.");
    const raw = window.prompt(
      `Send M-Pesa prompt to ${phone}\nAmount in KES (max ${c.balance || 0}):`,
      String(c.balance || 0),
    );
    if (raw === null) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      return alert("Enter a valid amount > 0.");
    }
    setBusyId(c._id);
    try {
      const res = await API.post(`/api/credits/${c._id}/repay-stk`, {
        amount,
        phone,
      });
      alert(
        `M-Pesa prompt sent to ${phone} for KES ${amount}.\nReference: ${res.data.reference}\nBalance updates after the customer enters their PIN.`,
      );
      await load();
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to send STK push");
    } finally {
      setBusyId("");
    }
  };

  const totalOwed = credits.reduce((s, c) => s + (c.balance || 0), 0);

  return (
    <div data-testid="creditors-panel">
      <div style={headerRow}>
        <h2 style={{ margin: 0 }}>💳 Credit ledger</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {allShops.length > 1 && (
            <select
              data-testid="creditors-shop-select"
              value={scopeShopId}
              onChange={(e) => setScopeShopId(e.target.value)}
              style={selectInput}
            >
              <option value="">All shops</option>
              {allShops.map((s) => (
                <option key={s._id} value={s._id}>{s.name || s._id}</option>
              ))}
            </select>
          )}
          <select
            data-testid="creditors-status-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={selectInput}
          >
            <option value="open">Open</option>
            <option value="paid">Paid</option>
            <option value="all">All</option>
          </select>
          <button
            onClick={() => setShowAdd(true)}
            data-testid="creditors-add-existing"
            style={btn("#0f766e")}
          >
            ➕ Add Existing Debt
          </button>
          {onClose && (
            <button onClick={onClose} data-testid="creditors-close" style={btn("#0f172a")}>
              Close
            </button>
          )}
        </div>
      </div>

      <div style={summaryStrip}>
        Total outstanding · <span style={{ color: "#b45309" }}>KES {totalOwed.toLocaleString()}</span>
        <span style={{ marginLeft: 16, color: "#475569", fontWeight: 400 }}>
          {credits.length} {filter === "all" ? "credit" : filter} record{credits.length === 1 ? "" : "s"}
        </span>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : credits.length === 0 ? (
        <p style={{ color: "#64748b" }}>
          No {filter === "all" ? "" : filter} credits.{" "}
          <span style={{ color: "#0f766e" }}>Click ➕ Add Existing Debt</span> to import from your book.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {credits.map((c) => (
            <div key={c._id} data-testid={`creditor-row-${c._id}`} style={cardRow}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, color: "#0f172a" }}>
                    {c.customer_name || c.name}
                  </span>
                  <StatusBadge status={c.status} />
                  {c.source === "manual_import" && (
                    <span style={tag("#fef3c7", "#92400e")}>📒 Imported</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "#475569" }}>
                  {c.phone ? `📞 ${c.phone}` : "no phone"}
                  {c.notes ? ` · ${c.notes}` : ""}
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                  Total KES {(c.total_amount || 0).toLocaleString()} · Paid KES{" "}
                  {(c.amount_paid || 0).toLocaleString()}
                </div>
              </div>
              <div style={balanceCell(c.balance)}>
                KES {(c.balance || 0).toLocaleString()}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button
                  onClick={() => recordPayment(c)}
                  disabled={busyId === c._id || c.status === "paid"}
                  data-testid={`creditor-${c._id}-record-payment`}
                  style={btn("#16a34a", busyId === c._id || c.status === "paid")}
                >
                  💰 Record Payment
                </button>
                <button
                  onClick={() => setHistoryFor(c)}
                  data-testid={`creditor-${c._id}-history`}
                  style={btn("#475569")}
                >
                  🕓 History
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddExistingDebtModal
          shopId={scopeShopId || shopId}
          allShops={allShops}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(); }}
        />
      )}

      {historyFor && (
        <HistoryModal
          credit={historyFor}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    paid: { bg: "#dcfce7", color: "#166534", text: "✅ PAID" },
    open: { bg: "#fee2e2", color: "#991b1b", text: "OPEN" },
  };
  const s = map[status] || map.open;
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999 }}>
      {s.text}
    </span>
  );
}

function AddExistingDebtModal({ shopId, allShops, onClose, onSaved }) {
  const [form, setForm] = useState({
    customer_name: "",
    phone: "",
    total_amount: "",
    amount_paid: "",
    notes: "",
    shop_id: shopId || (allShops[0] || {})._id || "",
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.customer_name.trim()) return alert("Customer name required");
    if (!form.shop_id) return alert("Pick a shop");
    const total = Number(form.total_amount);
    const paid = Number(form.amount_paid || 0);
    if (!Number.isFinite(total) || total <= 0) return alert("Total amount must be > 0");
    if (paid < 0) return alert("Already-paid amount cannot be negative");
    if (paid > total) return alert("Already-paid cannot exceed total");
    setSaving(true);
    try {
      await API.post("/api/credits/manual-create", {
        customer_name: form.customer_name.trim(),
        phone: (form.phone || "").trim() || null,
        total_amount: total,
        amount_paid: paid,
        notes: (form.notes || "").trim() || null,
        shop_id: form.shop_id,
      });
      onSaved();
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to add debt");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title="➕ Add existing debt (from your book)">
      {allShops.length > 1 && (
        <Field label="Shop">
          <select
            value={form.shop_id}
            onChange={(e) => setForm({ ...form, shop_id: e.target.value })}
            style={textInput}
          >
            {allShops.map((s) => <option key={s._id} value={s._id}>{s.name || s._id}</option>)}
          </select>
        </Field>
      )}
      <Field label="Customer name *">
        <input
          data-testid="add-debt-name"
          value={form.customer_name}
          onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
          placeholder="e.g. Mama Njeri"
          style={textInput}
        />
      </Field>
      <Field label="Phone (optional)">
        <input
          data-testid="add-debt-phone"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="2547…"
          style={textInput}
        />
      </Field>
      <Field label="Total amount owed (KES) *">
        <input
          data-testid="add-debt-total"
          type="number"
          min="0"
          value={form.total_amount}
          onChange={(e) => setForm({ ...form, total_amount: e.target.value })}
          style={textInput}
        />
      </Field>
      <Field label="Already paid (KES)">
        <input
          data-testid="add-debt-paid"
          type="number"
          min="0"
          value={form.amount_paid}
          onChange={(e) => setForm({ ...form, amount_paid: e.target.value })}
          placeholder="0"
          style={textInput}
        />
      </Field>
      <Field label="Notes">
        <textarea
          data-testid="add-debt-notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={2}
          placeholder="e.g. 1 bag of maize flour"
          style={{ ...textInput, resize: "vertical" }}
        />
      </Field>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button onClick={onClose} style={btn("#475569")}>Cancel</button>
        <button
          onClick={submit}
          disabled={saving}
          data-testid="add-debt-submit"
          style={btn("#16a34a", saving)}
        >
          {saving ? "Saving…" : "Save debt"}
        </button>
      </div>
    </Modal>
  );
}

function HistoryModal({ credit, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await API.get(`/api/credits/${credit._id}/transactions`);
        if (!cancel) setRows(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        if (!cancel) setRows([]);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [credit._id]);

  return (
    <Modal onClose={onClose} title={`🕓 ${credit.customer_name || credit.name}`}>
      <div style={{ fontSize: 13, color: "#475569", marginBottom: 12 }}>
        Total KES {(credit.total_amount || 0).toLocaleString()} · Paid KES{" "}
        {(credit.amount_paid || 0).toLocaleString()} · Balance KES{" "}
        <b>{(credit.balance || 0).toLocaleString()}</b>
      </div>
      {loading ? <p>Loading…</p> : rows.length === 0 ? (
        <p style={{ color: "#64748b" }}>No transactions yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
          {rows.map((r) => (
            <li key={r._id} style={historyRow}>
              <div>
                <b>KES {(r.amount || 0).toLocaleString()}</b>
                <span style={{ marginLeft: 8, fontSize: 11, color: "#475569" }}>
                  · {r.method || "—"}
                </span>
                {r.reference && (
                  <div style={{ fontSize: 11, color: "#64748b" }}>ref: {r.reference}</div>
                )}
              </div>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>
                {(r.created_at || "").split("T")[0]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
        display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1100, padding: 16,
      }}
    >
      <div style={{ background: "#fff", width: "min(520px, 100%)", maxHeight: "90vh", overflow: "auto", borderRadius: 14, padding: 18, boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>
        <h3 style={{ margin: 0, marginBottom: 14 }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

const headerRow = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  gap: 12, flexWrap: "wrap", marginBottom: 16,
};
const summaryStrip = {
  background: "#f8fafc", padding: "10px 14px", borderRadius: 8, marginBottom: 14,
  fontSize: 14, color: "#0f172a", fontWeight: 600,
};
const cardRow = {
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10,
  padding: "12px 14px", display: "flex", gap: 12, alignItems: "center",
  justifyContent: "space-between", flexWrap: "wrap",
};
const balanceCell = (bal) => ({
  fontWeight: 800, color: (bal || 0) > 0 ? "#b91c1c" : "#15803d",
  minWidth: 100, textAlign: "right",
});
const tag = (bg, color) => ({
  background: bg, color, fontSize: 11, fontWeight: 700,
  padding: "2px 8px", borderRadius: 999,
});
const btn = (color, disabled) => ({
  padding: "8px 12px", background: disabled ? "#cbd5e1" : color,
  color: "#fff", border: "none", borderRadius: 6, fontWeight: 700,
  fontSize: 13, cursor: disabled ? "not-allowed" : "pointer",
});
const selectInput = {
  padding: "6px 8px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", fontSize: 13,
};
const textInput = {
  width: "100%", padding: "8px 10px", borderRadius: 6,
  border: "1px solid #cbd5e1", fontSize: 14, outline: "none", boxSizing: "border-box",
};
const historyRow = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13,
};
