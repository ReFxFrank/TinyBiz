// Account & team management — "Your account" (everyone) and "Team & access"
// (owner only). Staff accounts sign in at /admin and only see the sections
// the owner grants; grants map 1:1 to sidebar sections (see nav.ts).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Eye, EyeOff, KeyRound, Lock, Pencil, Trash2, UserPlus, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  Modal,
  Skeleton,
} from '@/components/ui'
import { api, ApiError, type PermKey, type TeamMember } from '@/lib/api'
import { pathPerm, useAuth } from '@/store/useAuth'
import { NAV_GROUPS, SETTINGS_ITEM } from '@/components/layout/nav'
import { toast } from '@/store/useUI'
import { cn } from '@/lib/utils'

// ── Permission model (mirrors the sidebar) ───────────────────────────────────

interface PermItem {
  perm: PermKey
  label: string
  icon: LucideIcon
  /** Extra explanation shown as a tooltip on the chip */
  hint?: string
}

interface PermGroup {
  label?: string
  items: PermItem[]
}

const SETTINGS_HINT = 'Includes editing business settings — profile, tax, shipping and preferences.'

const PERM_GROUPS: PermGroup[] = [
  ...NAV_GROUPS.map((g) => ({
    label: g.label,
    items: g.items.map((it) => ({ perm: pathPerm(it.path), label: it.label, icon: it.icon })),
  })),
  {
    label: 'Admin',
    items: [{ perm: pathPerm(SETTINGS_ITEM.path), label: SETTINGS_ITEM.label, icon: SETTINGS_ITEM.icon, hint: SETTINGS_HINT }],
  },
]

const ALL_PERM_ITEMS: PermItem[] = PERM_GROUPS.flatMap((g) => g.items)
const PERM_LABEL: Record<string, string> = Object.fromEntries(ALL_PERM_ITEMS.map((it) => [it.perm, it.label]))

/** Stable, sidebar-ordered array from a selection set */
function orderedPerms(selected: ReadonlySet<PermKey>): PermKey[] {
  return ALL_PERM_ITEMS.filter((it) => selected.has(it.perm)).map((it) => it.perm)
}

function describeError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.code === 'email_taken') return 'That email already has an account.'
    return e.message
  }
  return fallback
}

const EMAIL_RE = /\S+@\S+\.\S+/

// ── Shared bits ──────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: 'owner' | 'staff' }) {
  return <Badge tone={role === 'owner' ? 'violet' : 'blue'}>{role === 'owner' ? 'Owner' : 'Staff'}</Badge>
}

/** Password input with a small show/hide eye toggle */
function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoComplete?: string
  ariaLabel?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-label={ariaLabel}
        className="pr-10 font-mono"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        title={show ? 'Hide password' : 'Show password'}
        className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-sunken hover:text-ink"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

// ── Your account (every signed-in user) ──────────────────────────────────────

export function AccountCard() {
  const user = useAuth((s) => s.user)

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [currentError, setCurrentError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (!user) return null

  const nextError = next !== '' && next.length < 8 ? 'At least 8 characters.' : undefined
  const confirmError = confirm !== '' && confirm !== next ? "Passwords don't match." : undefined
  const canSubmit = current !== '' && next.length >= 8 && confirm === next && !saving

  const submit = async () => {
    if (!canSubmit) return
    setCurrentError(null)
    setSaving(true)
    try {
      await api.changePassword(current, next)
      setCurrent('')
      setNext('')
      setConfirm('')
      toast('Password changed', { tone: 'success' })
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setCurrentError('Current password is incorrect.')
      } else {
        toast('Could not change password', { tone: 'error', description: describeError(e, 'Try again in a moment.') })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader title="Your account" subtitle="Who you're signed in as, and your password." />
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-sunken/60 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink">{user.name || user.email}</div>
          <div className="truncate text-[13px] text-ink-3">{user.email}</div>
        </div>
        <RoleBadge role={user.role} />
      </div>

      <div className="mt-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink">
          <KeyRound className="h-4 w-4 text-ink-3" aria-hidden />
          Change password
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Current password" error={currentError ?? undefined}>
            <PasswordInput
              value={current}
              onChange={(v) => {
                setCurrent(v)
                setCurrentError(null)
              }}
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </Field>
          <Field label="New password" hint={nextError ? undefined : 'At least 8 characters.'} error={nextError}>
            <PasswordInput value={next} onChange={setNext} autoComplete="new-password" placeholder="New password" />
          </Field>
          <Field label="Confirm new password" error={confirmError}>
            <PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" placeholder="Repeat it" />
          </Field>
        </div>
        <div className="mt-4">
          <Button size="sm" disabled={!canSubmit} onClick={() => void submit()}>
            {saving ? 'Changing…' : 'Change password'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

// ── Section access picker (create + edit modals) ─────────────────────────────

function PermPicker({
  selected,
  onChange,
}: {
  selected: ReadonlySet<PermKey>
  onChange: (next: Set<PermKey>) => void
}) {
  const toggle = (perm: PermKey) => {
    const next = new Set(selected)
    if (next.has(perm)) next.delete(perm)
    else next.add(perm)
    onChange(next)
  }

  const setGroup = (items: PermItem[], on: boolean) => {
    const next = new Set(selected)
    for (const it of items) {
      if (on) next.add(it.perm)
      else next.delete(it.perm)
    }
    onChange(next)
  }

  return (
    <div className="space-y-3">
      {PERM_GROUPS.map((group, gi) => {
        const allOn = group.items.every((it) => selected.has(it.perm))
        return (
          <div key={group.label ?? `group-${gi}`}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                {group.label ?? 'General'}
              </span>
              {group.items.length > 1 && (
                <button
                  type="button"
                  onClick={() => setGroup(group.items, !allOn)}
                  className="text-[11px] font-medium text-accent hover:underline"
                >
                  {allOn ? 'None' : 'All'}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {group.items.map((it) => {
                const checked = selected.has(it.perm)
                const Icon = it.icon
                return (
                  <button
                    key={it.perm}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    title={it.hint}
                    onClick={() => toggle(it.perm)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-medium transition-colors duration-150',
                      checked
                        ? 'border-transparent bg-accent-wash text-accent-strong dark:text-accent'
                        : 'border-edge bg-surface text-ink-2 hover:bg-sunken',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {it.label}
                    {checked && <Check className="h-3 w-3" aria-hidden />}
                  </button>
                )
              })}
            </div>
            {group.label === 'Admin' && <p className="mt-1.5 text-xs text-ink-3">{SETTINGS_HINT}</p>}
          </div>
        )
      })}
    </div>
  )
}

// ── Create / edit teammate modal ─────────────────────────────────────────────

function MemberModal({
  open,
  onClose,
  member,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  /** Present → edit an existing staff account; absent → create */
  member?: TeamMember
  onSaved: () => void
}) {
  const editing = Boolean(member)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  const [perms, setPerms] = useState<Set<PermKey>>(() => new Set())
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Fresh fields every time the modal opens
  useEffect(() => {
    if (!open) return
    setName(member?.name ?? '')
    setEmail(member?.email ?? '')
    setPassword('')
    setResetOpen(false)
    setPerms(new Set(member?.perms ?? []))
    setServerError(null)
    setSaving(false)
  }, [open, member])

  const emailValid = EMAIL_RE.test(email.trim())
  const passwordError =
    password !== '' && password.length < 8 ? 'At least 8 characters.' : undefined
  const canSubmit = editing
    ? !saving && (!resetOpen || password === '' || password.length >= 8)
    : !saving && emailValid && password.length >= 8

  const submit = async () => {
    if (!canSubmit) return
    setServerError(null)
    setSaving(true)
    try {
      if (member) {
        const patch: { name?: string; perms?: PermKey[]; password?: string } = {
          name: name.trim(),
          perms: orderedPerms(perms),
        }
        if (resetOpen && password) patch.password = password
        await api.team.update(member.id, patch)
        toast('Teammate updated', { tone: 'success' })
      } else {
        await api.team.create({
          email: email.trim(),
          name: name.trim(),
          password,
          perms: orderedPerms(perms),
        })
        toast('Teammate added', {
          tone: 'success',
          description: `${email.trim()} can now sign in at /admin.`,
        })
      }
      onSaved()
      onClose()
    } catch (e) {
      setServerError(describeError(e, 'Something went wrong. Try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? 'Edit teammate' : 'Add teammate'}
      description={
        editing
          ? 'Change what this account can see and do.'
          : 'They sign in at /admin with this email and only see the sections you grant.'
      }
      footer={
        <>
          {serverError && <span className="mr-auto self-center text-[13px] text-critical">{serverError}</span>}
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create account'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Rivera" autoComplete="off" />
          </Field>
          <Field
            label="Email"
            required={!editing}
            hint={editing ? 'Email can’t be changed.' : undefined}
            error={!editing && email !== '' && !emailValid ? 'Enter a valid email.' : undefined}
          >
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex@yourshop.com"
              disabled={editing}
              autoComplete="off"
            />
          </Field>
        </div>

        {editing ? (
          <div>
            {resetOpen ? (
              <Field
                label="New password"
                hint={passwordError ? undefined : 'Leave empty to keep their current password. Resetting signs them out everywhere.'}
                error={passwordError}
              >
                <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" placeholder="New password (min 8 characters)" />
              </Field>
            ) : (
              <Button variant="ghost" size="sm" icon={<KeyRound />} onClick={() => setResetOpen(true)}>
                Reset password…
              </Button>
            )}
          </div>
        ) : (
          <Field
            label="Temporary password"
            required
            hint={passwordError ? undefined : 'At least 8 characters — share it with them so they can sign in, and have them change it after.'}
            error={passwordError}
          >
            <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" placeholder="Min 8 characters" />
          </Field>
        )}

        <div className="border-t border-hairline pt-4">
          <div className="mb-1 text-sm font-medium text-ink">Section access</div>
          <p className="mb-3 text-[13px] text-ink-3">Pick the parts of TinyBiz this teammate can open.</p>
          <PermPicker selected={perms} onChange={setPerms} />
          <p className="mt-3 text-xs text-ink-3">
            {perms.size === 0
              ? 'No sections selected — they’ll be able to sign in but won’t see anything yet.'
              : `${perms.size} of ${ALL_PERM_ITEMS.length} sections selected.`}
          </p>
        </div>
      </div>
    </Modal>
  )
}

// ── Team & access (owner only) ───────────────────────────────────────────────

function MemberRow({
  member,
  busy,
  onEdit,
  onToggleDisabled,
  onDelete,
}: {
  member: TeamMember
  busy: boolean
  onEdit: () => void
  onToggleDisabled: () => void
  onDelete: () => void
}) {
  const isOwner = member.role === 'owner'
  const permTitles = orderedPerms(new Set(member.perms)).map((p) => PERM_LABEL[p] ?? p)
  const permsSummary = isOwner
    ? 'All sections'
    : member.perms.length === 0
      ? 'No sections'
      : `${member.perms.length} section${member.perms.length === 1 ? '' : 's'}`

  return (
    <div className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-ink">{member.name || '—'}</span>
          <RoleBadge role={member.role} />
          {member.disabled && <Badge tone="yellow">Disabled</Badge>}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[13px] text-ink-3">
          <span className="truncate">{member.email}</span>
          <span aria-hidden>·</span>
          <span
            className="shrink-0 cursor-default"
            title={isOwner ? 'Owners can open every section.' : permTitles.join(', ') || 'No sections granted yet.'}
          >
            {permsSummary}
          </span>
        </div>
      </div>
      {isOwner ? (
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-3">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          Owner — full access
        </span>
      ) : (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="outline" size="sm" icon={<Pencil />} onClick={onEdit} disabled={busy}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={onToggleDisabled} disabled={busy}>
            {member.disabled ? 'Enable' : 'Disable'}
          </Button>
          <IconButton label={`Delete ${member.email}`} size="sm" onClick={onDelete} disabled={busy} className="hover:text-critical">
            <Trash2 />
          </IconButton>
        </div>
      )}
    </div>
  )
}

export function TeamAccess() {
  const user = useAuth((s) => s.user)

  const [members, setMembers] = useState<TeamMember[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<TeamMember | null>(null)
  const [deleting, setDeleting] = useState<TeamMember | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const isOwner = user?.role === 'owner'

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const { users } = await api.team.list()
      setMembers(users)
    } catch (e) {
      setLoadError(describeError(e, 'Could not load your team.'))
    }
  }, [])

  useEffect(() => {
    if (isOwner) void load()
  }, [isOwner, load])

  const sorted = useMemo(() => {
    if (!members) return null
    return [...members].sort((a, b) => {
      if (a.role !== b.role) return a.role === 'owner' ? -1 : 1
      return a.createdAt.localeCompare(b.createdAt)
    })
  }, [members])

  if (!isOwner) return null

  const staffCount = members?.filter((m) => m.role === 'staff').length ?? 0

  const toggleDisabled = async (m: TeamMember) => {
    setBusyId(m.id)
    try {
      await api.team.update(m.id, { disabled: !m.disabled })
      toast(m.disabled ? 'Account enabled' : 'Account disabled', {
        tone: 'success',
        description: m.disabled ? `${m.email} can sign in again.` : `${m.email} can no longer sign in.`,
      })
      await load()
    } catch (e) {
      toast('Could not update account', { tone: 'error', description: describeError(e, 'Try again in a moment.') })
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (m: TeamMember) => {
    setBusyId(m.id)
    try {
      await api.team.remove(m.id)
      toast('Teammate removed', { tone: 'success', description: `${m.email} has been signed out and deleted.` })
      await load()
    } catch (e) {
      toast('Could not remove teammate', { tone: 'error', description: describeError(e, 'Try again in a moment.') })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Team & access"
        subtitle="Staff accounts sign in at /admin and only see the sections you grant them."
        actions={
          <Button size="sm" icon={<UserPlus />} onClick={() => setCreateOpen(true)}>
            Add teammate
          </Button>
        }
      />

      {loadError ? (
        <ErrorState title="Couldn't load your team" description={loadError} onRetry={() => void load()} className="py-8" />
      ) : sorted === null ? (
        <div className="divide-y divide-hairline">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
              <div className="flex-1">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="mt-2 h-3 w-52" />
              </div>
              <Skeleton className="h-8 w-24 rounded-lg" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="divide-y divide-hairline">
            {sorted.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                busy={busyId === m.id}
                onEdit={() => setEditing(m)}
                onToggleDisabled={() => void toggleDisabled(m)}
                onDelete={() => setDeleting(m)}
              />
            ))}
          </div>
          {staffCount === 0 && (
            <EmptyState
              icon={<Users />}
              title="It's just you so far"
              description="Add a teammate to give them their own sign-in with access to only the sections they need."
              action={
                <Button size="sm" icon={<UserPlus />} onClick={() => setCreateOpen(true)}>
                  Add teammate
                </Button>
              }
              className="py-8"
            />
          )}
        </>
      )}

      <MemberModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={() => void load()} />
      <MemberModal
        open={editing !== null}
        member={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSaved={() => void load()}
      />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) void remove(deleting)
        }}
        danger
        title="Remove this teammate?"
        description={
          deleting
            ? `${deleting.email} will lose access immediately and be signed out everywhere. This cannot be undone.`
            : undefined
        }
        confirmLabel="Remove teammate"
      />
    </Card>
  )
}
