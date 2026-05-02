import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import API from "../../api/client";
import "../../receipt.css";

function PosApp({ user, shopId }) {
  const assignedShopId = useMemo(() => {
    return shopId || user?.assigned_shop_ids?.[0] || "";
  }, [shopId, user]);

  const [activeShopId, setActiveShopId] = useState("");
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [lastReceipt, setLastReceipt] = useState(null);
  const [search, setSearch] = useState("");
  const [priceMode, setPriceMode] = useState("retail");
  const [categories, setCategories] = useState([]);
const [activeCategory, setActiveCategory] = useState("all");

  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef(null);

  const intervalRef = useRef(null);

  // ✅ NEW: payment state
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [creditors, setCreditors] = useState([]);
  const [creditor, setCreditor] = useState(null);
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [creditFormOpen, setCreditFormOpen] = useState(false);
const [newCreditor, setNewCreditor] = useState({
  name: "",
  phone: "",
  credit_limit: ""
});
const [cashReceived, setCashReceived] = useState("");

  useEffect(() => {
    if (assignedShopId) setActiveShopId(assignedShopId);
  }, [assignedShopId]);

  const loadProducts = useCallback(async () => {
    try {
      const res = await API.get(`/api/products?shop_id=${activeShopId}`);
      setProducts(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      setProducts([]);
    }
  }, [activeShopId]);
  
const loadCategories = useCallback(async () => {
  try {
    const res = await API.get(`/api/categories?shop_id=${activeShopId}`);
    setCategories(res.data || []);
  } catch (err) {
    console.error(err);
  }
}, [activeShopId]);
  // ✅ load creditors
  const loadCreditors = useCallback(async () => {
    try {
      const res = await API.get(`/api/credit-customers?shop_id=${activeShopId}`);
      console.log("CATEGORIES FULL:",res.data);
      setCreditors(res.data || []);
    } catch (err) {
      console.error(err);
    }
  }, [activeShopId]);

  useEffect(() => {
  if (!activeShopId) return;

  // 🔹 Load once immediately
  loadProducts();
  loadCreditors();
  loadCategories();

  // 🔹 Clear any old interval first
  if (intervalRef.current) {
    clearInterval(intervalRef.current);
  }

  // 🔹 Start fresh interval
  intervalRef.current = setInterval(() => {
    loadProducts();
  }, 15000);

  return () => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  };
}, [activeShopId]);
  const filteredProducts = useMemo(() => {
  let result = products;

  // ✅ FILTER BY CATEGORY
  if (activeCategory !== "all") {
    result = result.filter(
      (p) => String(p.category_id) === String(activeCategory)
    );
  }

  // ✅ FILTER BY SEARCH
  if (search) {
    result = result.filter((p) =>
      (p.name || "").toLowerCase().includes(search.toLowerCase())
    );
  }

  return result;
}, [products, search, activeCategory]);
  const getPrice = (product) => {
    if (priceMode === "wholesale" && product.wholesale_price > 0) {
      return product.wholesale_price;
    }
    return product.price || 0;
  };
  const getCategoryName = (category_id) => {
  const cat = categories.find((c) => String(c._id) === String(category_id));
  return cat ? `${cat.icon || "📦"} ${cat.name}` : "Uncategorized";
};

  const getProductImage = (p) => {
  if (!p) return null;

  const img = p.image || p.image_url || (p.images && p.images[0]);

  if (!img) return null;

  // ✅ attach backend URL
  if (img.startsWith("http")) return img;

  // Migrate legacy /static/products paths → /api/static/products so they pass
  // through the Emergent ingress (which only routes /api/* to backend).
  const normalized = img.startsWith("/static/")
    ? "/api" + img
    : img;

  return `${import.meta.env.VITE_BACKEND_URL || ""}${normalized}`;
};
  const add = (product) => {
    const price = getPrice(product);
    const stock = product.stock ?? Infinity;

    setCart((prev) => {
    
      const found = prev.find((i) => i._id === product._id);

      if (found) {
        if (found.qty >= stock) return prev;
        return prev.map((i) =>
          i._id === product._id ? { ...i, qty: i.qty + 1 } : i
        );
      }

      return [
        ...prev,
        {
          _id: product._id,
          name: product.name,
          price,
          qty: 1,
          stock,
        },
      ];
    });
  };

  const increase = (id) => {
    setCart((prev) =>
      prev.map((i) =>
        i._id === id
          ? { ...i, qty: Math.min(i.qty + 1, i.stock || Infinity) }
          : i
      )
    );
  };

  const decrease = (id) => {
    setCart((prev) =>
      prev
        .map((i) => (i._id === id ? { ...i, qty: i.qty - 1 } : i))
        .filter((i) => i.qty > 0)
    );
  };

  const clearCart = () => setCart([]);
  const createCreditor = async () => {
  try {
    const res = await API.post("/api/credit-customers", {
      shop_id: activeShopId,
      name: newCreditor.name,
      phone: newCreditor.phone,
      credit_limit: Number(newCreditor.credit_limit),
    });

    setCreditors((prev) => [res.data, ...prev]);

    // ✅ auto select (important)
    setCreditor(res.data);

    setNewCreditor({ name: "", phone: "", credit_limit: "" });
    setCreditFormOpen(false);
  } catch (err) {
    console.error(err.response?.data);
    alert(err.response?.data?.detail || "Failed to create creditor");
  }
};

  // ✅ UPDATED CHECKOUT
  const checkout = async () => {
  const createCreditor = async () => {
  try {
    const res = await API.post("/api/credit-customers", {
      shop_id: activeShopId,
      name: newCreditor.name,
      phone: newCreditor.phone,
      credit_limit: Number(newCreditor.credit_limit),
    });

    setCreditors((prev) => [res.data, ...prev]);

    setNewCreditor({ name: "", phone: "", credit_limit: "" });
    setCreditFormOpen(false);
  } catch (err) {
    console.error(err.response?.data);
    alert(err.response?.data?.detail || "Failed to create creditor");
  }
};
    try {
    if (creditLimitExceeded) {
  alert(
    `Credit limit exceeded. Available: KES ${availableCredit}, Total: KES ${subtotal}`
  );
  return;
}
      const idempotencyKey = Date.now().toString();
      if (paymentMethod === "mpesa" && !mpesaPhone) {
  alert("Enter M-Pesa phone number");
  return;
}
if (paymentMethod === "cash" && Number(cashReceived) < subtotal) {
  alert("Insufficient cash");
  return;
}

      const payload = {
        shop_id: activeShopId,
        items: cart.map((i) => ({
          product_id: i._id,
          qty: i.qty,
        })),
        payment_provider: "POS",
	channel: "pos",   // ✅ ADD THIS LINE
        idempotency_key: idempotencyKey,
        payment_method: paymentMethod,
        credit_customer_id:
          paymentMethod === "credit" ? creditor?._id : null,
        discount: 0,
        tax_percent: 0,
        payment_meta:
  paymentMethod === "mpesa"
    ? { phone_number: mpesaPhone }
    : paymentMethod === "credit"
    ? { credit_customer_id: creditor?._id }
    : {},
      };

      const res = await API.post("/api/orders/checkout", payload, {
        headers: {
          "Idempotency-Key": idempotencyKey,
        },
      });

      setLastReceipt({
  items: cart,
  total: subtotal,
  payment_method: paymentMethod
});
      setCart([]);
      setCreditor(null);
      setCashReceived("");
    } catch (err) {
      console.error(err.response?.data);
      alert(JSON.stringify(err.response?.data?.detail || "Checkout failed"));
    }
  };

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const change =
  paymentMethod === "cash"
    ? Number(cashReceived || 0) - subtotal
    : 0;
  const availableCredit =
  paymentMethod === "credit" && creditor
    ? (creditor.credit_limit || 0) - (creditor.balance || 0)
    : 0;

const creditLimitExceeded =
  paymentMethod === "credit" &&
  creditor &&
  subtotal > availableCredit;

useEffect(() => {
  if (paymentMethod === "cash") {
    setCashReceived(subtotal);
  }
}, [subtotal, paymentMethod]);
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }

      if (e.key === "ArrowDown") {
        setActiveIndex((i) =>
          Math.min(i + 1, filteredProducts.length - 1)
        );
      }

      if (e.key === "ArrowUp") {
        setActiveIndex((i) => Math.max(i - 1, 0));
      }

      if (e.key === "Enter" && filteredProducts[activeIndex]) {
        add(filteredProducts[activeIndex]);
      }

      if (e.ctrlKey && e.key === "Enter") {
        checkout();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filteredProducts, activeIndex, cart, paymentMethod]);

  if (!activeShopId) {
    return <div style={{ padding: 20 }}>Loading shop...</div>;
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: "#f4f6f8" }}>
      
    <div style={{
  flex: 3,
  padding: 9,
  overflowY: "auto",
  minWidth: 0   // ✅ THIS IS THE KEY FIX
}}>
        <h2>🧾 Cashier POS</h2>
        <p>Shop: {activeShopId}</p>

        <div style={{ marginBottom: 10 }}>
          <button onClick={() => setPriceMode("retail")}>Retail</button>
          <button onClick={() => setPriceMode("wholesale")}>Wholesale</button>
        </div>

        <input
  ref={searchRef}
  placeholder="Search products or press /"
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  style={{
    width: "100%",
    maxWidth: 420,
    padding: "10px 12px",
    marginBottom: 12,
    borderRadius: 10,
    border: "1px solid #ddd",
    outline: "none",
  }}
/>
{/* 🧩 CATEGORY BAR */}
<div
  style={{
    display: "flex",
    gap: 10,
    marginBottom: 12,
    overflowX: "auto",
    paddingBottom: 6,
  }}
>
  {/* ALL */}
  <button
    onClick={() => setActiveCategory("all")}
    style={{
      padding: "8px 14px",
      borderRadius: 20,
      background: activeCategory === "all" ? "#111" : "#f2f2f2",
      color: activeCategory === "all" ? "#fff" : "#000",
      whiteSpace: "nowrap",
      fontWeight: "bold",
    }}
  >
    🏪 All
  </button>

  {/* CATEGORIES */}
  {categories.map((c) => (
    <button
      key={c._id}
      onClick={() => setActiveCategory(c._id)}
      style={{
        padding: "8px 14px",
        borderRadius: 20,
        background: activeCategory === c._id ? "#111" : "#f2f2f2",
        color: activeCategory === c._id ? "#fff" : "#000",
        whiteSpace: "nowrap",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span>{c.icon || "📦"}</span>
      <span>{c.name}</span>
    </button>
  ))}
</div>

        <div style={{
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
  gap: 12
}}>
  {filteredProducts.map((p, idx) => {
    const img = getProductImage(p);   // ✅ ADD THIS LINE

    return (
    <div
      key={p._id}
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: 10,
        boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
        position: "relative",
      }}
    >
      {/* IMAGE */}
     <div
  style={{
    height: 120,
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 8,
    background: "#f3f4f6",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  }}
>
  {img ? (
    <img
      src={img}
      alt={p.name}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover"
      }}
    />
  ) : (
    <span style={{ fontSize: 12, color: "#999" }}>
      No image
    </span>
  )}
</div>
      {/* NAME */}
      <b style={{ display: "block" }}>{p.name}</b>

      {/* CATEGORY */}
      <small style={{ color: "#777" }}>
        {getCategoryName(p.category_id)}
      </small>

      {/* PRICE */}
      <div style={{ marginTop: 5, fontWeight: "bold" }}>
        KES {getPrice(p)}
      </div>

      {/* QUICK ADD BUTTON */}
      <button
        onClick={() => add(p)}
        style={{
          marginTop: 8,
          width: "100%",
          padding: 8,
          background: "#16a34a",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
          fontWeight: "bold",
        }}
      >
        + Add
      </button>
    </div>
  );
})}
        </div>
      </div>

      <div style={{
        width: 340,
        background: "#fff",
        padding: 16,
        borderLeft: "1px solid #ddd"
      }}>
        <h3>Cart</h3>
        <button
  onClick={() => setCreditFormOpen(true)}
  style={{
    width: "100%",
    padding: 10,
    marginBottom: 10,
    background: "#007bff",
    color: "#fff",
    border: "none",
    borderRadius: 6,
  }}
>
  ➕ Create Creditor
</button>
        

        {cart.map((i) => (
  <div
    key={i._id}
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "8px 0",
      borderBottom: "1px solid #eee",
    }}
  >
    <div>
      <b>{i.name}</b>
      <div style={{ fontSize: 12, color: "#666" }}>
        {i.qty} × {i.price}
      </div>
    </div>

    <div style={{ display: "flex", gap: 5 }}>
      <button onClick={() => decrease(i._id)}>-</button>
      <button onClick={() => increase(i._id)}>+</button>
    </div>
  </div>
))}
        {creditFormOpen && (
  <div style={{
    background: "#f8f8f8",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10
  }}>
    <input
      placeholder="Name"
      value={newCreditor?.name || ""}
      onChange={(e) =>
        setNewCreditor((prev) => ({
          ...prev,
          name: e.target.value
        }))
      }
      style={{ width: "100%", padding: 8, marginBottom: 6 }}
    />

    <input
      placeholder="Phone"
      value={newCreditor?.phone || ""}
      onChange={(e) =>
        setNewCreditor((prev) => ({
          ...prev,
          phone: e.target.value
        }))
      }
      style={{ width: "100%", padding: 8, marginBottom: 6 }}
    />

    <input
      placeholder="Credit Limit"
      value={newCreditor?.credit_limit || ""}
      onChange={(e) =>
        setNewCreditor((prev) => ({
          ...prev,
          credit_limit: e.target.value
        }))
      }
      style={{ width: "100%", padding: 8, marginBottom: 6 }}
    />

    <button
      onClick={createCreditor}
      style={{
        width: "100%",
        padding: 10,
        background: "green",
        color: "#fff",
        border: "none",
        borderRadius: 6
      }}
    >
      Save Creditor
    </button>
  </div>
)}

        <hr />

        <h2>KES {subtotal}</h2>
        {paymentMethod === "credit" && creditor && (
  <div style={{
    marginTop: 8,
    padding: 8,
    borderRadius: 6,
    background: creditLimitExceeded ? "#ffe5e5" : "#e7f7e7",
    color: creditLimitExceeded ? "red" : "green"
  }}>
    Available Credit: KES {availableCredit}
  </div>
)}

      {/* 💳 PAYMENT MODES (Shopify style tabs) */}
<div style={{
  display: "flex",
  gap: 8,
  marginBottom: 12
}}>
    <button
  onClick={() => {
    setPaymentMethod("cash");
    setCashReceived(subtotal); // ✅ AUTO-FILL EXACT AMOUNT
  }}
    style={{
      flex: 1,
      padding: 9,
      background: paymentMethod === "cash" ? "#111" : "#eee",
      color: paymentMethod === "cash" ? "#fff" : "#000",
      borderRadius: 6
    }}
  >
    Cash
  </button>

  <button
    onClick={() => setPaymentMethod("mpesa")}
    style={{
      flex: 1,
      padding: 10,
      background: paymentMethod === "mpesa" ? "#111" : "#eee",
      color: paymentMethod === "mpesa" ? "#fff" : "#000",
      borderRadius: 6
    }}
  >
    M-Pesa
  </button>

  <button
    onClick={() => setPaymentMethod("credit")}
    style={{
      flex: 1,
      padding: 10,
      background: paymentMethod === "credit" ? "#111" : "#eee",
      color: paymentMethod === "credit" ? "#fff" : "#000",
      borderRadius: 6
    }}
  >
    Credit
  </button>
</div>
        {/* 🧾 CREDIT CUSTOMER SELECTOR (Shopify style) */}
{paymentMethod === "credit" && (
  <div style={{
    background: "#f8f8f8",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10
  }}>
    <small>Select Credit Customer</small>

    <select
      onChange={(e) =>
        setCreditor(
          creditors.find((c) => c._id === e.target.value)
        )
      }
      style={{
        width: "100%",
        padding: 10,
        marginTop: 5
      }}
    >
      <option value="">Select customer</option>
      {creditors.map((c) => (
        <option key={c._id} value={c._id}>
          {c.name} | Limit: {c.credit_limit} | Due: {c.balance}
        </option>
      ))}
    </select>
  </div>
)}
{/* 📱 M-PESA INPUT (Shopify style) */}
{/* 💵 CASH INPUT (Shopify style) */}
{paymentMethod === "cash" && (
  <div style={{
    background: "#f8f8f8",
    padding: 10,
    borderRadius: 8,
    marginBottom: 12
  }}>
    <small>Cash Received</small>

    <input
      type="number"
      placeholder="Enter amount"
      value={cashReceived}
      onChange={(e) => setCashReceived(e.target.value)}
      style={{
        width: "92%",
        padding: 10,
        borderRadius: 8,
        marginTop: 3
      }}
    />

    {/* 💰 QUICK CASH BUTTONS */}
    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
      {[100, 500, 1000].map((amt) => (
        <button
          key={amt}
          onClick={() => setCashReceived(amt)}
          style={{
            flex: 1,
            padding: 10,
            background: "#eee",
            borderRadius: 8
          }}
        >
          {amt}
        </button>
      ))}
    </div>

    {/* 🧮 CHANGE DISPLAY */}
    <div style={{
      marginTop: 8,
      fontWeight: "bold",
      color: change < 0 ? "red" : "green"
    }}>
      Change: KES {change > 0 ? change : 0}
    </div>
  </div>
)}
{paymentMethod === "mpesa" && (
  <div style={{
    background: "#f8f8f8",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10
  }}>
    <small>M-Pesa Phone</small>

    <input
      placeholder="07XXXXXXXX"
      value={mpesaPhone}
      onChange={(e) => setMpesaPhone(e.target.value)}
      style={{
        width: "100%",
        padding: 10,
        marginTop: 5
      }}
    />
  </div>
)}

       <button
  onClick={checkout}
  disabled={!cart.length}
  style={{
    width: "100%",
    padding: 14,
    marginTop: 10,
    background: cart.length ? "#111" : "#ccc",
    color: "#fff",
    fontWeight: "bold",
    borderRadius: 10,
    cursor: cart.length ? "pointer" : "not-allowed",
  }}
>
  Checkout • KES {subtotal}
</button>
      </div>

      <Receipt
  data={lastReceipt}
  onClose={() => setLastReceipt(null)}
/>
    </div>
  );
}
function Receipt({ data, onClose }) {
  if (!data) return null;

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      background: "rgba(0,0,0,0.5)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 9999
    }}>
      <div className="receipt" style={{
  background: "#fff",
  padding: 20,
  width: 320,
  borderRadius: 10,
  fontFamily: "monospace"
}}>
        <h3 style={{ textAlign: "center" }}>🧾 RECEIPT</h3>

        <hr />

        {data.items?.map((item, i) => (
          <div key={i} style={{ marginBottom: 6 }}>
            <div>{item.name}</div>
            <div style={{ fontSize: 12 }}>
              {item.qty} × {item.price} = {item.qty * item.price}
            </div>
          </div>
        ))}

        <hr />

        <div>Total: <b>KES {data.total}</b></div>
        <div>Payment: {data.payment_method}</div>

        <div style={{ fontSize: 12, marginTop: 10 }}>
          {new Date().toLocaleString()}
        </div>

        <hr />

        <button
          onClick={() => window.print()}
          style={{
            width: "100%",
            padding: 10,
            marginBottom: 8,
            background: "#111",
            color: "#fff",
            borderRadius: 6
          }}
        >
          🖨 Print
        </button>

        <button
          onClick={onClose}
          style={{
            width: "100%",
            padding: 10,
            background: "#ddd",
            borderRadius: 6
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
export default PosApp;
