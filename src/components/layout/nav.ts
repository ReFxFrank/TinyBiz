// The navigation model — shared by the sidebar, command palette, and shortcuts.
import {
  BarChart3,
  Box,
  Calculator,
  CalendarDays,
  ClipboardList,
  Contact,
  Factory,
  FileText,
  Handshake,
  LayoutDashboard,
  LifeBuoy,
  Mail,
  Megaphone,
  Receipt,
  Settings,
  Share2,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
  /** Second key of the `g` chord shortcut, e.g. 'o' → press g then o */
  shortcut?: string
}

export interface NavGroup {
  label?: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ label: 'Dashboard', path: '/admin', icon: LayoutDashboard, shortcut: 'd' }],
  },
  {
    label: 'Sell',
    items: [
      { label: 'Orders', path: '/admin/orders', icon: ShoppingCart, shortcut: 'o' },
      { label: 'Support', path: '/admin/support', icon: LifeBuoy, shortcut: 'h' },
      { label: 'Shipping', path: '/admin/shipping', icon: Truck },
      { label: 'Customers', path: '/admin/customers', icon: Users, shortcut: 'c' },
    ],
  },
  {
    label: 'Make',
    items: [
      { label: 'Products', path: '/admin/products', icon: Box, shortcut: 'p' },
      { label: 'Inventory', path: '/admin/inventory', icon: Warehouse, shortcut: 'i' },
      { label: 'Manufacturing', path: '/admin/manufacturing', icon: Factory, shortcut: 'm' },
      { label: 'Suppliers', path: '/admin/suppliers', icon: Handshake },
    ],
  },
  {
    label: 'Money',
    items: [
      { label: 'Income', path: '/admin/income', icon: Wallet },
      { label: 'Expenses', path: '/admin/expenses', icon: Receipt, shortcut: 'e' },
      { label: 'Accounting', path: '/admin/accounting', icon: Calculator },
    ],
  },
  {
    label: 'Grow',
    items: [
      { label: 'Analytics', path: '/admin/analytics', icon: BarChart3, shortcut: 'a' },
      { label: 'Marketing', path: '/admin/marketing', icon: Megaphone },
      { label: 'Newsletter', path: '/admin/newsletter', icon: Mail, shortcut: 'n' },
      { label: 'Social Media', path: '/admin/social', icon: Share2 },
    ],
  },
  {
    label: 'Organize',
    items: [
      { label: 'Calendar', path: '/admin/calendar', icon: CalendarDays },
      { label: 'Tasks', path: '/admin/tasks', icon: ClipboardList, shortcut: 't' },
      { label: 'Documents', path: '/admin/documents', icon: FileText },
      { label: 'Employees', path: '/admin/employees', icon: Contact },
    ],
  },
]

export const SETTINGS_ITEM: NavItem = { label: 'Settings', path: '/admin/settings', icon: Settings, shortcut: 's' }

export const ALL_NAV_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS_ITEM]
