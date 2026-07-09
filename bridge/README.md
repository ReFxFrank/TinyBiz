# Tiny Magic Studio Printer Bridge 🖨️

A tiny always-on service that reads **live status from Bambu Lab printers** over their local MQTT broker and serves it as JSON, so the Tiny Magic Studio web app can auto-update whether each printer is **printing** or **idle**.

It is **read-only** — it only *reads* status and never sends print or control commands, so it's unaffected by Bambu's 2025 "Authorization Control System" (which only gates control, not monitoring).

## Why a separate service?

Tiny Magic Studio is a static web app with no backend, and a browser can't talk to a printer directly (raw MQTT over TLS on port 8883, self-signed cert, LAN-only). This bridge runs on any always-on machine on the same network as your printers — a Raspberry Pi, a mini-PC, or the shop's office computer — holds the printer connections, and exposes a simple URL the browser can poll.

```
Printer(s) ──MQTT/TLS──▶ Bridge (this) ──HTTP/JSON──▶ Tiny Magic Studio in your browser
```

## Try it with no printer (demo mode)

Zero dependencies — just Node 18+:

```bash
node index.js --demo
```

Then open <http://localhost:7070/status>. It simulates three printers cycling through printing/idle so you can wire up Tiny Magic Studio before touching real hardware. In Tiny Magic Studio, go to **Settings → Printer sync** and set the bridge URL to `http://localhost:7070`.

## Run it for real

1. **Enable LAN Mode** on each printer (Settings → Network → *LAN Only Mode* or *Developer Mode*), and note its **Access Code** and **Serial Number** (both shown on the printer's network screen; the access code is also in Bambu Studio's device panel).
2. Install and configure:
   ```bash
   cd bridge
   npm install                       # installs the mqtt client
   cp config.example.json config.json
   # edit config.json — one entry per printer
   npm start
   ```
3. In Tiny Magic Studio: **Settings → Printer sync → Bridge URL** = `http://<bridge-host>:7070`, then on the **Manufacturing** page click **Sync live status**. Map each machine to a printer by pasting the printer's **Serial** into the machine's *Live sync ID* (Manufacturing → machine menu → Edit).

### config.json

| Field | What it is |
|---|---|
| `port` | Port the bridge serves on (default `7070`) |
| `printers[].id` | Printer **serial number** — must match the machine's *Live sync ID* in Tiny Magic Studio |
| `printers[].name` | Friendly label (optional) |
| `printers[].model` | Printer model (optional, display only) |
| `printers[].host` | Printer's **LAN IP address** |
| `printers[].accessCode` | The printer's **Access Code** |

You can also configure via env vars: `PORT` and `PRINTERS` (a JSON array with the same shape).

## API

- `GET /status` → `{ ok, updatedAt, printers: [{ id, name, model, state, percent, job, nozzle, bed, remainingMin, online, updatedAt }] }`
  - `state` is normalized to `"printing"` | `"idle"` | `"unknown"`.
- `GET /health` → basic liveness.

CORS is open (`Access-Control-Allow-Origin: *`) so the browser app can read it.

## Run it as a background service

Keep it running with `pm2` (`pm2 start index.js --name printer-bridge`) or a systemd unit. Restart on boot so status is always available.

## Notes & gotchas

- **LAN mode disables cloud** and vice-versa — this bridge uses the LAN path (most reliable, fully local, no Bambu account).
- The **access code changes** if you reset/re-pair the printer; update `config.json` if status stops updating.
- **P1/A1** send partial updates (deltas); the bridge asks for a full snapshot on connect and every 60s, which is handled for you.
- `mc_remaining_time` units vary by model (seconds vs minutes) — treated as minutes here; adjust if your ETA looks off.
- Firmware updates can change access behavior; if reads stop, check LAN/Developer mode is still on.
