import { useEffect, useState } from "react";
import API from "../../../api/client";

function AssignShopkeepers() {
  const [shops, setShops] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedShop, setSelectedShop] = useState("");
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);

  const [newShopkeeper, setNewShopkeeper] = useState({
    full_name: "",
    email: "",
    password: "",
  });

  const [search, setSearch] = useState("");

  // =========================
  // LOAD SHOPS
  // =========================
  useEffect(() => {
    const loadShops = async () => {
      try {
        const res = await API.get("/api/owner/shops");
        setShops(res.data || []);
      } catch (err) {
        console.error("Load shops error:", err);
        setShops([]);
      }
    };

    loadShops();
  }, []);

  // =========================
  // LOAD SHOPKEEPERS
  // =========================
  const loadShopkeepers = async () => {
    try {
      const res = await API.get("/api/owner/shopkeepers");
      setUsers(res.data || []);
    } catch (err) {
      console.error("Load shopkeepers error:", err);
      setUsers([]);
    }
  };

  useEffect(() => {
    loadShopkeepers();
  }, []);

  // =========================
  // LOAD ASSIGNMENTS (SOURCE OF TRUTH)
  // =========================
  const loadAssignments = async (shopId) => {
    if (!shopId) {
      setAssignments([]);
      return;
    }

    try {
      const res = await API.get(`/api/owner/shops/${shopId}/assignments`);
      setAssignments(res.data?.assignments || []);
    } catch (err) {
      console.error("Load assignments error:", err);
      setAssignments([]);
    }
  };

  const handleShopChange = (shopId) => {
    setSelectedShop(shopId);
    loadAssignments(shopId);
  };

  // =========================
  // CHECK ASSIGNED (FIXED)
  // =========================
  const isAssigned = (userId) => {
    return assignments.some((a) => a.shopkeeper_id === userId);
  };

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

      await loadShopkeepers();
      await loadAssignments(selectedShop);
    } catch (err) {
      console.error("Assign error:", err);
      alert(err?.response?.data?.detail || "Assignment failed");
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // CREATE SHOPKEEPER
  // =========================
  const createShopkeeper = async () => {
    const { full_name, email, password } = newShopkeeper;

    if (!full_name || !email || !password) {
      alert("Fill all fields");
      return;
    }

    try {
      setLoading(true);

      await API.post("/api/auth/register", {
        full_name,
        email,
        password,
        role: "shopkeeper",
      });

      await loadShopkeepers();

      setNewShopkeeper({
        full_name: "",
        email: "",
        password: "",
      });
    } catch (err) {
      console.error("Create shopkeeper error:", err);
      alert("Failed to create shopkeeper");
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // UNASSIGN USER
  // =========================
  const unassignUser = async (userId) => {
    if (!selectedShop) return;

    try {
      setLoading(true);

      await API.post(
        `/api/owner/shops/${selectedShop}/shopkeepers/${userId}/unassign`
      );

      await loadShopkeepers();
      await loadAssignments(selectedShop);
    } catch (err) {
      console.error("Unassign error:", err);
      alert("Unassign failed");
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // FILTER USERS
  // =========================
  const filteredUsers = users.filter((u) =>
    `${u.full_name || u.name || ""} ${u.email || ""}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <div style={{ marginTop: 20 }}>
      <h3>👥 Assign Shopkeepers</h3>

      {/* CREATE SHOPKEEPER */}
      <div style={{ padding: 10, border: "1px solid #ddd", marginBottom: 15 }}>
        <h4>➕ Add Shopkeeper</h4>

        <input
          placeholder="Full Name"
          value={newShopkeeper.full_name}
          onChange={(e) =>
            setNewShopkeeper({ ...newShopkeeper, full_name: e.target.value })
          }
        />

        <input
          placeholder="Email"
          value={newShopkeeper.email}
          onChange={(e) =>
            setNewShopkeeper({ ...newShopkeeper, email: e.target.value })
          }
        />

        <input
          placeholder="Password"
          type="password"
          value={newShopkeeper.password}
          onChange={(e) =>
            setNewShopkeeper({ ...newShopkeeper, password: e.target.value })
          }
        />

        <button onClick={createShopkeeper} disabled={loading}>
          ➕ Create
        </button>
      </div>

      {/* SHOP SELECT */}
      <select value={selectedShop} onChange={(e) => handleShopChange(e.target.value)}>
        <option value="">-- Select Shop --</option>
        {shops.map((s) => (
          <option key={s._id} value={s._id}>
            {s.name}
          </option>
        ))}
      </select>

      {/* SEARCH */}
      <input
        placeholder="Search shopkeepers..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ display: "block", marginTop: 10 }}
      />

      {/* USERS */}
      <div style={{ marginTop: 15 }}>
        <h4>Available Shopkeepers</h4>

        {filteredUsers.map((u) => {
          const assigned = isAssigned(u._id);

          return (
            <div
              key={u._id}
              style={{
                border: "1px solid #eee",
                padding: 10,
                marginBottom: 8,
                borderRadius: 6,
              }}
            >
              <p>
                <strong>{u.full_name || u.name}</strong> ({u.email})

                {assigned && (
                  <span style={{ color: "green", marginLeft: 10 }}>
                    🟢 Assigned
                  </span>
                )}
              </p>

              <button
                disabled={loading || assigned || !selectedShop}
                onClick={() => assignUser(u._id)}
              >
                ➕ Assign
              </button>

              {assigned && (
                <button
                  style={{ marginLeft: 10, color: "red" }}
                  onClick={() => unassignUser(u._id)}
                >
                  ❌ Unassign
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ASSIGNMENTS */}
      <div style={{ marginTop: 20 }}>
        <h4>📌 Current Assignments</h4>

        {assignments.length === 0 ? (
          <p>No assignments</p>
        ) : (
          assignments.map((a) => (
            <div key={a._id}>
              👤 {a.shopkeeper_name || a.name} ({a.shopkeeper_email})
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default AssignShopkeepers;
