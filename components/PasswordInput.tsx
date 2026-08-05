'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

/**
 * Passwortfeld mit Auge-Symbol zum Ein-/Ausblenden.
 * Wird überall verwendet, wo ein Passwort eingegeben wird — Login, Registrierung,
 * Passwort-Reset und das Admin-Formular.
 */
export default function PasswordInput({
    id,
    value,
    onChange,
    className = '',
    autoComplete,
    placeholder,
    required,
    minLength,
    autoFocus,
}: {
    id?: string
    value: string
    onChange: (value: string) => void
    className?: string
    autoComplete?: string
    placeholder?: string
    required?: boolean
    minLength?: number
    autoFocus?: boolean
}) {
    const [visible, setVisible] = useState(false)

    return (
        <div className="relative">
            <input
                id={id}
                type={visible ? 'text' : 'password'}
                autoComplete={autoComplete}
                placeholder={placeholder}
                required={required}
                minLength={minLength}
                autoFocus={autoFocus}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={`${className} pr-12`}
            />
            <button
                type="button"
                onClick={() => setVisible(v => !v)}
                aria-label={visible ? 'Passwort verbergen' : 'Passwort anzeigen'}
                aria-pressed={visible}
                title={visible ? 'Passwort verbergen' : 'Passwort anzeigen'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors duration-200"
            >
                {visible
                    ? <EyeOff className="w-4.5 h-4.5" strokeWidth={1.75} />
                    : <Eye className="w-4.5 h-4.5" strokeWidth={1.75} />}
            </button>
        </div>
    )
}
