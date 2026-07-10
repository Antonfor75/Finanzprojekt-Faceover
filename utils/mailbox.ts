import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'

/**
 * Austauschbares Mail-Abruf-Modul (IMAP).
 *
 * Zweck: das verbundene Postfach öffnen und die REWE-eBon-Mails heraussuchen.
 * Bewusst schmale Schnittstelle — ein späterer OAuth-/Gmail-API-Weg würde nur
 * dieses Modul betreffen, nicht den Sync-Kern (lib/reweSync.ts) oder den Parser.
 *
 * Gmail-IMAP: imap.gmail.com:993 (TLS). Login mit E-Mail + 16-stelligem
 * Google-App-Passwort (kein normales Passwort). 2FA muss aktiv sein.
 */

// Fester Gmail-IMAP-Endpunkt.
const GMAIL_IMAP_HOST = 'imap.gmail.com'
const GMAIL_IMAP_PORT = 993

/**
 * Suchkriterien für REWE-eBon-Mails.
 * Bestätigt: Absender ist `ebon@mailing.rewe.de`, Betreff „Dein REWE eBon vom TT.MM.JJJJ".
 * Breit gefasst gehalten (Absender enthält "rewe" ODER Betreff enthält "eBon"/…), damit
 * kleine Format-Änderungen nicht sofort brechen. Nicht passende Treffer verwirft der Parser
 * ohnehin (kein Gesamtbetrag erkennbar).
 */
export const REWE_FROM_HINTS = ['rewe']
export const REWE_SUBJECT_HINTS = ['eBon', 'Kassenbon', 'Einkauf']

export type ReweMailAttachment = {
    filename: string | undefined
    contentType: string | undefined
    content: Buffer
}

export type ReweMailMessage = {
    /** RFC822 Message-ID — stabiler Idempotenz-Schlüssel für die Deduplizierung. */
    messageId: string
    subject: string
    /** Zeitpunkt aus dem Date-Header der Mail (Fallback fürs Bon-Datum). */
    date: Date | null
    text: string
    html: string
    attachments: ReweMailAttachment[]
}

export type MailboxCredentials = {
    email: string
    /** Klartext-App-Passwort (in reweSync erst kurz vor Nutzung entschlüsselt). */
    password: string
}

function buildImapClient(creds: MailboxCredentials): ImapFlow {
    return new ImapFlow({
        host: GMAIL_IMAP_HOST,
        port: GMAIL_IMAP_PORT,
        secure: true,
        auth: { user: creds.email, pass: creds.password },
        logger: false,
        // Kürzere Timeouts, damit ein hängendes Postfach den Cron nicht blockiert.
        greetingTimeout: 15000,
        socketTimeout: 60000,
    })
}

/**
 * Verifiziert die Zugangsdaten mit einem echten IMAP-Login (Connect + Logout).
 * Wird von der "Verbinden"-Action genutzt, um falsche Daten sofort zu melden.
 * Wirft bei ungültigen Zugangsdaten.
 */
export async function verifyMailboxLogin(creds: MailboxCredentials): Promise<void> {
    const client = buildImapClient(creds)
    await client.connect()
    await client.logout()
}

/**
 * Ermittelt den "Alle Nachrichten"/"All Mail"-Ordner über das IMAP-Sonderflag \All
 * statt über den (sprachabhängigen) Namen — funktioniert damit unabhängig von der
 * Gmail-Sprache. Fällt auf INBOX zurück, falls kein solcher Ordner existiert
 * (z. B. bei Nicht-Gmail-IMAP-Servern).
 *
 * Wichtig: Gmail-Filter können Mails "am Posteingang vorbei" direkt in ein Label
 * einsortieren (Regel "Posteingang überspringen"). Solche Mails fehlen in INBOX
 * komplett, tauchen aber immer in "Alle Nachrichten" auf.
 */
async function resolveSearchMailbox(client: ImapFlow): Promise<string> {
    try {
        const boxes = await client.list()
        const allMail = boxes.find((b) => b.specialUse === '\\All')
        return allMail?.path || 'INBOX'
    } catch {
        return 'INBOX'
    }
}

/**
 * Durchsucht "Alle Nachrichten" (Fallback: INBOX) nach REWE-eBon-Mails seit `since`.
 * Deduplizierung/Parsing passiert im Aufrufer (lib/reweSync.ts).
 */
export async function fetchReweMessages(
    creds: MailboxCredentials,
    since?: Date,
): Promise<ReweMailMessage[]> {
    const client = buildImapClient(creds)
    const results: ReweMailMessage[] = []

    await client.connect()
    const mailbox = await resolveSearchMailbox(client)
    const lock = await client.getMailboxLock(mailbox)
    try {
        // Kriterium: (Absender enthält eines der FROM_HINTS) ODER (Betreff enthält eines der SUBJECT_HINTS),
        // optional eingeschränkt auf Mails seit `since`.
        const or = [
            ...REWE_FROM_HINTS.map((h) => ({ from: h })),
            ...REWE_SUBJECT_HINTS.map((h) => ({ subject: h })),
        ]
        const criteria: Record<string, unknown> = { or }
        if (since) criteria.since = since

        // imapflow erwartet SearchObject; unsere dynamisch gebauten Kriterien sind gültig.
        const uids = (await client.search(criteria as never, { uid: true })) || []
        if (uids.length === 0) return results

        for await (const msg of client.fetch(uids, { source: true }, { uid: true })) {
            if (!msg.source) continue
            const parsed = await simpleParser(msg.source)

            const attachments: ReweMailAttachment[] = (parsed.attachments || []).map((a) => ({
                filename: a.filename,
                contentType: a.contentType,
                content: a.content as Buffer,
            }))

            results.push({
                // Fallback auf UID, falls (selten) keine Message-ID vorhanden ist —
                // so bleibt der Dedup-Schlüssel trotzdem eindeutig pro Postfach.
                messageId: parsed.messageId || `uid:${creds.email}:${msg.uid}`,
                subject: parsed.subject || '',
                date: parsed.date || null,
                text: parsed.text || '',
                html: typeof parsed.html === 'string' ? parsed.html : '',
                attachments,
            })
        }
    } finally {
        lock.release()
        await client.logout()
    }

    return results
}
