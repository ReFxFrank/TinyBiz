# 06 — Residual Risks & TODO(frank)

Things the agent cannot fix or decide. Each has a recommendation and a severity; the legal/tax items need a professional — I do not sign off on them.

## Needs the live box (I could not verify from source)
| Item | Why it matters | Action |
|---|---|---|
| Stripe/PayPal keys + `STRIPE_WEBHOOK_SECRET` actually set | Without the webhook secret, fulfilment leans entirely on the return-URL poll (works, but no async safety net) | Confirm in `/etc/tinymagic.env` |
| nginx real-IP correct behind Cloudflare | All per-IP rate limits are wrong until fixed (F-INF-1) | Add CF real-ip config + verify `req.ip` |
| Origin locked to Cloudflare | Else WAF/DDoS/rate-limit all bypassable (F-INF-5) | Firewall to CF ranges / Tunnel |
| Deploy cron active? Services as root? | Determines whether F-INF-2 is live | `crontab`/`systemctl show … -p User` |
| DNSSEC · CAA · SPF/DKIM/DMARC · dangling CNAMEs · `security.txt` | Domain spoofing, phishing your customers, subdomain takeover, cert-issuance abuse (F-INF-8) | Registrar + Cloudflare + mail provider |
| Cloudflare SSL mode = Full (strict) | "Flexible" causes redirect loops / plaintext origin | Cloudflare dashboard |
| Backup off-box + restore rehearsed | Same-disk backup doesn't survive the disk (F-INF-6) | Set `BACKUP_PUSH_CMD`, run one restore |

## Accepted-by-design (documented, low residual)
- Public order/ticket/review lookups are **bearer-grade** by unguessable id (64-bit). Enumeration is infeasible; residual risk is link leakage via history/referrer. Acceptable; optionally mask address on the public payload.
- In-memory rate limiter resets on deploy. Acceptable for basic brute-force hygiene once F-INF-1 (real IP) is fixed; persist for auth routes if you want durability.
- better-sqlite3 single-process serialization makes the stock-race and coupon-race benign **in the current topology**. If you ever run multiple workers, F-PAY-3/F-BIZ-2 become real — re-open them.

## TODO(frank) — legal / tax (a professional must confirm; NOT security severity)
1. **Terms of Sale/Service page** — none exists (`App.tsx` has no `/terms`). Biggest legal-readiness gap for taking real money. → e-commerce lawyer.
2. **PIPEDA / Quebec Law 25** — no data-subject access/correction/**deletion** path, no retention schedule, no privacy-officer contact, no breach process; PII retained indefinitely. The default privacy copy is owner-editable but thin. → privacy professional; confirm Law 25 applicability (any QC customers).
3. **CASL** — welcome email (with a promo, so a CEM) ships with **no unsubscribe**; back-in-stock plausibly exempt (recipient requested it); newsletter signup is single opt-in with weak consent proof; sender mailing address depends on an owner field that can be blank. → CASL professional. Penalty exposure is real but the $10M figure is a statutory maximum, not a realistic AMP for a small studio.
4. **Sales tax** — app has per-province GST/HST/PST math, but registration is your call at the $30k small-supplier threshold. → accountant; wire Stripe Tax once registered.
5. **Privacy-policy accuracy** — default copy names "Stripe" though payments are off and PayPal is also supported; discloses no email open/click tracking (the mail bridge does per-recipient tracking). Fix wording when a processor goes live.

## What a full engagement would still add (out of Phase 0 scope)
- `gitleaks --all` over full git history + `osv-scanner` + a committed CycloneDX SBOM + Dependabot (security-only).
- Live `axe`/keyboard pass on the purchase path; SSL Labs (target A+) and securityheaders.com (target A+) once headers ship.
- A tested incident-response runbook (`05-RUNBOOK.md`) — key rotation, backup restore, contacts — written alongside the fixes.
