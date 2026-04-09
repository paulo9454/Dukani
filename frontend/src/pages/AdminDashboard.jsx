import { useEffect, useState } from 'react'
import { api } from '../api/client'

export default function AdminDashboard() {
  const [summary, setSummary] = useState(null)
  const [shops, setShops] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    api('/api/dashboard/admin').then(setSummary).catch((e) => setError(e.message))
    api('/api/marketplace/vendors').then(setShops).catch(() => {})
  }, [])

  if (error) return <p>Error: {error}</p>
  if (!summary) return <p>Loading...</p>

  return (
    <section className="stack-md">
      <h2>Admin Dashboard</h2>
      <div className="split">
        <article className="card">
          <h3>Platform Analytics</h3>
          <p>Users: {summary.users}</p>
          <p>Shops: {summary.shops}</p>
          <p>Orders: {summary.orders}</p>
          <p>Payments: {summary.payments}</p>
        </article>
        <article className="card">
          <h3>Subscriptions Monitor</h3>
          <p>Monitor each shop plan and usage from vendor records.</p>
          {shops.map((s) => (
            <p key={s._id}>• {s.name} — plan: {s.subscription_plan || 'legacy'}</p>
          ))}
        </article>
      </div>

      <article className="card">
        <h3>Manage users / owners / shopkeepers</h3>
        <p>Connect this panel to user management APIs when exposed by backend.</p>
      </article>
    </section>
  )
}
