import { useState } from "react";
import API from "../api/client";

function ChangePassword({ onChanged, onLogout }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password.length > 72) {
      setError("Password must be 72 characters or fewer.");
      return;
    }
    if (password !== confirm) {
      setError("The passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      await API.post("/api/auth/change-password", { new_password: password });
      onChanged?.();
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not update password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, background: "#f1f5f9", fontFamily: "system-ui, sans-serif" }}>
      <form onSubmit={submit} style={{ width: "min(440px, 100%)", background: "#fff", padding: 28, borderRadius: 14, boxShadow: "0 12px 35px rgba(15,23,42,.10)" }}>
        <h2 style={{ marginTop: 0, color: "#0f172a" }}>Set your new password</h2>
        <p style={{ color: "#475569", lineHeight: 1.5 }}>
          Your owner gave you a temporary password. Create a private password before continuing to Dukayko.
        </p>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>New password</label>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          maxLength={72}
          required
          style={{ width: "100%", boxSizing: "border-box", padding: 12, border: "1px solid #cbd5e1", borderRadius: 8, marginBottom: 14 }}
        />
        <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>Confirm new password</label>
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={8}
          maxLength={72}
          required
          style={{ width: "100%", boxSizing: "border-box", padding: 12, border: "1px solid #cbd5e1", borderRadius: 8, marginBottom: 14 }}
        />
        {error && <p role="alert" style={{ color: "#b91c1c", marginTop: 0 }}>{error}</p>}
        <button type="submit" disabled={loading} style={{ width: "100%", padding: 12, border: 0, borderRadius: 8, background: loading ? "#94a3b8" : "#2563eb", color: "#fff", fontWeight: 700, cursor: loading ? "wait" : "pointer" }}>
          {loading ? "Saving..." : "Save new password"}
        </button>
        <button type="button" onClick={onLogout} style={{ width: "100%", marginTop: 10, padding: 10, border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", color: "#334155" }}>
          Log out
        </button>
      </form>
    </main>
  );
}

export default ChangePassword;
