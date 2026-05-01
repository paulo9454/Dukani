import API from "./client";

/* =========================
   📦 GET PRODUCTS
========================= */
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

/* =========================
   ➕ CREATE PRODUCT
========================= */
export const createProduct = async (payload) => {
  const res = await API.post("/api/products", payload);
  return res.data;
};

/* =========================
   📦 RESTOCK SINGLE PRODUCT
========================= */
export const restockProduct = async ({ product_id, qty }) => {
  const res = await API.post("/api/products/restock", {
    product_id,
    qty,
  });
  return res.data;
};

/* =========================
   📦 BULK RESTOCK
========================= */
export const bulkRestock = async (items = []) => {
  const res = await API.post("/api/products/restock/bulk", items);
  return res.data;
};

/* =========================
   ✏️ UPDATE PRODUCT
========================= */
export const updateProduct = async (product_id, payload) => {
  const res = await API.put(`/api/products/${product_id}`, payload);
  return res.data;
};
