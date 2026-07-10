# Restoring from a backup

Nightly backups land in `/var/lib/tinymagic/backups/` on the VPS:

- `tinymagic-YYYY-MM-DD-HHmm.db.gz` — the database (orders, customers,
  products, settings — everything). Kept 14 nights.
- `tinymagic-files-YYYY-MM-DD-HHmm.tar.gz` — product photos, uploaded
  documents, and the mail-tracking store. Kept 7 nights.

The admin's **Settings → Download backup** button produces the same `.db.gz`
on demand. Set `BACKUP_PUSH_CMD` in `/etc/tinymagic.env` (see the comment
there) to ship every nightly snapshot off the server — a backup on the same
disk as the database does not survive the disk.

## Restore the database

```bash
# 1. Stop the API so nothing writes while you swap the file
sudo systemctl stop tinymagic-api

# 2. Keep the current (broken) DB around, just in case
sudo mv /var/lib/tinymagic/tinymagic.db /var/lib/tinymagic/tinymagic.db.before-restore

# 3. IMPORTANT: delete the stale WAL companions. A leftover -wal from the old
#    database will silently corrupt or shadow the restored one.
sudo rm -f /var/lib/tinymagic/tinymagic.db-wal /var/lib/tinymagic/tinymagic.db-shm

# 4. Unpack the chosen snapshot into place
sudo sh -c 'gunzip -c /var/lib/tinymagic/backups/tinymagic-2026-07-10-0317.db.gz > /var/lib/tinymagic/tinymagic.db'

# 5. Start the API and verify
sudo systemctl start tinymagic-api
curl -s https://thetinymagicstudio.ca/api/health   # expect {"ok":true,...}
```

Then log into `/admin` and spot-check orders and products. Once satisfied,
remove `tinymagic.db.before-restore`.

## Restore photos / documents / mail tracking

```bash
sudo tar -xzf /var/lib/tinymagic/backups/tinymagic-files-2026-07-10-0317.tar.gz \
  -C /var/lib/tinymagic
sudo systemctl restart tinymagic-mail   # picks the tracking store back up
```

## Rehearse this once

A backup you have never restored is a hope, not a plan. Do a dry run against
a scratch path (`gunzip -c … > /tmp/check.db && sqlite3 /tmp/check.db
'SELECT COUNT(*) FROM kv;'`) so the real emergency isn't the first attempt.

## Related recovery notes

- **Forgot the owner password** (no reset flow yet): over SSH,
  `sudo sqlite3 /var/lib/tinymagic/tinymagic.db "DELETE FROM sessions;"` then
  delete your user row and reload `/admin` — it offers first-run setup again
  **only if no users remain**, so remove staff rows too or recreate them after.
- **Let's Encrypt expiry warnings** go nowhere by default. Run once:
  `sudo certbot update_account --email you@example.com --no-eff-email`
