// Datenmodus der App: 'live' (Supabase) oder 'demo' (nur localStorage).
//
// Bewusst ein Modul-Schalter statt Context: so laufen ALLE Datenzugriffe — auch
// die in Hilfsfunktionen außerhalb von React — über dieselbe Weiche. Die Demo-Seite
// schaltet ihn vor dem ersten Rendern ein; verlassen wird die Demo immer per
// vollem Seitenwechsel, damit der Schalter nie in die echte App hinüberwandert.
type DataMode = 'live' | 'demo'

let mode: DataMode = 'live'

// Der Demo-Client wird von der Demo-Seite übergeben, statt hier fest importiert zu
// werden — so landet der Demo-Code (Beispieldaten, localStorage-Nachbau) nicht im
// Paket der echten App. Demo-Modus ohne Client ist dadurch gar nicht einschaltbar.
let demoClient: (() => unknown) | null = null

export function isDemoMode(): boolean {
    return mode === 'demo'
}

export function enableDemoMode(getClient: () => unknown): void {
    demoClient = getClient
    mode = 'demo'
}

/** Nur im Demo-Modus aufrufen (siehe utils/supabase.ts). */
export function getRegisteredDemoClient(): unknown {
    if (!demoClient) throw new Error('Demo-Modus ohne Demo-Client')
    return demoClient()
}

export function disableDemoMode(): void {
    mode = 'live'
}
