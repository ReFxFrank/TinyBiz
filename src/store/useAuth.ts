// Who is signed into the admin, and what they may see. Populated by AuthGate
// from /api/auth/me; every permission-gated surface (sidebar, routes, command
// palette, sync engine) reads from here.

import { create } from 'zustand'
import type { AuthUser, PermKey } from '@/lib/api'

interface AuthState {
  user: AuthUser | null
  setUser: (user: AuthUser | null) => void
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}))

/** The section an admin path belongs to: '/admin/orders?x' → 'orders' */
export function pathPerm(path: string): PermKey {
  const seg = path.replace(/^\/admin\/?/, '').split(/[/?#]/)[0]
  return (seg || 'dashboard') as PermKey
}

export function canOpen(user: AuthUser | null, perm: PermKey): boolean {
  if (!user) return false
  return user.role === 'owner' || user.perms.includes(perm)
}

/** Hook: may the signed-in account open this admin path? */
export function useCanOpenPath(): (path: string) => boolean {
  const user = useAuth((s) => s.user)
  return (path) => canOpen(user, pathPerm(path))
}

/** May the sync engine send writes for this collection? */
export function canWriteCollection(user: AuthUser | null, collection: string): boolean {
  if (!user) return false
  if (user.access.all) return true
  return (user.access.writable ?? []).includes(collection)
}

export function canWriteMeta(user: AuthUser | null, key: 'settings' | 'newsletterSettings'): boolean {
  if (!user) return false
  if (user.access.all) return true
  return key === 'settings' ? Boolean(user.access.canWriteSettings) : Boolean(user.access.canWriteNewsletterSettings)
}
