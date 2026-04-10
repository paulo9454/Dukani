export default function Navbar({ search, onSearch, onCartClick, onAuthClick }) {
  return (
    <nav className="sticky top-0 z-50 bg-white border-b py-4 px-4 md:px-10">
      <div className="max-w-7xl mx-auto flex items-center gap-4 justify-between">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="Dukani logo" className="h-8 w-8" />
          <h1 className="text-2xl font-bold text-indigo-600">Dukani</h1>
        </div>

        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search products"
          className="w-full max-w-md px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
        />

        <div className="flex items-center gap-2">
          <button onClick={onCartClick} className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-all duration-200 ease-in-out">🛒</button>
          <button onClick={onAuthClick} className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-all duration-200 ease-in-out">Login</button>
        </div>
      </div>
    </nav>
  )
}
