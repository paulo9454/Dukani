import { useEffect, useMemo, useState } from "react";
import API from "../../api/client";
import { getProducts } from "../../api/products";

function PosApp({ user }) {
  const assignedShopId = useMemo(
    () => user?.assigned_shop_ids?.[0] || "",
    [user]
  );

  const [shopId, setShopId] = useState("");
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [lastReceipt, setLastReceipt] = useState(null);

  // =========================
  // LOCK SHOP
  // =========================
  useEffect(() => {
    if (assignedShopId) setShopId(assignedShopId);
  }, [assignedShopId]);

  // =========================
  // LOAD PRODUCTS
  // =========================
  useEffect(() => {
    if (!shopId) return setProducts([]);

    (async () => {
      try {
        const data = await getProducts({ shop_id: shopId });

        setProducts(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("POS products error:", err);
        setProducts([]);
      }
    })();
  }, [shopId]);

  // =========================
  // ADD TO CART
  // =========================
  const add = (product) => {
    setCart((prev) => {
      const found = prev.find((i) => i._id === product._id);

      if (found) {
        return prev.map((i) =>
          i._id === product._id
            ? { ...i, qty: i.qty + 1 }
            : i
        );
      }

      return [
        ...prev,
        {
          _id: product._id,
          name: product.name,
          price: product.price,
          qty: 1,
        },
      ];
    });
  };

  const remove = (id) => {
    setCart((prev) => prev.filter((i) => i._id !== id));
  };

  // =========================
  // CHECKOUT (POS FLOW)
  // =========================
  const checkout = async () => {
    try {
      const payload = {
        shop_id: shopId,
        items: cart.map((i) => ({
          product_id: i._id,
          qty: i.qty,
        })),
        payment_provider: "POS",
        payment_method: "cash",
        discount: 0,
        tax_percent: 0,
      };

      const res = await API.post("/api/pos/checkout", payload);

      setLastReceipt(res.data);
      setCart([]);

      console.log("POS ORDER:", res.data);
    } catch (err) {
      console.error("Checkout failed:", err?.response?.data || err.message);
      alert(err?.response?.data?.detail || "Checkout failed");
    }
  };

  // =========================
  // GUARD
  // =========================
  if (!assignedShopId) {
    return <h3>No assigned shop found for this POS user.</h3>;
  }

  // =========================
  // TOTAL
  // =========================
  const cartSubtotal = cart.reduce(
    (sum, i) => sum + (i.price || 0) * i.qty,
    0
  );

  return (
    <div style={{ padding: 16 }}>
      <h2>🧾 POS SYSTEM</h2>

      <p>
        Shop: <strong>{shopId}</strong>
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        
        {/* PRODUCTS */}
        <div>
          <h3>Products</h3>

          {products.map((p) => (
            <div
              key={p._id}
              style={{
                border: "1px solid #ddd",
                marginBottom: 8,
                padding: 8,
              }}
            >
              <b>{p.name}</b> — KES {p.price}

              <button
                style={{ marginLeft: 8 }}
                onClick={() => add(p)}
              >
                Add
              </button>
            </div>
          ))}
        </div>

        {/* CART */}
        <div>
          <h3>Cart</h3>

          {cart.map((i) => (
            <div key={i._id} style={{ marginBottom: 6 }}>
              {i.name} × {i.qty}
              <button
                onClick={() => remove(i._id)}
                style={{ marginLeft: 6 }}
              >
                ❌
              </button>
            </div>
          ))}

          <hr />

          <p><strong>Subtotal:</strong> KES {cartSubtotal}</p>

          <button disabled={!cart.length} onClick={checkout}>
            Checkout
          </button>
        </div>
      </div>

      {/* RECEIPT */}
      {lastReceipt && (
  <div style={{ marginTop: 20, padding: 10, border: "2px solid green" }}>
    <h3>🧾 RECEIPT</h3>

    <p><b>No:</b> {lastReceipt.receipt_number}</p>
    <p><b>Order:</b> {lastReceipt.order_id}</p>

    <p><b>Cashier:</b> {lastReceipt.cashier?.name}</p>

    <hr />

    {lastReceipt.items.map((i, idx) => (
      <div key={idx}>
        {i.name} x {i.qty} = KES {i.subtotal}
      </div>
    ))}

    <hr />

    <p>Subtotal: KES {lastReceipt.subtotal}</p>
    <p>Tax: KES {lastReceipt.tax}</p>
    <p>Discount: KES {lastReceipt.discount}</p>

    <h3>Total: KES {lastReceipt.total}</h3>

    <p>Status: {lastReceipt.payment_status}</p>
  </div>
)}
    </div>
  );
}

export default PosApp;
