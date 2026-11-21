import { useState } from "react";
import API from "../api/client";

export default function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    if (!token) {
      setError("This reset link is missing its token. Request a new password reset link.");
      return;
    }
    if (password.length < 8 || password.length > 72) {
      setError("Your password must be between 8 and 72 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const response = await API.post("/api/auth/reset-password", { token, new_password: password });
      setMessage(response.data?.message || "Password reset. You can now sign in.");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err?.response?.data?.detail || "This reset link is invalid or expired. Request a new link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={shell}>
      <form onSubmit={submit} style={card}>
        <h2 style={{ marginTop: 0 }}>Choose a new password</h2>
        <p style={{ color: "#64748b", lineHeight: 1.5 }}>Use a password you haven't used before. Reset links expire after 30 minutes and can only be used once.</p>
        <label htmlFor="new-password">New password</label>
        <input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={password} onChange={(e) => setPassword(e.target.value)} style={input} />
        <label htmlFor="confirm-password">Confirm new password</label>
        <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={input} />
        {message && <p role="status" style={{ color: "#166534", fontSize: 14 }}>{message} <a href="/login" style={link}>Sign in</a></p>}
        {error && <p role="alert" style={{ color: "#b91c1c", fontSize: 14 }}>{error}</p>}
        <button type="submit" disabled={loading || !!message} style={button}>{loading ? "Updating…" : "Reset password"}</button>
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
