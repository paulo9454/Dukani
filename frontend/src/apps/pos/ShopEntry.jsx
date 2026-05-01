import { useEffect, useState } from "react";
import API from "../../api/client";

function ShopEntry({ onEnter }) {
  const [shops, setShops] = useState([]);
  const [user, setUser] = useState(null);

  // load user
  useEffect(() => {
    setUser(JSON.parse(localStorage.getItem("user")));
  }, []);

  // load assigned shops
  useEffect(() => {
    const load = async () => {
      try {
        const res = await API.get("/api/owner/shops");
        const all = res.data || [];

        const assigned = all.filter((s) =>
          user?.assigned_shop_ids?.includes(s._id)
        );

        setShops(assigned);
      } catch (err) {
        console.error(err);
      }
    };

    if (user) load();
  }, [user]);

  return (
    <div style={{ padding: 20 }}>
      <h2>🏪 Select Shop</h2>

      {!user && <p>Loading user...</p>}

      {user?.role !== "shopkeeper" && (
        <p>Only shopkeepers use this screen</p>
      )}

      {shops.length === 0 ? (
        <p>No assigned shops</p>
      ) : (
        shops.map((shop) => (
          <div
            key={shop._id}
            style={{
              border: "1px solid #ddd",
              padding: 15,
              marginBottom: 10,
              borderRadius: 8,
              cursor: "pointer",
            }}
            onClick={() => onEnter(shop)}
          >
            <h3>🏪 {shop.name}</h3>
            <p>Plan: {shop.subscription_plan}</p>
          </div>
        ))
      )}
    </div>
  );
}

export default ShopEntry;
