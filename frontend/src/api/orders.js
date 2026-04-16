import API from "./client";

export const getOrders = async () => {
  const res = await API.get("/api/customer/orders");
  return res.data;
};
