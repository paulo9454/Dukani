import { useEffect, useState } from "react";
import { getProducts } from "../api/products";
import API from "../api/client";

function POS({ shopId: presetShopId }) {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [shopId, setShopId] = useState(presetShopId || null);

  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [loading, setLoading] = useState(false);

  // =========================
  // LOAD PRODUCTS
  // =========================
  useEffect(() => {
    if (presetShopId) {
      setShopId(presetShopId);
    }
  }, [presetShopId]);

  useEffect(() => {
    const effectiveShopId = presetShopId || shopId;
    if (!effectiveShopId) {
      setProducts([]);
      return;
    }

    const load = async () => {
      try {

        const data = await getProducts({ shop_id: effectiveShopId });

        const data = await getProducts({ shop_id: presetShopId || shopId });

        setProducts(data);
      } catch (err) {
        console.error("Products error:", err);
        setProducts([]);
      }
    };

    load();
  }, [presetShopId, shopId]);

  // =========================
  // FILTER BY SHOP + SEARCH
  // =========================
  const shopProducts = products.filter((p) => {
    const matchShop = shopId ? p.shop_id === shopId : true;
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode || "").includes(search);

    return matchShop && matchSearch;
  });

  // =========================
  // ADD TO CART (SHOP LOCK)
  // =========================
  const addToCart = (product) => {
    if (!shopId) setShopId(product.shop_id);

    if (shopId && product.shop_id !== shopId) {
      alert("❌ Cannot mix products from different shops");
      return;
    }

    const existing = cart.find((i) => i._id === product._id);

    if (existing) {
      setCart(
        cart.map((i) =>
          i._id === product._id ? { ...i, qty: i.qty + 1 } : i
        )
      );
    } else {
      setCart([...cart, { ...product, qty: 1 }]);
    }
  };

  // =========================
  // REMOVE ITEM
  // =========================
  const removeItem = (id) => {
    setCart(cart.filter((i) => i._id !== id));
  };

  // =========================
  // TOTAL
  // =========================
  const total = cart.reduce(
    (sum, item) => sum + item.price * item.qty,
    0
  );

  // =========================
  // RESET SESSION
  // =========================
  const resetPOS = () => {
    setCart([]);
    setShopId(presetShopId || null);
    setSearch("");
    setPaymentMethod("cash");
  };

  // =========================
  // CHECKOUT ENGINE
  // =========================
  const handleCheckout = async () => {
    if (!cart.length) {
      alert("❌ Cart is empty");
      return;
    }

    setLoading(true);

    try {
      const { data } = await API.post("/api/orders/checkout", {
        shop_id: shopId,
        items: cart.map((i) => ({
          product_id: i._id,
          qty: i.qty,
        })),
        payment_provider: "POS",
        payment_method: paymentMethod,
      });

      // =========================
      // RECEIPT OBJECT (FRONTEND READY)
      // =========================
      const receipt = {
        receipt_no: data.order_id || Date.now(),
        shop_id: shopId,
        items: cart,
        total,
        payment_method: paymentMethod,
        time: new Date().toISOString(),
      };

      localStorage.setItem("last_receipt", JSON.stringify(receipt));

      alert("✅ Sale completed");

      console.log("🧾 RECEIPT:", receipt);

      resetPOS();
    } catch (err) {
      alert("❌ " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // UI
  // =========================
  return (
    <div style={{ display: "flex", gap: "20px", padding: "20px" }}>
      
      {/* LEFT PANEL */}
      <div style={{ flex: 2 }}>
        <h2>🏪 Dukani POS</h2>

        {/* SHOP STATUS */}
        {shopId && (
          <p style={{ color: "green" }}>
            Active Shop: {shopId}
          </p>
        )}

        {/* SEARCH BAR */}
        <input
          placeholder="Search product / barcode..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: "8px", width: "100%", marginBottom: "10px" }}
        />

        {/* PRODUCTS GRID */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: "10px",
          }}
        >
          {shopProducts.map((p) => (
            <div
              key={p._id}
              style={{
                border: "1px solid #ddd",
                padding: "10px",
                borderRadius: "8px",
              }}
            >
              <h4>{p.name}</h4>
              <p>KES {p.price}</p>

              <button onClick={() => addToCart(p)}>
                ➕ Add
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div style={{ flex: 1, borderLeft: "2px solid #ddd", paddingLeft: "10px" }}>
        <h2>🧾 Cart</h2>

        {cart.map((item) => (
          <div key={item._id}>
            <p>{item.name}</p>
            <p>Qty: {item.qty}</p>
            <p>KES {item.qty * item.price}</p>
            <button onClick={() => removeItem(item._id)}>❌</button>
          </div>
        ))}

        <hr />

        <h3>Total: KES {total}</h3>

        {/* PAYMENT METHOD */}
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          style={{ width: "100%", padding: "8px" }}
        >
          <option value="cash">Cash</option>
          <option value="mpesa">M-Pesa</option>
          <option value="credit">Credit</option>
        </select>

        {/* CHECKOUT */}
        <button
          onClick={handleCheckout}
          disabled={loading}
          style={{
            width: "100%",
            padding: "10px",
            background: "green",
            color: "white",
            marginTop: "10px",
          }}
        >
          {loading ? "Processing..." : "💳 Checkout"}
        </button>

        {/* RESET */}
        <button
          onClick={resetPOS}
          style={{
            width: "100%",
            padding: "10px",
            marginTop: "10px",
            background: "red",
            color: "white",
          }}
        >
          🔄 Reset
        </button>
      </div>
    </div>
  );
}

export default POS;
