// Staff permission model. A permission = an admin SECTION the account may
// open (mirrors the sidebar). Each section maps to the collections its pages
// actually read and write, so granting a page grants exactly what makes that
// page work — the server filters GET /state by the readable union and rejects
// ops outside the writable union. Owners bypass everything.

export const PERM_KEYS = [
  'dashboard', 'orders', 'support', 'inventory', 'products', 'customers', 'suppliers',
  'expenses', 'income', 'accounting', 'shipping', 'manufacturing', 'analytics',
  'marketing', 'reviews', 'newsletter', 'social', 'calendar', 'tasks', 'documents',
  'employees', 'settings',
]

/** Collections every signed-in account can use (topbar bell, business identity) */
const BASE = { read: ['notifications'], write: ['notifications'] }

/** Section → the collections its pages read / write */
const PAGE_ACCESS = {
  dashboard: {
    read: ['orders', 'products', 'materials', 'customers', 'shipments', 'tasks', 'events', 'daysOff', 'expenses', 'incomes', 'adjustments'],
    write: [],
  },
  orders: {
    read: ['orders', 'customers', 'products', 'promoCodes', 'shipments', 'adjustments'],
    write: ['orders', 'customers', 'products', 'adjustments', 'shipments'],
  },
  // Tickets are read through the sync engine but only ever WRITTEN through
  // /api/support endpoints — replies and status changes carry auto-update
  // logic (timestamps, reopens, emails) that raw ops would bypass.
  support: { read: ['tickets', 'orders', 'customers'], write: [] },
  inventory: {
    read: ['products', 'materials', 'adjustments', 'suppliers'],
    write: ['products', 'materials', 'adjustments'],
  },
  products: {
    read: ['products', 'materials', 'recipes', 'adjustments'],
    write: ['products', 'adjustments'],
  },
  customers: { read: ['customers', 'orders', 'products'], write: ['customers'] },
  suppliers: { read: ['suppliers', 'materials'], write: ['suppliers', 'materials'] },
  expenses: { read: ['expenses'], write: ['expenses'] },
  income: { read: ['incomes', 'orders', 'products'], write: ['incomes'] },
  accounting: { read: ['orders', 'expenses', 'incomes', 'products', 'customers'], write: [] },
  shipping: {
    read: ['shipments', 'orders', 'products', 'customers'],
    write: ['shipments', 'orders'],
  },
  manufacturing: {
    read: ['recipes', 'batches', 'machines', 'products', 'materials', 'adjustments'],
    write: ['recipes', 'batches', 'machines', 'products', 'materials', 'adjustments'],
  },
  analytics: { read: ['orders', 'products', 'customers', 'expenses', 'incomes'], write: [] },
  marketing: { read: ['campaigns', 'promoCodes', 'orders'], write: ['campaigns', 'promoCodes'] },
  // Like tickets: read through sync, written ONLY via /api/reviews endpoints
  // (moderation stamps + customer emails live server-side)
  reviews: { read: ['reviews', 'products', 'orders'], write: [] },
  newsletter: {
    read: ['newsletters', 'subscribers', 'products', 'orders', 'promoCodes'],
    write: ['newsletters', 'subscribers'],
  },
  social: { read: ['socialAccounts', 'socialPosts'], write: ['socialAccounts', 'socialPosts'] },
  calendar: { read: ['events', 'daysOff', 'orders', 'tasks', 'batches'], write: ['events', 'daysOff'] },
  tasks: { read: ['tasks'], write: ['tasks'] },
  documents: { read: ['documents'], write: ['documents'] },
  employees: { read: ['employees'], write: ['employees'] },
  settings: { read: [], write: [] }, // settings itself is meta, handled below
}

export function sanitizePerms(perms) {
  if (!Array.isArray(perms)) return []
  return [...new Set(perms.filter((p) => PERM_KEYS.includes(p)))]
}

/**
 * The collections an account may read/write, given its section perms.
 * Meta rights ride along: `settings` needs the settings section, and
 * `newsletterSettings` the newsletter section.
 */
export function computeAccess(user) {
  if (!user || user.role === 'owner') return { all: true }
  const readable = new Set(BASE.read)
  const writable = new Set(BASE.write)
  for (const key of user.perms || []) {
    const access = PAGE_ACCESS[key]
    if (!access) continue
    for (const c of access.read) readable.add(c)
    for (const c of access.write) {
      readable.add(c)
      writable.add(c)
    }
  }
  return {
    all: false,
    readable,
    writable,
    canWriteSettings: (user.perms || []).includes('settings'),
    canWriteNewsletterSettings: (user.perms || []).includes('newsletter'),
  }
}
