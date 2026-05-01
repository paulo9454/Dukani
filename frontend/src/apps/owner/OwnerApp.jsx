import { useEffect, useState } from "react";
import API from "../../api/client";
import ShopSelector from "../../components/ShopSelector";
import AssignShopkeepers from "./components/AssignShopkeepers";
import { getOwnerShops } from "../../api/shops";

function OwnerApp() {
  const [sales, setSales] = useState({ revenue: 0, orders: 0 });
  const [shops, setShops] = useState([]);
  const [view, setView] = useState("sales");

  useEffect(() => {
    const load = async () => {
      const data = await getOwnerShops();
      setShops(data || []);
    };
    load();
  }, []);

  useEffect(() => {
    API.get("/api/dashboard/vendor/daily-sales")
      .then((res) => setSales(res.data || { revenue: 0, orders: 0 }))
      .catch(() => {});
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2>🏪 Owner Dashboard</h2>

      <ShopSelector />

      <button onClick={() => setView("sales")}>📊 Sales</button>
      <button onClick={() => setView("shops")}>🏬 Shops</button>

      {view === "sales" && (
        <div>
          <p>Orders: {sales.orders}</p>
          <p>Revenue: KES {sales.revenue}</p>
        </div>
      )}

      {view === "shops" && (
        <div>
          <AssignShopkeepers />

          {shops.map((s) => (
            <div key={s._id}>
              <b>{s.name}</b>
              <p>{s.subscription_plan}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default OwnerApp;
