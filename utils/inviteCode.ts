// Gemeinsame Regeln für Einladungscodes — von Erzeugung (Admin) und Einlösung
// (Registrierung) genutzt, damit beide Seiten dieselbe Schreibweise verwenden.

// Ohne 0/O/1/I/L, damit abgetippte Codes nicht an Verwechslungen scheitern.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const BLOCK_LENGTH = 4
const BLOCKS = 2

/** Erzeugt einen Code in der Form "ABCD-EF23". */
export function generateCode(): string {
    const bytes = new Uint8Array(BLOCK_LENGTH * BLOCKS)
    crypto.getRandomValues(bytes)

    const chars = Array.from(bytes, b => ALPHABET[b % ALPHABET.length])
    const blocks: string[] = []
    for (let i = 0; i < BLOCKS; i++) {
        blocks.push(chars.slice(i * BLOCK_LENGTH, (i + 1) * BLOCK_LENGTH).join(''))
    }
    return blocks.join('-')
}

/**
 * Bringt eine Nutzereingabe auf die Speicher-Schreibweise: Groß-/Kleinschreibung,
 * Leerzeichen und fehlende/zusätzliche Bindestriche sollen den Code nicht ungültig machen.
 */
export function normalizeCode(input: string): string {
    const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const blocks: string[] = []
    for (let i = 0; i < raw.length; i += BLOCK_LENGTH) {
        blocks.push(raw.slice(i, i + BLOCK_LENGTH))
    }
    return blocks.join('-')
}
