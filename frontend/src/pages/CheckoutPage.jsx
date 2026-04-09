import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCheckout } from '../store/useCheckout'
import { useCart } from '../store/useCart'
import { api } from '../api/client'

export default function CheckoutPage() {
  const navigate = useNavigate()
  const { checkout, loading, error } = useCheckout()
  const { items, load } = useCart()
  const [products, setProducts] = useState([])
  const [form, setForm] = useState({ full_name: '', phone: '', address: '' })
  const [paymentMethod, setPaymentMethod] = useState('cash')

  useEffect(() => { load() }, [load])
  useEffect(() => { api('/api/public/products').then(setProducts).catch(() => {}) }, [])

  const enriched = useMemo(() => items.map((i) => {
    const product = products.find((p) => p._id === i.product_id) || {}
    return { ...i, name: product.name || i.product_id, price: product.price || 0, stock: product.stock || 0 }
  }), [items, products])

  const total = enriched.reduce((sum, i) => sum + i.price * i.qty, 0)
  const stockInvalid = enriched.some((i) => i.qty > i.stock)

  const submit = async () => {
    if (enriched.length === 0 || stockInvalid) return
    const provider = paymentMethod === 'mpesa' ? 'M-Pesa' : (paymentMethod === 'credit' ? 'Ledger' : 'Stripe')
    const paymentMeta = paymentMethod === 'mpesa' ? { transaction_id: 'SIM-TX-123', phone_number: form.phone, amount: total } : null
    const order = await checkout({ provider, paymentMethod, customerDetails: form, paymentMeta })
    navigate('/order-success', { state: { order } })
  }

  return (
    <section className="stack-md">
      <h2>Checkout</h2>
      {enriched.length === 0 && <p>Your cart is empty. Add items before checkout.</p>}
      {stockInvalid && <p className="danger">Stock is insufficient for one or more items.</p>}
      {error && <p className="danger">Error: {error}</p>}

      <div className="split">
        <div className="card">
          <h3>Customer Details</h3>
          <input placeholder="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <input placeholder="Phone number" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />

          <h3>Payment Method</h3>
          <div className="row">
            {['cash', 'credit', 'mpesa'].map((m) => (
              <button key={m} className={paymentMethod === m ? 'active' : ''} onClick={() => setPaymentMethod(m)}>{m.toUpperCase()}</button>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Order Summary</h3>
          {enriched.map((i) => (
            <div key={i.product_id} className="row">
              <span>{i.name} x{i.qty}</span>
              <span>${(i.price * i.qty).toFixed(2)}</span>
            </div>
          ))}
          <hr />
          <div className="row"><strong>Total</strong><strong>${total.toFixed(2)}</strong></div>
          <button disabled={loading || enriched.length === 0 || stockInvalid} onClick={submit}>
            {loading ? 'Processing...' : 'Confirm Order'}
          </button>
        </div>
      </div>
    </section>
  )
}
