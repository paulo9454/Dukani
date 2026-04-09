import { create } from 'zustand'
import { api } from '../api/client'

export const useCheckout = create((set) => ({
  loading: false,
  error: null,
  order: null,
  checkout: async ({ provider = 'Stripe', paymentMethod = 'card', customerDetails = null, paymentMeta = null } = {}) => {
    set({ loading: true, error: null })
    try {
      const order = await api('/api/customer/checkout', {
        method: 'POST',
        body: JSON.stringify({
          payment_provider: provider,
          payment_method: paymentMethod,
          payment_meta: paymentMeta,
          customer_details: customerDetails,
          idempotency_key: crypto.randomUUID()
        })
      })
      set({ order, loading: false })
      return order
    } catch (e) {
      set({ loading: false, error: e.message })
      throw e
    }
  }
}))
