import { MetadataRoute } from 'next'
import { shareTargetManifest } from '@/utils/receiptScan/shareTarget'

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
        // "Teilen" aus anderen Apps (z. B. Kaufland-Bon als PDF): Ablauf in utils/receiptScan/shareTarget.ts.
        // Nur freigeschaltete Konten nehmen den Bon an, alle anderen sehen einen Hinweis.
        share_target: shareTargetManifest(),
    }
}
