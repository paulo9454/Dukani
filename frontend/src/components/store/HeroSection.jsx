export default function HeroSection() {
  return (
    <section className="bg-gradient-to-r from-indigo-600 to-indigo-500 text-white py-20 px-4 md:px-10">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-4xl md:text-5xl font-bold mb-4">Sell smarter with Dukani</h2>
        <p className="text-lg text-indigo-100 mb-6">Premium storefront + POS experience inspired by modern SaaS leaders.</p>
        <div className="flex gap-3 flex-wrap">
          <button className="bg-white text-indigo-600 px-6 py-3 rounded-xl font-semibold hover:bg-gray-100 hover:scale-105 transition-all duration-200 ease-in-out">Start Shopping</button>
          <button className="border border-white px-6 py-3 rounded-xl hover:bg-white hover:text-indigo-600 hover:scale-105 transition-all duration-200 ease-in-out">Explore Features</button>
        </div>
      </div>
    </section>
  )
}
