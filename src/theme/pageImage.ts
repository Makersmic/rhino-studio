/**
 * Getting a picture ready for the page's background, in this browser. A phone photo can be 12 MB; the screen only needs
 * about 1920 px, and the kiosk and the Rhino's backups are better off with a few hundred KB. Drawing it again also leaves
 * behind anything hidden in the file, such as where a phone photo was taken. An animated GIF becomes its first frame.
 */
export const PICTURE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
export const MAX_SIDE = 1920
const QUALITY = 0.82

/** The size to draw a picture at: its own, or smaller with the same shape if either side is over the limit */
export function fitted(w: number, h: number, max = MAX_SIDE): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h, 1))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

/** A plain-language reason this file can't be used, or null */
export function refusal(file: { type: string; size: number }): string | null {
  if (!PICTURE_TYPES.includes(file.type)) return 'Pick a JPG, PNG, WEBP or GIF picture.'
  if (file.size > 40 * 1024 * 1024) return 'That file is over 40 MB. Pick a smaller picture.'
  return null
}

export async function preparePicture(file: File): Promise<{ blob: Blob; filename: string }> {
  const why = refusal(file)
  if (why) throw new Error(why)
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error(`This browser couldn't read ${file.name} as a picture.`)
  }
  const { w, h } = fitted(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error("This browser couldn't prepare the picture.")
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', QUALITY))
  if (!blob) throw new Error("This browser couldn't prepare the picture.")
  return { blob, filename: 'background.jpg' }
}
