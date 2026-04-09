import { useEffect, useState } from 'react'
import { api } from '../api/client'

export default function useHomeData() {
  const [data, setData] = useState({ hero: '', featured: [], categories: [], products: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true
    Promise.all([
      api('/api/public/home'),
      api('/api/public/categories'),
      api('/api/public/products')
    ])
      .then(([home, categories, products]) => mounted && setData({ ...home, categories, products }))
      .catch((e) => mounted && setError(e.message))
      .finally(() => mounted && setLoading(false))
    return () => { mounted = false }
  }, [])

  return { data, loading, error }
}
