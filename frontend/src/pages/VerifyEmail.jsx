import { useState } from "react";
import API from "../api/client";

export default function VerifyEmail({ email, onVerified, onCancel }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const verify = async () => {
    if (!code) return setMsg("Enter the code from your email");
    try {
      setLoading(true);
      setMsg("");
      const res = await API.post("/api/auth/verify-email", { email, code });
      if (res.data?.verified) {
        onVerified(res.data);
      }
    } catch (err) {
      setMsg(err?.response?.data?.detail || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    try {
      setLoading(true);
      const res = await API.post("/api/auth/resend-verification", { email });
      // If SMTP is not configured, this auto-verifies and we should drop them back to login.
      if (res.data?.requires_verification === false) {
        setMsg(res.data.message || "Auto-verified — please log in.");
        setTimeout(onCancel, 1200);
      } else {
        setMsg("Code re-sent — check your inbox.");
      }
    } catch (err) {
      setMsg(err?.response?.data?.detail || "Could not resend code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={shellStyle}>
      <div style={cardStyle}>
        <img
          src="/dukayko-logo.jpg"
          alt="Dukayko"
          style={{ height: 48, borderRadius: 8, marginBottom: 12 }}
        />
        <h2 style={{ margin: 0 }}>Verify your email</h2>
        <p style={{ color: "#64748b", marginTop: 6 }}>
          We sent a 6-digit code to <b>{email}</b>.
        </p>

        <input
          data-testid="verify-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
          maxLength={6}
          placeholder="000000"
          style={{
            ...inputStyle,
            letterSpacing: 8,
            fontSize: 22,
            textAlign: "center",
            marginTop: 14,
          }}
        />

        {msg && (
          <p style={{ color: "#dc2626", marginTop: 8, fontSize: 13 }}>{msg}</p>
        )}

        <button
          data-testid="verify-btn"
          onClick={verify}
          disabled={loading}
          style={{ ...primaryBtn, marginTop: 14 }}
        >
          {loading ? "Verifying…" : "Verify email"}
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 13 }}>
          <button onClick={resend} disabled={loading} style={linkBtn}>
            Resend code
          </button>
          <button onClick={onCancel} style={linkBtn}>
            Back to login
          </button>
        </div>
      </div>
    </div>
  );
}

const shellStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(135deg, #f0fdf4 0%, #ecfeff 100%)",
  fontFamily: "system-ui, sans-serif",
};
const cardStyle = {
  width: 380,
  maxWidth: "92vw",
  background: "white",
  borderRadius: 14,
  padding: 28,
  boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
};
const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  boxSizing: "border-box",
};
const primaryBtn = {
  width: "100%",
  padding: 12,
  background: "#16a34a",
  color: "white",
  border: "none",
  borderRadius: 8,
  fontWeight: 600,
  cursor: "pointer",
};
const linkBtn = {
  background: "transparent",
  border: "none",
  color: "#0f766e",
  cursor: "pointer",
  padding: 0,
};
