import { useEffect, useState } from "react";
import { getOrders } from "../api/orders";
import { getProducts } from "../api/products";

function Orders({ onSelectOrder }) {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [orderData, productData] = await Promise.all([
          getOrders(),
          getProducts(),
        ]);

        setOrders(orderData);
        setProducts(productData);
      } catch (err) {
        console.error("Orders error:", err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const getProduct = (id) => products.find((p) => p._id === id);

  const badgeStyle = (status) => {
    switch (status) {
      case "paid":
        return { background: "#d1fae5", color: "#065f46" };
      case "pending":
        return { background: "#fef3c7", color: "#92400e" };
      case "failed":
        return { background: "#fee2e2", color: "#991b1b" };
      default:
        return { background: "#e5e7eb", color: "#374151" };
    }
  };

  if (loading) return <p>Loading orders...</p>;
  if (!orders.length) return <p>📦 No orders found</p>;

  return (
    <div style={{ padding: "10px" }}>
      <h2>📦 My Orders</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {orders.map((order) => (
          <div
            key={order._id}
            onClick={() => onSelectOrder && onSelectOrder(order)}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: "14px",
              padding: "16px",
              background: "#ffffff",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              cursor: "pointer",
              transition: "0.2s",
            }}
          >
            {/* HEADER */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0 }}>
                Order #{order._id?.slice(-6)}
              </h3>

              <span
                style={{
                  padding: "4px 10px",
                  borderRadius: "999px",
                  fontSize: "12px",
                  fontWeight: "bold",
                  ...badgeStyle(order.status),
                }}
              >
                {order.status}
              </span>
            </div>

            {/* META */}
            <p style={{ margin: "6px 0" }}>
              <strong>Total:</strong> KES {order.total}
            </p>

            <p style={{ fontSize: "12px", color: "#6b7280" }}>
              {new Date(order.created_at).toLocaleString()}
            </p>

            {/* ITEMS */}
            <div style={{ marginTop: "10px" }}>
              <strong>Items</strong>

              <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "8px" }}>
                {order.items.map((item, i) => {
                  const product = getProduct(item.product_id);

                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "8px",
                        border: "1px solid #f3f4f6",
                        borderRadius: "10px",
                        background: "#fafafa",
                      }}
                    >
                      {/* IMAGE */}
                      {product?.image ? (
                        <img
                          src={product.image}
                          alt=""
                          style={{
                            width: "45px",
                            height: "45px",
                            borderRadius: "8px",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "45px",
                            height: "45px",
                            borderRadius: "8px",
                            background: "#e5e7eb",
                          }}
                        />
                      )}

                      {/* NAME + QTY */}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: "500" }}>
                          {product?.name || item.product_id}
                        </div>

                        <div style={{ fontSize: "12px", color: "#6b7280" }}>
                          Qty: {item.qty}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Orders;
