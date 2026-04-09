import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../store/useCart'
import CartSummary from '../components/CartSummary'
import { api } from '../api/client'

export default function CartPage() {
  const { items, load, add, remove, loading, error } = useCart()
  const [products, setProducts] = useState([])

  useEffect(() => { load() }, [load])
  useEffect(() => { api('/api/public/products').then(setProducts).catch(() => {}) }, [])

  const enriched = useMemo(() => {
    return items.map((i) => {
      const product = products.find((p) => p._id === i.product_id) || {}
      return { ...i, name: product.name || i.product_id, price: product.price || 0 }
    })
  }, [items, products])

  const subtotal = enriched.reduce((sum, i) => sum + i.price * i.qty, 0)

  if (loading) return <p>Loading cart...</p>
  if (error) return <p>Error: {error}</p>

  return (
    <section className="stack-md">
      <h2>Your Cart</h2>
      <CartSummary items={items} />

      {enriched.length === 0 && <p>Your cart is empty.</p>}
      {enriched.map((i) => (
        <div key={i.product_id} className="row card-row">
          <strong>{i.name}</strong>
          <span>${i.price}</span>
          <input type="number" min="1" value={i.qty} onChange={(e) => add(i.product_id, Number(e.target.value) || 1)} />
          <span>${(i.price * i.qty).toFixed(2)}</span>
          <button onClick={() => remove(i.product_id)}>Remove</button>
        </div>
      ))}

      <div className="summary">
        <p>Subtotal: ${subtotal.toFixed(2)}</p>
        <p>Total: ${subtotal.toFixed(2)}</p>
      </div>
      <Link to="/checkout"><button disabled={enriched.length === 0}>Proceed to Checkout</button></Link>
    </section>
  )
}
