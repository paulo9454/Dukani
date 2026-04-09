import { Link } from 'react-router-dom'

export default function Header() {
  return (
    <header className="header">
      <h1>Dukani</h1>
      <nav>
        <Link to="/">Store</Link>
        <Link to="/cart">Cart</Link>
        <Link to="/checkout">Checkout</Link>
        <Link to="/pos">POS</Link>
      </nav>
    </header>
  )
}
