import axios from "axios";

const API = axios.create({
  baseURL: "http://127.0.0.1:8000",
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

let isRefreshing = false;

// attach token
API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// response handler
API.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    // ❌ no response = backend down
    if (!error.response) {
      console.error("Network error - backend unreachable");
      return Promise.reject(error);
    }

    // 🔐 token expired
    if (error.response.status === 401 && !original._retry) {
      original._retry = true;

      if (isRefreshing) return Promise.reject(error);
      isRefreshing = true;

      const refresh_token = localStorage.getItem("refresh_token");

      if (!refresh_token) {
        localStorage.clear();
        window.location.href = "/login";
        return;
      }

      try {
        const res = await axios.post(
          "http://127.0.0.1:8000/api/auth/refresh",
          { refresh_token }
        );

        localStorage.setItem("token", res.data.access_token);
        isRefreshing = false;

        original.headers.Authorization = `Bearer ${res.data.access_token}`;
        return API(original);
      } catch (err) {
        isRefreshing = false;
        localStorage.clear();
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

export default API;
