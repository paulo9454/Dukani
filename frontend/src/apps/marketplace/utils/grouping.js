export function groupProductsByShop(products) {
  const grouped = {};

  products.forEach((p) => {
    const shopId = p.shop_id;

    if (!grouped[shopId]) {
      grouped[shopId] = {
        shop_id: shopId,
        shop_name: p.shop_name || "Unknown Shop",
        products: [],
      };
    }

    grouped[shopId].products.push(p);
  });

  return Object.values(grouped);
}
