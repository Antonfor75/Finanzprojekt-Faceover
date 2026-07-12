// Central theme registry. Each theme is a `:root[data-theme='<key>']` block in
// app/globals.css. The default theme ('rose') is the bare `:root` block, so it
// carries no data-theme attribute.

export type ThemeDef = {
    key: string
    label: string
    swatch: string // accent shown in the picker
}

export const THEMES: ThemeDef[] = [
    { key: 'rose', label: 'Rosé', swatch: '#C13D5D' },
    { key: 'blue', label: 'Nordlicht', swatch: '#33618F' },
    { key: 'sage', label: 'Salbei', swatch: '#3E7D5E' },
    { key: 'amber', label: 'Bernstein', swatch: '#A85F2E' },
    { key: 'lavender', label: 'Lavendel', swatch: '#6A5AA0' },
    { key: 'graphite', label: 'Graphit', swatch: '#42424A' },
    { key: 'midnight', label: 'Mitternacht', swatch: '#0E1114' },
]

export const DEFAULT_THEME = 'rose'

const VALID = new Set(THEMES.map(t => t.key))

// Coerce any stored/legacy value to a supported theme key.
const normalize = (key: string | null | undefined): string => {
    if (!key) return DEFAULT_THEME
    if (key === 'pink' || key === 'paper') return DEFAULT_THEME // legacy values
    return VALID.has(key) ? key : DEFAULT_THEME
}

export const getSavedTheme = (): string => {
    if (typeof window === 'undefined') return DEFAULT_THEME
    return normalize(localStorage.getItem('theme'))
}

export const applyTheme = (themeName: string) => {
    if (typeof window === 'undefined') return
    const key = normalize(themeName)
    const root = document.documentElement

    localStorage.setItem('theme', key)

    if (key === DEFAULT_THEME) {
        root.removeAttribute('data-theme') // :root defaults to the rose palette
    } else {
        root.setAttribute('data-theme', key)
    }
}

export const loadTheme = () => {
    if (typeof window === 'undefined') return
    applyTheme(getSavedTheme())
}
