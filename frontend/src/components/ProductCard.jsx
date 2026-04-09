export default function ProductCard({ product, onAdd }) {
  return (
    <article className="card">
      <div className="thumb" />
      <h3>{product.name}</h3>
      <p>${product.price}</p>
      {product.stock !== undefined && <p>Stock: {product.stock}</p>}
      <button onClick={() => onAdd(product._id)}>Add to cart</button>
    </article>
  )
}
