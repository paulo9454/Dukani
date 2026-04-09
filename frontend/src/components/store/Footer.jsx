export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300 py-10 mt-12 px-4 md:px-10">
      <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-8">
        <div>
          <h4 className="text-white font-semibold mb-2">Dukani</h4>
          <p className="text-sm">Premium commerce platform for modern businesses.</p>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-2">Company</h4>
          <p className="text-sm">About</p>
          <p className="text-sm">Pricing</p>
          <p className="text-sm">Support</p>
        </div>
        <div>
          <h4 className="text-white font-semibold mb-2">Legal</h4>
          <p className="text-sm">Privacy</p>
          <p className="text-sm">Terms</p>
        </div>
      </div>
    </footer>
  )
}
