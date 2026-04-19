import { useEffect, useState } from "react";
import API from "../../../api/client";

function Shopkeepers() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const [selectedShop, setSelectedShop] = useState("");
  const [shops, setShops] = useState([]);

  // =========================
  // LOAD USERS
  // =========================
  const loadUsers = async () => {
    try {
      const res = await API.get("/api/owner/shopkeepers");
      setUsers(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  // =========================
  // LOAD SHOPS
  // =========================
  const loadShops = async () => {
    try {
      const res = await API.get("/api/dashboard/shops");
      setShops(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadUsers();
    loadShops();
  }, []);

  // =========================
  // ASSIGN USER
  // =========================
  const assignUser = async (userId) => {
    if (!selectedShop) {
      alert("Select a shop first");
      return;
    }

    try {
      setLoading(true);

      await API.post(
        `/api/owner/shops/${selectedShop}/shopkeepers/${userId}`
      );

      alert("✅ Assigned successfully");

      loadUsers();
    } catch (err) {
      alert(err?.response?.data?.detail || "Assignment failed");
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // FILTER USERS
  // =========================
  const filteredUsers = users.filter((u) =>
    `${u.full_name || u.name || ""} ${u.email}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <div>
      <h2 style={{ marginBottom: 15 }}>👥 Shopkeepers Management</h2>

      {/* =========================
          SHOP SELECT
      ========================= */}
      <div style={{ marginBottom: 15 }}>
        <select
          value={selectedShop}
          onChange={(e) => setSelectedShop(e.target.value)}
          style={{
            padding: 8,
            width: "100%",
            borderRadius: 6,
            border: "1px solid #ddd",
          }}
        >
          <option value="">-- Select Shop --</option>
          {shops.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* =========================
          SEARCH BAR
      ========================= */}
      <input
        placeholder="Search shopkeepers..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          padding: 10,
          marginBottom: 15,
          width: "100%",
          borderRadius: 6,
          border: "1px solid #ddd",
        }}
      />

      {/* =========================
          LOADING STATE
      ========================= */}
      {loading && (
        <p style={{ color: "gray" }}>Processing request...</p>
      )}

      {/* =========================
          LIST
      ========================= */}
      {filteredUsers.map((u) => {
        const assigned =
          Array.isArray(u.assigned_shop_ids) &&
          selectedShop &&
          u.assigned_shop_ids.includes(selectedShop);

        return (
          <div
            key={u._id}
            style={{
              border: "1px solid #eee",
              padding: 15,
              marginBottom: 10,
              borderRadius: 10,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "#fff",
            }}
          >
            {/* INFO */}
            <div>
              <strong>{u.full_name || u.name || "No Name"}</strong>
              <p style={{ margin: 0, color: "gray" }}>{u.email}</p>

              {/* BADGE */}
              <span
                style={{
                  display: "inline-block",
                  marginTop: 5,
                  background: assigned ? "green" : "gray",
                  color: "white",
                  padding: "3px 8px",
                  fontSize: 12,
                  borderRadius: 5,
                }}
              >
                {assigned ? "Assigned" : "Unassigned"}
              </span>
            </div>

            {/* ACTIONS */}
            <div>
              <button
                disabled={loading || assigned || !selectedShop}
                onClick={() => assignUser(u._id)}
                style={{
                  padding: "8px 10px",
                  marginRight: 8,
                  cursor: "pointer",
                }}
              >
                ➕ Assign
              </button>
            </div>
          </div>
        );
      })}

      {filteredUsers.length === 0 && (
        <p style={{ color: "gray" }}>No shopkeepers found</p>
      )}
    </div>
  );
}

export default Shopkeepers;
