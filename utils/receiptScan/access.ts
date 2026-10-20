/**
 * Freischaltung des Kassenbon-Scans. Bewusst eine eigene, winzige Datei: das Dashboard braucht
 * nur diese Prüfung, nicht die übrigen Bon-Regeln aus fields.ts (die gehören in die
 * nachgeladenen Scanner-Pakete).
 */

/** Kassenbon-Scan freigeschaltet? Nur app_metadata zählt — user_metadata kann jeder Nutzer selbst setzen. */
export function hasReceiptScan(user: { app_metadata?: Record<string, unknown> | null } | null | undefined): boolean {
    return user?.app_metadata?.receipt_scan === true
}
