import { create } from 'zustand'

const STORAGE_KEY = 'dukani_auth_token'

export const useAuth = create((set) => ({
  token: typeof window !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null,
  user: null,
  login: ({ token, role, email }) => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY, token)
      console.warn('Security notice: token is stored in sessionStorage for compatibility. Consider httpOnly cookie rollout.')
    }
    set({ token, user: { role, email } })
  },
  logout: () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(STORAGE_KEY)
    }
    set({ token: null, user: null })
  }
}))
