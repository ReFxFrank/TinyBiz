import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Plus, Trash2, X } from 'lucide-react'
import { Button, Field, IconButton, Input, Modal, ProductTile, Select, Textarea } from '@/components/ui'
import { useStore } from '@/store/useStore'
import type { Product, ProductCategory, ProductVariant } from '@/data/types'
import { api, ApiError } from '@/lib/api'
import { prepareImageForUpload } from '@/lib/image'
import { uid } from '@/lib/utils'
import { toast } from '@/store/useUI'

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  '3D Prints',
  'Stickers',
  'Accessories',
  'Home & Desk',
  'Packaging Add-ons',
]

const QUICK_EMOJI = ['🥚', '🐉', '🦎', '🪴', '📱', '🎁', '🧸', '🖨️']

interface VariantDraft {
  id: string
  name: string
  sku: string
  price: string
  cost: string
  stock: string
}

const emptyVariant = (): VariantDraft => ({ id: uid('var'), name: '', sku: '', price: '', cost: '', stock: '0' })

export interface ProductModalProps {
  open: boolean
  onClose: () => void
  /** When set the modal edits this product; otherwise it creates a new one */
  product: Product | null
}

export default function ProductModal({ open, onClose, product }: ProductModalProps) {
  const addItem = useStore((s) => s.addItem)
  const updateItem = useStore((s) => s.updateItem)

  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [category, setCategory] = useState('')
  const [price, setPrice] = useState('')
  const [cost, setCost] = useState('')
  const [stock, setStock] = useState('0')
  const [reorderPoint, setReorderPoint] = useState('5')
  const [weightGrams, setWeightGrams] = useState('0')
  const [dimL, setDimL] = useState('0')
  const [dimW, setDimW] = useState('0')
  const [dimH, setDimH] = useState('0')
  const [productionTimeMin, setProductionTimeMin] = useState('0')
  const [image, setImage] = useState('📦')
  const [imageHue, setImageHue] = useState(200)
  const [photos, setPhotos] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [tags, setTags] = useState('')
  const [description, setDescription] = useState('')
  const [variants, setVariants] = useState<VariantDraft[]>([])

  // Reset the form whenever the modal opens (fresh create or the edit target)
  useEffect(() => {
    if (!open) return
    setName(product?.name ?? '')
    setSku(product?.sku ?? '')
    setCategory(product?.category ?? '')
    setPrice(product ? String(product.price) : '')
    setCost(product ? String(product.cost) : '')
    setStock(String(product?.stock ?? 0))
    setReorderPoint(String(product?.reorderPoint ?? 5))
    setWeightGrams(String(product?.weightGrams ?? 0))
    setDimL(String(product?.dimensionsCm.l ?? 0))
    setDimW(String(product?.dimensionsCm.w ?? 0))
    setDimH(String(product?.dimensionsCm.h ?? 0))
    setProductionTimeMin(String(product?.productionTimeMin ?? 0))
    setImage(product?.image ?? '📦')
    setImageHue(product?.imageHue ?? 200)
    setPhotos(product?.photos ?? [])
    setTags(product?.tags.join(', ') ?? '')
    setDescription(product?.description ?? '')
    setVariants(
      product?.variants.map((v) => ({
        id: v.id,
        name: v.name,
        sku: v.sku,
        price: String(v.price),
        cost: String(v.cost),
        stock: String(v.stock),
      })) ?? [],
    )
  }, [open, product])

  const setVariant = (id: string, patch: Partial<VariantDraft>) =>
    setVariants((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)))

  // Upload picked files one at a time; only server URLs ever land in state,
  // and appends are functional so nothing gets dropped mid-flight.
  const addPhotos = async (files: File[]) => {
    setUploading(true)
    try {
      for (const file of files) {
        try {
          const blob = await prepareImageForUpload(file)
          const { url } = await api.upload(blob)
          setPhotos((ps) => [...ps, url])
        } catch (err) {
          toast(`Couldn’t upload ${file.name}`, {
            description: err instanceof ApiError ? err.message : 'Could not read that image.',
            tone: 'error',
          })
        }
      }
    } finally {
      setUploading(false)
    }
  }

  const priceNum = Number(price)
  const canSubmit =
    name.trim().length > 0 && sku.trim().length > 0 && category !== '' && price !== '' && !Number.isNaN(priceNum) && priceNum > 0

  const submit = () => {
    if (!canSubmit) return
    const cleanVariants: ProductVariant[] = variants
      .filter((v) => v.name.trim() && v.sku.trim())
      .map((v) => ({
        id: v.id,
        name: v.name.trim(),
        sku: v.sku.trim(),
        price: Math.max(0, Number(v.price) || 0),
        cost: Math.max(0, Number(v.cost) || 0),
        stock: Math.max(0, Math.round(Number(v.stock) || 0)),
      }))
    const base = {
      name: name.trim(),
      sku: sku.trim(),
      category: category as ProductCategory,
      description: description.trim(),
      price: priceNum,
      cost: Math.max(0, Number(cost) || 0),
      stock: Math.max(0, Math.round(Number(stock) || 0)),
      reorderPoint: Math.max(0, Math.round(Number(reorderPoint) || 0)),
      image: image.trim() || '📦',
      imageHue,
      photos,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      variants: cleanVariants,
      weightGrams: Math.max(0, Number(weightGrams) || 0),
      dimensionsCm: {
        l: Math.max(0, Number(dimL) || 0),
        w: Math.max(0, Number(dimW) || 0),
        h: Math.max(0, Number(dimH) || 0),
      },
      productionTimeMin: Math.max(0, Math.round(Number(productionTimeMin) || 0)),
    }
    if (product) {
      updateItem('products', product.id, base)
      toast('Product updated', { description: base.name, tone: 'success' })
    } else {
      addItem('products', {
        ...base,
        id: uid('prod'),
        active: true,
        createdAt: new Date().toISOString(),
      })
      toast('Product created', { description: base.name, tone: 'success' })
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? 'Edit product' : 'New product'}
      description={product ? 'Update details for this listing.' : 'Add a new listing to your catalog.'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {product ? 'Save changes' : 'Create product'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Articulated Dragon" autoFocus />
        </Field>
        <Field label="SKU" required>
          <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="NP-DRG-001" className="font-mono" />
        </Field>
        <Field label="Category" required>
          <Select
            aria-label="Category"
            placeholder="Choose a category"
            options={PRODUCT_CATEGORIES}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </Field>
        <Field label="Price" required>
          <Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="24.00" />
        </Field>
        <Field label="Cost">
          <Input type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="6.50" />
        </Field>
        <Field label="Stock">
          <Input type="number" min={0} step={1} value={stock} onChange={(e) => setStock(e.target.value)} />
        </Field>
        <Field label="Reorder point">
          <Input type="number" min={0} step={1} value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value)} />
        </Field>
        <Field label="Weight (g)">
          <Input type="number" min={0} step={1} value={weightGrams} onChange={(e) => setWeightGrams(e.target.value)} />
        </Field>
        <Field label="Dimensions (L × W × H cm)">
          <div className="flex items-center gap-2">
            <Input aria-label="Length (cm)" type="number" min={0} step="0.1" value={dimL} onChange={(e) => setDimL(e.target.value)} />
            <Input aria-label="Width (cm)" type="number" min={0} step="0.1" value={dimW} onChange={(e) => setDimW(e.target.value)} />
            <Input aria-label="Height (cm)" type="number" min={0} step="0.1" value={dimH} onChange={(e) => setDimH(e.target.value)} />
          </div>
        </Field>
        <Field label="Production time (min)">
          <Input
            type="number"
            min={0}
            step={1}
            value={productionTimeMin}
            onChange={(e) => setProductionTimeMin(e.target.value)}
          />
        </Field>
        <Field label="Image (emoji)" hint="One emoji used as the product artwork">
          <div className="flex items-center gap-2">
            <Input
              aria-label="Image emoji"
              value={image}
              maxLength={2}
              onChange={(e) => setImage(e.target.value)}
              className="w-16 text-center text-lg"
            />
            <div className="flex flex-wrap gap-1">
              {QUICK_EMOJI.map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-label={`Use ${e} as the product image`}
                  onClick={() => setImage(e)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-base transition-colors hover:bg-sunken"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </Field>
        <Field label="Tile hue" className="sm:col-span-2">
          <div className="flex items-center gap-4">
            <ProductTile emoji={image.trim() || '📦'} hue={imageHue} size="lg" />
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={imageHue}
              onChange={(e) => setImageHue(Number(e.target.value))}
              aria-label="Tile hue (0 to 360)"
              className="w-full accent-[var(--accent)]"
            />
            <span className="tnum w-10 shrink-0 text-right text-xs text-ink-3">{imageHue}°</span>
          </div>
        </Field>
        {/* ── Photos ── */}
        <div className="sm:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-medium text-ink-2">Photos</span>
            <Button
              variant="secondary"
              size="sm"
              icon={<ImagePlus />}
              disabled={uploading}
              onClick={() => photoInputRef.current?.click()}
            >
              {uploading ? 'Uploading…' : 'Add photos'}
            </Button>
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              e.target.value = '' // allow re-picking the same file
              if (files.length > 0) void addPhotos(files)
            }}
          />
          {photos.length === 0 ? (
            <p className="rounded-xl bg-sunken px-3 py-2.5 text-[13px] text-ink-3">
              No photos — the emoji tile stands in until you add some. The first photo is the cover.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {photos.map((url, i) => (
                <div key={url} className="group relative h-20 w-20">
                  <img
                    src={url}
                    alt={`${name.trim() || 'Product'} photo ${i + 1}`}
                    loading="lazy"
                    className="h-full w-full rounded-xl border border-hairline object-cover"
                  />
                  {i === 0 ? (
                    <span className="absolute bottom-1 left-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      Cover
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Make photo ${i + 1} the cover`}
                      onClick={() => setPhotos((ps) => [url, ...ps.filter((u) => u !== url)])}
                      className="absolute bottom-1 left-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 transition-opacity hover:bg-black/75 focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      Make cover
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove photo ${i + 1}`}
                    onClick={() => setPhotos((ps) => ps.filter((u) => u !== url))}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md bg-black/55 text-white transition-colors hover:bg-black/75"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Field label="Tags" hint="Comma separated, e.g. fidget, dragon, bestseller" className="sm:col-span-2">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="fidget, dragon" />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What makes this product special?" />
        </Field>

        {/* ── Variants ── */}
        <div className="sm:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-medium text-ink-2">Variants</span>
            <Button variant="secondary" size="sm" icon={<Plus />} onClick={() => setVariants((vs) => [...vs, emptyVariant()])}>
              Add variant
            </Button>
          </div>
          {variants.length === 0 ? (
            <p className="rounded-xl bg-sunken px-3 py-2.5 text-[13px] text-ink-3">
              No variants — add sizes or colorways if this product comes in options.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="rounded-xl bg-sunken px-3 py-2.5 text-[13px] text-ink-3">
                The price &amp; stock above sell as the <span className="font-medium text-ink-2">Standard</span> option;
                each variant is an extra option with its own price &amp; stock. Set the stock above to 0 if this product
                only comes in these variants.
              </p>
              <div className="hidden grid-cols-[1fr_1fr_80px_80px_64px_32px] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3 sm:grid">
                <span>Name</span>
                <span>SKU</span>
                <span>Price</span>
                <span>Cost</span>
                <span>Stock</span>
                <span />
              </div>
              {variants.map((v, i) => (
                <div key={v.id} className="grid grid-cols-2 gap-2 rounded-xl bg-sunken/60 p-2 sm:grid-cols-[1fr_1fr_80px_80px_64px_32px] sm:bg-transparent sm:p-0">
                  <Input aria-label={`Variant ${i + 1} name`} value={v.name} placeholder="Small" onChange={(e) => setVariant(v.id, { name: e.target.value })} />
                  <Input aria-label={`Variant ${i + 1} SKU`} value={v.sku} placeholder="SKU" className="font-mono" onChange={(e) => setVariant(v.id, { sku: e.target.value })} />
                  <Input aria-label={`Variant ${i + 1} price`} type="number" min={0} step="0.01" value={v.price} placeholder="0.00" onChange={(e) => setVariant(v.id, { price: e.target.value })} />
                  <Input aria-label={`Variant ${i + 1} cost`} type="number" min={0} step="0.01" value={v.cost} placeholder="0.00" onChange={(e) => setVariant(v.id, { cost: e.target.value })} />
                  <Input aria-label={`Variant ${i + 1} stock`} type="number" min={0} step={1} value={v.stock} onChange={(e) => setVariant(v.id, { stock: e.target.value })} />
                  <IconButton
                    label={`Remove variant ${i + 1}`}
                    size="sm"
                    className="self-center justify-self-end text-critical hover:text-critical"
                    onClick={() => setVariants((vs) => vs.filter((x) => x.id !== v.id))}
                  >
                    <Trash2 />
                  </IconButton>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
