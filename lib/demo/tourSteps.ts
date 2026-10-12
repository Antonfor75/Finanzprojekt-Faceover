// Schritte der geführten Einführung in der Demo. Ziele sind data-tour-Attribute
// an den echten Komponenten; ohne Ziel erscheint die Karte mittig.
//
// advance:
//   'next'  — weiter per Knopf
//   'click' — der Nutzer tippt selbst auf das markierte Element
//   'input' — „Weiter“ wird erst aktiv, wenn im markierten Feld etwas steht
export type TourStep = {
    id: string
    target?: string
    title: string
    text: string
    advance: 'next' | 'click' | 'input'
}

const t = (name: string) => `[data-tour="${name}"]`

export const TOUR_STEPS: TourStep[] = [
    {
        id: 'welcome',
        title: 'Willkommen bei Mein Cashflow 👋',
        text: 'In zwei Minuten zeige ich dir die wichtigsten Funktionen. Alles hier sind Beispieldaten — probier ruhig alles aus, nichts davon wird gespeichert.',
        advance: 'next',
    },
    {
        id: 'ring',
        target: t('budget-ring'),
        title: 'Dein Wochenbudget',
        text: 'Der Ring zeigt, wie viel du diese Woche noch ausgeben kannst. Er wird aus deinen Einnahmen minus Fixkosten berechnet — Tag für Tag.',
        advance: 'next',
    },
    {
        id: 'daily',
        target: t('daily-budget'),
        title: 'Pro Tag',
        text: 'Hier siehst du, wie viel dir pro Tag bis Wochenende bleibt, wenn du gleichmäßig ausgibst.',
        advance: 'next',
    },
    {
        id: 'add',
        target: t('add-button'),
        title: 'Eine Ausgabe eintragen',
        text: 'Tippe auf das Plus, um deine erste Ausgabe einzutragen.',
        advance: 'click',
    },
    {
        id: 'amount',
        target: t('amount-input'),
        title: 'Betrag eingeben',
        text: 'Gib einen Betrag ein, zum Beispiel 4,50 für einen Kaffee.',
        advance: 'input',
    },
    {
        id: 'category',
        target: t('category-select'),
        title: 'Kategorie wählen',
        text: 'Wähle eine Kategorie — damit sortiert die Analyse später deine Ausgaben. Du kannst auch direkt von einem Sparkonto bezahlen.',
        advance: 'next',
    },
    {
        id: 'save',
        target: t('save-expense'),
        title: 'Speichern',
        text: 'Tippe auf „Ausgabe eintragen“.',
        advance: 'click',
    },
    {
        id: 'ring-after',
        target: t('budget-ring'),
        title: 'Schon verrechnet',
        text: 'Siehst du? Der Ring hat sich sofort angepasst.',
        advance: 'next',
    },
    {
        id: 'fun',
        target: t('fun-tile'),
        title: 'Spaßkonto',
        text: 'Für Urlaube, Konzerte und Geschenke: Das Spaßkonto hat ein eigenes Guthaben, damit Ausreißer nicht dein Wochenbudget sprengen. Ausgaben lassen sich in Gruppen wie „Städtetrip“ bündeln.',
        advance: 'next',
    },
    {
        id: 'giro',
        target: t('giro-card'),
        title: 'Girokonto',
        text: 'Die App rechnet deinen Kontostand Tag für Tag nach. Tippe auf die Karte, um den Verlauf zu sehen.',
        advance: 'click',
    },
    {
        id: 'giro-back',
        target: t('giro-back'),
        title: 'Der Verlauf',
        text: 'Hier siehst du, wie sich dein Konto über die Wochen entwickelt — Gehalt rein, Miete raus. Tippe auf „Zurück“.',
        advance: 'click',
    },
    {
        id: 'history',
        target: t('nav-history'),
        title: 'Historie',
        text: 'Tippe hier, um alle Ausgaben zu sehen.',
        advance: 'click',
    },
    {
        id: 'history-tabs',
        target: t('history-tabs'),
        title: 'Kalender, Liste, Analyse',
        text: 'Im Kalender siehst du jeden Tag, in der Liste kannst du Einträge bearbeiten, und die Analyse zeigt, wohin dein Geld fließt.',
        advance: 'next',
    },
    {
        id: 'settings',
        target: t('nav-settings'),
        title: 'Einstellungen',
        text: 'Tippe auf das Zahnrad.',
        advance: 'click',
    },
    {
        id: 'settings-finance',
        target: t('settings-finance'),
        title: 'Deine Finanzen',
        text: 'Hier legst du Einnahmen, Fixkosten und Sparkonten an. Daraus berechnet die App automatisch dein Budget.',
        advance: 'next',
    },
    {
        id: 'settings-tools',
        target: t('settings-tools'),
        title: 'Import & Backup',
        text: 'Kontoauszüge importieren, ein Backup laden oder einen PDF-Bericht erstellen — alles hier oben.',
        advance: 'next',
    },
    {
        id: 'done',
        title: 'Das war’s! 🎉',
        text: 'Schau dich gern weiter um. Wenn dir die App gefällt, kannst du dir mit einem Einladungscode ein eigenes Konto anlegen.',
        advance: 'next',
    },
]
