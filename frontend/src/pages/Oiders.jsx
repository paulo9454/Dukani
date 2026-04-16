import { useEffect, useState } from "react";
import { getOrders } from "../api/orders";

function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadOrders = async () => {
      try {
        const data = await getOrders();
        setOrders(data || []);
      } catch (err) {
        console.error("Orders error:", err);
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, []);

  if (loading) return <p>Loading orders...</p>;

  if (!orders.length) return <p>🧾 No orders found</p>;

  return (
    <div style={{ padding: "20px" }}>
      <h2>📦 My Orders</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
        {orders.map((order) => (
          <div
            key={order.id}
            style={{
              border: "1px solid #ddd",
              padding: "15px",
              borderRadius: "10px",
              background: "#fafafa",
            }}
          >
            <h3>Order #{order.id}</h3>
            <p>Status: {order.status || "completed"}</p>
            <p>Total: KES {order.total || 0}</p>
            <p>Date: {order.created_at || "N/A"}</p>

            <hr />

            <h4>Items:</h4>
            {order.items?.map((item, index) => (
              <div key={index}>
                <p>
                  • {item.product_name || item.product_id} × {item.qty}
                </p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Orders;
