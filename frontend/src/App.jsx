import { useEffect, useState } from "react";
import API from "./api/client";

import Login from "./pages/Login";
import Register from "./pages/Register";

import OwnerShell from "./apps/owner/OwnerShell";
import ShopkeeperHome from "./apps/Shopkeeper/ShopkeeperHome";
import CustomerApp from "./apps/customer/CustomerApp";
import POS from "./apps/pos/PosApp";

function App() {
  const [authView, setAuthView] = useState("login");

  const [token, setToken] = useState(() => localStorage.getItem("token"));

  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user")) || {};
    } catch {
      return {};
    }
  });

  const [loadingUser, setLoadingUser] = useState(true);

  const path = window.location.pathname;
  const urlParams = new URLSearchParams(window.location.search);
  const shopIdFromUrl = urlParams.get("shopId");

  // =========================
  // LOAD USER
  // =========================
  useEffect(() => {
    if (!token) {
      setLoadingUser(false);
      return;
    }

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
      .finally(() => setLoadingUser(false));
  }, [token]);

  // =========================
  // AUTO REDIRECT AFTER LOGIN (FIXED)
  // =========================
  useEffect(() => {
    if (!token || !user?.role) return;

    if (path === "/") {
      if (user.role === "owner") {
        window.location.href = "/owner";
      } else if (user.role === "shopkeeper") {
        window.location.href = "/shopkeeper";
      }
    }
  }, [token, user, path]);

  const handleLogout = () => {
    localStorage.clear();
    setToken(null);
    setUser({});
    window.location.href = "/";
  };

  if (loadingUser) {
    return <div style={{ padding: 20 }}>Loading...</div>;
  }

  // =========================
  // AUTH VIEW
  // =========================
  if (!token || !user?.role) {
    return authView === "login" ? (
      <Login
        onSwitch={() => setAuthView("register")}
        onLogin={(data) => {
          localStorage.setItem("token", data.access_token);
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
  // HEADER
  // =========================
  const Header = () => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "15px 20px",
        borderBottom: "1px solid #ddd",
        background: "#fff",
      }}
    >
      <h2 style={{ margin: 0 }}>🏪 DUKANI</h2>

      <div style={{ display: "flex", gap: 10 }}>
        <span>{user.role}</span>
        <button onClick={handleLogout}>Logout</button>
      </div>
    </div>
  );

  // =========================
  // ROUTING SYSTEM
  // =========================
  let content = null;

  // 🔥 POS
  if (path.startsWith("/pos")) {
    if (!shopIdFromUrl) {
      content = <div style={{ padding: 20 }}>❌ Missing shopId</div>;
    } else {
      content = (
        <div style={{ padding: 20 }}>
          <button onClick={() => (window.location.href = "/shopkeeper")}>
            ← Back
          </button>
          <POS shopId={shopIdFromUrl} />
        </div>
      );
    }
  }

  // 🔥 SHOPKEEPER
  else if (path.startsWith("/shopkeeper")) {
    content = <ShopkeeperHome user={user} />;
  }

  // 🔥 OWNER
  else if (path.startsWith("/owner")) {
    content = <OwnerShell user={user} />;
  }

  // 🔥 CUSTOMER
  else if (user.role === "customer") {
    content = <CustomerApp user={user} />;
  }

  // 🔥 FALLBACK
  else {
    content = (
      <div style={{ padding: 20 }}>
        ❌ 404 Not Found <br />
        <button onClick={() => (window.location.href = "/")}>
          Go Home
        </button>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Arial" }}>
      <Header />
      {content}
    </div>
  );
}

export default App;
