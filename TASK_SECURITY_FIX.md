# Task: Fix ALL security vulnerabilities from audit report

## Context
You are fixing security vulnerabilities in the Mazalat Cafe website repository.
The audit report is at: /home/ubuntu/.hermes/cache/documents/doc_3d5274d10fcc_mazalat_security_audit.md
The repo is at: /tmp/mazalat-update/mazalatcafe/

## Files to fix
1. `worker.js` — CF Worker API (production)
2. `index.html` — customer site
3. `admin/index.html` — admin panel
4. `api/server.js` — Express.js local dev backend
5. `README.md` — remove default credentials
6. Create `_headers` file for Pages CSP

## FIXES REQUIRED (do ALL of these)

### P0 — Critical

**1. Remove stray MIME boundary from worker.js**
- File ends with `--c2e151db317d3b701d03d2f6d1bd777482bb5abf01fb2dd1fe4a73c2cfd3--`
- Delete that line entirely

**2. Fix clean() data: bypass XSS in worker.js**
- Current code at line ~65: `if (raw.startsWith("data:")) return raw;` bypasses tag stripping AND length limit
- FIX: Remove the data: bypass entirely. For data: URLs, still enforce max length. For all text, HTML-encode `<>&"'` characters
- Add a new `cleanText(value, max)` function that just trims + truncates (for plain text fields)
- Add an `escapeHtml(value)` function for safe output encoding

**3. Hash admin password in worker.js**
- Current: plaintext password stored in D1 settings table
- FIX: Add `hashPassword(password)` using PBKDF2 via Web Crypto API (100k iterations, SHA-256, 16-byte salt)
- Add `verifyPassword(password, stored)` that checks against the hash
- Modify `checkAuth()` to support both hashed ($pbkdf2$ prefix) and legacy plaintext (backward compat)
- Modify password update endpoint to hash before storing

**4. Remove default credentials from README.md**
- Remove the "Admin Credentials" section that publishes `admin / mazalat2026`
- Replace with: "Change admin credentials immediately after deployment via the admin panel Settings page."

**5. Escape review output in index.html**
- Find all `innerHTML` sinks that render review data (name, comment)
- Replace with `escapeHtml()` or use `textContent` / DOM construction
- Add an `escapeHtml()` helper function in the script section

### P1 — High

**6. Enforce password policy server-side in worker.js**
- Minimum 12 characters for admin password
- Reject empty passwords
- Enforce in the API endpoint, not just UI

**7. Fix search innerHTML XSS in index.html**
- Find: `searchResults.innerHTML = '...'+searchInput.value+'...'`
- Replace with textContent or escapeHtml

**8. Add rate limiting in worker.js**
- Remove fake `X-RateLimit-Policy` header if no enforcement exists
- Add simple IP-based rate limiting using D1: store (ip, endpoint, timestamp) and count recent requests
- Limits: admin auth 10/min, reviews 5/min, orders 10/min per IP
- Return 429 with Retry-After header when exceeded

**9. Add _headers file for Cloudflare Pages**
- Create `_headers` file with CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy
- CSP should NOT include unsafe-inline if possible (or at least document it as TODO)

### P2 — Medium

**10. Fix hardcoded JWT secret in api/server.js**
- Replace fallback with hard fail: `if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required')`

**11. Fix Express review XSS in api/server.js**
- Set `approved: false` by default (not true)
- HTML-encode review text before storing

**12. Fix Express client-controlled total in api/server.js**
- Calculate total server-side from DB prices (like worker.js does)

**13. Add MIME type allow-list for uploads in api/server.js**
- Only allow: image/jpeg, image/png, image/webp, image/gif

## Rules
- DO NOT rewrite entire files. Fix in-place with targeted edits.
- Preserve all existing functionality (menu CRUD, gallery, orders, reviews, promo, etc.)
- Test JavaScript syntax after each fix: `node --check worker.js` and `node --check api/server.js`
- Keep the code style consistent with existing code
- After all fixes, run: `node --check worker.js && node --check api/server.js` to verify no syntax errors

## Output
- Summary of all fixes applied
- Any fixes that could not be applied and why
- Verification that syntax checks pass
