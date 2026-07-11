/**
 * Pure Normalisierungs-/Ähnlichkeitslogik für das store-übergreifende Produkt-Matching.
 * Ziel: "JA! TOMATENSOSSE 500G" (REWE) und "TOMATENSAUCE" (Lidl) landen auf derselben
 * normalisierten Form, damit beide demselben kanonischen Produkt zugeordnet werden.
 *
 * Rein regelbasiert (kein KI-Einsatz), unit-getestet in productNormalize.test.ts.
 */

// Handelsmarken/Eigenmarken, die als führende Tokens gestrippt werden (erweiterbar,
// wenn weitere Stores angebunden werden). Mehrwort-Marken zuerst prüfen.
const BRAND_PREFIXES = [
    'rewe beste wahl', 'rewe bio', 'rewe to go', 'gut gunstig', 'k classic',
    'ja', 'rewe', 'edeka', 'milbona', 'freshona', 'solevita', 'crownfield',
    'alesto', 'cien', 'lidl', 'penny', 'netto', 'bio',
]

// Substring-Synonyme (nach Lowercase + Umlaut-Folding angewendet) — führen verschiedene
// Schreibweisen desselben Worts zusammen. Compound-sicher ("tomatensauce" → "tomatensosse").
const SYNONYMS: [RegExp, string][] = [
    [/sauce/g, 'sosse'],
    [/jogurt/g, 'joghurt'],
    [/yoghurt/g, 'joghurt'],
    [/ketschup/g, 'ketchup'],
    [/spagetti/g, 'spaghetti'],
]

// Tokens, die reine Mengen-/Größenangaben sind: "500g", "0,5l", "6x", "10er", "3,5%", "xxl" …
const QUANTITY_TOKEN = /^(\d+([.,]\d+)?(g|kg|l|ml|cl|er|x|stk|st|pack|pck|dose|ds)?|x?x*l|%|\d+([.,]\d+)?%)$/

/**
 * Normalisiert einen Bon-Rohtext zu einer Matching-Form:
 * lowercase → Umlaut/ß-Folding → Synonyme falten → Sonderzeichen raus →
 * Mengen-Tokens raus → Marken-Präfix strippen → Whitespace kollabieren.
 */
export function normalizeProductName(raw: string): string {
    let s = raw.toLowerCase()
    s = s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    for (const [re, repl] of SYNONYMS) s = s.replace(re, repl)
    // Sonderzeichen zu Leerzeichen ("JA!" → "ja", "CAR.CRISPY" → "car crispy", "H-MILCH" → "h milch")
    s = s.replace(/[^a-z0-9]+/g, ' ').trim()

    let tokens = s.split(' ').filter((t) => t && !QUANTITY_TOKEN.test(t))

    // Führende Marken-Tokens strippen (Mehrwort-Marken zuerst) — aber nie den ganzen Namen.
    let stripped = true
    while (stripped && tokens.length > 1) {
        stripped = false
        for (const brand of BRAND_PREFIXES) {
            const brandTokens = brand.split(' ')
            if (
                tokens.length > brandTokens.length &&
                brandTokens.every((bt, i) => tokens[i] === bt)
            ) {
                tokens = tokens.slice(brandTokens.length)
                stripped = true
                break
            }
        }
    }

    return tokens.join(' ')
}

/** Anzeigename für ein neu angelegtes Produkt ("gehackte tomaten" → "Gehackte Tomaten"). */
export function prettyProductName(normalized: string): string {
    return normalized
        .split(' ')
        .map((t) => (t.length > 1 ? t[0].toUpperCase() + t.slice(1) : t.toUpperCase()))
        .join(' ')
}

/**
 * Ähnlichkeit zweier normalisierter Namen als Zeichen-Bigramm-Dice-Koeffizient (0..1).
 * Bigramme auf dem Leerzeichen-freien String, damit Compound-Varianten matchen
 * ("cherryromatomate" vs. "cherry roma tomate" → 1.0).
 */
export function similarity(a: string, b: string): number {
    const s1 = a.replace(/\s+/g, '')
    const s2 = b.replace(/\s+/g, '')
    if (!s1 || !s2) return 0
    if (s1 === s2) return 1

    const bigrams = (s: string) => {
        const map = new Map<string, number>()
        for (let i = 0; i < s.length - 1; i++) {
            const bg = s.slice(i, i + 2)
            map.set(bg, (map.get(bg) || 0) + 1)
        }
        return map
    }
    const b1 = bigrams(s1)
    const b2 = bigrams(s2)
    let overlap = 0
    for (const [bg, count] of b1) overlap += Math.min(count, b2.get(bg) || 0)
    const total = (s1.length - 1) + (s2.length - 1)
    return total === 0 ? 0 : (2 * overlap) / total
}

/** Schwelle, ab der ein Fuzzy-Treffer als dasselbe Produkt gilt. */
export const SIMILARITY_THRESHOLD = 0.85
