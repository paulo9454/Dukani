import { useEffect, useState } from "react";
import API from "../api/client";
import { checkout } from "../api/checkout";

function Cart() {
  const [cart, setCart] = useState(null);
  const [products, setProducts] = useState({});
  const [loading, setLoading] = useState(true);

  // =========================
  // GET CART
  // =========================
  const fetchCart = async () => {
    const res = await API.get("/api/customer/cart");
    return res.data;
  };

  // =========================
  // GET PRODUCTS
  // =========================
  const fetchProducts = async () => {
    const res = await API.get("/api/products");

    // convert to lookup map
    const map = {};
    res.data.forEach((p) => {
      map[p._id] = p;
    });

    setProducts(map);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [cartData] = await Promise.all([
          fetchCart(),
          fetchProducts(),
        ]);

        setCart(cartData);
      } catch (err) {
        console.error("Cart load error:", err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);
  
  const handleCheckout = async () => {
  try {
    const res = await checkout();

    alert("✅ Order placed successfully!");

    console.log("Checkout response:", res);

    // optional: refresh cart UI
    setCart({ items: [] });

  } catch (err) {
    const msg = err?.response?.data?.detail || err.message;
    alert("❌ Checkout failed: " + msg);
  }
};

  // =========================
  // REMOVE ITEM
  // =========================
  const removeItem = async (productId) => {
    try {
      const res = await API.delete(
        `/api/customer/cart/${productId}`
      );

      setCart(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  // =========================
  // LOADING
  // =========================
  if (loading) return <p>Loading cart...</p>;

  if (!cart || cart.items.length === 0) {
    return <p>🛒 Your cart is empty</p>;
  }

  // =========================
  // TOTAL
  // =========================
  const total = cart.items.reduce((sum, item) => {
    const product = products[item.product_id];
    const price = product?.price || 0;
    return sum + price * item.qty;
  }, 0);

  return (
    <div style={{ padding: "20px" }}>
      <h2>🛒 Your Cart</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
        {cart.items.map((item) => {
          const product = products[item.product_id];

          return (
            <div
              key={item.product_id}
              style={{
                border: "1px solid #ddd",
                padding: "15px",
                borderRadius: "10px",
                background: "#fafafa",
              }}
            >
              <h3>{product?.name || "Loading product..."}</h3>

              <p>Qty: {item.qty}</p>
              <p>Price: KES {product?.price || 0}</p>

              <p>
                <strong>
                  Subtotal: KES {(product?.price || 0) * item.qty}
                </strong>
              </p>

              <button
                onClick={() => removeItem(item.product_id)}
                style={{
                  marginTop: "10px",
                  padding: "8px",
                  background: "red",
                  color: "white",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>

      {/* TOTAL */}
      <div
        style={{
          marginTop: "20px",
          padding: "15px",
          borderTop: "2px solid black",
        }}
      >
        <h2>Total: KES {total}</h2>
      </div>

      {/* CHECKOUT */}
<button
  onClick={handleCheckout}
  style={{
    marginTop: "20px",
    padding: "12px",
    background: "green",
    color: "white",
    border: "none",
    width: "100%",
    cursor: "pointer",
    fontSize: "16px",
  }}
>
  ✅ Checkout Now
</button>
    </div>
  );
}

export default Cart;
