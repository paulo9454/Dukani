import { useEffect, useState } from "react";
import API from "../../../api/client";

function Shops() {
  const [shops, setShops] = useState([]);
  const [newShop, setNewShop] = useState({
    name: "",
    subscription_plan: "online",
  });

  const load = async () => {
    const res = await API.get("/api/owner/shops");
    setShops(res.data || []);
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    await API.post("/api/owner/shops", newShop);
    setNewShop({ name: "", subscription_plan: "online" });
    load();
  };

  return (
    <div>
      <h2>🏪 Shops</h2>

      <input
        value={newShop.name}
        onChange={(e) =>
          setNewShop({ ...newShop, name: e.target.value })
        }
        placeholder="Shop name"
      />

      <select
        value={newShop.subscription_plan}
        onChange={(e) =>
          setNewShop({ ...newShop, subscription_plan: e.target.value })
        }
      >
        <option value="online">Online</option>
        <option value="pos">POS</option>
        <option value="enterprise">Enterprise</option>
      </select>

      <button onClick={create}>Create</button>

      {shops.map((s) => (
        <div key={s._id}>
          {s.name} - {s.subscription_plan}
        </div>
      ))}
    </div>
  );
}

export default Shops;
