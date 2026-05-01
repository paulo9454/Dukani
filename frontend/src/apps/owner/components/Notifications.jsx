import { useEffect, useState } from "react";
import API from "../../../api/client";

function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = async () => {
    try {
      setLoading(true);

      const res = await API.get("/api/notifications");

      setNotifications(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Notifications error:", err);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();

    // 🔁 auto refresh every 10s
    const interval = setInterval(loadNotifications, 10000);
    return () => clearInterval(interval);
  }, []);

  // =========================
  // MARK AS READ
  // =========================
  const markAsRead = async (id) => {
    try {
      await API.post(`/api/notifications/${id}/read`);

      setNotifications((prev) =>
        prev.map((n) =>
          n._id === id ? { ...n, read: true } : n
        )
      );
    } catch (err) {
      console.error("Mark read error:", err);
    }
  };

  return (
    <div>
      <h2>🔔 Notifications</h2>

      {loading && <p>Loading...</p>}

      {!loading && notifications.length === 0 && (
        <p>No notifications</p>
      )}

      {notifications.map((n) => (
        <div
          key={n._id}
          style={{
            border: "1px solid #ddd",
            padding: 10,
            marginBottom: 8,
            borderRadius: 6,
            background: n.read ? "#f9fafb" : "#fee2e2",
          }}
        >
          <div style={{ fontWeight: "bold" }}>
            {n.type}
          </div>

          <div>{n.message}</div>

          <div style={{ fontSize: 12, marginTop: 5 }}>
            {new Date(n.created_at).toLocaleString()}
          </div>

          {!n.read && (
            <button
              onClick={() => markAsRead(n._id)}
              style={{
                marginTop: 8,
                padding: "5px 10px",
                background: "#2563eb",
                color: "white",
                border: "none",
              }}
            >
              Mark as read
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export default Notifications;
