// Client-side photo prep: downscale + re-encode before upload so a 12MP phone
// photo becomes a few hundred KB. The server stores bytes as-is (8MB cap), so
// shrinking here keeps uploads fast and the gallery snappy.

const MAX_EDGE = 1600
const QUALITY = 0.85

/**
 * Resize an image file to fit within MAX_EDGE and re-encode as JPEG
 * (WebP-in, WebP-out to keep any transparency). GIFs pass through untouched —
 * re-encoding would kill the animation.
 */
export async function prepareImageForUpload(file: File): Promise<Blob> {
  if (file.type === 'image/gif') return file

  const bitmap = await loadImage(file)
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    // Already small and reasonably sized on disk — send the original bytes
    if (scale === 1 && file.size < 700 * 1024) return file

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    const keepAlpha = file.type === 'image/png' || file.type === 'image/webp'
    const type = keepAlpha ? 'image/webp' : 'image/jpeg'
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY))
    return blob ?? file
  } finally {
    if ('close' in bitmap) bitmap.close()
  }
}

function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) return createImageBitmap(file)
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that image.'))
    }
    img.src = url
  })
}
