import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../auth/useAuth'

export default function ShopDashboard() {
  const [data, setData] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [damaged, setDamaged] = useState([])
  const [creditors, setCreditors] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [supplierName, setSupplierName] = useState('')
  const [error, setError] = useState(null)
  const { user } = useAuth()

  useEffect(() => {
    api('/api/dashboard/vendor').then(setData).catch((e) => setError(e.message))
    api('/api/notifications/stock').then(setAlerts).catch(() => {})
    api('/api/damaged-stock').then(setDamaged).catch(() => {})
    api('/api/credit-customers').then(setCreditors).catch(() => {})
    if (user?.role === 'owner') {
      api('/api/suppliers').then(setSuppliers).catch(() => {})
    }
  }, [user?.role])

  const salesOverview = useMemo(() => {
    const revenue = data?.revenue || 0
    return {
      today: revenue,
      week: revenue * 3,
      month: revenue * 10
    }
  }, [data])

  const addSupplier = async () => {
    if (!supplierName.trim()) return
    const created = await api('/api/suppliers', { method: 'POST', body: JSON.stringify({ name: supplierName }) })
    setSuppliers((prev) => [...prev, created])
    setSupplierName('')
  }

  if (error) return <p>Error: {error}</p>
  if (!data) return <p>Loading...</p>

  return (
    <section className="stack-md">
      <h2>Shop Dashboard</h2>

      <div className="split">
        <article className="card">
          <h3>Sales Overview</h3>
          <p>Today: ${salesOverview.today.toFixed(2)}</p>
          <p>Week: ${salesOverview.week.toFixed(2)}</p>
          <p>Month: ${salesOverview.month.toFixed(2)}</p>
          <div className="chart-placeholder">[Chart placeholder - reuse chart library if added]</div>
        </article>

        <article className="card">
          <h3>Inventory Status</h3>
          <p>Shops managed: {data.shops_count}</p>
          <p>Orders: {data.orders_count}</p>
          <p>Damaged items: {data.total_damaged_items}</p>
          <p>Loss value: ${data.loss_value}</p>
        </article>
      </div>

      <div className="split">
        <article className="card">
          <h3>Low Stock Alerts</h3>
          {alerts.length === 0 && <p>No alerts currently.</p>}
          {alerts.map((a, idx) => <p key={idx}>• {a.message}</p>)}
        </article>

        <article className="card">
          <h3>Creditors</h3>
          {creditors.length === 0 && <p>No creditors.</p>}
          {creditors.map((c) => <p key={c._id}>• {c.customer_id} — ${c.balance}</p>)}
        </article>
      </div>

      <div className="split">
        <article className="card">
          <h3>Damaged Products Log</h3>
          {damaged.length === 0 && <p>No damaged items logged.</p>}
          {damaged.map((d) => <p key={d._id}>• {d.product_id} x{d.qty} (${d.loss_value})</p>)}
        </article>

        <article className="card">
          <h3>Product Performance</h3>
          <p>Revenue: ${data.revenue}</p>
          <p>Orders: {data.orders_count}</p>
        </article>
      </div>

      {user?.role === 'owner' && (
        <article className="card">
          <h3>Suppliers Management</h3>
          <div className="row">
            <input placeholder="Supplier name" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
            <button onClick={addSupplier}>Add Supplier</button>
          </div>
          {suppliers.map((s) => (
            <div key={s._id} className="row">
              <strong>{s.name}</strong>
              <span>{(s.product_ids || []).length} linked products</span>
            </div>
          ))}

          <h4>Subscription Plans (Owner only)</h4>
          <p>POS only: 500</p>
          <p>POS + Online Store: 1000</p>
        </article>
      )}
    </section>
  )
}
