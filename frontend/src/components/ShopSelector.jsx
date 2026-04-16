import { useEffect, useState } from "react";
import { getShops, createShop } from "../api/shops";

function ShopSelector({ onSelect }) {
  const [shops, setShops] = useState([]);
  const [selected, setSelected] = useState("");
  const [newShopName, setNewShopName] = useState("");

  const loadShops = async () => {
    try {
      const res = await getShops();

      const shopList = res.shops || [];

      setShops(shopList);

      if (shopList.length > 0) {
        const saved = localStorage.getItem("active_shop");
        const shopId = saved || shopList[0]._id;

        setSelected(shopId);
        localStorage.setItem("active_shop", shopId);
        onSelect(shopId);
      }
    } catch (err) {
      console.error("Failed to load shops:", err);
    }
  };

  useEffect(() => {
    loadShops();
  }, []);

  const handleChange = (e) => {
    const shopId = e.target.value;

    setSelected(shopId);
    localStorage.setItem("active_shop", shopId);
    onSelect(shopId);
  };

  const handleCreateShop = async () => {
    if (!newShopName) return alert("Enter shop name");

    try {
      await createShop(newShopName);
      setNewShopName("");
      loadShops();
    } catch (err) {
      console.error(err);
      alert("Failed to create shop");
    }
  };

  return (
    <div>
      <h3>🏪 Shops</h3>

      <select value={selected} onChange={handleChange}>
        <option value="">Select shop</option>
        {shops.map((s) => (
          <option key={s._id} value={s._id}>
            {s.name}
          </option>
        ))}
      </select>

      <div>
        <input
          value={newShopName}
          onChange={(e) => setNewShopName(e.target.value)}
          placeholder="New shop"
        />
        <button onClick={handleCreateShop}>Create</button>
      </div>
    </div>
  );
}

export default ShopSelector;
