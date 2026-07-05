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
| `from.name` | Default sender name (the app can override per-send) |
| `from.email` | Default sender address |
| `smtp.host` | SMTP server hostname |
| `smtp.port` | SMTP port (`587` for STARTTLS, `465` for implicit TLS) |
| `smtp.secure` | `true` for port 465 (implicit TLS), `false` for 587/STARTTLS |
| `smtp.user` | SMTP username |
| `smtp.pass` | SMTP password / API key / app password |

You can also configure via env vars (handy for containers): `PORT`, `SEND_TOKEN`, and `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`. Env vars win over `config.json`.

### SMTP providers

- **Gmail** — use an **App Password**, not your account password. Turn on 2-Step Verification, then create an app password (Google Account → Security → App passwords) and use it as `smtp.pass`. Host `smtp.gmail.com`, port `587`, `secure: false`. Note Gmail's low daily send caps (~500/day) — fine for a small list, not a big blast.
- **Resend** — host `smtp.resend.com`, port `587`, user `resend`, pass = your API key.
- **Mailgun** — host `smtp.mailgun.org`, port `587`, user/pass from the domain's SMTP credentials.
- **SendGrid** — host `smtp.sendgrid.net`, port `587`, user `apikey`, pass = your API key.
- **Postmark** — host `smtp.postmarkapp.com`, port `587`, user/pass = your Server API token.

Any standards-compliant SMTP server works.

## API

- `POST /send` — JSON body:
  ```json
  {
    "token": "your-shared-secret",
    "subject": "This month at Nova Prints",
    "html": "<h1>Hi!</h1><p>News…</p>",
    "text": "Hi! News… (optional plain-text fallback)",
    "from": { "name": "Nova Prints & Co.", "email": "hello@novaprints.example" },
    "replyTo": "hello@novaprints.example",
    "recipients": [
      { "email": "a@example.com", "name": "Ada" },
      { "email": "b@example.com" }
    ]
  }
  ```
  - **Auth**: `token` must equal the configured token → otherwise `401 {ok:false, error:"Unauthorized"}`. (Demo mode accepts any token.)
  - **Required**: `subject`, `html`, `from.email`, and a non-empty `recipients` array → otherwise `400`.
  - Recipients are sent as **BCC** in a single message, so nobody sees anyone else's address. `From` is your sender, `To` is set to your own sender address.
  - On success → `{ ok: true, sent: N }` (or `{ ok: true, demo: true, sent: N }` in demo mode).
  - On SMTP/transport failure → `502 {ok:false, error:"…"}`.
- `GET /health` → `{ ok: true, service: "tinybiz-mail-bridge", mode: "demo" | "smtp" }`.

CORS is open (`Access-Control-Allow-Origin: *`) so the browser app can POST to it. Request bodies are capped at ~2MB.

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
- **BCC batch size.** Most SMTP servers reject a single message with too many recipients (often ~50–100 BCC). For large lists, **chunk the recipients** into batches and send several requests, pausing between them to respect rate limits. TinyBiz can split a big list for you, but keep provider limits in mind.
- **Deliverability (SPF / DKIM / DMARC).** To avoid the spam folder, the `from.email` domain should have SPF and DKIM records that authorize your SMTP provider (and ideally DMARC). Sending "from" a domain you don't control will usually fail authentication and land in spam.
- **From vs. reply-to.** Some providers only let you send from a verified/authenticated address. If `from.email` differs from your authenticated SMTP identity, set `replyTo` and expect the provider to rewrite or reject the From.
- **Demo vs. real.** The bridge is in demo mode whenever `--demo` is passed **or** no `smtp.host` is configured — a safety net so setup mistakes log instead of send.
