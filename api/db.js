const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_FILE = path.join(__dirname, '..', 'data', 'db.json');

// ── Load / Init DB ──
let db;

function loadDB() {
  if (db) return db;
  if (!fs.existsSync(DATA_FILE)) {
    db = initDB();
    saveDB();
  } else {
    try {
      db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch { db = initDB(); }
  }
  return db;
}

function saveDB() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function initDB() {
  const hash = bcrypt.hashSync('mazalat2026', 10);
  return {
    users: [{ id: 1, username: 'admin', password: hash, role: 'admin', created_at: new Date().toISOString() }],
    categories: [
      { id: 1, name: 'Kopi', slug: 'kopi', sort_order: 1, icon: '☕', active: 1, created_at: new Date().toISOString() },
      { id: 2, name: 'Non Kopi', slug: 'non-kopi', sort_order: 2, icon: '🥤', active: 1, created_at: new Date().toISOString() },
      { id: 3, name: 'Makanan Berat', slug: 'makanan-berat', sort_order: 3, icon: '🍛', active: 1, created_at: new Date().toISOString() },
      { id: 4, name: 'Snack', slug: 'snack', sort_order: 4, icon: '🍟', active: 1, created_at: new Date().toISOString() },
      { id: 5, name: 'Dessert', slug: 'dessert', sort_order: 5, icon: '🍰', active: 1, created_at: new Date().toISOString() },
      { id: 6, name: 'Paket Hemat', slug: 'paket-hemat', sort_order: 6, icon: '📦', active: 1, created_at: new Date().toISOString() },
      { id: 7, name: 'Tambahan', slug: 'tambahan', sort_order: 7, icon: '➕', active: 1, created_at: new Date().toISOString() },
    ],
    menu_items: [
      { id: 1, category_id: 1, name: 'Espresso', description: 'Single shot espresso', price: 18000, image_url: '', options: '[]', available: 1, popular: 0, sort_order: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 2, category_id: 1, name: 'Americano', description: 'Espresso + hot/ice water', price: 22000, image_url: '', options: '[]', available: 1, popular: 0, sort_order: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 3, category_id: 1, name: 'Cappuccino', description: 'Espresso + steamed milk + foam', price: 28000, image_url: '', options: '[]', available: 1, popular: 0, sort_order: 2, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 4, category_id: 1, name: 'Latte', description: 'Espresso + steamed milk', price: 28000, image_url: '', options: '[]', available: 1, popular: 0, sort_order: 3, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 5, category_id: 1, name: 'Mocha', description: 'Espresso + chocolate + milk', price: 30000, image_url: '', options: '[]', available: 1, popular: 0, sort_order: 4, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 6, category_id: 1, name: 'Kopi Susu Mazalat', description: 'Signature kopi susu gula aren', price: 25000, image_url: '', options: '[]', available: 1, popular: 1, sort_order: 5, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 7, category_id: 1, name: 'Caramel Macchiato', description: 'Espresso + caramel + milk', price: 32000, image_url: '', options: '[]', available: 1, popular: 0, sort_order: 6, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 8, category_id: 1, name: 'V60 Pour Over', description: 'Single origin manual brew', price: 35000, image_url: '', options: '[]', available: 1, popular: 0, sort_order: 7, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 9, category_id: 2, name: 'Matcha Latte', description: 'Premium matcha + milk', price: 30000, image_url: '', options: '[]', available: 1, popular: 0, sort_order: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 10, category_id: 2, name: 'Chocolate', description: 'Belgian chocolate + milk', price: 28000, image_url: '', options: '[]', available: 1, popular: 0, sort_order: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 11, category_id: 2, name: 'Thai Tea', description: 'Classic Thai milk tea', price: 22000, image_url: '', options: '[]', available: 1, popular: 0, sort_order: 2, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 12, category_id: 2, name: 'Lemon Tea', description: 'Fresh lemon + tea', price: 18000, image_url: '', options: '[]', available: 1, popular: 0, sort_order: 3, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 13, category_id: 2, name: 'Lychee Tea', description: 'Lychee + tea + jelly', price: 20000, image_url: '', options: '[]', available: 1, popular: 0, sort_order: 4, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 14, category_id: 3, name: 'Nasi Goreng Mazalat', description: 'Nasi goreng spesial + telur + ayam', price: 32000, image_url: '', options: '[]', available: 1, popular: 1, sort_order: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 15, category_id: 3, name: 'Mie Goreng', description: 'Mie goreng + telur + sayuran', price: 28000, image_url: '', options: '[]', available: 1, popular: 0, sort_order: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 16, category_id: 3, name: 'Ayam Geprek', description: 'Ayam goreng geprek sambal matah', price: 30000, image_url: '', options: '[]', available: 1, popular: 0, sort_order: 2, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 17, category_id: 3, name: 'Nasi Ayam Teriyaki', description: 'Nasi + ayam teriyaki + sayur', price: 35000, image_url: '', options: '[]', available: 1, popular: 0, sort_order: 3, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 18, category_id: 4, name: 'French Fries', description: 'Kentang goreng + saus', price: 20000, image_url: '', options: '[]', available: 1, popular: 0, sort_order: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 19, category_id: 4, name: 'Chicken Wings', description: 'Sayap ayam crispy 6pcs', price: 28000, image_url: '', options: '[]', available: 1, popular: 0, sort_order: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 20, category_id: 4, name: 'Pisang Goreng', description: 'Pisang goreng crispy 5pcs', price: 18000, image_url: '', options: '[]', available: 1, popular: 0, sort_order: 2, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 21, category_id: 4, name: 'Roti Bakar', description: 'Roti bakar coklat/keju', price: 15000, image_url: '', options: '[]', available: 1, popular: 0, sort_order: 3, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 22, category_id: 5, name: 'Brownies', description: 'Warm brownies + ice cream', price: 25000, image_url: '', options: '[]', available: 1, popular: 0, sort_order: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 23, category_id: 5, name: 'Waffle', description: 'Waffle + maple syrup + cream', price: 28000, image_url: '', options: '[]', available: 1, popular: 0, sort_order: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 24, category_id: 6, name: 'Paket Kopi + Snack', description: '1 kopi + 1 snack', price: 35000, image_url: '', options: '[]', available: 1, popular: 0, sort_order: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 25, category_id: 6, name: 'Paket Nasi + Minum', description: '1 nasi + 1 minuman', price: 42000, image_url: '', options: '[]', available: 1, popular: 0, sort_order: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 26, category_id: 7, name: 'Extra Shot', description: 'Tambahan espresso shot', price: 5000, image_url: '', options: '[]', available: 1, popular: 0, sort_order: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 27, category_id: 7, name: 'Susu Oat', description: 'Upgrade ke oat milk', price: 5000, image_url: '', options: '[]', available: 1, popular: 0, sort_order: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 28, category_id: 7, name: 'Extra Ice', description: 'Es batu tambahan', price: 2000, image_url: '', options: '[]', available: 1, popular: 0, sort_order: 2, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ],
    orders: [],
    settings: {
      cafe_name: 'Mazalat — Coffee & Kitchen',
      tagline: 'Kopi Nikmat, Suasana Tenang',
      address: 'Jl Raya Pangalengan KM 24, Cimaung, Bandung',
      whatsapp: '6282116640563',
      instagram: '@cafe_mazalat',
      open_hours: '09:00 - 22:00',
    },
    nextId: { users: 2, categories: 8, menu_items: 29, orders: 1 }
  };
}

// ── DB wrappers (SQLite-like API) ──
const dbWrapper = {
  prepare(sql) {
    return {
      get(...params) {
        const d = loadDB();
        // Simple parsing
        if (/SELECT.*FROM users.*WHERE username/i.test(sql)) {
          return d.users.find(u => u.username === params[0]);
        }
        if (/SELECT.*COUNT.*FROM menu_items/i.test(sql)) {
          return { c: d.menu_items.length };
        }
        if (/SELECT.*COUNT.*FROM categories/i.test(sql)) {
          return { c: d.categories.length };
        }
        if (/SELECT.*COUNT.*FROM orders/i.test(sql)) {
          return { c: d.orders.length };
        }
        if (/SELECT SUM.*orders/i.test(sql)) {
          const today = new Date().toISOString().split('T')[0];
          const total = d.orders
            .filter(o => o.created_at.startsWith(today) && o.status !== 'cancelled')
            .reduce((s, o) => s + o.total, 0);
          return { t: total };
        }
        if (/SELECT COUNT.*WHERE status = 'pending'/i.test(sql)) {
          return { c: d.orders.filter(o => o.status === 'pending').length };
        }
        if (/SELECT COUNT.*WHERE date\(created_at\) = date\('now'\)/i.test(sql)) {
          const today = new Date().toISOString().split('T')[0];
          return { c: d.orders.filter(o => o.created_at.startsWith(today)).length };
        }
        return undefined;
      },
      all(...params) {
        const d = loadDB();
        // Menu with categories
        if (/SELECT m\.\*, c\.name as category_name.*FROM menu_items/i.test(sql)) {
          return d.menu_items.map(item => {
            const cat = d.categories.find(c => c.id === item.category_id);
            return { ...item, category_name: cat?.name || '', category_slug: cat?.slug || '' };
          });
        }
        // Categories with item count
        if (/SELECT c\.\*, COUNT\(m\.id\)/i.test(sql)) {
          return d.categories.map(cat => ({
            ...cat,
            item_count: d.menu_items.filter(m => m.category_id === cat.id).length
          }));
        }
        return [];
      },
      run(...params) {
        const d = loadDB();
        // Insert menu item
        if (/INSERT INTO menu_items/i.test(sql)) {
          const id = d.nextId.menu_items++;
          const now = new Date().toISOString();
          d.menu_items.push({
            id, category_id: params[0], name: params[1], description: params[2],
            price: params[3], image_url: params[4], options: params[5],
            available: params[6], popular: params[7], sort_order: params[8],
            created_at: now, updated_at: now
          });
          saveDB(); return { lastInsertRowid: id };
        }
        // Insert category
        if (/INSERT INTO categories/i.test(sql)) {
          const id = d.nextId.categories++;
          d.categories.push({ id, name: params[0], slug: params[1], sort_order: params[2], icon: params[3], active: 1, created_at: new Date().toISOString() });
          saveDB(); return { lastInsertRowid: id };
        }
        // Insert order
        if (/INSERT INTO orders/i.test(sql)) {
          const id = d.nextId.orders++;
          d.orders.push({ id, customer_name: params[0], customer_phone: params[1], customer_note: params[2], items: params[3], total: params[4], status: 'pending', source: 'whatsapp', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
          saveDB(); return { lastInsertRowid: id };
        }
        return { lastInsertRowid: 0 };
      }
    };
  }
};

// ── Raw access for complex queries ──
function raw() { return loadDB(); }
function rawSave() { saveDB(); }

module.exports = { db: dbWrapper, raw, rawSave };