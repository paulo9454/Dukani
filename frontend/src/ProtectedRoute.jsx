import { Navigate } from "react-router-dom";

function ProtectedRoute({ children, allowedRoles }) {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  // ❌ not logged in
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // ❌ role restriction (if provided)
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  // ❌ subscription check (owner only)
  if (user.role === "owner" && user.subscription_status === "expired") {
    return <Navigate to="/subscription" replace />;
  }

  // ✅ allow access
  return children;
}

export default ProtectedRoute;
