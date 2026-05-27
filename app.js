const apiBase = window.INBOUND_CONFIG.apiBase;
const state = {
  token: localStorage.getItem("inbound.token") || "",
  user: JSON.parse(localStorage.getItem("inbound.user") || "null"),
  products: [],
  cart: new Map(JSON.parse(localStorage.getItem("inbound.cart") || "[]")),
  orders: [],
};
const $ = (selector) => document.querySelector(selector);
const money = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { Accept: "application/json", "Content-Type": "application/json", ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...(options.headers || {}) },
    body: options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || `Request failed (${response.status})`);
  return data;
}

function toast(message) {
  const node = $("[data-toast]");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 2600);
}

function persistCart() {
  localStorage.setItem("inbound.cart", JSON.stringify([...state.cart.entries()]));
}

function availableStock(product) {
  return Math.max(0, Number(product?.available_quantity || 0));
}

function reconcileCartStock() {
  let adjusted = false;
  for (const [id, quantity] of state.cart.entries()) {
    const product = state.products.find((item) => String(item.id) === String(id));
    const maximum = availableStock(product);
    if (!product || maximum < 1) {
      state.cart.delete(id);
      adjusted = true;
    } else if (quantity > maximum) {
      state.cart.set(id, maximum);
      adjusted = true;
    }
  }
  if (adjusted) persistCart();
  return adjusted;
}

function totals() {
  const items = [...state.cart.entries()].map(([id, quantity]) => ({ ...state.products.find((product) => String(product.id) === String(id)), quantity })).filter((item) => item.id);
  const regular = items.reduce((sum, item) => sum + item.regular_price * item.quantity, 0);
  const total = items.reduce((sum, item) => sum + item.inbound_price * item.quantity, 0);
  return { items, regular, total, discount: regular - total, count: items.reduce((sum, item) => sum + item.quantity, 0) };
}

async function login(event) {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const data = await request("/login", { method: "POST", body });
    if (data.user.role !== "inbound_customer") throw new Error("This login is not enabled for inbound customer shopping");
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem("inbound.token", state.token);
    localStorage.setItem("inbound.user", JSON.stringify(state.user));
    $("[data-login]").classList.add("hidden");
    await Promise.all([loadProducts(), loadOrders()]);
  } catch (error) {
    $("[data-login-error]").textContent = error.message;
  }
}

async function loadProducts() {
  const data = await request("/inbound/catalog");
  state.products = data.products || [];
  const cartAdjusted = reconcileCartStock();
  renderProducts();
  renderCart();
  if (cartAdjusted) toast("Cart quantity current stock ke hisaab se update ho gayi.");
}

async function loadOrders() {
  const data = await request("/inbound/orders");
  state.orders = data.orders || [];
  renderOrders();
}

function renderProducts() {
  const query = $("[data-search]").value.trim().toLowerCase();
  const products = state.products.filter((item) => !query || `${item.name} ${item.sku}`.toLowerCase().includes(query));
  $("[data-products]").innerHTML = products.map((item) => {
    const quantity = state.cart.get(String(item.id)) || 0;
    const atLimit = quantity >= availableStock(item);
    return `
    <article class="product">
      ${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="">` : `<div class="badge">Stock available</div>`}
      <h3>${escapeHtml(item.name)}</h3>
      <p><code>${escapeHtml(item.sku)}</code> / ${item.available_quantity} in stock</p>
      <span class="price">${money(item.inbound_price)}</span><span class="old">${money(item.regular_price)}</span>
      <p><span class="badge">20% off</span></p>
      <button class="primary" data-add="${item.id}" ${atLimit ? "disabled" : ""}>${atLimit ? "Stock limit reached" : "Add To Cart"}</button>
    </article>
  `;
  }).join("") || "<p>No products found.</p>";
}

function renderCart() {
  const summary = totals();
  $("[data-cart-count]").textContent = summary.count;
  $("[data-cart-items]").innerHTML = summary.items.map((item) => `
    <div class="cart-line">
      <div><strong>${escapeHtml(item.name)}</strong><br>${money(item.inbound_price)} x ${item.quantity}</div>
      <div><button data-minus="${item.id}">-</button> <button data-plus="${item.id}" ${item.quantity >= availableStock(item) ? "disabled" : ""}>+</button></div>
    </div>
  `).join("") || "<p>Your cart is empty.</p>";
  $("[data-totals]").innerHTML = `
    <div><span>Regular subtotal</span><strong>${money(summary.regular)}</strong></div>
    <div><span>Inbound discount (20%)</span><strong>- ${money(summary.discount)}</strong></div>
    <div><span>Payable total</span><strong>${money(summary.total)}</strong></div>`;
}

function renderOrders() {
  $("[data-orders]").innerHTML = state.orders.map((order) => `
    <article class="order">
      <div class="order-head"><strong>${escapeHtml(order.order_number)}</strong><span class="badge">${escapeHtml(order.status)}</span></div>
      <div class="lines">${order.items.map((item) => `${escapeHtml(item.product.name)} x ${item.quantity}`).join("<br>")}</div>
      <p><strong>${money(order.amount)}</strong> / 20% discount applied<br>Payment: ${escapeHtml(order.payment?.method || "-")} / ${escapeHtml(order.payment?.status || "pending")}<br>Invoice: ${escapeHtml(order.invoice?.invoice_number || "Generating")}</p>
      ${order.invoice ? `<div class="actions"><button data-invoice="${order.id}">Download Invoice</button></div>` : ""}
    </article>
  `).join("") || "<p>No orders placed yet.</p>";
}

async function checkout(event) {
  event.preventDefault();
  const summary = totals();
  if (!summary.items.length) return toast("Add products before checkout");
  const form = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const data = await request("/inbound/orders", {
      method: "POST",
      body: {
        orderId: `INB-${Date.now()}`,
        address: form.address,
        payment: { method: form.payment, reference: form.reference },
        items: summary.items.map((item) => ({ product_id: item.id, sku: item.sku, quantity: item.quantity })),
      },
    });
    state.cart.clear();
    persistCart();
    renderCart();
    toggleCart(false);
    await loadOrders();
    showView("orders");
    toast(`Order ${data.order.order_number} placed and invoice saved`);
  } catch (error) {
    toast(error.message);
  }
}

function downloadInvoice(order) {
  const lines = order.items.map((item) => `<tr><td>${escapeHtml(item.product.name)}</td><td>${escapeHtml(item.product.sku)}</td><td>${item.quantity}</td><td>${money(item.unit_price)}</td><td>${money(item.line_total)}</td></tr>`).join("");
  const html = `<!doctype html><title>${escapeHtml(order.invoice.invoice_number)}</title><style>body{font:14px Arial;margin:36px;max-width:760px}h1{color:#087f5b}table{width:100%;border-collapse:collapse}td,th{padding:10px;border-bottom:1px solid #ddd;text-align:left}</style><h1>EV Speare Inbound Invoice</h1><p>Invoice: ${escapeHtml(order.invoice.invoice_number)}<br>Order: ${escapeHtml(order.order_number)}<br>Customer: ${escapeHtml(state.user.name)}</p><table><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Price</th><th>Total</th></tr>${lines}</table><h2>Total: ${money(order.amount)}</h2><p>Fixed inbound customer discount: 20%. Local warehouse fulfilment, no Shiprocket.</p>`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  link.download = `${order.invoice.invoice_number}.html`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function showView(name) {
  document.querySelectorAll("[data-view]").forEach((node) => node.classList.toggle("hidden", node.dataset.view !== name));
  document.querySelectorAll("[data-view-button]").forEach((node) => node.classList.toggle("active", node.dataset.viewButton === name));
}

function toggleCart(open) {
  $("[data-cart]").classList.toggle("hidden", !open);
  document.body.classList.toggle("cart-open", open);
}

document.addEventListener("click", (event) => {
  const add = event.target.closest("[data-add]");
  const plus = event.target.closest("[data-plus]");
  const minus = event.target.closest("[data-minus]");
  if (add || plus) {
    const id = String((add || plus).dataset.add || plus.dataset.plus);
    const product = state.products.find((item) => String(item.id) === id);
    const nextQuantity = (state.cart.get(id) || 0) + 1;
    if (!product || nextQuantity > availableStock(product)) {
      toast(`Sirf ${availableStock(product)} quantity stock mein available hai.`);
      return;
    }
    state.cart.set(id, nextQuantity);
    persistCart(); renderCart(); renderProducts(); toast("Added to cart");
  }
  if (minus) {
    const id = String(minus.dataset.minus);
    const qty = (state.cart.get(id) || 0) - 1;
    if (qty > 0) state.cart.set(id, qty); else state.cart.delete(id);
    persistCart(); renderCart(); renderProducts();
  }
  if (event.target.closest("[data-cart-button]")) toggleCart(true);
  if (event.target.closest("[data-close-cart]")) toggleCart(false);
  const view = event.target.closest("[data-view-button]");
  if (view) showView(view.dataset.viewButton);
  const invoice = event.target.closest("[data-invoice]");
  if (invoice) downloadInvoice(state.orders.find((order) => String(order.id) === invoice.dataset.invoice));
  if (event.target.closest("[data-logout]")) {
    localStorage.removeItem("inbound.token"); localStorage.removeItem("inbound.user"); location.reload();
  }
});

$("[data-login-form]").addEventListener("submit", login);
$("[data-checkout-form]").addEventListener("submit", checkout);
$("[data-search]").addEventListener("input", renderProducts);
$("[data-refresh-orders]").addEventListener("click", () => loadOrders().catch((error) => toast(error.message)));
if (state.token && state.user?.role === "inbound_customer") {
  $("[data-login]").classList.add("hidden");
  Promise.all([loadProducts(), loadOrders()]).catch(() => {
    localStorage.removeItem("inbound.token");
    $("[data-login]").classList.remove("hidden");
  });
}
