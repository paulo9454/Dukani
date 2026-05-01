import axios from "axios";

const API = axios.create({
  baseURL: "http://127.0.0.1:8000",
  headers: {
    "Content-Type": "application/json",
  },
});

// =========================
// 🔐 SINGLE TOKEN SYSTEM (FIXED)
// =========================
API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token"); // ✅ THIS matches your login

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// =========================
// 🔄 HANDLE 401
// =========================
API.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      console.warn("🔒 Session expired");

      localStorage.removeItem("token");
      window.location.href = "/login";
    }

    return Promise.reject(error);
  }
);

export default API;
