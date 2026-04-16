import { useEffect, useMemo, useState } from "react";
import API from "../../api/client";
import { getProducts } from "../../api/products";

function PosApp({ user }) {
  const assignedShopId = useMemo(() => user?.assigned_shop_ids?.[0] || "", [user]);

  const [shopId, setShopId] = useState("");

  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);

  useEffect(() => {

    setShopId(assignedShopId);
  }, [assignedShopId]);

  useEffect(() => {
    if (!shopId) {
      setProducts([]);
      return;
    }
    getProducts({ shop_id: shopId }).then((data) => setProducts(Array.isArray(data) ? data : []));
  }, [shopId]);


    if (!assignedShopId) return;
    getProducts({ shop_id: assignedShopId }).then(setProducts);
  }, [assignedShopId]);


  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);

  const add = (product) => {
    setCart((prev) => {
      const found = prev.find((i) => i._id === product._id);
      if (found) return prev.map((i) => (i._id === product._id ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const checkout = async () => {
    await API.post("/api/orders/checkout", {

      shop_id: shopId,

      shop_id: assignedShopId,

      items: cart.map((i) => ({ product_id: i._id, qty: i.qty })),
      payment_provider: "POS",
      payment_method: "cash",
    });
    setCart([]);
    alert("Sale completed");
  };


  if (!shopId) return <h3>No assigned shop found for this POS user.</h3>;

  if (!assignedShopId) return <h3>No assigned shop found for this POS user.</h3>;


  return (
    <div>
      <h2>Shopkeeper POS</h2>

      <p>Assigned shop: <strong>{shopId}</strong> (locked)</p>

      <p>Assigned shop: <strong>{assignedShopId}</strong> (locked)</p>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <div>
          {products.map((p) => (
            <div key={p._id} style={{ border: "1px solid #ddd", marginBottom: 8, padding: 8 }}>
              {p.name} - KES {p.price}
              <button style={{ marginLeft: 8 }} onClick={() => add(p)}>Add</button>
            </div>
          ))}
        </div>
        <div>
          <h4>Cart</h4>
          {cart.map((i) => <div key={i._id}>{i.name} x {i.qty}</div>)}
          <p>Total: KES {total}</p>
          <button disabled={!cart.length} onClick={checkout}>Checkout</button>
        </div>
      </div>
    </div>
  );
}

export default PosApp;
