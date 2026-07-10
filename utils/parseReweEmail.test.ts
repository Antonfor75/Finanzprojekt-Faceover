import { describe, it, expect } from 'vitest'
import { parseReweEmail, extractTotalFromText, extractDateFromText } from './parseReweEmail'
import type { ReweMailMessage } from './mailbox'

// Echter REWE-eBon-Mail-Body (Beispiel vom 09.07.2026), leicht gekürzt.
const REAL_BODY = `
Vielen Dank für deinen Einkauf bei REWE.
Sollte diese E-Mail nicht optimal dargestellt werden, klicke bitte hier
Hallo anton,
hier ist der eBon zu deinem Einkauf in Höhe von 1,49 €.
Dein aktuelles Bonus-Guthaben: 0,63 €.
Vielen Dank für deinen Einkauf!
Herzliche Grüße
dein REWE Team
`

function mockMessage(overrides: Partial<ReweMailMessage> = {}): ReweMailMessage {
    return {
        messageId: '<test@mailing.rewe.de>',
        subject: 'Dein REWE eBon vom 09.07.2026',
        date: new Date('2026-07-09T15:38:00'),
        text: REAL_BODY,
        html: '',
        attachments: [],
        ...overrides,
    }
}

describe('parseReweEmail', () => {
    it('erkennt den Gesamtbetrag aus "in Höhe von X,XX €" im Body', async () => {
        const parsed = await parseReweEmail(mockMessage())
        expect(parsed).not.toBeNull()
        expect(parsed!.totalAmount).toBe(1.49)
    })

    it('ignoriert den Bonus-Guthaben-Betrag (0,63 €) als Ablenker', async () => {
        const parsed = await parseReweEmail(mockMessage())
        expect(parsed!.totalAmount).not.toBe(0.63)
    })

    it('nimmt das Bon-Datum aus dem Betreff ("vom 09.07.2026")', async () => {
        const parsed = await parseReweEmail(mockMessage())
        expect(parsed!.receiptDate.startsWith('2026-07-09')).toBe(true)
    })

    it('gibt null zurück, wenn kein Betrag erkennbar ist', async () => {
        const parsed = await parseReweEmail(
            mockMessage({ text: 'Nur ein Newsletter ohne Betrag.', subject: 'REWE Angebote' }),
        )
        expect(parsed).toBeNull()
    })

    it('findet den Betrag im HTML-Body mit echtem ö (Text leer)', async () => {
        const parsed = await parseReweEmail(
            mockMessage({ text: '', html: '<p>Einkauf in Höhe von 12,99 €</p>' }),
        )
        expect(parsed?.totalAmount).toBe(12.99)
    })

    it('findet den Betrag im HTML-Body mit &ouml;/&euro;-Entities', async () => {
        const parsed = await parseReweEmail(
            mockMessage({ text: '', html: '<p>Einkauf in H&ouml;he von 12,99 &euro;</p>' }),
        )
        expect(parsed?.totalAmount).toBe(12.99)
    })
})

describe('extractTotalFromText', () => {
    it('parst deutsches Komma-Format', () => {
        expect(extractTotalFromText('in Höhe von 1,49 €')).toBe(1.49)
    })

    it('parst den SUMME-Wert aus einem PDF-Bon-Text', () => {
        expect(extractTotalFromText('POSTEN ... SUMME EUR 23,47')).toBe(23.47)
    })

    it('parst Tausendertrennzeichen (1.234,56)', () => {
        expect(extractTotalFromText('Gesamtbetrag 1.234,56')).toBe(1234.56)
    })
})

describe('extractDateFromText', () => {
    it('extrahiert TT.MM.JJJJ als ISO (12:00)', () => {
        const iso = extractDateFromText('Dein REWE eBon vom 09.07.2026')
        expect(iso?.startsWith('2026-07-09')).toBe(true)
    })
})
