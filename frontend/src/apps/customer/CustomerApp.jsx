import { useEffect, useState } from "react";
import API from "../../api/client";

function CustomerApp() {
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
      <p>Browse by category (public catalog only).</p>
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
          </div>
        ))}
      </div>
    </div>
  );
}

export default CustomerApp;
