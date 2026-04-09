export default function CartSummary({ items }) {
  const totalQty = items.reduce((sum, x) => sum + x.qty, 0)
  return <aside className="summary">Items in cart: {totalQty}</aside>
}
