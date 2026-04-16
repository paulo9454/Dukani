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

      // 🧠 SAVE TOKEN (THIS IS THE CRITICAL PART)
      localStorage.setItem("token", res.data.access_token);

      alert("✅ Login successful!");

      console.log("TOKEN SAVED:", res.data.access_token);

      // optional: redirect later
      window.location.href = "/";

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
    </div>
  );
}

export default Login;
