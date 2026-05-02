import { useEffect, useState } from "react";
import API from "./api/client";

import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyEmail from "./pages/VerifyEmail";
import PublicShopPage from "./pages/PublicShopPage";

import OwnerShell from "./apps/owner/OwnerShell";
import ShopkeeperHome from "./apps/Shopkeeper/ShopkeeperHome";
import CustomerApp from "./apps/customer/CustomerApp";
import POS from "./apps/pos/PosApp";

function App() {
  const [authView, setAuthView] = useState("login");
  const [pendingVerification, setPendingVerification] = useState(null); // {email}

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
  // PUBLIC ROUTE — /shop/:slug (no auth required)
  // =========================
  if (path.startsWith("/shop/")) {
    const slug = path.replace(/^\/shop\//, "").replace(/\/+$/, "");
    return <PublicShopPage slug={slug} />;
  }

  // =========================
  // LOAD USER (when token present)
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
  // AUTO REDIRECT AFTER LOGIN
  // =========================
  useEffect(() => {
    if (!token || !user?.role) return;
    if (path === "/") {
      if (user.role === "owner") window.location.href = "/owner";
      else if (user.role === "shopkeeper") window.location.href = "/shopkeeper";
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
    if (pendingVerification) {
      return (
        <VerifyEmail
          email={pendingVerification.email}
          onVerified={(data) => {
            localStorage.setItem("token", data.access_token);
            if (data.refresh_token)
              localStorage.setItem("refresh_token", data.refresh_token);
            localStorage.setItem("user", JSON.stringify(data.user));
            setToken(data.access_token);
            setUser(data.user);
            setPendingVerification(null);
          }}
          onCancel={() => setPendingVerification(null)}
        />
      );
    }

    return authView === "login" ? (
      <Login
        onSwitch={() => setAuthView("register")}
        onLogin={(data) => {
          localStorage.setItem("token", data.access_token);
          localStorage.setItem("user", JSON.stringify(data.user));
          setToken(data.access_token);
          setUser(data.user);
        }}
        onNeedsVerification={(email) => setPendingVerification({ email })}
      />
    ) : (
      <Register
        onSwitch={() => setAuthView("login")}
        onNeedsVerification={(email) => setPendingVerification({ email })}
      />
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
        padding: "12px 20px",
        borderBottom: "1px solid #e2e8f0",
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img
          src="/dukayko-logo.jpg"
          alt="Dukayko"
          style={{ height: 32, borderRadius: 6 }}
        />
        <h2 style={{ margin: 0, fontWeight: 800, color: "#0f172a" }}>Dukayko</h2>
        <span style={{ color: "#64748b", fontSize: 12 }}>
          · Sell. Track. Grow.
        </span>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "#64748b" }}>{user.role}</span>
        <button
          data-testid="logout-btn"
          onClick={handleLogout}
          style={{
            padding: "6px 12px",
            border: "1px solid #e2e8f0",
            background: "white",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Logout
        </button>
      </div>
    </div>
  );

  // =========================
  // ROUTING
  // =========================
  let content = null;

  if (path.startsWith("/pos")) {
    if (!shopIdFromUrl) {
      content = <div style={{ padding: 20 }}>❌ Missing shopId</div>;
    } else {
      content = (
        <div style={{ padding: 20 }}>
          <button
            onClick={() =>
              (window.location.href =
                user.role === "owner" ? "/owner" : "/shopkeeper")
            }
          >
            ← Back
          </button>
          <POS shopId={shopIdFromUrl} />
        </div>
      );
    }
  } else if (path.startsWith("/shopkeeper")) {
    content = <ShopkeeperHome user={user} />;
  } else if (path.startsWith("/owner")) {
    content = <OwnerShell user={user} />;
  } else if (user.role === "customer") {
    content = <CustomerApp user={user} />;
  } else {
    content = (
      <div style={{ padding: 20 }}>
        ❌ 404 Not Found <br />
        <button onClick={() => (window.location.href = "/")}>Go Home</button>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <Header />
      {content}
    </div>
  );
}

export default App;
