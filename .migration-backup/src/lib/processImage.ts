export const MAX_FILE_SIZE = 5 * 1024 * 1024
export const MAX_OUTPUT_DIMENSION = 512
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export interface ProcessedImageResult {
  blob: Blob
  extension: 'webp' | 'jpg'
}

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageValidationError'
  }
}

export function validateImageFile(file: File): void {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new ImageValidationError('Lubatud on ainult JPEG, PNG või WebP failid')
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new ImageValidationError('Faili suurus ei tohi ületada 5 MB')
  }
}

let webpExportSupported: boolean | null = null

function supportsWebpExport(): boolean {
  if (webpExportSupported !== null) return webpExportSupported
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    webpExportSupported = canvas.toDataURL('image/webp').startsWith('data:image/webp')
  } catch {
    webpExportSupported = false
  }
  return webpExportSupported
}

export async function processImage(file: File): Promise<ProcessedImageResult> {
  validateImageFile(file)

  const bitmap = await createImageBitmap(file)

  const size = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - size) / 2
  const sy = (bitmap.height - size) / 2

  const canvas = document.createElement('canvas')
  canvas.width = MAX_OUTPUT_DIMENSION
  canvas.height = MAX_OUTPUT_DIMENSION

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas context pole saadaval')

  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, MAX_OUTPUT_DIMENSION, MAX_OUTPUT_DIMENSION)

  bitmap.close()

  const useWebp = supportsWebpExport()

  const blob = await new Promise<Blob | null>((resolve) => {
    if (useWebp) {
      canvas.toBlob((b) => resolve(b), 'image/webp', 0.85)
    } else {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85)
    }
  })

  if (!blob || blob.size === 0) {
    if (useWebp) {
      const jpegBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85)
      })
      if (jpegBlob && jpegBlob.size > 0) {
        return { blob: jpegBlob, extension: 'jpg' }
      }
    }
    throw new Error('Pildi töötlemine ebaõnnestus')
  }

  return { blob, extension: useWebp ? 'webp' : 'jpg' }
}
