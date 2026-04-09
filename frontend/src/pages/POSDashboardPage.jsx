import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { useCheckout } from '../store/useCheckout'
import { useCart } from '../store/useCart'
import ProductCard from '../components/pos/ProductCard'
import CartItem from '../components/pos/CartItem'
import PaymentPanel from '../components/pos/PaymentPanel'
import DamageModal from '../components/pos/DamageModal'
import POSHeader from '../components/pos/POSHeader'

function ToastList({ toasts }) {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <div key={toast.id} className="bg-gray-800 text-gray-100 border border-gray-700 rounded-xl px-4 py-3 shadow-lg">
          {toast.text}
        </div>
      ))}
    </div>
  )
}

export default function POSDashboardPage() {
  const { user } = useAuth()
  const checkoutState = useCheckout((s) => ({ loading: s.loading }))
  const cartState = useCart((s) => ({ items: s.items }))

  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [items, setItems] = useState([])
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paymentData, setPaymentData] = useState({
    cashReceived: '',
    paystackEmail: user?.email || '',
    paystackRef: '',
    paystackVerified: false,
    creditName: '',
    creditPhone: ''
  })
  const [taxPercent, setTaxPercent] = useState(0)
  const [loadingSale, setLoadingSale] = useState(false)
  const [paystackLoading, setPaystackLoading] = useState(false)
  const [damageOpen, setDamageOpen] = useState(false)
  const [damageForm, setDamageForm] = useState({ productId: '', qty: 1, reason: '' })
  const [damageLoading, setDamageLoading] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const [toasts, setToasts] = useState([])

  const pushToast = useCallback((text) => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev, { id, text }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, 2500)
  }, [])

  useEffect(() => {
    api('/api/products').then(setProducts).catch(() => setProducts([]))
    api('/api/products/categories/list').then(setCategories).catch(() => setCategories([]))
  }, [])

  useEffect(() => {
    if (user?.email) {
      setPaymentData((prev) => ({ ...prev, paystackEmail: prev.paystackEmail || user.email }))
    }
  }, [user?.email])

  const subtotal = useMemo(() => items.reduce((sum, i) => sum + Number(i.price || 0) * Number(i.qty || 0), 0), [items])
  const tax = useMemo(() => subtotal * (Number(taxPercent) / 100), [subtotal, taxPercent])
  const total = subtotal + tax

  const loadPaystackSdk = useCallback(async () => {
    if (window.PaystackPop) return window.PaystackPop

    await new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-paystack-sdk="true"]')
      if (existing) {
        existing.addEventListener('load', resolve, { once: true })
        existing.addEventListener('error', reject, { once: true })
        return
      }

      const script = document.createElement('script')
      script.src = 'https://js.paystack.co/v1/inline.js'
      script.async = true
      script.dataset.paystackSdk = 'true'
      script.onload = resolve
      script.onerror = reject
      document.body.appendChild(script)
    })

    return window.PaystackPop
  }, [])

  const handlePaystackPayment = useCallback(async () => {
    if (!paymentData.paystackEmail) {
      pushToast('Add customer email for Paystack checkout.')
      return
    }

    try {
      setPaystackLoading(true)
      const paystack = await loadPaystackSdk()
      if (!paystack) throw new Error('Paystack SDK unavailable')

      const reference = `dukani-pos-${Date.now()}-${Math.floor(Math.random() * 10000)}`
      const key = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY

      if (!key) {
        throw new Error('Missing VITE_PAYSTACK_PUBLIC_KEY')
      }

      paystack
        .newTransaction({
          key,
          email: paymentData.paystackEmail,
          amount: Math.round(total * 100),
          ref: reference,
          onSuccess: async (transaction) => {
            try {
              await api('/api/payments/paystack/verify', {
                method: 'POST',
                body: JSON.stringify({ reference: transaction.reference })
              })
              setPaymentMethod('paystack')
              setPaymentData((prev) => ({
                ...prev,
                paystackRef: transaction.reference,
                paystackVerified: true
              }))
              pushToast('Paystack payment verified.')
            } catch (err) {
              pushToast(`Payment verification failed: ${err.message}`)
            }
          },
          onCancel: () => pushToast('Paystack payment cancelled.'),
          onLoad: () => pushToast('Paystack checkout opened.')
        })
        .openIframe()
    } catch (e) {
      pushToast(e.message)
    } finally {
      setPaystackLoading(false)
    }
  }, [loadPaystackSdk, paymentData.paystackEmail, pushToast, total])

  const cancelSale = useCallback(() => {
    setItems([])
    setReceipt(null)
    setPaymentData((prev) => ({ ...prev, paystackVerified: false, paystackRef: '' }))
    pushToast('Sale cancelled.')
  }, [pushToast])

  const completeSale = useCallback(async () => {
    if (loadingSale || items.length === 0) return

    if (paymentMethod === 'paystack' && !paymentData.paystackVerified) {
      pushToast('Launch and verify Paystack payment before completing sale.')
      return
    }

    const shopId = items[0]?.shop_id
    if (!shopId) {
      pushToast('Cannot determine shop for this cart.')
      return
    }

    try {
      setLoadingSale(true)
      const payload = {
        shop_id: shopId,
        items: items.map((i) => ({ product_id: i._id, qty: i.qty })),
        payment_provider: paymentMethod === 'paystack' ? 'Paystack' : paymentMethod === 'credit' ? 'Ledger' : 'CashDesk',
        payment_method: paymentMethod,
        tax_percent: Number(taxPercent) || 0,
        discount: 0,
        payment_meta:
          paymentMethod === 'cash'
            ? { amount_received: Number(paymentData.cashReceived || 0) }
            : paymentMethod === 'paystack'
              ? {
                  paystack_reference: paymentData.paystackRef,
                  email: paymentData.paystackEmail,
                  amount: total
                }
              : {
                  customer_name: paymentData.creditName,
                  customer_phone: paymentData.creditPhone
                },
        idempotency_key: crypto.randomUUID()
      }

      const order = await api('/api/orders/checkout', { method: 'POST', body: JSON.stringify(payload) })
      setReceipt({ orderId: order?._id || 'N/A', total: order?.total || total, method: paymentMethod })
      setItems([])
      setPaymentData((prev) => ({ ...prev, paystackVerified: false, paystackRef: '' }))
      pushToast('Payment successful. Sale completed.')
    } catch (e) {
      pushToast(e.message)
    } finally {
      setLoadingSale(false)
    }
  }, [items, loadingSale, paymentMethod, paymentData, pushToast, taxPercent, total])

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName
      const typingTarget = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target?.isContentEditable

      if (e.key === 'Escape') {
        if (damageOpen) {
          setDamageOpen(false)
          return
        }
        cancelSale()
      }

      if (e.key === 'Enter' && !typingTarget && !damageOpen) {
        completeSale()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancelSale, completeSale, damageOpen])

  const visibleProducts = useMemo(() => {
    return products.filter((p) => {
      const text = (p?.name || '').toLowerCase()
      const textOk = text.includes(query.toLowerCase())
      const catOk = category === 'all' || p?.category_id === category
      return textOk && catOk
    })
  }, [products, query, category])

  const addProduct = (product) => {
    if (!product?._id) {
      pushToast('Product data is incomplete.')
      return
    }

    setItems((prev) => {
      const found = prev.find((x) => x._id === product._id)
      if (found) return prev.map((x) => (x._id === product._id ? { ...x, qty: x.qty + 1 } : x))
      return [...prev, { ...product, qty: 1 }]
    })
    pushToast(`${product?.name || 'Item'} added to cart.`)
  }

  const inc = (id) => setItems((prev) => prev.map((x) => (x._id === id ? { ...x, qty: x.qty + 1 } : x)))
  const dec = (id) => setItems((prev) => prev.map((x) => (x._id === id ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))
  const remove = (id) => setItems((prev) => prev.filter((x) => x._id !== id))

  const submitDamage = async () => {
    if (!damageForm.productId) {
      pushToast('Select a product to mark as damaged.')
      return
    }
    try {
      setDamageLoading(true)
      await api('/api/damaged-stock', {
        method: 'POST',
        body: JSON.stringify({
          product_id: damageForm.productId,
          qty: Number(damageForm.qty || 1),
          reason: damageForm.reason || 'POS damage log'
        })
      })
      setDamageOpen(false)
      setDamageForm({ productId: '', qty: 1, reason: '' })
      pushToast('Damage recorded successfully.')
    } catch (e) {
      pushToast(e.message)
    } finally {
      setDamageLoading(false)
    }
  }

  const printReceipt = () => {
    if (!receipt) {
      pushToast('No receipt to print yet.')
      return
    }
    pushToast(`Receipt #${receipt.orderId} ready.`)
  }

  if (user && !['owner', 'shopkeeper'].includes(user.role)) {
    return <Navigate to="/" replace />
  }

  return (
    <section className="h-screen bg-gray-900 text-gray-100 p-4 lg:p-6 overflow-hidden">
      <ToastList toasts={toasts} />

      <div className="h-full grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-6 bg-gray-900 rounded-2xl min-h-0 flex flex-col">
          <h2 className="text-2xl font-bold mb-1">POS Dashboard</h2>
          <p className="text-gray-400 text-sm mb-4">Fast checkout for cash, credit, and Paystack payments.</p>
          <div className="overflow-y-auto pr-1 min-h-0">
            <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 pb-6">
              {visibleProducts.map((product) => (
                <ProductCard key={product._id} product={product} onSelect={addProduct} />
              ))}
            </div>
            {visibleProducts.length === 0 && (
              <p className="text-gray-400 text-sm">No products match your current search/filter.</p>
            )}
          </div>
        </div>

        <div className="lg:col-span-3 min-h-0 space-y-4">
          <POSHeader
            search={query}
            setSearch={setQuery}
            category={category}
            setCategory={setCategory}
            categories={categories}
          />
          <div className="bg-gray-800 rounded-2xl p-4 shadow-sm">
            <h4 className="font-semibold text-gray-100">AI Stock Notifications (placeholder)</h4>
            <p className="text-sm text-gray-400 mt-1">Future alerts for low stock and demand trends will appear here.</p>
            <p className="text-xs text-gray-500 mt-2">Cart hook items cached: {cartState.items?.length || 0}</p>
          </div>
        </div>

        <aside className="lg:col-span-3 w-full md:w-1/3 lg:w-full sticky top-0 self-start bg-gray-800 rounded-2xl shadow-lg p-6 max-h-full overflow-y-auto">
          <h3 className="text-xl font-bold mb-4 text-gray-100">Cart</h3>
          {items.length === 0 && <p className="text-gray-400">No items selected.</p>}
          {items.map((item) => (
            <CartItem key={item._id} item={item} onInc={inc} onDec={dec} onRemove={remove} />
          ))}

          <div className="mt-4 border-t border-gray-700 pt-4 space-y-2">
            <div className="flex items-center justify-between text-gray-400">
              <span>Tax %</span>
              <input
                type="number"
                min="0"
                value={taxPercent}
                onChange={(e) => setTaxPercent(e.target.value)}
                className="w-20 px-2 py-1 rounded-lg bg-gray-700 text-gray-100"
              />
            </div>
            <p className="text-gray-100">Subtotal: ${subtotal.toFixed(2)}</p>
            <p className="text-gray-100">Tax: ${tax.toFixed(2)}</p>
            <p className="text-gray-100 font-semibold text-lg mt-4">Total: ${total.toFixed(2)}</p>
          </div>

          <div className="mt-5">
            <PaymentPanel
              method={paymentMethod}
              setMethod={setPaymentMethod}
              paymentData={paymentData}
              setPaymentData={setPaymentData}
              total={total}
              onPaystackPayment={handlePaystackPayment}
              paystackLoading={paystackLoading}
            />
          </div>

          <div className="mt-6 space-y-2">
            <button
              className="bg-emerald-500 hover:bg-emerald-600 hover:-translate-y-0.5 text-gray-900 px-4 py-3 rounded-xl w-full font-bold mt-4 transition-all min-h-10"
              disabled={loadingSale || checkoutState.loading || items.length === 0}
              onClick={completeSale}
            >
              {loadingSale ? 'Processing...' : 'Complete Sale'}
            </button>
            <button
              className="bg-red-600 hover:bg-red-700 hover:-translate-y-0.5 text-white px-4 py-2 rounded-xl w-full mt-2 transition-all min-h-10"
              onClick={cancelSale}
            >
              Cancel Sale
            </button>
            <button
              className="bg-gray-700 hover:bg-gray-600 hover:-translate-y-0.5 text-white px-4 py-2 rounded-xl w-full transition-all min-h-10"
              onClick={printReceipt}
            >
              Print Receipt
            </button>
            <button
              className="bg-gray-700 hover:bg-gray-600 hover:-translate-y-0.5 text-white px-4 py-2 rounded-xl w-full transition-all min-h-10"
              onClick={() => setDamageOpen(true)}
            >
              Mark as Damaged
            </button>
          </div>

          {receipt && (
            <p className="text-xs text-gray-400 mt-3">
              Last order: #{receipt.orderId} · {String(receipt.method || '').toUpperCase()} · ${Number(receipt.total || 0).toFixed(2)}
            </p>
          )}
        </aside>
      </div>

      <DamageModal
        open={damageOpen}
        products={products}
        form={damageForm}
        setForm={setDamageForm}
        onClose={() => setDamageOpen(false)}
        onSubmit={submitDamage}
        loading={damageLoading}
      />
    </section>
  )
}
