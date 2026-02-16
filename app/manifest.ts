import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Mein Cashflow',
        short_name: 'Cashflow',
        description: 'Tracke deine Ausgaben und Einnahmen',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
            {
                src: '/app-icon.png',
                sizes: '512x512',
                type: 'image/png',
            },
        ],
    }
}
