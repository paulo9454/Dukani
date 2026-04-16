import API from "./client";

export const addToCart = async (productId) => {
  const res = await API.post("/api/customer/cart", {
    product_id: productId,
    qty: 1,
  });

  return res.data;
};

export const getCart = async () => {
  const res = await API.get("/api/customer/cart");
  return res.data;
};
