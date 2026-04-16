import { useEffect, useState } from "react";
import API from "../../api/client";
import ShopSelector from "../../components/ShopSelector";
import POS from "../../pages/POS";

function OwnerApp() {
  const [sales, setSales] = useState({ revenue: 0, orders: 0, sales: [] });
  const [activeShop, setActiveShop] = useState("");
  const [view, setView] = useState("sales");

  useEffect(() => {
    API.get("/api/owner/sales").then((res) => setSales(res.data));
  }, []);

  return (
    <div>
      <h2>Owner Dashboard</h2>
      <ShopSelector onSelect={setActiveShop} />
      <button onClick={() => setView("sales")}>Sales</button>{" "}
      <button onClick={() => setView("pos")}>POS Access</button>
      {view === "sales" ? (
        <div>
          <p>Total Orders: {sales.orders}</p>
          <p>Revenue: KES {sales.revenue}</p>
        </div>
      ) : (
        <POS shopId={activeShop} />
      )}
    </div>
  );
}

export default OwnerApp;
