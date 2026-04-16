import { useEffect, useState } from "react";

function OrderDetails({ order, onBack }) {
  const [data, setData] = useState(order);

  useEffect(() => {
    setData(order);
  }, [order]);

  if (!data) return <p>No order selected</p>;

  return (
    <div style={{ padding: "20px" }}>
      {/* BACK BUTTON */}
      <button
        onClick={onBack}
        style={{
          marginBottom: "20px",
          padding: "8px",
          background: "#333",
          color: "white",
          border: "none",
          cursor: "pointer",
        }}
      >
        ← Back to Orders
      </button>

      {/* INVOICE HEADER */}
      <h2>📦 Order Invoice</h2>

      <div style={{ marginBottom: "10px" }}>
        <p><b>Status:</b> {data.status || "paid"}</p>
        <p><b>Total:</b> KES {data.total || 0}</p>
        <p><b>Date:</b> {data.created_at || data.createdAt}</p>
      </div>

      <hr />

      {/* ITEMS */}
      <h3>Items</h3>

      {data.items?.map((item, index) => (
        <div
          key={index}
          style={{
            padding: "10px",
            border: "1px solid #ddd",
            marginBottom: "10px",
            borderRadius: "8px",
          }}
        >
          <p><b>Product:</b> {item.product_id}</p>
          <p><b>Qty:</b> {item.qty}</p>
        </div>
      ))}
    </div>
  );
}

export default OrderDetails;
