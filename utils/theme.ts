
export type ThemeColors = {
    background: string
    foreground: string
    primary: string
    primaryForeground: string
    muted: string
    mutedForeground: string
    border: string
}

// Helper to get variables based on active theme
// Note: This returns the definition, but in CSS variables are handled by the browser.
// This is mainly for JS-side usages if needing explicit hex codes.
export const getThemeVariables = (themeName: string): ThemeColors => {
    if (themeName === 'pink') {
        return {
            background: '#fdf2f8', // light pink
            foreground: '#1f2937', // gray-800
            primary: '#ee2b8c',    // Stitch Token
            primaryForeground: '#ffffff',
            muted: '#fce7f3',      // muted pink
            mutedForeground: '#be185d', // dark pink
            border: '#fbcfe8'      // border pink
        }
    }
    // Default: Paper
    return {
        background: '#f0f9ff', // sky-50
        foreground: '#0f172a', // slate-900
        primary: '#0ea5e9',    // sky-500
        primaryForeground: '#ffffff',
        muted: '#e0f2fe',      // sky-100
        mutedForeground: '#64748b', // slate-500
        border: '#bae6fd'      // sky-200
    }
}

export const applyTheme = (themeName: string) => {
    // We now use data-theme attribute on root
    const root = document.documentElement

    // Save to local storage
    localStorage.setItem('theme', themeName)

    if (themeName === 'blue') {
        root.setAttribute('data-theme', 'blue')
    } else {
        root.removeAttribute('data-theme') // Default is Pink Premium (no attribute)
    }
}

export const loadTheme = () => {
    if (typeof window === 'undefined') return
    const saved = localStorage.getItem('theme') || 'pink'
    applyTheme(saved)
}
