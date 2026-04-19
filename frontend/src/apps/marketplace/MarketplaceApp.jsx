import { useState } from "react";
import CategoriesPage from "./pages/CategoriesPage";
import ShopsPage from "./pages/ShopsPage";
import ProductsPage from "./pages/ProductsPage";

export default function MarketplaceApp() {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedShop, setSelectedShop] = useState(null);

  return (
    <div style={{ padding: 20 }}>
      <h2>Marketplace</h2>

      {!selectedCategory && (
        <CategoriesPage onSelect={setSelectedCategory} />
      )}

      {selectedCategory && !selectedShop && (
        <ShopsPage
          category={selectedCategory}
          onBack={() => setSelectedCategory(null)}
          onSelectShop={setSelectedShop}
        />
      )}

      {selectedShop && (
        <ProductsPage
          shop={selectedShop}
          onBack={() => setSelectedShop(null)}
        />
      )}
    </div>
  );
}
