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
    items: [{ label: 'Dashboard', path: '/', icon: LayoutDashboard, shortcut: 'd' }],
  },
  {
    label: 'Sell',
    items: [
      { label: 'Orders', path: '/orders', icon: ShoppingCart, shortcut: 'o' },
      { label: 'Shipping', path: '/shipping', icon: Truck },
      { label: 'Customers', path: '/customers', icon: Users, shortcut: 'c' },
    ],
  },
  {
    label: 'Make',
    items: [
      { label: 'Products', path: '/products', icon: Box, shortcut: 'p' },
      { label: 'Inventory', path: '/inventory', icon: Warehouse, shortcut: 'i' },
      { label: 'Manufacturing', path: '/manufacturing', icon: Factory, shortcut: 'm' },
      { label: 'Suppliers', path: '/suppliers', icon: Handshake },
    ],
  },
  {
    label: 'Money',
    items: [
      { label: 'Income', path: '/income', icon: Wallet },
      { label: 'Expenses', path: '/expenses', icon: Receipt, shortcut: 'e' },
      { label: 'Accounting', path: '/accounting', icon: Calculator },
    ],
  },
  {
    label: 'Grow',
    items: [
      { label: 'Analytics', path: '/analytics', icon: BarChart3, shortcut: 'a' },
      { label: 'Marketing', path: '/marketing', icon: Megaphone },
      { label: 'Social Media', path: '/social', icon: Share2 },
    ],
  },
  {
    label: 'Organize',
    items: [
      { label: 'Calendar', path: '/calendar', icon: CalendarDays },
      { label: 'Tasks', path: '/tasks', icon: ClipboardList, shortcut: 't' },
      { label: 'Documents', path: '/documents', icon: FileText },
      { label: 'Employees', path: '/employees', icon: Contact },
    ],
  },
]

export const SETTINGS_ITEM: NavItem = { label: 'Settings', path: '/settings', icon: Settings, shortcut: 's' }

export const ALL_NAV_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS_ITEM]
