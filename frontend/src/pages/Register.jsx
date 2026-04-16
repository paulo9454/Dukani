import { useState } from "react";
import API from "../api/client";

function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [full_name, setFullName] = useState("");
  const [role, setRole] = useState("customer");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    try {
      setLoading(true);

      const res = await API.post("/api/auth/register", {
        email,
        password,
        full_name,
        role,
      });

      // ✅ auto login after register
      localStorage.setItem("token", res.data.access_token);
      localStorage.setItem("user", JSON.stringify(res.data.user));

      alert("✅ Registered successfully!");
      window.location.href = "/";

    } catch (err) {
      console.error(err);
      alert("❌ " + (err?.response?.data?.detail || "Register failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1>📝 Register</h1>

      <input
        placeholder="Full Name"
        value={full_name}
        onChange={(e) => setFullName(e.target.value)}
      />

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <select value={role} onChange={(e) => setRole(e.target.value)}>
        <option value="customer">Customer</option>
        <option value="owner">Owner</option>
      </select>

      <button onClick={handleRegister} disabled={loading}>
        {loading ? "Creating..." : "Register"}
      </button>
    </div>
  );
}

export default Register;
