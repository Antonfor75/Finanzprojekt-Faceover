import { describe, it, expect } from 'vitest'
import { inviteStatus, parseMaxUses, personenLabel, normalizeCode, generateCode } from './inviteCode'

const NOW = new Date('2026-10-09T12:00:00Z')

describe('inviteStatus', () => {
    it('neuer Einmal-Code ist offen', () => {
        expect(inviteStatus({ max_uses: 1, use_count: 0 }, NOW)).toEqual({ status: 'open', used: 0, maxUses: 1, remaining: 1 })
    })

    it('Mehrfach-Code mit Restplätzen ist offen', () => {
        const s = inviteStatus({ max_uses: 5, use_count: 3 }, NOW)
        expect(s.status).toBe('open')
        expect(s.remaining).toBe(2)
    })

    it('voller Code ist ausgeschöpft', () => {
        expect(inviteStatus({ max_uses: 2, use_count: 2, used_at: '2026-10-01' }, NOW).status).toBe('exhausted')
        expect(inviteStatus({ max_uses: 2, use_count: 2 }, NOW).status).toBe('exhausted')
    })

    it('Altbestand mit nur used_at zählt als 1/1 ausgeschöpft', () => {
        expect(inviteStatus({ used_at: '2026-08-06' }, NOW)).toEqual({ status: 'exhausted', used: 1, maxUses: 1, remaining: 0 })
    })

    it('abgelaufen, solange noch Plätze frei wären', () => {
        expect(inviteStatus({ max_uses: 3, use_count: 1, expires_at: '2026-10-01T00:00:00Z' }, NOW).status).toBe('expired')
    })

    it('ausgeschöpft hat Vorrang vor abgelaufen', () => {
        expect(inviteStatus({ max_uses: 1, use_count: 1, expires_at: '2026-10-01T00:00:00Z' }, NOW).status).toBe('exhausted')
    })

    it('erfasste Einlösungen zählen, wenn use_count hinterherhängt', () => {
        expect(inviteStatus({ max_uses: 5, use_count: 0 }, NOW, 2).used).toBe(2)
    })

    it('zeigt nie mehr als max_uses an', () => {
        expect(inviteStatus({ max_uses: 2, use_count: 7 }, NOW).used).toBe(2)
    })
})

describe('parseMaxUses', () => {
    it('akzeptiert 1 bis 100', () => {
        expect(parseMaxUses(1)).toBe(1)
        expect(parseMaxUses('10')).toBe(10)
        expect(parseMaxUses(100)).toBe(100)
        expect(parseMaxUses(undefined)).toBe(1)
    })
    it('lehnt Unsinn ab', () => {
        expect(parseMaxUses(0)).toBeNull()
        expect(parseMaxUses(101)).toBeNull()
        expect(parseMaxUses(2.5)).toBeNull()
        expect(parseMaxUses('abc')).toBeNull()
    })
})

describe('Hilfsfunktionen', () => {
    it('personenLabel', () => {
        expect(personenLabel(1)).toBe('1 Person')
        expect(personenLabel(5)).toBe('5 Personen')
    })
    it('normalizeCode verträgt Tippvarianten', () => {
        expect(normalizeCode(' abcd ef23 ')).toBe('ABCD-EF23')
    })
    it('generateCode hat das Format XXXX-XXXX', () => {
        expect(generateCode()).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    })
})
