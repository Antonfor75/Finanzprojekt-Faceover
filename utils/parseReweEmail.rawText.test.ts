import { describe, it, expect } from 'vitest'
import { parseReweEmail } from './parseReweEmail'
import type { ReweMailMessage } from './mailbox'

function buildPdf(lines: string[]): Buffer {
    const content =
        'BT /F1 12 Tf 14 TL 50 750 Td ' + lines.map((l) => `(${l}) Tj T*`).join(' ') + ' ET'
    const objs = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ]
    let out = '%PDF-1.4\n'
    const offsets: number[] = []
    objs.forEach((o, i) => {
        offsets.push(out.length)
        out += `${i + 1} 0 obj\n${o}\nendobj\n`
    })
    const xref = out.length
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
    offsets.forEach((o) => (out += String(o).padStart(10, '0') + ' 00000 n \n'))
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
    return Buffer.from(out, 'latin1')
}

function msg(over: Partial<ReweMailMessage>): ReweMailMessage {
    return {
        messageId: '<t@x>',
        subject: 'Dein REWE eBon vom 09.07.2026',
        date: null,
        text: '',
        html: '',
        attachments: [],
        ...over,
    }
}

describe('parseReweEmail', () => {
    it('ohne PDF: Betrag aus Mail-Text, rawText = Mail-Text', async () => {
        const text = 'Danke für Deinen Einkauf in Höhe von 12,34 € bei REWE.'
        const r = await parseReweEmail(msg({ text }))
        expect(r).not.toBeNull()
        expect(r!.totalAmount).toBe(12.34)
        expect(r!.rawText).toContain('Einkauf in Höhe von 12,34 €')
        expect(r!.items).toBeUndefined()
    })

    it('mit PDF: rawText zeilenweise mit \n, items geparst', async () => {
        const pdf = buildPdf(['EUR', 'JA! TOMATENSOSSE 1,49 B', 'SUMME 1,49'])
        const r = await parseReweEmail(
            msg({ attachments: [{ filename: 'ebon.pdf', contentType: 'application/pdf', content: pdf } as ReweMailMessage['attachments'][number]] }),
        )
        expect(r).not.toBeNull()
        expect(r!.totalAmount).toBe(1.49)
        expect(r!.rawText!.split('\n')).toEqual(['EUR', 'JA! TOMATENSOSSE 1,49 B', 'SUMME 1,49'])
        expect(r!.items).toHaveLength(1)
        expect(r!.items![0]).toMatchObject({ nameRaw: 'JA! TOMATENSOSSE', totalPrice: 1.49 })
    })

    it('ohne Betrag: null', async () => {
        expect(await parseReweEmail(msg({ text: 'Hallo, nichts Relevantes.' }))).toBeNull()
    })
})
