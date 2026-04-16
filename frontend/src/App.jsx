import { useEffect, useState } from "react";
import API from "./api/client";
import Login from "./pages/Login";
import Register from "./pages/Register";
import OwnerApp from "./apps/owner/OwnerApp";
import PosApp from "./apps/pos/PosApp";
import CustomerApp from "./apps/customer/CustomerApp";

function App() {
  const [authView, setAuthView] = useState("login");
  const token = localStorage.getItem("token");
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user")) || {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (!token) return;
    API.get("/api/auth/me")
      .then((res) => {
        localStorage.setItem("user", JSON.stringify(res.data));
        setUser(res.data);
      })
      .catch(() => {
        localStorage.clear();
        window.location.reload();
      });
  }, [token]);

  if (!token || !user?.role) {
    return authView === "login" ? (
      <Login onSwitch={() => setAuthView("register")} />
    ) : (
      <Register onSwitch={() => setAuthView("login")} />
    );
  }

  return (
    <div style={{ padding: 20, fontFamily: "Arial" }}>
      <h1>DUKANI</h1>
      <button onClick={() => { localStorage.clear(); window.location.reload(); }}>Logout</button>
      {user.role === "owner" && <OwnerApp user={user} />}
      {user.role === "shopkeeper" && <PosApp user={user} />}
      {user.role === "customer" && <CustomerApp user={user} />}
    </div>
  );
}

export default App;
