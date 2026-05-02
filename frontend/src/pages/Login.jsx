import { useState } from "react";
import API from "../api/client";

function Login({ onSwitch, onLogin, onNeedsVerification }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Please enter email and password");
      return;
    }
    try {
      setError("");
      setLoading(true);
      const res = await API.post("/api/auth/login", { email, password });
      const { access_token, user } = res.data;

      // Customer accounts aren't used from the app anymore — they order via /shop/:slug.
      if (user.role === "customer") {
        setError("Customer accounts aren't used here. Go to your shop link to order.");
        return;
      }

      localStorage.setItem("token", access_token);
      if (res.data.refresh_token)
        localStorage.setItem("refresh_token", res.data.refresh_token);
      localStorage.setItem("user", JSON.stringify(user));
      onLogin?.({ access_token, user });
    } catch (err) {
      const detail = err?.response?.data?.detail || "Login failed";
      if (
        err?.response?.status === 403 &&
        /not verified/i.test(String(detail))
      ) {
        onNeedsVerification?.(email);
        return;
      }
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={shellStyle}>
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src="/dukayko-logo.jpg"
            alt="Dukayko"
            style={{ height: 44, borderRadius: 8 }}
          />
          <div>
            <h2 style={{ margin: 0 }}>Dukayko</h2>
            <small style={{ color: "#64748b" }}>
              Dukayko helps shops sell online instantly.
            </small>
          </div>
        </div>

        <h3 style={{ marginTop: 24, marginBottom: 8 }}>Shop Owner sign in</h3>

        <input
          data-testid="login-email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
        <input
          data-testid="login-password"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ ...inputStyle, marginTop: 10 }}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
        />

        {error && (
          <p
            data-testid="login-error"
            style={{ color: "#dc2626", marginTop: 8, fontSize: 13 }}
          >
            {error}
          </p>
        )}

        <button
          data-testid="login-submit"
          onClick={handleLogin}
          disabled={loading}
          style={{ ...primaryBtn, marginTop: 14 }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <p style={{ marginTop: 16, fontSize: 13, color: "#64748b" }}>
          New shop owner?{" "}
          <button onClick={onSwitch} style={linkBtn} data-testid="goto-register">
            Create an account
          </button>
        </p>
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
  width: 400,
  maxWidth: "92vw",
  background: "white",
  borderRadius: 14,
  padding: 28,
  boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
};
const tabsRow = {
  display: "flex",
  gap: 8,
  marginBottom: 14,
};
const tabBtn = (active) => ({
  flex: 1,
  padding: "8px 10px",
  background: active ? "#16a34a" : "#f1f5f9",
  color: active ? "white" : "#0f172a",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
});
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
  textDecoration: "underline",
};

export default Login;
