import { useEffect, useState } from "react";
import API from "./api/client";

import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyEmail from "./pages/VerifyEmail";
import PublicShopPage from "./pages/PublicShopPage";
import OrderTrack from "./pages/OrderTrack";

import OwnerShell from "./apps/owner/OwnerShell";
import ShopkeeperHome from "./apps/Shopkeeper/ShopkeeperHome";
import POS from "./apps/pos/PosApp";

function App() {
  const [authView, setAuthView] = useState("login");
  const [pendingVerification, setPendingVerification] = useState(null);

  const [token, setToken] = useState(() => localStorage.getItem("token"));

  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user")) || {};
    } catch {
      return {};
    }
  });

  // Only show "Loading..." if we have a token AND no cached user yet.
  // Otherwise we render immediately and re-validate /auth/me in the background,
  // which avoids the constant "Loading..." flash on every page load/navigation.
  const [loadingUser, setLoadingUser] = useState(() => {
    const hasToken = !!localStorage.getItem("token");
    let cachedRole = null;
    try {
      cachedRole = JSON.parse(localStorage.getItem("user") || "{}")?.role || null;
    } catch {
      cachedRole = null;
    }
    return hasToken && !cachedRole;
  });

  const path = window.location.pathname;
  const urlParams = new URLSearchParams(window.location.search);
  const shopIdFromUrl = urlParams.get("shopId");

  // =========================
  // LOAD USER (when token present) — runs in background, no UI flash
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
  // AUTO REDIRECT AFTER LOGIN — synchronous to avoid 404 flash
  // =========================
  useEffect(() => {
    if (!token || !user?.role) return;
    if (path === "/") {
      if (user.role === "owner") window.location.replace("/owner");
      else if (user.role === "shopkeeper") window.location.replace("/shopkeeper");
      else {
        // Legacy customer accounts — just log them out, app is not for them anymore.
        localStorage.clear();
        setToken(null);
        setUser({});
      }
    }
  }, [token, user, path]);

  // =========================
  // PUBLIC ROUTE — /shop/:slug (no auth required)
  // =========================
  if (path.startsWith("/shop/")) {
    const slug = path.replace(/^\/shop\//, "").replace(/\/+$/, "");
    return <PublicShopPage slug={slug} />;
  }

  // =========================
  // PUBLIC ROUTE — /order/:id OR /track/:id  (phone-based)
  // =========================
  if (path.startsWith("/order/") || path.startsWith("/track/")) {
    const id = path.replace(/^\/(order|track)\//, "").replace(/\/+$/, "");
    return <OrderTrack orderId={id} />;
  }

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
  // AUTH VIEW (owner-only now)
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
  // ROUTING — Owner / Shopkeeper only
  // =========================
  let content = null;

  if (path === "/" && (user.role === "owner" || user.role === "shopkeeper")) {
    // Redirect is in-flight from useEffect; avoid showing 404 for a split second.
    content = <div style={{ padding: 20 }}>Redirecting to your dashboard…</div>;
  } else if (path.startsWith("/pos")) {
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
  } else {
    // Unknown path while logged in → bounce to the right dashboard instead
    // of a dead-end 404 (covers /login, /register, /dashboard, stale bookmarks).
    const dest = user.role === "owner" ? "/owner" : "/shopkeeper";
    if (typeof window !== "undefined" && window.location.pathname !== dest) {
      window.location.replace(dest);
    }
    content = (
      <div style={{ padding: 20 }}>
        Redirecting you to your dashboard…
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
