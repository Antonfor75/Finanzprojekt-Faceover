// Betreiberangaben für Impressum und Datenschutzerklärung — an EINER Stelle,
// damit beide Seiten nie auseinanderlaufen.
export const OPERATOR = {
    name: 'Anton Forster',
    street: 'Graf-Anton-Weg 12',
    city: '88069 Tettnang',
    country: 'Deutschland',
    email: 'protakoras02@gmail.com',
} as const

// Stand der Datenschutzerklärung. Bei inhaltlichen Änderungen hochzählen —
// eingeloggte Nutzer bekommen dann einmalig den Hinweis zum Bestätigen.
export const PRIVACY_VERSION = '2026-10'
export const PRIVACY_DATE = '8. Oktober 2026'

/** Hat der Nutzer die aktuelle Fassung schon zur Kenntnis genommen? */
export function hasAcceptedCurrentPrivacy(metadata: Record<string, unknown> | null | undefined): boolean {
    return metadata?.privacy_version === PRIVACY_VERSION
}
