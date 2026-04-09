import { Routes, Route, Navigate } from 'react-router-dom'
import HomePage from './pages/HomePage'
import CartPage from './pages/CartPage'
import CheckoutPage from './pages/CheckoutPage'
import OrderSuccessPage from './pages/OrderSuccessPage'
import ShopDashboard from './pages/ShopDashboard'
import AdminDashboard from './pages/AdminDashboard'
import POSDashboardPage from './pages/POSDashboardPage'
import Header from './components/Header'
import Footer from './components/Footer'
import { useAuth } from './auth/useAuth'

function Guard({ children, roles }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <>
      <Header />
      <main className="container">
        <Routes>
          {/* Online store experience */}
          <Route path="/" element={<HomePage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/order-success" element={<OrderSuccessPage />} />

          {/* POS experience */}
          <Route path="/pos" element={<Guard roles={['owner','shopkeeper']}><POSDashboardPage /></Guard>} />

          <Route path="/dashboard/shop" element={<Guard roles={['owner','shopkeeper','partner']}><ShopDashboard /></Guard>} />
          <Route path="/dashboard/admin" element={<Guard roles={['owner','admin','partner']}><AdminDashboard /></Guard>} />
        </Routes>
      </main>
      <Footer />
    </>
  )
}
