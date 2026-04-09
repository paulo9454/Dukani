import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useHomeData from '../hooks/useHomeData'
import { useCart } from '../store/useCart'
import Navbar from '../components/store/Navbar'
import HeroSection from '../components/store/HeroSection'
import CategoryCard from '../components/store/CategoryCard'
import ProductCard from '../components/store/ProductCard'
import StoreFooter from '../components/store/Footer'

export default function HomePage() {
  const { data, loading, error } = useHomeData()
  const add = useCart((s) => s.add)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const navigate = useNavigate()

  const allProducts = data.products || []
  const filteredProducts = useMemo(() => {
    return allProducts.filter((p) => {
      const textMatch = p.name.toLowerCase().includes(search.toLowerCase())
      const categoryMatch = category === 'all' || p.category_id === category
      return textMatch && categoryMatch
    })
  }, [allProducts, search, category])

  const featuredProducts = (data.featured || []).slice(0, 4)

  if (loading) return <p className="py-12 px-4 md:px-10">Loading storefront...</p>
  if (error) return <p className="py-12 px-4 md:px-10 text-red-600">Error: {error}</p>

  return (
    <div className="bg-gray-50">
      <Navbar
        search={search}
        onSearch={setSearch}
        onCartClick={() => navigate('/cart')}
        onAuthClick={() => navigate('/dashboard/shop')}
      />

      <HeroSection />

      <section className="py-12 px-4 md:px-10">
        <div className="max-w-7xl mx-auto">
          <h3 className="text-2xl font-semibold text-gray-900 mb-6">Categories</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {(data.categories || []).map((c) => (
              <CategoryCard key={c._id} category={c} selected={category === c._id} onClick={setCategory} />
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 px-4 md:px-10">
        <div className="max-w-7xl mx-auto">
          <h3 className="text-2xl font-semibold text-gray-900 mb-6">Featured Products</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {featuredProducts.map((p) => (
              <ProductCard key={p._id} product={p} onAdd={add} />
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 px-4 md:px-10">
        <div className="max-w-7xl mx-auto bg-emerald-500 text-white rounded-2xl p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <p className="text-xl font-semibold">Launch your next sales campaign with Dukani Promo Week.</p>
          <button className="bg-white text-emerald-600 px-4 py-2 rounded-xl hover:scale-105 transition-all duration-200 ease-in-out">Shop Offers</button>
        </div>
      </section>

      <section className="py-12 px-4 md:px-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6 gap-3 flex-wrap">
            <h3 className="text-2xl font-semibold text-gray-900">Products</h3>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="border px-3 py-2 rounded-xl bg-white"
            >
              <option value="all">All categories</option>
              {(data.categories || []).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {filteredProducts.map((p) => (
              <ProductCard key={p._id} product={p} onAdd={add} />
            ))}
          </div>
        </div>
      </section>

      <StoreFooter />
    </div>
  )
}
