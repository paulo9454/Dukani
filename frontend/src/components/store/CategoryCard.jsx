export default function CategoryCard({ category, selected, onClick }) {
  return (
    <button
      onClick={() => onClick(category._id)}
      className={`bg-white rounded-2xl shadow-sm p-6 text-center hover:shadow-lg cursor-pointer hover:-translate-y-1 transition-all duration-200 ease-in-out ${selected ? 'ring-2 ring-indigo-500' : ''}`}
    >
      <div className="text-3xl mb-2">🛍️</div>
      <p className="font-medium text-gray-700">{category.name}</p>
    </button>
  )
}
