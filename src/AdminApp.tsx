import { AppShell } from '@/components/layout/AppShell'
import { AuthGate } from '@/components/auth/AuthGate'

/**
 * Admin entry point, lazy-loaded from App so storefront visitors never
 * download the owner workspace (AppShell, auth, useStore + seed data).
 */
export default function AdminApp() {
  return (
    <AuthGate>
      <AppShell />
    </AuthGate>
  )
}
