import React from "react";

function Receipt({ order, onClose }) {
  if (!order) return null;

  const total = order.items.reduce(
    (sum, i) => sum + i.price * i.qty,
    0
  );

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 999,
      }}
    >
      <div
        id="receipt"
        style={{
          background: "white",
          padding: "20px",
          width: "300px",
          borderRadius: "10px",
          fontFamily: "monospace",
        }}
      >
        <h3 style={{ textAlign: "center" }}>🧾 Dukani POS</h3>
        <hr />

        <p><strong>Order ID:</strong> {order._id || "N/A"}</p>
        <p><strong>Date:</strong> {new Date().toLocaleString()}</p>

        <hr />

        {order.items.map((item, index) => (
          <div key={index}>
            <p>{item.name || item.product_id}</p>
            <p>
              {item.qty} × {item.price} ={" "}
              {item.qty * item.price}
            </p>
            <hr />
          </div>
        ))}

        <h3>Total: KES {total}</h3>

        <hr />
        <p style={{ textAlign: "center" }}>
          Thank you 🙏
        </p>

        <button
          onClick={() => window.print()}
          style={{
            width: "100%",
            padding: "8px",
            marginTop: "10px",
            background: "black",
            color: "white",
          }}
        >
          🖨 Print
        </button>

        <button
          onClick={onClose}
          style={{
            width: "100%",
            padding: "8px",
            marginTop: "5px",
            background: "gray",
            color: "white",
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default Receipt;
