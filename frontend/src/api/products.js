import API from "./client";

export const getProducts = async ({ shop_id, q = "", barcode = "" } = {}) => {
  const res = await API.get("/api/products", {
    params: {
      shop_id: shop_id || undefined,
      q: q || undefined,
      barcode: barcode || undefined,
    },
  });

  return res.data;
};
