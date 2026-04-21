# Projektregeln & Richtlinien 🚧

Hier werden wichtige Regeln, Architektur-Entscheidungen und Best Practices für dieses Projekt (Finanzenprojekt) dokumentiert. Diese Datei dient als "Brain" für die wichtigsten Richtlinien.

## 🎨 Design & UI (Themes, Dark Mode & Glassmorphism)
- **Theme-System:** Das Projekt nutzt ein lokalisiertes Theme-System (z. B. "Pink Premium", "Paper"). Neue Komponenten müssen Theme-Variablen (CSS Custom Properties) verwenden.
- **Dark Mode:** Implementierung über Tailwind v4 Dark Variant.
- **Glassmorphism:** Wir nutzen "Frosted Glass"-Effekte (z.B. über `backdrop-blur-*` Klassen in Tailwind) für ein modernes, hochwertiges Aussehen.
- **Keine Platzhalter-Farben:** Vermeide reine Farben wie `red-500` oder `blue-500` ohne Bedacht; Nutze abgestimmte Farbpaletten und die im System definierten Variablen.

## 🧮 Finanz-Logik (Girokonto & Budget)
- **Girokonto-Berechnung:** Die Berechnung erfolgt *tagesgenau* ("Bottom-Up" Ansatz via `calculateGirokontoTimeline`). Das bedeutet, Einnahmen und Ausgaben werden Tag für Tag iteriert, nicht einfach nur in Monats- oder Wochenblocks geschätzt.
- **Wochen-Budget:** Die Umrechnung von fixen Monatsbudgets auf Wochenbudgets basiert in der Regel (wo anwendbar) auf dem Faktor `4.33`.
- **Datenkonsistenz:** Analyse-Charts und Metriken müssen immer mit den exakten täglichen Berechnungen des Girokontos synchronisiert sein.

## 🛠️ Technologien
- **Framework:** Next.js, React, TypeScript.
- **Styling:** Tailwind CSS zusammen mit zentralen CSS-Styles in der `globals.css` für unsere CSS-Variablen.

## 📝 Allgemeine Entwicklungsregeln
1. **TypeScript First:** Neue Komponenten und Utilities müssen sicher typisiert sein.
2. **SEO & PWA:** Bei neuen Seiten auf Meta-Tags und korrekte Heading-Struktur achten. (PWA Basics via manifest.json sind integriert).
3. **Commit-Nachrichten:** Beschreibend und klar formulieren.
4. *(Dein Platz für persönliche Regeln: z.B. "Jeden Dienstag Backups prüfen")*

---
> **Hinweis:** Aktualisiere diese Liste, sobald wir neue Muster oder signifikante Änderungen in der Architektur einführen.
Design & UI (Tailwind CSS)
- **Framework:** Nutze ausschließlich Tailwind CSS. Keine externen CSS-Dateien, kein SCSS.
- **Formensprache & Shapes:**
  - Wir nutzen ein modernes Design. Verwende oft abgerundete Ecken (`rounded-xl`, `rounded-2xl`).
  - Für besondere, dynamische Formen (wie abgewinkelte Container oder spezielle Header) nutze Tailwind's Arbitrary Values mit Clip-Path, z.B. `clip-path-[polygon(...)]`.
- **Konsistenz:** Halte dich an bestehende Farbschemata (z.B. `bg-primary-500`) und nutze Flexbox (`flex`, `flex-col`) oder CSS Grid für Layouts.
- **Responsive Design:** Die App MUSS Mobile-First entwickelt werden. Nutze Breakpoints (`md:`, `lg:`) sinnvoll, sodass Tabellen auf Handys scrollbar sind und Grids sich untereinander stapeln.