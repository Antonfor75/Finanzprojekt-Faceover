import { describe, it, expect } from 'vitest'
import { normalizeProductName, prettyProductName, similarity, SIMILARITY_THRESHOLD } from './productNormalize'

describe('normalizeProductName', () => {
    it('strippt die Eigenmarke JA! (Kern des Store-übergreifenden Matchings)', () => {
        expect(normalizeProductName('JA! TOMATENSOSSE')).toBe('tomatensosse')
    })

    it('faltet sauce→sosse, auch im Compound (Lidl-Variante matcht REWE-Variante)', () => {
        expect(normalizeProductName('TOMATENSAUCE')).toBe('tomatensosse')
        expect(normalizeProductName('JA! TOMATENSOSSE')).toBe(normalizeProductName('TOMATENSAUCE'))
    })

    it('entfernt Mengen-/Größenangaben', () => {
        expect(normalizeProductName('GEHACKTE TOMATEN 500G')).toBe('gehackte tomaten')
        expect(normalizeProductName('MOZZARELLA 45%')).toBe('mozzarella')
        expect(normalizeProductName('JA! JOGHURT 1,5%')).toBe('joghurt')
    })

    it('faltet Umlaute/ß und Schreibvarianten', () => {
        expect(normalizeProductName('SOßE SÜß')).toBe('sosse suess')
        expect(normalizeProductName('JOGURT NATUR')).toBe('joghurt natur')
    })

    it('behandelt Sonderzeichen als Trenner (echte Bon-Namen)', () => {
        expect(normalizeProductName('CAR.CRISPY CHOC')).toBe('car crispy choc')
        expect(normalizeProductName('WELLENSCHN.POMME')).toBe('wellenschn pomme')
    })

    it('strippt nie den kompletten Namen (Marke allein bleibt erhalten)', () => {
        expect(normalizeProductName('REWE')).toBe('rewe')
    })

    it('Mehrwort-Marke wird komplett gestrippt', () => {
        expect(normalizeProductName('REWE BESTE WAHL LASAGNE')).toBe('lasagne')
    })
})

describe('prettyProductName', () => {
    it('kapitalisiert die Tokens', () => {
        expect(prettyProductName('gehackte tomaten')).toBe('Gehackte Tomaten')
    })
})

describe('similarity', () => {
    it('identische Strings → 1', () => {
        expect(similarity('tomatensosse', 'tomatensosse')).toBe(1)
    })

    it('Compound- vs. getrennte Schreibweise matcht über der Schwelle', () => {
        expect(similarity('cherryromatomate', 'cherry roma tomate')).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD)
    })

    it('verschiedene Produkte bleiben klar unter der Schwelle', () => {
        expect(similarity('tomatensosse', 'gehackte tomaten')).toBeLessThan(SIMILARITY_THRESHOLD)
        expect(similarity('joghurt natur', 'kartoffeln bio')).toBeLessThan(SIMILARITY_THRESHOLD)
    })

    it('leere Strings → 0', () => {
        expect(similarity('', 'abc')).toBe(0)
    })
})
