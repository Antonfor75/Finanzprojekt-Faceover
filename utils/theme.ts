
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
        background: '#f8f5e6', // paper
        foreground: '#1f2937', // gray-800
        primary: '#3b82f6',    // blue-500
        primaryForeground: '#ffffff',
        muted: '#f1f5f9',      // slate-100
        mutedForeground: '#475569', // slate-600
        border: '#e2e8f0'      // slate-200
    }
}

export const applyTheme = (themeName: string) => {
    // We now use data-theme attribute on root
    const root = document.documentElement

    // Save to local storage
    localStorage.setItem('theme', themeName)

    if (themeName === 'pink') {
        root.setAttribute('data-theme', 'pink')
    } else {
        root.removeAttribute('data-theme') // Default is Paper (no attribute)
    }
}

export const loadTheme = () => {
    if (typeof window === 'undefined') return
    const saved = localStorage.getItem('theme') || 'paper'
    applyTheme(saved)
}
