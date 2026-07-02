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
- **Zustand** (persisted to localStorage) — the app ships with a rich seeded demo business, *Nova Prints & Co.*

## Getting started

```bash
npm install
npm run dev        # start the dev server
npm run build      # typecheck + production build
npm run preview    # preview the production build
```

The app seeds itself with ~6 months of demo data on first load. Reset it anytime from **Settings → Danger zone**.

## Keyboard shortcuts

- `⌘K` / `Ctrl+K` — global search
- `g` then `d/o/p/i/a/c/t/e/m/s` — jump to Dashboard, Orders, Products, Inventory, Analytics, Customers, Tasks, Expenses, Manufacturing, Settings
