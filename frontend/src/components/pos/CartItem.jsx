export default function CartItem({ item, onInc, onDec, onRemove }) {
  return (
    <div className="flex justify-between items-center mb-3 gap-2">
      <div>
        <p className="text-gray-100 font-medium">{item.name}</p>
        <p className="text-emerald-400 font-bold">${(item.price * item.qty).toFixed(2)}</p>
      </div>
      <div className="flex items-center gap-2">
        <button className="bg-gray-700 px-2 py-1 rounded hover:bg-gray-600" onClick={() => onDec(item._id)}>-</button>
        <span className="text-gray-100">{item.qty}</span>
        <button className="bg-gray-700 px-2 py-1 rounded hover:bg-gray-600" onClick={() => onInc(item._id)}>+</button>
        <button className="bg-gray-700 px-2 py-1 rounded hover:bg-gray-600" onClick={() => onRemove(item._id)}>x</button>
      </div>
    </div>
  )
}
