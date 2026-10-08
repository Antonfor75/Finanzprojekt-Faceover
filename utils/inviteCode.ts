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

export const MAX_INVITE_USES = 100

export type InviteStatus = 'open' | 'exhausted' | 'expired'

type StatusInput = {
    max_uses?: number | null
    use_count?: number | null
    used_at?: string | null
    expires_at?: string | null
}

/**
 * Status eines Codes für die Anzeige — gleiche Regeln wie `claim_invite_code`
 * in der DB: ausgeschöpft, sobald used_at gesetzt oder das Kontingent voll ist.
 * `redeemed` = Anzahl erfasster Einlösungen (falls bekannt), damit Altbestände
 * mit nur used_at korrekt als 1/1 erscheinen.
 */
export function inviteStatus(code: StatusInput, now: Date = new Date(), redeemed = 0) {
    const maxUses = Math.max(1, Number(code.max_uses ?? 1))
    let used = Math.max(Number(code.use_count ?? 0), redeemed)
    if (code.used_at && used === 0) used = maxUses
    used = Math.min(used, maxUses)
    const remaining = maxUses - used

    let status: InviteStatus = 'open'
    if (code.used_at || remaining <= 0) status = 'exhausted'
    else if (code.expires_at && new Date(code.expires_at) <= now) status = 'expired'

    return { status, used, maxUses, remaining }
}

/** "1 Person" / "5 Personen" */
export function personenLabel(n: number): string {
    return `${n} ${n === 1 ? 'Person' : 'Personen'}`
}

/** Gültige Personenzahl für einen neuen Code oder null. */
export function parseMaxUses(value: unknown): number | null {
    const n = Number(value ?? 1)
    if (!Number.isInteger(n) || n < 1 || n > MAX_INVITE_USES) return null
    return n
}
