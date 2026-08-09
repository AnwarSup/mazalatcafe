const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { db, raw, rawSave } = require('./db');

const app = express();
app.set('etag', false);
const PORT = process.env.PORT || 3001;
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');
const JWT_SECRET = process.env.JWT_SECRET;

// ── Middleware ──
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/admin', express.static(path.join(__dirname, '..', 'admin'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('ETag', '');
    }
  }
}));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ── File upload ──
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => cb(null, `menu_${Date.now()}${path.extname(file.originalname)}`)
});
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED_IMAGE_TYPES.has(file.mimetype))
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[<>&"']/g, character => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

// ── Auth middleware ──
function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

// ══════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Username atau password salah' });
  }
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

// ══════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════
app.get('/api/menu', (req, res) => {
  const d = raw();
  const cats = d.categories.filter(c => c.active).sort((a, b) => a.sort_order - b.sort_order);
  const items = d.menu_items.filter(i => i.available);
  const menu = cats.map(cat => ({
    ...cat,
    items: items.filter(i => i.category_id === cat.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(i => ({ ...i, options: JSON.parse(i.options || '[]') }))
  }));
  res.json(menu);
});

// Admin menu - flat list for admin panel
app.get("/api/admin/menu", auth, (req, res) => {
  const d = raw();
  const items = d.menu_items.sort((a, b) => a.sort_order - b.sort_order);
  const cats = d.categories;
  const result = items.map(item => ({
    ...item,
    options: JSON.parse(item.options || "[]"),
    category_name: cats.find(c => c.id === item.category_id)?.name || "-"
  }));
  res.json(result);
});

// Public categories
app.get("/api/categories", (req, res) => {
  const d = raw();
  const cats = d.categories.filter(c => c.active).sort((a, b) => a.sort_order - b.sort_order);
  res.json(cats);
});

app.get('/api/settings', (req, res) => {
// Public categories
app.get("/api/categories", (req, res) => {
  const d = raw();
  const cats = d.categories.filter(c => c.active).sort((a, b) => a.sort_order - b.sort_order);
  res.json(cats);
});

  res.json(raw().settings);
});

// Public order (from customer site)
app.post('/api/orders', (req, res) => {
  const { customer_name, customer_phone, customer_note, items } = req.body;
  const d = raw();
  if (!Array.isArray(items) || !items.length || items.length > 50) {
    return res.status(400).json({ error: 'Valid order items required' });
  }
  let total = 0;
  const pricedItems = [];
  for (const submitted of items) {
    const menuItem = d.menu_items.find(item => item.id === Number(submitted.id) && item.available);
    const qty = Number(submitted.qty ?? submitted.quantity);
    if (!menuItem || !Number.isInteger(qty) || qty < 1 || qty > 99) {
      return res.status(400).json({ error: 'Invalid or unavailable menu item' });
    }
    total += Number(menuItem.price) * qty;
    if (!Number.isSafeInteger(total) || total > 1e8) return res.status(400).json({ error: 'Order total exceeds limit' });
    pricedItems.push({ id: menuItem.id, name: menuItem.name, price: Number(menuItem.price), qty });
  }
  const id = d.nextId.orders++;
  d.orders.push({
    id, customer_name: customer_name || '', customer_phone: customer_phone || '',
    customer_note: customer_note || '', items: JSON.stringify(pricedItems),
    total, status: 'pending', source: 'whatsapp',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  });
  rawSave();
  res.json({ id, message: 'Pesanan diterima' });
});

// ══════════════════════════════════════════
// ADMIN — Dashboard
// ══════════════════════════════════════════
app.get('/api/admin/stats', auth, (req, res) => {
  const d = raw();
  const today = new Date().toISOString().split('T')[0];
  const todayOrders = d.orders.filter(o => o.created_at.startsWith(today));
  res.json({
    totalMenu: d.menu_items.length,
    availableMenu: d.menu_items.filter(i => i.available).length,
    totalCategories: d.categories.length,
    totalOrders: d.orders.length,
    pendingOrders: d.orders.filter(o => o.status === 'pending').length,
    todayOrders: todayOrders.length,
    todayRevenue: todayOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0),
  });
});

// ══════════════════════════════════════════
// ADMIN — Categories CRUD
// ══════════════════════════════════════════
app.get('/api/admin/categories', auth, (req, res) => {
  const d = raw();
  const cats = d.categories.sort((a, b) => a.sort_order - b.sort_order);
  res.json(cats.map(c => ({
    ...c,
    item_count: d.menu_items.filter(m => m.category_id === c.id).length
  })));
});

app.post('/api/admin/categories', auth, (req, res) => {
  const { name, slug, sort_order, icon } = req.body;
  const d = raw();
  const id = d.nextId.categories++;
  d.categories.push({ id, name, slug: slug || name.toLowerCase().replace(/\s+/g, '-'), sort_order: sort_order || 0, icon: icon || '', active: 1, created_at: new Date().toISOString() });
  rawSave();
  res.json({ id });
});

app.put('/api/admin/categories/:id', auth, (req, res) => {
  const d = raw();
  const cat = d.categories.find(c => c.id === parseInt(req.params.id));
  if (!cat) return res.status(404).json({ error: 'Not found' });
  Object.assign(cat, req.body);
  rawSave();
  res.json({ ok: true });
});

app.delete('/api/admin/categories/:id', auth, (req, res) => {
  const d = raw();
  const id = parseInt(req.params.id);
  d.categories = d.categories.filter(c => c.id !== id);
  d.menu_items = d.menu_items.filter(m => m.category_id !== id);
  rawSave();
  res.json({ ok: true });
});

// ══════════════════════════════════════════
// ADMIN — Menu Items CRUD
// ══════════════════════════════════════════
app.get('/api/admin/menu', auth, (req, res) => {
  const d = raw();
  res.json(d.menu_items.map(item => {
    const cat = d.categories.find(c => c.id === item.category_id);
    return { ...item, category_name: cat?.name || '', options: JSON.parse(item.options || '[]') };
  }));
});

app.post('/api/admin/menu', auth, (req, res) => {
  const { category_id, name, description, price, image_url, options, available, popular, sort_order } = req.body;
  const d = raw();
  const id = d.nextId.menu_items++;
  const now = new Date().toISOString();
  d.menu_items.push({ id, category_id, name, description: description || '', price, image_url: image_url || '', options: JSON.stringify(options || []), available: available ?? 1, popular: popular ?? 0, sort_order: sort_order || 0, created_at: now, updated_at: now });
  rawSave();
  res.json({ id });
});

app.put('/api/admin/menu/:id', auth, (req, res) => {
  const d = raw();
  const item = d.menu_items.find(i => i.id === parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: 'Not found' });
  const { category_id, name, description, price, image_url, options, available, popular, sort_order } = req.body;
  Object.assign(item, { category_id, name, description: description || '', price, image_url: image_url || '', options: JSON.stringify(options || []), available: available ?? 1, popular: popular ?? 0, sort_order: sort_order || 0, updated_at: new Date().toISOString() });
  rawSave();
  res.json({ ok: true });
});

app.delete('/api/admin/menu/:id', auth, (req, res) => {
  const d = raw();
  d.menu_items = d.menu_items.filter(i => i.id !== parseInt(req.params.id));
  rawSave();
  res.json({ ok: true });
});

// ── Image upload ──
app.post('/api/admin/upload', auth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ══════════════════════════════════════════
// ADMIN — Orders
// ══════════════════════════════════════════
app.get('/api/admin/orders', auth, (req, res) => {
  const d = raw();
  let orders = [...d.orders].sort((a, b) => b.id - a.id);
  if (req.query.status) orders = orders.filter(o => o.status === req.query.status);
  if (req.query.limit) orders = orders.slice(0, parseInt(req.query.limit));
  res.json(orders.map(o => ({ ...o, items: typeof o.items === 'string' ? JSON.parse(o.items || '[]') : o.items })));
});

app.put('/api/admin/orders/:id/status', auth, (req, res) => {
  const d = raw();
  const order = d.orders.find(o => o.id === parseInt(req.params.id));
  if (!order) return res.status(404).json({ error: 'Not found' });
  order.status = req.body.status;
  order.updated_at = new Date().toISOString();
  rawSave();
  res.json({ ok: true });
});

// ══════════════════════════════════════════
// ADMIN — Settings
// ══════════════════════════════════════════
app.put("/api/admin/settings", auth, (req, res) => {
  console.log("API_PUT_SETTINGS", JSON.stringify(req.body));
  const d = raw();
  Object.assign(d.settings, req.body);
  rawSave();
  res.json({ ok: true });
});

// ── Catch-all ──

// ══════════════════════════════════════════
// ANALYTICS — Daily Revenue (last 7 days)
// ══════════════════════════════════════════
app.get('/api/admin/analytics/daily', auth, (req, res) => {
  const d = raw();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    const dateStr = dt.toISOString().split('T')[0];
    const dayOrders = d.orders.filter(o => (o.created_at || '').startsWith(dateStr));
    days.push({
      date: dateStr,
      revenue: dayOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + (o.total || 0), 0),
      order_count: dayOrders.length
    });
  }
  res.json(days);
});

// ══════════════════════════════════════════
// ANALYTICS — Popular Items (top 5)
// ══════════════════════════════════════════
app.get('/api/admin/analytics/popular', auth, (req, res) => {
  const d = raw();
  const qtyMap = {};
  const nameMap = {};
  for (const order of d.orders) {
    const items = typeof order.items === 'string' ? JSON.parse(order.items || '[]') : order.items || [];
    for (const item of items) {
      const key = item.id || item.name;
      qtyMap[key] = (qtyMap[key] || 0) + (item.quantity || 1);
      nameMap[key] = item.name || key;
    }
  }
  const sorted = Object.entries(qtyMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, quantity]) => ({ id, name: nameMap[id], quantity }));
  res.json(sorted);
});

// ══════════════════════════════════════════
// ADMIN — Orders with date filter
// ══════════════════════════════════════════
app.get('/api/admin/orders/dated', auth, (req, res) => {
  const d = raw();
  let orders = [...d.orders].sort((a, b) => b.id - a.id);
  if (req.query.status) orders = orders.filter(o => o.status === req.query.status);
  if (req.query.date) {
    const date = req.query.date;
    orders = orders.filter(o => (o.created_at || '').startsWith(date));
  }
  if (req.query.limit) orders = orders.slice(0, parseInt(req.query.limit));
  res.json(orders.map(o => ({ ...o, items: typeof o.items === 'string' ? JSON.parse(o.items || '[]') : o.items })));
});
app.get('/admin/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin', 'index.html'));
});

// ── Start ──
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Mazalat API] Running on port ${PORT}`);
  console.log(`[Mazalat API] Admin: http://localhost:${PORT}/admin`);
});

// ══════════════════════════════════════════
// PUBLIC — Reviews
// ══════════════════════════════════════════
app.get('/api/reviews', (req, res) => {
  const d = raw();
  const reviews = (d.reviews || [])
    .filter(r => r.approved !== false)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(reviews);
});

app.post('/api/reviews', (req, res) => {
  const d = raw();
  if (!d.reviews) { d.reviews = []; d.nextId.reviews = 1; }
  const { name, rating, comment } = req.body;
  if (!name || !rating || !comment) return res.status(400).json({ error: 'Name, rating, and comment required' });
  if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1-5' });
  const id = d.nextId.reviews++;
  d.reviews.push({
    id, name: escapeHtml(name), rating, comment: escapeHtml(comment), approved: false,
    created_at: new Date().toISOString()
  });
  rawSave();
  res.status(201).json({ id, message: 'Review submitted' });
});

// ══════════════════════════════════════════
// ADMIN — Reviews
// ══════════════════════════════════════════
app.get('/api/admin/reviews', auth, (req, res) => {
  const d = raw();
  const reviews = (d.reviews || []).sort((a, b) => b.id - a.id);
  res.json(reviews);
});

app.put('/api/admin/reviews/:id', auth, (req, res) => {
  const d = raw();
  const review = (d.reviews || []).find(r => r.id === parseInt(req.params.id));
  if (!review) return res.status(404).json({ error: 'Not found' });
  const { approved, name, rating, comment } = req.body;
  if (approved !== undefined) review.approved = approved;
  if (name) review.name = escapeHtml(name);
  if (rating) review.rating = rating;
  if (comment) review.comment = escapeHtml(comment);
  rawSave();
  res.json({ ok: true });
});

app.delete('/api/admin/reviews/:id', auth, (req, res) => {
  const d = raw();
  if (!d.reviews) return res.status(404).json({ error: 'Not found' });
  d.reviews = d.reviews.filter(r => r.id !== parseInt(req.params.id));
  rawSave();
  res.json({ ok: true });
});

// ══════════════════════════════════════════
// GALLERY
// ══════════════════════════════════════════
app.get('/api/gallery', (req, res) => {
  const d = raw();
  if (!d.gallery_photos) { d.gallery_photos = []; rawSave(); }
  res.json(d.gallery_photos);
});

app.get('/api/admin/gallery', auth, (req, res) => {
  const d = raw();
  if (!d.gallery_photos) { d.gallery_photos = []; rawSave(); }
  res.json(d.gallery_photos);
});

app.post('/api/admin/gallery', auth, upload.single('image'), (req, res) => {
  const d = raw();
  if (!d.gallery_photos) d.gallery_photos = [];
  const photo = {
    id: d.gallery_photos.length ? Math.max(...d.gallery_photos.map(p => p.id)) + 1 : 1,
    url: '/uploads/' + req.file.filename,
    alt: req.body.alt || '',
    sort_order: d.gallery_photos.length
  };
  d.gallery_photos.push(photo);
  rawSave();
  res.json(photo);
});

app.delete('/api/admin/gallery/:id', auth, (req, res) => {
  const d = raw();
  if (!d.gallery_photos) return res.status(404).json({ error: 'Not found' });
  d.gallery_photos = d.gallery_photos.filter(p => p.id !== parseInt(req.params.id));
  rawSave();
  res.json({ ok: true });
});
