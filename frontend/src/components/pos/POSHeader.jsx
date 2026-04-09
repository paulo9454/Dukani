export default function POSHeader({ search, setSearch, category, setCategory, categories }) {
  return (
    <div className="bg-gray-800 rounded-2xl p-4 shadow-sm">
      <h2 className="text-xl font-bold text-gray-100 mb-3">POS Filters</h2>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search products"
        className="w-full px-3 py-2 rounded-xl bg-gray-700 text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 outline-none mb-4"
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="w-full px-3 py-2 rounded-xl bg-gray-700 text-gray-100 mb-2"
      >
        <option value="all">All categories</option>
        {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
      </select>
      <p className="text-sm text-gray-400">Tip: Tap product cards to add quickly.</p>
    </div>
  )
}
