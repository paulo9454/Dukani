// Canonical Dukayko product categories (Kenya retail) — used in ProductModal,
// inventory filters and customer marketplace drilldown.
const DEFAULT_CATEGORIES = [
  { value: "groceries", label: "🥦 Groceries" },
  { value: "cereals", label: "🌾 Cereals & Grains" },
  { value: "bakery_snacks", label: "🍞 Bakery & Snacks" },
  { value: "beverages", label: "🥤 Beverages" },
  { value: "dairy_eggs", label: "🥛 Dairy & Eggs" },
  { value: "meat_fish", label: "🥩 Meat & Fish" },
  { value: "fruits_vegetables", label: "🍅 Fruits & Vegetables" },
  { value: "baby_care", label: "🍼 Baby Care" },
  { value: "personal_care", label: "🧴 Personal Care" },
  { value: "household", label: "🧹 Household & Cleaning" },
  { value: "stationery", label: "✏️ Stationery" },
  { value: "electronics", label: "🔌 Electronics & Accessories" },
  { value: "mobile_airtime", label: "📱 Mobile & Airtime" },
  { value: "alcohol", label: "🍺 Alcohol & Spirits" },
  { value: "tobacco", label: "🚬 Tobacco" },
  { value: "clothing", label: "👕 Clothing & Fashion" },
  { value: "hardware", label: "🔧 Hardware & Tools" },
  { value: "pharmacy", label: "💊 Pharmacy & Health" },
  { value: "pet_supplies", label: "🐾 Pet Supplies" },
  { value: "other", label: "📦 Other" },
];

export default DEFAULT_CATEGORIES;

export const categoryLabel = (value) => {
  const hit = DEFAULT_CATEGORIES.find((c) => c.value === value);
  return hit ? hit.label : value || "";
};
