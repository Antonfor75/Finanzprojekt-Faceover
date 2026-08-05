// End-to-End-Test der Einladungscode-Logik gegen die echte DB.
// Legt Testcodes an, prüft Doppel-Einlösung und Ablauf, räumt danach alles weg.
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
)

const TEST_PREFIX = 'TEST'
const results = []
const check = (name, ok, extra = '') => {
    results.push({ name, ok })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`)
}

// Dieselbe Claim-Logik wie in app/actions/auth.ts
async function claim(code) {
    const nowIso = new Date().toISOString()
    const { data: claimed, error } = await admin
        .from('invite_codes')
        .update({ used_at: nowIso })
        .eq('code', code)
        .is('used_at', null)
        .select('id, expires_at')
        .maybeSingle()

    if (error) return { ok: false, reason: 'error: ' + error.message }
    if (!claimed) {
        const { data: existing } = await admin
            .from('invite_codes').select('used_at').eq('code', code).maybeSingle()
        return { ok: false, reason: existing?.used_at ? 'bereits verwendet' : 'ungültig' }
    }
    if (claimed.expires_at && new Date(claimed.expires_at) <= new Date()) {
        await admin.from('invite_codes').update({ used_at: null }).eq('id', claimed.id)
        return { ok: false, reason: 'abgelaufen' }
    }
    return { ok: true, id: claimed.id }
}

try {
    // --- 1) Freier Code laesst sich einloesen
    const good = `${TEST_PREFIX}-AAAA`
    await admin.from('invite_codes').insert({ code: good, note: 'automatischer Test' })
    const first = await claim(good)
    check('freier Code wird angenommen', first.ok, first.reason || '')

    // --- 2) Derselbe Code ein zweites Mal -> abgelehnt
    const second = await claim(good)
    check('zweite Einloesung wird abgelehnt', !second.ok && second.reason === 'bereits verwendet', second.reason)

    // --- 3) Unbekannter Code -> ungueltig
    const unknown = await claim(`${TEST_PREFIX}-ZZZZ`)
    check('unbekannter Code -> ungueltig', !unknown.ok && unknown.reason === 'ungültig', unknown.reason)

    // --- 4) Abgelaufener Code -> abgelehnt UND wieder frei
    const expired = `${TEST_PREFIX}-BBBB`
    await admin.from('invite_codes').insert({
        code: expired,
        expires_at: new Date(Date.now() - 60_000).toISOString(),
    })
    const exp = await claim(expired)
    check('abgelaufener Code wird abgelehnt', !exp.ok && exp.reason === 'abgelaufen', exp.reason)

    const { data: after } = await admin
        .from('invite_codes').select('used_at').eq('code', expired).maybeSingle()
    check('abgelaufener Code bleibt unverbraucht', after?.used_at === null, `used_at=${after?.used_at}`)

    // --- 5) Noch gueltiger Code mit Ablaufdatum -> angenommen
    const future = `${TEST_PREFIX}-CCCC`
    await admin.from('invite_codes').insert({
        code: future,
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    const fut = await claim(future)
    check('Code mit Zukunftsdatum wird angenommen', fut.ok, fut.reason || '')

} finally {
    const { error } = await admin.from('invite_codes').delete().like('code', `${TEST_PREFIX}-%`)
    console.log(error ? `\nAufraeumen fehlgeschlagen: ${error.message}` : '\nTestcodes wieder geloescht.')

    const { data: rest } = await admin.from('invite_codes').select('code')
    console.log('verbleibende Codes in der Tabelle:', rest?.length ?? '?')

    const failed = results.filter(r => !r.ok).length
    console.log(failed === 0 ? 'ALLE TESTS BESTANDEN' : `${failed} TEST(S) FEHLGESCHLAGEN`)
    process.exit(failed === 0 ? 0 : 1)
}
