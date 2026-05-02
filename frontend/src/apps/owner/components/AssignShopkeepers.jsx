import { useEffect, useState } from "react";
import API from "../../../api/client";

function AssignShopkeepers() {
  const [shops, setShops] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedShop, setSelectedShop] = useState("");
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(true);

  const [newShopkeeper, setNewShopkeeper] = useState({
    full_name: "",
    email: "",
    password: "",
  });

  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const loadShops = async () => {
    try {
      const res = await API.get("/api/owner/shops");
      setShops(res.data || []);
    } catch (err) {
      console.error("Load shops error:", err);
      setShops([]);
    }
  };

  const loadShopkeepers = async () => {
    try {
      const res = await API.get("/api/owner/shopkeepers");
      setUsers(res.data || []);
    } catch (err) {
      console.error("Load shopkeepers error:", err);
      setUsers([]);
    }
  };

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

  useEffect(() => {
    loadShops();
    loadShopkeepers();
  }, []);

  const handleShopChange = (shopId) => {
    setSelectedShop(shopId);
    loadAssignments(shopId);
  };

  const isAssigned = (userId) =>
    assignments.some((a) => a.shopkeeper_id === userId);

  const assignUser = async (userId) => {
    if (!selectedShop) {
      alert("Select a shop first (top of page)");
      return;
    }
    try {
      setLoading(true);
      await API.post(`/api/owner/shops/${selectedShop}/shopkeepers/${userId}`);
      await Promise.all([loadShopkeepers(), loadAssignments(selectedShop)]);
      showToast("✅ Assigned");
    } catch (err) {
      alert(err?.response?.data?.detail || "Assignment failed");
    } finally {
      setLoading(false);
    }
  };

  const unassignUser = async (userId) => {
    if (!selectedShop) return;
    try {
      setLoading(true);
      await API.post(
        `/api/owner/shops/${selectedShop}/shopkeepers/${userId}/unassign`
      );
      await Promise.all([loadShopkeepers(), loadAssignments(selectedShop)]);
      showToast("Unassigned");
    } catch (err) {
      alert("Unassign failed");
    } finally {
      setLoading(false);
    }
  };

  const createShopkeeper = async () => {
    const { full_name, email, password } = newShopkeeper;
    if (!full_name.trim() || !email.trim() || !password) {
      alert("Fill all fields (name, email, password)");
      return;
    }
    if (password.length < 8) {
      alert("Password must be at least 8 characters");
      return;
    }
    try {
      setLoading(true);
      await API.post("/api/owner/shopkeepers", {
        full_name: full_name.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
      await loadShopkeepers();
      setNewShopkeeper({ full_name: "", email: "", password: "" });
      showToast("✅ Shopkeeper created — now select a shop and click Assign");
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to create shopkeeper");
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter((u) =>
    `${u.full_name || u.name || ""} ${u.email || ""}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const inputStyle = {
    padding: 10,
    borderRadius: 6,
    border: "1px solid #cbd5e1",
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <div data-testid="assign-shopkeepers">
      <h2 style={{ marginTop: 0 }}>👥 Shopkeepers & Assignments</h2>
      <p style={{ color: "#555", marginTop: 0 }}>
        Step 1: Add a shopkeeper. Step 2: Select a shop. Step 3: Click Assign.
      </p>

      {/* ========== STEP 1: CREATE SHOPKEEPER ========== */}
      <div
        style={{
          background: "#f0f9ff",
          border: "2px solid #38bdf8",
          borderRadius: 10,
          padding: 16,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
          }}
          onClick={() => setCreateOpen(!createOpen)}
        >
          <h3 style={{ margin: 0 }}>
            ➕ Add New Shopkeeper {createOpen ? "▾" : "▸"}
          </h3>
          <small style={{ color: "#555" }}>(click to toggle)</small>
        </div>

        {createOpen && (
          <div style={{ marginTop: 12 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
              }}
            >
              <input
                data-testid="sk-create-name"
                placeholder="Full Name"
                value={newShopkeeper.full_name}
                onChange={(e) =>
                  setNewShopkeeper({
                    ...newShopkeeper,
                    full_name: e.target.value,
                  })
                }
                style={inputStyle}
              />
              <input
                data-testid="sk-create-email"
                type="email"
                placeholder="Email"
                value={newShopkeeper.email}
                onChange={(e) =>
                  setNewShopkeeper({ ...newShopkeeper, email: e.target.value })
                }
                style={inputStyle}
              />
              <input
                data-testid="sk-create-password"
                placeholder="Password (min 8 chars)"
                type="password"
                value={newShopkeeper.password}
                onChange={(e) =>
                  setNewShopkeeper({
                    ...newShopkeeper,
                    password: e.target.value,
                  })
                }
                style={inputStyle}
              />
            </div>

            <button
              data-testid="sk-create-btn"
              onClick={createShopkeeper}
              disabled={loading}
              style={{
                marginTop: 12,
                padding: "10px 20px",
                background: "#2563eb",
                color: "white",
                border: "none",
                borderRadius: 6,
                fontSize: 15,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {loading ? "Creating..." : "➕ Create Shopkeeper"}
            </button>
          </div>
        )}
      </div>

      {/* ========== STEP 2: PICK A SHOP ========== */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>
          🏪 Select the shop you want to assign to:
        </label>
        <select
          data-testid="sk-shop-select"
          value={selectedShop}
          onChange={(e) => handleShopChange(e.target.value)}
          style={{ ...inputStyle, padding: 10 }}
        >
          <option value="">-- Select Shop --</option>
          {shops.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name} ({s.subscription_plan})
            </option>
          ))}
        </select>
      </div>

      {/* ========== STEP 3: LIST + ASSIGN ========== */}
      <div style={{ marginBottom: 10 }}>
        <input
          placeholder="Search shopkeepers by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={inputStyle}
        />
      </div>

      <h3 style={{ marginTop: 20 }}>Available Shopkeepers ({filteredUsers.length})</h3>

      {filteredUsers.length === 0 && (
        <p style={{ color: "#888" }}>
          No shopkeepers yet. Use the form above to add one.
        </p>
      )}

      {filteredUsers.map((u) => {
        const assigned = isAssigned(u._id);
        return (
          <div
            key={u._id}
            data-testid={`sk-row-${u._id}`}
            style={{
              border: "1px solid #e2e8f0",
              padding: 12,
              marginBottom: 8,
              borderRadius: 8,
              background: assigned ? "#ecfdf5" : "#fff",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <b>{u.full_name || u.name || "Unnamed"}</b>{" "}
              <span style={{ color: "#555" }}>({u.email})</span>
              {assigned && (
                <span
                  style={{
                    marginLeft: 8,
                    background: "#16a34a",
                    color: "white",
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 4,
                  }}
                >
                  ASSIGNED
                </span>
              )}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                data-testid={`sk-assign-${u._id}`}
                disabled={loading || assigned || !selectedShop}
                onClick={() => assignUser(u._id)}
                style={{
                  padding: "8px 14px",
                  background: assigned || !selectedShop ? "#cbd5e1" : "#2563eb",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor:
                    assigned || !selectedShop ? "not-allowed" : "pointer",
                }}
              >
                ➕ Assign
              </button>

              {assigned && (
                <button
                  data-testid={`sk-unassign-${u._id}`}
                  onClick={() => unassignUser(u._id)}
                  style={{
                    padding: "8px 14px",
                    background: "#dc2626",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  ❌ Unassign
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* ========== CURRENT ASSIGNMENTS FOR SELECTED SHOP ========== */}
      <div style={{ marginTop: 24 }}>
        <h3>📌 Current Assignments for Selected Shop</h3>
        {!selectedShop ? (
          <p style={{ color: "#888" }}>Select a shop above to see its assignments.</p>
        ) : assignments.length === 0 ? (
          <p style={{ color: "#888" }}>No shopkeepers assigned to this shop yet.</p>
        ) : (
          assignments.map((a) => (
            <div
              key={a.shopkeeper_id}
              style={{
                padding: 10,
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                marginBottom: 6,
                background: "#fff",
              }}
            >
              👤 <b>{a.shopkeeper_name || "—"}</b>{" "}
              <span style={{ color: "#555" }}>({a.shopkeeper_email || "—"})</span>
            </div>
          ))
        )}
      </div>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            background: "#111",
            color: "#fff",
            padding: "10px 15px",
            borderRadius: 6,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

export default AssignShopkeepers;
