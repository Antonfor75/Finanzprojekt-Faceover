'use client'

import { ArrowLeft, Trash2, FileText } from 'lucide-react'
import { FixedCost, Account } from '@/app/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import type { AccountEditorState } from './useAccountEditor'

// Aus SettingsOverlay.tsx herausgelöst (Markup unverändert).
export default function AccountsView({ editor, onBack, accounts, fixedCosts }: { editor: AccountEditorState; onBack: () => void; accounts: Account[]; fixedCosts: FixedCost[] }) {
    const { newAccountName, setNewAccountName, newAccountAmount, setNewAccountAmount, newAccountTargetAmount, setNewAccountTargetAmount, newAccountTargetDate, setNewAccountTargetDate, newAccountMonths, setNewAccountMonths, newAccountType, setNewAccountType, newAccountFeed, setNewAccountFeed, newAccountValidFrom, setNewAccountValidFrom, calculatedWeeklyRate, handleAddAccount, editingAccountId, setEditingAccountId, editAccountName, setEditAccountName, editAccountAmount, setEditAccountAmount, editAccountTargetAmount, setEditAccountTargetAmount, editAccountTargetDate, setEditAccountTargetDate, editAccountMonths, setEditAccountMonths, editAccountValidFrom, setEditAccountValidFrom, editAccountFeed, setEditAccountFeed, handleStartEditAccount, handleSaveEditAccount, handleDeleteAccount, handleTransferFromSavings } = editor
    return (
        <div className="fixed inset-0 z-50 h-dvh w-screen bg-background animate-in fade-in slide-in-from-right-8 duration-300 ease-[var(--ease-out-strong)] flex justify-center pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overflow-y-auto overflow-x-hidden overscroll-none">
            <div className="w-full h-full md:max-w-2xl flex flex-col mx-auto">
                <div className="p-4 md:p-8 flex items-center justify-between shrink-0 bg-background/90 backdrop-blur-sm sticky top-0 z-20">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon" onClick={() => onBack()} className="press rounded-full w-10 h-10 text-muted-foreground hover:text-foreground hover:bg-muted">
                            <ArrowLeft className="w-5 h-5" strokeWidth={1.75} />
                        </Button>
                        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Konten</h1>
                    </div>
                </div>

                <div className="p-4 md:p-8 space-y-8 flex-1 pb-20 max-w-[600px] mx-auto w-full">
                    {/* Add New Account */}
                    <Card className="rounded-2xl border-border bg-card shadow-none">
                        <CardHeader className="pb-4">
                            <CardTitle className="font-display text-lg font-semibold tracking-tight">Neues Konto anlegen</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {/* Type Selection */}
                            <div className="flex bg-muted/70 rounded-xl p-1 mb-4">
                                <button
                                    onClick={() => setNewAccountType('distribution')}
                                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 ${newAccountType === 'distribution' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    Aufteilung
                                </button>
                                <button
                                    onClick={() => setNewAccountType('savings')}
                                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 ${newAccountType === 'savings' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    Sparkonto
                                </button>
                                <button
                                    onClick={() => setNewAccountType('fun')}
                                    className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${newAccountType === 'fun' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    Spaßkonto
                                </button>
                            </div>

                            <FieldGroup className="space-y-4">
                                <Field>
                                    <Input
                                        placeholder="Name des Kontos"
                                        value={newAccountName}
                                        onChange={(e) => setNewAccountName(e.target.value)}
                                        className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary"
                                    />
                                </Field>
                                <div className="flex gap-2">
                                    <Field className="flex-1">
                                        <FieldLabel className="text-xs text-muted-foreground ml-2">Aktueller Betrag (€)</FieldLabel>
                                        <Input
                                            type="number"
                                            placeholder="0"
                                            value={newAccountAmount}
                                            onChange={(e) => setNewAccountAmount(e.target.value)}
                                            className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary"
                                        />
                                    </Field>
                                    {newAccountType === 'fun' && (
                                        <Field className="flex-1">
                                            <Input
                                                type="number"
                                                placeholder="€ / Monat (Optional)"
                                                value={newAccountFeed}
                                                onChange={(e) => setNewAccountFeed(e.target.value)}
                                                className="h-12 rounded-2xl bg-card border-transparent shadow-sm focus-visible:ring-primary"
                                                title="Monatliche automatische Einzahlung (Optional)"
                                            />
                                        </Field>
                                    )}
                                    {newAccountType === 'distribution' && (
                                        <Field className="w-24 shrink-0">
                                            <FieldLabel className="text-xs text-muted-foreground ml-2">Monate</FieldLabel>
                                            <Input
                                                type="number"
                                                placeholder="12"
                                                value={newAccountMonths}
                                                onChange={(e) => setNewAccountMonths(e.target.value)}
                                                className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary"
                                            />
                                        </Field>
                                    )}
                                </div>
                                {newAccountType !== 'fun' && (
                                    <Field>
                                        <FieldLabel className="text-xs text-muted-foreground ml-2">Startdatum (Optional)</FieldLabel>
                                        <Input
                                            type="date"
                                            value={newAccountValidFrom}
                                            onChange={(e) => setNewAccountValidFrom(e.target.value)}
                                            className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary text-sm"
                                            title="Startdatum (Optional)"
                                        />
                                    </Field>
                                )}

                                {newAccountType === 'savings' && (
                                    <div className="space-y-4 pt-2 border-t border-border/50 mt-2">
                                        <div className="flex gap-2">
                                            <Field className="flex-1">
                                                <FieldLabel className="text-xs text-muted-foreground ml-2">Zielbetrag (€) (Optional)</FieldLabel>
                                                <Input
                                                    type="number"
                                                    placeholder="Ziel (€)"
                                                    value={newAccountTargetAmount}
                                                    onChange={(e) => setNewAccountTargetAmount(e.target.value)}
                                                    className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary"
                                                />
                                            </Field>
                                            <Field className="flex-1">
                                                <FieldLabel className="text-xs text-muted-foreground ml-2">Zieldatum (Optional)</FieldLabel>
                                                <Input
                                                    type="date"
                                                    value={newAccountTargetDate}
                                                    onChange={(e) => setNewAccountTargetDate(e.target.value)}
                                                    className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary text-sm"
                                                />
                                            </Field>
                                        </div>

                                        {calculatedWeeklyRate !== null && calculatedWeeklyRate > 0 && (
                                            <div className="p-3 bg-[var(--chart-pos)]/10 text-[var(--chart-pos)] rounded-xl text-sm font-semibold border border-transparent flex justify-between items-center">
                                                <span>Wöchentliche Sparrate:</span>
                                                <span className="amount">€{calculatedWeeklyRate.toFixed(2)}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <Button
                                    onClick={handleAddAccount}
                                    disabled={!newAccountName || !newAccountAmount || (newAccountType === 'distribution' && !newAccountMonths)}
                                    className="press w-full h-12 rounded-xl bg-primary hover:bg-[color-mix(in_srgb,var(--color-primary)_92%,black)] text-primary-foreground font-semibold shadow-none transition-colors duration-200"
                                >
                                    Hinzufügen
                                </Button>
                            </FieldGroup>
                        </CardContent>
                    </Card>

                    {/* Accounts List */}
                    <div className="space-y-4">
                        <h3 className="font-display text-lg font-semibold tracking-tight text-foreground">Deine Konten</h3>
                        {accounts.length === 0 ? (
                            <p className="text-muted-foreground text-center py-8">Noch keine Konten angelegt.</p>
                        ) : (
                            <div className="space-y-3">
                                {accounts.map(acc => {
                                    const isEditing = editingAccountId === acc.id

                                    if (isEditing) {
                                        return (
                                            <Card key={acc.id} className="rounded-2xl border-2 border-primary/60 shadow-md bg-card">
                                                <CardContent className="p-4 space-y-3">
                                                    <Input
                                                        value={editAccountName}
                                                        onChange={e => setEditAccountName(e.target.value)}
                                                        className="rounded-xl bg-muted border-transparent focus-visible:ring-primary"
                                                        placeholder="Name"
                                                    />
                                                    <div className="flex gap-2">
                                                        <Input
                                                            type="number"
                                                            value={editAccountAmount}
                                                            onChange={e => setEditAccountAmount(e.target.value)}
                                                            className="flex-1 rounded-xl bg-muted border-transparent focus-visible:ring-primary"
                                                            placeholder="Betrag"
                                                        />
                                                        {acc.type === 'distribution' && (
                                                            <>
                                                                <Input
                                                                    type="number"
                                                                    value={editAccountMonths}
                                                                    onChange={e => setEditAccountMonths(e.target.value)}
                                                                    className="flex-1 rounded-xl bg-muted border-transparent focus-visible:ring-primary"
                                                                    placeholder="Monate"
                                                                />
                                                                <Input
                                                                    type="date"
                                                                    value={editAccountValidFrom}
                                                                    onChange={e => setEditAccountValidFrom(e.target.value)}
                                                                    className="flex-1 rounded-xl bg-muted border-transparent focus-visible:ring-primary text-xs"
                                                                    title="Startdatum"
                                                                />
                                                            </>
                                                        )}
                                                    </div>
                                                    {acc.type === 'fun' && (
                                                        <div className="flex gap-2 items-center">
                                                            <Input
                                                                type="number"
                                                                value={editAccountFeed}
                                                                onChange={e => setEditAccountFeed(e.target.value)}
                                                                className="flex-1 rounded-xl bg-muted border-transparent focus-visible:ring-primary"
                                                                placeholder="€ / Monat (leer = kein Feed)"
                                                            />
                                                        </div>
                                                    )}
                                                    {acc.type === 'savings' && (
                                                        <div className="flex gap-2">
                                                            <Input
                                                                type="number"
                                                                value={editAccountTargetAmount}
                                                                onChange={e => setEditAccountTargetAmount(e.target.value)}
                                                                className="flex-1 rounded-xl bg-muted border-transparent focus-visible:ring-primary"
                                                                placeholder="Ziel (€)"
                                                            />
                                                            <Input
                                                                type="date"
                                                                value={editAccountTargetDate}
                                                                onChange={e => setEditAccountTargetDate(e.target.value)}
                                                                className="flex-1 rounded-xl bg-muted border-transparent focus-visible:ring-primary text-xs"
                                                            />
                                                        </div>
                                                    )}
                                                    <div className="flex justify-end gap-2 pt-2">
                                                        <Button variant="ghost" size="sm" onClick={() => setEditingAccountId(null)} className="rounded-xl">Abbrechen</Button>
                                                        <Button size="sm" onClick={handleSaveEditAccount} className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground">Speichern</Button>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )
                                    }

                                    return (
                                        <div
                                            key={acc.id}
                                            className={`p-4 rounded-xl border border-border bg-card flex justify-between items-center group cursor-pointer hover:bg-muted/40 transition-colors duration-200`}
                                            onClick={() => {
                                                if (acc.type === 'savings') {
                                                    handleTransferFromSavings(acc)
                                                }
                                            }}
                                        >
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <p className="font-bold text-foreground text-lg">{acc.name}</p>
                                                    <Badge variant="secondary" className={`text-[10px] px-2 py-0 rounded-full font-bold uppercase ${acc.type === 'savings' ? 'bg-[var(--chart-pos)]/10 text-[var(--chart-pos)]' : acc.type === 'fun' ? 'bg-[var(--color-primary)]/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                                        {acc.type === 'savings' ? 'Sparkonto' : acc.type === 'fun' ? 'Spaßkonto' : 'Aufteilung'}
                                                    </Badge>
                                                </div>
                                                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground font-medium mt-1">
                                                    <Badge variant="outline" className="bg-muted px-2 py-0.5 rounded-lg border-transparent">€{acc.amount.toFixed(2)}</Badge>
                                                    {acc.type === 'distribution' && (
                                                        <>
                                                            <Badge variant="outline" className="bg-muted px-2 py-0.5 rounded-lg border-transparent">{acc.months} Monate übrig</Badge>
                                                            {acc.valid_from && (
                                                                <Badge variant="outline" className="bg-muted px-2 py-0.5 rounded-lg border-transparent">
                                                                    Start: {new Date(acc.valid_from).toLocaleDateString()}
                                                                </Badge>
                                                            )}
                                                        </>
                                                    )}
                                                    {acc.type === 'savings' && acc.target_amount && (
                                                        <Badge variant="outline" className="bg-[var(--chart-pos)]/10 text-[var(--chart-pos)] px-2 py-0.5 rounded-lg border-transparent">
                                                            Ziel: €{acc.target_amount} bis {acc.target_date ? new Date(acc.target_date).toLocaleDateString() : '?'}
                                                        </Badge>
                                                    )}
                                                    {acc.type === 'fun' && (() => {
                                                        const feed = fixedCosts.find(fc => fc.linked_account_id === acc.id)
                                                        return feed ? (
                                                            <Badge variant="outline" className="bg-pink-50 text-pink-700 px-2 py-0.5 rounded-lg border-pink-100">
                                                                +€{Number(feed.amount).toFixed(2)} / Monat
                                                            </Badge>
                                                        ) : null
                                                    })()}
                                                </div>
                                                {/* Progress Bar for Savings */}
                                                {acc.type === 'savings' && acc.target_amount && (
                                                    <div className="mt-3 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-[var(--chart-pos)] rounded-full transition-[width] duration-500 ease-[var(--ease-out-strong)]"
                                                            style={{ width: `${Math.min(100, (acc.amount / Number(acc.target_amount)) * 100)}%` }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1 ml-4" onClick={(e) => e.stopPropagation()}>
                                                <Button variant="ghost" size="icon" onClick={() => handleStartEditAccount(acc)} className="press text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl">
                                                    <FileText className="w-5 h-5" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => handleDeleteAccount(acc.id)} className="press text-muted-foreground hover:text-[var(--chart-neg-heavy)] hover:bg-muted rounded-xl">
                                                    <Trash2 className="w-5 h-5" />
                                                </Button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    {/* Info Box */}
                    <div className="p-4 bg-muted/50 border border-border rounded-xl">
                        <p className="text-xs text-muted-foreground leading-relaxed text-center">
                            <b>Aufteilung:</b> Guthaben wird monatlich ausgezahlt.<br />
                            <b>Sparkonto:</b> Setze ein Sparziel. Eine automatische Fixkoste wird erstellt, um das Ziel zu erreichen.<br />
                            <b>Spaßkonto:</b> Topf für Freizeit. Zahle manuell ein oder lass monatlich automatisch Geld einzahlen — Ausgaben davon belasten dein Budget nicht.
                        </p>
                    </div>

                </div>
            </div>
        </div>
    )
}
