# 00 — Inventory (Phase 0, read-only)

_thetinymagicstudio.ca — security & commerce-readiness audit. All facts below were verified against source; anything not verifiable from source is marked **[live-box]**._

## Stack

| Layer | What | Evidence |
|---|---|---|
| Frontend | Vite 5 + React 18 SPA (TS strict, Tailwind, zustand). Client-side rendered — HTML shell carries no product data (your inference: confirmed). | `package.json`, `src/` |
| Backend | Node 22 + Express 4, ESM. Single process. | `server/index.js`, `server/package.json` |
| DB | **better-sqlite3** (WAL), one file. Synchronous, single-threaded → serializes request critical sections. | `server/db.js` |
| Mail | Separate `mail-bridge/` service (Resend/SMTP style), owner-configured bridge URL. | `mail-bridge/index.js` |
| Host | VPS `142.44.242.238`, nginx reverse proxy, **behind Cloudflare**. systemd units `tinymagic-api` (:4000, 127.0.0.1) + `tinymagic-mail` (:7071, 127.0.0.1). | `deploy.sh` |
| Deploy | `git reset --hard origin/main` + `npm ci` + build, **as root, via cron every 5 min**. | `deploy.sh:521-599` |
| Payments | Stripe (hosted Checkout) **and** PayPal (redirect) + Etsy order sync. **Both payment providers OFF in prod today** (`stripe:false, paypal:false`). | live `/api/store/catalog`; `stripe.js:13`, `paypal.js:14` |

## Route / endpoint map (auth · money · PII)

Legend: 🔓 public · 🔑 shopper session · 🛡️ admin/staff session · 💰 money · 👤 PII

**Storefront (public):**
- `GET /api/store/catalog` 🔓 — products + ratings. No PII.
- `POST /api/store/promo` 🔓 💰(read) — promo validity. Rate-limited.
- `POST /api/store/checkout` 🔓 💰👤 — **prices server-side** (see 01/02); creates order (mock) or provider session.
- `GET /api/store/order/:id` · `/by-session/:sid` · `/by-paypal/:ref` 🔓 👤 — returns order incl. name/email/address by **unguessable id**. Fulfilment gated on server-verified payment.
- `POST /api/store/track` 🔓 👤 — order by **number + email** (proof).
- `POST /api/store/subscribe` · `/notify-stock` 🔓 👤 — email capture.
- `POST /api/store/support/tickets` · `GET /:id` · `POST /lookup` · `/:id/reply` 🔓/🔑 👤
- `GET /api/store/reviews/:productId` 🔓 · `POST /api/store/reviews` 🔓/🔑 — **verified purchase required**.
- Shopper accounts: `signup/login/logout/me/password/forgot/reset/orders/claim` 🔓/🔑 👤
- `GET /product/:id` 🔓 — **server-side HTML** (OG + JSON-LD) injected into `dist/index.html`. Only server-rendered surface.
- `GET /robots.txt` · `/sitemap.xml` 🔓 — echo `req.get('host')`.

**Admin (cookie session):**
- `POST /api/auth/setup|login|logout|password|forgot|reset` 🔓/🛡️ — owner/staff.
- `GET /api/state` · `POST /api/ops` 🛡️ 💰👤 — the sync engine; **whole client object persisted per op** (mass-assignment surface).
- `POST /api/team/*` 🛡️(owner) — staff management (`requireOwner`).
- `POST /api/orders/:id/refund` 🛡️ 💰 — one-click refund through original charge.
- `POST /api/reviews/:id/{status,reply}` · `POST /api/support/:id/{reply,status,tags}` 🛡️
- `POST /api/uploads` 🛡️ · `GET /uploads/*` (doc_* gated on `req.user` only), `/api/backup` 🛡️(owner)
- `POST /api/discord/test` 🛡️(owner) · `/api/etsy/*` 🛡️(owner) · `POST /api/stripe/webhook` 🔓 (signature-gated).

## Data-flow / PII

Collected: customer name, email, shipping address, order notes; shopper account (email, bcrypt hash, saved address); newsletter subscribers (email); support ticket bodies; review name+email; mail-bridge `tracking.json` (email ↔ opens/clicks).
Rest: SQLite file `/var/lib/tinymagic`, `server/uploads/` (product photos public, `doc_*` business docs auth-gated), `mail-bridge/tracking.json`.
Shared with: Stripe/PayPal (payment), the shipping carrier (address on packing slip/labels), the mail provider behind the bridge.
Retention: **indefinite — no deletion/export path or retention routine** (see Finding P-2).

## Payment flow — where the charge amount is decided

```
client POST /checkout {items:[{productId,variantId?,qty}], promoCode?, contact}
  └─ priceCheckout()                      server/store-api.js:160-188
       ├─ buildLines(items, products)     server/store-math.js:65-101
       │    unitPrice = variant?.price ?? product.price   ← FROM SERVER PRODUCT RECORD (line 96-97)
       │    qty: Math.floor(Number), reject <1 || >999, re-check live stock
       ├─ promo re-looked-up server-side by CODE only     store-api.js:167-182
       └─ computePromoTotals()            store-math.js:134-148  (fixedOff capped at subtotal)
  └─ provider = stripe|paypal|mock (server-chosen)         store-api.js:343-349
  └─ Stripe/PayPal amount built from server totals; fulfilment via
     finalizePaid() ONLY after signed webhook OR server-side payment_status==='paid'
     (store-api.js:433-511)
```

**THE LINE:** `server/store-math.js:96-97` — unit price comes from the server's own product record; `server/store-api.js:160-188` never reads a price/amount/total/discount from `req.body`. **The client cannot influence the charged amount. Verified first-hand + by two independent agents.**

## Third-party / script inventory

- **No third-party browser scripts, fonts, pixels, analytics, or chat widgets.** No GA/GTM/Meta/Plausible. Self-hosted assets only. (Confirmed by grep of `index.html` + `src/`.)
- Server → outbound: Stripe API, PayPal API, Etsy API (env base), Frankfurter FX rates (fixed URL), the **owner-settable** mail-bridge URL and Discord webhook URL (SSRF surface — F-INJ-1/3).
- Cookies: only first-party essential sessions `tms_session` (staff) / `tms_shopper` (customer). No cookie banner required.

## Secrets inventory

- Runtime secrets in `/etc/tinymagic.env` + `/etc/tinymagic-mail.env` (chmod 600), **never in the repo**. `git ls-files` shows no `.env/.pem/.key`; `.gitignore` covers `server/*.db`, `uploads/`, `backups/`. **gitleaks over full history still owed (Phase 1).**
- Mail-bridge `SEND_TOKEN` generated at deploy. Stripe/PayPal keys commented out of the seed env (payments off).

## Trust boundaries

1. **Public internet → Express** (every storefront route). Hostile. Primary validation surface.
2. **Staff session → /ops & admin endpoints.** Semi-trusted; can mass-assign business objects (F-CHK-1).
3. **Owner/staff-settable config → server-side fetch** (mail-bridge/Discord URLs). SSRF crossing (F-INJ-1/3).
4. **GitHub `main` → root on the box** (auto-deploy). Supply-chain crossing (F-INF-2).
5. **Cloudflare edge → nginx → Express.** Real client IP / Origin trust (F-INF-1, F-AUTH-0).
