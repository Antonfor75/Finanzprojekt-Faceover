import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

/**
 * Symmetrische Verschlüsselung für sensible Zugangsdaten (Gmail-App-Passwort,
 * später OAuth-Refresh-Token), die pro User in `email_connections.secret_encrypted`
 * gespeichert werden. AES-256-GCM (authentifiziert).
 *
 * Der Schlüssel kommt aus der Env-Variable CREDENTIALS_ENCRYPTION_KEY und muss
 * 32 Byte lang sein — als 64-stelliger Hex-String oder Base64. Einen passenden
 * Schlüssel erzeugt man z. B. mit:  openssl rand -hex 32
 *
 * Format des Rückgabestrings: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 */

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // GCM-Standard: 96 Bit

function getKey(): Buffer {
    const raw = process.env.CREDENTIALS_ENCRYPTION_KEY
    if (!raw) {
        throw new Error('CREDENTIALS_ENCRYPTION_KEY fehlt in den Umgebungsvariablen.')
    }

    // Hex (64 Zeichen) bevorzugt, sonst Base64 versuchen.
    let key: Buffer
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
        key = Buffer.from(raw, 'hex')
    } else {
        key = Buffer.from(raw, 'base64')
    }

    if (key.length !== 32) {
        throw new Error('CREDENTIALS_ENCRYPTION_KEY muss 32 Byte lang sein (z. B. `openssl rand -hex 32`).')
    }
    return key
}

export function encryptSecret(plain: string): string {
    const key = getKey()
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, key, iv)
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptSecret(payload: string): string {
    const key = getKey()
    const [ivHex, tagHex, dataHex] = payload.split(':')
    if (!ivHex || !tagHex || !dataHex) {
        throw new Error('Ungültiges Format des verschlüsselten Secrets.')
    }
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(dataHex, 'hex')),
        decipher.final(),
    ])
    return decrypted.toString('utf8')
}
