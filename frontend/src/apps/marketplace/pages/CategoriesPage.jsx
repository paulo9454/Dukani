import { useEffect, useState } from "react";
import API from "../../../api/client";

export default function CategoriesPage({ onSelect }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const res = await API.get("/api/public/categories");

        // ✅ backend returns array of strings
        setCategories(res.data || []);
      } catch (err) {
        console.error("Failed to load categories:", err);
        setCategories([]);
      } finally {
        setLoading(false);
      }
    };

    loadCategories();
  }, []);

  return (
    <div>
      <h3>Categories</h3>

      {loading && <p>Loading categories...</p>}

      {!loading && categories.length === 0 && (
        <p>No categories available</p>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {categories.map((c) => (
          <div
            key={c} // ✅ string key
            onClick={() => onSelect(c)} // ✅ pass string
            style={{
              padding: 12,
              border: "1px solid #ddd",
              cursor: "pointer",
              borderRadius: 8,
              background: "#fafafa",
            }}
          >
            {c} {/* ✅ display string */}
          </div>
        ))}
      </div>
    </div>
  );
}
