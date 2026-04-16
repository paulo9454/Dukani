import API from "./client";

// =========================
// GET SHOPS
// =========================
export const getShops = async () => {
  const res = await API.get("/api/dashboard/shops");
  return res.data;
};

// =========================
// CREATE SHOP
// =========================
export const createShop = async (name) => {
  const res = await API.post("/api/dashboard/shops", {
    name,
    subscription_plan: "legacy", // ✅ REQUIRED by backend
  });

  return res.data;
};
