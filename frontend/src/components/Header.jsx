import { Link } from 'react-router-dom'

export default function Header() {
  return (
    <header className="header">
      <div className="brand">
        <img src="/logo.svg" alt="Dukani logo" className="brand-logo" />
        <h1>Dukani</h1>
      </div>
      <nav>
        <Link to="/">Store</Link>
        <Link to="/cart">Cart</Link>
        <Link to="/checkout">Checkout</Link>
        <Link to="/pos">POS</Link>
      </nav>
    </header>
  )
}
