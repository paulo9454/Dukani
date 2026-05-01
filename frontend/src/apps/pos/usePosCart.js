import { useState, useMemo } from "react";

export default function usePosCart() {
  const [cart, setCart] = useState([]);
  const [pricingMode, setPricingMode] = useState("retail");

  const addToCart = (product, qty = 1) => {
    setCart((prev) => {
      const existing = prev.find((p) => p._id === product._id);

      const price =
        pricingMode === "wholesale"
          ? product.wholesale_price || product.price
          : product.price;

      if (existing) {
        return prev.map((p) =>
          p._id === product._id
            ? { ...p, qty: p.qty + qty, subtotal: price * (p.qty + qty) }
            : p
        );
      }

      return [
        ...prev,
        {
          _id: product._id,
          name: product.name,
          price,
          buying_price: product.buying_price,
          qty,
          subtotal: price * qty,
        },
      ];
    });
  };

  const updateQty = (id, qty) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((p) => p._id !== id));
      return;
    }

    setCart((prev) =>
      prev.map((p) =>
        p._id === id
          ? { ...p, qty, subtotal: p.price * qty }
          : p
      )
    );
  };

  const clearCart = () => setCart([]);

  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, i) => s + i.subtotal, 0);
    return { subtotal, total: subtotal };
  }, [cart]);

  return {
    cart,
    addToCart,
    updateQty,
    clearCart,
    totals,
    pricingMode,
    setPricingMode,
  };
}
