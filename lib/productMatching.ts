import { supabaseAdmin } from '@/utils/supabase/admin'
import { normalizeProductName, prettyProductName, similarity, SIMILARITY_THRESHOLD } from '@/utils/productNormalize'

/**
 * Ordnet Bon-Rohnamen kanonischen Produkten zu (store-übergreifend) — der DB-Teil
 * des Matchings. Läuft im Sync-Kontext mit supabaseAdmin, daher explizites userId
 * (Muster wie lib/reweSync.ts).
 *
 * Ablauf pro Name: normalisieren → exakter Alias-Treffer → sonst Fuzzy gegen
 * bestehende Produkte (Alias wird gelernt) → sonst neues Produkt + Alias.
 *
 * Der Matcher lädt Aliasse + Produkte des Users einmalig und matcht danach
 * in-memory — wichtig, weil ein Bon ~10 Artikel hat und der Sync viele Bons
 * verarbeiten kann.
 */
export function createProductMatcher(userId: string) {
    let aliasMap: Map<string, number> | null = null
    let products: { id: number; nameNormalized: string }[] | null = null

    async function ensureLoaded(): Promise<void> {
        if (aliasMap && products) return
        const [aliasRes, productRes] = await Promise.all([
            supabaseAdmin.from('product_aliases').select('alias_normalized, product_id').eq('user_id', userId),
            supabaseAdmin.from('products').select('id, name').eq('user_id', userId),
        ])
        aliasMap = new Map((aliasRes.data || []).map((a) => [a.alias_normalized, a.product_id]))
        products = (productRes.data || []).map((p) => ({ id: p.id, nameNormalized: normalizeProductName(p.name) }))
    }

    async function saveAlias(normalized: string, productId: number): Promise<void> {
        // UNIQUE(user_id, alias_normalized) fängt Races ab — Duplikat-Fehler ignorieren.
        const { error } = await supabaseAdmin
            .from('product_aliases')
            .insert({ user_id: userId, alias_normalized: normalized, product_id: productId })
        if (error && error.code !== '23505') {
            console.warn('[productMatching] Alias speichern fehlgeschlagen:', error.message)
        }
    }

    /** Liefert die product_id zum Rohnamen (legt Produkt/Alias bei Bedarf an); null bei Fehlern. */
    async function match(nameRaw: string): Promise<number | null> {
        const normalized = normalizeProductName(nameRaw)
        if (!normalized) return null
        await ensureLoaded()

        // 1. Exakter Alias-Treffer (Normalfall nach der Lernphase).
        const known = aliasMap!.get(normalized)
        if (known !== undefined) return known

        // 2. Fuzzy gegen bestehende Produkte → besten Treffer über der Schwelle nehmen
        //    und die neue Schreibweise als Alias lernen.
        let best: { id: number; score: number } | null = null
        for (const p of products!) {
            const score = similarity(normalized, p.nameNormalized)
            if (score >= SIMILARITY_THRESHOLD && (!best || score > best.score)) {
                best = { id: p.id, score }
            }
        }
        if (best) {
            await saveAlias(normalized, best.id)
            aliasMap!.set(normalized, best.id)
            return best.id
        }

        // 3. Neues Produkt anlegen.
        const { data: product, error } = await supabaseAdmin
            .from('products')
            .insert({ user_id: userId, name: prettyProductName(normalized) })
            .select('id')
            .single()
        if (error || !product) {
            console.warn('[productMatching] Produkt anlegen fehlgeschlagen:', error?.message)
            return null
        }
        await saveAlias(normalized, product.id)
        aliasMap!.set(normalized, product.id)
        products!.push({ id: product.id, nameNormalized: normalized })
        return product.id
    }

    return { match }
}
