// Gemeinsame Hilfen für Datenbank-Tests gegen die echte (Live-)Datenbank.
//
// SICHERHEIT: Jeder Test läuft in EINER Transaktion, die IMMER mit ROLLBACK endet (auch bei
// Fehlern). Es wird nie etwas committet; auch Migrationen, die ein Test einspielt, und
// angelegte Testkonten verschwinden wieder. Ohne DATABASE_URL werden die Tests übersprungen.
import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import postgres, { type Sql, type TransactionSql } from 'postgres'
import { afterAll, test } from 'vitest'

// postgres.js typt TransactionSql ohne Aufruf-Signatur; hier brauchen wir Tagged Templates und savepoint.
export type Tx = Sql & Pick<TransactionSql, 'savepoint'>

// Wie scripts/apply-0010-…: der Direkt-Host aus DATABASE_URL ist nur per IPv6 erreichbar;
// mit POOLER_HOST geht es über den Session-Pooler (IPv4).
function connectionUrl(): string {
    const url = new URL(process.env.DATABASE_URL as string)
    const poolerHost = process.env.POOLER_HOST
    if (poolerHost && url.hostname.startsWith('db.')) {
        const ref = url.hostname.split('.')[1]
        url.hostname = poolerHost
        url.username = `postgres.${ref}`
    }
    return url.toString()
}

let shared: Sql | null = null
function connection(): Sql {
    if (!shared) shared = postgres(connectionUrl(), { ssl: 'require', max: 1, onnotice: () => {} })
    return shared
}

afterAll(async () => {
    if (shared) {
        await shared.end()
        shared = null
    }
})

class Rollback extends Error {}

/** Ein Test in einer Transaktion, die immer zurückgerollt wird. */
export function dbTest(name: string, fn: (tx: Tx) => Promise<void>): void {
    test.skipIf(!process.env.DATABASE_URL)(name, async () => {
        try {
            await connection().begin(async (tx) => {
                // Nie auf Sperren der Live-DB warten.
                await tx.unsafe(`set local lock_timeout = '10s'`)
                await fn(tx as unknown as Tx)
                throw new Rollback()
            })
        } catch (e) {
            if (!(e instanceof Rollback)) throw e
        }
    })
}

/** Spielt eine Migrationsdatei (Statements getrennt mit `--> statement-breakpoint`) in die Transaktion ein. */
export async function loadMigration(tx: Tx, file: string): Promise<void> {
    const content = await fs.readFile(path.resolve(process.cwd(), file), 'utf-8')
    for (const stmt of content.split('--> statement-breakpoint')) {
        const trimmed = stmt.trim()
        if (trimmed) await tx.unsafe(trimmed)
    }
}

/**
 * Spielt eine Migration nur ein, wenn ihre Tabelle (`marker`, z. B. 'public.shared_purchases') noch nicht existiert.
 * Die Migrationen 0012/0013 sind auf der Live-Datenbank eingespielt: ihr DDL (ALTER TABLE … ADD COLUMN IF NOT EXISTS)
 * würde bei jedem Test kurz ACCESS-EXCLUSIVE-Sperren auf expenses/receipt_items nehmen. Dann testen die Tests die dort
 * eingespielten Funktionen; auf einer leeren Datenbank (ohne Tabelle) wird die Datei wie bisher geladen.
 */
export async function ensureMigration(tx: Tx, file: string, marker: string): Promise<void> {
    const [row] = await tx<{ present: boolean }[]>`select to_regclass(${marker}::text) is not null as present`
    if (!row.present) await loadMigration(tx, file)
}

/**
 * Legt ein Wegwerf-Konto in auth.users an (nur innerhalb der Transaktion). Standardmäßig mit
 * freigeschaltetem Kassenbon-Scan (app_metadata.receipt_scan) — Freunde gibt es nur dafür (Migration 0014);
 * `{ scan: false }` für ein Konto ohne Freischaltung.
 */
export async function makeUser(tx: Tx, email = `sdd-test-${randomUUID()}@example.invalid`, opts: { scan?: boolean } = {}): Promise<string> {
    await asAdmin(tx)
    const appMeta = JSON.stringify(opts.scan === false ? {} : { receipt_scan: true })
    const [row] = await tx<{ id: string }[]>`
        insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
        values (${randomUUID()}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${email}, 'x', now(), now(), ${appMeta}::text::jsonb, '{}'::jsonb)
        returning id`
    return row.id
}

/** Ab jetzt läuft alles wie ein angemeldetes Konto (Rolle authenticated, auth.uid() = userId). */
export async function asUser(tx: Tx, userId: string): Promise<void> {
    await tx.unsafe('set local role authenticated')
    const claims = JSON.stringify({ sub: userId, role: 'authenticated' })
    await tx`select set_config('request.jwt.claims', ${claims}, true)`
}

/** Zurück zur Verbindungsrolle (Besitzer, umgeht RLS). */
export async function asAdmin(tx: Tx): Promise<void> {
    await tx.unsafe('reset role')
}

/** Zurück zur Rolle anon (nicht angemeldet). */
export async function asAnon(tx: Tx): Promise<void> {
    await tx.unsafe('set local role anon')
    await tx`select set_config('request.jwt.claims', '', true)`
}

/**
 * Führt `fn` in einem Savepoint aus, erwartet einen SQL-Fehler und gibt dessen Meldung zurück.
 * Ohne Savepoint wäre die Transaktion nach dem Fehler abgebrochen.
 */
export async function sqlError(tx: Tx, fn: (sp: Tx) => PromiseLike<unknown>): Promise<string> {
    try {
        await tx.savepoint(async (sp) => {
            await fn(sp as unknown as Tx)
        })
    } catch (e) {
        return (e as Error).message
    }
    throw new Error('Erwarteter SQL-Fehler blieb aus')
}
