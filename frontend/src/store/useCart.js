import { create } from 'zustand'
import { api } from '../api/client'

export const useCart = create((set, get) => ({
  items: [],
  loading: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null })
    try {
      const data = await api('/api/customer/cart')
      set({ items: data.items || [], loading: false })
    } catch (e) {
      set({ loading: false, error: e.message })
    }
  },
  add: async (productId, qty = 1) => {
    await api('/api/customer/cart', { method: 'POST', body: JSON.stringify({ product_id: productId, qty }) })
    return get().load()
  },
  remove: async (productId) => {
    await api(`/api/customer/cart/${productId}`, { method: 'DELETE' })
    return get().load()
  }
}))
