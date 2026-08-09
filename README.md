# Mazalat Cafe Website

100% serverless cafe website on Cloudflare (Pages + Workers + D1).

## Live
- **Website:** https://mazalatcafe.my.id
- **Admin:** https://mazalatcafe.my.id/admin/

## Architecture
- **Customer site** → Cloudflare Pages (static HTML)
- **API + Admin** → Cloudflare Workers + D1 database
- **Photos** → served via CF Pages

## Deploy

### Static site (Pages)
```bash
# Deploy customer site
npx wrangler pages deploy . --project-name=mazalat-site --branch=main
```

### Worker (API + Admin)
```bash
# Deploy API worker
npx wrangler deploy
```

### Local development (Express.js)
```bash
npm install
npm start
# Runs on http://localhost:3001
```

## Structure
```
├── index.html          # Customer site (static)
├── admin/index.html    # Admin panel (served by Worker)
├── worker.js           # Cloudflare Worker (API + auth)
├── api/
│   ├── server.js       # Express.js backend (local dev)
│   └── db.js           # Database layer
├── uploads/            # Menu item photos
├── photos/             # Gallery photos
├── logo.png            # Mazalat logo
├── wrangler.toml       # CF Workers config
└── package.json
```

## Admin Credentials
Default: `admin` / `mazalat2026` (changeable from admin panel Settings)

## Tech Stack
- Cloudflare Pages (static hosting)
- Cloudflare Workers (API backend)
- Cloudflare D1 (SQLite database)
- Express.js (local development)
