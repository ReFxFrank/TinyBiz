// Derived business metrics. Pure functions over store slices — every page
// computes its numbers through these so the figures always agree.

import type { Expense, IncomeEntry, Material, Order, Product } from '@/data/types'
import { addDays, addMonths, dayKey, monthKey, startOfDay, startOfMonth } from '@/lib/dates'
import { sum } from '@/lib/utils'

/** Orders that count toward revenue (everything except cancelled/returned) */
export function isRevenueOrder(o: Order): boolean {
  return o.status !== 'Cancelled' && o.status !== 'Returned'
}

export function orderItemsTotal(o: Order): number {
  return sum(o.items.map((i) => i.unitPrice * i.quantity))
}

/** Revenue = items + shipping charged (tax collected is a liability, not revenue) */
export function orderRevenue(o: Order): number {
  return orderItemsTotal(o) + o.shippingCharged
}

/** Direct cost = item costs + shipping paid */
export function orderCost(o: Order): number {
  return sum(o.items.map((i) => i.unitCost * i.quantity)) + o.shippingCost
}

export function orderProfit(o: Order): number {
  return orderRevenue(o) - orderCost(o)
}

export function orderUnits(o: Order): number {
  return sum(o.items.map((i) => i.quantity))
}

/** Next free order number ("NP-1201") — max existing + 1, safe across deletions */
export function nextOrderNumber(orders: Order[]): string {
  const max = orders.reduce((m, o) => {
    const n = Number(o.number.replace(/\D/g, ''))
    return Number.isFinite(n) ? Math.max(m, n) : m
  }, 1000)
  return `NP-${max + 1}`
}

// ── Range aggregates ─────────────────────────────────────────────────────────

function inRange(iso: string, from: Date, to: Date): boolean {
  const t = new Date(iso).getTime()
  return t >= from.getTime() && t < to.getTime()
}

export interface RangeTotals {
  revenue: number
  cost: number
  profit: number
  orders: number
  expenses: number
  otherIncome: number
  /** profit − expenses + otherIncome */
  net: number
}

export function rangeTotals(
  orders: Order[],
  expenses: Expense[],
  incomes: IncomeEntry[],
  from: Date,
  to: Date,
): RangeTotals {
  const sales = orders.filter((o) => isRevenueOrder(o) && inRange(o.placedAt, from, to))
  const revenue = sum(sales.map(orderRevenue))
  const cost = sum(sales.map(orderCost))
  const exp = sum(expenses.filter((e) => inRange(e.date, from, to)).map((e) => e.amount))
  const other = sum(incomes.filter((i) => inRange(i.date, from, to)).map((i) => i.amount))
  return {
    revenue,
    cost,
    profit: revenue - cost,
    orders: sales.length,
    expenses: exp,
    otherIncome: other,
    net: revenue - cost - exp + other,
  }
}

export function todayTotals(orders: Order[], expenses: Expense[], incomes: IncomeEntry[]): RangeTotals {
  const from = startOfDay(new Date())
  return rangeTotals(orders, expenses, incomes, from, addDays(from, 1))
}

export function monthTotals(orders: Order[], expenses: Expense[], incomes: IncomeEntry[]): RangeTotals {
  const from = startOfMonth(new Date())
  return rangeTotals(orders, expenses, incomes, from, addMonths(from, 1))
}

// ── Time series ──────────────────────────────────────────────────────────────

export interface DayPoint {
  /** YYYY-MM-DD */
  key: string
  date: Date
  revenue: number
  expenses: number
  profit: number
  orders: number
}

/** One point per day for the trailing `days` days, today included */
export function dailySeries(orders: Order[], expenses: Expense[], days: number): DayPoint[] {
  const start = startOfDay(addDays(new Date(), -(days - 1)))
  const points = new Map<string, DayPoint>()
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i)
    const key = dayKey(date)
    points.set(key, { key, date, revenue: 0, expenses: 0, profit: 0, orders: 0 })
  }
  for (const o of orders) {
    if (!isRevenueOrder(o)) continue
    const p = points.get(dayKey(o.placedAt))
    if (!p) continue
    p.revenue += orderRevenue(o)
    p.profit += orderProfit(o)
    p.orders += 1
  }
  for (const e of expenses) {
    const p = points.get(dayKey(e.date))
    if (p) p.expenses += e.amount
  }
  return [...points.values()]
}

export interface MonthPoint {
  /** YYYY-MM */
  key: string
  date: Date
  revenue: number
  cost: number
  expenses: number
  otherIncome: number
  profit: number
  net: number
  orders: number
}

/** One point per month for the trailing `months` months, current month included */
export function monthlySeries(
  orders: Order[],
  expenses: Expense[],
  incomes: IncomeEntry[],
  months: number,
): MonthPoint[] {
  const start = addMonths(startOfMonth(new Date()), -(months - 1))
  const points = new Map<string, MonthPoint>()
  for (let i = 0; i < months; i++) {
    const date = addMonths(start, i)
    const key = monthKey(date)
    points.set(key, { key, date, revenue: 0, cost: 0, expenses: 0, otherIncome: 0, profit: 0, net: 0, orders: 0 })
  }
  for (const o of orders) {
    if (!isRevenueOrder(o)) continue
    const p = points.get(monthKey(o.placedAt))
    if (!p) continue
    p.revenue += orderRevenue(o)
    p.cost += orderCost(o)
    p.orders += 1
  }
  for (const e of expenses) {
    const p = points.get(monthKey(e.date))
    if (p) p.expenses += e.amount
  }
  for (const inc of incomes) {
    const p = points.get(monthKey(inc.date))
    if (p) p.otherIncome += inc.amount
  }
  for (const p of points.values()) {
    p.profit = p.revenue - p.cost
    p.net = p.profit - p.expenses + p.otherIncome
  }
  return [...points.values()]
}

// ── Inventory ────────────────────────────────────────────────────────────────

export function lowStockProducts(products: Product[]): Product[] {
  return products.filter((p) => p.active && p.stock <= p.reorderPoint)
}

export function lowStockMaterials(materials: Material[]): Material[] {
  return materials.filter((m) => m.stock <= m.reorderPoint)
}

/** Value of inventory on hand at cost */
export function inventoryValue(products: Product[], materials: Material[]): number {
  return (
    sum(products.map((p) => p.stock * p.cost + sum(p.variants.map((v) => v.stock * v.cost)))) +
    sum(materials.map((m) => m.stock * m.costPerUnit))
  )
}

// ── Customers & products ─────────────────────────────────────────────────────

export function customerLifetimeValue(orders: Order[], customerId: string): number {
  return sum(orders.filter((o) => o.customerId === customerId && isRevenueOrder(o)).map(orderRevenue))
}

export interface SellerStat {
  productId: string
  name: string
  units: number
  revenue: number
  profit: number
}

export function bestSellers(orders: Order[], sinceDays?: number): SellerStat[] {
  const cutoff = sinceDays ? addDays(startOfDay(new Date()), -(sinceDays - 1)).getTime() : 0
  const byProduct = new Map<string, SellerStat>()
  for (const o of orders) {
    if (!isRevenueOrder(o)) continue
    if (cutoff && new Date(o.placedAt).getTime() < cutoff) continue
    for (const item of o.items) {
      const s = byProduct.get(item.productId) ?? {
        productId: item.productId,
        name: item.name,
        units: 0,
        revenue: 0,
        profit: 0,
      }
      s.units += item.quantity
      s.revenue += item.unitPrice * item.quantity
      s.profit += (item.unitPrice - item.unitCost) * item.quantity
      byProduct.set(item.productId, s)
    }
  }
  return [...byProduct.values()].sort((a, b) => b.revenue - a.revenue)
}

export function averageOrderValue(orders: Order[]): number {
  const sales = orders.filter(isRevenueOrder)
  return sales.length ? sum(sales.map(orderRevenue)) / sales.length : 0
}

/** Share of customers with 2+ orders */
export function repeatCustomerRate(orders: Order[]): number {
  const counts = new Map<string, number>()
  for (const o of orders.filter(isRevenueOrder)) {
    counts.set(o.customerId, (counts.get(o.customerId) ?? 0) + 1)
  }
  if (!counts.size) return 0
  let repeat = 0
  counts.forEach((c) => {
    if (c >= 2) repeat++
  })
  return (repeat / counts.size) * 100
}
