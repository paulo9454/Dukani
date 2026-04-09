export default function ProductCard({ product, onAdd }) {
  return (
    <article className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition-all duration-200 ease-in-out overflow-hidden hover:-translate-y-1">
      <div className="w-full h-48 object-cover bg-gray-100" />
      <div className="p-4">
        <h4 className="font-semibold text-gray-800">{product.name}</h4>
        <p className="text-sm text-gray-500">Stock: {product.stock}</p>
        <p className="text-indigo-600 font-bold mt-1">${Number(product.price || 0).toFixed(2)}</p>
        <button onClick={() => onAdd(product._id)} className="mt-3 w-full bg-indigo-600 text-white py-2 rounded-xl hover:bg-indigo-700 hover:scale-105 transition-all duration-200 ease-in-out">
          Add to Cart
        </button>
      </div>
    </article>
  )
}
