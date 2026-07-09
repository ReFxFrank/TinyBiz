// The domain store. All business data lives here, persisted to localStorage.
// Pages read collections with selectors and mutate through the actions below —
// generic CRUD via addItem/updateItem/removeItem plus domain actions with side
// effects (stock adjustments, production runs, status transitions).

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AdjustmentReason,
  AppNotification,
  CalendarEvent,
  Campaign,
  Customer,
  DocumentItem,
  Employee,
  Expense,
  ID,
  IncomeEntry,
  Machine,
  Material,
  Order,
  OrderStatus,
  Product,
  ProductionBatch,
  PromoCode,
  Recipe,
  Settings,
  Shipment,
  SocialAccount,
  SocialPost,
  StockAdjustment,
  Newsletter,
  NewsletterSettings,
  Subscriber,
  Supplier,
  TaskItem,
  TimeOff,
} from '@/data/types'
import {
  buildSeedNotifications,
  seedAdjustments,
  seedBatches,
  seedCampaigns,
  seedCustomers,
  seedDaysOff,
  seedDocuments,
  seedEmployees,
  seedEvents,
  seedExpenses,
  seedIncomes,
  seedMachines,
  seedMaterials,
  seedOrders,
  seedProducts,
  seedPromoCodes,
  seedRecipes,
  seedSettings,
  seedShipments,
  seedNewsletters,
  seedNewsletterSettings,
  seedSocialAccounts,
  seedSocialPosts,
  seedSubscribers,
  seedSuppliers,
  seedTasks,
} from '@/data/seed'
import { setActiveCurrency } from '@/lib/format'
import { migrateKey } from '@/lib/legacyStorage'

// Carry the offline data cache over from the pre-rename key
migrateKey('tinybiz-data', 'tms-data')
import { uid } from '@/lib/utils'

export interface Collections {
  products: Product[]
  materials: Material[]
  orders: Order[]
  customers: Customer[]
  suppliers: Supplier[]
  expenses: Expense[]
  incomes: IncomeEntry[]
  recipes: Recipe[]
  batches: ProductionBatch[]
  machines: Machine[]
  shipments: Shipment[]
  tasks: TaskItem[]
  events: CalendarEvent[]
  daysOff: TimeOff[]
  documents: DocumentItem[]
  employees: Employee[]
  campaigns: Campaign[]
  promoCodes: PromoCode[]
  socialAccounts: SocialAccount[]
  socialPosts: SocialPost[]
  subscribers: Subscriber[]
  newsletters: Newsletter[]
  adjustments: StockAdjustment[]
  notifications: AppNotification[]
}

export type CollectionKey = keyof Collections
type ItemOf<K extends CollectionKey> = Collections[K][number]

interface StoreState extends Collections {
  settings: Settings
  newsletterSettings: NewsletterSettings

  /** Insert an item at the top of a collection. Returns the stored item. */
  addItem: <K extends CollectionKey>(key: K, item: ItemOf<K>) => ItemOf<K>
  /** Shallow-merge a patch into the item with the given id. */
  updateItem: <K extends CollectionKey>(key: K, id: ID, patch: Partial<ItemOf<K>>) => void
  removeItem: <K extends CollectionKey>(key: K, id: ID) => void

  updateSettings: (patch: Partial<Settings>) => void
  updateNewsletterSettings: (patch: Partial<NewsletterSettings>) => void

  // Inventory
  /** Change stock on a product or material and log the adjustment. */
  adjustStock: (itemType: 'product' | 'material', itemId: ID, delta: number, reason: AdjustmentReason, notes?: string) => void

  // Orders
  /** Transition an order's status, stamping shippedAt/deliveredAt as needed. */
  setOrderStatus: (id: ID, status: OrderStatus) => void

  // Manufacturing
  /**
   * Start a production batch from a recipe: creates the batch (In Progress),
   * deducts recipe materials for the planned quantity, sets machine to Printing.
   */
  startBatch: (recipeId: ID, quantity: number, machineId: ID, notes?: string) => ProductionBatch | undefined
  /**
   * Move a Queued batch to In Progress, committing its recipe materials and
   * putting its machine to work.
   */
  startQueuedBatch: (batchId: ID) => void
  /**
   * Finish an In Progress batch: adds `produced` units to the product's stock,
   * records failed prints and waste, frees the machine. No-op otherwise.
   */
  completeBatch: (batchId: ID, produced: number, failed: number, wasteGrams: number) => void

  // Tasks (kanban)
  moveTask: (taskId: ID, status: TaskItem['status'], order: number) => void

  // Notifications
  addNotification: (n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => void
  markNotificationRead: (id: ID) => void
  markAllNotificationsRead: () => void

  /** Wipe everything back to the demo dataset. */
  resetDemo: () => void
}

export function seedCollections(): Collections & { settings: Settings; newsletterSettings: NewsletterSettings } {
  return {
    products: seedProducts,
    materials: seedMaterials,
    orders: seedOrders,
    customers: seedCustomers,
    suppliers: seedSuppliers,
    expenses: seedExpenses,
    incomes: seedIncomes,
    recipes: seedRecipes,
    batches: seedBatches,
    machines: seedMachines,
    shipments: seedShipments,
    tasks: seedTasks,
    events: seedEvents,
    daysOff: seedDaysOff,
    documents: seedDocuments,
    employees: seedEmployees,
    campaigns: seedCampaigns,
    promoCodes: seedPromoCodes,
    socialAccounts: seedSocialAccounts,
    socialPosts: seedSocialPosts,
    subscribers: seedSubscribers,
    newsletters: seedNewsletters,
    adjustments: seedAdjustments,
    notifications: buildSeedNotifications(),
    settings: seedSettings,
    newsletterSettings: seedNewsletterSettings,
  }
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      ...seedCollections(),

      addItem: (key, item) => {
        set((s) => ({ [key]: [item, ...s[key]] }) as Partial<StoreState>)
        return item
      },

      updateItem: (key, id, patch) => {
        set(
          (s) =>
            ({
              [key]: (s[key] as Array<{ id: ID }>).map((x) => (x.id === id ? { ...x, ...patch } : x)),
            }) as Partial<StoreState>,
        )
      },

      removeItem: (key, id) => {
        set((s) => ({ [key]: (s[key] as Array<{ id: ID }>).filter((x) => x.id !== id) }) as Partial<StoreState>)
      },

      updateSettings: (patch) => {
        set((s) => ({ settings: { ...s.settings, ...patch } }))
        if (patch.currency) setActiveCurrency(patch.currency)
      },

      updateNewsletterSettings: (patch) => {
        set((s) => ({ newsletterSettings: { ...s.newsletterSettings, ...patch } }))
      },

      adjustStock: (itemType, itemId, delta, reason, notes) => {
        const s = get()
        const item = itemType === 'product' ? s.products.find((p) => p.id === itemId) : s.materials.find((m) => m.id === itemId)
        if (!item) return
        // Stock never goes below zero, so log the delta that was actually applied
        const appliedDelta = Math.max(-item.stock, delta)
        const entry: StockAdjustment = {
          id: uid('adj'),
          date: new Date().toISOString(),
          itemType,
          itemId,
          itemName: item.name,
          delta: appliedDelta,
          reason,
          notes,
        }
        if (itemType === 'product') {
          set((st) => ({
            products: st.products.map((p) => (p.id === itemId ? { ...p, stock: Math.max(0, p.stock + delta) } : p)),
            adjustments: [entry, ...st.adjustments],
          }))
        } else {
          set((st) => ({
            materials: st.materials.map((m) => (m.id === itemId ? { ...m, stock: Math.max(0, m.stock + delta) } : m)),
            adjustments: [entry, ...st.adjustments],
          }))
        }
        // Low-stock notification when a deduction crosses the reorder point
        const after = (itemType === 'product' ? get().products.find((p) => p.id === itemId)?.stock : get().materials.find((m) => m.id === itemId)?.stock) ?? 0
        const reorder = itemType === 'product' ? (item as Product).reorderPoint : (item as Material).reorderPoint
        const before = ('stock' in item ? item.stock : 0) as number
        if (get().settings.notifyLowStock && delta < 0 && before > reorder && after <= reorder) {
          get().addNotification({
            type: 'low-stock',
            title: `Low stock: ${item.name}`,
            body: `Now at ${after} — reorder point is ${reorder}.`,
            link: '/admin/inventory',
          })
        }
      },

      setOrderStatus: (id, status) => {
        const nowIso = new Date().toISOString()
        set((s) => ({
          orders: s.orders.map((o) => {
            if (o.id !== id) return o
            const next = { ...o, status }
            if (status === 'Shipped' && !o.shippedAt) next.shippedAt = nowIso
            if (status === 'Delivered') {
              next.deliveredAt = nowIso
              if (!next.shippedAt) next.shippedAt = nowIso
            }
            return next
          }),
        }))
      },

      startBatch: (recipeId, quantity, machineId, notes) => {
        const s = get()
        const recipe = s.recipes.find((r) => r.id === recipeId)
        const machine = s.machines.find((m) => m.id === machineId)
        const product = recipe && s.products.find((p) => p.id === recipe.productId)
        if (!recipe || !machine || !product || quantity < 1) return undefined

        const batch: ProductionBatch = {
          id: uid('bat'),
          recipeId,
          productId: product.id,
          productName: product.name,
          quantity,
          produced: 0,
          failed: 0,
          machineId,
          machineName: machine.name,
          status: 'In Progress',
          startedAt: new Date().toISOString(),
          printTimeMin: recipe.printTimeMin * quantity,
          wasteGrams: 0,
          notes,
        }
        set((st) => ({
          batches: [batch, ...st.batches],
          machines: st.machines.map((m) => (m.id === machineId ? { ...m, status: 'Printing' as const } : m)),
        }))
        // Commit materials for the planned run
        for (const line of recipe.lines) {
          get().adjustStock('material', line.materialId, -line.quantity * quantity, 'Production', `Batch ${batch.id} — ${product.name} ×${quantity}`)
        }
        return batch
      },

      startQueuedBatch: (batchId) => {
        const s = get()
        const batch = s.batches.find((b) => b.id === batchId)
        if (!batch || batch.status !== 'Queued') return
        const recipe = s.recipes.find((r) => r.id === batch.recipeId)
        set((st) => ({
          batches: st.batches.map((b) =>
            b.id === batchId ? { ...b, status: 'In Progress' as const, startedAt: new Date().toISOString() } : b,
          ),
          machines: st.machines.map((m) => (m.id === batch.machineId ? { ...m, status: 'Printing' as const } : m)),
        }))
        // Materials are committed when the run actually starts
        if (recipe) {
          for (const line of recipe.lines) {
            get().adjustStock('material', line.materialId, -line.quantity * batch.quantity, 'Production', `Batch ${batch.id} — ${batch.productName} ×${batch.quantity}`)
          }
        }
      },

      completeBatch: (batchId, produced, failed, wasteGrams) => {
        const s = get()
        const batch = s.batches.find((b) => b.id === batchId)
        // Only a running batch can complete — guards double-completion (which
        // would double-add stock) and Queued batches that never consumed materials
        if (!batch || batch.status !== 'In Progress') return
        set((st) => ({
          batches: st.batches.map((b) =>
            b.id === batchId
              ? {
                  ...b,
                  status: produced > 0 ? ('Completed' as const) : ('Failed' as const),
                  produced,
                  failed,
                  wasteGrams,
                  completedAt: new Date().toISOString(),
                }
              : b,
          ),
          machines: st.machines.map((m) =>
            m.id === batch.machineId
              ? {
                  ...m,
                  // Don't clobber a Maintenance flag set mid-run
                  status: m.status === 'Printing' ? ('Idle' as const) : m.status,
                  hoursLogged: m.hoursLogged + batch.printTimeMin / 60,
                }
              : m,
          ),
        }))
        if (produced > 0) {
          get().adjustStock('product', batch.productId, produced, 'Production', `Batch ${batch.id} completed on ${batch.machineName}`)
        }
      },

      moveTask: (taskId, status, order) => {
        set((s) => {
          const task = s.tasks.find((t) => t.id === taskId)
          if (!task) return {}
          const others = s.tasks.filter((t) => t.id !== taskId)
          const column = others.filter((t) => t.status === status).sort((a, b) => a.order - b.order)
          column.splice(Math.min(Math.max(0, order), column.length), 0, { ...task, status })
          const renumbered = column.map((t, i) => ({ ...t, order: i }))
          return { tasks: [...others.filter((t) => t.status !== status), ...renumbered] }
        })
      },

      addNotification: (n) => {
        set((s) => ({
          notifications: [{ ...n, id: uid('ntf'), createdAt: new Date().toISOString(), read: false }, ...s.notifications].slice(0, 60),
        }))
      },

      markNotificationRead: (id) => {
        set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }))
      },

      markAllNotificationsRead: () => {
        set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) }))
      },

      resetDemo: () => {
        set(seedCollections())
        setActiveCurrency(get().settings.currency)
      },
    }),
    {
      name: 'tms-data',
      version: 4,
      migrate: (persisted, version) => {
        const state = persisted as StoreState
        // v2 renamed the shipment status 'Exception' → 'Needs attention'
        if (version < 2 && Array.isArray(state?.shipments)) {
          state.shipments = state.shipments.map((s) =>
            (s.status as string) === 'Exception' ? { ...s, status: 'Needs attention' as const } : s,
          )
        }
        // v3 added days off + the printer bridge URL
        if (version < 3) {
          if (!Array.isArray(state?.daysOff)) state.daysOff = seedDaysOff
          if (state?.settings && state.settings.printerBridgeUrl === undefined) {
            state.settings = { ...state.settings, printerBridgeUrl: '' }
          }
        }
        // v4 added the newsletter system
        if (version < 4) {
          if (!Array.isArray(state?.subscribers)) state.subscribers = seedSubscribers
          if (!Array.isArray(state?.newsletters)) state.newsletters = seedNewsletters
          if (!state?.newsletterSettings) state.newsletterSettings = seedNewsletterSettings
        }
        return state
      },
    },
  ),
)

// Keep money formatters in sync with the persisted currency setting.
setActiveCurrency(useStore.getState().settings.currency)
useStore.subscribe((s) => setActiveCurrency(s.settings.currency))
