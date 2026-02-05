'use client'

import { useEffect } from 'react'

export default function SWRegister() {
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker
                .register('/service-worker.js')
                .then((reg) => console.log('Service Worker registered', reg))
                .catch((err) => console.error('Service Worker registration failed', err))
        }
    }, [])

    return null
}
