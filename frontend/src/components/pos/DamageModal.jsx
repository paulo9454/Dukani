export default function DamageModal({ open, products, form, setForm, onClose, onSubmit, loading }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md text-gray-100">
        <h3 className="text-xl font-bold mb-4">Mark as Damaged</h3>
        <select className="w-full px-3 py-2 rounded-xl bg-gray-700 text-gray-100 mb-3" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
          <option value="">Select product</option>
          {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
        </select>
        <input className="w-full px-3 py-2 rounded-xl bg-gray-700 text-gray-100 mb-3" type="number" min="1" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} placeholder="Quantity" />
        <textarea className="w-full px-3 py-2 rounded-xl bg-gray-700 text-gray-100 mb-3" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Reason" />
        <div className="flex gap-2">
          <button className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-xl w-full transition-all" onClick={onClose}>Cancel</button>
          <button className="bg-emerald-500 hover:bg-emerald-600 text-gray-900 px-4 py-2 rounded-xl w-full font-bold transition-all" disabled={loading} onClick={onSubmit}>{loading ? 'Saving...' : 'Submit'}</button>
        </div>
      </div>
    </div>
  )
}
