export default function ConfirmModal({ open, onConfirm, onCancel, message }) {
  if (!open) return null
  return (
    <div className="modal">
      <p>{message}</p>
      <button onClick={onConfirm}>Confirm</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  )
}
