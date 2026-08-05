// Passwortregeln — von Registrierung, Passwort-Reset und Admin-Formular geteilt,
// damit Client-Hinweis und Serverprüfung nie auseinanderlaufen.

export const MIN_PASSWORD_LENGTH = 8

/** Gibt eine deutsche Fehlermeldung zurück oder null, wenn das Passwort passt. */
export function validatePassword(password: string): string | null {
    if (password.length < MIN_PASSWORD_LENGTH) {
        return `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`
    }
    return null
}
