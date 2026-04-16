import axios from "axios";

const API = axios.create({
  baseURL: "http://127.0.0.1:8000",
});

// ================================
// REQUEST INTERCEPTOR
// ================================
API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// ================================
// REFRESH FUNCTION
// ================================
const refreshToken = async () => {
  try {
    const refresh_token = localStorage.getItem("refresh_token");

    if (!refresh_token) return null;

    const res = await axios.post(
      "http://127.0.0.1:8000/api/auth/refresh",
      {
        refresh_token,
      }
    );

    localStorage.setItem("token", res.data.access_token);
    localStorage.setItem("user", JSON.stringify(res.data.user));

    return res.data.access_token;
  } catch (err) {
    console.error("Refresh failed");
    return null;
  }
};

// ================================
// RESPONSE INTERCEPTOR
// ================================
API.interceptors.response.use(
  (response) => response,

  async (error) => {
    const originalRequest = error.config;

    if (error?.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const newToken = await refreshToken();

      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return API(originalRequest);
      }

      localStorage.clear();
      window.location.href = "/login";
    }

    return Promise.reject(error);
  }
);

export default API;
