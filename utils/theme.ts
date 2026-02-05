
export type ThemeColors = {
    background: string
    foreground: string
    primary: string
    primaryForeground: string
    muted: string
    mutedForeground: string
    border: string
}

// Simple brightness calculation to decide between black/white text
const getContrastColor = (hex: string): string => {
    const r = parseInt(hex.substring(1, 3), 16)
    const g = parseInt(hex.substring(3, 5), 16)
    const b = parseInt(hex.substring(5, 7), 16)
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000
    return (yiq >= 128) ? '#000000' : '#ffffff'
}

export const getThemeVariables = (themeName: string): ThemeColors => {
    switch (themeName) {
        case 'pink':
            return {
                background: '#f9a8d4', // pink-300 (Darker bg)
                foreground: '#831843', // pink-900
                primary: '#db2777',    // pink-600
                primaryForeground: '#ffffff',
                muted: '#fbcfe8',      // pink-200
                mutedForeground: '#be185d', // pink-700
                border: '#f9a8d4'      // pink-300
            }
        case 'blue':
            return {
                background: '#93c5fd', // blue-300
                foreground: '#1e3a8a', // blue-900
                primary: '#2563eb',    // blue-600
                primaryForeground: '#ffffff',
                muted: '#bfdbfe',      // blue-200
                mutedForeground: '#1d4ed8', // blue-700
                border: '#93c5fd'      // blue-300
            }
        case 'green':
            return {
                background: '#86efac', // green-300
                foreground: '#14532d', // green-900
                primary: '#16a34a',    // green-600
                primaryForeground: '#ffffff',
                muted: '#bbf7d0',      // green-200
                mutedForeground: '#15803d', // green-700
                border: '#86efac'      // green-300
            }
        case 'yellow':
            return {
                background: '#fde047', // yellow-300
                foreground: '#713f12', // yellow-900
                primary: '#eab308',    // yellow-500
                primaryForeground: '#000000',
                muted: '#fef08a',      // yellow-200
                mutedForeground: '#a16207', // yellow-700
                border: '#fde047'      // yellow-300
            }
        default: // white / paper
            return {
                background: '#f8f5e6',
                foreground: '#333333',
                primary: '#1f2937',    // gray-800
                primaryForeground: '#ffffff',
                muted: '#e5e7eb',      // gray-200
                mutedForeground: '#6b7280', // gray-500
                border: '#d1d5db'      // gray-300
            }
    }
}

export const applyTheme = (themeName: string) => {
    const colors = getThemeVariables(themeName)
    const root = document.documentElement

    root.style.setProperty('--bg-background', colors.background)
    root.style.setProperty('--text-foreground', colors.foreground)
    root.style.setProperty('--color-primary', colors.primary)
    root.style.setProperty('--text-primary-foreground', colors.primaryForeground)
    root.style.setProperty('--bg-muted', colors.muted)
    root.style.setProperty('--text-muted-foreground', colors.mutedForeground)
    root.style.setProperty('--color-border', colors.border)
}
