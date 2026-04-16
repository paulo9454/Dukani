import API from "./client";

export const checkout = async () => {
  const res = await API.post("/api/customer/checkout", {
    payment_provider: "cash",
    payment_method: "cash",
    payment_meta: {},
  });

  return res.data;
};
