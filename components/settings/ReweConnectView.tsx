'use client'

import { ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import PasswordInput from '@/components/PasswordInput'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { DatePicker } from '@/components/ui/date-picker'
import type { ReweConnectionState } from './useReweConnection'

// Aus SettingsOverlay.tsx herausgelöst (Markup unverändert).
export default function ReweConnectView({ rewe, onBack }: { rewe: ReweConnectionState; onBack: () => void }) {
    const { reweStatus, reweEmail, setReweEmail, reweAppPassword, setReweAppPassword, reweBusy, reweMessage, reweScope, setReweScope, reweSinceDate, setReweSinceDate, reweSyncBusy, handleConnectRewe, handleSyncNowRewe, handleDisconnectRewe } = rewe
    const isConnected = reweStatus?.connected
    return (
        <div className="fixed inset-0 z-50 h-dvh w-screen bg-background animate-in fade-in slide-in-from-right-8 duration-300 ease-[var(--ease-out-strong)] flex justify-center pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overflow-y-auto overflow-x-hidden overscroll-none">
            <div className="w-full h-full md:max-w-2xl flex flex-col mx-auto">
                <div className="p-4 md:p-8 flex items-center justify-between shrink-0 bg-background/90 backdrop-blur-sm sticky top-0 z-20">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon" onClick={() => onBack()} className="press rounded-full w-10 h-10 text-muted-foreground hover:text-foreground hover:bg-muted">
                            <ArrowLeft className="w-5 h-5" strokeWidth={1.75} />
                        </Button>
                        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">REWE Import</h1>
                    </div>
                </div>

                <div className="p-4 md:p-8 space-y-6 flex-1 pb-20 max-w-[600px] mx-auto w-full">
                    {/* Status */}
                    {isConnected && (
                        <Card className="rounded-2xl border-[var(--chart-pos)]/40 bg-[var(--chart-pos)]/5 shadow-none">
                            <CardContent className="p-4 space-y-4">
                                <div className="flex items-start gap-3">
                                    <CheckCircle2 className="w-5 h-5 text-[var(--chart-pos)] shrink-0 mt-0.5" strokeWidth={2} />
                                    <div className="min-w-0 flex-1">
                                        <p className="font-semibold text-foreground text-sm">Verbunden</p>
                                        <p className="text-xs text-muted-foreground truncate">{reweStatus?.email_address}</p>
                                        <p className="text-[11px] text-muted-foreground mt-1">
                                            {reweStatus?.last_sync_at
                                                ? `Letzter Abruf: ${new Date(reweStatus.last_sync_at).toLocaleString('de-DE')}`
                                                : 'Noch kein Abruf erfolgt.'}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground">
                                            Import ab: {reweStatus?.import_since ? new Date(reweStatus.import_since).toLocaleDateString('de-DE') : 'Alle Bons'}
                                        </p>
                                        {reweStatus?.status === 'error' && reweStatus?.last_error && (
                                            <p className="text-[11px] text-[var(--chart-neg-heavy)] mt-1">Fehler: {reweStatus.last_error}</p>
                                        )}
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={handleDisconnectRewe} disabled={reweBusy || reweSyncBusy} className="press rounded-xl text-muted-foreground hover:text-[var(--chart-neg-heavy)] shrink-0">
                                        Trennen
                                    </Button>
                                </div>

                                {reweMessage && (
                                    <div className={`flex items-start gap-2 text-sm rounded-xl p-3 ${reweMessage.type === 'success' ? 'bg-[var(--chart-pos)]/10 text-[var(--chart-pos)]' : 'bg-[var(--chart-neg-heavy)]/10 text-[var(--chart-neg-heavy)]'}`}>
                                        {reweMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                                        <span>{reweMessage.text}</span>
                                    </div>
                                )}

                                <Button
                                    onClick={handleSyncNowRewe}
                                    disabled={reweSyncBusy || reweBusy}
                                    className="press w-full h-12 rounded-xl bg-primary hover:bg-[color-mix(in_srgb,var(--color-primary)_92%,black)] text-primary-foreground font-semibold shadow-none transition-colors duration-200"
                                >
                                    {reweSyncBusy ? 'Rufe Bons ab…' : 'Jetzt Bons abrufen'}
                                </Button>
                            </CardContent>
                        </Card>
                    )}

                    {/* Verbinden / Aktualisieren */}
                    <Card className="rounded-2xl border-border bg-card shadow-none">
                        <CardHeader className="pb-4">
                            <CardTitle className="font-display text-lg font-semibold tracking-tight">
                                {isConnected ? 'Zugangsdaten aktualisieren' : 'Gmail-Postfach verbinden'}
                            </CardTitle>
                            <CardDescription className="text-xs leading-relaxed">
                                Deine REWE-eBon-Mails werden automatisch als Ausgaben (Kategorie „Essen“) übernommen.
                                Nötig sind deine Gmail-Adresse und ein <b>Google-App-Passwort</b> (nicht dein normales Passwort).
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <FieldGroup className="space-y-4">
                                <Field>
                                    <FieldLabel className="text-xs text-muted-foreground ml-2">Gmail-Adresse</FieldLabel>
                                    <Input
                                        type="email"
                                        placeholder="deine.adresse@gmail.com"
                                        value={reweEmail}
                                        onChange={(e) => setReweEmail(e.target.value)}
                                        className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary"
                                    />
                                </Field>
                                <Field>
                                    <FieldLabel className="text-xs text-muted-foreground ml-2">App-Passwort (16 Zeichen)</FieldLabel>
                                    <PasswordInput
                                        placeholder="xxxx xxxx xxxx xxxx"
                                        value={reweAppPassword}
                                        onChange={setReweAppPassword}
                                        autoComplete="off"
                                        className="h-12 w-full min-w-0 rounded-xl bg-muted/60 border border-transparent px-2.5 py-1 text-base md:text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary"
                                    />
                                </Field>

                                {/* Import-Zeitraum wählen */}
                                <Field>
                                    <FieldLabel className="text-xs text-muted-foreground ml-2 mb-1 block">Welche Bons importieren?</FieldLabel>
                                    <div className="flex bg-muted/70 rounded-xl p-1 gap-1">
                                        {([
                                            { key: 'today', label: 'Ab heute' },
                                            { key: 'all', label: 'Alle' },
                                            { key: 'date', label: 'Ab Datum' },
                                        ] as const).map((opt) => (
                                            <button
                                                key={opt.key}
                                                type="button"
                                                onClick={() => setReweScope(opt.key)}
                                                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 ${reweScope === opt.key ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                    {reweScope === 'date' && (
                                        <div className="mt-3">
                                            <DatePicker
                                                date={reweSinceDate}
                                                setDate={setReweSinceDate}
                                                placeholder="Startdatum wählen"
                                                className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary text-sm"
                                            />
                                        </div>
                                    )}
                                    <p className="text-[11px] text-muted-foreground mt-2 ml-1">
                                        {reweScope === 'today'
                                            ? 'Nur Einkäufe ab heute werden übernommen.'
                                            : reweScope === 'all'
                                                ? 'Alle vorhandenen REWE-Bons im Postfach werden übernommen.'
                                                : 'Nur Bons ab dem gewählten Datum werden übernommen.'}
                                    </p>
                                </Field>

                                {reweMessage && (
                                    <div className={`flex items-start gap-2 text-sm rounded-xl p-3 ${reweMessage.type === 'success' ? 'bg-[var(--chart-pos)]/10 text-[var(--chart-pos)]' : 'bg-[var(--chart-neg-heavy)]/10 text-[var(--chart-neg-heavy)]'}`}>
                                        {reweMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                                        <span>{reweMessage.text}</span>
                                    </div>
                                )}

                                <Button
                                    onClick={handleConnectRewe}
                                    disabled={!reweEmail || !reweAppPassword || reweBusy || (reweScope === 'date' && !reweSinceDate)}
                                    className="press w-full h-12 rounded-xl bg-primary hover:bg-[color-mix(in_srgb,var(--color-primary)_92%,black)] text-primary-foreground font-semibold shadow-none transition-colors duration-200"
                                >
                                    {reweBusy ? 'Prüfe Verbindung…' : isConnected ? 'Aktualisieren' : 'Verbinden'}
                                </Button>
                            </FieldGroup>
                        </CardContent>
                    </Card>

                    {/* Anleitung */}
                    <div className="p-4 bg-muted/50 border border-border rounded-xl space-y-2">
                        <p className="text-xs font-semibold text-foreground">So richtest du es ein:</p>
                        <ol className="text-xs text-muted-foreground leading-relaxed list-decimal ml-4 space-y-1">
                            <li>In deinem Google-Konto die <b>2-Faktor-Authentifizierung</b> aktivieren.</li>
                            <li>Ein <b>App-Passwort</b> erstellen unter <span className="break-all">myaccount.google.com/apppasswords</span> und oben eintragen.</li>
                            <li>In der REWE-App den <b>digitalen Kassenbon (eBon) per E-Mail</b> aktivieren – sonst kommen keine Mails an.</li>
                        </ol>
                    </div>
                </div>
            </div>
        </div>
    )
}
