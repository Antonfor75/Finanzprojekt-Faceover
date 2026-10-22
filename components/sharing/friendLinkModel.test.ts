import { describe, it, expect } from 'vitest'
import type { FriendState } from '@/utils/sharing/types'
import {
    bannerFor, bannerText, canSendRequest, describeLink, letterFor, letterHint, postponedLetters, normalizeHandleInput, settle, OFFLINE_ERROR,
} from './friendLinkModel'

const base: FriendState = { handle: 'anton', friend: null, outgoing: null, incoming: [], unseenShares: 0 }

describe('describeLink', () => {
    it('ohne Verbindung: "Noch nicht verbunden", Knopf "Verbinden"', () => {
        expect(describeLink(base)).toEqual({ kind: 'none', status: 'Noch nicht verbunden', action: 'connect', actionLabel: 'Verbinden', partnerHandle: null })
    })
    it('mit ausgehender Anfrage: wartet auf den Namen, Knopf "Anfrage zurückziehen"', () => {
        const s = { ...base, outgoing: { id: 'r1', handle: 'lena' } }
        expect(describeLink(s)).toEqual({ kind: 'pending', status: 'Anfrage gesendet · wartet auf lena', action: 'cancel', actionLabel: 'Anfrage zurückziehen', partnerHandle: 'lena' })
    })
    it('mit Freund: "Verbunden mit", Knopf "Verbindung trennen"', () => {
        const s = { ...base, friend: { handle: 'lena' } }
        expect(describeLink(s)).toEqual({ kind: 'connected', status: 'Verbunden mit lena', action: 'end', actionLabel: 'Verbindung trennen', partnerHandle: 'lena' })
    })
    it('Freund hat Vorrang vor einer (veralteten) ausgehenden Anfrage', () => {
        const s = { ...base, friend: { handle: 'lena' }, outgoing: { id: 'r1', handle: 'max' } }
        expect(describeLink(s).kind).toBe('connected')
    })
})

describe('normalizeHandleInput / canSendRequest', () => {
    it('trimmt und schreibt klein, entfernt ein führendes @', () => {
        expect(normalizeHandleInput(' @Lena ')).toBe('lena')
        expect(normalizeHandleInput('LENA.k_1')).toBe('lena.k_1')
    })
    it('erlaubt nur gültige Kontonamen (3-20 Zeichen a-z 0-9 . _)', () => {
        expect(canSendRequest('le')).toBe(false)
        expect(canSendRequest('')).toBe(false)
        expect(canSendRequest('lena!')).toBe(false)
        expect(canSendRequest('a'.repeat(21))).toBe(false)
        expect(canSendRequest(' Lena ')).toBe(true)
        expect(canSendRequest('a.b_c')).toBe(true)
    })
})

describe('letterFor', () => {
    const incoming = [
        { id: 'a', handle: 'lena', created_at: '2026-10-01T10:00:00Z' },
        { id: 'b', handle: 'max', created_at: '2026-10-02T10:00:00Z' },
    ]
    it('zeigt die erste offene eingehende Anfrage', () => {
        expect(letterFor({ ...base, incoming })?.id).toBe('a')
    })
    it('kein Brief ohne eingehende Anfrage', () => {
        expect(letterFor(base)).toBeNull()
    })
    it('kein Brief, wenn schon ein Freund besteht (Annehmen wäre abgelehnt)', () => {
        expect(letterFor({ ...base, incoming, friend: { handle: 'x' } })).toBeNull()
    })
})

describe('postponedLetters / letterHint', () => {
    const incoming = [
        { id: 'a', handle: 'lena', created_at: '2026-10-01T10:00:00Z' },
        { id: 'b', handle: 'max', created_at: '2026-10-02T10:00:00Z' },
    ]
    it('kein Hinweis, solange nichts zurückgestellt ist', () => {
        expect(letterHint({ ...base, incoming }, [])).toBeNull()
        expect(letterHint(base, ['a'])).toBeNull()
    })
    it('Hinweis mit Namen bei einer zurückgestellten Anfrage', () => {
        expect(letterHint({ ...base, incoming }, ['a'])).toEqual({ count: 1, text: 'Freundschaftsanfrage von @lena wartet' })
    })
    it('Hinweis mit Anzahl bei mehreren', () => {
        expect(letterHint({ ...base, incoming }, ['a', 'b'])).toEqual({ count: 2, text: '2 Freundschaftsanfragen warten' })
    })
    it('erloschene Anfragen (nicht mehr offen) zählen nicht, mit Freund gibt es keinen Hinweis', () => {
        expect(postponedLetters({ ...base, incoming: [incoming[1]] }, ['a'])).toEqual([])
        expect(letterHint({ ...base, incoming, friend: { handle: 'x' } }, ['a'])).toBeNull()
    })
})

describe('bannerFor / bannerText', () => {
    it('Singular und Plural', () => {
        expect(bannerText('lena', 1)).toBe('lena hat 1 geteilte Ausgabe eingetragen oder geändert')
        expect(bannerText('lena', 3)).toBe('lena hat 3 geteilte Ausgaben eingetragen oder geändert')
    })
    it('Banner nur mit Freund und ungesehenen Teilungen', () => {
        expect(bannerFor(base)).toBeNull()
        expect(bannerFor({ ...base, unseenShares: 2 })).toBeNull()
        expect(bannerFor({ ...base, friend: { handle: 'lena' }, unseenShares: 0 })).toBeNull()
        expect(bannerFor({ ...base, friend: { handle: 'lena' }, unseenShares: 2 })).toEqual({ count: 2, friendHandle: 'lena' })
    })
})

describe('settle', () => {
    it('reicht ein Ergebnis unverändert durch', async () => {
        expect(await settle(Promise.resolve({ ok: true as const, data: 1 }))).toEqual({ ok: true, data: 1 })
        expect(await settle(Promise.resolve({ ok: false as const, error: 'Das bist du selbst.' }))).toEqual({ ok: false, error: 'Das bist du selbst.' })
    })
    it('macht aus einer geworfenen Ausnahme (offline) ein Fehlerergebnis', async () => {
        expect(await settle(Promise.reject(new Error('Failed to fetch')))).toEqual({ ok: false, error: OFFLINE_ERROR })
    })
})
