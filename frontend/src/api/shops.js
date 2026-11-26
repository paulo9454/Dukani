import API from "./client";
import { getDeviceId } from "../utils/deviceId";

// OWNER SHOPS
export const getOwnerShops = async () => {
  const res = await API.get("/api/owner/shops");
  return res.data;
};

// Backward-compatible alias used by ShopSelector.
export const getShops = getOwnerShops;

// All shop creation must pass through this function so the backend
// receives the same device ID used during owner registration.
export const createOwnerShop = async (payload) => {
  const res = await API.post("/api/owner/shops", {
    ...payload,
    device_id: getDeviceId(),
  });

  return res.data;
};

// Backward-compatible helper used by ShopSelector.
export const createShop = async (name) => {
  return createOwnerShop({ name });
};
