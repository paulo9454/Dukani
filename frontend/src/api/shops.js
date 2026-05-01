import API from "./client";

// OWNER SHOPS (ONLY SOURCE OF TRUTH)
export const getOwnerShops = async () => {
  const res = await API.get("/api/owner/shops");
  return res.data;
};
