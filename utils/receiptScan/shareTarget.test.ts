import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import manifest from '@/app/manifest'
import {
    isShareFresh, parseShareStatus, pickReceiptFiles, shareStatusMessage, shareTargetManifest, withoutShareParam,
    SHARE_ACTION, SHARE_DB, SHARE_FIELD, SHARE_MAX_AGE_MS, SHARE_STORE,
} from './shareTarget'

describe('Manifest', () => {
    it('enthält share_target für Fotos und PDFs per POST (multipart)', () => {
        const target = manifest().share_target
        expect(target).toBeDefined()
        expect(target?.action).toBe('/share-receipt')
        expect(target?.method).toBe('POST')
        expect(target?.enctype).toBe('multipart/form-data')
        expect(target?.params.files).toEqual([{ name: 'files', accept: ['image/*', 'application/pdf'] }])
    })

    it('Aktion liegt im Geltungsbereich der App (start_url "/")', () => {
        expect(shareTargetManifest().action.startsWith('/')).toBe(true)
        expect(manifest().start_url).toBe('/')
    })
})

describe('Service Worker passt zu shareTarget.ts', () => {
    const sw = readFileSync(path.join(__dirname, '../../public/service-worker.js'), 'utf8')
    it.each([
        ['Adresse', SHARE_ACTION],
        ['Feldname', SHARE_FIELD],
        ['Datenbank', SHARE_DB],
        ['Speicher', SHARE_STORE],
    ])('%s: %s', (_label, value) => {
        expect(sw).toContain(`'${value}'`)
    })
})

describe('parseShareStatus / withoutShareParam', () => {
    it('erkennt die Werte, die der Service Worker setzt', () => {
        expect(parseShareStatus('?share=ok')).toBe('ok')
        expect(parseShareStatus('?share=empty')).toBe('empty')
        expect(parseShareStatus('?share=error')).toBe('error')
        expect(parseShareStatus('?share=unsupported')).toBe('unsupported')
    })
    it('ignoriert alles andere', () => {
        expect(parseShareStatus('')).toBeNull()
        expect(parseShareStatus('?share=1')).toBeNull()
        expect(parseShareStatus('?foo=bar')).toBeNull()
    })
    it('entfernt nur den Parameter', () => {
        expect(withoutShareParam('https://x.de/?share=ok')).toBe('/')
        expect(withoutShareParam('https://x.de/?a=1&share=ok#h')).toBe('/?a=1#h')
    })
    it('hat zu jedem Fehlerstatus einen deutschen Hinweis', () => {
        for (const s of ['empty', 'error', 'unsupported'] as const) expect(shareStatusMessage(s).length).toBeGreaterThan(10)
    })
})

describe('pickReceiptFiles', () => {
    const file = (name: string, type: string) => new File(['x'], name, { type })
    it('behält Fotos und PDFs, wirft den Rest weg', () => {
        const out = pickReceiptFiles([file('a.jpg', 'image/jpeg'), file('b.pdf', 'application/pdf'), file('c.txt', 'text/plain'), file('d.zip', 'application/zip')])
        expect(out.map((f) => f.name)).toEqual(['a.jpg', 'b.pdf'])
    })
    it('erkennt ein PDF ohne Typ an der Endung und setzt den Typ', () => {
        const out = pickReceiptFiles([file('Kassenbon.PDF', ''), file('x.pdf', 'application/octet-stream'), file('y.bin', 'application/octet-stream')])
        expect(out.map((f) => f.name)).toEqual(['Kassenbon.PDF', 'x.pdf'])
        expect(out.every((f) => f.type === 'application/pdf')).toBe(true)
    })
    it('leere Liste bleibt leer', () => {
        expect(pickReceiptFiles([])).toEqual([])
    })
})

describe('isShareFresh', () => {
    const now = Date.parse('2026-10-20T12:00:00Z')
    it('frisch bis zur Höchstdauer', () => {
        expect(isShareFresh(now - 1000, now)).toBe(true)
        expect(isShareFresh(now - SHARE_MAX_AGE_MS, now)).toBe(true)
    })
    it('zu alt oder aus der Zukunft → verwerfen', () => {
        expect(isShareFresh(now - SHARE_MAX_AGE_MS - 1, now)).toBe(false)
        expect(isShareFresh(now + 1000, now)).toBe(false)
    })
})
