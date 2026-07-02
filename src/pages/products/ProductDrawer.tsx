import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Copy, FlaskConical, Pencil, SlidersHorizontal, Trash2 } from 'lucide-react'
import {
  Badge,
  Button,
  ConfirmDialog,
  DetailLabel,
  DetailRow,
  Drawer,
  ProductTile,
  StockBadge,
  Toggle,
} from '@/components/ui'
import { useStore } from '@/store/useStore'
import type { Product } from '@/data/types'
import { grams, minutesToHours, money, num, pct } from '@/lib/format'
import { cn, sum, uid } from '@/lib/utils'
import { toast } from '@/store/useUI'

/** Gross margin as a percent of price (0 when the product is free) */
export function marginPct(price: number, cost: number): number {
  return price > 0 ? ((price - cost) / price) * 100 : 0
}

/** Tone class for a margin figure: healthy > 60%, thin < 30% */
export function marginClass(m: number): string {
  if (m > 60) return 'text-[#006300] dark:text-good'
  if (m < 30) return 'text-critical'
  return 'text-ink'
}

export interface ProductDrawerProps {
  product: Product | null
  onClose: () => void
  onEdit: (product: Product) => void
  /** Called with the freshly created copy so the parent can select it */
  onDuplicated: (id: string) => void
}

export default function ProductDrawer({ product, onClose, onEdit, onDuplicated }: ProductDrawerProps) {
  const navigate = useNavigate()
  const recipes = useStore((s) => s.recipes)
  const materials = useStore((s) => s.materials)
  const updateItem = useStore((s) => s.updateItem)
  const removeItem = useStore((s) => s.removeItem)
  const addItem = useStore((s) => s.addItem)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const p = product
  const recipe = p?.recipeId ? (recipes.find((r) => r.id === p.recipeId) ?? null) : null
  const recipeLines =
    recipe?.lines.map((line) => ({
      line,
      material: materials.find((m) => m.id === line.materialId) ?? null,
    })) ?? []
  const materialsCostPerUnit = recipe
    ? sum(recipeLines.map((x) => x.line.quantity * (x.material?.costPerUnit ?? 0))) / Math.max(1, recipe.outputQty)
    : 0

  const duplicate = () => {
    if (!p) return
    const copy: Product = {
      ...p,
      id: uid('prod'),
      name: `${p.name} (copy)`,
      sku: `${p.sku}-COPY`,
      variants: p.variants.map((v) => ({ ...v, id: uid('var'), sku: `${v.sku}-COPY` })),
      createdAt: new Date().toISOString(),
    }
    addItem('products', copy)
    toast('Product duplicated', { description: copy.name, tone: 'success' })
    onDuplicated(copy.id)
  }

  const destroy = () => {
    if (!p) return
    removeItem('products', p.id)
    toast('Product deleted', { description: p.name, tone: 'success' })
    onClose()
  }

  const margin = p ? marginPct(p.price, p.cost) : 0

  return (
    <>
      <Drawer
        open={p !== null}
        onClose={onClose}
        wide
        title={p?.name ?? ''}
        subtitle={p ? <span className="font-mono">{p.sku}</span> : undefined}
        footer={
          p && (
            <>
              <Button variant="ghost" icon={<Trash2 />} className="mr-auto text-critical hover:text-critical" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
              <Button variant="outline" icon={<Copy />} onClick={duplicate}>
                Duplicate
              </Button>
              <Button icon={<Pencil />} onClick={() => onEdit(p)}>
                Edit
              </Button>
            </>
          )
        }
      >
        {p && (
          <div className="space-y-6">
            {/* ── Identity ── */}
            <div className="flex items-start gap-4">
              <ProductTile emoji={p.image} hue={p.imageHue} size="xl" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="text-lg font-semibold leading-tight text-ink">{p.name}</div>
                <div className="font-mono text-xs text-ink-3">{p.sku}</div>
                <Badge>{p.category}</Badge>
              </div>
            </div>
            <Toggle
              checked={p.active}
              onChange={(active) => updateItem('products', p.id, { active })}
              label="Active"
              description={p.active ? 'Listed and sellable across channels.' : 'Hidden from listings until re-enabled.'}
            />

            {p.description && <p className="text-sm leading-relaxed text-ink-2">{p.description}</p>}

            {/* ── Pricing ── */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-sunken px-3 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Price</div>
                <div className="tnum mt-1 text-[15px] font-semibold text-ink">{money(p.price)}</div>
              </div>
              <div className="rounded-xl bg-sunken px-3 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Cost</div>
                <div className="tnum mt-1 text-[15px] font-semibold text-ink">{money(p.cost)}</div>
              </div>
              <div className="rounded-xl bg-sunken px-3 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Margin</div>
                <div className={cn('tnum mt-1 text-[15px] font-semibold', marginClass(margin))}>{pct(margin, 0)}</div>
              </div>
            </div>

            {/* ── Stock ── */}
            <div>
              <DetailLabel>Stock</DetailLabel>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <StockBadge stock={p.stock} reorderPoint={p.reorderPoint} />
                <span className="text-[13px] text-ink-3">
                  Reorder at <span className="tnum font-medium text-ink-2">{num(p.reorderPoint)}</span>
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<SlidersHorizontal />}
                  className="ml-auto"
                  onClick={() => navigate(`/inventory?q=${encodeURIComponent(p.name)}`)}
                >
                  Adjust
                </Button>
              </div>
            </div>

            {/* ── Variants ── */}
            {p.variants.length > 0 && (
              <div>
                <DetailLabel>Variants</DetailLabel>
                <div className="mt-2 overflow-hidden rounded-xl border border-edge">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-edge bg-sunken/50 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                        <th scope="col" className="px-3 py-2 text-left">Variant</th>
                        <th scope="col" className="px-3 py-2 text-left">SKU</th>
                        <th scope="col" className="px-3 py-2 text-right">Price</th>
                        <th scope="col" className="px-3 py-2 text-right">Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.variants.map((v) => (
                        <tr key={v.id} className="border-b border-hairline last:border-0">
                          <td className="px-3 py-2 font-medium text-ink">{v.name}</td>
                          <td className="px-3 py-2 font-mono text-xs text-ink-3">{v.sku}</td>
                          <td className="tnum px-3 py-2 text-right text-ink-2">{money(v.price)}</td>
                          <td className="tnum px-3 py-2 text-right text-ink-2">{num(v.stock)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Bill of materials ── */}
            <div>
              <DetailLabel>Bill of materials</DetailLabel>
              {recipe ? (
                <div className="mt-2 space-y-3">
                  <div className="overflow-hidden rounded-xl border border-edge">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-edge bg-sunken/50 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                          <th scope="col" className="px-3 py-2 text-left">Material</th>
                          <th scope="col" className="px-3 py-2 text-right">Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recipeLines.map(({ line, material }) => (
                          <tr key={line.materialId} className="border-b border-hairline last:border-0">
                            <td className="px-3 py-2 font-medium text-ink">{material?.name ?? 'Unknown material'}</td>
                            <td className="tnum px-3 py-2 text-right text-ink-2">
                              {num(line.quantity)}
                              {material ? ` ${material.unit}` : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-ink-3">
                    <span>
                      Materials cost <span className="tnum font-medium text-ink-2">{money(materialsCostPerUnit)}</span> / unit
                    </span>
                    <span>
                      Print time <span className="tnum font-medium text-ink-2">{minutesToHours(recipe.printTimeMin)}</span> per{' '}
                      {recipe.outputQty === 1 ? 'unit' : `${num(recipe.outputQty)} units`}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="mt-2 flex items-center gap-2 rounded-xl bg-sunken px-3 py-2.5 text-[13px] text-ink-3">
                  <FlaskConical className="h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    No recipe —{' '}
                    <Link to="/manufacturing" className="font-medium text-accent hover:underline">
                      create one in Manufacturing
                    </Link>{' '}
                    to track materials per unit.
                  </span>
                </p>
              )}
            </div>

            {/* ── Physical ── */}
            <div>
              <DetailLabel>Physical</DetailLabel>
              <div className="mt-1 divide-y divide-hairline">
                <DetailRow label="Weight">{grams(p.weightGrams)}</DetailRow>
                <DetailRow label="Dimensions">
                  <span className="tnum">
                    {p.dimensionsCm.l} × {p.dimensionsCm.w} × {p.dimensionsCm.h} cm
                  </span>
                </DetailRow>
                <DetailRow label="Production time">
                  <span className="tnum">{minutesToHours(p.productionTimeMin)}</span>
                </DetailRow>
              </div>
            </div>

            {/* ── Tags ── */}
            {p.tags.length > 0 && (
              <div>
                <DetailLabel>Tags</DetailLabel>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.tags.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={destroy}
        danger
        title="Delete product?"
        description={p ? `“${p.name}” will be removed from your catalog. This cannot be undone.` : undefined}
        confirmLabel="Delete"
      />
    </>
  )
}
