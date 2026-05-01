import { useState } from "react";
import API from "../api/client";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    try {
      setLoading(true);

      const res = await API.post("/api/auth/login", {
        email,
        password,
      });

      const token = res.data.access_token;
      const user = res.data.user;

      // =========================
      // SAVE AUTH DATA
      // =========================
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));

      alert("✅ Login successful!");

      console.log("USER:", user);

      // =========================
      // ROLE-BASED REDIRECT
      // =========================
      if (user.role === "owner") {
        window.location.href = "/owner";
      }

      else if (user.role === "shopkeeper") {
        window.location.href = "/shopkeeper";
      }

      else {
        window.location.href = "/marketplace";
      }

    } catch (err) {
      console.error(err);
      alert(
        "❌ " +
          (err?.response?.data?.detail || "Login failed")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>🔐 Login</h1>

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ display: "block", marginBottom: 10, padding: 8 }}
      />

      <input
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ display: "block", marginBottom: 10, padding: 8 }}
      />

      <button
        onClick={handleLogin}
        disabled={loading}
        style={{
          padding: 10,
          background: "black",
          color: "white",
          border: "none",
        }}
      >
        {loading ? "Logging in..." : "Login"}
      </button>
    </div>
  );
}

export default Login;
