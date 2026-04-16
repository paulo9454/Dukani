import { useEffect, useState } from "react";
import { getOrders } from "../api/orders";

function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOrders()
      .then(setOrders)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading orders...</p>;
  if (!orders.length) return <p>📦 No orders found</p>;

  return (
    <div style={{ padding: "10px" }}>
      <h2>📦 My Orders</h2>
      {orders.map((order) => (
        <div key={order._id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginBottom: 10 }}>
          <h3>Order #{order._id?.slice(-6)}</h3>
          <p>Total: KES {order.total}</p>
          <p>{new Date(order.created_at).toLocaleString()}</p>
          {order.items?.map((item, i) => (
            <div key={i}>{item.name || item.product_id} x {item.qty}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default Orders;
