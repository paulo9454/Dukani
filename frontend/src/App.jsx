import { useEffect, useState } from "react";
import API from "./api/client";
import Login from "./pages/Login";
import Register from "./pages/Register";

import OwnerShell from "./apps/owner/OwnerShell";
import PosApp from "./apps/pos/PosApp";
import CustomerApp from "./apps/customer/CustomerApp";

function App() {
  const [authView, setAuthView] = useState("login");

  // ✅ reactive token
  const [token, setToken] = useState(() => localStorage.getItem("token"));

  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user")) || {};
    } catch {
      return {};
    }
  });

  const [loadingUser, setLoadingUser] = useState(true);

  // =========================
  // LOAD USER
  // =========================
  useEffect(() => {
    if (!token) {
      setLoadingUser(false);
      return;
    }

    setLoadingUser(true);

    API.get("/api/auth/me")
      .then((res) => {
        localStorage.setItem("user", JSON.stringify(res.data));
        setUser(res.data);
      })
      .catch(() => {
        localStorage.clear();
        setUser({});
        setToken(null);
      })
      .finally(() => {
        setLoadingUser(false);
      });
  }, [token]);

  // =========================
  // LOGOUT
  // =========================
  const handleLogout = () => {
    localStorage.clear();
    setUser({});
    setToken(null);
  };

  // =========================
  // SHOW LOADING (prevents flicker)
  // =========================
  if (loadingUser) {
    return <div style={{ padding: 20 }}>Loading...</div>;
  }

  // =========================
  // AUTH SCREEN
  // =========================
  if (!token || !user?.role) {
    return authView === "login" ? (
      <Login
        onSwitch={() => setAuthView("register")}
        onLogin={(data) => {
          localStorage.setItem("token", data.access_token);
          localStorage.setItem("refresh_token", data.refresh_token || "");
          localStorage.setItem("user", JSON.stringify(data.user));

          setToken(data.access_token);
          setUser(data.user);
        }}
      />
    ) : (
      <Register onSwitch={() => setAuthView("login")} />
    );
  }

  // =========================
  // MAIN APP
  // =========================
  return (
    <div style={{ padding: 20, fontFamily: "Arial" }}>
      <h1>DUKANI</h1>

      <button onClick={handleLogout}>Logout</button>

      {/* OWNER */}
      {user.role === "owner" && <OwnerShell user={user} />}

      {/* SHOPKEEPER */}
      {user.role === "shopkeeper" && <PosApp user={user} />}

      {/* CUSTOMER */}
      {user.role === "customer" && <CustomerApp user={user} />}
    </div>
  );
}

export default App;
