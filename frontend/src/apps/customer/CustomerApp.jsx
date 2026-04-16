import { useEffect, useState } from "react";
import API from "../../api/client";
import { addToCart } from "../../api/cart";
import Cart from "../../pages/Cart";
import Orders from "../../pages/Orders";

function CustomerApp() {
  const [view, setView] = useState("products");
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState("");
  const [products, setProducts] = useState([]);

  useEffect(() => {
    API.get("/api/public/categories").then((res) => setCategories(res.data || []));
  }, []);

  useEffect(() => {
    API.get("/api/public/products", { params: category ? { category } : {} }).then((res) => setProducts(res.data || []));
  }, [category]);

  return (
    <div>
      <h2>Customer Marketplace</h2>
      <div style={{ marginBottom: 12 }}>
        <button onClick={() => setView("products")}>Products</button>{" "}
        <button onClick={() => setView("cart")}>Cart</button>{" "}
        <button onClick={() => setView("orders")}>Orders</button>
      </div>
      {view === "products" && (
        <>
          <label>Category: </label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c._id} value={c.name}>{c.name}</option>
            ))}
          </select>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginTop: 12 }}>
            {products.map((p) => (
              <div key={p._id} style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
                <h4>{p.name}</h4>
                <p>KES {p.price}</p>
                <button onClick={() => addToCart(p._id)}>Add to Cart</button>
              </div>
            ))}
          </div>
        </>
      )}
      {view === "cart" && <Cart />}
      {view === "orders" && <Orders />}
    </div>
  );
}

export default CustomerApp;
