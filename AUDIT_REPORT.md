# Mazalat Cafe Security Audit

Date: 2026-08-09  
Target repository: `mazalatcafe-main.zip`  
Primary production path assessed: Cloudflare Worker + D1 (`worker.js`)  
Secondary path assessed: local Express development backend (`api/server.js`, `api/db.js`)

## Executive summary

The production Worker has several good security decisions already in place: parameterized D1 queries, server-side order price calculation, exact-origin CORS, authentication on `/api/admin/*`, security headers, review moderation by default, and generic 500 errors.

However, the repository is **not yet production-hardened**. The most important confirmed problems are:

1. Stored XSS path through the `clean()` `data:` bypass, followed by raw `innerHTML` rendering of approved reviews.
2. No application-layer rate limiting for review submission, order creation, or admin authentication.
3. The production admin password is stored in plaintext in D1.
4. The server accepts extremely weak admin passwords because password-length enforcement exists only in the UI.
5. The public repository documents a default admin credential. If that credential is still active in production, this becomes an immediate critical admin takeover risk.
6. The local Express backend is substantially less secure and must not be internet-facing in its current form.

The live site itself could not be black-box tested from the audit runtime because DNS resolution for `mazalatcafe.my.id` is unavailable in this environment. This is a tooling/network limitation and is **not evidence that the website is down**.

---

# Test methodology

Performed:

- ZIP integrity verification
- Manual static review of:
  - `worker.js`
  - `index.html`
  - `admin/index.html`
  - `api/server.js`
  - `api/db.js`
  - `wrangler.toml`
  - `package.json`
  - `README.md`
- Secret/default credential search
- Authentication/authorization route review
- D1 SQL injection review
- Client-side XSS sink review
- Order business-logic review
- CORS/security-header review
- Local dynamic Worker test harness with an in-memory mock D1
- JavaScript syntax/module checks
- Attempted dependency installation/audit

Dynamic Worker test results:

```text
PASS | admin requires auth | status=401
PASS | documented default credential works when DB unchanged | status=200
PASS | evil CORS origin not reflected | acao=null
PASS | allowed CORS origin exact | acao=https://mazalatcafe.my.id
PASS | order ignores client total | stored_total=50000
PASS | clean() data: bypass preserves HTML and bypasses 60-char max | stored_len=5036
PASS | approved malicious review reaches public API unsanitized | public_name_len=5036
PASS | normal tag stripping active | stored="Bob"
PASS | review POST has no app-layer rate limit | accepted=100/100
PASS | server accepts 1-char admin password | status=200
PASS | security headers emitted
```

---

# Findings

## [CRITICAL — conditional] Publicly documented default admin credentials

### Evidence

`README.md:50-51`

```text
## Admin Credentials
Default: admin / mazalat2026
```

The production Worker authenticates against `settings.admin_user` and `settings.admin_pass`.

### Impact

If the production D1 database still contains this default credential, anyone who reads the public repository can authenticate as admin and gain access to menu, category, review, order, gallery, and settings administration.

### Status

**Repository issue confirmed. Live credential status not verified.**

### Fix

- Change the production credential immediately if it has ever used this value.
- Do not publish a real default password.
- Prefer Cloudflare Access for `/admin*` and `/api/admin/*`.
- Require a generated unique credential during initial setup.

---

## [HIGH] Stored XSS through `clean()` `data:` bypass

### Root cause 1

`worker.js:65-69`

```js
function clean(value, max) {
  const raw = String(value ?? "").trim();
  if (raw.startsWith("data:")) return raw;
  return raw.replace(/<[^>]*>/g, "").substring(0, max);
}
```

Any field beginning with `data:` bypasses both:

- tag stripping
- maximum length

### Root cause 2

Public review submission uses `clean()`:

`worker.js:155-164`

```js
const name = clean(body.name, 60);
const comment = clean(body.comment, 500);
...
INSERT INTO reviews ...
```

### Root cause 3

Approved reviews are later rendered with raw `innerHTML`:

`index.html:1657-1666`

```js
+ '<span class="review-name">'+r.name+'</span>'
...
+ '<p class="review-text">'+(r.comment||r.text||'')+'</p>'
...
el.innerHTML = html;
```

### Dynamic proof

A local Worker test submitted a review name beginning with:

```text
data:<img ...>
```

The value:

- retained HTML
- exceeded the intended 60-character limit
- was stored
- after approval, was returned unchanged by public `/api/reviews`

A normal `<img ...>` value without the `data:` prefix was stripped correctly, proving the bypass is specifically caused by the `data:` exception.

### Exploit precondition

Production reviews are created with `approved=0`, therefore the payload must be approved before it reaches normal public visitors.

### Impact

After approval, attacker-controlled HTML can reach an `innerHTML` sink and execute script-capable markup in visitors' browsers.

### Fix

Remove the `data:` exception from generic text cleaning entirely:

```js
function cleanText(value, max) {
  return String(value ?? "").trim().substring(0, max);
}
```

Do not try to make plain text safe by stripping tags. Encode it at output.

For review rendering, use `textContent`, DOM construction, or contextual output encoding. For example, if keeping template strings:

```js
function escapeHtml(value) {
  const d = document.createElement('div');
  d.textContent = String(value ?? '');
  return d.innerHTML;
}
```

Then:

```js
'<span class="review-name">' + escapeHtml(r.name) + '</span>'
'<p class="review-text">' + escapeHtml(r.comment || r.text || '') + '</p>'
```

Keep image/data-URL handling isolated inside `safeUrl()` only.

---

## [HIGH] No real rate limiting on reviews, orders, or admin authentication

### Evidence

The Worker sets:

`worker.js:61`

```js
headers["X-RateLimit-Policy"] = "sliding-window";
```

but there is no counter, KV/Durable Object state, D1 rate-limit table, `429` response, or other application-side enforcement.

### Dynamic proof

100 review POST requests were sent through the local Worker harness.

Result:

```text
accepted=100/100
```

### Affected endpoints

At minimum:

```text
POST /api/reviews
POST /api/orders
/admin
/api/admin/*
```

### Impact

- fake order flood
- review queue flood
- D1 storage growth
- admin dashboard degradation
- increased D1 reads from password guessing
- password brute-force / credential stuffing exposure

### Fix

Use actual Cloudflare Rate Limiting rules and/or Worker-side controls.

Recommended starting policy:

- admin authentication: count failed auth attempts per IP
- reviews: low submission rate per IP/device
- orders: rate by IP plus additional business identifier such as table/session, avoiding overly strict limits because many customers may share the cafe Wi-Fi public IP

Remove the `X-RateLimit-Policy` header until a real policy exists.

---

## [HIGH] Admin password stored in plaintext in production D1

### Evidence

`worker.js:18-28`

```js
const passRow = await DB.prepare(
  "SELECT value FROM settings WHERE key='admin_pass'"
).first();

const storedPass = passRow.value;
...
return diff === 0;
```

Credential changes are stored directly:

`worker.js:468-475`

```js
const ALLOWED = [..., "admin_user", "admin_pass"];
...
await DB.prepare(
  "INSERT INTO settings (key, value) VALUES (?, ?) ..."
).bind(key, safeVal, safeVal).run();
```

There is no password hash.

### Impact

Any D1 read compromise, accidental database export exposure, privileged platform compromise, or debugging leak exposes the real admin password immediately.

### Fix

Store a password hash, not the password.

Suitable designs:

- Cloudflare Access in front of admin routes, ideally removing the application password entirely
- or salted PBKDF2 via Web Crypto / another supported adaptive password-hashing scheme

Rename the stored key to something like:

```text
admin_pass_hash
```

Never store the original password.

---

## [MEDIUM] Server accepts a one-character admin password

### Evidence

Admin UI checks a minimum of 8 characters:

`worker.js:2217-2223`

but the API endpoint itself accepts any value:

`worker.js:468-475`

### Dynamic proof

The test changed the password to:

```text
a
```

Then authenticated successfully with that password.

### Impact

The security control is bypassable by calling the API directly.

### Fix

Enforce password policy in the Worker, not only JavaScript UI.

At minimum:

- reject empty password
- minimum length 12 or another policy selected by the operator
- optionally check compromised/common password lists
- require current password or stronger reauthentication before credential changes

---

## [MEDIUM] Length/sanitization bypass can be abused for oversized database content

This is the same `clean()` issue but has a separate availability/storage impact.

### Dynamic proof

A field declared as maximum 60 characters stored a 5,036-character value because it started with `data:`.

### Affected public data

The helper is used for review and order fields.

### Impact

Combined with the lack of rate limiting, this can increase:

- D1 storage usage
- response size
- moderation load
- dashboard performance problems

### Fix

Never exempt arbitrary `data:` strings in general-purpose text validation.

Apply strict byte/character limits before database insertion.

---

## [MEDIUM — repository configuration] Public Pages site does not define a custom CSP/security header policy

The README describes the customer website as Cloudflare Pages static content, while the Worker generates security headers only for Worker responses.

The repository does not contain a Pages `_headers` configuration.

Cloudflare Pages supplies some default headers, but a site-specific CSP is not configured in this repo.

### Why this matters

The public site contains many dynamic `innerHTML` operations.

A strong CSP is defense-in-depth and especially useful after the XSS sinks are fixed.

### Fix

Create `_headers`, or serve the page through code that adds the policy.

The current inline `<script>` architecture will make a strong `script-src 'self'` policy difficult. Prefer moving inline JavaScript to a separate static file.

---

## [MEDIUM/LOW] Worker CSP allows inline script execution

`worker.js:47`

```text
script-src 'self' 'unsafe-inline'
```

This significantly reduces CSP's value against HTML/script injection.

### Fix

Move inline admin JavaScript to an external file or use per-response nonces/hashes.

Then remove:

```text
'unsafe-inline'
```

from `script-src`.

---

## [LOW] Search result DOM XSS sink

`index.html:1573`

```js
searchResults.innerHTML =
  '<p class="search-no-result">Tidak ditemukan untuk "'+
  searchInput.value+
  '"</p>';
```

Raw search input is assigned to `innerHTML`.

In the current UI, the value comes from the user's own search box rather than a URL parameter, so remote exploitability is limited.

### Fix

Use:

```js
searchResults.textContent = ...
```

or build a `<p>` and set `.textContent`.

---

# Local Express backend — DO NOT expose publicly in current form

The README labels this as local development, so these are not automatically production vulnerabilities. They become serious if `npm start` is ever exposed to the internet.

## [CRITICAL if deployed] Hardcoded JWT fallback secret

`api/server.js:12`

```js
const JWT_SECRET =
  process.env.JWT_SECRET || 'mazalat_secret_2026_change_me';
```

If the environment variable is absent, the signing secret is public source code. An attacker can mint a valid JWT and impersonate an admin.

### Fix

Hard fail:

```js
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}
```

Never ship a fallback production secret.

---

## [HIGH if deployed] Client controls order total

`api/server.js:106-117`

The endpoint stores `total` and `items` directly from the request body.

The production Worker fixes this correctly by looking up item prices in D1 and calculating the total server-side.

### Fix

Port the Worker order-validation implementation to Express if the Express backend remains in use.

---

## [HIGH if deployed] Review stored XSS without moderation

`api/server.js:332-344`

The Express endpoint stores raw review text and marks it:

```js
approved: true
```

The public page renders review content with `innerHTML`.

This is worse than the Worker implementation because no admin approval is required.

---

## [HIGH if deployed] Known default account

`api/db.js:27-30`

Initial user:

```text
admin / mazalat2026
```

The password is bcrypt-hashed at rest, which is better than the Worker D1 design, but the credential itself is publicly known.

---

## [MEDIUM if deployed] JWT stored in localStorage

`admin/index.html:1630-1653`, `1727-1729`

An XSS in the same origin can read the JWT from localStorage.

---

## [MEDIUM if deployed] Upload endpoint has no MIME/extension allow-list

`api/server.js:30-35`, `215-218`

Uploaded files preserve the original extension and are served from the same origin under `/uploads`.

The endpoint is authenticated, but file type should still be restricted to expected image formats.

---

# Positive findings

These controls are implemented correctly in the production Worker:

## SQL injection protection

D1 values are consistently passed through `.bind(...)`.

Dynamic SQL fragments such as update field names are constructed from hardcoded server-side allow-lists rather than direct user strings.

No clear SQL injection path was identified in `worker.js`.

## Server-side order pricing

`worker.js:183-214`

The server:

- resolves product ID/name from D1
- reads the real database price
- validates quantity
- computes the total itself
- ignores the client-supplied `total`

Dynamic test:

```text
client total = 1
server stored total = 50000
```

for two Rp25,000 products.

This is the correct design.

## Admin route authentication

`worker.js:217-218`

All `/api/admin/*` paths pass through `checkAuth()` before admin route handling.

Unauthenticated dynamic test:

```text
GET /api/admin/stats -> 401
```

## CORS

`worker.js:52-57`, `124-132`

Only the exact production origin is allowed.

Dynamic test:

```text
Origin: https://evil.example
Access-Control-Allow-Origin: absent
```

while the configured Mazalat origin is accepted.

## Worker security headers

The Worker emits:

- Content-Security-Policy
- Strict-Transport-Security
- X-Content-Type-Options
- X-Frame-Options
- Referrer-Policy
- Permissions-Policy
- Cross-Origin-Opener-Policy

The CSP still needs improvement because of `unsafe-inline`.

## Review moderation

Production Worker review submissions default to:

```text
approved = 0
```

which reduces the exploitability of malicious reviews.

## Error handling

Unexpected Worker errors return generic:

```json
{"error":"Internal server error"}
```

instead of exposing stack traces.

---

# Build/deployment integrity issue

The supplied `worker.js` ends with a stray MIME-like boundary line:

```text
--c2e151db317d3b701d03d2f6d1bd777482bb5abf01fb2dd1fe4a73c2cfd3--
```

The exact file cannot be imported as an ES module until that line is removed.

This is not a security vulnerability by itself, but the repo should be cleaned because it can break deployments and delay security fixes.

---

# Dependency audit limitation

`package.json` exists but there is no lock file in the supplied repository.

Attempting:

```text
npm install
```

failed because the audit runtime's internal npm mirror does not provide `bcryptjs`.

Therefore an authoritative dependency/CVE audit was not included in this report.

Recommended:

```bash
npm install
npm audit
```

in your normal development environment, then commit `package-lock.json`.

---

# Remediation priority

## P0 — do immediately

1. Confirm production admin password is NOT `mazalat2026`.
2. Remove public default credentials from operational deployment.
3. Fix `clean()` so `data:` cannot bypass text validation.
4. Escape review name/comment at output.
5. Add real rate limiting to admin authentication and public write endpoints.
6. Replace plaintext D1 admin password with a password hash or Cloudflare Access.

## P1

7. Enforce strong password policy server-side.
8. Add Pages `_headers` / CSP and remove unsafe HTML sinks.
9. Keep Express backend local-only or harden it before any public deployment.
10. Remove the stray Worker file boundary and add a reproducible lock file.

## P2

11. Replace inline scripts so CSP can drop `unsafe-inline`.
12. Replace remaining `innerHTML` uses involving dynamic data with safe DOM APIs.
13. Add security regression tests for:
   - XSS payloads
   - order price tampering
   - unauthenticated admin access
   - weak password rejection
   - rate limiting
   - CORS
