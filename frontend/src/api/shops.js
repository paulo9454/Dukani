import API from "./client";

// =========================
// GET SHOPS
// =========================
export const getShops = async () => {
  const res = await API.get("/api/owner/shops");
  return res.data;
};

// =========================
// CREATE SHOP
// =========================
export const createShop = async (name) => {
  const res = await API.post("/api/owner/shops", {
    name,
    subscription_plan: "online",
  });

  return res.data;
};
