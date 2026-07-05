// ─────────────────────────────────────────────────────────────────────────────
// Domain types — the single source of truth for every entity in TinyBiz.
// ─────────────────────────────────────────────────────────────────────────────

export type ID = string

export interface Address {
  line1: string
  city: string
  state: string
  zip: string
  country: string
}

// ── Catalog ──────────────────────────────────────────────────────────────────

export interface ProductVariant {
  id: ID
  name: string
  sku: string
  price: number
  cost: number
  stock: number
}

export type ProductCategory = '3D Prints' | 'Stickers' | 'Accessories' | 'Home & Desk' | 'Packaging Add-ons'

export interface Product {
  id: ID
  name: string
  sku: string
  category: ProductCategory
  description: string
  price: number
  cost: number
  stock: number
  reorderPoint: number
  /** Emoji used as the product's artwork tile */
  image: string
  /** Hue (0–360) for the artwork tile's soft gradient background */
  imageHue: number
  tags: string[]
  variants: ProductVariant[]
  weightGrams: number
  dimensionsCm: { l: number; w: number; h: number }
  productionTimeMin: number
  /** Linked bill of materials, if this product is manufactured in-house */
  recipeId?: ID
  active: boolean
  createdAt: string
}

export type MaterialCategory =
  | 'Filament'
  | 'Packaging'
  | 'Stickers'
  | 'Boxes'
  | 'Shipping supplies'
  | 'Components'
  | 'Inserts'

export type MaterialUnit = 'g' | 'pcs' | 'm' | 'sheets'

export interface Material {
  id: ID
  name: string
  sku: string
  category: MaterialCategory
  unit: MaterialUnit
  stock: number
  reorderPoint: number
  costPerUnit: number
  supplierId?: ID
  createdAt: string
}

export type AdjustmentReason = 'Recount' | 'Damaged' | 'Lost' | 'Production' | 'Return' | 'Received' | 'Manual'

export interface StockAdjustment {
  id: ID
  date: string
  itemType: 'product' | 'material'
  itemId: ID
  itemName: string
  delta: number
  reason: AdjustmentReason
  notes?: string
}

// ── Sales ────────────────────────────────────────────────────────────────────

export const ORDER_STATUSES = [
  'New',
  'Processing',
  'Printing',
  'Packaging',
  'Ready to Ship',
  'Shipped',
  'Delivered',
  'Cancelled',
  'Returned',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

/** Statuses that still need work before the order leaves the shop */
export const OPEN_STATUSES: OrderStatus[] = ['New', 'Processing', 'Printing', 'Packaging', 'Ready to Ship']

export type SalesChannel = 'Etsy' | 'Shopify' | 'Website' | 'Market' | 'Amazon'

export interface OrderItem {
  productId: ID
  name: string
  quantity: number
  unitPrice: number
  unitCost: number
}

export type Carrier = 'USPS' | 'UPS' | 'FedEx' | 'DHL'

export interface Order {
  id: ID
  number: string
  customerId: ID
  customerName: string
  email: string
  status: OrderStatus
  channel: SalesChannel
  items: OrderItem[]
  /** What we pay the carrier */
  shippingCost: number
  /** What the customer paid for shipping */
  shippingCharged: number
  taxCollected: number
  trackingNumber?: string
  carrier?: Carrier
  shippingAddress: Address
  notes?: string
  placedAt: string
  shipBy?: string
  shippedAt?: string
  deliveredAt?: string
}

export interface Customer {
  id: ID
  name: string
  email: string
  phone?: string
  address?: Address
  notes?: string
  tags: string[]
  createdAt: string
}

// ── Supply side ──────────────────────────────────────────────────────────────

export interface Supplier {
  id: ID
  name: string
  contactName?: string
  email?: string
  phone?: string
  website?: string
  category: string
  notes?: string
  leadTimeDays: number
  /** 1–5 */
  rating: number
  createdAt: string
}

// ── Money ────────────────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES = [
  'Shipping',
  'Supplies',
  'Equipment',
  'Utilities',
  'Marketing',
  'Software',
  'Taxes',
  'Fees',
  'Miscellaneous',
] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export interface Expense {
  id: ID
  date: string
  vendor: string
  category: ExpenseCategory
  amount: number
  notes?: string
  recurring?: 'monthly' | 'yearly'
}

export type IncomeCategory = 'Sales' | 'Wholesale' | 'Commissions' | 'Workshops' | 'Other'

/** Manual income entries outside of orders (craft fairs, wholesale, teaching…) */
export interface IncomeEntry {
  id: ID
  date: string
  source: string
  category: IncomeCategory
  amount: number
  notes?: string
}

// ── Manufacturing ────────────────────────────────────────────────────────────

export interface RecipeLine {
  materialId: ID
  quantity: number
}

/** A bill of materials: what it takes to make `outputQty` of a product */
export interface Recipe {
  id: ID
  name: string
  productId: ID
  outputQty: number
  lines: RecipeLine[]
  printTimeMin: number
  notes?: string
}

export type BatchStatus = 'Queued' | 'In Progress' | 'Completed' | 'Failed'

export interface ProductionBatch {
  id: ID
  recipeId: ID
  productId: ID
  productName: string
  /** Units planned */
  quantity: number
  /** Units that came out good (set on completion) */
  produced: number
  /** Failed prints */
  failed: number
  machineId: ID
  machineName: string
  status: BatchStatus
  startedAt: string
  completedAt?: string
  printTimeMin: number
  wasteGrams: number
  notes?: string
}

export interface Machine {
  id: ID
  name: string
  model: string
  status: 'Idle' | 'Printing' | 'Maintenance'
  hoursLogged: number
  /** Bridge printer serial/id this machine maps to, for live status sync */
  syncId?: string
}

// ── Fulfilment ───────────────────────────────────────────────────────────────

export type ShipmentStatus = 'Label created' | 'In transit' | 'Out for delivery' | 'Delivered' | 'Needs attention'

export interface Shipment {
  id: ID
  orderId: ID
  orderNumber: string
  customerName: string
  carrier: Carrier
  service: string
  trackingNumber: string
  cost: number
  status: ShipmentStatus
  shippedAt: string
  estimatedDelivery?: string
  deliveredAt?: string
  weightGrams: number
}

// ── Organization ─────────────────────────────────────────────────────────────

export type TaskStatus = 'todo' | 'in-progress' | 'waiting' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'

export interface TaskItem {
  id: ID
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  dueDate?: string
  tags: string[]
  createdAt: string
  /** Sort position within its column */
  order: number
}

export type EventType = 'deadline' | 'ship-by' | 'purchase' | 'delivery' | 'production' | 'market' | 'other'

export interface CalendarEvent {
  id: ID
  title: string
  /** ISO date (day precision) */
  date: string
  type: EventType
  notes?: string
  relatedId?: ID
}

export type TimeOffKind = 'Day off' | 'Vacation'

/** A single non-working day marked on the calendar */
export interface TimeOff {
  id: ID
  /** YYYY-MM-DD day key */
  date: string
  kind: TimeOffKind
  note?: string
}

export type DocCategory = 'Invoice' | 'Receipt' | 'Manual' | 'Warranty' | 'Supplier' | 'Tax'
export type DocFileType = 'pdf' | 'png' | 'jpg' | 'docx' | 'xlsx' | 'csv'

export interface DocumentItem {
  id: ID
  name: string
  category: DocCategory
  fileType: DocFileType
  sizeKB: number
  uploadedAt: string
  tags: string[]
  notes?: string
}

export interface Employee {
  id: ID
  name: string
  role: string
  email: string
  phone?: string
  payRate: number
  payType: 'hourly' | 'salary'
  status: 'Active' | 'Inactive'
  startDate: string
  avatarHue: number
}

// ── Growth ───────────────────────────────────────────────────────────────────

export type CampaignChannel = 'Email' | 'Instagram' | 'TikTok' | 'Pinterest' | 'Etsy Ads' | 'Google Ads'
export type CampaignStatus = 'Draft' | 'Active' | 'Paused' | 'Completed'

export interface Campaign {
  id: ID
  name: string
  channel: CampaignChannel
  status: CampaignStatus
  budget: number
  spent: number
  clicks: number
  conversions: number
  revenue: number
  startDate: string
  endDate?: string
}

export interface PromoCode {
  id: ID
  code: string
  discountPct: number
  uses: number
  maxUses?: number
  active: boolean
  expiresAt?: string
}

export type SocialPlatform = 'Instagram' | 'TikTok' | 'Pinterest' | 'Facebook' | 'YouTube' | 'X'

export interface SocialAccount {
  id: ID
  platform: SocialPlatform
  handle: string
  followers: number
  followersLastMonth: number
  connected: boolean
}

export interface SocialPost {
  id: ID
  platform: SocialPlatform
  content: string
  scheduledFor: string
  status: 'Draft' | 'Scheduled' | 'Posted'
  likes: number
  comments: number
  shares: number
}

// ── Newsletter ───────────────────────────────────────────────────────────────

export type SubscriberStatus = 'subscribed' | 'unsubscribed'

export interface Subscriber {
  id: ID
  email: string
  name?: string
  status: SubscriberStatus
  tags: string[]
  /** How they joined: 'Order' | 'Import' | 'Signup form' | 'Manual' */
  source: string
  createdAt: string
}

export type NewsletterCadence = 'one-time' | 'weekly' | 'monthly'
export type NewsletterStatus = 'draft' | 'scheduled' | 'sent'

export interface Newsletter {
  id: ID
  subject: string
  /** Short preview text shown after the subject in inboxes */
  preheader?: string
  /** Main body copy (plain text, rendered into the template) */
  intro: string
  /** Undefined = everyone subscribed; otherwise only subscribers with this tag */
  audienceTag?: string
  cadence: NewsletterCadence
  status: NewsletterStatus
  // Auto content modules, pulled live from the shop when the email is built
  includeBestSellers: boolean
  includeNewProducts: boolean
  /** Promo code to feature, by code string; undefined = none */
  promoCode?: string
  scheduledFor?: string
  sentAt?: string
  recipientCount?: number
  opens?: number
  clicks?: number
  createdAt: string
}

export interface NewsletterSettings {
  fromName: string
  fromEmail: string
  replyTo: string
  /** Physical mailing address shown in the footer (required for CAN-SPAM compliance) */
  mailingAddress: string
  /** A friendly sign-off line in the footer */
  footerNote: string
  defaultCadence: NewsletterCadence
  /** 0–6 (Sun–Sat) for weekly sends */
  sendWeekday: number
  /** 1–28 for monthly sends */
  sendMonthDay: number
  /** 0–23 local hour to send */
  sendHour: number
  /** Base URL of the TinyBiz mail bridge, e.g. http://192.168.1.50:7071 */
  mailBridgeUrl: string
  /** Shared secret the mail bridge requires */
  mailBridgeToken: string
}

// ── System ───────────────────────────────────────────────────────────────────

export type NotificationType = 'low-stock' | 'order' | 'shipping' | 'expense' | 'report' | 'message' | 'task'

export interface AppNotification {
  id: ID
  type: NotificationType
  title: string
  body: string
  createdAt: string
  read: boolean
  /** Route to navigate to when clicked, e.g. '/orders' */
  link?: string
}

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD'

export interface Settings {
  businessName: string
  ownerName: string
  email: string
  phone: string
  address: Address
  logoEmoji: string
  tagline: string
  currency: CurrencyCode
  /** Percent, e.g. 7.25 */
  taxRate: number
  notifyLowStock: boolean
  notifyNewOrders: boolean
  notifyExpensesDue: boolean
  weeklyReports: boolean
  /** Base URL of the TinyBiz printer bridge, e.g. http://192.168.1.50:7070 */
  printerBridgeUrl: string
}
