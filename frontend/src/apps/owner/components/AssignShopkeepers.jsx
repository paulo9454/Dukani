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
    API.get("/api/dashboard/shops")
      .then((res) => setShops(res.data || []))
      .catch((err) => console.error(err));
  }, []);

  // =========================
  // LOAD SHOPKEEPERS
  // =========================
  const loadShopkeepers = async () => {
    try {
      const res = await API.get("/api/owner/shopkeepers");
      setUsers(res.data || []);
    } catch (err) {
      console.error(err);
      setUsers([]);
    }
  };

  useEffect(() => {
    loadShopkeepers();
  }, []);

  // =========================
  // LOAD ASSIGNMENTS
  // =========================
  const loadAssignments = async (shopId) => {
    if (!shopId) return setAssignments([]);

    try {
      const res = await API.get(
        `/api/owner/shops/${shopId}/assignments`
      );

      setAssignments(res.data?.assignments || []);
    } catch (err) {
      console.error(err);
      setAssignments([]);
    }
  };

  const handleShopChange = (shopId) => {
    setSelectedShop(shopId);
    setAssignments([]);
    loadAssignments(shopId);
  };

  // =========================
  // SAFE ID PICKER
  // =========================
  const getUserId = (u) => u?._id || u?.id;

  // =========================
  // ASSIGN USER
  // =========================
  const assignUser = async (userId) => {
    if (!selectedShop) return alert("Select a shop first");

    try {
      setLoading(true);

      await API.post(
        `/api/owner/shops/${selectedShop}/shopkeepers/${userId}`
      );

      await loadShopkeepers();
      await loadAssignments(selectedShop);
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.detail || "Assignment failed");
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // CREATE SHOPKEEPER
  // =========================
  const createShopkeeper = async () => {
    if (
      !newShopkeeper.full_name ||
      !newShopkeeper.email ||
      !newShopkeeper.password
    ) {
      return alert("Fill all fields");
    }

    try {
      setLoading(true);

      const res = await API.post("/api/auth/register", {
        full_name: newShopkeeper.full_name,
        email: newShopkeeper.email,
        password: newShopkeeper.password,
        role: "shopkeeper",
      });

      const newUserId = res.data?.user?.id || res.data?.id;

      await loadShopkeepers();

      // ⚡ AUTO ASSIGN (if shop selected)
      if (selectedShop && newUserId) {
        await assignUser(newUserId);
      }

      setNewShopkeeper({ full_name: "", email: "", password: "" });
    } catch (err) {
      console.error(err);
      alert("Failed to create shopkeeper");
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // UNASSIGN (FRONTEND READY)
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
      console.warn("Unassign not implemented yet", err);
      alert("Unassign endpoint not ready");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: 20 }}>
      <h3>👥 Assign Shopkeepers</h3>

      {/* CREATE */}
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
      <select
        value={selectedShop}
        onChange={(e) => handleShopChange(e.target.value)}
      >
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

        {users
          .filter((u) =>
            (u.full_name || u.name || "")
              .toLowerCase()
              .includes(search.toLowerCase())
          )
          .map((u) => {
            const userId = getUserId(u);
            const isAssigned =
              u.assigned_shop_ids?.includes(selectedShop);

            return (
              <div
                key={userId}
                style={{
                  border: "1px solid #eee",
                  padding: 10,
                  marginBottom: 8,
                  borderRadius: 6,
                  background: isAssigned ? "#f0fff4" : "#fff",
                }}
              >
                <p>
                  <strong>{u.full_name || u.name}</strong> ({u.email})

                  {isAssigned && (
                    <span style={{ color: "green", marginLeft: 10 }}>
                      🟢 Assigned
                    </span>
                  )}
                </p>

                <button
                  disabled={loading}
                  onClick={() => assignUser(userId)}
                >
                  ➕ Assign
                </button>

                {isAssigned && (
                  <button
                    style={{ marginLeft: 10, color: "red" }}
                    onClick={() => unassignUser(userId)}
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
            <div key={a._id || a.email}>
              👤 {a.full_name || a.name} ({a.email})
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default AssignShopkeepers;
