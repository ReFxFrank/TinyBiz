# 02 — Findings (Phase 0, severity-ordered)

Method: 7 parallel dimension auditors read the source; every Critical/High finding was re-checked by an independent skeptic instructed to **refute** it; a completeness critic then hunted for missed surface. Severities below are **post-verification** (the auditors' first-pass ratings were corrected downward where a control neutralised them, and the reset-poisoning issue was added by the critic). The two most important storefront controls — server-authoritative pricing and webhook-gated fulfilment — were additionally verified by me, first-hand, and **PASS**.

Status key: **OPEN** (fix proposed, not yet applied — Phase 0 is read-only) · **verified** (code path traced) · **[live-box]** (needs the running server/DNS to confirm).

Counts (open, post-verification): **High 2 · Medium 11 · Low 10 · Info 6.** Zero Critical as isolated findings; F-INF-2 is High and reaches Critical blast-radius when its two halves combine.

---

## HIGH

### F-AUTH-0 — Password-reset link poisoning → owner account takeover
**Severity: High** · verified first-hand · **the #1 fix**
**Where:** `server/auth.js:180-181`; `server/shop-accounts.js:217-227`
**What:** The forgot-password handlers build the reset link as `` `${req.headers.origin || req.get('host')}/admin?reset=${token}` `` and email it to the account owner. `req.headers.origin` is fully attacker-controlled and nginx passes it through untouched (it pins `Host`, not `Origin`).
**Reproduce:** `POST /api/auth/forgot {email: owner@theirshop}` with header `Origin: https://evil.com`. The **owner** receives a genuine email from their own shop whose "Choose a new password" button is `https://evil.com/admin?reset=<valid 1-hour token>`. Owner clicks → evil.com logs the token → attacker `POST /api/auth/reset {token, password}` before it expires → owner's password is reset to the attacker's.
**Impact:** Unauthenticated remote takeover of the owner (or any staff/shopper) account. Works today, payments irrelevant. Requires the victim to click a link that legitimately came from their own store — highly plausible.
**Fix:** Derive the link base from a server-configured constant (`PUBLIC_URL` env / `settings` canonical host), never from request headers. If a header must be used, allowlist it against the known host. **[live-box]** also confirm Cloudflare/nginx don't need to strip inbound `Origin`.
**Rollback:** single-line revert per handler; no data migration.

### F-INF-2 — Unattended **root** auto-deploy from mutable `main` + **root** services, no signing/sandboxing (compounded)
**Severity: High (each half Medium; combined blast-radius Critical)** · verified (2 skeptics CONFIRMED)
**Where:** `deploy.sh:189-196, 289-298` (units `User=root`, no sandbox); `deploy.sh:521-599` (root cron every 5 min: `git reset --hard origin/main` → `npm ci` → build → re-exec updated `deploy.sh` as root)
**What:** Both systemd services run as **root** with zero hardening (`NoNewPrivileges`/`ProtectSystem`/`PrivateTmp`/`CapabilityBoundingSet` all absent). A root cron pulls GitHub `main` verbatim and runs `npm ci` (lifecycle scripts as root) and re-execs the pulled `deploy.sh` as root — **no commit signing, no dependency pinning/provenance, no manual gate.**
**Reproduce:** Push to `ReFxFrank/TinyBiz` main (or steal the GitHub token, or land a malicious transitive npm dep) → unattended **root** code execution on the VPS within 5 minutes.
**Impact:** Any code-execution bug in the API, the mail bridge, or a dependency runs as **uid 0** → reads every secret (Stripe live key once set, SMTP creds, SEND_TOKEN), tampers with any file, installs persistence. No privilege boundary between the internet-facing process and the host.
**Honest downgraders (why each half alone is Medium):** there is no *standalone* unauthenticated RCE in the current tree (uploads are auth-gated with server-generated filenames), and the deploy cron is **opt-in** (`--install-cron`) — its activation on the live box is **[live-box]**-dependent. But the *combination* removes all containment, so I score the cluster **High** and flag the compounded risk as Critical-class.
**Fix:** (a) run both services as a dedicated unprivileged user (or `DynamicUser=yes`) with `NoNewPrivileges/ProtectSystem=strict/PrivateTmp/ReadWritePaths=/var/lib/tinymagic`; (b) gate deploys behind signed tags or a manual step, drop build/`npm ci` off root, and require review before code reaches the deploy branch.
**Rollback:** systemd unit changes revert by re-running the prior unit template + `daemon-reload`; documented before applying.

---

## MEDIUM

### F-INF-3 — No HTTP security headers at all
**Medium** · verified. `deploy.sh` nginx block + `server/index.js` set **none** of CSP, HSTS, X-Content-Type-Options, X-Frame-Options/frame-ancestors, Referrer-Policy, Permissions-Policy, COOP (only `app.disable('x-powered-by')`).
**Impact:** cookie-authed `/admin` is clickjackable; `/uploads/*` (accepts pdf/csv/txt) can be MIME-sniffed into an executing payload same-origin; no HSTS → SSL-strip on first hit; no CSP defence-in-depth for the SPA + server-rendered `/product/:id`.
**Fix:** shared nginx header block on `:80` and `:443` (`always`): HSTS (after HTTPS confirmed), `nosniff`, `X-Frame-Options DENY`/CSP `frame-ancestors 'none'`, `Referrer-Policy strict-origin-when-cross-origin`, `Permissions-Policy`, COOP, and a CSP tuned to the SPA (+ Stripe origins before go-live). Deploy CSP in `Report-Only` first.

### F-INF-1 — Rate limiter keys on Cloudflare's edge IP, not the real client
**Medium** · verified. Behind Cloudflare, nginx `$remote_addr` is a Cloudflare IP; the real client is in `CF-Connecting-IP`. `deploy.sh` sets `X-Forwarded-For $remote_addr` and configures **no** `set_real_ip_from`/`real_ip_header CF-Connecting-IP`; `trust proxy 1` → `req.ip` = Cloudflare edge IP; `ratelimit.js:22` keys buckets on it.
**Impact:** one abuser exhausts the login/checkout/forgot buckets for **every** visitor sharing that edge (collateral lockout), and the limiter can't distinguish clients — undermining the brute-force protection it exists for.
**Fix:** nginx `set_real_ip_from <Cloudflare ranges>; real_ip_header CF-Connecting-IP; real_ip_recursive on;` — **and** lock the origin to Cloudflare (F-INF-5) so `CF-Connecting-IP` can't be spoofed direct-to-origin.

### F-INJ-1 — Mail-bridge URL is an unvalidated server-side fetch → SSRF **+ customer-list/token exfiltration** by non-owner staff
**Medium** · verified. `newsletterSettings.mailBridgeUrl` is settable by any staff with the `newsletter` perm (`perms.js:97`) with **zero** scheme/host validation; `email.js:206-224` / `newsletter-scheduler.js:44-63` then POST to `${base}/send-one|/send` carrying the `mailBridgeToken` **and the full recipient list (every customer's email + name)**.
**Impact:** a low-privilege insider points the URL at their own host → one send exfiltrates the entire customer PII list + the bridge credential, and gives blind SSRF into the VPS/cloud-metadata/internal net (auto-triggered by normal shop activity).
**Fix:** require `https://`, deny private/link-local/loopback hosts (169.254/16, 127/8, 10/8, 172.16/12, 192.168/16, ::1, `.internal`), or pin the bridge host from server env rather than owner/staff-editable DB state; restrict delivery settings to owner.

### F-INF-5 — Origin nginx listens on all interfaces, not locked to Cloudflare
**Medium** · likely (config-verified; live firewall state **[live-box]**). `deploy.sh:406-409` listens `0.0.0.0`; only `ufw allow 'Nginx Full'`, no `allow <CF ranges>; deny all;`. Anyone who learns the origin IP hits it directly, **bypassing Cloudflare WAF/DDoS/rate-limiting** and enabling `CF-Connecting-IP` spoofing.
**Fix:** firewall the origin to Cloudflare's published ranges (ufw/nftables) or use Cloudflare Tunnel; enable Authenticated Origin Pulls (mTLS).

### F-INF-6 — Backups unencrypted, offsite off by default, restore untested
**Medium** · verified. `backup.js` writes to the **same disk** as the DB; off-box push (`BACKUP_PUSH_CMD`) is seeded commented-out; archives are unencrypted; `RESTORE.md` states the restore has not been rehearsed. Whether the operator set `BACKUP_PUSH_CMD`/ran a restore is **[live-box]**.
**Impact:** disk loss/ransomware destroys DB + backups together; unencrypted business-doc archive if later shipped offsite; unverified restore = discovering a broken procedure during a real outage.
**Fix:** enable an encrypted off-box push by default (age/gpg or encrypted rclone remote), and rehearse one documented restore into a scratch path at go-live.

### F-INJ-2 — Business-document uploads (`doc_*`) are authentication-gated, not authorization-gated
**Medium** · verified. `uploads.js:50-55` only checks `req.user` — **any** logged-in staff (even without the `documents` perm) can `GET /uploads/doc_<name>` (tax/supplier files). The URL is hidden from their `/state` sync but the object store does no per-permission check; filenames add only ~40 bits.
**Fix:** gate `doc_*` on `computeAccess(req.user)` having `documents` (or role owner), not merely on a session.

### F-BIZ-1 — Duplicate cart line items oversell stock **with no shortfall flag**
**Medium** · verified. `buildLines` validates each line independently, so `items:[{X,qty:5},{X,qty:5}]` against stock 5 passes both; the shortfall pre-check also reads original stock per line → **no ⚠ Oversold note, no owner alert**; stock floors to 0 while the order records 10 units.
**Impact:** silent oversell of any product/variant, corrupted inventory, no warning to the owner. Single crafted request; not concurrency- or payment-dependent.
**Fix:** aggregate requested qty per `(productId, variantId)` before the availability check (and/or accumulate a running decrement in the shortfall pre-check so it routes through the existing loud oversold path).

### F-PAY-1 — Card-testing defense is an in-memory per-IP rate limit only (no Turnstile/Radar)
**Medium (latent — matters the moment Stripe/PayPal go live)** · verified. `/api/store/checkout` mints a provider session per request; the sole gate is `30/15min` per `req.ip` (and that IP is wrong per F-INF-1). No captcha/Turnstile/Radar anywhere in the tree.
**Fix:** put Cloudflare Turnstile in front of checkout **and** enable Stripe Radar rules before flipping `stripe:true`; tighten the ceiling; back the limiter with a shared store.

### F-CHK-1 — `applyOps` mass-assignment: staff can rewrite order financials (which feed the refund cap)
**Medium** · verified. `state.js:180` spreads the client `op.item` straight into the DB with **no field whitelist**. A staffer with the `orders` perm can set `unitPrice/taxCollected/shippingCharged/discountTotal/refunds/payment` on an order — corrupting reporting and **raising the server-side refund cap** (or zeroing `refunds[]` to re-refund). Bounded by the provider refusing to over-refund (unverified from code) and by the actor already being semi-trusted; **does not** enable role escalation (auth tables aren't syncable).
**Fix:** whitelist accepted fields per collection in `applyOps` (reject client `unitPrice/tax/shipping/discount/refunds/payment` on order upserts; recompute derived financials). Compute the refund cap from the immutable payment record, not the mutable order doc.

### F-PAY-4 — Mock checkout creates real orders + decrements stock, unauthenticated (live today)
**Medium (today, because payments are OFF)** · verified. With no provider configured, `/checkout` runs `finalizeOrder` immediately (`payment:none`) — writing a real order, decrementing stock, incrementing promo uses, alerting — from an unauthenticated POST, throttled only by 30/15min.
**Fix:** make mock mode non-committing (don't decrement stock / count promo uses for `provider:none`), or gate mock checkout behind an admin/preview flag so the public shop can't create orders while payments are off.

### F-PRIV-1 — Newsletter unsubscribe suppression lives only in the bridge's `tracking.json` (CASL durability)
**Medium** · likely. Unsubscribes are recorded only in the mail-bridge file and never synced back to the app `subscribers` list; if `tracking.json` is lost/reset/redeployed to a fresh dir, unsubscribed people can be emailed again → CASL violation, and the admin view misrepresents who's suppressed.
**Fix:** persist unsubscribes authoritatively (sync `/stats` unsubscribes back into `subscribers.status`, or have the bridge write the shared DB); include `tracking.json` in backups.

---

## LOW (hardening / defence-in-depth — abridged; full detail in workflow output)

- **F-INJ-3** — Discord webhook is a blind SSRF settable by `settings`-perm staff (http(s)-only, no token forwarded). Same host-denylist fix as F-INJ-1.
- **F-AUTH-1** — Password hashing is **bcrypt cost 10** everywhere (brief wants ≥12). Raise to 12 + rehash-on-login.
- **F-AUTH-2** — Shopper **signup** is an account-enumeration oracle (409 `email_taken` vs 200) that also confirms owner/staff emails. De-branch the response / email-verify.
- **F-AUTH-3** — Login has a bcrypt **short-circuit timing** oracle (no hash computed for unknown emails). Compare against a fixed dummy hash on the absent-user path.
- **F-AUTH-4** — Shopper sessions live **180 days** with sliding renewal, no absolute cap. Shorten / add absolute lifetime.
- **F-PAY-2** — No `Idempotency-Key` on Stripe/PayPal creation; double-submit → duplicate sessions/coupons (not a double charge).
- **F-PAY-3** — Exactly-once fulfilment relies on single-process synchronous execution (safe today); no atomic `UPDATE … WHERE order_id IS NULL`/UNIQUE guard → would double-fulfil under multi-process. Add the compare-and-set.
- **F-BIZ-2/3** — Single-use/max-uses coupon TOCTOU across the parked-payment window (latent, paid path only); mock checkout has no idempotency key (double-submit → duplicate order).
- **F-INJ-4** — Upload type trusts the client `Content-Type` (not byte-sniffed); allow-list excludes SVG/HTML so stored-XSS is largely closed. Sniff magic bytes + `nosniff` + `Content-Disposition: attachment` for non-images.
- **F-INF-4** — Mail bridge returns `Access-Control-Allow-Origin: *` (no credentials, so no takeover pattern — hygiene). Reflect a specific origin.
- **F-INF-7** — In-memory rate limiter resets on every restart/redeploy (5-min deploy poll wipes counters). Persist counters for auth/forgot routes.
- **F-INF-9 / F-INJ-5** — Host-header reflection into `sitemap.xml`/`robots.txt`/OG `og:url` (cache/canonical poisoning if origin hit directly). Pin the host.
- **F-ETSY-1** _(critic; unaudited path)_ — Etsy-ingested receipt fields flow **unsanitized** into DB + new-order email (same CR/LF header-injection class). Connect flow (PKCE+state, owner-gated) is fine. Sanitize on ingest.
- **F-A11Y-1/2** — Checkout field errors not wired to inputs (`aria-invalid`/`aria-describedby`); currency trigger suppresses focus outline. Fix ARIA + focus-visible ring. **A real axe run on the live site is still owed.**

## INFO (noted, no exploit path found)
- Reset-token compare is SQL equality not `timingSafeEqual` — **not exploitable** (256-bit single-use tokens).
- Stripe-Signature parser keeps only the last `v1` value → could reject webhooks **during secret rotation** (fails closed; availability only).
- Public order-confirmation returns full PII by unguessable id — bearer-grade link (leak-via-history risk, not enumeration).
- Ticket-by-id lookup has no rate limiter — enumeration infeasible (64-bit ids); add limiter for parity.
- Cannot verify from source: live Stripe/webhook secrets present, nginx real-IP correctness, DNSSEC/CAA/SPF/DKIM/DMARC, dangling CNAMEs, `security.txt` (only robots/sitemap served, and robots discloses `/admin`).

---

## What I explicitly did NOT test (honesty)
- No live/dynamic testing against production (read-only source audit + first-hand code tracing only). No requests were fired at the live site, DNS, Stripe, PayPal, Etsy, or Cloudflare.
- No `gitleaks`/`osv-scanner`/SBOM yet (Phase 1 — scanners not installed in this env).
- DNS/email posture, TLS negotiation, Cloudflare SSL mode, firewall state, and whether the deploy cron is active are all **[live-box]** and unverified.
- No `axe`/screen-reader run on the live purchase path (static review only).
- The CASL/PIPEDA/Law-25/tax and Terms-of-Service items are **legal-readiness**, not security severity; they need a Canadian e-commerce professional (see `06-RESIDUAL-RISKS.md`).
