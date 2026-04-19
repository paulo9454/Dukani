import { useEffect, useState } from "react";
import API from "../../../api/client";

export default function ShopsPage({ category, onSelectShop, onBack }) {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!category) return;

    const loadShops = async () => {
      try {
        // ✅ category is already a STRING
        const res = await API.get(`/api/public/shops?category=${category}`);
        setShops(res.data || []);
      } catch (err) {
        console.error("Failed to load shops:", err);
        setShops([]);
      } finally {
        setLoading(false);
      }
    };

    loadShops();
  }, [category]);

  return (
    <div>
      <button onClick={onBack}>⬅ Back</button>

      <h3>Shops in {category}</h3>

      {loading && <p>Loading shops...</p>}

      {!loading && shops.length === 0 && (
        <p>No shops available in this category</p>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {shops.map((s) => (
          <div
            key={s._id}
            onClick={() => onSelectShop(s)}
            style={{
              padding: 12,
              border: "1px solid #ddd",
              borderRadius: 8,
              cursor: "pointer",
              background: "#fafafa",
            }}
          >
            <b>{s.name}</b>

            <div style={{ fontSize: 12, marginTop: 4 }}>
              {s.online_enabled ? "🟢 Online Store" : "⚪ Physical Only"}
            </div>

            <div style={{ fontSize: 11, color: "#666" }}>
              Category: {s.category || "N/A"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
