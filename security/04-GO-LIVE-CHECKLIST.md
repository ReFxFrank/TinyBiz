# 04 — Go-Live Checklist (a tired human can follow this at 11pm)

Order matters. Do the **BLOCKERS** before taking a single real payment. `[code]` = a fix in this repo (needs your approval first). `[you]` = something only you can do on the live box / dashboard / with a lawyer.

## 🔴 BLOCKERS — do not accept real money until every box is ticked

- [ ] `[code]` **F-AUTH-0** Reset links no longer built from request headers (owner-takeover fix). Pin `PUBLIC_URL`.
- [ ] `[you]` Set `PUBLIC_URL=https://thetinymagicstudio.ca` in `/etc/tinymagic.env`; `systemctl restart tinymagic-api`.
- [ ] `[code]` **F-INF-3** Security headers live in nginx (CSP report-only first, then enforce; HSTS after HTTPS confirmed; nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy).
- [ ] `[you]` **F-INF-2** Services no longer run as root (dedicated user + sandbox directives); deploy cron gated/signed or disabled until you press deploy. Confirm `systemctl show tinymagic-api -p User` ≠ root.
- [ ] `[you]` **F-INF-5** Origin firewalled to Cloudflare ranges (or Cloudflare Tunnel); direct-to-origin blocked. `curl https://<origin-ip>` from outside → refused.
- [ ] `[code]` **F-INF-1** nginx `real_ip_header CF-Connecting-IP` + `set_real_ip_from` CF ranges, so rate limits key on the real client.
- [ ] `[code]` **F-INJ-1 / F-INJ-3** Mail-bridge + Discord URLs validated (https + private-host denylist) or pinned from env.
- [ ] `[code]` **F-BIZ-1** Duplicate cart lines aggregated so oversell can't happen silently.
- [ ] `[code]` **F-PAY-4** Mock checkout made non-committing (or the storefront checkout is only reachable once a real provider is on).
- [ ] `[you]` **F-INF-6** `BACKUP_PUSH_CMD` set to an **encrypted, off-box** target, and **one restore rehearsed** into a scratch path.
- [ ] `[you]` **Stripe/PayPal**: keys in `/etc/tinymagic.env`, `STRIPE_WEBHOOK_SECRET` set, webhook endpoint added in Stripe (`/api/stripe/webhook`), **Radar** rules on, statement descriptor = `TINYMAGIC`, bank + payout set.
- [ ] `[you]` **F-PAY-1** Cloudflare **Turnstile** in front of `/api/store/checkout`.
- [ ] `[you]` **Email auth (F-INF-8)**: SPF (`include:` your provider, `~all`), DKIM CNAMEs valid, DMARC `p=quarantine`+`rua`. Score ≥9/10 on mail-tester. Otherwise receipts spam-file and your domain is spoofable.
- [ ] `[you]` **Legal (P-1/P-2)**: Terms of Sale page published + a real business mailing address on the site, and a privacy policy with data-subject rights/retention/contact — both reviewed by a Canadian e-commerce lawyer. `TODO(frank)`.
- [ ] `[you]` **Tax**: confirm GST/HST registration status with your accountant; wire Stripe Tax once registered. `TODO(frank)`.

## 🟠 STRONGLY RECOMMENDED (before scaling traffic)
- [ ] `[code]` F-INJ-2 doc uploads gated on the `documents` perm.
- [ ] `[code]` F-CHK-1 field whitelist on `/ops` order/product writes; refund cap from the payment record.
- [ ] `[code]` F-AUTH-1 bcrypt cost 12 + rehash-on-login · F-AUTH-2/3 kill the signup/login enumeration oracles.
- [ ] `[code]` F-PAY-2/3 idempotency keys + atomic `UPDATE … WHERE order_id IS NULL`.
- [ ] `[code]` F-PRIV-1 unsubscribe suppression persisted to the app DB.
- [ ] `[code]` F-INJ-4 upload byte-sniff + `Content-Disposition: attachment` for docs.
- [ ] `[you]` DNSSEC on · CAA restricting issuance to letsencrypt · no dangling CNAMEs · publish `/.well-known/security.txt` · certbot given a real notification email + renewal timer confirmed · Cloudflare SSL mode = **Full (strict)**.
- [ ] `[you]` Rotate any secret that was ever committed (gitleaks history scan in Phase 1 will list them; none found in the working tree).
- [ ] `[you]` Error tracking (Sentry) with **PII scrubbing on**; alerts on webhook/payment failure + 5xx spikes; uptime monitor.

## 🟢 POLISH (schedule it)
- [ ] F-AUTH-4 shorter shopper sessions · F-INF-4 tighten bridge CORS · F-INF-7 persistent rate-limit store · F-INF-9/F-INJ-5 pin host in SEO output · F-ETSY-1 sanitize Etsy receipt fields · F-A11Y-1/2 + live axe pass · Info items.

## The dress rehearsal (run twice: desktop, then phone)
1. Browse → cart → checkout → **pay with a Stripe test card** → land on confirmation.
2. Confirm: order appears in Admin → Orders as **Paid via Stripe**; receipt email arrives; Discord pings (if set).
3. Refund it from the order drawer → refund email arrives.
4. Then **one real live-mode purchase with a real card** → refund it → confirm the descriptor reads `TINYMAGIC` and the payout lands.
5. Re-verify checkout still works after **every** infra/header change (regression it, then regression it again).
