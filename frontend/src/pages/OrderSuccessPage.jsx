import { useLocation } from 'react-router-dom'

export default function OrderSuccessPage() {
  const { state } = useLocation()
  const order = state?.order
  if (!order) return <p>No order context available.</p>
  return (
    <section>
      <h2>Order Success</h2>
      <p>Order ID: {order._id}</p>
      <p>Total: ${order.total}</p>
      <p>Status: {order.status}</p>
    </section>
  )
}
