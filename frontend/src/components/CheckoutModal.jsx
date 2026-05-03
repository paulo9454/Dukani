import { useEffect, useRef, useState } from "react";
import API from "../api/client";

/**
 * Simplified customer checkout — no account, no email.
 * Phone → M-Pesa (or Pay on pickup) → Done.
 *
 * On M-Pesa we poll /api/orders/track/{id}?contact=<phone> every 3 s for up
 * to 90 s so the customer sees the payment status flip from pending →
 * success / failed in real time, without needing to refresh.
 * If it times out or fails, a "Resend M-Pesa prompt" button triggers
 * POST /api/payments/mpesa/retry (max 3 retries enforced server-side).
 */
const POLL_TIMEOUT_SECS = 90;

export default function CheckoutModal({ open, onClose, slug, cart, onSuccess }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [method, setMethod] = useState("mpesa");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  // Live polling / retry state (M-Pesa only)
  const [paymentState, setPaymentState] = useState("idle"); // idle|waiting|success|failed|timeout
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [retryLoading, setRetryLoading] = useState(false);
  const [retryError, setRetryError] = useState("");
  const [retriesLeft, setRetriesLeft] = useState(null); // null = unknown / not used
  const pollRef = useRef(null);
  const countdownRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    return () => stopPolling();
  }, []);

  if (!open) return null;

  const total = cart.reduce(
    (sum, c) => sum + Number(c.price || 0) * (c.qty || 0),
    0
  );
  const formatKES = (n) => "KES " + Number(n || 0).toLocaleString();

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  }

  function startPolling(orderId, cleanPhone) {
    stopPolling();
    setSecondsLeft(POLL_TIMEOUT_SECS);
    setPaymentState("waiting");

    countdownRef.current = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);

    pollRef.current = setInterval(async () => {
      try {
        const r = await API.get(
          `/api/orders/track/${orderId}?contact=${encodeURIComponent(cleanPhone)}`
        );
        const ps = r.data?.payment_status;
        if (ps === "success") {
          setPaymentState("success");
          stopPolling();
        } else if (ps === "failed" || ps === "cancelled") {
          setPaymentState("failed");
          stopPolling();
        }
      } catch {
        /* transient — keep polling */
      }
    }, 3000);

    timeoutRef.current = setTimeout(() => {
      stopPolling();
      setPaymentState((prev) => (prev === "waiting" ? "timeout" : prev));
    }, POLL_TIMEOUT_SECS * 1000);
  }

  const pay = async () => {
    const clean = (phone || "").replace(/\s|-/g, "");
    if (!clean) {
      setError("Please enter your phone number");
      return;
    }

    try {
      setError("");
      setLoading(true);

      const orderRes = await API.post("/api/orders/create", {
        shop_slug: slug,
        customer_info: { name: name || "Customer", phone: clean },
        items: cart.map((c) => ({ product_id: c._id, quantity: c.qty })),
      });
      const orderId = orderRes.data.order_id;
      const receiptNumber = orderRes.data.receipt_number;

      let payRes = null;
      if (method === "mpesa") {
        payRes = await API.post("/api/payments/mpesa/stk-push", {
          order_id: orderId,
          phone: clean,
        });
      }

      setResult({
        order_id: orderId,
        receipt_number: receiptNumber,
        method,
        phone: clean,
        total: orderRes.data.total,
        payment: payRes?.data,
      });

      if (method === "mpesa") startPolling(orderId, clean);
      onSuccess?.(orderId);
    } catch (err) {
      setError(err?.response?.data?.detail || "Checkout failed");
    } finally {
      setLoading(false);
    }
  };

  const resendMpesa = async () => {
    if (!result?.order_id || !result?.phone) return;
    try {
      setRetryError("");
      setRetryLoading(true);
      const r = await API.post("/api/payments/mpesa/retry", {
        order_id: result.order_id,
        phone: result.phone,
      });
      if (typeof r.data?.retries_left === "number") {
        setRetriesLeft(r.data.retries_left);
      }
      startPolling(result.order_id, result.phone);
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail || "Could not resend M-Pesa prompt";
      setRetryError(detail);
      if (status === 429) {
        // exhausted — stay on current view
      }
    } finally {
      setRetryLoading(false);
    }
  };

  // ================== RESULT / STATUS VIEWS ==================
  if (result) {
    // Cash — simple receipt
    if (result.method === "cash") {
      return (
        <div style={backdrop}>
          <div style={modal}>
            <h2 style={{ marginTop: 0 }}>🎉 Order placed</h2>
            <p><b>Receipt:</b>{" "}<code>{result.receipt_number || result.order_id.slice(0, 8)}</code></p>
            <p><b>Total:</b> {formatKES(result.total)}</p>
            <p><b>Phone:</b> {result.phone}</p>
            <p style={{ color: "#15803d" }}>Order placed. Pay on pickup.</p>
            <a
              href={`/track/${result.order_id}?contact=${encodeURIComponent(result.phone)}`}
              data-testid="checkout-track-link"
              style={{ display: "inline-block", marginTop: 8, color: "#0f766e", fontSize: 13 }}
            >
              🔎 Track this order →
            </a>
            <button onClick={onClose} style={{ ...primaryBtn, marginTop: 12 }} data-testid="checkout-close">
              Close
            </button>
          </div>
        </div>
      );
    }

    // M-Pesa — live status view
    const showResend = paymentState === "timeout" || paymentState === "failed";

    return (
      <div style={backdrop}>
        <div style={modal} data-testid="mpesa-status-modal">
          {paymentState === "waiting" && (
            <>
              <div style={{ textAlign: "center" }}>
                <div style={spinner} aria-hidden="true" />
                <h2 style={{ margin: "6px 0 4px", color: "#0f172a" }}>
                  📲 Check your phone
                </h2>
                <p style={{ margin: "0 0 6px", color: "#334155", fontSize: 15 }}>
                  We&apos;ve sent an M-Pesa prompt to <b>{result.phone}</b>.
                </p>
                <p style={{ margin: "0 0 14px", color: "#475569", fontSize: 14 }}>
                  Enter your M-Pesa PIN to complete payment of{" "}
                  <b>{formatKES(result.total)}</b>.
                </p>
              </div>

              <ol style={stepList}>
                <li>M-Pesa prompt pops up on your phone</li>
                <li>Enter your M-Pesa PIN</li>
                <li>You&apos;ll see the order marked paid here automatically</li>
              </ol>

              <div
                data-testid="mpesa-countdown"
                style={{
                  textAlign: "center",
                  marginTop: 10,
                  color: "#475569",
                  fontSize: 13,
                }}
              >
                Waiting for confirmation… <b>{secondsLeft}s</b>
              </div>
            </>
          )}

          {paymentState === "success" && (
            <div style={{ textAlign: "center" }} data-testid="mpesa-success">
              <div style={{ fontSize: 44 }}>✅</div>
              <h2 style={{ margin: "6px 0", color: "#15803d" }}>Payment received</h2>
              <p style={{ color: "#334155" }}>
                Receipt <code>{result.receipt_number || result.order_id.slice(0, 8)}</code>
                {" · "} {formatKES(result.total)}
              </p>
            </div>
          )}

          {paymentState === "failed" && (
            <div style={{ textAlign: "center" }} data-testid="mpesa-failed">
              <div style={{ fontSize: 44 }}>❌</div>
              <h2 style={{ margin: "6px 0", color: "#b91c1c" }}>Payment failed</h2>
              <p style={{ color: "#334155", fontSize: 14 }}>
                You may have cancelled the prompt, entered the wrong PIN, or had
                insufficient balance. Try again — no order is lost.
              </p>
            </div>
          )}

          {paymentState === "timeout" && (
            <div style={{ textAlign: "center" }} data-testid="mpesa-timeout">
              <div style={{ fontSize: 44 }}>⏱️</div>
              <h2 style={{ margin: "6px 0", color: "#b45309" }}>
                Still waiting for M-Pesa…
              </h2>
              <p style={{ color: "#334155", fontSize: 14 }}>
                We didn&apos;t get a confirmation yet. If you&apos;ve already
                paid, the order will update when Safaricom notifies us.
              </p>
            </div>
          )}

          {showResend && (
            <div
              style={{
                marginTop: 10,
                padding: 12,
                background: "#f1f5f9",
                borderRadius: 10,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 13, color: "#334155", marginBottom: 8 }}>
                Didn&apos;t receive the prompt?
              </div>
              <button
                data-testid="mpesa-resend-btn"
                onClick={resendMpesa}
                disabled={retryLoading}
                style={{
                  padding: "12px 16px",
                  minHeight: 46,
                  width: "100%",
                  background: "#0f172a",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: retryLoading ? "wait" : "pointer",
                  opacity: retryLoading ? 0.7 : 1,
                }}
              >
                {retryLoading ? "Sending…" : "🔁 Resend M-Pesa prompt"}
              </button>
              {retriesLeft !== null && retriesLeft >= 0 && (
                <div
                  data-testid="mpesa-retries-left"
                  style={{ fontSize: 12, color: "#475569", marginTop: 6 }}
                >
                  {retriesLeft} retr{retriesLeft === 1 ? "y" : "ies"} left
                </div>
              )}
              {retryError && (
                <div
                  data-testid="mpesa-resend-error"
                  style={{ color: "#dc2626", fontSize: 12, marginTop: 6 }}
                >
                  {retryError}
                </div>
              )}
            </div>
          )}

          <a
            href={`/track/${result.order_id}?contact=${encodeURIComponent(result.phone)}`}
            data-testid="checkout-track-link"
            style={{
              display: "block",
              textAlign: "center",
              marginTop: 14,
              color: "#0f766e",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            🔎 Open full order page →
          </a>

          <button
            onClick={() => {
              stopPolling();
              onClose();
            }}
            style={{ ...primaryBtn, marginTop: 12 }}
            data-testid="checkout-close"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // ================== CHECKOUT FORM ==================
  return (
    <div style={backdrop}>
      <div style={modal}>
        <h2 style={{ marginTop: 0, color: "#0f172a" }}>Checkout</h2>
        <p style={{ color: "#475569", marginTop: 0 }}>
          {cart.length} item{cart.length === 1 ? "" : "s"} · {formatKES(total)}
        </p>

        <input
          data-testid="co-phone"
          placeholder="Phone number (e.g. 254712345678)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={input}
          inputMode="tel"
        />
        <input
          data-testid="co-name"
          placeholder="Your name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ ...input, marginTop: 8 }}
        />

        <div style={{ marginTop: 12, fontWeight: 600, color: "#0f172a" }}>
          Payment method
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          {[
            { v: "mpesa", l: "🟢 M-Pesa" },
            { v: "cash", l: "💵 Pay on pickup" },
          ].map((o) => (
            <button
              key={o.v}
              data-testid={`co-method-${o.v}`}
              onClick={() => setMethod(o.v)}
              style={methodBtn(method === o.v)}
            >
              {o.l}
            </button>
          ))}
        </div>

        {error && (
          <p data-testid="co-error" style={{ color: "#dc2626", fontSize: 13 }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={secondaryBtn} disabled={loading}>
            Cancel
          </button>
          <button
            data-testid="co-pay"
            onClick={pay}
            disabled={loading}
            style={{ ...primaryBtn, opacity: loading ? 0.7 : 1 }}
          >
            {loading
              ? "⏳ Sending…"
              : method === "cash"
              ? `Place order (${formatKES(total)})`
              : `Pay ${formatKES(total)}`}
          </button>
        </div>

        <div
          style={{
            marginTop: 14,
            display: "flex",
            gap: 10,
            justifyContent: "center",
            color: "#475569",
            fontSize: 12,
            flexWrap: "wrap",
          }}
        >
          <span>🔒 Secure checkout · M-Pesa</span>
        </div>
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
  width: 440,
  maxWidth: "92vw",
  background: "white",
  borderRadius: 14,
  padding: 24,
  boxShadow: "0 18px 40px rgba(15,23,42,0.25)",
  fontFamily: "system-ui, sans-serif",
};
const input = {
  width: "100%",
  padding: 12,
  minHeight: 44,
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  boxSizing: "border-box",
  marginTop: 8,
  fontSize: 15,
  color: "#0f172a",
};
const methodBtn = (active) => ({
  flex: 1,
  padding: 12,
  minHeight: 46,
  background: active ? "#16a34a" : "#f1f5f9",
  color: active ? "white" : "#0f172a",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 700,
});
const primaryBtn = {
  flex: 1,
  padding: 14,
  minHeight: 48,
  background: "#16a34a",
  color: "white",
  border: "none",
  borderRadius: 8,
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 15,
};
const secondaryBtn = {
  padding: "12px 18px",
  minHeight: 48,
  background: "#f1f5f9",
  color: "#0f172a",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
};
const stepList = {
  margin: "8px 0 0",
  paddingLeft: 20,
  color: "#334155",
  fontSize: 14,
  lineHeight: 1.6,
};
const spinner = {
  width: 46,
  height: 46,
  margin: "8px auto",
  borderRadius: "50%",
  border: "4px solid #dcfce7",
  borderTopColor: "#16a34a",
  animation: "dukayko-spin 0.9s linear infinite",
};

if (typeof document !== "undefined" && !document.getElementById("dk-spin-kf")) {
  const s = document.createElement("style");
  s.id = "dk-spin-kf";
  s.textContent = "@keyframes dukayko-spin{to{transform:rotate(360deg)}}";
  document.head.appendChild(s);
}
