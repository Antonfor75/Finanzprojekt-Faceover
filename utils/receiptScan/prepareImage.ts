/**
 * Bonfotos im Browser verkleinern, bevor sie hochgehen. Handyfotos haben 3–12 MB; Vercel nimmt
 * pro Anfrage höchstens ~4,5 MB an, und Gemini liest einen Bon auch mit ~3 Megapixeln sicher.
 * PDFs gehen unverändert durch.
 */

export const MAX_FILES = 4
/** Gesamtgröße pro Bon — knapp unter dem Server-Limit (next.config.ts: serverActions.bodySizeLimit). */
export const MAX_TOTAL_BYTES = 3.8 * 1024 * 1024

const MAX_PIXELS = 3_000_000
const MAX_SIDE = 3000
const QUALITY = 0.82

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
    if (typeof createImageBitmap === 'function') {
        try {
            return await createImageBitmap(file, { imageOrientation: 'from-image' })
        } catch { /* weiter mit <img> */ }
    }
    const url = URL.createObjectURL(file)
    try {
        const img = new Image()
        img.src = url
        await img.decode()
        return img
    } finally {
        URL.revokeObjectURL(url)
    }
}

/** Ein Foto auf höchstens ~3 Megapixel als JPEG bringen. */
export async function shrinkImage(file: File): Promise<File> {
    let source: ImageBitmap | HTMLImageElement
    try {
        source = await loadBitmap(file)
    } catch {
        throw new Error('Dieses Bild kann der Browser nicht öffnen. Bitte als JPG oder PNG versuchen.')
    }
    const w = 'naturalWidth' in source ? source.naturalWidth : source.width
    const h = 'naturalHeight' in source ? source.naturalHeight : source.height
    const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (w * h)), MAX_SIDE / Math.max(w, h))
    if (scale === 1 && file.type === 'image/jpeg' && file.size < 1.2 * 1024 * 1024) return file

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w * scale))
    canvas.height = Math.max(1, Math.round(h * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Bild konnte nicht vorbereitet werden.')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
    if ('close' in source) source.close()

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
    if (!blob) throw new Error('Bild konnte nicht vorbereitet werden.')
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
}

/** Ausgewählte Dateien prüfen und vorbereiten (Fotos verkleinern, PDFs unverändert). */
export async function prepareReceiptFiles(files: File[]): Promise<File[]> {
    if (files.length === 0) throw new Error('Kein Bild ausgewählt.')
    if (files.length > MAX_FILES) throw new Error(`Höchstens ${MAX_FILES} Bilder pro Bon.`)
    const out: File[] = []
    for (const f of files) {
        if (f.type === 'application/pdf') out.push(f)
        else if (f.type.startsWith('image/') || f.type === '') out.push(await shrinkImage(f))
        else throw new Error('Nur Fotos oder PDF.')
    }
    const total = out.reduce((s, f) => s + f.size, 0)
    if (total > MAX_TOTAL_BYTES) throw new Error('Der Beleg ist zu groß (höchstens ca. 4 MB). Bei PDFs bitte nur die Bon-Seite nehmen.')
    return out
}
