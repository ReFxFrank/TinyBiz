# 01 — Threat Model (Phase 0)

## Assets (what an attacker wants)
1. **Money** — free/cheap goods, fraudulent refunds, card-testing through the merchant account.
2. **Customer PII** — names, emails, home shipping addresses, order history (orders, shop_accounts, tickets, reviews, mail tracking).
3. **The owner's account / the box** — admin takeover → all of the above + defacement + persistence.
4. **Deliverability / reputation** — spoofing the domain, spamming the list, getting the Stripe account frozen.

## Attackers
- **A1 — Anonymous internet user.** Can call any public endpoint, set any request header, follow any link. (Most dangerous class here.)
- **A2 — Malicious/curious customer** with a shopper account.
- **A3 — Low-privilege staff member** (e.g. only the `newsletter` or `settings` section perm).
- **A4 — Supply chain / GitHub** — anyone who can push to `main`, steal the deploy token, or poison an npm dependency.
- **A5 — Someone who learns the origin IP** (bypasses Cloudflare).

## Abuse cases → where they land
| # | Attacker goal | Attacker | Status |
|---|---|---|---|
| 1 | Pay $2 for a $60 charm (tamper price/qty/discount) | A1 | **Blocked** — server-authoritative pricing (buildLines) |
| 2 | Get goods without paying (forge success redirect / webhook) | A1 | **Blocked** — fulfilment gated on signed webhook / server-verified `payment_status` |
| 3 | Read another customer's order/address | A1/A2 | **Blocked** — session-driven filters + unguessable ids + number+email proof |
| 4 | **Take over the owner account** (poison reset link) | A1 | **OPEN — F-AUTH-0 (High)**: forgot-password link origin taken from attacker `Origin` header |
| 5 | Root the box | A4 | **OPEN — F-INF-2 (High compounded)**: root services + unattended root deploy from mutable `main`, no signing |
| 6 | Clickjack the admin panel / MIME-sniff an upload into XSS | A1 | **OPEN — F-INF-3 (Medium)**: zero security headers (no CSP/X-Frame/nosniff/HSTS) |
| 7 | Exfiltrate the whole customer list + mail token | A3 | **OPEN — F-INJ-1 (Medium)**: `newsletter`-perm staff repoints mail-bridge URL |
| 8 | Bypass Cloudflare WAF / lock out other users' rate-limit buckets | A1/A5 | **OPEN — F-INF-1 (Medium)**: limiter keys on Cloudflare edge IP; origin not locked to CF |
| 9 | Oversell inventory silently | A1 | **OPEN — F-BIZ-1 (Medium)**: duplicate cart lines bypass the shortfall flag |
| 10 | Card-test through the merchant account | A1 | **Latent (Medium once live)** — F-PAY-1: only an IP rate limit, no Turnstile/Radar |
| 11 | Flood fake orders / drain stock today | A1 | **OPEN (Medium today)** — F-PAY-4: mock checkout creates real orders while payments off |
| 12 | Spoof the shop's domain to phish customers | A1 | **[live-box]** — SPF/DKIM/DMARC unverifiable from source (F-INF-8) |

## Guardrail: the two existential checks (both PASS)
- **Charge amount authority** is server-side (`store-math.js:96-97`). ✅ verified first-hand.
- **Fulfilment gated on server-verified payment**, never the client redirect (`store-api.js:464, 501`). ✅ verified first-hand.

Everything else is severity-ordered in `02-FINDINGS.md`.
