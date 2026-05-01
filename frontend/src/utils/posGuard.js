export function canAccessPOS(user, shopId) {
  if (!user || !user.role) return false;

  // owners can access any shop POS
  if (user.role === "owner") return !!shopId;

  // shopkeepers only their assigned shops
  if (user.role === "shopkeeper") {
    const assigned = user.assigned_shop_ids || [];
    return shopId && assigned.includes(shopId);
  }

  return false;
}
