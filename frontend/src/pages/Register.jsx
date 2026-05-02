import { useState } from "react";
import API from "../api/client";

function Register({ onSwitch, onNeedsVerification }) {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleRegister = async () => {
    const { full_name, email, password } = form;
    if (!full_name || !email || !password) {
      setError("Please fill all fields");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    try {
      setError("");
      setLoading(true);
      const res = await API.post("/api/auth/register", {
        full_name: full_name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role: "owner",
      });

      if (res.data?.requires_verification) {
        onNeedsVerification?.(email.trim().toLowerCase());
        return;
      }

      localStorage.setItem("token", res.data.access_token);
      if (res.data.refresh_token)
        localStorage.setItem("refresh_token", res.data.refresh_token);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      window.location.href = "/";
    } catch (err) {
      setError(err?.response?.data?.detail || "Registration failed");
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
            <h2 style={{ margin: 0 }}>Open your shop</h2>
            <small style={{ color: "#64748b" }}>
              Dukayko helps shops sell online instantly.
            </small>
          </div>
        </div>

        <input
          data-testid="register-name"
          placeholder="Your name"
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          style={{ ...inputStyle, marginTop: 18 }}
        />
        <input
          data-testid="register-email"
          placeholder="Email"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          style={{ ...inputStyle, marginTop: 10 }}
        />
        <input
          data-testid="register-password"
          placeholder="Password (min 8 chars)"
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          style={{ ...inputStyle, marginTop: 10 }}
          onKeyDown={(e) => e.key === "Enter" && handleRegister()}
        />

        {error && (
          <p
            data-testid="register-error"
            style={{ color: "#dc2626", marginTop: 8, fontSize: 13 }}
          >
            {error}
          </p>
        )}

        <button
          data-testid="register-submit"
          onClick={handleRegister}
          disabled={loading}
          style={{ ...primaryBtn, marginTop: 14 }}
        >
          {loading ? "Creating account…" : "Create Shop Owner account"}
        </button>

        <p style={{ marginTop: 16, fontSize: 13, color: "#64748b" }}>
          Already have an account?{" "}
          <button onClick={onSwitch} style={linkBtn} data-testid="goto-login">
            Sign in
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
  width: 420,
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
  textDecoration: "underline",
};

export default Register;
