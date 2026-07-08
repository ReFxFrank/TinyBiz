# TinyBiz 🐣

**The all-in-one workspace for makers, Etsy sellers, 3D-printing businesses, and small online shops.**

TinyBiz combines the parts of Notion, Shopify analytics, an Etsy seller dashboard, inventory software, and bookkeeping that a small maker business actually needs — in one fast, friendly app.

## What's inside

| Area | Highlights |
|---|---|
| **Dashboard** | Today's & monthly revenue, profit, expenses, fulfillment queue, low-stock alerts, recent orders, agenda, best sellers |
| **Orders** | Full lifecycle (New → Printing → Packaging → Shipped → Delivered…), filters, search, CSV export, profit per order |
| **Inventory** | Finished products, raw materials (filament, stickers, boxes, packaging), reorder thresholds, stock adjustments & damage log |
| **Products** | SKUs, variants, tags, weight/dimensions, margins, material usage, production time |
| **Manufacturing** | Recipes / BOMs, production batches with automatic material deduction, machines, failed prints & waste tracking |
| **Customers** | Order history, lifetime value, favorite products, notes, tags |
| **Money** | Expenses (with recurring), extra income, accounting with P&L, margins, sales tax, cash flow, downloadable reports |
| **Shipping** | Shipments, carriers, tracking, label flow, delivery status timeline |
| **Analytics** | Revenue/orders/profit trends, best sellers, category & channel breakdowns, customer growth, AOV, repeat rate |
| **Marketing & Social** | Campaigns with ROAS, promo codes, social accounts & content calendar |
| **Organize** | Calendar (ship-by dates, deliveries, production), kanban tasks, documents, team |
| **System** | Global ⌘K search, notifications, dark mode, keyboard shortcuts, integration placeholders (Etsy, Shopify, Stripe…) |

## Tech stack

- **React 18 + TypeScript + Vite**
- **Tailwind CSS** with a token-based design system (light + dark)
- **Radix UI** primitives (dialogs, menus, tooltips, switches) for accessibility
- **Framer Motion** for page transitions and micro-animations
- **Recharts** styled to a validated, colorblind-safe chart palette
- **Zustand** for state, synced live to a small **Node + Express + SQLite** API server (`server/`) — with an optional rich sample business, *Nova Prints & Co.*

## Getting started

```bash
npm install                 # frontend deps
(cd server && npm install)  # API deps — once

node server/index.js        # terminal 1: API on :4000
npm run dev                 # terminal 2: Vite dev server (proxies /api to :4000)
npm run build               # typecheck + production build
npm run preview             # preview the production build
```

The site root is the customer storefront (always dark, dressed in the shop's brand). The owner's workspace lives at `/admin` — the first visit there shows a one-time setup screen: create the owner sign-in, then start with ~6 months of sample business data, import the data already in your browser, or start empty. To start over completely, stop the API and delete the database file.

## Deploying to an Ubuntu VPS

`deploy.sh` turns a fresh Ubuntu 22.04/24.04 server into a live TinyBiz host in one command — it installs nginx + Node 20 (if missing), clones this repo, builds, runs the API as a systemd service (`tinybiz-api`), and configures nginx with SPA routing plus an `/api` proxy:

```bash
# Serve on the server's IP over http
curl -fsSL https://raw.githubusercontent.com/ReFxFrank/TinyBiz/main/deploy.sh | sudo bash

# Or with a domain + automatic HTTPS (point your DNS A record at the VPS first)
curl -fsSL https://raw.githubusercontent.com/ReFxFrank/TinyBiz/main/deploy.sh | sudo bash -s -- shop.example.com
```

The admin signs in, and all business data lives in SQLite on the server at `/var/lib/tinybiz/tinybiz.db` — the first visit to `/admin` shows a one-time setup screen (create the owner account, then choose sample data, import the browser's existing data, or start empty). Storefront orders and newsletter subscribers land in the server database from any customer's browser. Product photos uploaded from the admin are stored next to the database in `/var/lib/tinybiz/uploads/` and served at `/uploads/…`.

**Backups**: the deploy installs a nightly cron (3:17 AM) that snapshots the database with SQLite's online backup API, gzips it into `/var/lib/tinybiz/backups/`, and keeps the newest 14. The owner can also grab one on demand — `GET /api/backup` while signed in downloads a fresh snapshot. Sign-in, checkout, tracking, and subscribe endpoints are rate-limited per IP against brute force.

**Customer emails**: with the mail bridge configured (Settings → Newsletter), customers get an order confirmation at checkout and a "your order is on its way" email — with the carrier tracking link — the moment an order is marked shipped or gains a tracking number. **SEO**: `/robots.txt` and `/sitemap.xml` are generated from the live catalog; the storefront's policies live at `/policies`, editable under Settings → Store policies.

**Redeploying**: the first run installs a `redeploy` command on the server, so pulling the latest code, rebuilding, and publishing is just:

```bash
redeploy            # pull latest + rebuild + publish (no-op if nothing new)
redeploy --force    # rebuild even with no new commits
```

**Auto-deploy**: `redeploy --install-cron` sets up a cron job that polls the branch every 5 minutes and redeploys only when new commits land (silent no-op otherwise, logged to `/var/log/tinybiz-deploy.log`). After that you never touch the server — pushing to the branch is enough.

## Payments (Stripe)

Until Stripe keys are set, storefront checkout runs in a clearly-labeled no-payment preview mode. To take real payments:

1. Create a [Stripe](https://stripe.com) account and copy your secret key (Developers → API keys).
2. On the VPS, edit `/etc/tinybiz.env` and uncomment `STRIPE_SECRET_KEY`. Optionally uncomment `STRIPE_WEBHOOK_SECRET` for webhooks — not required, the confirmation page verifies payment directly with Stripe.
3. `sudo systemctl restart tinybiz-api`

## Keyboard shortcuts

- `⌘K` / `Ctrl+K` — global search
- `g` then `d/o/p/i/a/c/t/e/m/s` — jump to Dashboard, Orders, Products, Inventory, Analytics, Customers, Tasks, Expenses, Manufacturing, Settings
