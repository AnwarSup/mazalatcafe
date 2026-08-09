var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
async function checkAuth(request, DB) {
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Basic ")) return false;
  let decoded;
  try {
    decoded = atob(auth.slice(6));
  } catch (_) {
    return false;
  }
  const separator = decoded.indexOf(":");
  if (separator < 0) return false;
  const inputUser = decoded.slice(0, separator);
  const inputPass = decoded.slice(separator + 1);
  const userRow = await DB.prepare("SELECT value FROM settings WHERE key='admin_user'").first();
  const passRow = await DB.prepare("SELECT value FROM settings WHERE key='admin_pass'").first();
  if (!userRow || !passRow || !userRow.value || !passRow.value) return false;
  if (inputUser !== userRow.value) return false;
  const storedPass = passRow.value;
  if (inputPass.length !== storedPass.length) return false;
  let diff = 0;
  for (let i = 0; i < storedPass.length; i++) {
    diff |= inputPass.charCodeAt(i) ^ storedPass.charCodeAt(i);
  }
  return diff === 0;
}
__name(checkAuth, "checkAuth");
function unauthorized() {
  return new Response("Unauthorized", {
    status: 401,
    headers: securityHeaders({ "WWW-Authenticate": 'Basic realm="Mazalat Admin"' })
  });
}
__name(unauthorized, "unauthorized");
function securityHeaders(extra = {}) {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-Frame-Options": "DENY",
    "X-Robots-Tag": "noindex, nofollow",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' https: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
    ...extra
  };
}
__name(securityHeaders, "securityHeaders");
var ALLOWED_ORIGIN = "https://mazalatcafe.my.id";
var MAX_IMAGE_DATA_URL_BYTES = 50 * 1024;
var brokenMenuImageRepaired = false;
function corsHeaders(request) {
  return request && request.headers.get("Origin") === ALLOWED_ORIGIN ? { "Access-Control-Allow-Origin": ALLOWED_ORIGIN, "Vary": "Origin" } : {};
}
__name(corsHeaders, "corsHeaders");
function json(data, status = 200, request) {
  const headers = securityHeaders({ "Content-Type": "application/json", ...corsHeaders(request) });
  headers["X-RateLimit-Policy"] = "sliding-window";
  return new Response(JSON.stringify(data), { status, headers });
}
__name(json, "json");
function clean(value, max) {
  const raw = String(value ?? "").trim();
  if (raw.startsWith("data:")) return raw;
  return raw.replace(/<[^>]*>/g, "").substring(0, max);
}
__name(clean, "clean");
function safeUrl(value) {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  if (raw.startsWith("data:")) {
    if (new TextEncoder().encode(raw).byteLength > MAX_IMAGE_DATA_URL_BYTES) return null;
    if (raw.match(/^data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+$/)) return raw;
    return null;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
    return null;
  } catch (_) {
    return null;
  }
}
__name(safeUrl, "safeUrl");
function sortOrder(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 1e6 ? parsed : null;
}
__name(sortOrder, "sortOrder");
function parseItems(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}
__name(parseItems, "parseItems");
function methodNotAllowed(allow, request) {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: securityHeaders({ Allow: allow, ...corsHeaders(request) })
  });
}
__name(methodNotAllowed, "methodNotAllowed");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const DB = env.DB;
    if (!brokenMenuImageRepaired) {
      await DB.prepare(
        "UPDATE menu_items SET image_url=NULL, updated_at=datetime('now', '+7 hours') WHERE id=77 AND image_url LIKE 'data:%' AND length(image_url)>?"
      ).bind(MAX_IMAGE_DATA_URL_BYTES).run();
      brokenMenuImageRepaired = true;
    }
    if (method === "OPTIONS") {
      const origin = request.headers.get("Origin");
      if (origin && origin !== ALLOWED_ORIGIN) {
        return new Response("Forbidden", { status: 403, headers: securityHeaders() });
      }
      return new Response(null, {
        status: 204,
        headers: securityHeaders({ ...corsHeaders(request), "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" })
      });
    }
    try {
      if (path === "/admin" || path === "/admin/") {
        if (!await checkAuth(request, DB)) return unauthorized();
        return new Response(ADMIN_HTML, {
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...securityHeaders() }
        });
      }
      if (path === "/api/menu") {
        if (method !== "GET") return methodNotAllowed("GET", request);
        const cats = await DB.prepare("SELECT * FROM categories WHERE active=1 ORDER BY sort_order, id").all();
        const items = await DB.prepare("SELECT * FROM menu_items WHERE available=1 ORDER BY sort_order, id").all();
        const menu = cats.results.map((c) => ({
          ...c,
          items: items.results.filter((i) => i.category_id === c.id)
        }));
        return json(menu, 200, request);
      }
      if (path === "/api/reviews" && method === "GET") {
        const reviews = await DB.prepare("SELECT * FROM reviews WHERE approved=1 ORDER BY created_at DESC").all();
        return json(reviews.results);
      }
      if (path === "/api/reviews" && method === "POST") {
        const body = await request.json();
        const name = clean(body.name, 60);
        const rating = parseInt(body.rating) || 0;
        const comment = clean(body.comment, 500);
        if (!name || rating < 1 || rating > 5) return json({ error: "Invalid input" }, 400);
        const result = await DB.prepare(
          "INSERT INTO reviews (name, rating, comment, approved) VALUES (?, ?, ?, 0)"
        ).bind(name, rating, comment).run();
        return json({ success: true, id: result.meta.last_row_id });
      }
      if (path === "/api/reviews") return methodNotAllowed("GET, POST", request);
      if (path === "/api/gallery") {
        if (method !== "GET") return methodNotAllowed("GET", request);
        const photos = await DB.prepare("SELECT * FROM gallery_photos ORDER BY sort_order").all();
        return json(photos.results);
      }
      if (path === "/api/settings") {
        if (method !== "GET") return methodNotAllowed("GET", request);
        const PUBLIC_KEYS = ["cafe_name", "tagline", "address", "whatsapp", "instagram", "open_hours", "promo_text", "promo_emoji", "promo_active"];
        const marks = PUBLIC_KEYS.map(() => "?").join(",");
        const settings = await DB.prepare("SELECT key, value FROM settings WHERE key IN (" + marks + ")").bind(...PUBLIC_KEYS).all();
        const obj = {};
        settings.results.forEach((s) => {
          obj[s.key] = s.value;
        });
        return json(obj);
      }
      if (path === "/api/orders" && method === "POST") {
        const body = await request.json();
        const name = clean(body.name, 60);
        const tableNum = clean(body.table, 20);
        const phone = clean(body.phone, 20);
        const submittedItems = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
        const notes = clean(body.notes, 200);
        if (!name || !tableNum || !submittedItems.length) return json({ error: "Name, table and items required" }, 400, request);
        const items = [];
        let total = 0;
        for (const submitted of submittedItems) {
          const qty = Number(submitted && submitted.qty);
          if (!Number.isInteger(qty) || qty < 1 || qty > 99) return json({ error: "Invalid item quantity" }, 400, request);
          const id = Number(submitted && (submitted.id ?? submitted.menu_id));
          const submittedName = clean(submitted && submitted.name, 100);
          let menuItem;
          if (Number.isInteger(id) && id > 0) {
            menuItem = await DB.prepare("SELECT id, name, price FROM menu_items WHERE id=? AND available=1").bind(id).first();
          } else if (submittedName) {
            menuItem = await DB.prepare("SELECT id, name, price FROM menu_items WHERE name=? AND available=1").bind(submittedName).first();
          }
          if (!menuItem) return json({ error: "Invalid or unavailable menu item" }, 400, request);
          const price = Number(menuItem.price);
          if (!Number.isFinite(price) || price < 0) return json({ error: "Invalid menu price" }, 500, request);
          items.push({ id: menuItem.id, name: clean(menuItem.name, 100), price, qty });
          total += price * qty;
          if (!Number.isSafeInteger(total) || total > 1e8) return json({ error: "Order total exceeds limit" }, 400, request);
        }
        const result = await DB.prepare(
          "INSERT INTO orders (name, table_num, phone, items, total, notes) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(name, tableNum, phone, JSON.stringify(items), total, notes).run();
        return json({ success: true, id: result.meta.last_row_id });
      }
      if (path === "/api/orders") return methodNotAllowed("POST", request);
      if (path.startsWith("/api/admin/")) {
        if (!await checkAuth(request, DB)) return unauthorized();
        if (path === "/api/admin/stats") {
          const mc = await DB.prepare("SELECT COUNT(*) as c FROM menu_items").first();
          const cc = await DB.prepare("SELECT COUNT(*) as c FROM categories").first();
          const rc = await DB.prepare("SELECT COUNT(*) as c FROM reviews").first();
          const oc = await DB.prepare("SELECT COUNT(*) as c FROM orders").first();
          return json({ menu_count: mc.c, category_count: cc.c, review_count: rc.c, order_count: oc.c });
        }
        if (path === "/api/admin/menu" && method === "GET") {
          const items = await DB.prepare("SELECT * FROM menu_items ORDER BY sort_order, id").all();
          return json(items.results);
        }
        if (path === "/api/admin/menu" && method === "POST") {
          const body = await request.json();
          const name = clean(body.name, 100);
          const desc = clean(body.description, 500);
          const price = Number(body.price);
          const catId = Number(body.category_id);
          const position = sortOrder(body.sort_order ?? 0);
          const imageUrl = safeUrl(body.image_url);
          if (!name) return json({ error: "Name required" }, 400, request);
          if (!Number.isFinite(price) || price < 0 || price > 999999) return json({ error: "Invalid price" }, 400, request);
          if (!Number.isInteger(catId) || catId < 1) return json({ error: "Category required" }, 400, request);
          if (position === null) return json({ error: "sort_order must be a non-negative integer" }, 400, request);
          if (!await DB.prepare("SELECT id FROM categories WHERE id=?").bind(catId).first()) return json({ error: "Category not found" }, 400, request);
          if (imageUrl === null) return json({ error: "Image must be a valid http/https URL or a data URL no larger than 50KB" }, 400, request);
          const results = await DB.batch([
            DB.prepare("UPDATE menu_items SET sort_order=sort_order+1 WHERE category_id=? AND sort_order>=?").bind(catId, position),
            DB.prepare("INSERT INTO menu_items (category_id, name, description, price, image_url, available, popular, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(catId, name, desc, price, imageUrl, body.available === void 0 ? 1 : body.available ? 1 : 0, body.popular ? 1 : 0, position)
          ]);
          const result = results[1];
          return json({ success: true, id: result.meta.last_row_id });
        }
        const menuMatch = path.match(/^\/api\/admin\/menu\/(\d+)$/);
        if (menuMatch) {
          const id = menuMatch[1];
          if (method === "PUT") {
            const body = await request.json();
            const existing = await DB.prepare("SELECT id, category_id, sort_order FROM menu_items WHERE id=?").bind(id).first();
            if (!existing) return json({ error: "Menu item not found" }, 404, request);
            const fields = [];
            const values = [];
            if (body.name !== void 0) {
              const name = clean(body.name, 100);
              if (!name) return json({ error: "Name required" }, 400, request);
              fields.push("name=?");
              values.push(name);
            }
            if (body.description !== void 0) {
              fields.push("description=?");
              values.push(clean(body.description, 500));
            }
            if (body.image_url !== void 0) {
              const imageUrl = safeUrl(body.image_url);
              if (imageUrl === null) return json({ error: "Image must be a valid http/https URL or a data URL no larger than 50KB" }, 400, request);
              fields.push("image_url=?");
              values.push(imageUrl);
            }
            if (body.price !== void 0) {
              const price = Number(body.price);
              if (!Number.isFinite(price) || price < 0 || price > 999999) return json({ error: "Invalid price" }, 400, request);
              fields.push("price=?");
              values.push(price);
            }
            const targetCategory = body.category_id === void 0 ? existing.category_id : Number(body.category_id);
            if (!Number.isInteger(targetCategory) || targetCategory < 1 || !await DB.prepare("SELECT id FROM categories WHERE id=?").bind(targetCategory).first()) {
              return json({ error: "Category not found" }, 400, request);
            }
            if (body.category_id !== void 0) {
              fields.push("category_id=?");
              values.push(targetCategory);
            }
            let position;
            if (body.sort_order !== void 0) {
              position = sortOrder(body.sort_order);
              if (position === null) return json({ error: "sort_order must be a non-negative integer" }, 400, request);
              fields.push("sort_order=?");
              values.push(position);
            }
            ["available", "popular"].forEach((k) => {
              if (body[k] !== void 0) {
                fields.push(k + "=?");
                values.push(body[k] ? 1 : 0);
              }
            });
            if (fields.length) {
              fields.push("updated_at=datetime('now', '+7 hours')");
              values.push(id);
              const statements = [];
              if (position !== void 0 && (position !== existing.sort_order || targetCategory !== existing.category_id)) {
                statements.push(DB.prepare("UPDATE menu_items SET sort_order=sort_order+1 WHERE category_id=? AND sort_order>=? AND id<>?").bind(targetCategory, position, id));
              }
              statements.push(DB.prepare("UPDATE menu_items SET " + fields.join(",") + " WHERE id=?").bind(...values));
              await DB.batch(statements);
            }
            return json({ success: true });
          }
          if (method === "DELETE") {
            const deletedItem = await DB.prepare("SELECT category_id, sort_order FROM menu_items WHERE id=?").bind(id).first();
            if (!deletedItem) return json({ error: "Menu item not found" }, 404, request);
            await DB.prepare("DELETE FROM menu_items WHERE id=?").bind(id).run();
            await DB.prepare("UPDATE menu_items SET sort_order = sort_order - 1 WHERE category_id=? AND sort_order > ?").bind(deletedItem.category_id, deletedItem.sort_order).run();
            return json({ success: true });
          }
        }
        if (path === "/api/admin/categories" && method === "GET") {
          const cats = await DB.prepare("SELECT * FROM categories ORDER BY sort_order, id").all();
          return json(cats.results);
        }
        if (path === "/api/admin/categories" && method === "POST") {
          const body = await request.json();
          const name = clean(body.name, 50);
          const slug = clean(body.slug, 50).toLowerCase().replace(/[^a-z0-9-]/g, "-");
          const position = sortOrder(body.sort_order ?? 0);
          if (!name || !slug) return json({ error: "Name and slug required" }, 400);
          if (position === null) return json({ error: "sort_order must be a non-negative integer" }, 400, request);
          const results = await DB.batch([
            DB.prepare("UPDATE categories SET sort_order=sort_order+1 WHERE sort_order>=?").bind(position),
            DB.prepare("INSERT INTO categories (name, slug, sort_order, active) VALUES (?, ?, ?, ?)").bind(name, slug, position, body.active === void 0 ? 1 : body.active ? 1 : 0)
          ]);
          const result = results[1];
          return json({ success: true, id: result.meta.last_row_id });
        }
        const catMatch = path.match(/^\/api\/admin\/categories\/(\d+)$/);
        if (catMatch) {
          const id = catMatch[1];
          if (method === "PUT") {
            const body = await request.json();
            const existing = await DB.prepare("SELECT id, sort_order FROM categories WHERE id=?").bind(id).first();
            if (!existing) return json({ error: "Category not found" }, 404, request);
            const fields = [];
            const values = [];
            if (body.name !== void 0) {
              const name = clean(body.name, 50);
              if (!name) return json({ error: "Name required" }, 400, request);
              fields.push("name=?");
              values.push(name);
            }
            if (body.slug !== void 0) {
              const slug = clean(body.slug, 50).toLowerCase().replace(/[^a-z0-9-]/g, "-");
              if (!slug) return json({ error: "Slug required" }, 400, request);
              fields.push("slug=?");
              values.push(slug);
            }
            let position;
            if (body.sort_order !== void 0) {
              position = sortOrder(body.sort_order);
              if (position === null) return json({ error: "sort_order must be a non-negative integer" }, 400, request);
              fields.push("sort_order=?");
              values.push(position);
            }
            if (body.active !== void 0) {
              fields.push("active=?");
              values.push(body.active ? 1 : 0);
            }
            if (fields.length) {
              values.push(id);
              const statements = [];
              if (position !== void 0 && position !== existing.sort_order) {
                statements.push(DB.prepare("UPDATE categories SET sort_order=sort_order+1 WHERE sort_order>=? AND id<>?").bind(position, id));
              }
              statements.push(DB.prepare("UPDATE categories SET " + fields.join(",") + " WHERE id=?").bind(...values));
              await DB.batch(statements);
            }
            return json({ success: true });
          }
          if (method === "DELETE") {
            if (!await DB.prepare("SELECT id FROM categories WHERE id=?").bind(id).first()) return json({ error: "Category not found" }, 404, request);
            const menuCount = await DB.prepare("SELECT COUNT(*) AS count FROM menu_items WHERE category_id=?").bind(id).first();
            if (menuCount.count > 0) return json({ error: "Category still contains menu items" }, 409, request);
            const deletedCat = await DB.prepare("SELECT sort_order FROM categories WHERE id=?").bind(id).first();
            if (!deletedCat) return json({ error: "Category not found" }, 404, request);
            await DB.prepare("DELETE FROM categories WHERE id=?").bind(id).run();
            await DB.prepare("UPDATE categories SET sort_order = sort_order - 1 WHERE sort_order > ?").bind(deletedCat.sort_order).run();
            return json({ success: true });
          }
        }
        if (path === "/api/admin/reviews" && method === "GET") {
          const reviews = await DB.prepare("SELECT * FROM reviews ORDER BY created_at DESC").all();
          return json(reviews.results);
        }
        const reviewMatch = path.match(/^\/api\/admin\/reviews\/(\d+)$/);
        if (reviewMatch) {
          const id = reviewMatch[1];
          if (method === "PUT") {
            const body = await request.json();
            if (body.approved !== void 0) await DB.prepare("UPDATE reviews SET approved=? WHERE id=?").bind(body.approved ? 1 : 0, id).run();
            if (body.name !== void 0) await DB.prepare("UPDATE reviews SET name=? WHERE id=?").bind(clean(body.name, 60), id).run();
            if (body.comment !== void 0) await DB.prepare("UPDATE reviews SET comment=? WHERE id=?").bind(clean(body.comment, 500), id).run();
            return json({ success: true });
          }
          if (method === "DELETE") {
            const result = await DB.prepare("DELETE FROM reviews WHERE id=?").bind(id).run();
            if (!result.meta.changes) return json({ error: "Review not found" }, 404, request);
            return json({ success: true });
          }
        }
        if (path === "/api/admin/gallery" && method === "GET") {
          const photos = await DB.prepare("SELECT * FROM gallery_photos ORDER BY sort_order").all();
          return json(photos.results);
        }
        if (path === "/api/admin/gallery" && method === "POST") {
          const body = await request.json();
          const url2 = safeUrl(body.url);
          const caption = clean(body.caption, 200);
          if (!url2) return json({ error: "A valid http/https URL is required" }, 400, request);
          const result = await DB.prepare("INSERT INTO gallery_photos (url, caption, sort_order) VALUES (?, ?, ?)").bind(url2, caption, parseInt(body.sort_order) || 0).run();
          return json({ success: true, id: result.meta.last_row_id });
        }
        const galleryMatch = path.match(/^\/api\/admin\/gallery\/(\d+)$/);
        if (galleryMatch) {
          const id = galleryMatch[1];
          if (method === "DELETE") {
            const result = await DB.prepare("DELETE FROM gallery_photos WHERE id=?").bind(id).run();
            if (!result.meta.changes) return json({ error: "Gallery photo not found" }, 404, request);
            return json({ success: true });
          }
        }
        if (path === "/api/admin/orders" && method === "GET") {
          const orders = await DB.prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
          const parsed = orders.results.map((o) => ({ ...o, items: parseItems(o.items) }));
          return json(parsed);
        }
        const orderMatch = path.match(/^\/api\/admin\/orders\/(\d+)\/status$/);
        if (orderMatch) {
          const id = orderMatch[1];
          if (method === "PUT") {
            const body = await request.json();
            const status = clean(body.status, 20);
            if (!["pending", "confirmed", "completed", "cancelled"].includes(status)) return json({ error: "Invalid order status" }, 400, request);
            const result = await DB.prepare("UPDATE orders SET status=? WHERE id=?").bind(status, id).run();
            if (!result.meta.changes) return json({ error: "Order not found" }, 404, request);
            return json({ success: true });
          }
        }
        const orderDeleteMatch = path.match(/^\/api\/admin\/orders\/(\d+)$/);
        if (orderDeleteMatch && method === "DELETE") {
          const id = orderDeleteMatch[1];
          const result = await DB.prepare("DELETE FROM orders WHERE id=?").bind(id).run();
          if (!result.meta.changes) return json({ error: "Order not found" }, 404, request);
          return json({ success: true });
        }
        if (path === "/api/admin/settings" && method === "GET") {
          const settings = await DB.prepare("SELECT key, value FROM settings WHERE key != 'admin_pass'").all();
          const obj = {};
          settings.results.forEach((s) => {
            obj[s.key] = s.value;
          });
          return json(obj);
        }
        if (path === "/api/admin/settings" && method === "PUT") {
          const body = await request.json();
          const ALLOWED = ["cafe_name", "tagline", "address", "whatsapp", "instagram", "open_hours", "promo_text", "promo_emoji", "promo_active", "admin_user", "admin_pass"];
          for (const [key, value] of Object.entries(body)) {
            if (!ALLOWED.includes(key)) continue;
            const safeVal = String(value || "").replace(/<[^>]*>/g, "").substring(0, 200);
            await DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=?").bind(key, safeVal, safeVal).run();
          }
          return json({ success: true });
        }
      }
      return new Response("Not Found", { status: 404, headers: securityHeaders({ ...corsHeaders(request) }) });
    } catch (e) {
      console.error(e);
      return json({ error: "Internal server error" }, 500, request);
    }
  }
};
var ADMIN_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mazalat Cafe \u2014 Admin Panel</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/remixicon@4.6.0/fonts/remixicon.css" rel="stylesheet">
<style>
:root {
  --cream: #f5efe6;
  --cream-light: #faf6f0;
  --terracotta: #b85428;
  --terracotta-dark: #9a4420;
  --terracotta-soft: rgba(184, 84, 40, 0.1);
  --espresso: #2c1810;
  --sage: #5a7a62;
  --copper: #c08552;
  --border: #e8dfd0;
  --text-muted: #7a6e5f;
  --white: #fffdf9;
  --danger: #c0392b;
  --success: #27ae60;
  --warning: #e67e22;
  --info: #2980b9;
  --sidebar-w: 260px;
  --radius: 12px;
  --shadow: 0 2px 12px rgba(44, 24, 16, 0.06);
  --shadow-md: 0 4px 24px rgba(44, 24, 16, 0.1);
  --transition: 0.2s ease;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html { font-size: 15px; }

body {
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  background: var(--cream);
  color: var(--espresso);
  line-height: 1.55;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3, h4, .serif {
  font-family: 'Cormorant Garamond', Georgia, serif;
  font-weight: 600;
}

a { color: inherit; text-decoration: none; }
button { font-family: inherit; cursor: pointer; border: none; background: none; }
input, select, textarea { font-family: inherit; font-size: 0.95rem; }
img { max-width: 100%; display: block; }

/* \u2500\u2500\u2500 LOGIN \u2500\u2500\u2500 */
#loginPage {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--cream);
  padding: 24px;
  position: relative;
  overflow: hidden;
}

#loginPage::before {
  content: '';
  position: absolute;
  top: -20%;
  right: -10%;
  width: 500px;
  height: 500px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(184, 84, 40, 0.08) 0%, transparent 70%);
  pointer-events: none;
}

#loginPage::after {
  content: '';
  position: absolute;
  bottom: -15%;
  left: -8%;
  width: 400px;
  height: 400px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(192, 133, 82, 0.07) 0%, transparent 70%);
  pointer-events: none;
}

.login-card {
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 48px 40px;
  width: 100%;
  max-width: 420px;
  box-shadow: var(--shadow-md);
  position: relative;
  z-index: 1;
}

.login-brand {
  text-align: center;
  margin-bottom: 36px;
}

.login-brand h1 {
  font-size: 2.6rem;
  color: var(--espresso);
  letter-spacing: 0.02em;
  line-height: 1.1;
}

.login-brand h1 span {
  color: var(--terracotta);
}

.login-brand p {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin-top: 6px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 500;
}

.login-card .form-group { margin-bottom: 18px; }

.login-card label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 6px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.login-card input {
  width: 100%;
  padding: 12px 16px;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  background: var(--cream-light);
  color: var(--espresso);
  transition: border-color var(--transition), box-shadow var(--transition);
  outline: none;
}

.login-card input:focus {
  border-color: var(--terracotta);
  box-shadow: 0 0 0 3px var(--terracotta-soft);
  background: var(--white);
}

.login-card .btn-primary {
  width: 100%;
  margin-top: 8px;
  padding: 14px;
  font-size: 0.95rem;
}

#loginError {
  display: none;
  background: rgba(192, 57, 43, 0.08);
  color: var(--danger);
  border: 1px solid rgba(192, 57, 43, 0.2);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 0.85rem;
  margin-bottom: 16px;
  text-align: center;
}

/* \u2500\u2500\u2500 APP LAYOUT \u2500\u2500\u2500 */
#appPage {
  display: none;
  min-height: 100vh;
}

.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  width: var(--sidebar-w);
  height: 100vh;
  background: var(--cream-light);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  z-index: 100;
  transition: transform 0.3s ease;
}

.sidebar-brand {
  padding: 28px 24px 20px;
  border-bottom: 1px solid var(--border);
}

.sidebar-brand h2 {
  font-size: 1.8rem;
  color: var(--espresso);
  line-height: 1.1;
}

.sidebar-brand h2 span { color: var(--terracotta); }

.sidebar-brand small {
  display: block;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-top: 4px;
}

.sidebar-nav {
  flex: 1;
  padding: 16px 12px;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 16px;
  border-radius: 10px;
  color: var(--text-muted);
  font-size: 0.9rem;
  font-weight: 500;
  margin-bottom: 2px;
  transition: all var(--transition);
  cursor: pointer;
}

.nav-item i {
  font-size: 1.2rem;
  width: 22px;
  text-align: center;
}

.nav-item:hover {
  background: rgba(184, 84, 40, 0.06);
  color: var(--espresso);
}

.nav-item.active {
  background: var(--terracotta);
  color: #fff;
  box-shadow: 0 2px 8px rgba(184, 84, 40, 0.3);
}

.sidebar-footer {
  padding: 12px;
  border-top: 1px solid var(--border);
}

.nav-item.logout {
  color: var(--danger);
}

.nav-item.logout:hover {
  background: rgba(192, 57, 43, 0.08);
  color: var(--danger);
}

.main {
  margin-left: var(--sidebar-w);
  min-height: 100vh;
  padding: 28px 32px 48px;
  background: var(--cream);
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28px;
}

.topbar h1 {
  font-size: 1.9rem;
  color: var(--espresso);
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.hamburger {
  display: none;
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--white);
  color: var(--espresso);
  font-size: 1.3rem;
}

.sidebar-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(44, 24, 16, 0.4);
  z-index: 99;
}

/* \u2500\u2500\u2500 PAGES \u2500\u2500\u2500 */
.page { display: none; }
.page.active { display: block; }

/* \u2500\u2500\u2500 CARDS & STATS \u2500\u2500\u2500 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 28px;
}

.stat-card {
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 22px 20px;
  box-shadow: var(--shadow);
  transition: transform var(--transition), box-shadow var(--transition);
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.stat-card .stat-icon {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  margin-bottom: 14px;
}

.stat-card .stat-icon.menu { background: var(--terracotta-soft); color: var(--terracotta); }
.stat-card .stat-icon.orders { background: rgba(41, 128, 185, 0.1); color: var(--info); }
.stat-card .stat-icon.revenue { background: rgba(39, 174, 96, 0.1); color: var(--success); }
.stat-card .stat-icon.pending { background: rgba(230, 126, 34, 0.1); color: var(--warning); }

.stat-card .stat-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 4px;
}

.stat-card .stat-value {
  font-family: 'Cormorant Garamond', serif;
  font-size: 2rem;
  font-weight: 700;
  color: var(--espresso);
  line-height: 1.15;
}

.card {
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px;
  border-bottom: 1px solid var(--border);
}

.card-header h3 {
  font-size: 1.25rem;
  color: var(--espresso);
}

.card-body { padding: 22px; }

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

/* \u2500\u2500\u2500 BUTTONS \u2500\u2500\u2500 */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 0.875rem;
  font-weight: 600;
  transition: all var(--transition);
  white-space: nowrap;
  line-height: 1.3;
}

.btn i { font-size: 1.05rem; }

.btn-primary {
  background: var(--terracotta);
  color: #fff;
  box-shadow: 0 2px 6px rgba(184, 84, 40, 0.25);
}

.btn-primary:hover {
  background: var(--terracotta-dark);
  box-shadow: 0 3px 10px rgba(184, 84, 40, 0.35);
}

.btn-ghost {
  background: transparent;
  color: var(--espresso);
  border: 1.5px solid var(--border);
}

.btn-ghost:hover {
  border-color: var(--copper);
  background: var(--cream-light);
}

.btn-danger {
  background: var(--danger);
  color: #fff;
}

.btn-danger:hover { background: #a93226; }

.btn-sm {
  padding: 6px 12px;
  font-size: 0.8rem;
  border-radius: 8px;
}

.btn-icon {
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  border: 1px solid var(--border);
  color: var(--text-muted);
  transition: all var(--transition);
}

.btn-icon:hover {
  background: var(--cream-light);
  color: var(--espresso);
  border-color: var(--copper);
}

.btn-icon.edit:hover { color: var(--info); border-color: var(--info); }
.btn-icon.delete:hover { color: var(--danger); border-color: var(--danger); }

/* \u2500\u2500\u2500 FORMS \u2500\u2500\u2500 */
.form-group { margin-bottom: 16px; }

.form-group label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 6px;
  letter-spacing: 0.02em;
}

.form-control {
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  background: var(--cream-light);
  color: var(--espresso);
  outline: none;
  transition: border-color var(--transition), box-shadow var(--transition);
}

.form-control:focus {
  border-color: var(--terracotta);
  box-shadow: 0 0 0 3px var(--terracotta-soft);
  background: var(--white);
}

textarea.form-control {
  resize: vertical;
  min-height: 80px;
}

select.form-control {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%237a6e5f' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
  padding-right: 36px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.form-check {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.form-check input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--terracotta);
  cursor: pointer;
}

.form-check span {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--espresso);
}

/* \u2500\u2500\u2500 TABLES \u2500\u2500\u2500 */
.table-wrap { overflow-x: auto; }

table {
  width: 100%;
  border-collapse: collapse;
}

thead th {
  text-align: left;
  padding: 12px 16px;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1.5px solid var(--border);
  background: var(--cream-light);
  white-space: nowrap;
}

tbody td {
  padding: 13px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 0.9rem;
  vertical-align: middle;
}

tbody tr {
  transition: background var(--transition);
}

tbody tr:hover {
  background: var(--cream-light);
}

tbody tr:last-child td { border-bottom: none; }

/* \u2500\u2500\u2500 BADGES \u2500\u2500\u2500 */
.badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.badge-pending { background: rgba(230, 126, 34, 0.12); color: var(--warning); }
.badge-confirmed { background: rgba(41, 128, 185, 0.12); color: var(--info); }
.badge-completed { background: rgba(39, 174, 96, 0.12); color: var(--success); }
.badge-cancelled { background: rgba(192, 57, 43, 0.12); color: var(--danger); }
.badge-active { background: rgba(39, 174, 96, 0.12); color: var(--success); }
.badge-inactive { background: rgba(122, 110, 95, 0.12); color: var(--text-muted); }
.badge-approved { background: rgba(39, 174, 96, 0.12); color: var(--success); }

/* \u2500\u2500\u2500 REVIEWS \u2500\u2500\u2500 */
.review-rating {
  color: var(--copper);
  white-space: nowrap;
  letter-spacing: 1px;
}

.review-comment {
  min-width: 220px;
  max-width: 420px;
  white-space: normal;
  overflow-wrap: anywhere;
  color: var(--text-muted);
}

.review-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  white-space: nowrap;
}

/* \u2500\u2500\u2500 TOGGLE SWITCH \u2500\u2500\u2500 */
.toggle {
  position: relative;
  width: 40px;
  height: 22px;
  display: inline-block;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle .slider {
  position: absolute;
  inset: 0;
  background: var(--border);
  border-radius: 22px;
  cursor: pointer;
  transition: background var(--transition);
}

.toggle .slider::before {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform var(--transition);
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}

.toggle input:checked + .slider {
  background: var(--sage);
}

.toggle input:checked + .slider::before {
  transform: translateX(18px);
}

/* \u2500\u2500\u2500 FILTER TABS \u2500\u2500\u2500 */
.filter-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.filter-tab {
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
  border: 1.5px solid var(--border);
  background: var(--white);
  transition: all var(--transition);
  cursor: pointer;
}

.filter-tab:hover {
  border-color: var(--copper);
  color: var(--espresso);
}

.filter-tab.active {
  background: var(--terracotta);
  border-color: var(--terracotta);
  color: #fff;
}

/* \u2500\u2500\u2500 TOOLBAR \u2500\u2500\u2500 */
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.toolbar .search-box {
  position: relative;
  flex: 1;
  min-width: 200px;
  max-width: 320px;
}

.toolbar .search-box i {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-size: 1.05rem;
}

.toolbar .search-box input {
  width: 100%;
  padding: 10px 14px 10px 38px;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  background: var(--white);
  color: var(--espresso);
  outline: none;
  transition: border-color var(--transition);
}

.toolbar .search-box input:focus {
  border-color: var(--terracotta);
  box-shadow: 0 0 0 3px var(--terracotta-soft);
}

.toolbar select {
  padding: 10px 36px 10px 14px;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  background: var(--white);
  color: var(--espresso);
  outline: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%237a6e5f' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  min-width: 160px;
  cursor: pointer;
}

.toolbar select:focus {
  border-color: var(--terracotta);
}

/* \u2500\u2500\u2500 CATEGORY GRID \u2500\u2500\u2500 */
.cat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.cat-card {
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 22px;
  box-shadow: var(--shadow);
  transition: transform var(--transition), box-shadow var(--transition);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.cat-card .cat-icon-wrap {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--terracotta-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  color: var(--terracotta);
}

.cat-card h4 {
  font-size: 1.2rem;
  color: var(--espresso);
}

.cat-card .cat-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.cat-card .cat-actions {
  display: flex;
  gap: 6px;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

/* \u2500\u2500\u2500 MODALS \u2500\u2500\u2500 */
.modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(44, 24, 16, 0.45);
  z-index: 200;
  align-items: center;
  justify-content: center;
  padding: 20px;
  backdrop-filter: blur(3px);
}

.modal-overlay.open {
  display: flex;
}

.modal {
  background: var(--white);
  border-radius: 16px;
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 16px 48px rgba(44, 24, 16, 0.18);
  animation: modalIn 0.25s ease;
}

@keyframes modalIn {
  from { opacity: 0; transform: translateY(16px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  font-size: 1.35rem;
  color: var(--espresso);
}

.modal-close {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  color: var(--text-muted);
  transition: all var(--transition);
}

.modal-close:hover {
  background: var(--cream);
  color: var(--espresso);
}

.modal-body { padding: 24px; }

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
}

/* Image upload */
.image-upload-area {
  border: 2px dashed var(--border);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  transition: border-color var(--transition);
  cursor: pointer;
  position: relative;
}

.image-upload-area:hover {
  border-color: var(--copper);
}

.image-upload-area input[type="file"] {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.image-remove-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 50%;
  background: var(--danger);
  color: #fff;
  cursor: pointer;
  font-size: 1.25rem;
  line-height: 1;
  display: none;
}

.image-upload-area .upload-placeholder {
  color: var(--text-muted);
  font-size: 0.85rem;
}

.image-upload-area .upload-placeholder i {
  font-size: 2rem;
  display: block;
  margin-bottom: 8px;
  color: var(--copper);
}

#itemImagePreview {
  max-width: 100%;
  max-height: 160px;
  margin: 0 auto 8px;
  border-radius: 8px;
  display: none;
}

#itemImageStatus {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 6px;
}

/* \u2500\u2500\u2500 PROMO PREVIEW \u2500\u2500\u2500 */
.promo-preview {
  background: var(--espresso);
  color: #fff;
  border-radius: 12px;
  padding: 18px 24px;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

.promo-preview .pp-emoji {
  font-size: 1.5rem;
}

.promo-preview .pp-text {
  font-size: 0.95rem;
  font-weight: 500;
}

/* \u2500\u2500\u2500 TOAST \u2500\u2500\u2500 */
#toastContainer {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 999;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toast {
  background: var(--espresso);
  color: #fff;
  padding: 12px 20px;
  border-radius: 10px;
  font-size: 0.875rem;
  font-weight: 500;
  box-shadow: 0 6px 20px rgba(44, 24, 16, 0.25);
  display: flex;
  align-items: center;
  gap: 10px;
  animation: toastIn 0.3s ease;
  min-width: 260px;
  max-width: 380px;
}

.toast.success { background: var(--sage); }
.toast.error { background: var(--danger); }
.toast.warning { background: var(--warning); }

.toast i { font-size: 1.15rem; }

@keyframes toastIn {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

/* \u2500\u2500\u2500 EMPTY STATE \u2500\u2500\u2500 */
.empty-state {
  text-align: center;
  padding: 48px 20px;
  color: var(--text-muted);
}

.empty-state i {
  font-size: 2.5rem;
  display: block;
  margin-bottom: 12px;
  opacity: 0.4;
}

.empty-state p {
  font-size: 0.9rem;
}

/* \u2500\u2500\u2500 MENU THUMB \u2500\u2500\u2500 */
.menu-thumb {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  object-fit: cover;
  background: var(--cream);
  border: 1px solid var(--border);
}

.menu-thumb-placeholder {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  background: var(--cream);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 1.1rem;
}

/* \u2500\u2500\u2500 STATUS SELECT \u2500\u2500\u2500 */
.status-select {
  padding: 5px 10px;
  border-radius: 8px;
  border: 1.5px solid var(--border);
  font-size: 0.8rem;
  font-weight: 600;
  background: var(--cream-light);
  color: var(--espresso);
  outline: none;
  cursor: pointer;
}

.status-select:focus { border-color: var(--terracotta); }

/* \u2500\u2500\u2500 DASHBOARD DATE \u2500\u2500\u2500 */
.dash-date {
  font-size: 0.85rem;
  color: var(--text-muted);
  font-weight: 500;
}

/* \u2500\u2500\u2500 SETTINGS FORM \u2500\u2500\u2500 */
.settings-form {
  max-width: 560px;
}

/* \u2500\u2500\u2500 POPULAR LIST \u2500\u2500\u2500 */
.popular-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}

.popular-item:last-child { border-bottom: none; }

.popular-item .pi-name {
  font-weight: 500;
  font-size: 0.9rem;
}

.popular-item .pi-count {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--terracotta);
  background: var(--terracotta-soft);
  padding: 2px 10px;
  border-radius: 12px;
}

/* \u2500\u2500\u2500 RECENT ORDERS \u2500\u2500\u2500 */
.recent-order {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 0;
  border-bottom: 1px solid var(--border);
  gap: 12px;
}

.recent-order:last-child { border-bottom: none; }

.recent-order .ro-info {
  flex: 1;
  min-width: 0;
}

.recent-order .ro-name {
  font-weight: 600;
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-order .ro-meta {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin-top: 2px;
}

.recent-order .ro-total {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--espresso);
  white-space: nowrap;
}

/* \u2500\u2500\u2500 PRICE \u2500\u2500\u2500 */
.price {
  font-weight: 600;
  color: var(--terracotta);
  white-space: nowrap;
}

/* \u2500\u2500\u2500 ACTIONS CELL \u2500\u2500\u2500 */
.actions-cell {
  display: flex;
  gap: 4px;
  align-items: center;
}

/* \u2500\u2500\u2500 RESPONSIVE \u2500\u2500\u2500 */
@media (max-width: 1100px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 900px) {
  .grid-2 { grid-template-columns: 1fr; }
}

@media (max-width: 768px) {
  .sidebar {
    transform: translateX(-100%);
  }

  .sidebar.open {
    transform: translateX(0);
  }

  .sidebar-overlay.open {
    display: block;
  }

  .main {
    margin-left: 0;
    padding: 20px 16px 40px;
  }

  .hamburger { display: flex; }

  .stats-grid { grid-template-columns: 1fr 1fr; gap: 10px; }

  .stat-card { padding: 16px 14px; }
  .stat-card .stat-value { font-size: 1.6rem; }

  .topbar h1 { font-size: 1.5rem; }

  .login-card { padding: 36px 24px; }

  .form-row { grid-template-columns: 1fr; }

  .toolbar { flex-direction: column; align-items: stretch; }
  .toolbar .search-box { max-width: none; }
  .toolbar select { width: 100%; }
}

@media (max-width: 480px) {
  .stats-grid { grid-template-columns: 1fr; }
}
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}
</style>
</head>
<body>

<!-- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 LOGIN \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
<div id="loginPage">
  <div class="login-card">
    <div class="login-brand">
      <h1>Maza<span>lat</span></h1>
      <p>Admin Panel</p>
    </div>
    <div id="loginError"></div>
    <div class="form-group">
      <label for="loginUser">Username</label>
      <input type="text" id="loginUser" placeholder="Masukkan username" autocomplete="username">
    </div>
    <div class="form-group">
      <label for="loginPass">Password</label>
      <input type="password" id="loginPass" placeholder="Masukkan password" autocomplete="current-password">
    </div>
    <button class="btn btn-primary" id="loginBtn" onclick="doLogin()">
      <i class="ri-login-box-line"></i> Masuk
    </button>
  </div>
</div>

<!-- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 APP \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
<div id="appPage">
  <div class="sidebar-overlay" id="sidebarOverlay" onclick="closeSidebar()"></div>

  <aside class="sidebar" id="sidebar">
    <div class="sidebar-brand">
      <h2>Maza<span>lat</span></h2>
      <small>Admin Panel</small>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-item active" data-page="dashboard" onclick="navigateTo('dashboard', this)">
        <i class="ri-dashboard-3-line"></i> Dashboard
      </div>
      <div class="nav-item" data-page="menu" onclick="navigateTo('menu', this)">
        <i class="ri-restaurant-2-line"></i> Menu
      </div>
      <div class="nav-item" data-page="categories" onclick="navigateTo('categories', this)">
        <i class="ri-folder-3-line"></i> Kategori
      </div>
      <div class="nav-item" data-page="orders" onclick="navigateTo('orders', this)">
        <i class="ri-shopping-bag-3-line"></i> Pesanan
      </div>
      <div class="nav-item" data-page="reviews" onclick="navigateTo('reviews', this)">
        <i class="ri-star-smile-line"></i> Ulasan
      </div>
      <div class="nav-item" data-page="promo" onclick="navigateTo('promo', this)">
        <i class="ri-megaphone-line"></i> Promo
      </div>
      <div class="nav-item" data-page="galeri" onclick="navigateTo('galeri', this)">
        <i class="ri-image-line"></i> Galeri
      </div>
      <div class="nav-item" data-page="settings" onclick="navigateTo('settings', this)">
        <i class="ri-settings-3-line"></i> Pengaturan
      </div>
    </nav>
    <div class="sidebar-footer">
      <div class="nav-item logout" onclick="doLogout()">
        <i class="ri-logout-box-r-line"></i> Logout
      </div>
    </div>
  </aside>

  <main class="main">
    <div class="topbar">
      <div style="display:flex;align-items:center;gap:12px">
        <button class="hamburger" onclick="toggleSidebar()" aria-label="Menu">
          <i class="ri-menu-line"></i>
        </button>
        <h1 id="pageTitle">Dashboard</h1>
      </div>
      <div class="topbar-actions">
        <span class="dash-date" id="dashDate"></span>
      </div>
    </div>

    <!-- \u2500\u2500 DASHBOARD \u2500\u2500 -->
    <div class="page active" id="page-dashboard">
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon menu"><i class="ri-restaurant-2-line"></i></div>
          <div class="stat-label">Total Menu</div>
          <div class="stat-value" id="statMenu">\u2014</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon orders"><i class="ri-shopping-bag-3-line"></i></div>
          <div class="stat-label">Total Pesanan</div>
          <div class="stat-value" id="statOrders">\u2014</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon revenue"><i class="ri-money-dollar-circle-line"></i></div>
          <div class="stat-label">Pendapatan</div>
          <div class="stat-value" id="statRevenue">\u2014</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon pending"><i class="ri-time-line"></i></div>
          <div class="stat-label">Menunggu</div>
          <div class="stat-value" id="statPending">\u2014</div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <h3>Pesanan Terbaru</h3>
          </div>
          <div class="card-body" id="dashRecentOrders">
            <div class="empty-state"><i class="ri-shopping-bag-line"></i><p>Belum ada pesanan</p></div>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <h3>Menu Populer</h3>
          </div>
          <div class="card-body" id="dashPopular">
            <div class="empty-state"><i class="ri-fire-line"></i><p>Belum ada data</p></div>
          </div>
        </div>
      </div>
    </div>

    <!-- \u2500\u2500 MENU \u2500\u2500 -->
    <div class="page" id="page-menu">
      <div class="toolbar">
        <div class="search-box">
          <i class="ri-search-line"></i>
          <input type="text" id="menuSearch" placeholder="Cari menu..." oninput="renderMenuTable()">
        </div>
        <select id="menuCatFilter" onchange="renderMenuTable()">
          <option value="">Semua Kategori</option>
        </select>
        <button class="btn btn-primary" onclick="openMenuModal()">
          <i class="ri-add-line"></i> Tambah Menu
        </button>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Gambar</th>
                <th>Nama</th>
                <th>Kategori</th>
                <th>Harga</th>
                <th>Tersedia</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody id="menuTableBody">
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- \u2500\u2500 CATEGORIES \u2500\u2500 -->
    <div class="page" id="page-categories">
      <div class="toolbar">
        <div style="flex:1"></div>
        <button class="btn btn-primary" onclick="openCatModal()">
          <i class="ri-add-line"></i> Tambah Kategori
        </button>
      </div>
      <div class="cat-grid" id="catGrid"></div>
    </div>

    <!-- \u2500\u2500 ORDERS \u2500\u2500 -->
    <div class="page" id="page-orders">
      <div class="filter-tabs">
        <button class="filter-tab active" onclick="filterOrders(this, '')">Semua</button>
        <button class="filter-tab" onclick="filterOrders(this, 'pending')">Pending</button>
        <button class="filter-tab" onclick="filterOrders(this, 'confirmed')">Confirmed</button>
        <button class="filter-tab" onclick="filterOrders(this, 'completed')">Completed</button>
        <button class="filter-tab" onclick="filterOrders(this, 'cancelled')">Cancelled</button>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Pelanggan</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th>Waktu</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody id="ordersTableBody">
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- \u2500\u2500 REVIEWS \u2500\u2500 -->
    <div class="page" id="page-reviews">
      <div class="card">
        <div class="card-header">
          <h3>Semua Ulasan</h3>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nama</th>
                <th>Rating</th>
                <th>Komentar</th>
                <th>Tanggal</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody id="reviewsTableBody">
              <tr><td colspan="6"><div class="empty-state"><i class="ri-loader-4-line"></i><p>Memuat ulasan...</p></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- \u2500\u2500 PROMO \u2500\u2500 -->
    <div class="page" id="page-promo">
      <div class="card" style="max-width:560px">
        <div class="card-header">
          <h3>Banner Promo</h3>
        </div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-check">
              <input type="checkbox" id="p_active" onchange="updatePromoPreview()">
              <span>Aktifkan Promo Banner</span>
            </label>
          </div>
          <div class="form-group">
            <label for="p_emoji">Emoji</label>
            <input type="text" class="form-control" id="p_emoji" placeholder="e.g. \u{1F389}" oninput="updatePromoPreview()" maxlength="4">
          </div>
          <div class="form-group">
            <label for="p_text">Teks Promo</label>
            <input type="text" class="form-control" id="p_text" placeholder="Diskon spesial hari ini!" oninput="updatePromoPreview()">
          </div>
          <label style="font-size:0.8rem;font-weight:600;color:var(--text-muted);margin-bottom:6px;display:block">Preview</label>
          <div class="promo-preview" id="promoPreview">
            <span class="pp-emoji" id="ppEmoji"></span>
            <span class="pp-text" id="ppText">Teks promo akan muncul di sini</span>
          </div>
          <div style="margin-top:20px">
            <button class="btn btn-primary" onclick="savePromo()">
              <i class="ri-save-line"></i> Simpan Promo
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- \u2500\u2500 GALERI \u2500\u2500 -->
    <div class="page" id="page-galeri">
      <div class="card">
        <div class="card-header">
          <h3>Upload Foto Galeri</h3>
        </div>
        <div class="card-body">
          <div class="form-group">
            <label>Upload Foto</label>
            <input type="file" id="galleryFile" accept="image/*" style="display:block;margin-bottom:8px">
            <button class="btn btn-primary" onclick="uploadGalleryPhoto()">
              <i class="ri-upload-line"></i> Tambah ke Galeri
            </button>
          </div>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-header">
          <h3>Foto Galeri (<span id="galleryCount">0</span>)</h3>
        </div>
        <div class="card-body">
          <div class="gallery-grid" id="galleryAdminGrid">
            <div style="color:var(--text-muted);padding:20px">Memuat...</div>
          </div>
        </div>
      </div>
    </div>

    <!-- \u2500\u2500 SETTINGS \u2500\u2500 -->
    <div class="page" id="page-settings">
      <div class="card settings-form">
        <div class="card-header">
          <h3>Pengaturan Cafe</h3>
        </div>
        <div class="card-body">
          <div class="form-group">
            <label for="setCafeName">Nama Cafe</label>
            <input type="text" class="form-control" id="setCafeName" placeholder="Mazalat Cafe">
          </div>
          <div class="form-group">
            <label for="setTagline">Tagline</label>
            <input type="text" class="form-control" id="setTagline" placeholder="Kopi &amp; Cerita">
          </div>
          <div class="form-group">
            <label for="setAddress">Alamat</label>
            <textarea class="form-control" id="setAddress" placeholder="Alamat lengkap cafe"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="setWhatsapp">WhatsApp</label>
              <input type="text" class="form-control" id="setWhatsapp" placeholder="6281234567890">
            </div>
            <div class="form-group">
              <label for="setInstagram">Instagram</label>
              <input type="text" class="form-control" id="setInstagram" placeholder="@mazalatcafe">
            </div>
          </div>
          <div class="form-group">
            <label for="setHours">Jam Operasional</label>
            <input type="text" class="form-control" id="setHours" placeholder="Sen\u2013Min 08:00\u201322:00">
          </div>
          <button class="btn btn-primary" onclick="saveSettings()">
            <i class="ri-save-line"></i> Simpan Pengaturan
          </button>
        </div>
      </div>
      
      <!-- Ganti Username & Password -->
      <div class="card" style="margin-top:24px">
        <h3 style="margin-bottom:16px"><i class="ri-lock-password-line"></i> Ganti Username & Password</h3>
        <div style="margin-bottom:16px">
          <label style="display:block;font-weight:600;margin-bottom:6px;font-size:0.875rem">Username Baru</label>
          <input type="text" id="newUsername" value="" placeholder="admin" style="width:100%;padding:12px;border:1.5px solid #e8dfd0;border-radius:10px;font-size:1rem">
        </div>
        <div style="margin-bottom:16px">
          <label style="display:block;font-weight:600;margin-bottom:6px;font-size:0.875rem">Password Baru</label>
          <input type="password" id="newPassword" placeholder="Kosongkan jika tidak diubah" style="width:100%;padding:12px;border:1.5px solid #e8dfd0;border-radius:10px;font-size:1rem">
        </div>
        <button onclick="changeAuth()" style="padding:12px 28px;background:#b85428;color:white;border:none;border-radius:100px;font-size:0.875rem;font-weight:600;cursor:pointer">
          <i class="ri-lock-unlock-line"></i> Simpan Username & Password
        </button>
      </div>
      </div>
    </div>
  </main>
</div>

<!-- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 MENU MODAL \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
<div class="modal-overlay" id="menuModal">
  <div class="modal">
    <div class="modal-header">
      <h3 id="modalTitle">Tambah Menu</h3>
      <button class="modal-close" onclick="closeMenuModal()"><i class="ri-close-line"></i></button>
    </div>
    <div class="modal-body">
      <input type="hidden" id="editItemId">
      <div class="form-group">
        <label for="itemName">Nama Menu</label>
        <input type="text" class="form-control" id="itemName" placeholder="Nama menu">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="itemCategory">Kategori</label>
          <select class="form-control" id="itemCategory"></select>
        </div>
        <div class="form-group">
          <label for="itemPrice">Harga (Rp)</label>
          <input type="number" class="form-control" id="itemPrice" placeholder="0" min="0">
        </div>
      </div>
      <div class="form-group">
        <label for="itemSort">Urutan dalam kategori</label>
        <input type="number" class="form-control" id="itemSort" placeholder="0" min="0" value="0">
      </div>
      <div class="form-group">
        <label for="itemDesc">Deskripsi</label>
        <textarea class="form-control" id="itemDesc" placeholder="Deskripsi singkat menu"></textarea>
      </div>
      <div class="form-group">
        <label>Gambar</label>
        <div class="image-upload-area" id="imageUploadArea">
          <img id="itemImagePreview" alt="Preview">
          <button type="button" class="image-remove-btn" id="removeImageBtn" onclick="event.stopPropagation(); removeImage()" aria-label="Hapus gambar" title="Hapus gambar">&times;</button>
          <div class="upload-placeholder" id="uploadPlaceholder">
            <i class="ri-image-add-line"></i>
            Klik atau seret gambar ke sini
          </div>
          <input type="file" id="itemImageFile" accept="image/*" onchange="handleImageUpload(this)">
        </div>
        <input type="hidden" id="itemImage">
        <div id="itemImageStatus"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeMenuModal()">Batal</button>
      <button class="btn btn-primary" onclick="saveMenuItem()">
        <i class="ri-save-line"></i> Simpan
      </button>
    </div>
  </div>
</div>

<!-- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 CATEGORY MODAL \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
<div class="modal-overlay" id="catModal">
  <div class="modal">
    <div class="modal-header">
      <h3 id="catModalTitle">Tambah Kategori</h3>
      <button class="modal-close" onclick="closeCatModal()"><i class="ri-close-line"></i></button>
    </div>
    <div class="modal-body">
      <input type="hidden" id="catEditId">
      <div class="form-group">
        <label for="catName">Nama Kategori</label>
        <input type="text" class="form-control" id="catName" placeholder="Nama kategori">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="catSort">Urutan</label>
          <input type="number" class="form-control" id="catSort" placeholder="0" min="0" value="0">
        </div>
      </div>
      <div class="form-group">
        <label class="form-check">
          <input type="checkbox" id="catActive" checked>
          <span>Aktif</span>
        </label>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeCatModal()">Batal</button>
      <button class="btn btn-primary" onclick="saveCategory()">
        <i class="ri-save-line"></i> Simpan
      </button>
    </div>
  </div>
</div>

<!-- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 TOAST \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
<div id="toastContainer"></div>

<script>
/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   MAZALAT CAFE \u2014 ADMIN PANEL JS
   \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

const API = '/api/admin';
let menuData = [];
let categoriesData = [];
let ordersData = [];
let reviewsData = [];
let currentOrderFilter = '';
let pageTitles = {
  dashboard: 'Dashboard',
  'menu': 'Menu',
  'categories': 'Kategori',
  'orders': 'Pesanan',
  'reviews': 'Ulasan',
  'promo': 'Promo',
  'galeri': 'Galeri',
  'settings': 'Pengaturan'
};

/* \u2500\u2500 Helpers \u2500\u2500 */
function authHeaders() {
  return {
    'Content-Type': 'application/json'
  };
}

async function api(method, path, body) {
  const opts = { method, headers: authHeaders() };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || 'Request failed');
  return data;
}

function formatRupiah(n) {
  if (n == null || isNaN(n)) return 'Rp0';
  return 'Rp' + Number(n).toLocaleString('id-ID');
}

function formatDate(d) {
  if (!d) return '\u2014';
  const dt = new Date(d);
  return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function toast(msg, type) {
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  const icons = { success: 'ri-check-line', error: 'ri-error-warning-line', warning: 'ri-alert-line' };
  el.innerHTML = '<i class="' + (icons[type] || 'ri-information-line') + '"></i><span>' + msg + '</span>';
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    el.style.transition = '0.3s';
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

function escapeHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/* \u2500\u2500 Credential Change \u2500\u2500 */
async function changeAuth() {
  const newUser = document.getElementById('newUsername').value.trim();
  const newPass = document.getElementById('newPassword').value.trim();
  if (!newUser) { toast('Username tidak boleh kosong', 'warning'); return; }
  if (newPass && newPass.length < 8) { toast('Password minimal 8 karakter', 'warning'); return; }
  try {
    const body = { admin_user: newUser };
    if (newPass) body.admin_pass = newPass;
    await api('PUT', '/settings', body);
    toast('Username & password berhasil diubah! Silakan login ulang.', 'success');
    setTimeout(() => window.location.reload(), 2000);
  } catch(e) { toast('Gagal mengubah: ' + e.message, 'error'); }
}

/* Authentication is enforced by the Worker deployment, so the panel does not
   depend on a separate hard-VPS login endpoint. */
function doLogin() { showApp(); }
function doLogout() { window.location.reload(); }

function showApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appPage').style.display = 'block';
  navigateTo('dashboard');
}

/* \u2500\u2500 Navigation \u2500\u2500 */
function navigateTo(page, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item[data-page]').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');

  if (el) {
    el.classList.add('active');
  } else {
    const navEl = document.querySelector('.nav-item[data-page="' + page + '"]');
    if (navEl) navEl.classList.add('active');
  }

  document.getElementById('pageTitle').textContent = pageTitles[page] || page;
  closeSidebar();

  if (page === 'dashboard') loadDashboard();
  else if (page === 'menu') loadMenu();
  else if (page === 'categories') loadCategories();
  else if (page === 'orders') loadOrders();
  else if (page === 'reviews') loadReviews();
  else if (page === 'promo') loadPromoSettings();
  else if (page === 'galeri') loadGalleryAdmin();
  else if (page === 'settings') loadSettings();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

/* \u2500\u2500 Dashboard \u2500\u2500 */
async function loadDashboard() {
  const updateDashDate = () => {
    const now = new Date();
    document.getElementById('dashDate').textContent = now.toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta'
    });
  };
  updateDashDate();
  setInterval(updateDashDate, 1000);

  try {
    const [stats, menu, cats, orders] = await Promise.all([
      api('GET', '/stats').catch(() => ({})),
      api('GET', '/menu').catch(() => []),
      api('GET', '/categories').catch(() => []),
      api('GET', '/orders').catch(() => [])
    ]);

    menuData = Array.isArray(menu) ? menu : (menu.items || menu.data || []);
    categoriesData = Array.isArray(cats) ? cats : (cats.categories || cats.data || []);
    ordersData = Array.isArray(orders) ? orders : (orders.orders || orders.data || []);

    const dashboard = stats.stats || stats.data || stats;
    document.getElementById('statMenu').textContent = dashboard.menu_count ?? dashboard.menuCount ?? dashboard.total_menu ?? dashboard.totalMenu ?? menuData.length;
    document.getElementById('statOrders').textContent = dashboard.order_count ?? dashboard.orderCount ?? dashboard.total_orders ?? dashboard.totalOrders ?? ordersData.length;

    const revenue = dashboard.revenue ?? dashboard.total_revenue ?? dashboard.totalRevenue ??
      ordersData.filter(o => o.status === 'completed').reduce((s, o) => s + (o.total || 0), 0);
    document.getElementById('statRevenue').textContent = formatRupiah(revenue);

    const pending = dashboard.pending_count ?? dashboard.pendingCount ?? dashboard.pending_orders ?? dashboard.pendingOrders ?? ordersData.filter(o => o.status === 'pending').length;
    document.getElementById('statPending').textContent = pending;

    // Recent orders
    const recent = ordersData.slice(0, 6);
    const recentEl = document.getElementById('dashRecentOrders');
    if (!recent.length) {
      recentEl.innerHTML = '<div class="empty-state"><i class="ri-shopping-bag-line"></i><p>Belum ada pesanan</p></div>';
    } else {
      recentEl.innerHTML = recent.map(o => \`
        <div class="recent-order">
          <div class="ro-info">
            <div class="ro-name">\${escapeHtml(o.customer_name || o.customerName || o.name || 'Guest')}</div>
            <div class="ro-meta">\${formatDate(o.created_at || o.createdAt)} &middot; <span class="badge badge-\${o.status || 'pending'}">\${o.status || 'pending'}</span></div>
          </div>
          <div class="ro-total">\${formatRupiah(o.total)}</div>
        </div>
      \`).join('');
    }

    // Popular
    const popularity = new Map();
    ordersData.forEach(order => (order.items || order.order_items || []).forEach(item => {
      const name = item.name || item.item_name || '\u2014';
      popularity.set(name, (popularity.get(name) || 0) + Number(item.quantity || item.qty || 1));
    }));
    const popList = [...popularity].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    const popEl = document.getElementById('dashPopular');
    if (!popList.length) {
      popEl.innerHTML = '<div class="empty-state"><i class="ri-fire-line"></i><p>Belum ada data</p></div>';
    } else {
      popEl.innerHTML = popList.slice(0, 8).map(p => \`
        <div class="popular-item">
          <span class="pi-name">\${escapeHtml(p.name || p.item_name || '\u2014')}</span>
          <span class="pi-count">\${p.count || p.quantity || p.total_ordered || 0}x</span>
        </div>
      \`).join('');
    }
  } catch (e) {
    console.error('Dashboard load error:', e);
    toast('Gagal memuat dashboard', 'error');
  }
}

/* \u2500\u2500 Menu \u2500\u2500 */
async function loadMenu() {
  try {
    const [menu, cats] = await Promise.all([
      api('GET', '/menu'),
      api('GET', '/categories')
    ]);
    menuData = Array.isArray(menu) ? menu : (menu.items || menu.data || []);
    categoriesData = Array.isArray(cats) ? cats : (cats.categories || cats.data || []);

    // Populate category filter
    const filter = document.getElementById('menuCatFilter');
    const currentVal = filter.value;
    filter.innerHTML = '<option value="">Semua Kategori</option>' +
      categoriesData.map(c => \`<option value="\${c.id}">\${escapeHtml(c.name)}</option>\`).join('');
    filter.value = currentVal;

    // Populate modal category select
    const catSelect = document.getElementById('itemCategory');
    catSelect.innerHTML = categoriesData.map(c =>
      \`<option value="\${c.id}">\${escapeHtml(c.name)}</option>\`
    ).join('');

    renderMenuTable();
  } catch (e) {
    console.error(e);
    toast('Gagal memuat menu', 'error');
  }
}

function renderMenuTable() {
  const search = (document.getElementById('menuSearch').value || '').toLowerCase();
  const catFilter = document.getElementById('menuCatFilter').value;
  const tbody = document.getElementById('menuTableBody');

  let filtered = menuData.filter(item => {
    const matchSearch = !search || (item.name || '').toLowerCase().includes(search) ||
      (item.description || item.desc || '').toLowerCase().includes(search);
    const matchCat = !catFilter || String(item.category_id || item.categoryId) === String(catFilter);
    return matchSearch && matchCat;
  }).sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || Number(a.id) - Number(b.id));

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><i class="ri-restaurant-line"></i><p>Tidak ada menu ditemukan</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const cat = categoriesData.find(c => c.id == (item.category_id || item.categoryId));
    const catName = cat ? cat.name : (item.category_name || item.category || '\u2014');
    const img = item.image || item.image_url || item.imageUrl || '';
    const rawAvailable = item.available ?? item.is_available ?? item.isAvailable;
    const available = rawAvailable === undefined || rawAvailable === true || rawAvailable === 1 || rawAvailable === '1' || rawAvailable === 'true';
    const imgHtml = img
      ? \`<img class="menu-thumb" src="\${escapeHtml(img)}" alt="">\`
      : \`<div class="menu-thumb-placeholder"><i class="ri-image-line"></i></div>\`;

    return \`<tr>
      <td>\${imgHtml}</td>
      <td>
        <strong>\${escapeHtml(item.name)}</strong>
        \${item.description || item.desc ? \`<div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${escapeHtml(item.description || item.desc)}</div>\` : ''}
      </td>
      <td>\${escapeHtml(catName)}</td>
      <td class="price">\${formatRupiah(item.price)}</td>
      <td>
        <label class="toggle">
          <input type="checkbox" \${available ? 'checked' : ''} onchange="toggleAvailable(\${item.id}, this.checked)">
          <span class="slider"></span>
        </label>
      </td>
      <td>
        <div class="actions-cell">
          <button class="btn-icon edit" onclick="editItem(\${item.id})" title="Edit"><i class="ri-pencil-line"></i></button>
          <button class="btn-icon delete" onclick="deleteItem(\${item.id}, '\${escapeHtml(item.name).replace(/'/g, "\\\\'")}')" title="Hapus"><i class="ri-delete-bin-line"></i></button>
        </div>
      </td>
    </tr>\`;
  }).join('');
}

function openMenuModal(item) {
  document.getElementById('editItemId').value = item ? item.id : '';
  document.getElementById('modalTitle').textContent = item ? 'Edit Menu' : 'Tambah Menu';
  document.getElementById('itemName').value = item ? (item.name || '') : '';
  document.getElementById('itemPrice').value = item ? (item.price || '') : '';
  document.getElementById('itemDesc').value = item ? (item.description || item.desc || '') : '';
  document.getElementById('itemSort').value = item ? (item.sort_order ?? 0) : 0;
  document.getElementById('itemImage').value = item ? (item.image || item.image_url || item.imageUrl || '') : '';
  document.getElementById('itemImageFile').value = '';
  document.getElementById('itemImageStatus').textContent = '';

  const catSelect = document.getElementById('itemCategory');
  if (item) {
    catSelect.value = item.category_id || item.categoryId || '';
  } else if (categoriesData.length) {
    catSelect.selectedIndex = 0;
  }

  const preview = document.getElementById('itemImagePreview');
  const placeholder = document.getElementById('uploadPlaceholder');
  const imgUrl = item ? (item.image || item.image_url || item.imageUrl || '') : '';
  if (imgUrl) {
    preview.src = imgUrl;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    document.getElementById('removeImageBtn').style.display = 'block';
  } else {
    preview.style.display = 'none';
    preview.src = '';
    placeholder.style.display = 'block';
    document.getElementById('removeImageBtn').style.display = 'none';
  }

  document.getElementById('menuModal').classList.add('open');
}

function closeMenuModal() {
  document.getElementById('menuModal').classList.remove('open');
}

function editItem(id) {
  const item = menuData.find(m => m.id == id);
  if (item) openMenuModal(item);
}

async function deleteItem(id, name) {
  if (!confirm('Hapus menu "' + name + '"?')) return;
  try {
    await api('DELETE', '/menu/' + id);
    toast('Menu dihapus', 'success');
    loadMenu();
  } catch (e) {
    toast(e.message || 'Gagal menghapus', 'error');
  }
}

async function toggleAvailable(id, checked) {
  try {
    await api('PUT', '/menu/' + id, { available: checked, is_available: checked });
    const item = menuData.find(m => m.id == id);
    if (item) {
      item.available = checked;
      item.is_available = checked;
    }
    toast(checked ? 'Menu tersedia' : 'Menu tidak tersedia', 'success');
  } catch (e) {
    toast(e.message || 'Gagal update', 'error');
    loadMenu();
  }
}

function removeImage() {
  document.getElementById('itemImage').value = '';
  document.getElementById('itemImagePreview').src = '';
  document.getElementById('itemImagePreview').style.display = 'none';
  document.getElementById('removeImageBtn').style.display = 'none';
  document.getElementById('itemImageFile').value = '';
  document.getElementById('itemImageStatus').textContent = '';
  document.getElementById('uploadPlaceholder').style.display = 'flex';
}

async function handleImageUpload(input) {
  const file = input.files && input.files[0];
  if (!file) return;

  const status = document.getElementById('itemImageStatus');
  status.textContent = 'Memproses gambar...';
  status.style.color = 'var(--text-muted)';

  try {
    const url = await compressImageToDataUrl(file);
    document.getElementById('itemImage').value = url;

    const preview = document.getElementById('itemImagePreview');
    preview.src = url;
    preview.style.display = 'block';
    document.getElementById('uploadPlaceholder').style.display = 'none';
    document.getElementById('removeImageBtn').style.display = 'block';

    status.textContent = 'Gambar siap disimpan';
    status.style.color = 'var(--success)';
  } catch (e) {
    status.textContent = e.message || 'Upload gagal';
    status.style.color = 'var(--danger)';
  }
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith('image/')) return reject(new Error('File harus berupa gambar'));
    
    // Try multiple approaches
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    
    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        resolve({ image, objectUrl });
      } else {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Gambar tidak valid (ukuran 0)'));
      }
    };
    
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      // Fallback: try with FileReader
      const reader = new FileReader();
      reader.onload = () => {
        const img2 = new Image();
        img2.onload = () => resolve({ image: img2, objectUrl: null });
        img2.onerror = () => reject(new Error('Gagal membaca gambar'));
        img2.src = reader.result;
      };
      reader.onerror = () => reject(new Error('Gagal membaca file'));
      reader.readAsDataURL(file);
    };
    
    image.src = objectUrl;
  });
}

async function compressImageToDataUrl(file) {
  const MAX_DATA_URL_BYTES = 50 * 1024;
  const MAX_WIDTH = 800;
  const JPEG_QUALITY = 0.6;
  const loaded = await loadImageFile(file);
  const image = loaded.image;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context || !image.naturalWidth || !image.naturalHeight) {
    URL.revokeObjectURL(loaded.objectUrl);
    throw new Error('Gambar tidak valid');
  }

  let width = Math.min(image.naturalWidth, MAX_WIDTH);
  let height = Math.max(1, Math.round(image.naturalHeight * width / image.naturalWidth));

  try {
    // Keep JPEG quality fixed at 0.6 and reduce dimensions further only when
    // necessary so the complete data URL (including its prefix) fits in 50KB.
    while (true) {
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      const dataUrlBytes = new Blob([dataUrl]).size;
      if (dataUrlBytes <= MAX_DATA_URL_BYTES) return dataUrl;
      if (canvas.width <= 1 && canvas.height <= 1) break;

      const scale = Math.min(0.9, Math.sqrt(MAX_DATA_URL_BYTES / dataUrlBytes) * 0.95);
      width = Math.max(1, Math.floor(canvas.width * scale));
      height = Math.max(1, Math.floor(canvas.height * scale));
    }
    throw new Error('Gambar tidak dapat dikompres hingga 50KB');
  } finally {
    URL.revokeObjectURL(loaded.objectUrl);
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function saveMenuItem() {
  const id = document.getElementById('editItemId').value;
  const name = document.getElementById('itemName').value.trim();
  const category_id = document.getElementById('itemCategory').value;
  const price = parseFloat(document.getElementById('itemPrice').value);
  const description = document.getElementById('itemDesc').value.trim();
  const image_url = document.getElementById('itemImage').value;
  const sort_order = Number(document.getElementById('itemSort').value);

  if (!name) { toast('Nama menu wajib diisi', 'warning'); return; }
  if (!category_id) { toast('Pilih kategori', 'warning'); return; }
  if (isNaN(price) || price < 0) { toast('Harga tidak valid', 'warning'); return; }
  if (!Number.isInteger(sort_order) || sort_order < 0) { toast('Urutan tidak valid', 'warning'); return; }

  const payload = { name, category_id, price, description, image_url, sort_order };
  if (!id) payload.available = true;

  try {
    if (id) {
      await api('PUT', '/menu/' + id, payload);
      toast('Menu diperbarui', 'success');
    } else {
      await api('POST', '/menu', payload);
      toast('Menu ditambahkan', 'success');
    }
    closeMenuModal();
    loadMenu();
  } catch (e) {
    toast(e.message || 'Gagal menyimpan', 'error');
  }
}

/* \u2500\u2500 Categories \u2500\u2500 */
async function loadCategories() {
  try {
    const cats = await api('GET', '/categories');
    categoriesData = Array.isArray(cats) ? cats : (cats.categories || cats.data || []);
    renderCatGrid();
  } catch (e) {
    toast('Gagal memuat kategori', 'error');
  }
}

function renderCatGrid() {
  const grid = document.getElementById('catGrid');
  if (!categoriesData.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><i class="ri-folder-line"></i><p>Belum ada kategori</p></div>';
    return;
  }

  const sorted = [...categoriesData].sort((a, b) => (a.sort_order || a.sort || 0) - (b.sort_order || b.sort || 0));

  grid.innerHTML = sorted.map(c => {
    const rawActive = c.active ?? c.is_active;
    const active = rawActive === undefined || rawActive === true || rawActive === 1 || rawActive === '1' || rawActive === 'true';
    const icon = c.icon || 'ri-folder-line';
    return \`<div class="cat-card">
      <div class="cat-icon-wrap"><i class="\${escapeHtml(icon)}"></i></div>
      <h4>\${escapeHtml(c.name)}</h4>
      <div class="cat-meta">
        <span class="badge \${active ? 'badge-active' : 'badge-inactive'}">\${active ? 'Aktif' : 'Nonaktif'}</span>
        <span>Urutan: \${c.sort_order != null ? c.sort_order : (c.sort || 0)}</span>
      </div>
      <div class="cat-actions">
        <button class="btn-icon edit" onclick="openCatModal(\${JSON.stringify(c).replace(/"/g, '&quot;')})" title="Edit"><i class="ri-pencil-line"></i></button>
        <button class="btn-icon delete" onclick="deleteCategory(\${c.id})" title="Hapus"><i class="ri-delete-bin-line"></i></button>
      </div>
    </div>\`;
  }).join('');
}

function openCatModal(cat) {
  // cat can be object or undefined
  if (typeof cat === 'string') {
    try { cat = JSON.parse(cat.replace(/&quot;/g, '"')); } catch(e) { cat = null; }
  }
  document.getElementById('catEditId').value = cat ? cat.id : '';
  document.getElementById('catModalTitle').textContent = cat ? 'Edit Kategori' : 'Tambah Kategori';
  document.getElementById('catName').value = cat ? (cat.name || '') : '';
  document.getElementById('catSort').value = cat ? (cat.sort_order != null ? cat.sort_order : (cat.sort || 0)) : 0;
  document.getElementById('catActive').checked = cat ? (cat.active !== false && cat.is_active !== false) : true;
  document.getElementById('catModal').classList.add('open');
}

function closeCatModal() {
  document.getElementById('catModal').classList.remove('open');
}

async function saveCategory() {
  const id = document.getElementById('catEditId').value;
  const name = document.getElementById('catName').value.trim();
  const sort_order = parseInt(document.getElementById('catSort').value) || 0;
  const active = document.getElementById('catActive').checked;

  if (!name) { toast('Nama kategori wajib diisi', 'warning'); return; }

  const slug = (name.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'category');
  const payload = { name, slug, sort_order, active };

  try {
    if (id) {
      await api('PUT', '/categories/' + id, payload);
      toast('Kategori diperbarui', 'success');
    } else {
      await api('POST', '/categories', payload);
      toast('Kategori ditambahkan', 'success');
    }
    closeCatModal();
    loadCategories();
  } catch (e) {
    toast(e.message || 'Gagal menyimpan', 'error');
  }
}

async function deleteCategory(id) {
  if (!confirm('Hapus kategori ini?')) return;
  try {
    await api('DELETE', '/categories/' + id);
    toast('Kategori dihapus', 'success');
    loadCategories();
  } catch (e) {
    toast(e.message || 'Gagal menghapus', 'error');
  }
}

/* \u2500\u2500 Orders \u2500\u2500 */
async function loadOrders() {
  try {
    const orders = await api('GET', '/orders');
    ordersData = Array.isArray(orders) ? orders : (orders.orders || orders.data || []);
    renderOrdersTable();
  } catch (e) {
    toast('Gagal memuat pesanan', 'error');
  }
}

function filterOrders(el, status) {
  currentOrderFilter = status;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderOrdersTable();
}

function renderOrdersTable() {
  const tbody = document.getElementById('ordersTableBody');
  let filtered = ordersData;
  if (currentOrderFilter) {
    filtered = ordersData.filter(o => o.status === currentOrderFilter);
  }

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><i class="ri-shopping-bag-line"></i><p>Tidak ada pesanan</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(o => {
    const items = o.items || o.order_items || [];
    const itemCount = Array.isArray(items) ? items.length : (o.item_count || '\u2014');
    const itemSummary = Array.isArray(items)
      ? items.map(i => (i.quantity || i.qty || 1) + 'x ' + (i.name || i.item_name || '')).join(', ')
      : '\u2014';
    const status = o.status || 'pending';
    const customer = o.customer_name || o.customerName || o.name || 'Guest';

    return \`<tr>
      <td><strong>#\${o.id}</strong></td>
      <td>
        <div style="font-weight:600">\${escapeHtml(customer)}</div>
        \${o.phone || o.whatsapp ? \`<div style="font-size:0.78rem;color:var(--text-muted)">\${escapeHtml(o.phone || o.whatsapp)}</div>\` : ''}
      </td>
      <td>
        <div style="font-size:0.85rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="\${escapeHtml(itemSummary)}">\${escapeHtml(itemSummary)}</div>
        <div style="font-size:0.75rem;color:var(--text-muted)">\${itemCount} item</div>
      </td>
      <td class="price">\${formatRupiah(o.total)}</td>
      <td><span class="badge badge-\${status}">\${status}</span></td>
      <td style="font-size:0.82rem;color:var(--text-muted);white-space:nowrap">\${formatDate(o.created_at || o.createdAt)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:0.5rem">
          <select class="status-select" onchange="updateOrderStatus(\${o.id}, this.value)">
            <option value="pending" \${status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="confirmed" \${status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
            <option value="completed" \${status === 'completed' ? 'selected' : ''}>Completed</option>
            <option value="cancelled" \${status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
          <button class="btn-icon delete" type="button" title="Hapus pesanan" aria-label="Hapus pesanan #\${o.id}" onclick="deleteOrder(\${o.id})">
            <i class="ri-delete-bin-line"></i>
          </button>
        </div>
      </td>
    </tr>\`;
  }).join('');
}

async function updateOrderStatus(id, status) {
  try {
    await api('PUT', '/orders/' + id + '/status', { status });
    const order = ordersData.find(o => o.id == id);
    if (order) order.status = status;
    renderOrdersTable();
    toast('Status diperbarui', 'success');
  } catch (e) {
    toast(e.message || 'Gagal update status', 'error');
    loadOrders();
  }
}

async function deleteOrder(id) {
  if (!confirm('Hapus pesanan #' + id + '? Tindakan ini tidak dapat dibatalkan.')) return;
  try {
    await api('DELETE', '/orders/' + encodeURIComponent(id));
    ordersData = ordersData.filter(order => String(order.id) !== String(id));
    renderOrdersTable();
    toast('Pesanan dihapus', 'success');
  } catch (e) {
    toast(e.message || 'Gagal menghapus pesanan', 'error');
  }
}

/* \u2500\u2500 Reviews \u2500\u2500 */
async function loadReviews() {
  const tbody = document.getElementById('reviewsTableBody');
  tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><i class="ri-loader-4-line"></i><p>Memuat ulasan...</p></div></td></tr>';

  try {
    const result = await api('GET', '/reviews');
    reviewsData = Array.isArray(result) ? result : (result.reviews || result.data || []);
    renderReviewsTable();
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><i class="ri-error-warning-line"></i><p>Gagal memuat ulasan</p></div></td></tr>';
    toast(e.message || 'Gagal memuat ulasan', 'error');
  }
}

function reviewIsApproved(review) {
  const value = review.approved ?? review.is_approved ?? review.isApproved;
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'approved';
}

function renderReviewsTable() {
  const tbody = document.getElementById('reviewsTableBody');
  if (!reviewsData.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><i class="ri-chat-smile-3-line"></i><p>Belum ada ulasan</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = reviewsData.map(review => {
    const approved = reviewIsApproved(review);
    const rating = Math.round(Math.max(0, Math.min(5, Number(review.rating) || 0)));
    const name = review.name || review.customer_name || review.customerName || 'Anonim';
    const comment = review.comment || review.review || review.message || '\u2014';
    const date = review.created_at || review.createdAt || review.date;
    const id = JSON.stringify(String(review.id));

    return \`<tr>
      <td><strong>\${escapeHtml(name)}</strong></td>
      <td><span class="review-rating" aria-label="\${rating} dari 5 bintang">\${'\u2605'.repeat(rating)}\${'\u2606'.repeat(5 - rating)}</span></td>
      <td><div class="review-comment">\${escapeHtml(comment)}</div></td>
      <td style="font-size:0.82rem;color:var(--text-muted);white-space:nowrap">\${formatDate(date)}</td>
      <td><span class="badge \${approved ? 'badge-approved' : 'badge-pending'}">\${approved ? 'Disetujui' : 'Pending'}</span></td>
      <td>
        <div class="review-actions">
          <label class="toggle" title="\${approved ? 'Tolak ulasan' : 'Setujui ulasan'}">
            <input type="checkbox" \${approved ? 'checked' : ''} onchange='updateReviewApproval(\${id}, this)'>
            <span class="slider"></span>
          </label>
          <button class="btn-icon delete" title="Hapus ulasan" aria-label="Hapus ulasan" onclick='deleteReview(\${id})'>
            <i class="ri-delete-bin-line"></i>
          </button>
        </div>
      </td>
    </tr>\`;
  }).join('');
}

async function updateReviewApproval(id, checkbox) {
  const approved = checkbox.checked;
  checkbox.disabled = true;
  try {
    await api('PUT', '/reviews/' + encodeURIComponent(id), { approved });
    const review = reviewsData.find(item => String(item.id) === String(id));
    if (review) review.approved = approved;
    renderReviewsTable();
    toast(approved ? 'Ulasan disetujui' : 'Persetujuan ulasan dibatalkan', 'success');
  } catch (e) {
    checkbox.checked = !approved;
    checkbox.disabled = false;
    toast(e.message || 'Gagal memperbarui ulasan', 'error');
  }
}

async function deleteReview(id) {
  if (!confirm('Hapus ulasan ini? Tindakan ini tidak dapat dibatalkan.')) return;
  try {
    await api('DELETE', '/reviews/' + encodeURIComponent(id));
    reviewsData = reviewsData.filter(review => String(review.id) !== String(id));
    renderReviewsTable();
    toast('Ulasan dihapus', 'success');
  } catch (e) {
    toast(e.message || 'Gagal menghapus ulasan', 'error');
  }
}

/* \u2500\u2500 Settings \u2500\u2500 */
async function loadSettings() {
  try {
    const settings = await api('GET', '/settings');
    const s = settings.settings || settings.data || settings;

    document.getElementById('setCafeName').value = s.cafe_name || s.cafeName || s.name || '';
    document.getElementById('setTagline').value = s.tagline || '';
    document.getElementById('setAddress').value = s.address || '';
    document.getElementById('setWhatsapp').value = s.whatsapp || s.phone || '';
    document.getElementById('setInstagram').value = s.instagram || '';
    document.getElementById('setHours').value = s.open_hours || '';
  } catch (e) {
    console.error('Settings load error:', e);
  }
}

async function saveSettings() {
  const payload = {
    cafe_name: document.getElementById('setCafeName').value.trim(),
    tagline: document.getElementById('setTagline').value.trim(),
    address: document.getElementById('setAddress').value.trim(),
    whatsapp: document.getElementById('setWhatsapp').value.trim(),
    instagram: document.getElementById('setInstagram').value.trim(),
    open_hours: document.getElementById('setHours').value.trim()
  };

  try {
    await api('PUT', '/settings', payload);
    toast('Pengaturan disimpan', 'success');
  } catch (e) {
    toast(e.message || 'Gagal menyimpan', 'error');
  }
}

/* \u2500\u2500 Promo \u2500\u2500 */
async function loadPromoSettings() {
  try {
    const data = await api('GET', '/settings');
    const s = data.settings || data.data || data;

    const active = s.promo_active === true || s.promo_active === 1 || s.promo_active === '1' || s.promo_active === 'true' || s.promoActive === true;
    document.getElementById('p_active').checked = active;
    document.getElementById('p_text').value = s.promo_text || s.promoText || '';
    document.getElementById('p_emoji').value = s.promo_emoji || s.promoEmoji || '';
    updatePromoPreview();
  } catch (e) {
    console.error('Promo load error:', e);
  }
}

function updatePromoPreview() {
  const emoji = document.getElementById('p_emoji').value || '';
  const text = document.getElementById('p_text').value || 'Teks promo akan muncul di sini';
  const active = document.getElementById('p_active').checked;

  document.getElementById('ppEmoji').textContent = emoji;
  document.getElementById('ppText').textContent = text;
  document.getElementById('promoPreview').style.opacity = active ? '1' : '0.5';
}

async function savePromo() {
  const payload = {
    promo_active: document.getElementById('p_active').checked,
    promo_text: document.getElementById('p_text').value.trim(),
    promo_emoji: document.getElementById('p_emoji').value.trim()
  };

  try {
    await api('PUT', '/settings', payload);
    toast('Promo disimpan', 'success');
  } catch (e) {
    toast(e.message || 'Gagal menyimpan promo', 'error');
  }
}

/* \u2500\u2500 Init \u2500\u2500 */
document.addEventListener('DOMContentLoaded', () => {
  // Enter key on login
  document.getElementById('loginPass').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('loginUser').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('loginPass').focus();
  });

  // Close modals on overlay click
  document.getElementById('menuModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeMenuModal();
  });
  document.getElementById('catModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeCatModal();
  });

  // Escape closes modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeMenuModal();
      closeCatModal();
      closeSidebar();
    }
  });

  showApp();
    // Auto-refresh orders every 30 seconds
    let lastOrderCount = 0;
    function checkNewOrders() {
      try {
        fetch('/api/admin/orders')
          .then(r => r.json())
          .then(orders => {
            if (orders.length > lastOrderCount && lastOrderCount > 0) {
              toast('Pesanan baru masuk!', 'success');
              loadOrders();
            }
            lastOrderCount = orders.length;
          })
          .catch(() => {});
      } catch(e) {}
    }
    setInterval(checkNewOrders, 30000);
    checkNewOrders();
});

/* \u2500\u2500 Gallery Admin \u2500\u2500 */
async function loadGalleryAdmin() {
  try {
    const result = await api('GET', '/gallery');
    const photos = Array.isArray(result) ? result : (result.photos || result.gallery || result.data || []);
    const grid = document.getElementById('galleryAdminGrid');
    const count = document.getElementById('galleryCount');
    count.textContent = photos.length;
    if (!photos.length) {
      grid.innerHTML = '<div style="color:var(--text-muted);padding:20px;text-align:center">Belum ada foto. Upload di atas.</div>';
      return;
    }
    grid.innerHTML = photos.map(p => {
      const photoUrl = p.url || p.image || p.image_url || p.imageUrl || '';
      const id = JSON.stringify(String(p.id));
      return (
      '<div style="position:relative;border-radius:8px;overflow:hidden;aspect-ratio:1;background:var(--cream-dark)">' +
      '<img src="' + escapeHtml(photoUrl) + '" alt="Foto galeri" style="width:100%;height:100%;object-fit:cover">' +
      '<button onclick=\\'deleteGalleryPhoto(' + id + ')\\' style="position:absolute;top:4px;right:4px;background:rgba(192,57,43,.9);color:#fff;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center">&times;</button>' +
      '</div>'
      );
    }).join('');
  } catch(e) {
    toast('Gagal memuat galeri: ' + e.message, 'error');
  }
}

async function uploadGalleryPhoto() {
  const fileInput = document.getElementById('galleryFile');
  const file = fileInput.files[0];
  if (!file) {
    toast('Pilih foto dulu', 'warning');
    return;
  }
  try {
    const image = await compressImageToDataUrl(file);
    await api('POST', '/gallery', { image, url: image });
    fileInput.value = '';
    toast('Foto ditambahkan ke galeri', 'success');
    loadGalleryAdmin();
  } catch(e) {
    toast('Upload gagal: ' + e.message, 'error');
  }
}

async function deleteGalleryPhoto(id) {
  if (!confirm('Hapus foto ini dari galeri?')) return;
  try {
    await api('DELETE', '/gallery/' + id);
    toast('Foto dihapus', 'success');
    loadGalleryAdmin();
  } catch(e) {
    toast('Gagal hapus: ' + e.message, 'error');
  }
}
<\/script>
</body>
</html>
`;
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map

--2bedf0c7844571068899e26fe1cee7578404edf77260c80bc884d35f3f5e--
