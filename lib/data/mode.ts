// Datenmodus der App: 'live' (Supabase) oder 'demo' (nur localStorage).
//
// Bewusst ein Modul-Schalter statt Context: so laufen ALLE Datenzugriffe — auch
// die in Hilfsfunktionen außerhalb von React — über dieselbe Weiche. Die Demo-Seite
// schaltet ihn vor dem ersten Rendern ein; verlassen wird die Demo immer per
// vollem Seitenwechsel, damit der Schalter nie in die echte App hinüberwandert.
type DataMode = 'live' | 'demo'

let mode: DataMode = 'live'

export function isDemoMode(): boolean {
    return mode === 'demo'
}

export function enableDemoMode(): void {
    mode = 'demo'
}

export function disableDemoMode(): void {
    mode = 'live'
}
