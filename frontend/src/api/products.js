import API from "./client";

// =========================
// GET PRODUCTS (SHOP REQUIRED)
// =========================
export const getProducts = async (shop_id, q = "", barcode = "") => {
  const res = await API.get("/api/products", {
    params: {
      shop_id,
      q: q || undefined,
      barcode: barcode || undefined,
    },
  });

  return res.data;
};
