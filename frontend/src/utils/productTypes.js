/**
 * Helpers shared between PublicShopPage and POS for unit-based & variant
 * products. The single source of truth lives in the product document
 * itself (`product_type`, `selling_units`, `variants`, `base_unit`,
 * `base_stock_quantity`).
 */

export function isUnitBased(p) {
  return p && p.product_type === "unit_based" && Array.isArray(p.selling_units) && p.selling_units.length > 0;
}

export function isVariant(p) {
  return p && p.product_type === "variant" && Array.isArray(p.variants) && p.variants.length > 0;
}

/**
 * Format a base-unit stock total for display.
 * "g"/"kg" → kg with 2 decimals (49750g → 49.75 kg)
 * "ml"/"litre" → L with 2 decimals (20000ml → 20.00 L)
 */
export function formatBaseStock(quantity, baseUnit) {
  const n = Number(quantity || 0);
  if (baseUnit === "kg" || baseUnit === "g") {
    return `${(n / 1000).toFixed(2)} kg`;
  }
  if (baseUnit === "litre" || baseUnit === "l" || baseUnit === "ml") {
    return `${(n / 1000).toFixed(2)} L`;
  }
  return `${n}`;
}

/**
 * Resolve the *effective* price + stock summary for a product based on
 * the chosen unit/variant. Returns { price, stockLabel, available }.
 */
export function resolveProductDisplay(product, choice = {}) {
  if (isUnitBased(product)) {
    const unit =
      product.selling_units.find((u) => u.label === choice.unit_label) ||
      product.selling_units[0];
    const remaining = formatBaseStock(product.base_stock_quantity, product.base_unit);
    return {
      price: Number(unit?.price || 0),
      stockLabel: `${remaining} left`,
      available: Number(product.base_stock_quantity || 0) >= Number(unit?.quantity || 0),
      unit,
    };
  }
  if (isVariant(product)) {
    const variant =
      product.variants.find((v) => v.name === choice.variant_name) ||
      product.variants[0];
    return {
      price: Number(variant?.price || product.price || 0),
      stockLabel: `${variant?.stock ?? 0} in stock`,
      available: Number(variant?.stock || 0) > 0,
      variant,
    };
  }
  return {
    price: Number(product.price || 0),
    stockLabel: `${product.stock ?? 0} in stock`,
    available: Number(product.stock || 0) > 0,
  };
}
