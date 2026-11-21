import { useState } from "react";
import API from "../api/client";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");
    try {
      const response = await API.post("/api/auth/forgot-password", { email });
      setMessage(response.data?.message || "If an account exists for that email, a reset link has been sent.");
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to process your request. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={shell}>
      <form onSubmit={submit} style={card}>
        <h2 style={{ marginTop: 0 }}>Forgot your password?</h2>
        <p style={{ color: "#64748b", lineHeight: 1.5 }}>Enter the email address linked to your Dukayko account. If an account exists, we'll send you a password reset link.</p>
        <label htmlFor="forgot-email">Email address</label>
        <input id="forgot-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={input} />
        {message && <p role="status" style={{ color: "#166534", fontSize: 14 }}>{message}</p>}
        {error && <p role="alert" style={{ color: "#b91c1c", fontSize: 14 }}>{error}</p>}
        <button type="submit" disabled={loading} style={button}>{loading ? "Sending…" : "Send reset link"}</button>
        <p style={{ textAlign: "center", marginBottom: 0 }}><a href="/login" style={link}>Back to sign in</a></p>
      </form>
    </div>
  );
}

const shell = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, boxSizing: "border-box", background: "linear-gradient(135deg, #f0fdf4 0%, #ecfeff 100%)", fontFamily: "system-ui, sans-serif" };
const card = { width: 420, maxWidth: "100%", background: "#fff", borderRadius: 14, padding: 28, boxShadow: "0 10px 30px rgba(0,0,0,.06)", boxSizing: "border-box" };
const input = { width: "100%", padding: "11px 12px", marginTop: 8, marginBottom: 16, borderRadius: 8, border: "1px solid #cbd5e1", boxSizing: "border-box" };
const button = { width: "100%", padding: 12, background: "#16a34a", color: "#fff", border: 0, borderRadius: 8, fontWeight: 600, cursor: "pointer", marginBottom: 16 };
const link = { color: "#0f766e", textDecoration: "underline" };
