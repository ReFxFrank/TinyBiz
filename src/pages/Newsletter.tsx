import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  CalendarClock,
  Copy,
  Eye,
  Mail,
  MousePointerClick,
  Pencil,
  Plus,
  Send,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Drawer,
  EmptyState,
  Field,
  IconButton,
  Input,
  Menu,
  MenuItem,
  MenuSeparator,
  Modal,
  PageHeader,
  SkeletonStats,
  SkeletonTable,
  Stat,
  Tabs,
  type BadgeTone,
  type TabItem,
} from '@/components/ui'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import type { Newsletter, NewsletterStatus } from '@/data/types'
import { fmtDate, fmtDateTime, num, pct } from '@/lib/format'
import { cn, uid, useLoaded } from '@/lib/utils'
import {
  applyMergeTags,
  buildNewsletterHtml,
  buildNewsletterText,
  cadenceLabel,
  clickRate,
  newsletterRecipients,
  nextSendDate,
  openRate,
} from '@/lib/newsletter'
import { ComposeModal } from './newsletter/ComposeModal'
import { SubscribersTab } from './newsletter/SubscribersTab'
import { SettingsTab } from './newsletter/SettingsTab'
import { useNewsletterContext } from './newsletter/useNewsletterContext'

type Tab = 'newsletters' | 'subscribers' | 'settings'

const STATUS_TONE: Record<NewsletterStatus, BadgeTone> = {
  draft: 'neutral',
  scheduled: 'yellow',
  sent: 'green',
}
const STATUS_LABEL: Record<NewsletterStatus, string> = { draft: 'Draft', scheduled: 'Scheduled', sent: 'Sent' }

export default function NewsletterPage() {
  const loaded = useLoaded()
  const newsletters = useStore((s) => s.newsletters)
  const subscribers = useStore((s) => s.subscribers)
  const nlSettings = useStore((s) => s.newsletterSettings)
  const addItem = useStore((s) => s.addItem)
  const updateItem = useStore((s) => s.updateItem)
  const removeItem = useStore((s) => s.removeItem)
  const ctx = useNewsletterContext()
  const [searchParams, setSearchParams] = useSearchParams()

  const [tab, setTab] = useState<Tab>('newsletters')
  const [composeOpen, setComposeOpen] = useState(false)
  const [editing, setEditing] = useState<Newsletter | null>(null)
  const [previewing, setPreviewing] = useState<Newsletter | null>(null)
  const [scheduling, setScheduling] = useState<Newsletter | null>(null)
  const [sending, setSending] = useState<Newsletter | null>(null)
  const [reporting, setReporting] = useState<Newsletter | null>(null)
  const [deleting, setDeleting] = useState<Newsletter | null>(null)

  // ?new=1 opens the compose modal once
  useEffect(() => {
    if (searchParams.get('new')) {
      setEditing(null)
      setComposeOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const displaySubject = (s: string) => applyMergeTags(s, { first_name: 'there', shop: ctx.businessName })

  const subscribedCount = useMemo(() => subscribers.filter((s) => s.status === 'subscribed').length, [subscribers])
  const stats = useMemo(() => {
    const sent = newsletters.filter((n) => n.status === 'sent')
    const scheduled = newsletters.filter((n) => n.status === 'scheduled').length
    const avgOpen = sent.length ? sent.reduce((a, n) => a + openRate(n), 0) / sent.length : 0
    return { sent: sent.length, scheduled, avgOpen }
  }, [newsletters])

  const sortedNewsletters = useMemo(() => {
    const rank: Record<NewsletterStatus, number> = { scheduled: 0, draft: 1, sent: 2 }
    return [...newsletters].sort((a, b) => {
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status]
      const at = a.scheduledFor ?? a.sentAt ?? a.createdAt
      const bt = b.scheduledFor ?? b.sentAt ?? b.createdAt
      return new Date(bt).getTime() - new Date(at).getTime()
    })
  }, [newsletters])

  const openCompose = (n: Newsletter | null) => {
    setEditing(n)
    setComposeOpen(true)
  }

  const duplicate = (n: Newsletter) => {
    addItem('newsletters', {
      ...n,
      id: uid('nws'),
      subject: `${n.subject} (copy)`,
      status: 'draft',
      scheduledFor: undefined,
      sentAt: undefined,
      recipientCount: undefined,
      opens: undefined,
      clicks: undefined,
      createdAt: new Date().toISOString(),
    })
    toast('Newsletter duplicated', { tone: 'success' })
  }

  const unschedule = (n: Newsletter) => {
    updateItem('newsletters', n.id, { status: 'draft', scheduledFor: undefined })
    toast('Moved back to draft', { tone: 'success' })
  }

  // Actually send (or simulate) a newsletter through the mail bridge.
  const doSend = async (n: Newsletter) => {
    const recipients = newsletterRecipients(n, subscribers)
    if (recipients.length === 0) {
      toast('No subscribers to send to', { description: 'This audience has no subscribed contacts.', tone: 'error' })
      return
    }
    const base = nlSettings.mailBridgeUrl.trim().replace(/\/$/, '')
    const markSent = (demo: boolean) => {
      updateItem('newsletters', n.id, {
        status: 'sent',
        sentAt: new Date().toISOString(),
        recipientCount: recipients.length,
        opens: 0,
        clicks: 0,
      })
      toast(
        demo ? `Sent in demo mode to ${recipients.length}` : `Newsletter sent to ${recipients.length}`,
        {
          tone: 'success',
          description: demo ? 'No real emails left — connect a mail bridge in Settings to send for real.' : undefined,
        },
      )
    }

    if (!base) {
      markSent(true)
      return
    }
    try {
      const html = buildNewsletterHtml(n, nlSettings, ctx)
      const text = buildNewsletterText(n, nlSettings, ctx)
      const res = await fetch(`${base}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: nlSettings.mailBridgeToken,
          subject: n.subject,
          html,
          text,
          from: { name: nlSettings.fromName, email: nlSettings.fromEmail },
          replyTo: nlSettings.replyTo,
          recipients: recipients.map((r) => ({ email: r.email, name: r.name })),
        }),
        signal: AbortSignal.timeout(20000),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'send failed')
      markSent(Boolean(data.demo))
    } catch {
      toast('Could not send newsletter', {
        description: 'The mail bridge rejected the request or is unreachable. Check Settings.',
        tone: 'error',
      })
    }
  }

  const tabs: Array<TabItem<Tab>> = [
    { value: 'newsletters', label: 'Newsletters', count: newsletters.length },
    { value: 'subscribers', label: 'Subscribers', count: subscribedCount },
    { value: 'settings', label: 'Settings' },
  ]

  return (
    <div>
      <PageHeader
        title="Newsletter"
        description="Write, schedule, and send updates to your subscribers."
        actions={
          <Button icon={<Plus />} onClick={() => openCompose(null)}>
            New newsletter
          </Button>
        }
      />

      {!loaded ? (
        <div className="space-y-6">
          <SkeletonStats />
          <SkeletonTable rows={5} />
        </div>
      ) : (
        <motion.div
          className="space-y-6"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label="Subscribers"
              value={num(subscribedCount)}
              icon={<Users />}
              clickHint="Manage your subscriber list"
              onClick={() => setTab('subscribers')}
            />
            <Stat label="Sent" value={num(stats.sent)} icon={<Send />} />
            <Stat label="Scheduled" value={num(stats.scheduled)} icon={<CalendarClock />} />
            <Stat label="Avg open rate" value={pct(stats.avgOpen, 0)} icon={<Eye />} />
          </div>

          <Tabs items={tabs} value={tab} onChange={setTab} />

          {tab === 'newsletters' &&
            (sortedNewsletters.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<Mail />}
                  title="No newsletters yet"
                  description="Write your first update and send it to your subscribers."
                  action={
                    <Button icon={<Plus />} onClick={() => openCompose(null)}>
                      New newsletter
                    </Button>
                  }
                />
              </Card>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {sortedNewsletters.map((n) => (
                  <NewsletterCard
                    key={n.id}
                    n={n}
                    subjectDisplay={displaySubject(n.subject)}
                    recipients={newsletterRecipients(n, subscribers).length}
                    onPreview={() => setPreviewing(n)}
                    onReport={() => setReporting(n)}
                    onEdit={() => openCompose(n)}
                    onDuplicate={() => duplicate(n)}
                    onSchedule={() => setScheduling(n)}
                    onUnschedule={() => unschedule(n)}
                    onSend={() => setSending(n)}
                    onDelete={() => setDeleting(n)}
                  />
                ))}
              </div>
            ))}

          {tab === 'subscribers' && <SubscribersTab />}
          {tab === 'settings' && <SettingsTab />}
        </motion.div>
      )}

      <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} editing={editing} />

      <PreviewDrawer newsletter={previewing} onClose={() => setPreviewing(null)} />

      <ReportModal newsletter={reporting} onClose={() => setReporting(null)} />

      <ScheduleModal
        newsletter={scheduling}
        onClose={() => setScheduling(null)}
        onConfirm={(iso) => {
          if (scheduling) {
            updateItem('newsletters', scheduling.id, { status: 'scheduled', scheduledFor: iso })
            toast('Newsletter scheduled', { tone: 'success', description: `Sends ${fmtDateTime(iso)}.` })
          }
        }}
      />

      <SendModal
        newsletter={sending}
        recipientCount={sending ? newsletterRecipients(sending, subscribers).length : 0}
        hasBridge={Boolean(nlSettings.mailBridgeUrl.trim())}
        onClose={() => setSending(null)}
        onConfirm={() => {
          if (sending) doSend(sending)
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            removeItem('newsletters', deleting.id)
            toast('Newsletter deleted', { tone: 'success' })
          }
        }}
        title="Delete newsletter?"
        description={deleting ? `“${deleting.subject}” will be removed.` : undefined}
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}

// ── Newsletter card ───────────────────────────────────────────────────────────

function NewsletterCard({
  n,
  subjectDisplay,
  recipients,
  onPreview,
  onReport,
  onEdit,
  onDuplicate,
  onSchedule,
  onUnschedule,
  onSend,
  onDelete,
}: {
  n: Newsletter
  subjectDisplay: string
  recipients: number
  onPreview: () => void
  onReport: () => void
  onEdit: () => void
  onDuplicate: () => void
  onSchedule: () => void
  onUnschedule: () => void
  onSend: () => void
  onDelete: () => void
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[n.status]} dot>
              {STATUS_LABEL[n.status]}
            </Badge>
            <Badge>{cadenceLabel(n.cadence)}</Badge>
            {n.audienceTag && <Badge tone="violet">{n.audienceTag}</Badge>}
          </div>
          <h3 className="mt-2 truncate font-semibold text-ink">{subjectDisplay}</h3>
          {n.preheader && <p className="mt-0.5 line-clamp-1 text-[13px] text-ink-3">{n.preheader}</p>}
        </div>
        <Menu
          trigger={
            <IconButton label={`Actions for ${n.subject}`} size="sm">
              ⋯
            </IconButton>
          }
        >
          <MenuItem icon={<Eye />} onSelect={onPreview}>
            Preview
          </MenuItem>
          {n.status === 'sent' && (
            <MenuItem icon={<MousePointerClick />} onSelect={onReport}>
              View report
            </MenuItem>
          )}
          {n.status !== 'sent' && (
            <MenuItem icon={<Pencil />} onSelect={onEdit}>
              Edit
            </MenuItem>
          )}
          <MenuItem icon={<Copy />} onSelect={onDuplicate}>
            Duplicate
          </MenuItem>
          {n.status === 'draft' && (
            <MenuItem icon={<CalendarClock />} onSelect={onSchedule}>
              Schedule…
            </MenuItem>
          )}
          {n.status === 'scheduled' && (
            <MenuItem icon={<XCircle />} onSelect={onUnschedule}>
              Unschedule
            </MenuItem>
          )}
          {n.status !== 'sent' && (
            <MenuItem icon={<Send />} onSelect={onSend}>
              Send now…
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem icon={<Trash2 />} danger onSelect={onDelete}>
            Delete
          </MenuItem>
        </Menu>
      </div>

      {/* Status detail */}
      <div className="mt-auto border-t border-hairline pt-3 text-[13px] text-ink-3">
        {n.status === 'sent' ? (
          <button onClick={onReport} className="group/report flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-left hover:text-ink">
            <span>Sent {n.sentAt ? fmtDate(n.sentAt) : ''} to {num(n.recipientCount ?? 0)}</span>
            <span className="flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" /> {pct(openRate(n), 0)} opens
            </span>
            <span className="flex items-center gap-1">
              <MousePointerClick className="h-3.5 w-3.5" /> {pct(clickRate(n), 0)} clicks
            </span>
            <span className="ml-auto font-medium text-accent opacity-0 transition-opacity group-hover/report:opacity-100">
              View report →
            </span>
          </button>
        ) : n.status === 'scheduled' ? (
          <div className="flex items-center gap-1.5 text-[#8a6100] dark:text-warn">
            <CalendarClock className="h-4 w-4" />
            Sends {n.scheduledFor ? fmtDateTime(n.scheduledFor) : ''} · {num(recipients)} recipients
          </div>
        ) : (
          <span>Draft · {num(recipients)} recipient{recipients === 1 ? '' : 's'} when sent</span>
        )}
      </div>
    </Card>
  )
}

// ── Preview drawer ────────────────────────────────────────────────────────────

function PreviewDrawer({ newsletter, onClose }: { newsletter: Newsletter | null; onClose: () => void }) {
  const nlSettings = useStore((s) => s.newsletterSettings)
  const ctx = useNewsletterContext()
  const html = useMemo(
    () => (newsletter ? buildNewsletterHtml(newsletter, nlSettings, ctx) : ''),
    [newsletter, nlSettings, ctx],
  )
  return (
    <Drawer
      open={newsletter !== null}
      onClose={onClose}
      wide
      title={newsletter?.subject ?? ''}
      subtitle="Email preview"
    >
      {newsletter && (
        <div className="overflow-hidden rounded-xl border border-edge bg-sunken">
          <iframe title="Email preview" srcDoc={html} className="h-[70vh] w-full border-0 bg-white" sandbox="" />
        </div>
      )}
    </Drawer>
  )
}

// ── Campaign report ───────────────────────────────────────────────────────────

function ReportModal({ newsletter, onClose }: { newsletter: Newsletter | null; onClose: () => void }) {
  const n = newsletter
  const delivered = n?.recipientCount ?? 0
  const opens = n?.opens ?? 0
  const clicks = n?.clicks ?? 0
  const unsubs = n?.unsubscribes ?? 0

  const rows: Array<{ label: string; value: number; rate: number; tone: string }> = n
    ? [
        { label: 'Delivered', value: delivered, rate: 100, tone: 'bg-accent' },
        { label: 'Opened', value: opens, rate: openRate(n), tone: 'bg-good' },
        { label: 'Clicked', value: clicks, rate: clickRate(n), tone: 'bg-pop' },
        { label: 'Unsubscribed', value: unsubs, rate: delivered ? (unsubs / delivered) * 100 : 0, tone: 'bg-critical' },
      ]
    : []

  return (
    <Modal open={n !== null} onClose={onClose} title="Campaign report" description={n?.subject} size="md">
      {n && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Open rate', value: pct(openRate(n), 1) },
              { label: 'Click rate', value: pct(clickRate(n), 1) },
              { label: 'Recipients', value: num(delivered) },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-sunken/60 p-3 text-center">
                <div className="text-xl font-semibold text-ink">{s.value}</div>
                <div className="mt-0.5 text-xs text-ink-3">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.label}>
                <div className="mb-1 flex items-center justify-between text-[13px]">
                  <span className="text-ink-2">{r.label}</span>
                  <span className="font-medium text-ink tnum">
                    {num(r.value)} <span className="text-ink-3">· {pct(r.rate, 0)}</span>
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-sunken">
                  <div className={cn('h-full rounded-full', r.tone)} style={{ width: `${Math.min(100, r.rate)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-ink-3">
            Sent {n.sentAt ? fmtDateTime(n.sentAt) : ''}. Open and click tracking is simulated in this demo — a mail
            provider fills these in for real once connected.
          </p>
        </div>
      )}
    </Modal>
  )
}

// ── Schedule modal ────────────────────────────────────────────────────────────

function ScheduleModal({
  newsletter,
  onClose,
  onConfirm,
}: {
  newsletter: Newsletter | null
  onClose: () => void
  onConfirm: (iso: string) => void
}) {
  const nlSettings = useStore((s) => s.newsletterSettings)
  const [value, setValue] = useState('')

  useEffect(() => {
    if (!newsletter) return
    // Default to the next natural send date for the cadence, else tomorrow at send hour
    const suggested =
      nextSendDate(newsletter.cadence, nlSettings, new Date()) ??
      (() => {
        const d = new Date()
        d.setDate(d.getDate() + 1)
        d.setHours(nlSettings.sendHour, 0, 0, 0)
        return d.toISOString()
      })()
    // datetime-local wants local YYYY-MM-DDTHH:mm
    const d = new Date(suggested)
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    setValue(local)
  }, [newsletter, nlSettings])

  const valid = value.length > 0 && new Date(value).getTime() > Date.now()

  return (
    <Modal
      open={newsletter !== null}
      onClose={onClose}
      title="Schedule newsletter"
      description={newsletter?.subject}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              onConfirm(new Date(value).toISOString())
              onClose()
            }}
          >
            Schedule
          </Button>
        </>
      }
    >
      <Field label="Send at" error={value && !valid ? 'Pick a time in the future' : undefined}>
        <Input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      <p className="mt-2 text-xs text-ink-3">
        Suggested from your {cadenceLabel(newsletter?.cadence ?? 'monthly').toLowerCase()} schedule in Settings. In this
        demo, scheduled newsletters wait here until you send them.
      </p>
    </Modal>
  )
}

// ── Send confirm modal ────────────────────────────────────────────────────────

function SendModal({
  newsletter,
  recipientCount,
  hasBridge,
  onClose,
  onConfirm,
}: {
  newsletter: Newsletter | null
  recipientCount: number
  hasBridge: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Modal
      open={newsletter !== null}
      onClose={onClose}
      title="Send newsletter?"
      description={newsletter?.subject}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            icon={<Send />}
            disabled={recipientCount === 0}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {hasBridge ? `Send to ${recipientCount}` : 'Send (demo)'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-2">
        This will send to <span className="font-semibold text-ink">{num(recipientCount)}</span> subscribed contact
        {recipientCount === 1 ? '' : 's'}.
      </p>
      <div
        className={cn(
          'mt-3 rounded-xl p-3 text-[13px] leading-relaxed',
          hasBridge ? 'bg-good-wash text-[#006300] dark:text-good' : 'bg-warn-wash text-[#8a6100] dark:text-warn',
        )}
      >
        {hasBridge
          ? 'Your mail bridge is connected — real emails will be sent.'
          : 'No mail bridge connected, so this runs in demo mode (no real emails leave). Connect one in Settings to send for real.'}
      </div>
    </Modal>
  )
}
