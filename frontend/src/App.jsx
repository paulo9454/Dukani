import { useEffect, useState } from "react";
import API from "./api/client";
import { getProducts } from "./api/products";
import { addToCart } from "./api/cart";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Cart from "./pages/Cart";
import Orders from "./pages/Orders";
import OrderDetails from "./pages/OrderDetails";
import POS from "./pages/POS";

// 🔥 NEW IMPORT
import ShopSelector from "./components/ShopSelector";

function App() {
  // =========================
  // STATE
  // =========================
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState("products");
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  const [authView, setAuthView] = useState("login");

  // 🔥 ACTIVE SHOP (NEW)
  const [activeShop, setActiveShop] = useState(
    localStorage.getItem("active_shop") || ""
  );

  // =========================
  // AUTH STATE
  // =========================
  const token = localStorage.getItem("token");

  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user")) || {};
    } catch {
      return {};
    }
  });

  // =========================
  // SYNC USER FROM BACKEND (/me)
  // =========================
  useEffect(() => {
    if (!token) return;

    const syncUser = async () => {
      try {
        const res = await API.get("/api/auth/me");

        localStorage.setItem("user", JSON.stringify(res.data));
        setUser(res.data);
      } catch (err) {
        console.error("User sync failed:", err);

        localStorage.clear();
        window.location.reload();
      }
    };

    syncUser();
  }, [token]);

  // =========================
  // LOAD PRODUCTS (SHOP-AWARE)
  // =========================
  useEffect(() => {
  if (!token || !activeShop) {
    setProducts([]);
    setLoading(false);
    return;
  }

  setLoading(true);

  const load = async () => {
    try {
      const data = await getProducts({
        shop_id: activeShop, // ✅ CORRECT
      });

      console.log("PRODUCTS:", data); // 🔥 DEBUG

      setProducts(data);
    } catch (err) {
      console.error("Products error:", err);
    } finally {
      setLoading(false);
    }
  };

  load();
}, [token, activeShop]);
  // =========================
  // ADD TO CART
  // =========================
  const handleAddToCart = async (id) => {
    try {
      await addToCart(id, activeShop); // 🔥 pass shop_id
      alert("✅ Added to cart!");
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message;

      if (msg.includes("Single-shop cart constraint")) {
        alert("❌ You already have items from another shop.\nClear cart first.");
      } else if (msg.includes("Invalid token")) {
        alert("❌ Session expired. Please login again.");
        localStorage.clear();
        window.location.reload();
      } else {
        alert("❌ " + msg);
      }
    }
  };

  // =========================
  // LOGIN / REGISTER GATE
  // =========================
  if (!token || !user?.role) {
    return authView === "login" ? (
      <Login onSwitch={() => setAuthView("register")} />
    ) : (
      <Register onSwitch={() => setAuthView("login")} />
    );
  }

  // =========================
  // POS ACCESS CONTROL
  // =========================
  const canAccessPOS =
    user.role === "shopkeeper" ||
    (user.role === "owner" && user.subscription_status !== "expired");

  // =========================
  // MAIN RENDER
  // =========================
  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h1>🛒 Dukani Store</h1>

      {/* 🔥 SHOP SELECTOR */}
      <ShopSelector onSelect={(id) => setActiveShop(id)} />

      {/* NAVIGATION */}
      <div style={{ marginBottom: "20px" }}>
        <button onClick={() => setView("products")}>🏬 Products</button>{" "}
        <button onClick={() => setView("cart")}>🛒 Cart</button>{" "}
        <button onClick={() => setView("orders")}>📦 Orders</button>{" "}
        {canAccessPOS && (
          <button onClick={() => setView("pos")}>🧾 POS</button>
        )}
      </div>

      {/* LOGOUT */}
      <button
        onClick={() => {
          localStorage.clear();
          window.location.reload();
        }}
        style={{
          marginBottom: "20px",
          padding: "8px",
          background: "red",
          color: "white",
          border: "none",
          cursor: "pointer",
        }}
      >
        Logout
      </button>

      {/* NO SHOP SELECTED */}
      {!activeShop ? (
        <h3>⚠️ Please select a shop to continue</h3>
      ) : loading ? (
        <p>Loading...</p>
      ) : view === "orders" ? (
        selectedOrderId ? (
          <OrderDetails
            orderId={selectedOrderId}
            onBack={() => setSelectedOrderId(null)}
          />
        ) : (
          <Orders onOpenOrder={(id) => setSelectedOrderId(id)} />
        )
      ) : view === "cart" ? (
        <Cart />
      ) : view === "pos" ? (
        canAccessPOS ? (
          <POS />
        ) : (
          <h3>🚫 Subscription expired or access denied</h3>
        )
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
            gap: "20px",
          }}
        >
          {products.map((p) => (
            <div
              key={p._id}
              style={{
                border: "1px solid #ddd",
                padding: "15px",
                borderRadius: "10px",
              }}
            >
              <h3>{p.name}</h3>
              <p>Price: KES {p.price}</p>
              <p>Stock: {p.stock}</p>

              <button
                onClick={() => handleAddToCart(p._id)}
                style={{
                  padding: "10px",
                  background: "black",
                  color: "white",
                  border: "none",
                  width: "100%",
                  cursor: "pointer",
                }}
              >
                ➕ Add to Cart
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
