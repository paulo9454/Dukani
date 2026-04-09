export default function ProductCard({ product, onSelect }) {
  return (
    <article
      className="bg-gray-800 rounded-2xl shadow-sm hover:shadow-lg transition-all duration-200 cursor-pointer p-4 flex flex-col items-center hover:scale-105"
      onClick={() => onSelect(product)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(product)}
    >
      <div className="w-full h-32 object-cover rounded-xl mb-2 bg-gray-700" />
      <h4 className="font-semibold text-gray-100 text-center">{product.name}</h4>
      <p className="text-emerald-400 font-bold mt-1">${Number(product.price || 0).toFixed(2)}</p>
      <span className="text-sm bg-gray-700 px-2 py-1 rounded-full mt-1 text-gray-300">Stock {product.stock}</span>
      <button className="mt-3 min-h-10 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-all">Add</button>
    </article>
  )
}
