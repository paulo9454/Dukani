import { useMemo } from 'react'

export default function PaymentPanel({
  method,
  setMethod,
  paymentData,
  setPaymentData,
  total,
  onPaystackPayment,
  paystackLoading
}) {
  const change = useMemo(() => {
    if (method !== 'cash') return 0
    return Math.max((Number(paymentData.cashReceived) || 0) - total, 0)
  }, [method, paymentData.cashReceived, total])

  return (
    <section>
      <h4 className="text-xl font-bold mb-4 text-gray-100">Payment</h4>
      <button
        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl w-full mb-2 transition-all hover:-translate-y-0.5 min-h-10"
        onClick={() => setMethod('cash')}
      >
        Pay with Cash
      </button>
      <button
        className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl w-full mb-2 transition-all hover:-translate-y-0.5 min-h-10"
        onClick={() => setMethod('paystack')}
      >
        Pay with Paystack
      </button>
      <button
        className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-xl w-full mb-2 transition-all hover:-translate-y-0.5 min-h-10"
        onClick={() => setMethod('credit')}
      >
        Pay with Credit
      </button>

      {method === 'cash' && (
        <div className="mt-3">
          <input
            className="w-full px-3 py-2 rounded-xl bg-gray-700 text-gray-100 mb-2"
            placeholder="Amount received"
            type="number"
            value={paymentData.cashReceived}
            onChange={(e) => setPaymentData({ ...paymentData, cashReceived: e.target.value })}
          />
          <p className="text-gray-100">Change: ${change.toFixed(2)}</p>
        </div>
      )}

      {method === 'paystack' && (
        <div className="mt-3 space-y-2">
          <input
            className="w-full px-3 py-2 rounded-xl bg-gray-700 text-gray-100"
            placeholder="Customer email"
            type="email"
            value={paymentData.paystackEmail}
            onChange={(e) => setPaymentData({ ...paymentData, paystackEmail: e.target.value, paystackVerified: false })}
          />
          <button
            className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl w-full transition-all hover:-translate-y-0.5 min-h-10"
            onClick={onPaystackPayment}
            disabled={paystackLoading || !paymentData.paystackEmail}
          >
            {paystackLoading ? 'Opening Paystack...' : 'Launch Paystack Checkout'}
          </button>
          {paymentData.paystackVerified && (
            <p className="text-emerald-400 text-sm">Paystack payment verified.</p>
          )}
        </div>
      )}

      {method === 'credit' && (
        <div className="mt-3 space-y-2">
          <input
            className="w-full px-3 py-2 rounded-xl bg-gray-700 text-gray-100"
            placeholder="Customer name"
            value={paymentData.creditName}
            onChange={(e) => setPaymentData({ ...paymentData, creditName: e.target.value })}
          />
          <input
            className="w-full px-3 py-2 rounded-xl bg-gray-700 text-gray-100"
            placeholder="Customer phone"
            value={paymentData.creditPhone}
            onChange={(e) => setPaymentData({ ...paymentData, creditPhone: e.target.value })}
          />
        </div>
      )}
    </section>
  )
}
