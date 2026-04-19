import { useState } from "react";
import API from "../api/client";

function Login({ onSwitch, onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      alert("Please enter email and password");
      return;
    }

    try {
      setLoading(true);

      const res = await API.post("/api/auth/login", {
        email,
        password,
      });

      const { access_token, refresh_token, user } = res.data;

      // 🔐 STORE AUTH DATA
      localStorage.setItem("token", access_token);
      localStorage.setItem("refresh_token", refresh_token);
      localStorage.setItem("user", JSON.stringify(user));

      alert("✅ Login successful!");

      // ✅ IMPORTANT: notify App.jsx instead of reload
      if (onLogin) {
        onLogin({ access_token, user });
      }

    } catch (err) {
      console.error(err);
      alert("❌ " + (err?.response?.data?.detail || "Login failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h1>🔐 Login</h1>

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ display: "block", marginBottom: "10px", padding: "8px" }}
      />

      <input
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ display: "block", marginBottom: "10px", padding: "8px" }}
      />

      <button
        onClick={handleLogin}
        disabled={loading}
        style={{
          padding: "10px",
          background: "black",
          color: "white",
          border: "none",
          cursor: "pointer",
        }}
      >
        {loading ? "Logging in..." : "Login"}
      </button>

      <p style={{ marginTop: "10px" }}>
        Don't have an account?{" "}
        <button
          onClick={onSwitch}
          style={{
            background: "none",
            border: "none",
            color: "blue",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          Register
        </button>
      </p>
    </div>
  );
}

export default Login;
