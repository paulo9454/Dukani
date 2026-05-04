import { useEffect, useState } from "react";
import API from "../api/client";

/**
 * MPesaSettingsModal — lets shop owners plug in their own Daraja
 * credentials (consumer key, secret, passkey, PayBill/Till).
 * Sensitive fields are shown masked (•••••) on load; to rotate a secret,
 * the owner types a new one and clicks Save.
 */
export default function MPesaSettingsModal({ open, shop, onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState(null);
  const [form, setForm] = useState({
    mpesa_shortcode: "",
    mpesa_consumer_key: "",
    mpesa_consumer_secret: "",
    mpesa_passkey: "",
    mpesa_business_name: "",
    mpesa_env: "sandbox",
    mpesa_till_number: "",
    mpesa_paybill_number: "",
    mpesa_account_name: "",
  });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // Test STK push state
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // {ok, message} | {error}

  useEffect(() => {
    if (!open || !shop?._id) return;
    (async () => {
      try {
        setLoading(true);
        setError("");
        setSaved(false);
        const r = await API.get(`/api/shop/${shop._id}/mpesa-settings`);
        setCurrent(r.data);
        setForm((prev) => ({
          ...prev,
          mpesa_shortcode: r.data?.mpesa_shortcode || "",
          mpesa_business_name: r.data?.mpesa_business_name || shop?.name || "",
          mpesa_env: r.data?.mpesa_env || "sandbox",
          mpesa_till_number: r.data?.mpesa_till_number || "",
          mpesa_paybill_number: r.data?.mpesa_paybill_number || "",
          mpesa_account_name: r.data?.mpesa_account_name || "",
          // secrets are write-only on this form
          mpesa_consumer_key: "",
          mpesa_consumer_secret: "",
          mpesa_passkey: "",
        }));
      } catch (err) {
        setError(err?.response?.data?.detail || "Could not load M-Pesa settings");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, shop?._id]);

  if (!open) return null;

  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    try {
      setSaving(true);
      setError("");
      // Only send secret fields that the owner actually typed — empty =
      // keep existing value server-side.
      const payload = {
        mpesa_shortcode: form.mpesa_shortcode,
        mpesa_business_name: form.mpesa_business_name,
        mpesa_env: form.mpesa_env,
        mpesa_till_number: form.mpesa_till_number,
        mpesa_paybill_number: form.mpesa_paybill_number,
        mpesa_account_name: form.mpesa_account_name,
      };
      if (form.mpesa_consumer_key) payload.mpesa_consumer_key = form.mpesa_consumer_key;
      if (form.mpesa_consumer_secret) payload.mpesa_consumer_secret = form.mpesa_consumer_secret;
      if (form.mpesa_passkey) payload.mpesa_passkey = form.mpesa_passkey;

      await API.put(`/api/shop/${shop._id}/mpesa-settings`, payload);
      setSaved(true);
      onSaved?.();
      // Reload so the "Configured" chip and masked previews refresh,
      // and the owner can run Test STK push against the freshly-saved keys
      // without closing the modal.
      try {
        const r = await API.get(`/api/shop/${shop._id}/mpesa-settings`);
        setCurrent(r.data);
        setForm((prev) => ({
          ...prev,
          mpesa_consumer_key: "",
          mpesa_consumer_secret: "",
          mpesa_passkey: "",
        }));
      } catch {
        /* ignore — non-fatal */
      }
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    const clean = (testPhone || "").replace(/\s|-/g, "");
    if (!clean || clean.length < 9) {
      setTestResult({ error: "Enter a valid phone number (e.g. 254712345678)" });
      return;
    }
    try {
      setTesting(true);
      setTestResult(null);
      const r = await API.post(
        `/api/shop/${shop._id}/mpesa-settings/test`,
        { phone: clean }
      );
      setTestResult({
        ok: true,
        message: r.data?.message || "Test prompt sent. Check your phone.",
        reference: r.data?.reference,
        env: r.data?.env,
      });
    } catch (err) {
      setTestResult({
        error: err?.response?.data?.detail || "Test failed. Check credentials and try again.",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={backdrop}>
      <div style={modal} data-testid="mpesa-settings-modal">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, color: "#0f172a" }}>
            💳 M-Pesa settings
            {current?.mpesa_configured && (
              <span style={configuredChip}>Configured</span>
            )}
          </h2>
          <button onClick={onClose} style={closeBtn} data-testid="mpesa-settings-close">
            ✕
          </button>
        </div>
        <p style={{ margin: "4px 0 12px", color: "#475569", fontSize: 13 }}>
          Customers pay directly into your M-Pesa PayBill / Till. Keys come
          from the Safaricom Daraja portal.
        </p>

        {loading ? (
          <p>Loading…</p>
        ) : (
          <>
            <label style={label}>Till / PayBill shortcode</label>
            <input
              data-testid="mpesa-shortcode"
              value={form.mpesa_shortcode}
              onChange={(e) => update("mpesa_shortcode", e.target.value)}
              placeholder="e.g. 174379 (sandbox) or your real PayBill"
              style={input}
            />

            <label style={label}>Business name (shown on STK prompt)</label>
            <input
              data-testid="mpesa-business-name"
              value={form.mpesa_business_name}
              onChange={(e) => update("mpesa_business_name", e.target.value)}
              placeholder={shop?.name || "Your shop name"}
              style={input}
            />

            <label style={label}>Environment</label>
            <select
              data-testid="mpesa-env"
              value={form.mpesa_env}
              onChange={(e) => update("mpesa_env", e.target.value)}
              style={input}
            >
              <option value="sandbox">Sandbox (for testing)</option>
              <option value="production">Production (real money)</option>
            </select>

            <div
              style={{
                marginTop: 16,
                padding: 12,
                background: "#f8fafc",
                border: "1px dashed #cbd5e1",
                borderRadius: 10,
              }}
            >
              <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 13 }}>
                💵 Manual M-Pesa (fallback)
              </div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
                Shown to customers when STK push isn&apos;t available. Fill in
                your Till OR PayBill — one is enough.
              </div>

              <label style={{ ...label, marginTop: 10 }}>Till Number</label>
              <input
                data-testid="mpesa-till"
                value={form.mpesa_till_number}
                onChange={(e) => update("mpesa_till_number", e.target.value)}
                placeholder="e.g. 123456"
                style={input}
              />

              <label style={label}>PayBill Number</label>
              <input
                data-testid="mpesa-paybill"
                value={form.mpesa_paybill_number}
                onChange={(e) => update("mpesa_paybill_number", e.target.value)}
                placeholder="e.g. 400123"
                style={input}
              />

              <label style={label}>Account / Reference (PayBill only)</label>
              <input
                data-testid="mpesa-account"
                value={form.mpesa_account_name}
                onChange={(e) => update("mpesa_account_name", e.target.value)}
                placeholder="e.g. SHOP01 — leave empty to use order ID"
                style={input}
              />
            </div>

            <label style={label}>
              Consumer key{" "}
              {current?.mpesa_consumer_key_masked && (
                <span style={hint}>current: {current.mpesa_consumer_key_masked}</span>
              )}
            </label>
            <input
              data-testid="mpesa-consumer-key"
              type="password"
              autoComplete="off"
              value={form.mpesa_consumer_key}
              onChange={(e) => update("mpesa_consumer_key", e.target.value)}
              placeholder={current?.mpesa_consumer_key_masked ? "Leave empty to keep" : "Paste Daraja consumer key"}
              style={input}
            />

            <label style={label}>
              Consumer secret{" "}
              {current?.mpesa_consumer_secret_masked && (
                <span style={hint}>current: {current.mpesa_consumer_secret_masked}</span>
              )}
            </label>
            <input
              data-testid="mpesa-consumer-secret"
              type="password"
              autoComplete="off"
              value={form.mpesa_consumer_secret}
              onChange={(e) => update("mpesa_consumer_secret", e.target.value)}
              placeholder={current?.mpesa_consumer_secret_masked ? "Leave empty to keep" : "Paste Daraja consumer secret"}
              style={input}
            />

            <label style={label}>
              Passkey{" "}
              {current?.mpesa_passkey_masked && (
                <span style={hint}>current: {current.mpesa_passkey_masked}</span>
              )}
            </label>
            <input
              data-testid="mpesa-passkey"
              type="password"
              autoComplete="off"
              value={form.mpesa_passkey}
              onChange={(e) => update("mpesa_passkey", e.target.value)}
              placeholder={current?.mpesa_passkey_masked ? "Leave empty to keep" : "Paste Lipa-Na-MPESA passkey"}
              style={input}
            />

            {error && (
              <p data-testid="mpesa-error" style={{ color: "#dc2626", fontSize: 13, marginTop: 8 }}>
                {error}
              </p>
            )}
            {saved && (
              <p data-testid="mpesa-saved" style={{ color: "#15803d", fontSize: 13, marginTop: 8 }}>
                ✅ Saved
              </p>
            )}

            {/* ─── Test STK push ─── */}
            {current?.mpesa_configured && (
              <div
                data-testid="mpesa-test-section"
                style={{
                  marginTop: 16,
                  padding: 14,
                  background: "#f1f5f9",
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                }}
              >
                <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>
                  🧪 Test STK push
                </div>
                <div style={{ fontSize: 12, color: "#475569", marginBottom: 10 }}>
                  Send a <b>KES&nbsp;1</b> prompt to your phone to verify keys
                  work — no order is created, no stock is touched.
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input
                    data-testid="mpesa-test-phone"
                    type="tel"
                    inputMode="tel"
                    placeholder="Your phone (254712345678)"
                    value={testPhone}
                    onChange={(e) => {
                      setTestPhone(e.target.value);
                      if (testResult) setTestResult(null);
                    }}
                    style={{ ...input, flex: "1 1 180px", marginTop: 0 }}
                  />
                  <button
                    data-testid="mpesa-test-btn"
                    onClick={runTest}
                    disabled={testing}
                    style={{
                      minHeight: 42,
                      padding: "0 16px",
                      background: "#0f172a",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      fontWeight: 700,
                      cursor: testing ? "wait" : "pointer",
                      opacity: testing ? 0.7 : 1,
                    }}
                  >
                    {testing ? "Sending…" : "Send test prompt"}
                  </button>
                </div>
                {testResult?.ok && (
                  <div
                    data-testid="mpesa-test-success"
                    style={{
                      marginTop: 10,
                      background: "#dcfce7",
                      color: "#15803d",
                      padding: 10,
                      borderRadius: 8,
                      fontSize: 13,
                    }}
                  >
                    ✅ {testResult.message}
                    {testResult.env && (
                      <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
                        Environment: <b>{testResult.env}</b>
                        {testResult.reference && (
                          <> · Ref: <code>{testResult.reference}</code></>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {testResult?.error && (
                  <div
                    data-testid="mpesa-test-error"
                    style={{
                      marginTop: 10,
                      background: "#fee2e2",
                      color: "#991b1b",
                      padding: 10,
                      borderRadius: 8,
                      fontSize: 13,
                    }}
                  >
                    ❌ {testResult.error}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={onClose} style={secondaryBtn}>
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                data-testid="mpesa-save"
                style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}
              >
                {saving ? "Saving…" : "Save M-Pesa settings"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const backdrop = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
  padding: 16,
};
const modal = {
  width: 480,
  maxWidth: "92vw",
  maxHeight: "92vh",
  overflowY: "auto",
  background: "white",
  borderRadius: 14,
  padding: 22,
  boxShadow: "0 18px 40px rgba(15,23,42,0.25)",
  fontFamily: "system-ui, sans-serif",
};
const input = {
  width: "100%",
  padding: 11,
  minHeight: 42,
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  boxSizing: "border-box",
  marginTop: 4,
  fontSize: 14,
  color: "#0f172a",
};
const label = {
  display: "block",
  marginTop: 12,
  fontSize: 13,
  fontWeight: 600,
  color: "#334155",
};
const hint = {
  marginLeft: 6,
  fontWeight: 400,
  color: "#64748b",
  fontSize: 12,
};
const primaryBtn = {
  flex: 1,
  padding: 12,
  minHeight: 46,
  background: "#16a34a",
  color: "white",
  border: "none",
  borderRadius: 8,
  fontWeight: 700,
  cursor: "pointer",
};
const secondaryBtn = {
  padding: "12px 18px",
  minHeight: 46,
  background: "#f1f5f9",
  color: "#0f172a",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
};
const closeBtn = {
  border: "none",
  background: "transparent",
  fontSize: 20,
  cursor: "pointer",
  color: "#64748b",
  padding: 4,
};
const configuredChip = {
  marginLeft: 8,
  fontSize: 11,
  fontWeight: 700,
  background: "#dcfce7",
  color: "#15803d",
  padding: "2px 8px",
  borderRadius: 999,
  verticalAlign: "middle",
};
