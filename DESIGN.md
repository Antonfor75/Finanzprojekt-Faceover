# 🎨 Design System & Richtlinien

Dieses Dokument dient als zentrale Anlaufstelle für alle UI- und Design-Entscheidungen des Projekts. Es definiert den Look & Feel und sorgt dafür, dass das Frontend konsistent bleibt.

## 🍎 Formensprache & Stil (Apple Style / Flat Design)
- **Genereller Vibe:** Minimalistisch, zentriert, aufgeräumt (Apple-like).
- **Rundungen:** Wir nutzen starke Abrundungen. Für große Container und Cards `rounded-3xl` oder `rounded-[2rem]`. Für Buttons und Inputs `rounded-2xl` (oder teilweise `rounded-full` für wichtige Call-to-Actions).
- **Inputs & Controls:** Wir nutzen **Flat Design**. Keine starken 3D-Schatten (Neumorphism), keine extremen Verläufe. 
- **Apple Focus Ring:** Alle interaktiven Eingabefelder haben bei Fokus einen klaren, eleganten Ring, der durch den Hintergrund abgesetzt ist (z.B. via `focus:border-transparent focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background`).
- **Symmetrie:** Elemente im Apple-Stil sind häufig symmetrisch angeordnet. Großzügiges Whitespace (Padding) ist wichtig.

## ✍️ Typografie
- **Headlines / Markenname:** Für einen edlen, hochwertigen Look nutzen wir dünne und weit gesperrte Schriften bei prominenten Überschriften (z.B. `font-light tracking-widest`).

## 🎑 Hintergründe & Dynamik
- **Lebendige, animierte Hintergründe:** Statt statischen Fotos nutzen wir weiche, weichgezeichnete, schwebende Farbflächen ("Blobs" oder "Gradients" mit `blur-3xl`, `mix-blend-multiply` und sanften Animations-Utilities wie `animate-pulse`), um die App lebendig, aber stilvoll (Apple-Vibe) wirken zu lassen.
- **Glassmorphism:** Erreicht man im Apple-Stil am besten mit `bg-white/70 backdrop-blur-xl border border-white/40 shadow-xl`, oftmals über diesen lebendigen/atmenden Hintergründen platziert.

## 🖌️ Farb-Konzepte (Theming System)
Wir arbeiten mit CSS-Variablen in der `globals.css`. Dadurch können wir Layouts rein mit Tailwind Utility-Klassen bauen (z.B. `bg-primary`, `text-foreground`) und die tatsächliche Farbe wird vom aktiven Theme gesteuert.

Um ein **neues Konzept** hinzuzufügen, musst du nur einen neuen Block in der `globals.css` anlegen (z.B. `:root[data-theme='ocean']`).

### Theme 1: "Pink Rose" (Aktueller Standard)
Eine sanfte, rosa/florale Farbwelt.
- **Background (`--bg-background`):** Zartes Rosé (`#fff0f5`)
- **Primary (`--color-primary`):** Warmes, kräftiges Rosé (`#d67b93`)
- **Text (`--text-foreground`):** Dunkles Braun/Grau für sanften Kontrast (`#4a3a3e`)
- **Muted/Inputs (`--bg-muted`):** Sehr weiches Pink (`#fae8ed`)

### Theme 2: "Space Black" (Vorhalte für Dark-Mode Apple Style)
*(Beispielhaft: Hier können wir später tiefschwarze Hintergründe und weiße/graue Akzente definieren).*
