import { useState } from 'react'
import { Check, MailCheck, Save } from 'lucide-react'
import { Button, Card, CardHeader, Field, Input, Select } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import type { NewsletterCadence, NewsletterSettings } from '@/data/types'
import { cn } from '@/lib/utils'

const CADENCES: Array<{ value: NewsletterCadence; label: string }> = [
  { value: 'one-time', label: 'One-time' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function SettingsTab() {
  const settings = useStore((s) => s.newsletterSettings)
  const update = useStore((s) => s.updateNewsletterSettings)

  // Local draft so Save is explicit for the sending identity + schedule
  const [draft, setDraft] = useState<NewsletterSettings>(settings)
  const set = (patch: Partial<NewsletterSettings>) => setDraft((d) => ({ ...d, ...patch }))
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)

  const emailValid = /\S+@\S+\.\S+/.test(draft.fromEmail)
  const canSave = dirty && draft.fromName.trim() !== '' && emailValid && draft.mailingAddress.trim() !== ''

  const save = () => {
    update({
      ...draft,
      fromName: draft.fromName.trim(),
      fromEmail: draft.fromEmail.trim(),
      replyTo: draft.replyTo.trim() || draft.fromEmail.trim(),
      mailingAddress: draft.mailingAddress.trim(),
      mailBridgeUrl: draft.mailBridgeUrl.trim().replace(/\/$/, ''),
    })
    toast('Newsletter settings saved', { tone: 'success' })
  }

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const testBridge = async () => {
    const base = draft.mailBridgeUrl.trim().replace(/\/$/, '')
    if (!base) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(6000) })
      const data = await res.json()
      setTestResult({
        ok: true,
        msg:
          data.mode === 'demo'
            ? 'Connected, but the bridge is in DEMO mode — emails are only logged. Add SMTP credentials on the server to send for real.'
            : `Connected — bridge is running (${data.mode ?? 'ready'}).`,
      })
    } catch {
      setTestResult({ ok: false, msg: 'Could not reach the mail bridge. Check the URL and that it is running.' })
    } finally {
      setTesting(false)
    }
  }

  // A real end-to-end test. Sent FROM the From address (must be on the
  // verified domain) but TO the reply-to when set — the From address often
  // has no real inbox behind it.
  const [sendingTest, setSendingTest] = useState(false)
  const sendTestEmail = async () => {
    const base = draft.mailBridgeUrl.trim().replace(/\/$/, '')
    const to = (draft.replyTo.trim() || draft.fromEmail).trim()
    if (!base || !emailValid) return
    setSendingTest(true)
    setTestResult(null)
    try {
      const res = await fetch(`${base}/send-one`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          token: draft.mailBridgeToken || 'demo',
          to,
          toName: draft.fromName || to,
          subject: 'Test email — your newsletter setup works ✨',
          html: `<div style="font-family:sans-serif;font-size:16px;color:#333;line-height:1.6;padding:24px;">
            <p><strong>It works!</strong></p>
            <p>This test email left your mail bridge and was delivered by your email provider.
            Newsletters, order confirmations, and shipping updates will all travel this same road.</p>
            <p style="color:#999;font-size:13px;">Sent from the newsletter settings page.</p></div>`,
          text: 'It works! This test email left your mail bridge and was delivered by your email provider.',
          from: { name: draft.fromName || 'Test', email: draft.fromEmail.trim() },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `bridge responded ${res.status}`)
      setTestResult(
        data.demo
          ? { ok: true, msg: 'The bridge accepted it but is in DEMO mode — nothing was really sent. Add SMTP credentials on the server.' }
          : { ok: true, msg: `Test email sent to ${to} — check your inbox (and spam, the first time).` },
      )
    } catch (err) {
      setTestResult({
        ok: false,
        msg: `Could not send: ${err instanceof Error ? err.message : 'unknown error'}. Check the token and the server's mail credentials.`,
      })
    } finally {
      setSendingTest(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Sending identity"
          subtitle="How your newsletters appear in inboxes."
          actions={
            <Button size="sm" icon={<Save />} disabled={!canSave} onClick={save}>
              Save
            </Button>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From name" required>
            <Input value={draft.fromName} onChange={(e) => set({ fromName: e.target.value })} placeholder="Nova Prints & Co." />
          </Field>
          <Field label="From email" required error={draft.fromEmail && !emailValid ? 'Enter a valid email' : undefined}>
            <Input value={draft.fromEmail} onChange={(e) => set({ fromEmail: e.target.value })} placeholder="hello@yourshop.com" />
          </Field>
          <Field label="Reply-to" hint="Where replies go — defaults to the from email.">
            <Input value={draft.replyTo} onChange={(e) => set({ replyTo: e.target.value })} placeholder="hello@yourshop.com" />
          </Field>
          <Field label="Mailing address" required hint="Shown in the footer — required by anti-spam law.">
            <Input value={draft.mailingAddress} onChange={(e) => set({ mailingAddress: e.target.value })} placeholder="123 Main St, City, ST 00000" />
          </Field>
          <Field label="Footer sign-off" className="sm:col-span-2">
            <Input value={draft.footerNote} onChange={(e) => set({ footerNote: e.target.value })} placeholder="Made with love in your town." />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Schedule" subtitle="Default cadence and when recurring newsletters go out." />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Default cadence">
            <Select value={draft.defaultCadence} onChange={(e) => set({ defaultCadence: e.target.value as NewsletterCadence })} options={CADENCES} />
          </Field>
          <Field label="Weekly send day">
            <Select
              value={String(draft.sendWeekday)}
              onChange={(e) => set({ sendWeekday: Number(e.target.value) })}
              options={WEEKDAYS.map((d, i) => ({ value: String(i), label: d }))}
            />
          </Field>
          <Field label="Send time">
            <Select
              value={String(draft.sendHour)}
              onChange={(e) => set({ sendHour: Number(e.target.value) })}
              options={Array.from({ length: 24 }, (_, h) => ({
                value: String(h),
                label: `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'AM' : 'PM'}`,
              }))}
            />
          </Field>
          <Field label="Monthly send day" hint="Day of the month (1–28).">
            <Input
              type="number"
              min={1}
              max={28}
              value={String(draft.sendMonthDay)}
              onChange={(e) => set({ sendMonthDay: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })}
            />
          </Field>
        </div>
        <p className="mt-3 text-xs text-ink-3">Don't forget to Save — the schedule is stored with your sending identity above.</p>
      </Card>

      <Card>
        <CardHeader
          title="Email delivery"
          subtitle="Connect a mail bridge to actually send newsletters."
          actions={
            <Button size="sm" icon={<Save />} disabled={!canSave} onClick={save}>
              Save
            </Button>
          }
        />
        <div className="space-y-3">
          {dirty && !canSave && (
            <p className="rounded-xl bg-sunken px-3 py-2 text-[13px] text-warn">
              To save, also fill in the From name, a valid From email, and the mailing address in the Sending identity
              card above — everything on this page saves together.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mail bridge URL" hint="Where your mail bridge runs — e.g. http://192.168.1.50:7071.">
              <Input
                value={draft.mailBridgeUrl}
                onChange={(e) => {
                  set({ mailBridgeUrl: e.target.value })
                  setTestResult(null)
                }}
                placeholder="http://localhost:7071"
                className="font-mono"
              />
            </Field>
            <Field label="Bridge token" hint="The shared secret from the bridge's config.">
              <Input
                type="password"
                value={draft.mailBridgeToken}
                onChange={(e) => set({ mailBridgeToken: e.target.value })}
                placeholder="••••••••"
                className="font-mono"
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={testBridge} disabled={!draft.mailBridgeUrl.trim() || testing}>
              {testing ? 'Testing…' : 'Test connection'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<MailCheck />}
              onClick={sendTestEmail}
              disabled={!draft.mailBridgeUrl.trim() || !emailValid || sendingTest}
              title={!emailValid ? 'Enter a valid From email above first' : undefined}
            >
              {sendingTest ? 'Sending…' : 'Send me a test email'}
            </Button>
            {testResult && (
              <span className={cn('flex items-center gap-1.5 text-[13px]', testResult.ok ? 'text-good' : 'text-critical')}>
                {testResult.ok ? <Check className="h-4 w-4" /> : <span aria-hidden>⚠️</span>}
                {testResult.msg}
              </span>
            )}
          </div>
          <div className="rounded-xl bg-sunken/60 p-3.5 text-[13px] leading-relaxed text-ink-3">
            The mail bridge is a small program you run on any always-on computer (setup in{' '}
            <span className="font-mono text-ink-2">mail-bridge/README.md</span>) that sends via your email account and
            personalizes each email per subscriber. It also tracks opens & clicks — for that, the bridge's{' '}
            <span className="font-mono text-ink-2">publicUrl</span> must be reachable by your recipients' inboxes. Until
            it's connected, you can still compose, schedule, and preview — sending runs in <em>demo mode</em> (no real
            emails leave).
          </div>
        </div>
      </Card>
    </div>
  )
}
