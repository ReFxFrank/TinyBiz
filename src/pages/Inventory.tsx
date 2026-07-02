import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, Package, PackageX, Plus, ScanBarcode, Warehouse } from 'lucide-react'
import { Button, PageHeader, SkeletonStats, SkeletonTable, Stat, Tabs, Tip, type TabItem } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import type { Material, Product } from '@/data/types'
import { inventoryValue, lowStockMaterials, lowStockProducts } from '@/lib/metrics'
import { moneyCompact, num } from '@/lib/format'
import { sum, useLoaded } from '@/lib/utils'
import ProductsTab from './inventory/ProductsTab'
import MaterialsTab from './inventory/MaterialsTab'
import AdjustmentsTab from './inventory/AdjustmentsTab'
import AdjustStockModal, { type AdjustTarget } from './inventory/AdjustStockModal'
import MaterialModal from './inventory/MaterialModal'

type TabKey = 'products' | 'materials' | 'adjustments'

export default function Inventory() {
  const loaded = useLoaded()
  const products = useStore((s) => s.products)
  const materials = useStore((s) => s.materials)
  const adjustments = useStore((s) => s.adjustments)
  const [searchParams, setSearchParams] = useSearchParams()

  const [tab, setTab] = useState<TabKey>(() => {
    const t = searchParams.get('tab')
    return t === 'materials' || t === 'adjustments' ? t : 'products'
  })
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')
  // Products-tab filters live here so the stat tiles can drive them
  const [productCategory, setProductCategory] = useState('')
  const [lowOnly, setLowOnly] = useState(false)

  // Keep tab + search in sync when navigated to via global search / notifications
  useEffect(() => {
    const t = searchParams.get('tab')
    if (t === 'materials' || t === 'adjustments' || t === 'products') setTab(t)
    const q = searchParams.get('q')
    if (q !== null) setQuery(q)
  }, [searchParams])
  const [adjustTarget, setAdjustTarget] = useState<AdjustTarget | null>(null)
  const [materialModal, setMaterialModal] = useState<{ open: boolean; material: Material | null }>({
    open: false,
    material: null,
  })

  // ?new=1 auto-opens the add-material modal
  useEffect(() => {
    if (searchParams.get('new')) {
      setTab('materials')
      setMaterialModal({ open: true, material: null })
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const stats = useMemo(() => {
    const low = lowStockProducts(products).length + lowStockMaterials(materials).length
    const out = products.filter((p) => p.stock <= 0).length + materials.filter((m) => m.stock <= 0).length
    return {
      value: inventoryValue(products, materials),
      low,
      out,
      units: sum(products.map((p) => p.stock)),
    }
  }, [products, materials])

  const tabs: Array<TabItem<TabKey>> = [
    { value: 'products', label: 'Products', count: products.length },
    { value: 'materials', label: 'Materials', count: materials.length },
    { value: 'adjustments', label: 'Adjustments', count: adjustments.length },
  ]

  const openAdjust = (type: 'product' | 'material') => (item: Product | Material, damaged?: boolean) =>
    setAdjustTarget({ type, id: item.id, presetReason: damaged ? 'Damaged' : undefined })

  /** Clicking a stat tile lands on the Products tab with predictable filters */
  const showProducts = (low: boolean) => {
    setQuery('')
    setProductCategory('')
    setLowOnly(low)
    setTab('products')
  }

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Finished products and raw materials — know what's on the shelf before you promise it."
        actions={
          <>
            <Tip content="Barcode scanning is coming soon">
              <Button
                variant="outline"
                icon={<ScanBarcode />}
                className="opacity-60"
                onClick={() => toast('Coming soon', { description: 'Barcode scanning is on the roadmap.' })}
              >
                Scan barcode
              </Button>
            </Tip>
            <Button
              icon={<Plus />}
              onClick={() => {
                setTab('materials')
                setMaterialModal({ open: true, material: null })
              }}
            >
              Add material
            </Button>
          </>
        }
      />

      {!loaded ? (
        <div className="space-y-6">
          <SkeletonStats />
          <SkeletonTable rows={8} />
        </div>
      ) : (
        <motion.div
          className="space-y-6"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label="Inventory value"
              value={moneyCompact(stats.value)}
              icon={<Warehouse />}
              clickHint="Browse all products with filters cleared"
              onClick={() => showProducts(false)}
            />
            <Stat
              label="Low stock items"
              value={
                <span className={stats.low > 0 ? 'text-[#b4491f] dark:text-serious' : undefined}>{num(stats.low)}</span>
              }
              icon={<AlertTriangle />}
              clickHint="Filter products to low stock only"
              onClick={() => showProducts(true)}
            />
            <Stat
              label="Out of stock"
              value={<span className={stats.out > 0 ? 'text-critical' : undefined}>{num(stats.out)}</span>}
              icon={<PackageX />}
              clickHint="Out-of-stock items show in the low-stock product view"
              onClick={() => showProducts(true)}
            />
            <Stat
              label="Finished units on hand"
              value={num(stats.units)}
              icon={<Package />}
              clickHint="View finished products and their stock"
              onClick={() => showProducts(false)}
            />
          </div>

          <div>
            <Tabs items={tabs} value={tab} onChange={setTab} className="mb-4" />

            {tab === 'products' && (
              <ProductsTab
                products={products}
                query={query}
                onQueryChange={setQuery}
                category={productCategory}
                onCategoryChange={setProductCategory}
                lowOnly={lowOnly}
                onLowOnlyChange={setLowOnly}
                onAdjust={openAdjust('product')}
              />
            )}
            {tab === 'materials' && (
              <MaterialsTab
                materials={materials}
                query={query}
                onQueryChange={setQuery}
                onAdjust={openAdjust('material')}
                onEdit={(m) => setMaterialModal({ open: true, material: m })}
                onAdd={() => setMaterialModal({ open: true, material: null })}
              />
            )}
            {tab === 'adjustments' && <AdjustmentsTab adjustments={adjustments} />}
          </div>
        </motion.div>
      )}

      <AdjustStockModal target={adjustTarget} onClose={() => setAdjustTarget(null)} />
      <MaterialModal
        open={materialModal.open}
        material={materialModal.material}
        onClose={() => setMaterialModal((s) => ({ ...s, open: false }))}
      />
    </div>
  )
}
