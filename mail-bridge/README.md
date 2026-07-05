# TinyBiz Mail Bridge ✉️

A tiny always-on service that accepts **newsletter send requests** from the TinyBiz web app and delivers them over **SMTP** using [nodemailer](https://nodemailer.com), so the app can send email even though it has no backend of its own.

It pairs with **Settings → Newsletter** in TinyBiz (Mail bridge URL + token).

## Why a separate service?

TinyBiz is a static web app with no backend, and a browser **cannot send email** — there's no SMTP in the browser, and putting mail credentials in client-side JavaScript would expose them to the world. This bridge runs on any always-on machine (a Raspberry Pi, a mini-PC, the shop's office computer, or a small cloud box), holds the SMTP credentials, and exposes a single URL the app can POST to.

```
TinyBiz in your browser ──HTTP/JSON──▶ Mail bridge (this) ──SMTP──▶ your recipients
```

## Try it with no SMTP (demo mode)

Zero dependencies — just Node 18+, no `npm install`:

```bash
node index.js --demo
```

In demo mode nothing is actually sent: each `/send` request is **logged** (subject, from, recipient count, first few addresses) and returns `{ ok: true, demo: true, sent: N }`. Demo mode also accepts **any token** (default `demo`), so you can wire up TinyBiz before you have real mail credentials.

Check it's alive:

```bash
curl -s http://localhost:7071/health
# {"ok":true,"service":"tinybiz-mail-bridge","mode":"demo"}
```

In TinyBiz, go to **Settings → Newsletter** and set the Mail bridge URL to `http://localhost:7071`.

## Run it for real

1. Install and configure:
   ```bash
   cd mail-bridge
   npm install                       # installs nodemailer
   cp config.example.json config.json
   # edit config.json — SMTP host/port/user/pass, a long random token, and the From identity
   npm start
   ```
2. In TinyBiz: **Settings → Newsletter → Mail bridge URL** = `http://<bridge-host>:7071`, and paste the same **token** you put in `config.json`. Compose a newsletter and send.

If a real SMTP host is configured (and you didn't pass `--demo`), the bridge sends for real. If no SMTP host is configured, it stays in demo mode so you can't accidentally spam anyone during setup.

### config.json

| Field | What it is |
|---|---|
| `port` | Port the bridge serves on (default `7071`) |
| `token` | Shared secret required on every `/send` request — make it long and random |
| `publicUrl` | Externally-reachable base URL for tracking links embedded in emails (e.g. `https://mail.myshop.com`). Defaults to `http://localhost:<port>`. **Tracking only works if recipients' mail clients can reach this URL** — see [Tracking & personalization](#tracking--personalization-v2) |
| `from.name` | Default sender name (the app can override per-send) |
| `from.email` | Default sender address |
| `smtp.host` | SMTP server hostname |
| `smtp.port` | SMTP port (`587` for STARTTLS, `465` for implicit TLS) |
| `smtp.secure` | `true` for port 465 (implicit TLS), `false` for 587/STARTTLS |
| `smtp.user` | SMTP username |
| `smtp.pass` | SMTP password / API key / app password |

You can also configure via env vars (handy for containers): `PORT`, `SEND_TOKEN`, `PUBLIC_URL`, and `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`. Env vars win over `config.json`.

### SMTP providers

- **Gmail** — use an **App Password**, not your account password. Turn on 2-Step Verification, then create an app password (Google Account → Security → App passwords) and use it as `smtp.pass`. Host `smtp.gmail.com`, port `587`, `secure: false`. Note Gmail's low daily send caps (~500/day) — fine for a small list, not a big blast.
- **Resend** — host `smtp.resend.com`, port `587`, user `resend`, pass = your API key.
- **Mailgun** — host `smtp.mailgun.org`, port `587`, user/pass from the domain's SMTP credentials.
- **SendGrid** — host `smtp.sendgrid.net`, port `587`, user `apikey`, pass = your API key.
- **Postmark** — host `smtp.postmarkapp.com`, port `587`, user/pass = your Server API token.

Any standards-compliant SMTP server works.

## API

- `POST /send` — send a personalized campaign. JSON body:
  ```json
  {
    "token": "your-shared-secret",
    "campaignId": "july-newsletter",
    "subject": "Hi {{first_name}}, this month at {{shop}}",
    "html": "<html><body><p>Hi {{first_name}}!</p>…<a href=\"{{unsubscribe}}\">Unsubscribe</a></body></html>",
    "text": "Hi {{first_name}}! … (optional plain-text fallback)",
    "from": { "name": "Nova Prints & Co.", "email": "hello@novaprints.example" },
    "replyTo": "hello@novaprints.example",
    "shop": "Nova Prints",
    "trackOpens": true,
    "trackClicks": true,
    "recipients": [
      { "email": "a@example.com", "firstName": "Ada" },
      { "email": "b@example.com", "name": "Blake Jones" }
    ]
  }
  ```
  - **Auth**: `token` must equal the configured token → otherwise `401 {ok:false, error:"Unauthorized"}`. (Demo mode accepts any token.)
  - **Required**: `subject`, `html`, `from.email`, and a non-empty `recipients` array → otherwise `400`.
  - The bridge sends **one personalized email per recipient** (no BCC). Each recipient's `firstName` (falling back to the first word of `name`, then `there`) fills the merge tags; each gets its own tracking token.
  - Missing `campaignId` is auto-generated; missing `firstName` becomes `there`. `trackOpens`/`trackClicks` default to `false` (off) when omitted, so pre-v2 callers keep working unchanged.
  - On success → `{ ok: true, sent: N, campaignId }` (or `{ ok: true, demo: true, sent: N, campaignId, sample: {...} }` in demo mode). The `sample` object gives ready-to-curl `open`/`click`/`unsubscribe` URLs built from the first recipient's token, so the tracking loop can be exercised without SMTP.
  - On SMTP/transport failure → `502 {ok:false, error:"…"}`.
- `GET /o/:token` — **open pixel.** Records an open for the token's recipient and returns a 1×1 transparent GIF (`image/gif`, `Cache-Control: no-store`). Unknown tokens still get the GIF so mail clients don't error.
- `GET /c/:token?u=<encoded-url>` — **click.** Records a click, then `302`-redirects to the decoded `u` (must be `http`/`https`; otherwise redirects to `publicUrl`).
- `GET /u/:token` — **unsubscribe.** Records an unsubscribe and returns a small friendly HTML confirmation page.
- `GET /stats?campaign=<id>` — aggregated tracking for a campaign (see below). Unknown campaign → all-zero counts with `ok:true`.
- `GET /health` → `{ ok: true, service: "tinybiz-mail-bridge", mode: "demo" | "smtp", campaigns: <count> }`.

CORS is open (`Access-Control-Allow-Origin: *`) on `/send`, `/stats`, and `/health` (plus the `OPTIONS` preflight) so the browser app can call them. The `/o` `/c` `/u` endpoints are hit by email clients/browsers directly (CORS doesn't apply). Request bodies are capped at ~2MB.

## Tracking & personalization (v2)

Instead of one BCC blast, the app POSTs a **template** with merge tags left intact plus a recipient list, and the bridge personalizes and sends **one email per recipient** — injecting per-recipient tracking so you can measure the campaign.

### Merge tags

The bridge substitutes these tags in `subject`, `html`, and `text`, per recipient:

| Tag | Replaced with |
|---|---|
| `{{first_name}}` / `{{ first_name }}` / `{{name}}` | the recipient's `firstName` (or first word of `name`, or `there`) |
| `{{shop}}` | the `shop` value from the request |
| `{{unsubscribe}}` | that recipient's unsubscribe link (`<publicUrl>/u/<token>`) |

Put `<a href="{{unsubscribe}}">Unsubscribe</a>` somewhere in your HTML so every recipient gets a working one-click opt-out.

### How tracking is injected

For each recipient the bridge generates a random tracking token and, if enabled:

- **`trackOpens`** — injects a 1×1 pixel `<img src="<publicUrl>/o/<token>">` just before `</body>` (appended if there's no body tag). Loading the image records an open.
- **`trackClicks`** — rewrites every real `http(s)` `<a href="…">` to route through `<publicUrl>/c/<token>?u=<original>`, which records the click and redirects. Anchors (`#`), `mailto:` links, and links already pointing at `publicUrl` (including the unsubscribe link) are left alone.

### `publicUrl` must be internet-reachable

Tracking links embedded in emails are fetched by the **recipient's** mail client / browser — not by your app. So `publicUrl` must be a base URL those clients can reach:

- Set it to an internet-reachable address (e.g. `https://mail.myshop.com`, ideally behind HTTPS) via `publicUrl` in `config.json` or the `PUBLIC_URL` env var.
- **LAN-only limitation:** if the bridge is only reachable on `localhost`/your LAN (the default `http://localhost:<port>`), external recipients' clients can't reach the tracking URLs, so opens/clicks/unsubscribes from them won't be recorded. A LAN-only bridge can still *send*, it just can't *track* outside the LAN.

### Stats

The app polls `GET /stats?campaign=<id>`:

```json
{
  "ok": true,
  "campaignId": "july-newsletter",
  "delivered": 120,
  "opens": 205,
  "uniqueOpens": 88,
  "clicks": 47,
  "uniqueClicks": 31,
  "unsubscribes": 3,
  "unsubscribedEmails": ["x@example.com", "…"]
}
```

`opens`/`clicks` count every event; `uniqueOpens`/`uniqueClicks` count distinct recipient addresses.

### Privacy, deliverability & persistence

- **Opens are approximate.** Open tracking relies on the pixel loading, and many clients block or preload remote images — notably **Apple Mail Privacy Protection**, which can inflate or suppress opens. Treat opens as a rough signal; clicks are more reliable.
- Include a real unsubscribe link (`{{unsubscribe}}`) — it's good practice and helps deliverability.
- **Persistence.** All tracking (tokens, delivered/opens/clicks/unsubscribes per campaign) is kept in memory and written to `mail-bridge/tracking.json`, so stats survive a restart. That file is git-ignored (it contains recipient addresses). Delete it to reset all tracking.

## Security model

The `token` is a **shared secret**, not real authentication — anyone who can reach the bridge URL and knows the token can send mail through your SMTP account. So:

- **Keep the bridge on localhost or your LAN**, or put it behind a reverse proxy with real auth / an allow-list if it must be exposed.
- Use a **long, random token** (e.g. `openssl rand -hex 24`) and treat it like a password.
- **Never commit `config.json`** — it holds your SMTP password and token. It's already in `.gitignore`; only `config.example.json` is committed.
- Because CORS is wide open, the token is the only thing standing between a stranger and your mail account — don't expose the bridge to the public internet without additional protection.

## Run it as a background service

Keep it running with `pm2`:

```bash
pm2 start index.js --name mail-bridge
pm2 save
```

…or a systemd unit that restarts on boot, so the newsletter feature is always available.

## Notes & gotchas

- **SMTP auth failures** are the most common problem. For Gmail this almost always means you used your login password instead of an **App Password**, or 2-Step Verification isn't on. Check the bridge's console output — nodemailer's error is returned in the `502` response.
- **Rate limits.** Providers cap sends per hour/day (Gmail ~500/day; transactional providers vary by plan). A big list can trip these and get you throttled or blocked.
- **One email per recipient.** v2 sends an individual, personalized message to each recipient (sequentially, to be gentle on SMTP) rather than one BCC blast — so a large list means a lot of sends. Mind your provider's per-hour/day caps; for very large lists, split the send across multiple requests and pause between them to respect rate limits.
- **Deliverability (SPF / DKIM / DMARC).** To avoid the spam folder, the `from.email` domain should have SPF and DKIM records that authorize your SMTP provider (and ideally DMARC). Sending "from" a domain you don't control will usually fail authentication and land in spam.
- **From vs. reply-to.** Some providers only let you send from a verified/authenticated address. If `from.email` differs from your authenticated SMTP identity, set `replyTo` and expect the provider to rewrite or reject the From.
- **Demo vs. real.** The bridge is in demo mode whenever `--demo` is passed **or** no `smtp.host` is configured — a safety net so setup mistakes log instead of send.
