export class PosEngine {
  constructor() {
    this.carts = [
      {
        id: this._id(),
        name: "Current Sale",
        items: [],
        status: "active", // active | held | completed
      },
    ];

    this.activeCartId = this.carts[0].id;
  }

  // =========================
  // CART MANAGEMENT
  // =========================

  _id() {
    return crypto.randomUUID();
  }

  getActiveCart() {
    return this.carts.find(c => c.id === this.activeCartId);
  }

  switchCart(cartId) {
    this.activeCartId = cartId;
  }

  newCart(name = "New Sale") {
    const cart = {
      id: this._id(),
      name,
      items: [],
      status: "active",
    };

    this.carts.push(cart);
    this.activeCartId = cart.id;

    return cart;
  }

  holdActiveCart() {
    const cart = this.getActiveCart();
    if (!cart) return;

    cart.status = "held";

    // auto create new cart
    return this.newCart("New Sale");
  }

  resumeCart(cartId) {
    this.activeCartId = cartId;
  }

  deleteCart(cartId) {
    this.carts = this.carts.filter(c => c.id !== cartId);

    if (this.activeCartId === cartId && this.carts.length) {
      this.activeCartId = this.carts[0].id;
    }
  }

  // =========================
  // CART OPERATIONS
  // =========================

  addProduct(product, priceResolver) {
    const cart = this.getActiveCart();
    if (!cart) return;

    const price = priceResolver(product);

    const existing = cart.items.find(i => i._id === product._id);

    if (existing) {
      existing.qty += 1;
      return;
    }

    cart.items.push({
      _id: product._id,
      name: product.name,
      price,
      qty: 1,
      stock: product.stock ?? Infinity,
    });
  }

  increase(productId) {
    const cart = this.getActiveCart();

    const item = cart.items.find(i => i._id === productId);
    if (!item) return;

    if (item.qty < item.stock) item.qty += 1;
  }

  decrease(productId) {
    const cart = this.getActiveCart();

    cart.items = cart.items
      .map(i =>
        i._id === productId ? { ...i, qty: i.qty - 1 } : i
      )
      .filter(i => i.qty > 0);
  }

  remove(productId) {
    const cart = this.getActiveCart();
    cart.items = cart.items.filter(i => i._id !== productId);
  }

  clear() {
    const cart = this.getActiveCart();
    cart.items = [];
  }

  // =========================
  // CALCULATIONS
  // =========================

  subtotal() {
    const cart = this.getActiveCart();

    return cart.items.reduce(
      (sum, i) => sum + i.price * i.qty,
      0
    );
  }

  totalItems() {
    const cart = this.getActiveCart();
    return cart.items.reduce((s, i) => s + i.qty, 0);
  }

  // =========================
  // CHECKOUT FORMAT
  // =========================

  buildCheckoutPayload(shopId, paymentMethod = "cash") {
    const cart = this.getActiveCart();

    return {
      shop_id: shopId,
      items: cart.items.map(i => ({
        product_id: i._id,
        qty: i.qty,
      })),
      payment_method: paymentMethod,
      discount: 0,
      tax_percent: 0,
    };
  }
}
