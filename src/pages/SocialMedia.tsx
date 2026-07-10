import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  MegaphoneOff,
  MoreHorizontal,
  PenSquare,
  Plus,
  Send,
  Trash2,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import type { SocialAccount, SocialLinks, SocialPlatform, SocialPost } from '@/data/types'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Menu,
  MenuItem,
  MenuSeparator,
  Modal,
  PageHeader,
  ProductTile,
  Select,
  Skeleton,
  SkeletonChart,
  SkeletonStats,
  Stat,
  Textarea,
} from '@/components/ui'
import { BarsChart, ChartCard } from '@/components/charts'
import { fmtDateTime, num, numCompact, signedPct, timeAgo } from '@/lib/format'
import { cn, sum, uid, useLoaded } from '@/lib/utils'

// ── Platform metadata (no brand icons in lucide — emoji on hue tiles) ────────

const PLATFORM_META: Record<SocialPlatform, { emoji: string; hue: number }> = {
  Instagram: { emoji: '📸', hue: 330 },
  TikTok: { emoji: '🎵', hue: 200 },
  Pinterest: { emoji: '📌', hue: 0 },
  Facebook: { emoji: '👥', hue: 220 },
  YouTube: { emoji: '▶️', hue: 0 },
  X: { emoji: '🐦', hue: 210 },
}

const ALL_PLATFORMS = Object.keys(PLATFORM_META) as SocialPlatform[]

/** Platforms with a matching storefront-footer slot (settings.social) */
const FOOTER_KEY: Partial<Record<SocialPlatform, keyof SocialLinks>> = {
  Instagram: 'instagram',
  TikTok: 'tiktok',
  YouTube: 'youtube',
}

const MAX_CHARS = 280

/** "YYYY-MM-DDTHH:mm" for a datetime-local input, in local time */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Tomorrow at 17:00 — a friendly default posting slot */
function defaultSchedule(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(17, 0, 0, 0)
  return toLocalInputValue(d)
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SocialMedia() {
  const loaded = useLoaded()
  const accounts = useStore((s) => s.socialAccounts)
  const posts = useStore((s) => s.socialPosts)
  const updateItem = useStore((s) => s.updateItem)
  const removeItem = useStore((s) => s.removeItem)
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)

  const [searchParams, setSearchParams] = useSearchParams()
  const [composeOpen, setComposeOpen] = useState(false)
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null)
  const [deletePost, setDeletePost] = useState<SocialPost | null>(null)
  const [removeAccount, setRemoveAccount] = useState<SocialAccount | null>(null)
  const [accountModal, setAccountModal] = useState<{ open: boolean; account: SocialAccount | null }>({
    open: false,
    account: null,
  })

  // "?new=1" auto-opens the compose modal
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setEditingPost(null)
      setComposeOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // ── Derived data ───────────────────────────────────────────────────────────

  const totalFollowers = sum(accounts.map((a) => a.followers))
  const lastMonthTotal = sum(accounts.map((a) => a.followersLastMonth))
  const followerGrowth = totalFollowers - lastMonthTotal
  const growthPct = lastMonthTotal > 0 ? (followerGrowth / lastMonthTotal) * 100 : 0
  const scheduledCount = posts.filter((p) => p.status === 'Scheduled').length
  const postedPosts = useMemo(() => posts.filter((p) => p.status === 'Posted'), [posts])
  const avgEngagement =
    postedPosts.length > 0 ? sum(postedPosts.map((p) => p.likes + p.comments + p.shares)) / postedPosts.length : 0

  const upcoming = useMemo(
    () =>
      posts
        .filter((p) => p.status !== 'Posted')
        .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()),
    [posts],
  )
  const recent = useMemo(
    () => [...postedPosts].sort((a, b) => new Date(b.scheduledFor).getTime() - new Date(a.scheduledFor).getTime()),
    [postedPosts],
  )

  const chartData = accounts.map((a) => ({
    platform: a.platform,
    lastMonth: a.followersLastMonth,
    now: a.followers,
  }))

  // ── Actions ────────────────────────────────────────────────────────────────

  /** Stat tiles jump to the section they summarize (offset for the sticky topbar via scroll-mt) */
  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const openCompose = () => {
    setEditingPost(null)
    setComposeOpen(true)
  }
  const openEdit = (post: SocialPost) => {
    setEditingPost(post)
    setComposeOpen(true)
  }
  const markPosted = (post: SocialPost) => {
    updateItem('socialPosts', post.id, { status: 'Posted' })
    toast('Marked as posted', { tone: 'success' })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!loaded) {
    return (
      <div className="space-y-6">
        <PageHeader title="Social media" description="Grow your audience and plan your content calendar." />
        <SkeletonStats />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-5">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="mt-1.5 h-3 w-24" />
                </div>
              </div>
              <Skeleton className="mt-4 h-7 w-16" />
            </div>
          ))}
        </div>
        <SkeletonChart />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Social media"
        description="Grow your audience and plan your content calendar."
        actions={
          <Button icon={<Send />} onClick={openCompose}>
            Compose post
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Total followers"
          value={numCompact(totalFollowers)}
          clickHint="Jump to your accounts"
          onClick={() => scrollToSection('social-accounts')}
        />
        <Stat
          label="Follower growth this month"
          value={`${followerGrowth >= 0 ? '+' : ''}${num(followerGrowth)}`}
          delta={{ pct: growthPct, vs: 'last month' }}
          clickHint="Jump to the followers by platform chart"
          onClick={() => scrollToSection('followers-chart')}
        />
        <Stat
          label="Posts scheduled"
          value={num(scheduledCount)}
          icon={<CalendarClock />}
          clickHint="Jump to scheduled posts and drafts"
          onClick={() => scrollToSection('scheduled-posts')}
        />
        <Stat
          label="Avg engagement per post"
          value={numCompact(Math.round(avgEngagement))}
          clickHint="Jump to recent posts and their engagement"
          onClick={() => scrollToSection('recent-posts')}
        />
      </div>

      {/* Accounts */}
      <section id="social-accounts" className="scroll-mt-20 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Accounts</h2>
          <Button variant="secondary" size="sm" icon={<Plus />} onClick={() => setAccountModal({ open: true, account: null })}>
            Add account
          </Button>
        </div>
        {accounts.length === 0 ? (
          <Card>
            <EmptyState
              icon={<MegaphoneOff />}
              title="No accounts linked yet"
              description="Add your profiles — Instagram, TikTok and YouTube links also appear in your storefront footer."
              action={
                <Button size="sm" icon={<Plus />} onClick={() => setAccountModal({ open: true, account: null })}>
                  Add account
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onEdit={() => setAccountModal({ open: true, account })}
                onRemove={() => setRemoveAccount(account)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Followers by platform */}
      <div id="followers-chart" className="scroll-mt-20">
        <ChartCard
          title="Followers by platform"
          subtitle="This month vs last month"
          table={{
            headers: ['Platform', 'Last month', 'Now'],
            rows: chartData.map((d) => [d.platform, num(d.lastMonth), num(d.now)]),
          }}
        >
          <BarsChart
            data={chartData}
            xKey="platform"
            series={[
              { key: 'lastMonth', name: 'Last month', color: 2 },
              { key: 'now', name: 'Now', color: 0 },
            ]}
            valueFormatter={(v) => numCompact(v)}
            height={240}
          />
        </ChartCard>
      </div>

      {/* Content calendar */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Content calendar</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Scheduled & drafts */}
          <Card id="scheduled-posts" padding="none" className="scroll-mt-20 overflow-hidden">
            <div className="border-b border-hairline px-5 py-3.5">
              <h3 className="text-[13px] font-semibold text-ink">Scheduled &amp; drafts</h3>
            </div>
            {upcoming.length === 0 ? (
              <EmptyState
                icon={<CalendarClock />}
                title="Nothing in the queue"
                description="Compose a post to start filling next week's calendar."
                action={
                  <Button size="sm" onClick={openCompose}>
                    Compose post
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-hairline">
                {upcoming.map((post) => {
                  const meta = PLATFORM_META[post.platform]
                  return (
                    <li key={post.id} className="flex items-start gap-3 px-5 py-3.5">
                      <ProductTile emoji={meta.emoji} hue={meta.hue} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm text-ink">{post.content}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <Badge tone={post.status === 'Scheduled' ? 'blue' : 'neutral'}>{post.status}</Badge>
                          <span className="text-xs text-ink-3">{fmtDateTime(post.scheduledFor)}</span>
                        </div>
                      </div>
                      <Menu
                        trigger={
                          <IconButton label={`Options for ${post.platform} post`} size="sm">
                            <MoreHorizontal />
                          </IconButton>
                        }
                      >
                        <MenuItem icon={<PenSquare />} onSelect={() => openEdit(post)}>
                          Edit
                        </MenuItem>
                        <MenuItem icon={<CheckCircle2 />} onSelect={() => markPosted(post)}>
                          Mark posted
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem icon={<Trash2 />} danger onSelect={() => setDeletePost(post)}>
                          Delete
                        </MenuItem>
                      </Menu>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          {/* Recent posts */}
          <Card id="recent-posts" padding="none" className="scroll-mt-20 overflow-hidden">
            <div className="border-b border-hairline px-5 py-3.5">
              <h3 className="text-[13px] font-semibold text-ink">Recent posts</h3>
            </div>
            {recent.length === 0 ? (
              <EmptyState
                icon={<Send />}
                title="No posts published yet"
                description="Posts you mark as posted will show up here with their engagement."
              />
            ) : (
              <ul className="divide-y divide-hairline">
                {recent.map((post) => {
                  const meta = PLATFORM_META[post.platform]
                  return (
                    <li key={post.id} className="flex items-start gap-3 px-5 py-3.5">
                      <ProductTile emoji={meta.emoji} hue={meta.hue} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm text-ink">{post.content}</p>
                        <p className="mt-1.5 text-xs text-ink-3">
                          {numCompact(post.likes)} likes · {numCompact(post.comments)} comments ·{' '}
                          {numCompact(post.shares)} shares
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-ink-3">{timeAgo(post.scheduledFor)}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      </section>

      {/* Compose / edit modal */}
      <ComposeModal
        open={composeOpen}
        onClose={() => {
          setComposeOpen(false)
          setEditingPost(null)
        }}
        editing={editingPost}
      />

      {/* Delete post */}
      <ConfirmDialog
        open={deletePost !== null}
        onClose={() => setDeletePost(null)}
        onConfirm={() => {
          if (deletePost) {
            removeItem('socialPosts', deletePost.id)
            toast('Post deleted', { tone: 'success' })
          }
        }}
        title="Delete post?"
        description={
          deletePost
            ? `"${deletePost.content.slice(0, 60)}${deletePost.content.length > 60 ? '…' : ''}" will be removed from your calendar.`
            : undefined
        }
        confirmLabel="Delete"
        danger
      />

      {/* Add / edit account */}
      <AccountModal
        open={accountModal.open}
        editing={accountModal.account}
        onClose={() => setAccountModal({ open: false, account: null })}
      />

      {/* Remove account */}
      <ConfirmDialog
        open={removeAccount !== null}
        onClose={() => setRemoveAccount(null)}
        onConfirm={() => {
          if (removeAccount) {
            removeItem('socialAccounts', removeAccount.id)
            // If this account fed a storefront footer icon, clear it too
            const key = FOOTER_KEY[removeAccount.platform]
            if (key && removeAccount.url && settings.social?.[key] === removeAccount.url) {
              updateSettings({ social: { ...settings.social, [key]: undefined } })
            }
            toast(`${removeAccount.platform} account removed`, { tone: 'success' })
          }
        }}
        title="Remove account?"
        description={
          removeAccount
            ? `${removeAccount.platform} (${removeAccount.handle}) will be removed from your dashboard${
                FOOTER_KEY[removeAccount.platform] && removeAccount.url ? ' and your storefront footer' : ''
              }.`
            : undefined
        }
        confirmLabel="Remove"
        danger
      />
    </div>
  )
}

// ── Account card ─────────────────────────────────────────────────────────────

function AccountCard({ account, onEdit, onRemove }: { account: SocialAccount; onEdit: () => void; onRemove: () => void }) {
  const meta = PLATFORM_META[account.platform]
  const growth =
    account.followersLastMonth > 0
      ? ((account.followers - account.followersLastMonth) / account.followersLastMonth) * 100
      : 0
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <ProductTile emoji={meta.emoji} hue={meta.hue} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink">{account.platform}</div>
          <div className="truncate text-xs text-ink-3">{account.handle}</div>
        </div>
        <Menu
          trigger={
            <IconButton label={`${account.platform} account options`} size="sm">
              <MoreHorizontal />
            </IconButton>
          }
        >
          <MenuItem icon={<PenSquare />} onSelect={onEdit}>
            Edit
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Trash2 />} danger onSelect={onRemove}>
            Remove
          </MenuItem>
        </Menu>
      </div>
      <div>
        <div className="text-2xl font-semibold tracking-tight text-ink tnum">{numCompact(account.followers)}</div>
        <div className="mt-0.5 text-xs">
          <span className={cn('font-semibold', growth >= 0 ? 'text-[#006300] dark:text-good' : 'text-critical')}>
            {signedPct(growth)}
          </span>{' '}
          <span className="text-ink-3">vs last month</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {account.url ? (
          <>
            <Badge tone="green">Linked</Badge>
            <a
              href={account.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-accent-strong hover:underline dark:text-accent"
            >
              Open profile <ExternalLink className="h-3 w-3" />
            </a>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={onEdit}>
            Add profile link
          </Button>
        )}
      </div>
    </Card>
  )
}

// ── Add / edit account modal ─────────────────────────────────────────────────

function AccountModal({ open, editing, onClose }: { open: boolean; editing: SocialAccount | null; onClose: () => void }) {
  const addItem = useStore((s) => s.addItem)
  const updateItem = useStore((s) => s.updateItem)
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)

  const [platform, setPlatform] = useState<SocialPlatform>('Instagram')
  const [handle, setHandle] = useState('')
  const [url, setUrl] = useState('')
  const [followers, setFollowers] = useState('0')
  const [followersLastMonth, setFollowersLastMonth] = useState('0')

  useEffect(() => {
    if (open) {
      setPlatform(editing?.platform ?? 'Instagram')
      setHandle(editing?.handle ?? '')
      setUrl(editing?.url ?? '')
      setFollowers(String(editing?.followers ?? 0))
      setFollowersLastMonth(String(editing?.followersLastMonth ?? 0))
    }
  }, [open, editing])

  const valid = handle.trim().length > 0

  const submit = () => {
    if (!valid) return
    const cleanUrl = url.trim() ? (url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`) : undefined
    const base = {
      platform,
      handle: handle.trim().startsWith('@') || !handle.trim() ? handle.trim() : `@${handle.trim()}`,
      url: cleanUrl,
      followers: Math.max(0, Math.round(Number(followers) || 0)),
      followersLastMonth: Math.max(0, Math.round(Number(followersLastMonth) || 0)),
      connected: Boolean(cleanUrl),
    }
    if (editing) updateItem('socialAccounts', editing.id, base)
    else addItem('socialAccounts', { id: uid('soc'), ...base })

    // Footer-eligible platforms keep the storefront icons in sync
    const key = FOOTER_KEY[platform]
    if (key && cleanUrl) {
      updateSettings({ social: { ...settings.social, [key]: cleanUrl } })
      toast(`${platform} linked`, { description: 'The link also shows in your storefront footer.', tone: 'success' })
    } else {
      toast(editing ? 'Account updated' : 'Account added', { tone: 'success' })
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit account' : 'Add account'}
      description="Link a profile and keep a light touch on its follower counts — update them whenever."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid}>
            {editing ? 'Save changes' : 'Add account'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Platform" required>
            <Select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as SocialPlatform)}
              options={ALL_PLATFORMS.map((p) => ({ value: p, label: `${PLATFORM_META[p].emoji}  ${p}` }))}
            />
          </Field>
          <Field label="Handle" required>
            <Input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@thetinymagicstudio" />
          </Field>
        </div>
        <Field
          label="Profile URL"
          hint={
            FOOTER_KEY[platform]
              ? 'This link also appears as an icon in your storefront footer.'
              : 'The link customers use to find you — shown as “Open profile” here.'
          }
        >
          <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://instagram.com/yourshop" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Followers now" hint="Tracked by hand — the chart follows.">
            <Input type="number" min={0} value={followers} onChange={(e) => setFollowers(e.target.value)} />
          </Field>
          <Field label="A month ago">
            <Input type="number" min={0} value={followersLastMonth} onChange={(e) => setFollowersLastMonth(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

// ── Compose / edit modal ─────────────────────────────────────────────────────

function ComposeModal({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: SocialPost | null }) {
  const addItem = useStore((s) => s.addItem)
  const updateItem = useStore((s) => s.updateItem)

  const [platform, setPlatform] = useState<string>('Instagram')
  const [content, setContent] = useState('')
  const [scheduledFor, setScheduledFor] = useState(defaultSchedule())
  const [status, setStatus] = useState<'Draft' | 'Scheduled'>('Scheduled')

  // Reset the form each time the modal opens
  useEffect(() => {
    if (open) {
      setPlatform(editing?.platform ?? 'Instagram')
      setContent(editing?.content ?? '')
      setScheduledFor(editing ? toLocalInputValue(new Date(editing.scheduledFor)) : defaultSchedule())
      setStatus(editing && editing.status !== 'Posted' ? editing.status : 'Scheduled')
    }
  }, [open, editing])

  const over = content.length > MAX_CHARS
  const valid = platform !== '' && content.trim().length > 0 && !over && scheduledFor !== ''

  const submit = () => {
    if (!valid) return
    const iso = new Date(scheduledFor).toISOString()
    if (editing) {
      updateItem('socialPosts', editing.id, {
        platform: platform as SocialPlatform,
        content: content.trim(),
        scheduledFor: iso,
        status,
      })
      toast('Post updated', { tone: 'success' })
    } else {
      addItem('socialPosts', {
        id: uid('pst'),
        platform: platform as SocialPlatform,
        content: content.trim(),
        scheduledFor: iso,
        status,
        likes: 0,
        comments: 0,
        shares: 0,
      })
      toast(status === 'Draft' ? 'Draft saved' : 'Post scheduled', { tone: 'success' })
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit post' : 'Compose post'}
      description={
        editing ? 'Update this post before it goes out.' : 'Draft or schedule a post to one of your channels.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid}>
            {editing ? 'Save changes' : status === 'Draft' ? 'Save draft' : 'Schedule post'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Platform" required>
          <Select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            options={ALL_PLATFORMS.map((p) => ({ value: p, label: `${PLATFORM_META[p].emoji}  ${p}` }))}
          />
        </Field>
        <Field label="Content" required>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            placeholder="What's happening in the studio?"
            className={cn(over && 'border-critical focus:ring-critical/60')}
          />
          <span className={cn('mt-1 block text-right text-xs tnum', over ? 'font-medium text-critical' : 'text-ink-3')}>
            {num(content.length)} / {MAX_CHARS}
          </span>
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Schedule for">
            <Input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
          </Field>
          <Field label="Status">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'Draft' | 'Scheduled')}
              options={['Draft', 'Scheduled']}
            />
          </Field>
        </div>
      </div>
    </Modal>
  )
}
