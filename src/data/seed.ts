// Demo seed data for a small 3D-printing & craft shop ("Nova Prints & Co.").
// Generated with a seeded PRNG so every fresh install looks the same, with
// dates positioned relative to "now" so the dashboard is always alive.

import type {
  AppNotification,
  Address,
  Campaign,
  CalendarEvent,
  Customer,
  DocumentItem,
  Employee,
  Expense,
  IncomeEntry,
  Machine,
  Material,
  Order,
  OrderItem,
  OrderStatus,
  Product,
  ProductionBatch,
  PromoCode,
  Recipe,
  SalesChannel,
  Settings,
  Shipment,
  SocialAccount,
  SocialPost,
  StockAdjustment,
  Supplier,
  TaskItem,
  TimeOff,
  Subscriber,
  Newsletter,
  NewsletterSettings,
} from '@/data/types'
import { addDays, dayKey, startOfDay } from '@/lib/dates'

// ── Seeded PRNG ──────────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(20260702)
const ri = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min
const rf = (min: number, max: number) => rand() * (max - min) + min
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]
const chance = (p: number) => rand() < p

let seq = 0
const sid = (prefix: string) => `${prefix}_${(++seq).toString(36).padStart(4, '0')}`

const now = new Date()
const daysAgo = (n: number, hour = 12, minute = 0) => {
  const d = addDays(startOfDay(now), -n)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}
const daysAhead = (n: number, hour = 12) => {
  const d = addDays(startOfDay(now), n)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

// ── Suppliers ────────────────────────────────────────────────────────────────

export const seedSuppliers: Supplier[] = [
  { id: sid('sup'), name: 'Polymaker Direct', contactName: 'Dana Liu', email: 'orders@polymakerdirect.com', website: 'polymaker.com', category: 'Filament', leadTimeDays: 4, rating: 5, notes: 'Best PLA pricing at 10+ spools. Ask for the maker discount.', phone: '(415) 555-0132', createdAt: daysAgo(320) },
  { id: sid('sup'), name: 'Prusament Store', contactName: 'Jakub Novak', email: 'sales@prusament.example', website: 'prusa3d.com', category: 'Filament', leadTimeDays: 9, rating: 4, notes: 'Premium PETG. Slow shipping from EU.', createdAt: daysAgo(300) },
  { id: sid('sup'), name: 'StickerMule', email: 'support@stickermule.com', website: 'stickermule.com', category: 'Print & stickers', leadTimeDays: 6, rating: 4, notes: 'Watch for 55% flash sales.', createdAt: daysAgo(280) },
  { id: sid('sup'), name: 'Uline', email: 'orders@uline.com', website: 'uline.com', category: 'Packaging', leadTimeDays: 2, rating: 4, notes: 'Boxes + mailers. Fast but pricey shipping.', phone: '(800) 555-0164', createdAt: daysAgo(260) },
  { id: sid('sup'), name: 'EcoEnclose', contactName: 'Mara Whitfield', email: 'hello@ecoenclose.com', website: 'ecoenclose.com', category: 'Packaging', leadTimeDays: 5, rating: 5, notes: 'Recycled mailers — customers love these.', createdAt: daysAgo(200) },
  { id: sid('sup'), name: 'MakerBeam Supply', contactName: 'Theo Grant', email: 'theo@makerbeam.example', website: 'makerbeam.example', category: 'Hardware & inserts', leadTimeDays: 7, rating: 3, notes: 'Magnets, keyrings, earring hooks.', createdAt: daysAgo(180) },
]
const supId = (i: number) => seedSuppliers[i].id

// ── Materials (raw inventory) ────────────────────────────────────────────────

export const seedMaterials: Material[] = [
  { id: sid('mat'), name: 'PLA — Galaxy Purple', sku: 'FIL-PLA-GAL', category: 'Filament', unit: 'g', stock: 3400, reorderPoint: 2000, costPerUnit: 0.022, supplierId: supId(0), createdAt: daysAgo(200) },
  { id: sid('mat'), name: 'PLA — Matte Black', sku: 'FIL-PLA-BLK', category: 'Filament', unit: 'g', stock: 1450, reorderPoint: 2000, costPerUnit: 0.02, supplierId: supId(0), createdAt: daysAgo(200) },
  { id: sid('mat'), name: 'PLA — Sakura Pink', sku: 'FIL-PLA-PNK', category: 'Filament', unit: 'g', stock: 5200, reorderPoint: 2000, costPerUnit: 0.022, supplierId: supId(0), createdAt: daysAgo(180) },
  { id: sid('mat'), name: 'PETG — Clear Ice', sku: 'FIL-PET-CLR', category: 'Filament', unit: 'g', stock: 2600, reorderPoint: 1500, costPerUnit: 0.028, supplierId: supId(1), createdAt: daysAgo(150) },
  { id: sid('mat'), name: 'TPU — Flex Teal', sku: 'FIL-TPU-TEA', category: 'Filament', unit: 'g', stock: 800, reorderPoint: 1000, costPerUnit: 0.035, supplierId: supId(1), createdAt: daysAgo(140) },
  { id: sid('mat'), name: 'Logo sticker — holo 2"', sku: 'STK-LOGO-2', category: 'Stickers', unit: 'pcs', stock: 340, reorderPoint: 150, costPerUnit: 0.11, supplierId: supId(2), createdAt: daysAgo(160) },
  { id: sid('mat'), name: 'Thank-you card A6', sku: 'INS-THX-A6', category: 'Inserts', unit: 'pcs', stock: 122, reorderPoint: 150, costPerUnit: 0.09, supplierId: supId(2), createdAt: daysAgo(160) },
  { id: sid('mat'), name: 'Business card', sku: 'INS-BIZ-STD', category: 'Inserts', unit: 'pcs', stock: 610, reorderPoint: 200, costPerUnit: 0.05, supplierId: supId(2), createdAt: daysAgo(160) },
  { id: sid('mat'), name: 'Shipping box 6×6×4', sku: 'BOX-664', category: 'Boxes', unit: 'pcs', stock: 84, reorderPoint: 50, costPerUnit: 0.62, supplierId: supId(3), createdAt: daysAgo(120) },
  { id: sid('mat'), name: 'Shipping box 10×8×5', sku: 'BOX-1085', category: 'Boxes', unit: 'pcs', stock: 41, reorderPoint: 40, costPerUnit: 0.94, supplierId: supId(3), createdAt: daysAgo(120) },
  { id: sid('mat'), name: 'Padded mailer 8×11', sku: 'SHP-MAIL-811', category: 'Shipping supplies', unit: 'pcs', stock: 190, reorderPoint: 100, costPerUnit: 0.34, supplierId: supId(4), createdAt: daysAgo(110) },
  { id: sid('mat'), name: 'Honeycomb wrap roll', sku: 'SHP-WRAP-HC', category: 'Shipping supplies', unit: 'm', stock: 68, reorderPoint: 40, costPerUnit: 0.18, supplierId: supId(4), createdAt: daysAgo(100) },
  { id: sid('mat'), name: 'Keyring + chain', sku: 'CMP-KEYRING', category: 'Components', unit: 'pcs', stock: 425, reorderPoint: 200, costPerUnit: 0.14, supplierId: supId(5), createdAt: daysAgo(90) },
  { id: sid('mat'), name: 'Earring hooks (steel)', sku: 'CMP-EARHOOK', category: 'Components', unit: 'pcs', stock: 260, reorderPoint: 150, costPerUnit: 0.08, supplierId: supId(5), createdAt: daysAgo(90) },
]
const matByName = (name: string) => {
  const m = seedMaterials.find((x) => x.name === name)
  if (!m) throw new Error(`seed material missing: ${name}`)
  return m.id
}

// ── Products ─────────────────────────────────────────────────────────────────

interface ProductSpec {
  name: string
  sku: string
  category: Product['category']
  price: number
  cost: number
  stock: number
  reorder: number
  image: string
  hue: number
  tags: string[]
  weight: number
  dims: { l: number; w: number; h: number }
  prodMin: number
  desc: string
  variants?: Array<{ name: string; priceDelta?: number }>
  popularity: number // sales weighting
}

const productSpecs: ProductSpec[] = [
  { name: 'Mystery Egg', sku: 'NP-EGG-001', category: '3D Prints', price: 18, cost: 5.4, stock: 26, reorder: 12, image: '🥚', hue: 265, tags: ['bestseller', 'surprise', 'kids'], weight: 160, dims: { l: 8, w: 6, h: 6 }, prodMin: 210, desc: 'A print-in-place egg that cracks open to reveal a surprise mini creature. Our signature item.', popularity: 10 },
  { name: 'Articulated Dragon', sku: 'NP-DRG-002', category: '3D Prints', price: 34, cost: 9.8, stock: 14, reorder: 8, image: '🐉', hue: 150, tags: ['bestseller', 'fidget'], weight: 240, dims: { l: 30, w: 8, h: 6 }, prodMin: 420, desc: 'A 30cm articulated dragon printed in silk PLA. Flexible from nose to tail.', variants: [{ name: 'Galaxy Purple' }, { name: 'Forest Green' }, { name: 'Ember Red', priceDelta: 2 }], popularity: 9 },
  { name: 'Flexi Axolotl', sku: 'NP-AXO-003', category: '3D Prints', price: 16, cost: 4.6, stock: 31, reorder: 15, image: '🦎', hue: 330, tags: ['fidget', 'cute'], weight: 120, dims: { l: 18, w: 6, h: 5 }, prodMin: 180, desc: 'Wiggly print-in-place axolotl in pastel pink. A fidget favorite.', popularity: 8 },
  { name: 'Geo Desk Planter', sku: 'NP-PLT-004', category: 'Home & Desk', price: 22, cost: 6.2, stock: 18, reorder: 10, image: '🪴', hue: 110, tags: ['home', 'planter'], weight: 210, dims: { l: 12, w: 12, h: 10 }, prodMin: 300, desc: 'Low-poly geometric planter with a hidden drip tray. Fits 3" pots.', popularity: 6 },
  { name: 'Hex Phone Stand', sku: 'NP-PHN-005', category: 'Home & Desk', price: 14, cost: 3.4, stock: 42, reorder: 15, image: '📱', hue: 210, tags: ['desk', 'gift'], weight: 95, dims: { l: 10, w: 8, h: 9 }, prodMin: 140, desc: 'Honeycomb phone stand with cable pass-through. Works with any case.', popularity: 7 },
  { name: 'Cable Clip Set (6)', sku: 'NP-CBL-006', category: 'Home & Desk', price: 9, cost: 1.9, stock: 58, reorder: 20, image: '🧷', hue: 40, tags: ['desk', 'organizer'], weight: 40, dims: { l: 8, w: 6, h: 2 }, prodMin: 80, desc: 'Six adhesive-backed cable clips in TPU so they grip without scratching.', popularity: 5 },
  { name: 'Dice Tower — Castle', sku: 'NP-DCE-007', category: '3D Prints', price: 39, cost: 11.5, stock: 7, reorder: 6, image: '🏰', hue: 280, tags: ['tabletop', 'gift'], weight: 380, dims: { l: 14, w: 14, h: 22 }, prodMin: 540, desc: 'A working castle dice tower with a felt-lined tray. D&D night essential.', popularity: 5 },
  { name: 'Dragon Egg Keychain', sku: 'NP-KEY-008', category: 'Accessories', price: 8, cost: 1.7, stock: 64, reorder: 25, image: '🔑', hue: 0, tags: ['keychain', 'impulse'], weight: 25, dims: { l: 5, w: 3, h: 3 }, prodMin: 45, desc: 'Scaled mini dragon egg on a steel keyring. Great add-on item.', popularity: 8 },
  { name: 'Flexi Shark Earrings', sku: 'NP-EAR-009', category: 'Accessories', price: 12, cost: 2.6, stock: 22, reorder: 12, image: '🦈', hue: 195, tags: ['earrings', 'quirky'], weight: 12, dims: { l: 4, w: 2, h: 1 }, prodMin: 60, desc: 'Tiny articulated sharks on hypoallergenic steel hooks.', popularity: 4 },
  { name: 'Sticker Pack — Space Cats', sku: 'NP-STK-010', category: 'Stickers', price: 7, cost: 1.4, stock: 9, reorder: 20, image: '🐱', hue: 250, tags: ['stickers', 'impulse'], weight: 15, dims: { l: 15, w: 10, h: 0.2 }, prodMin: 0, desc: 'Five holographic space-cat vinyl stickers. Waterproof and dishwasher safe.', popularity: 7 },
  { name: 'Sticker Pack — Botanical', sku: 'NP-STK-011', category: 'Stickers', price: 7, cost: 1.4, stock: 33, reorder: 20, image: '🌿', hue: 130, tags: ['stickers'], weight: 15, dims: { l: 15, w: 10, h: 0.2 }, prodMin: 0, desc: 'Five matte botanical stickers for journals, laptops, and water bottles.', popularity: 5 },
  { name: 'Headphone Hook', sku: 'NP-HDP-012', category: 'Home & Desk', price: 13, cost: 3.1, stock: 27, reorder: 10, image: '🎧', hue: 220, tags: ['desk'], weight: 85, dims: { l: 9, w: 5, h: 12 }, prodMin: 120, desc: 'Under-desk headphone hook with 3M mounting — no screws needed.', popularity: 4 },
  { name: 'Mini Zen Garden Kit', sku: 'NP-ZEN-013', category: 'Home & Desk', price: 28, cost: 8.9, stock: 11, reorder: 8, image: '🏝️', hue: 35, tags: ['gift', 'calm'], weight: 420, dims: { l: 16, w: 12, h: 4 }, prodMin: 260, desc: 'Printed tray, rake, and stones plus fine white sand. Desk therapy.', popularity: 3 },
  { name: 'Gift Wrap Add-on', sku: 'NP-GFT-014', category: 'Packaging Add-ons', price: 4, cost: 1.1, stock: 120, reorder: 40, image: '🎁', hue: 350, tags: ['add-on'], weight: 30, dims: { l: 20, w: 15, h: 1 }, prodMin: 5, desc: 'Kraft wrap, twine bow, and a handwritten note card.', popularity: 3 },
]

export const seedProducts: Product[] = productSpecs.map((s) => ({
  id: sid('prd'),
  name: s.name,
  sku: s.sku,
  category: s.category,
  description: s.desc,
  price: s.price,
  cost: s.cost,
  stock: s.stock,
  reorderPoint: s.reorder,
  image: s.image,
  imageHue: s.hue,
  tags: s.tags,
  variants: (s.variants ?? []).map((v, i) => ({
    id: sid('var'),
    name: v.name,
    sku: `${s.sku}-V${i + 1}`,
    price: s.price + (v.priceDelta ?? 0),
    cost: s.cost,
    stock: ri(3, 12),
  })),
  weightGrams: s.weight,
  dimensionsCm: s.dims,
  productionTimeMin: s.prodMin,
  active: true,
  createdAt: daysAgo(ri(60, 300)),
}))

const prodByName = (name: string) => {
  const p = seedProducts.find((x) => x.name === name)
  if (!p) throw new Error(`seed product missing: ${name}`)
  return p
}

// ── Recipes (BOMs) ───────────────────────────────────────────────────────────

interface RecipeSpec {
  product: string
  filament: string
  gramsUsed: number
  printMin: number
  extras: Array<[string, number]>
}

const recipeSpecs: RecipeSpec[] = [
  { product: 'Mystery Egg', filament: 'PLA — Galaxy Purple', gramsUsed: 150, printMin: 210, extras: [['Logo sticker — holo 2"', 1], ['Thank-you card A6', 1], ['Business card', 1], ['Shipping box 6×6×4', 1]] },
  { product: 'Articulated Dragon', filament: 'PLA — Galaxy Purple', gramsUsed: 220, printMin: 420, extras: [['Logo sticker — holo 2"', 1], ['Thank-you card A6', 1], ['Shipping box 10×8×5', 1]] },
  { product: 'Flexi Axolotl', filament: 'PLA — Sakura Pink', gramsUsed: 110, printMin: 180, extras: [['Logo sticker — holo 2"', 1], ['Padded mailer 8×11', 1]] },
  { product: 'Geo Desk Planter', filament: 'PLA — Matte Black', gramsUsed: 190, printMin: 300, extras: [['Thank-you card A6', 1], ['Shipping box 6×6×4', 1]] },
  { product: 'Hex Phone Stand', filament: 'PLA — Matte Black', gramsUsed: 85, printMin: 140, extras: [['Business card', 1], ['Padded mailer 8×11', 1]] },
  { product: 'Dice Tower — Castle', filament: 'PLA — Galaxy Purple', gramsUsed: 350, printMin: 540, extras: [['Thank-you card A6', 1], ['Shipping box 10×8×5', 1], ['Honeycomb wrap roll', 2]] },
  { product: 'Dragon Egg Keychain', filament: 'PLA — Sakura Pink', gramsUsed: 20, printMin: 45, extras: [['Keyring + chain', 1], ['Business card', 1]] },
  { product: 'Flexi Shark Earrings', filament: 'TPU — Flex Teal', gramsUsed: 8, printMin: 60, extras: [['Earring hooks (steel)', 2], ['Padded mailer 8×11', 1]] },
]

export const seedRecipes: Recipe[] = recipeSpecs.map((r) => {
  const product = prodByName(r.product)
  return {
    id: sid('rcp'),
    name: `${r.product} — standard`,
    productId: product.id,
    outputQty: 1,
    lines: [
      { materialId: matByName(r.filament), quantity: r.gramsUsed },
      ...r.extras.map(([name, qty]) => ({ materialId: matByName(name), quantity: qty })),
    ],
    printTimeMin: r.printMin,
    notes: undefined,
  }
})
// Link products back to their recipes
for (const recipe of seedRecipes) {
  const p = seedProducts.find((x) => x.id === recipe.productId)
  if (p) p.recipeId = recipe.id
}

// ── Machines & production batches ────────────────────────────────────────────

export const seedMachines: Machine[] = [
  { id: sid('mch'), name: 'Printer A — "Betsy"', model: 'Bambu Lab X1 Carbon', status: 'Printing', hoursLogged: 1240 },
  { id: sid('mch'), name: 'Printer B — "Clunky"', model: 'Prusa MK4', status: 'Idle', hoursLogged: 2210 },
  { id: sid('mch'), name: 'Printer C — "Newbie"', model: 'Bambu Lab A1 Mini', status: 'Maintenance', hoursLogged: 310 },
]

export const seedBatches: ProductionBatch[] = []
{
  const batchPlan: Array<{ recipe: number; qty: number; day: number; status: ProductionBatch['status']; machine: number }> = [
    { recipe: 0, qty: 12, day: 21, status: 'Completed', machine: 0 },
    { recipe: 1, qty: 6, day: 18, status: 'Completed', machine: 1 },
    { recipe: 2, qty: 10, day: 15, status: 'Completed', machine: 0 },
    { recipe: 6, qty: 24, day: 12, status: 'Completed', machine: 2 },
    { recipe: 3, qty: 8, day: 10, status: 'Completed', machine: 1 },
    { recipe: 0, qty: 10, day: 7, status: 'Completed', machine: 0 },
    { recipe: 5, qty: 4, day: 5, status: 'Failed', machine: 1 },
    { recipe: 4, qty: 12, day: 3, status: 'Completed', machine: 1 },
    { recipe: 0, qty: 8, day: 0, status: 'In Progress', machine: 0 },
    { recipe: 7, qty: 15, day: -1, status: 'Queued', machine: 2 },
  ]
  for (const b of batchPlan) {
    const recipe = seedRecipes[b.recipe]
    const product = seedProducts.find((p) => p.id === recipe.productId)!
    const machine = seedMachines[b.machine]
    const failed = b.status === 'Failed' ? Math.max(1, Math.round(b.qty * 0.5)) : b.status === 'Completed' && chance(0.4) ? ri(0, 2) : 0
    const produced = b.status === 'Completed' ? b.qty - failed : b.status === 'Failed' ? b.qty - failed : 0
    seedBatches.push({
      id: sid('bat'),
      recipeId: recipe.id,
      productId: product.id,
      productName: product.name,
      quantity: b.qty,
      produced,
      failed,
      machineId: machine.id,
      machineName: machine.name,
      status: b.status,
      startedAt: b.day >= 0 ? daysAgo(b.day, 9) : daysAhead(-b.day, 9),
      completedAt: b.status === 'Completed' || b.status === 'Failed' ? daysAgo(Math.max(0, b.day - 1), 16) : undefined,
      printTimeMin: recipe.printTimeMin * b.qty,
      wasteGrams: failed > 0 ? failed * ri(40, 120) : ri(0, 30),
      notes: b.status === 'Failed' ? 'Nozzle clog mid-batch — first layer adhesion failed on rear plate.' : undefined,
    })
  }
}

// ── Customers ────────────────────────────────────────────────────────────────

const firstNames = ['Maya', 'Liam', 'Sofia', 'Noah', 'Ava', 'Ethan', 'Isla', 'Mason', 'Zoe', 'Lucas', 'Mila', 'Owen', 'Ruby', 'Eli', 'Nora', 'Jude', 'Hazel', 'Finn', 'Ivy', 'Silas', 'June', 'Reid', 'Wren', 'Cole', 'Sage', 'Beau'] as const
const lastNames = ['Ramirez', 'Chen', 'Okafor', 'Novak', 'Bishop', 'Larsen', 'Whitaker', 'Nguyen', 'Marsh', 'Kowalski', 'Hale', 'Foster', 'Ibrahim', 'Trujillo', 'Barnes', 'Kim', 'Ortega', 'Vance', 'Petrov', 'Quinn', 'Ashford', 'Delgado', 'Mercer', 'Osei', 'Lindqvist', 'Harlow'] as const
const cities: Array<[string, string, string]> = [
  ['Portland', 'OR', '97205'], ['Austin', 'TX', '78704'], ['Asheville', 'NC', '28801'], ['Madison', 'WI', '53703'],
  ['Denver', 'CO', '80205'], ['Savannah', 'GA', '31401'], ['Burlington', 'VT', '05401'], ['Santa Fe', 'NM', '87501'],
  ['Ann Arbor', 'MI', '48104'], ['Eugene', 'OR', '97401'], ['Boise', 'ID', '83702'], ['Tucson', 'AZ', '85701'],
]
const streets = ['Alder St', 'Juniper Ave', 'Meadow Ln', 'Cedar Ct', 'Hawthorn Blvd', 'Willow Way', 'Foxglove Dr', 'Birch Rd']

function makeAddress(): Address {
  const [city, state, zip] = pick(cities)
  return { line1: `${ri(12, 4899)} ${pick(streets)}`, city, state, zip, country: 'US' }
}

export const seedCustomers: Customer[] = Array.from({ length: 26 }, (_, i) => {
  const first = firstNames[i]
  const last = lastNames[i]
  const tags: string[] = []
  if (i < 5) tags.push('vip')
  if (chance(0.3)) tags.push('etsy')
  if (chance(0.15)) tags.push('wholesale')
  return {
    id: sid('cus'),
    name: `${first} ${last}`,
    email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
    phone: chance(0.7) ? `(${ri(201, 989)}) 555-0${ri(100, 199)}` : undefined,
    address: makeAddress(),
    notes: i === 0 ? 'Orders a Mystery Egg for every niece birthday — 6 and counting.' : i === 2 ? 'Runs a gift shop in Asheville; interested in wholesale dragons.' : undefined,
    tags,
    createdAt: daysAgo(ri(30, 360)),
  }
})

// ── Orders ───────────────────────────────────────────────────────────────────

const channels: SalesChannel[] = ['Etsy', 'Etsy', 'Etsy', 'Shopify', 'Shopify', 'Website', 'Market', 'Amazon']
const carriers = ['USPS', 'USPS', 'USPS', 'UPS', 'FedEx'] as const

// popularity-weighted product picker
const weightedProducts: Product[] = []
productSpecs.forEach((s, i) => {
  for (let w = 0; w < s.popularity; w++) weightedProducts.push(seedProducts[i])
})

function statusForAge(age: number): OrderStatus {
  if (chance(0.025)) return 'Cancelled'
  if (age > 20 && chance(0.02)) return 'Returned'
  if (age > 14) return 'Delivered'
  if (age > 8) return chance(0.85) ? 'Delivered' : 'Shipped'
  if (age > 4) return pick(['Shipped', 'Shipped', 'Delivered', 'Ready to Ship'] as const)
  if (age > 2) return pick(['Shipped', 'Ready to Ship', 'Packaging', 'Printing'] as const)
  if (age > 0) return pick(['Printing', 'Processing', 'Packaging', 'New', 'Ready to Ship'] as const)
  return pick(['New', 'New', 'Processing', 'Printing'] as const)
}

let orderNo = 1000
export const seedOrders: Order[] = []
{
  const DAYS = 183
  for (let age = DAYS - 1; age >= 0; age--) {
    const date = addDays(startOfDay(now), -age)
    const dow = date.getDay()
    // Growth trend + weekend bump + noise
    const growth = 1 + ((DAYS - age) / DAYS) * 0.9
    const weekend = dow === 0 || dow === 6 ? 1.5 : 1
    const holiday = age > 155 && age < 175 ? 1.8 : 1 // a strong season ~5-6 months back
    let count = Math.round(rf(0.4, 2.1) * growth * weekend * holiday)
    if (age === 0) count = 4 // a lively "today"
    for (let k = 0; k < count; k++) {
      const customer = pick(seedCustomers)
      const itemCount = chance(0.55) ? 1 : chance(0.75) ? 2 : 3
      const chosen = new Map<string, OrderItem>()
      for (let j = 0; j < itemCount; j++) {
        const p = pick(weightedProducts)
        const existing = chosen.get(p.id)
        if (existing) existing.quantity += 1
        else chosen.set(p.id, { productId: p.id, name: p.name, quantity: chance(0.2) ? 2 : 1, unitPrice: p.price, unitCost: p.cost })
      }
      const items = [...chosen.values()]
      const itemsTotal = items.reduce((a, i) => a + i.unitPrice * i.quantity, 0)
      const status = statusForAge(age)
      const shipped = status === 'Shipped' || status === 'Delivered' || status === 'Returned'
      const placedAt = daysAgo(age, ri(8, 20), ri(0, 59))
      const shipByAge = age - ri(3, 5) // ship-by N days after placement
      seedOrders.push({
        id: sid('ord'),
        number: `NP-${++orderNo}`,
        customerId: customer.id,
        customerName: customer.name,
        email: customer.email,
        status,
        channel: pick(channels),
        items,
        shippingCost: Number(rf(3.5, 9.5).toFixed(2)),
        shippingCharged: chance(0.35) ? 0 : Number(rf(3.99, 8.99).toFixed(2)),
        taxCollected: Number((itemsTotal * 0.0725).toFixed(2)),
        trackingNumber: shipped ? `9400 1000 0000 ${ri(1000, 9999)} ${ri(1000, 9999)} ${ri(10, 99)}` : undefined,
        carrier: shipped ? pick(carriers) : undefined,
        shippingAddress: customer.address ?? makeAddress(),
        notes: chance(0.12) ? pick(['Gift — please no invoice in box.', 'Buyer asked for purple if possible.', 'Combine shipping with previous order.', 'Rush order — birthday on Friday!']) : undefined,
        placedAt,
        shipBy: OPEN_OR_SHIPPED(status) ? daysAgo(shipByAge, 17) : undefined,
        shippedAt: shipped ? daysAgo(Math.max(0, age - ri(1, 3)), 15) : undefined,
        deliveredAt: status === 'Delivered' ? daysAgo(Math.max(0, age - ri(3, 7)), 14) : undefined,
      })
    }
  }
}
function OPEN_OR_SHIPPED(s: OrderStatus): boolean {
  return s !== 'Cancelled' && s !== 'Returned'
}

// ── Shipments (for shipped/delivered orders in the last ~45 days) ────────────

export const seedShipments: Shipment[] = seedOrders
  .filter((o) => o.shippedAt && new Date(o.shippedAt).getTime() > addDays(now, -45).getTime())
  .map((o) => {
    const delivered = o.status === 'Delivered'
    return {
      id: sid('shp'),
      orderId: o.id,
      orderNumber: o.number,
      customerName: o.customerName,
      carrier: o.carrier ?? 'USPS',
      service: o.carrier === 'UPS' ? 'Ground' : o.carrier === 'FedEx' ? 'Home Delivery' : 'Ground Advantage',
      trackingNumber: o.trackingNumber ?? '',
      cost: o.shippingCost,
      status: delivered ? 'Delivered' : chance(0.12) ? 'Out for delivery' : chance(0.06) ? 'Needs attention' : 'In transit',
      shippedAt: o.shippedAt!,
      estimatedDelivery: delivered ? undefined : daysAhead(ri(1, 4)),
      deliveredAt: o.deliveredAt,
      weightGrams: ri(80, 900),
    }
  })

// ── Expenses ─────────────────────────────────────────────────────────────────

export const seedExpenses: Expense[] = []
{
  // Recurring monthly bills for the last 6 months
  const monthlyBills: Array<[string, Expense['category'], number]> = [
    ['Shopify subscription', 'Software', 39],
    ['Adobe Creative Cloud', 'Software', 22.99],
    ['Studio electricity', 'Utilities', 84],
    ['Studio internet', 'Utilities', 65],
    ['Craft studio rent share', 'Utilities', 250],
  ]
  for (let m = 0; m < 6; m++) {
    for (const [vendor, category, amount] of monthlyBills) {
      // Bill on the 1st-2nd of each calendar month so month buckets get exactly one
      const d = new Date(now.getFullYear(), now.getMonth() - m, 1 + ri(0, 1), 10, 0, 0, 0)
      seedExpenses.push({
        id: sid('exp'),
        date: d.toISOString(),
        vendor,
        category,
        amount: Number((amount * rf(0.95, 1.1)).toFixed(2)),
        recurring: 'monthly',
      })
    }
  }
  // One-off expenses scattered over 6 months
  const oneOffs: Array<[string, Expense['category'], number, number]> = [
    ['Polymaker Direct — PLA restock', 'Supplies', 120, 6],
    ['Uline — boxes & mailers', 'Supplies', 85, 5],
    ['StickerMule — logo stickers', 'Supplies', 64, 4],
    ['USPS — label batch', 'Shipping', 48, 14],
    ['Pirate Ship — label batch', 'Shipping', 62, 10],
    ['Etsy fees', 'Fees', 55, 6],
    ['Shopify payment fees', 'Fees', 38, 6],
    ['Instagram promo', 'Marketing', 45, 4],
    ['Etsy Ads', 'Marketing', 30, 6],
    ['Craft fair booth fee', 'Marketing', 95, 2],
    ['Replacement nozzles', 'Equipment', 28, 2],
    ['Bambu A1 Mini printer', 'Equipment', 299, 1],
    ['Q1 estimated taxes', 'Taxes', 850, 1],
    ['Coffee for market day', 'Miscellaneous', 14, 3],
  ]
  for (const [vendor, category, base, times] of oneOffs) {
    for (let t = 0; t < times; t++) {
      seedExpenses.push({
        id: sid('exp'),
        date: daysAgo(ri(0, 178), ri(9, 18)),
        vendor,
        category,
        amount: Number((base * rf(0.7, 1.35)).toFixed(2)),
      })
    }
  }
  seedExpenses.sort((a, b) => b.date.localeCompare(a.date))
}

// ── Manual income ────────────────────────────────────────────────────────────

export const seedIncomes: IncomeEntry[] = [
  { id: sid('inc'), date: daysAgo(6), source: 'Makers Market booth', category: 'Sales', amount: 412.5, notes: 'Cash + Square sales at the riverfront market.' },
  { id: sid('inc'), date: daysAgo(19), source: 'Asheville Gift Co. (wholesale)', category: 'Wholesale', amount: 680, notes: '20× Articulated Dragons at wholesale.' },
  { id: sid('inc'), date: daysAgo(34), source: 'Intro to 3D printing workshop', category: 'Workshops', amount: 240 },
  { id: sid('inc'), date: daysAgo(52), source: 'Makers Market booth', category: 'Sales', amount: 355 },
  { id: sid('inc'), date: daysAgo(71), source: 'Custom commission — trophy set', category: 'Commissions', amount: 190 },
  { id: sid('inc'), date: daysAgo(96), source: 'Asheville Gift Co. (wholesale)', category: 'Wholesale', amount: 540 },
  { id: sid('inc'), date: daysAgo(124), source: 'Library maker day stipend', category: 'Workshops', amount: 150 },
  { id: sid('inc'), date: daysAgo(150), source: 'Makers Market booth', category: 'Sales', amount: 298 },
]

// ── Stock adjustments (history log) ──────────────────────────────────────────

export const seedAdjustments: StockAdjustment[] = [
  { id: sid('adj'), date: daysAgo(2, 10), itemType: 'material', itemId: seedMaterials[1].id, itemName: seedMaterials[1].name, delta: -120, reason: 'Damaged', notes: 'Spool got wet — brittle section discarded.' },
  { id: sid('adj'), date: daysAgo(3, 15), itemType: 'product', itemId: prodByName('Flexi Axolotl').id, itemName: 'Flexi Axolotl', delta: -1, reason: 'Damaged', notes: 'Dropped at market, tail snapped.' },
  { id: sid('adj'), date: daysAgo(5, 11), itemType: 'material', itemId: seedMaterials[8].id, itemName: seedMaterials[8].name, delta: 100, reason: 'Received', notes: 'Uline order #8841.' },
  { id: sid('adj'), date: daysAgo(9, 9), itemType: 'product', itemId: prodByName('Mystery Egg').id, itemName: 'Mystery Egg', delta: 10, reason: 'Production', notes: 'Batch of 10 finished.' },
  { id: sid('adj'), date: daysAgo(12, 14), itemType: 'material', itemId: seedMaterials[6].id, itemName: seedMaterials[6].name, delta: -8, reason: 'Recount', notes: 'Quarterly count.' },
  { id: sid('adj'), date: daysAgo(15, 13), itemType: 'product', itemId: prodByName('Sticker Pack — Space Cats').id, itemName: 'Sticker Pack — Space Cats', delta: -2, reason: 'Lost', notes: 'Missing after market day.' },
]

// ── Tasks ────────────────────────────────────────────────────────────────────

export const seedTasks: TaskItem[] = [
  { id: sid('tsk'), title: 'Restock Matte Black PLA', description: 'Below reorder point. Polymaker has a 15% bulk deal through Friday.', status: 'todo', priority: 'high', dueDate: daysAhead(2), tags: ['inventory'], createdAt: daysAgo(1), order: 0 },
  { id: sid('tsk'), title: 'Photograph new Zen Garden kit', description: 'Need lifestyle shots for the Etsy listing — borrow the light box.', status: 'todo', priority: 'medium', dueDate: daysAhead(4), tags: ['listing'], createdAt: daysAgo(2), order: 1 },
  { id: sid('tsk'), title: 'Answer Etsy convo from gift shop buyer', status: 'todo', priority: 'high', dueDate: daysAhead(1), tags: ['sales'], createdAt: daysAgo(0), order: 2 },
  { id: sid('tsk'), title: 'Print dragon batch (6× Ember Red)', description: 'Two Etsy orders waiting on Ember Red variant.', status: 'in-progress', priority: 'high', dueDate: daysAhead(1), tags: ['production'], createdAt: daysAgo(1), order: 0 },
  { id: sid('tsk'), title: 'File Q2 sales tax', status: 'in-progress', priority: 'medium', dueDate: daysAhead(12), tags: ['accounting'], createdAt: daysAgo(6), order: 1 },
  { id: sid('tsk'), title: 'Waiting on sticker proof from StickerMule', description: 'New botanical set v2 — proof promised by Thursday.', status: 'waiting', priority: 'medium', tags: ['supplies'], createdAt: daysAgo(4), order: 0 },
  { id: sid('tsk'), title: 'Wholesale pricing sheet for Asheville Gift Co.', status: 'waiting', priority: 'low', tags: ['sales', 'wholesale'], createdAt: daysAgo(8), order: 1 },
  { id: sid('tsk'), title: 'Tune first-layer calibration on Printer C', status: 'done', priority: 'medium', tags: ['maintenance'], createdAt: daysAgo(9), order: 0 },
  { id: sid('tsk'), title: 'Ship weekend market leftovers to consignment', status: 'done', priority: 'low', tags: ['sales'], createdAt: daysAgo(11), order: 1 },
  { id: sid('tsk'), title: 'Design June newsletter', status: 'done', priority: 'medium', tags: ['marketing'], createdAt: daysAgo(14), order: 2 },
]

// ── Calendar events ──────────────────────────────────────────────────────────

export const seedEvents: CalendarEvent[] = [
  { id: sid('evt'), title: 'Riverfront Makers Market', date: daysAhead(5), type: 'market', notes: 'Booth 14 — bring the canopy and card reader.' },
  { id: sid('evt'), title: 'Polymaker PLA delivery', date: daysAhead(3), type: 'delivery', relatedId: supId(0) },
  { id: sid('evt'), title: 'Dragon batch for wholesale due', date: daysAhead(7), type: 'production' },
  { id: sid('evt'), title: 'Q2 sales tax filing deadline', date: daysAhead(12), type: 'deadline' },
  { id: sid('evt'), title: 'Reorder thank-you cards', date: daysAhead(2), type: 'purchase' },
  { id: sid('evt'), title: 'EcoEnclose mailer delivery', date: daysAhead(9), type: 'delivery', relatedId: supId(4) },
  { id: sid('evt'), title: 'Summer collection photoshoot', date: daysAhead(15), type: 'other' },
  { id: sid('evt'), title: 'Etsy summer sale starts', date: daysAhead(18), type: 'deadline' },
  { id: sid('evt'), title: 'Printer B maintenance day', date: daysAhead(21), type: 'production' },
  { id: sid('evt'), title: 'Craft supply co-op meetup', date: daysAhead(26), type: 'other' },
]

// ── Days off / vacation ──────────────────────────────────────────────────────

const dayOffKey = (n: number) => dayKey(addDays(startOfDay(now), n))

export const seedDaysOff: TimeOff[] = [
  { id: sid('off'), date: dayOffKey(10), kind: 'Vacation', note: 'Family trip — shop closed.' },
  { id: sid('off'), date: dayOffKey(11), kind: 'Vacation', note: 'Family trip — shop closed.' },
  { id: sid('off'), date: dayOffKey(12), kind: 'Vacation', note: 'Family trip — shop closed.' },
  { id: sid('off'), date: dayOffKey(20), kind: 'Day off', note: 'Recharge day.' },
]

// ── Documents ────────────────────────────────────────────────────────────────

export const seedDocuments: DocumentItem[] = [
  { id: sid('doc'), name: 'Invoice — Asheville Gift Co. #W-102', category: 'Invoice', fileType: 'pdf', sizeKB: 182, uploadedAt: daysAgo(18), tags: ['wholesale'] },
  { id: sid('doc'), name: 'Receipt — Bambu A1 Mini', category: 'Receipt', fileType: 'pdf', sizeKB: 96, uploadedAt: daysAgo(41), tags: ['equipment'] },
  { id: sid('doc'), name: 'Bambu X1C warranty', category: 'Warranty', fileType: 'pdf', sizeKB: 240, uploadedAt: daysAgo(300), tags: ['equipment'] },
  { id: sid('doc'), name: 'Prusa MK4 service manual', category: 'Manual', fileType: 'pdf', sizeKB: 4200, uploadedAt: daysAgo(290), tags: ['equipment'] },
  { id: sid('doc'), name: 'Polymaker W-9', category: 'Supplier', fileType: 'pdf', sizeKB: 88, uploadedAt: daysAgo(120), tags: ['supplier'] },
  { id: sid('doc'), name: 'Uline invoice #8841', category: 'Supplier', fileType: 'pdf', sizeKB: 130, uploadedAt: daysAgo(5), tags: ['packaging'] },
  { id: sid('doc'), name: 'Q1 estimated tax confirmation', category: 'Tax', fileType: 'pdf', sizeKB: 74, uploadedAt: daysAgo(78), tags: ['taxes'] },
  { id: sid('doc'), name: '2025 Schedule C draft', category: 'Tax', fileType: 'xlsx', sizeKB: 310, uploadedAt: daysAgo(62), tags: ['taxes'] },
  { id: sid('doc'), name: 'Receipt — craft fair booth', category: 'Receipt', fileType: 'jpg', sizeKB: 850, uploadedAt: daysAgo(52), tags: ['marketing'] },
  { id: sid('doc'), name: 'Product photos — spring batch', category: 'Manual', fileType: 'png', sizeKB: 6400, uploadedAt: daysAgo(88), tags: ['listing'] },
  { id: sid('doc'), name: 'Sales export — May', category: 'Invoice', fileType: 'csv', sizeKB: 44, uploadedAt: daysAgo(32), tags: ['reports'] },
  { id: sid('doc'), name: 'Wholesale agreement template', category: 'Supplier', fileType: 'docx', sizeKB: 61, uploadedAt: daysAgo(20), tags: ['wholesale'] },
]

// ── Employees ────────────────────────────────────────────────────────────────

export const seedEmployees: Employee[] = [
  { id: sid('emp'), name: 'Robin Vale', role: 'Owner / Maker', email: 'robin@novaprints.example', phone: '(503) 555-0117', payRate: 0, payType: 'salary', status: 'Active', startDate: daysAgo(720), avatarHue: 262 },
  { id: sid('emp'), name: 'Sam Whitaker', role: 'Part-time packer', email: 'sam@novaprints.example', payRate: 17.5, payType: 'hourly', status: 'Active', startDate: daysAgo(210), avatarHue: 152 },
  { id: sid('emp'), name: 'Priya Anand', role: 'Social media (contract)', email: 'priya@freelance.example', payRate: 28, payType: 'hourly', status: 'Active', startDate: daysAgo(95), avatarHue: 24 },
]

// ── Marketing ────────────────────────────────────────────────────────────────

export const seedCampaigns: Campaign[] = [
  { id: sid('cmp'), name: 'Summer Sale — Etsy Ads', channel: 'Etsy Ads', status: 'Active', budget: 150, spent: 84.2, clicks: 1420, conversions: 61, revenue: 1098, startDate: daysAgo(14) },
  { id: sid('cmp'), name: 'Dragon launch reel', channel: 'Instagram', status: 'Active', budget: 60, spent: 45, clicks: 890, conversions: 22, revenue: 748, startDate: daysAgo(9) },
  { id: sid('cmp'), name: 'June newsletter', channel: 'Email', status: 'Completed', budget: 0, spent: 0, clicks: 312, conversions: 18, revenue: 402, startDate: daysAgo(21), endDate: daysAgo(20) },
  { id: sid('cmp'), name: 'Pinterest desk-setup pins', channel: 'Pinterest', status: 'Paused', budget: 40, spent: 22.5, clicks: 260, conversions: 4, revenue: 96, startDate: daysAgo(40) },
  { id: sid('cmp'), name: 'Holiday gift guide (draft)', channel: 'Google Ads', status: 'Draft', budget: 200, spent: 0, clicks: 0, conversions: 0, revenue: 0, startDate: daysAhead(120) },
]

export const seedPromoCodes: PromoCode[] = [
  { id: sid('pmc'), code: 'SUMMER15', discountPct: 15, uses: 38, maxUses: 200, active: true, expiresAt: daysAhead(24) },
  { id: sid('pmc'), code: 'THANKYOU10', discountPct: 10, uses: 112, active: true },
  { id: sid('pmc'), code: 'MARKET5', discountPct: 5, uses: 21, maxUses: 100, active: true, expiresAt: daysAhead(60) },
  { id: sid('pmc'), code: 'SPRING20', discountPct: 20, uses: 87, maxUses: 100, active: false, expiresAt: daysAgo(30) },
]

// ── Social ───────────────────────────────────────────────────────────────────

export const seedSocialAccounts: SocialAccount[] = [
  { id: sid('soc'), platform: 'Instagram', handle: '@novaprints.co', followers: 4820, followersLastMonth: 4460, connected: true },
  { id: sid('soc'), platform: 'TikTok', handle: '@novaprints', followers: 12400, followersLastMonth: 10100, connected: true },
  { id: sid('soc'), platform: 'Pinterest', handle: 'novaprintsco', followers: 980, followersLastMonth: 940, connected: true },
  { id: sid('soc'), platform: 'YouTube', handle: 'Nova Prints Studio', followers: 620, followersLastMonth: 585, connected: false },
]

export const seedSocialPosts: SocialPost[] = [
  { id: sid('pst'), platform: 'TikTok', content: 'POV: your Mystery Egg hatches on camera 🥚✨ #3dprinting #fidget', scheduledFor: daysAgo(2, 18), status: 'Posted', likes: 8420, comments: 312, shares: 940 },
  { id: sid('pst'), platform: 'Instagram', content: 'Ember Red dragons back in stock this Friday 🐉🔥', scheduledFor: daysAgo(1, 17), status: 'Posted', likes: 642, comments: 58, shares: 71 },
  { id: sid('pst'), platform: 'Instagram', content: 'Behind the scenes: 8-egg batch timelapse', scheduledFor: daysAhead(1, 17), status: 'Scheduled', likes: 0, comments: 0, shares: 0 },
  { id: sid('pst'), platform: 'TikTok', content: 'Rating my failed prints so you don\'t have to 💀', scheduledFor: daysAhead(2, 18), status: 'Scheduled', likes: 0, comments: 0, shares: 0 },
  { id: sid('pst'), platform: 'Pinterest', content: 'Desk setup essentials: hex stand + cable clips', scheduledFor: daysAhead(3, 9), status: 'Scheduled', likes: 0, comments: 0, shares: 0 },
  { id: sid('pst'), platform: 'Instagram', content: 'Meet the makers market lineup for Saturday 🌞', scheduledFor: daysAhead(4, 12), status: 'Draft', likes: 0, comments: 0, shares: 0 },
  { id: sid('pst'), platform: 'YouTube', content: 'Studio tour: how we run 3 printers in a spare room', scheduledFor: daysAhead(9, 15), status: 'Draft', likes: 0, comments: 0, shares: 0 },
  { id: sid('pst'), platform: 'TikTok', content: 'Axolotl army assembly line 🦎🦎🦎', scheduledFor: daysAgo(5, 19), status: 'Posted', likes: 3100, comments: 145, shares: 260 },
]

// ── Newsletter ───────────────────────────────────────────────────────────────

export const seedSubscribers: Subscriber[] = (() => {
  const subs: Subscriber[] = []
  // Most customers opted in when they ordered
  seedCustomers.forEach((c, i) => {
    if (chance(0.82)) {
      const tags: string[] = []
      if (c.tags.includes('vip')) tags.push('vip')
      if (c.tags.includes('wholesale')) tags.push('wholesale')
      subs.push({
        id: sid('sub'),
        email: c.email,
        name: c.name,
        status: chance(0.06) ? 'unsubscribed' : 'subscribed',
        tags,
        source: 'Order',
        createdAt: c.createdAt,
      })
    }
    void i
  })
  // A few from the website signup form
  const extra = [
    ['aria.blythe@example.com', 'Aria Blythe'],
    ['tom.reyes@example.com', 'Tom Reyes'],
    ['jamie.fox@example.com', 'Jamie Fox'],
    ['lena.mori@example.com', 'Lena Mori'],
    ['pat.osei@example.com', 'Pat Osei'],
  ] as const
  for (const [email, name] of extra) {
    subs.push({ id: sid('sub'), email, name, status: 'subscribed', tags: [], source: 'Signup form', createdAt: daysAgo(ri(3, 90)) })
  }
  return subs
})()

export const seedNewsletters: Newsletter[] = [
  {
    id: sid('nws'),
    subject: 'June at Nova Prints: new dragons & a summer treat 🐉',
    preheader: 'Ember Red is back, plus 15% off your next order',
    intro:
      "Hi friends! June flew by in a cloud of filament. We restocked the Ember Red Articulated Dragon (our most-requested color), wrapped up a big wholesale run, and spent a sunny Saturday at the riverfront market meeting so many of you. Here's what's new this month — and a little thank-you inside.",
    audienceTag: undefined,
    cadence: 'monthly',
    status: 'sent',
    includeBestSellers: true,
    includeNewProducts: true,
    promoCode: 'SUMMER15',
    ctaLabel: 'Shop new arrivals',
    ctaUrl: 'https://novaprints.example/shop',
    sentAt: daysAgo(20, 9),
    recipientCount: 24,
    opens: 15,
    clicks: 6,
    unsubscribes: 1,
    createdAt: daysAgo(22),
  },
  {
    id: sid('nws'),
    subject: 'Your July maker update 🌞',
    preheader: 'Market dates, a new desk collection, and a sneak peek',
    intro:
      "Happy July! We've got a busy month ahead — two markets, a brand-new desk collection dropping mid-month, and a behind-the-scenes look at how we run three printers out of a spare room. Thanks for following along.",
    audienceTag: undefined,
    cadence: 'monthly',
    status: 'scheduled',
    includeBestSellers: true,
    includeNewProducts: true,
    promoCode: undefined,
    scheduledFor: daysAhead(6, 9),
    createdAt: daysAgo(1),
  },
  {
    id: sid('nws'),
    subject: 'VIP early access: holiday pre-orders',
    preheader: 'You get first dibs before anyone else',
    intro:
      "As one of our VIP customers, you're getting first access to holiday pre-orders before we announce them publicly. Reply and let us know what you'd love to see this season!",
    audienceTag: 'vip',
    cadence: 'one-time',
    status: 'draft',
    includeBestSellers: false,
    includeNewProducts: true,
    promoCode: undefined,
    createdAt: daysAgo(0),
  },
]

export const seedNewsletterSettings: NewsletterSettings = {
  fromName: 'Nova Prints & Co.',
  fromEmail: 'hello@novaprints.example',
  replyTo: 'hello@novaprints.example',
  mailingAddress: '742 Alder St, Studio 3, Portland, OR 97205',
  footerNote: 'Made with 🐣 in Portland. Thanks for supporting a small maker shop!',
  defaultCadence: 'monthly',
  sendWeekday: 4, // Thursday
  sendMonthDay: 1,
  sendHour: 9,
  mailBridgeUrl: '',
  mailBridgeToken: '',
}

// ── Notifications ────────────────────────────────────────────────────────────

export function buildSeedNotifications(): AppNotification[] {
  const notifications: AppNotification[] = []
  const lowMats = seedMaterials.filter((m) => m.stock <= m.reorderPoint)
  for (const m of lowMats.slice(0, 3)) {
    notifications.push({
      id: sid('ntf'),
      type: 'low-stock',
      title: `Low stock: ${m.name}`,
      body: `${m.stock}${m.unit === 'g' ? 'g' : ` ${m.unit}`} left — reorder point is ${m.reorderPoint}${m.unit === 'g' ? 'g' : ''}.`,
      createdAt: daysAgo(0, 8),
      read: false,
      link: '/inventory',
    })
  }
  const lowProds = seedProducts.filter((p) => p.stock <= p.reorderPoint)
  for (const p of lowProds.slice(0, 2)) {
    notifications.push({
      id: sid('ntf'),
      type: 'low-stock',
      title: `Low stock: ${p.name}`,
      body: `${p.stock} left in stock — reorder point is ${p.reorderPoint}.`,
      createdAt: daysAgo(0, 7),
      read: false,
      link: '/inventory',
    })
  }
  const todayOrders = seedOrders.filter((o) => dayKey(o.placedAt) === dayKey(now))
  for (const o of todayOrders.slice(0, 3)) {
    notifications.push({
      id: sid('ntf'),
      type: 'order',
      title: `New order ${o.number}`,
      body: `${o.customerName} — ${o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}`,
      createdAt: o.placedAt,
      read: false,
      link: '/orders',
    })
  }
  notifications.push({
    id: sid('ntf'),
    type: 'shipping',
    title: '3 orders due to ship tomorrow',
    body: 'Check the fulfillment queue to stay on schedule.',
    createdAt: daysAgo(0, 9),
    read: false,
    link: '/orders',
  })
  notifications.push({
    id: sid('ntf'),
    type: 'report',
    title: 'Your monthly report is ready',
    body: 'June profit is up 12% over May. Nice work!',
    createdAt: daysAgo(1, 9),
    read: true,
    link: '/accounting',
  })
  notifications.push({
    id: sid('ntf'),
    type: 'expense',
    title: 'Recurring bill due soon',
    body: 'Shopify subscription ($39) renews in 3 days.',
    createdAt: daysAgo(1, 10),
    read: true,
    link: '/expenses',
  })
  return notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// ── Settings ─────────────────────────────────────────────────────────────────

export const seedSettings: Settings = {
  businessName: 'Nova Prints & Co.',
  ownerName: 'Robin Vale',
  email: 'hello@novaprints.example',
  phone: '(503) 555-0117',
  address: { line1: '742 Alder St, Studio 3', city: 'Portland', state: 'OR', zip: '97205', country: 'US' },
  logoEmoji: '🐣',
  tagline: 'Small-batch 3D prints & delightful desk things',
  currency: 'USD',
  taxRate: 7.25,
  notifyLowStock: true,
  notifyNewOrders: true,
  notifyExpensesDue: true,
  weeklyReports: true,
  printerBridgeUrl: '',
}
