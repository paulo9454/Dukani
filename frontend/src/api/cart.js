import API from "./client";

// ADD TO CART
export const addToCart = async (productId, shop_id) => {
  const res = await API.post("/api/customer/cart", {
    product_id: productId,
    qty: 1,
    shop_id,
  });

  return res.data;
};

// GET CART
export const getCart = async (shop_id) => {
  const res = await API.get("/api/customer/cart", {
    params: { shop_id },
  });

  return res.data;
};
