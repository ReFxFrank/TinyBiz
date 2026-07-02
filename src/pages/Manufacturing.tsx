import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  BookOpen,
  Boxes,
  CheckCircle2,
  Clock,
  Factory,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Recycle,
  Trash2,
} from 'lucide-react'
import {
  Badge,
  BatchStatusBadge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  IconButton,
  Menu,
  MenuItem,
  MenuSeparator,
  PageHeader,
  ProductTile,
  Skeleton,
  SkeletonStats,
  SkeletonTable,
  Stat,
  Tabs,
  type BadgeTone,
  type Column,
} from '@/components/ui'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import type { Machine, Product, ProductionBatch, Recipe } from '@/data/types'
import { fmtDateShort, grams, minutesToHours, money, num, pct, timeAgo } from '@/lib/format'
import { cn, sum, useLoaded } from '@/lib/utils'
import { CompleteBatchModal } from '@/pages/manufacturing/CompleteBatchModal'
import { RecipeModal } from '@/pages/manufacturing/RecipeModal'
import { RunProductionModal } from '@/pages/manufacturing/RunProductionModal'

// ── Machines ─────────────────────────────────────────────────────────────────

const MACHINE_TONE: Record<Machine['status'], BadgeTone> = {
  Printing: 'blue',
  Idle: 'neutral',
  Maintenance: 'orange',
}

function MachineCard({ machine }: { machine: Machine }) {
  const updateItem = useStore((s) => s.updateItem)
  const setStatus = (status: Machine['status']) => {
    updateItem('machines', machine.id, { status })
    toast(`${machine.name} set to ${status.toLowerCase()}`, { tone: 'success' })
  }
  return (
    <Card className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="truncate font-medium text-ink">{machine.name}</div>
        <div className="text-xs text-ink-3">{machine.model}</div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Badge tone={MACHINE_TONE[machine.status]} dot>
            {machine.status}
          </Badge>
          <span className="tnum text-xs text-ink-3">{num(Math.round(machine.hoursLogged))}h logged</span>
        </div>
      </div>
      <Menu
        trigger={
          <IconButton label={`Actions for ${machine.name}`} size="sm">
            <MoreHorizontal />
          </IconButton>
        }
      >
        <MenuItem icon={<CheckCircle2 />} disabled={machine.status === 'Idle'} onSelect={() => setStatus('Idle')}>
          Set to Idle
        </MenuItem>
        <MenuItem
          icon={<AlertTriangle />}
          disabled={machine.status === 'Maintenance'}
          onSelect={() => setStatus('Maintenance')}
        >
          Set to Maintenance
        </MenuItem>
      </Menu>
    </Card>
  )
}

// ── Recipe card ──────────────────────────────────────────────────────────────

function RecipeCard({
  recipe,
  product,
  highlighted,
  onEdit,
  onDelete,
  onRun,
}: {
  recipe: Recipe
  product: Product | undefined
  highlighted: boolean
  onEdit: () => void
  onDelete: () => void
  onRun: () => void
}) {
  const materials = useStore((s) => s.materials)
  const cost = sum(
    recipe.lines.map((l) => l.quantity * (materials.find((m) => m.id === l.materialId)?.costPerUnit ?? 0)),
  )
  return (
    <Card
      id={`recipe-${recipe.id}`}
      className={cn(
        'flex flex-col gap-4 transition-shadow duration-300',
        highlighted && 'ring-2 ring-accent shadow-lifted',
      )}
    >
      <div className="flex items-start gap-3">
        <ProductTile emoji={product?.image ?? '📦'} hue={product?.imageHue ?? 215} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-ink">{recipe.name}</div>
          <div className="truncate text-xs text-ink-3">
            {product?.name ?? 'Unlinked product'} · makes {num(recipe.outputQty)}
          </div>
        </div>
        <Menu
          trigger={
            <IconButton label={`Actions for ${recipe.name}`} size="sm">
              <MoreHorizontal />
            </IconButton>
          }
        >
          <MenuItem icon={<Play />} onSelect={onRun}>
            Run production
          </MenuItem>
          <MenuItem icon={<Pencil />} onSelect={onEdit}>
            Edit
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Trash2 />} danger onSelect={onDelete}>
            Delete
          </MenuItem>
        </Menu>
      </div>

      <ul className="space-y-1.5">
        {recipe.lines.map((line) => {
          const mat = materials.find((m) => m.id === line.materialId)
          return (
            <li key={line.materialId} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate text-ink-2">{mat?.name ?? 'Unknown material'}</span>
              <span className="tnum shrink-0 text-ink-3">
                × {num(line.quantity)} {mat?.unit ?? ''}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="mt-auto flex items-center justify-between border-t border-hairline pt-3 text-[13px]">
        <span className="text-ink-3">
          Materials <span className="tnum font-medium text-ink">{money(cost)}</span> / unit
        </span>
        <span className="flex items-center gap-1 text-ink-3">
          <Clock aria-hidden className="h-3.5 w-3.5" />
          <span className="tnum font-medium text-ink">{minutesToHours(recipe.printTimeMin)}</span>
        </span>
      </div>
    </Card>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'batches' | 'recipes'

export default function Manufacturing() {
  const batches = useStore((s) => s.batches)
  const recipes = useStore((s) => s.recipes)
  const machines = useStore((s) => s.machines)
  const products = useStore((s) => s.products)
  const updateItem = useStore((s) => s.updateItem)
  const removeItem = useStore((s) => s.removeItem)
  const startQueuedBatch = useStore((s) => s.startQueuedBatch)

  const loaded = useLoaded()
  const [searchParams, setSearchParams] = useSearchParams()

  const [tab, setTab] = useState<Tab>('batches')
  const [runOpen, setRunOpen] = useState(false)
  const [runRecipeId, setRunRecipeId] = useState<string | null>(null)
  const [completing, setCompleting] = useState<ProductionBatch | null>(null)
  const [recipeModalOpen, setRecipeModalOpen] = useState(false)
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null)
  const [deletingRecipe, setDeletingRecipe] = useState<Recipe | null>(null)
  const [highlightRecipeId, setHighlightRecipeId] = useState<string | null>(null)

  // ?new=1 opens the Run production modal once, then clears the param
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setRunRecipeId(null)
      setRunOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  // 30-day production stats, bucketed by startedAt
  const cutoff = Date.now() - 30 * 86_400_000
  const recent = batches.filter((b) => new Date(b.startedAt).getTime() >= cutoff)
  const unitsProduced = sum(recent.map((b) => b.produced))
  const failedPrints = sum(recent.map((b) => b.failed))
  const attempts = unitsProduced + failedPrints
  const failRate = attempts ? (failedPrints / attempts) * 100 : 0
  const printMinutes = sum(recent.map((b) => b.printTimeMin))
  const wasteGrams = sum(recent.map((b) => b.wasteGrams))

  const openRun = (recipeId: string | null = null) => {
    setRunRecipeId(recipeId)
    setRunOpen(true)
  }

  const startNow = (batch: ProductionBatch) => {
    // Store action flips the batch + machine AND commits recipe materials
    startQueuedBatch(batch.id)
    toast(`Batch started on ${batch.machineName}`, { tone: 'success' })
  }

  /** Stat tiles jump to the batch list the 30-day numbers are built from */
  const showBatches = () => {
    setTab('batches')
    window.setTimeout(() => {
      document.getElementById('production-batches')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
  }

  const viewRecipe = (recipeId: string) => {
    setTab('recipes')
    setHighlightRecipeId(recipeId)
    window.setTimeout(() => {
      document.getElementById(`recipe-${recipeId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 60)
    window.setTimeout(() => setHighlightRecipeId(null), 1800)
  }

  const deleteRecipe = () => {
    if (!deletingRecipe) return
    removeItem('recipes', deletingRecipe.id)
    const product = productById.get(deletingRecipe.productId)
    if (product?.recipeId === deletingRecipe.id) {
      updateItem('products', product.id, { recipeId: undefined })
    }
    toast('Recipe deleted', { tone: 'success' })
    setDeletingRecipe(null)
  }

  const batchColumns: Array<Column<ProductionBatch>> = useMemo(
    () => [
      {
        key: 'product',
        header: 'Product',
        sortValue: (b) => b.productName,
        render: (b) => {
          const p = productById.get(b.productId)
          return (
            <div className="flex items-center gap-2.5">
              <ProductTile emoji={p?.image ?? '📦'} hue={p?.imageHue ?? 215} size="sm" />
              <span className="min-w-0 truncate font-medium text-ink">{b.productName}</span>
            </div>
          )
        },
      },
      {
        key: 'machine',
        header: 'Machine',
        hideBelow: 'md',
        sortValue: (b) => b.machineName,
        render: (b) => <span className="text-ink-2">{b.machineName}</span>,
      },
      {
        key: 'planned',
        header: 'Planned',
        align: 'right',
        sortValue: (b) => b.quantity,
        render: (b) => <span className="tnum">{num(b.quantity)}</span>,
      },
      {
        key: 'output',
        header: 'Output',
        align: 'right',
        sortValue: (b) => b.produced,
        render: (b) =>
          b.completedAt ? (
            <span className="tnum whitespace-nowrap">
              {num(b.produced)} good
              <span className={b.failed > 0 ? 'text-critical' : 'text-ink-3'}> · {num(b.failed)} failed</span>
            </span>
          ) : (
            <span className="text-ink-3">—</span>
          ),
      },
      {
        key: 'status',
        header: 'Status',
        sortValue: (b) => b.status,
        render: (b) => <BatchStatusBadge status={b.status} />,
      },
      {
        key: 'startedAt',
        header: 'Started',
        sortValue: (b) => b.startedAt,
        render: (b) => (
          <div>
            <div className="text-ink">{fmtDateShort(b.startedAt)}</div>
            <div className="text-xs text-ink-3">{timeAgo(b.startedAt)}</div>
          </div>
        ),
      },
      {
        key: 'printTime',
        header: 'Print time',
        align: 'right',
        hideBelow: 'lg',
        sortValue: (b) => b.printTimeMin,
        render: (b) => <span className="tnum">{minutesToHours(b.printTimeMin)}</span>,
      },
      {
        key: 'waste',
        header: 'Waste',
        align: 'right',
        hideBelow: 'lg',
        sortValue: (b) => b.wasteGrams,
        render: (b) => (
          <span className={cn('tnum', b.wasteGrams > 0 ? 'text-ink-2' : 'text-ink-3')}>{grams(b.wasteGrams)}</span>
        ),
      },
      {
        key: 'actions',
        header: <span className="sr-only">Actions</span>,
        align: 'right',
        width: 'w-12',
        render: (b) => (
          <Menu
            trigger={
              <IconButton label={`Actions for batch of ${b.productName}`} size="sm">
                <MoreHorizontal />
              </IconButton>
            }
          >
            {b.status === 'Queued' && (
              <MenuItem icon={<Play />} onSelect={() => startNow(b)}>
                Start now
              </MenuItem>
            )}
            {b.status === 'In Progress' && (
              <MenuItem icon={<CheckCircle2 />} onSelect={() => setCompleting(b)}>
                Complete…
              </MenuItem>
            )}
            <MenuItem icon={<BookOpen />} onSelect={() => viewRecipe(b.recipeId)}>
              View recipe
            </MenuItem>
          </Menu>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [productById],
  )

  return (
    <div>
      <PageHeader
        title="Manufacturing"
        description="Recipes, production batches, and the printers that run them."
        actions={
          <Button icon={<Play />} onClick={() => openRun()}>
            Run production
          </Button>
        }
      />

      {!loaded ? (
        <div className="space-y-6">
          <SkeletonStats />
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card p-5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-2 h-3 w-24" />
                <Skeleton className="mt-3 h-5 w-28" />
              </div>
            ))}
          </div>
          <SkeletonTable rows={6} />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label="Units produced (30d)"
              value={num(unitsProduced)}
              icon={<Boxes />}
              clickHint="See production batches"
              onClick={showBatches}
            />
            <Stat
              label={`Failed prints · ${pct(failRate)} rate`}
              value={num(failedPrints)}
              icon={<AlertTriangle />}
              clickHint="Review failures in the batch list"
              onClick={showBatches}
            />
            <Stat
              label="Print time (30d)"
              value={minutesToHours(printMinutes)}
              icon={<Clock />}
              clickHint="See print time per batch"
              onClick={showBatches}
            />
            <Stat
              label="Material waste (30d)"
              value={grams(wasteGrams)}
              icon={<Recycle />}
              clickHint="See waste recorded per batch"
              onClick={showBatches}
            />
          </div>

          <section aria-label="Machines">
            <h2 className="mb-3 text-sm font-semibold text-ink">Machines</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {machines.map((m) => (
                <MachineCard key={m.id} machine={m} />
              ))}
            </div>
          </section>

          <section id="production-batches" className="scroll-mt-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <Tabs<Tab>
                items={[
                  { value: 'batches', label: 'Batches', count: batches.length },
                  { value: 'recipes', label: 'Recipes', count: recipes.length },
                ]}
                value={tab}
                onChange={setTab}
                className="min-w-0 flex-1"
              />
              {tab === 'recipes' && (
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Plus />}
                  onClick={() => {
                    setEditingRecipe(null)
                    setRecipeModalOpen(true)
                  }}
                >
                  New recipe
                </Button>
              )}
            </div>

            {tab === 'batches' ? (
              <motion.div
                key="batches"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <DataTable
                  columns={batchColumns}
                  rows={batches}
                  rowKey={(b) => b.id}
                  initialSort={{ key: 'startedAt', dir: 'desc' }}
                  emptyState={
                    <EmptyState
                      icon={<Factory />}
                      title="No production yet"
                      description="Run your first batch from a recipe — materials are deducted and finished units land in stock."
                      action={
                        <Button icon={<Play />} onClick={() => openRun()}>
                          Run production
                        </Button>
                      }
                    />
                  }
                />
              </motion.div>
            ) : (
              <motion.div
                key="recipes"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                {recipes.length === 0 ? (
                  <Card padding="none">
                    <EmptyState
                      icon={<BookOpen />}
                      title="No recipes yet"
                      description="A recipe is the bill of materials for a product — what each production run consumes."
                      action={
                        <Button
                          icon={<Plus />}
                          onClick={() => {
                            setEditingRecipe(null)
                            setRecipeModalOpen(true)
                          }}
                        >
                          New recipe
                        </Button>
                      }
                    />
                  </Card>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {recipes.map((r) => (
                      <RecipeCard
                        key={r.id}
                        recipe={r}
                        product={productById.get(r.productId)}
                        highlighted={highlightRecipeId === r.id}
                        onEdit={() => {
                          setEditingRecipe(r)
                          setRecipeModalOpen(true)
                        }}
                        onDelete={() => setDeletingRecipe(r)}
                        onRun={() => openRun(r.id)}
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </section>
        </div>
      )}

      <RunProductionModal open={runOpen} onClose={() => setRunOpen(false)} initialRecipeId={runRecipeId} />
      <CompleteBatchModal batch={completing} onClose={() => setCompleting(null)} />
      <RecipeModal open={recipeModalOpen} onClose={() => setRecipeModalOpen(false)} editing={editingRecipe} />

      <ConfirmDialog
        open={Boolean(deletingRecipe)}
        onClose={() => setDeletingRecipe(null)}
        onConfirm={deleteRecipe}
        title="Delete recipe?"
        description={
          deletingRecipe
            ? `“${deletingRecipe.name}” will be removed. Past batches keep their records, but you won't be able to run this recipe again.`
            : undefined
        }
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}
