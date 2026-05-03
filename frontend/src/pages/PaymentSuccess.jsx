import { useEffect, useState } from "react";
import API from "../api/client";

/**
 * /payment-success — UI-only page Paystack redirects back to after a
 * successful payment. Does NOT activate anything itself — the webhook
 * (or the return-to-site auto-verify in App.jsx) owns activation.
 *
 * It calls /paystack/verify as a *hint* so the user sees instant feedback
 * when the webhook is slightly delayed.
 */
export default function PaymentSuccess() {
  const [state, setState] = useState("verifying");
  const params = new URLSearchParams(window.location.search);
  const reference = params.get("reference") || params.get("trxref");

  useEffect(() => {
    if (!reference) {
      setState("no-ref");
      return;
    }
    API.post("/api/payments/paystack/verify", { reference })
      .then((r) => {
        if (r.data?.verified) setState("success");
        else setState("pending");
      })
      .catch(() => setState("pending"));
  }, [reference]);

  const go = () => {
    const target = localStorage.getItem("token") ? "/owner" : "/";
    window.location.href = target;
  };

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ fontSize: 48 }}>
          {state === "success" ? "✅" : state === "no-ref" ? "ℹ️" : "⏳"}
        </div>
        <h2 style={{ margin: "8px 0", color: "#0f172a" }}>
          {state === "success"
            ? "Payment successful"
            : state === "no-ref"
            ? "No payment reference"
            : "Confirming your payment…"}
        </h2>
        <p style={{ color: "#334155", fontSize: 14 }}>
          {state === "success"
            ? "Your plan is being activated. You can return to your dashboard."
            : state === "no-ref"
            ? "We didn't receive a payment reference. If you just paid, your shop will update automatically."
            : "This takes a few seconds. You can close this page — we'll update your shop in the background."}
        </p>
        {reference && (
          <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
            Reference: <code>{reference}</code>
          </p>
        )}
        <button onClick={go} data-testid="payment-success-continue" style={btn}>
          Continue →
        </button>
      </div>
    </div>
  );
}

const wrap = {
  minHeight: "100svh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background: "#f8fafc",
};
const card = {
  background: "white",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 28,
  maxWidth: 440,
  width: "100%",
  textAlign: "center",
  boxShadow: "0 12px 32px rgba(15,23,42,0.08)",
};
const btn = {
  marginTop: 16,
  padding: "12px 22px",
  minHeight: 46,
  background: "#16a34a",
  color: "white",
  border: "none",
  borderRadius: 999,
  fontWeight: 700,
  cursor: "pointer",
};
