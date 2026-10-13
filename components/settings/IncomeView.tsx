'use client'

import { ArrowLeft, Trash2, FileText, ArrowDown } from 'lucide-react'
import { IncomeSource } from '@/app/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { DatePicker } from '@/components/ui/date-picker'
import type { IncomeEditorState } from './useIncomeEditor'

// Aus SettingsOverlay.tsx herausgelöst (Markup unverändert).
export default function IncomeView({ editor, onBack, incomeSources, budget }: { editor: IncomeEditorState; onBack: () => void; incomeSources: IncomeSource[]; budget: number }) {
    const { editingIncomeId, setEditingIncomeId, editIncomeTitle, setEditIncomeTitle, editIncomeAmount, setEditIncomeAmount, editIncomeValidFrom, setEditIncomeValidFrom, editIncomeValidTo, setEditIncomeValidTo, editIncomeFrequency, setEditIncomeFrequency, newIncomeTitle, setNewIncomeTitle, newIncomeAmount, setNewIncomeAmount, newIncomeValidFrom, setNewIncomeValidFrom, newIncomeValidTo, setNewIncomeValidTo, newIncomeFrequency, setNewIncomeFrequency, handleAddIncome, handleStartEditIncome, handleSaveEditIncome, handleQuickEndDate, handleDeleteIncome } = editor
    return (
        <div className="fixed inset-0 z-50 h-dvh w-screen bg-background overflow-y-auto overflow-x-hidden overscroll-none animate-in fade-in slide-in-from-right-8 duration-300 ease-[var(--ease-out-strong)] flex justify-center pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
            <div className="w-full h-full md:max-w-2xl flex flex-col mx-auto">
                <div className="p-4 md:p-8 flex items-center justify-between shrink-0 bg-background/90 backdrop-blur-sm sticky top-0 z-20">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon" onClick={() => onBack()} className="press rounded-full w-10 h-10 text-muted-foreground hover:text-foreground hover:bg-muted">
                            <ArrowLeft className="w-5 h-5" strokeWidth={1.75} />
                        </Button>
                        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Einnahmen</h1>
                    </div>
                </div>

                <div className="p-4 md:p-8 space-y-8 flex-1 pb-20 max-w-[600px] mx-auto w-full">
                    {/* Add New Income */}
                    <Card className="rounded-2xl border-border bg-card shadow-none">
                        <CardHeader className="pb-4">
                            <CardTitle className="font-display text-lg font-semibold tracking-tight">Neue Einnahme hinzufügen</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <FieldGroup className="space-y-4">
                                <Field>
                                    <Input
                                        placeholder="Quelle (z.B. Gehalt)"
                                        value={newIncomeTitle}
                                        onChange={(e) => setNewIncomeTitle(e.target.value)}
                                        className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary"
                                    />
                                </Field>
                                <div className="flex gap-2">
                                    <Field className="flex-1">
                                        <Input
                                            type="number"
                                            placeholder="€ / Betrag"
                                            value={newIncomeAmount}
                                            onChange={(e) => setNewIncomeAmount(e.target.value)}
                                            className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary"
                                        />
                                    </Field>
                                    <Field className="flex-1">
                                        <Select value={newIncomeFrequency} onValueChange={(val: any) => setNewIncomeFrequency(val)}>
                                            <SelectTrigger className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus:ring-primary w-full">
                                                <SelectValue placeholder="Intervall" />
                                            </SelectTrigger>
                                            <SelectContent className="rounded-2xl">
                                                <SelectItem value="monthly" className="rounded-xl">Monatlich</SelectItem>
                                                <SelectItem value="yearly" className="rounded-xl">Jährlich</SelectItem>
                                                <SelectItem value="weekly" className="rounded-xl">Wöchentlich</SelectItem>
                                                <SelectItem value="daily" className="rounded-xl">Täglich</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </Field>
                                </div>
                                <div className="flex gap-2">
                                    <Field className="flex-1">
                                        <FieldLabel className="text-xs text-muted-foreground ml-2">Gültig ab</FieldLabel>
                                        <DatePicker
                                            date={newIncomeValidFrom}
                                            setDate={setNewIncomeValidFrom}
                                            className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary text-sm"
                                        />
                                    </Field>
                                    <Field className="flex-1">
                                        <FieldLabel className="text-xs text-muted-foreground ml-2">Gültig bis (Optional)</FieldLabel>
                                        <DatePicker
                                            date={newIncomeValidTo}
                                            setDate={setNewIncomeValidTo}
                                            placeholder="Optional"
                                            className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary text-sm"
                                        />
                                    </Field>
                                </div>
                                <Button
                                    onClick={handleAddIncome}
                                    disabled={!newIncomeTitle || !newIncomeAmount}
                                    className="press w-full h-12 rounded-xl bg-primary hover:bg-[color-mix(in_srgb,var(--color-primary)_92%,black)] text-primary-foreground font-semibold shadow-none transition-colors duration-200"
                                >
                                    Hinzufügen
                                </Button>
                            </FieldGroup>
                        </CardContent>
                    </Card>

                    {/* Income List */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-display text-lg font-semibold tracking-tight text-foreground">Deine Einnahmen</h3>
                            <Badge className="amount bg-[var(--chart-pos)]/10 text-[var(--chart-pos)] hover:bg-[var(--chart-pos)]/10 px-3 py-1 rounded-full font-semibold">
                                Summe: €{Number(budget).toFixed(2)}
                            </Badge>
                        </div>

                        {incomeSources.length === 0 ? (
                            <p className="text-muted-foreground text-center py-8">Noch keine Einnahmen eingetragen.</p>
                        ) : (
                            <div className="space-y-3">
                                {incomeSources.sort((a, b) => {
                                    if (!a.valid_to && b.valid_to) return -1
                                    if (a.valid_to && !b.valid_to) return 1
                                    if (!a.valid_to && !b.valid_to) return 0
                                    return new Date(b.valid_to!).getTime() - new Date(a.valid_to!).getTime()
                                }).map(src => {
                                    const now = new Date()
                                    const from = src.valid_from ? new Date(src.valid_from) : null
                                    const to = src.valid_to ? new Date(src.valid_to) : null
                                    const isActive = (!from || now >= from) && (!to || now <= to)
                                    const isEditing = editingIncomeId === src.id

                                    if (isEditing) {
                                        return (
                                            <Card key={src.id} className="rounded-2xl border-2 border-primary/60 shadow-md bg-card">
                                                <CardContent className="p-4 space-y-3">
                                                    <div className="space-y-2">
                                                        <Input
                                                            value={editIncomeTitle}
                                                            onChange={e => setEditIncomeTitle(e.target.value)}
                                                            className="w-full rounded-xl bg-muted border-transparent focus-visible:ring-primary text-sm"
                                                            placeholder="Titel"
                                                        />
                                                        <div className="flex gap-2">
                                                            <Input
                                                                type="number"
                                                                value={editIncomeAmount}
                                                                onChange={e => setEditIncomeAmount(e.target.value)}
                                                                className="flex-1 rounded-xl bg-muted border-transparent focus-visible:ring-primary text-sm"
                                                                placeholder="Betrag"
                                                            />
                                                            <Select value={editIncomeFrequency} onValueChange={(val: any) => setEditIncomeFrequency(val)}>
                                                                <SelectTrigger className="flex-1 rounded-xl bg-muted border-transparent focus-visible:ring-primary text-sm">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent className="rounded-xl">
                                                                    <SelectItem value="monthly" className="rounded-lg text-sm">Monatlich</SelectItem>
                                                                    <SelectItem value="yearly" className="rounded-lg text-sm">Jährlich</SelectItem>
                                                                    <SelectItem value="weekly" className="rounded-lg text-sm">Wöchentlich</SelectItem>
                                                                    <SelectItem value="daily" className="rounded-lg text-sm">Täglich</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <DatePicker
                                                            date={editIncomeValidFrom}
                                                            setDate={setEditIncomeValidFrom}
                                                            className="flex-1 rounded-xl bg-muted border-transparent focus-visible:ring-primary text-xs"
                                                        />
                                                        <DatePicker
                                                            date={editIncomeValidTo}
                                                            setDate={setEditIncomeValidTo}
                                                            placeholder="Optional"
                                                            className="flex-1 rounded-xl bg-muted border-transparent focus-visible:ring-primary text-xs"
                                                        />
                                                    </div>
                                                    <div className="flex justify-end gap-2 pt-2">
                                                        <Button variant="ghost" size="sm" onClick={() => setEditingIncomeId(null)} className="rounded-xl">Abbrechen</Button>
                                                        <Button size="sm" onClick={handleSaveEditIncome} className="press rounded-lg bg-primary hover:bg-[color-mix(in_srgb,var(--color-primary)_92%,black)] text-primary-foreground transition-colors duration-200">Speichern</Button>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )
                                    }

                                    return (
                                        <div key={src.id} className={`flex flex-col p-4 rounded-xl border group transition-colors duration-200 ${isActive ? 'bg-card border-border' : 'bg-muted/40 border-border opacity-70'}`}>
                                            <div className="flex items-center justify-between">
                                                <div className="min-w-0 flex-1 mr-4">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <p className="font-bold text-foreground truncate text-lg">{src.title}</p>
                                                        {!isActive && <Badge variant="secondary" className="bg-muted text-muted-foreground px-2 py-0 rounded-full text-[10px]">Inaktiv</Badge>}
                                                        {!src.valid_to && <Badge variant="secondary" className="bg-muted text-muted-foreground border border-transparent px-2 py-0 rounded-full text-[10px]">Unbegrenzt</Badge>}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <p className="amount text-sm text-[var(--chart-pos)]">
                                                            +€{Number(src.amount).toFixed(2)}
                                                            <span className="text-[10px] text-muted-foreground font-normal ml-1">
                                                                ({src.frequency === 'daily' ? 'Tgl.' : src.frequency === 'weekly' ? 'Wöch.' : src.frequency === 'yearly' ? 'Jährl.' : 'Mtl.'})
                                                            </span>
                                                        </p>
                                                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                                            {src.valid_from ? new Date(src.valid_from).toLocaleDateString('de-DE') : 'Start'}
                                                            {' - '}
                                                            {src.valid_to ? new Date(src.valid_to).toLocaleDateString('de-DE') : 'Unbegrenzt'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    {!src.valid_to && (
                                                        <div className="relative group/end">
                                                            <input
                                                                type="date"
                                                                className="absolute inset-0 opacity-0 cursor-pointer w-8"
                                                                onChange={(e) => handleQuickEndDate(src.id, e.target.value)}
                                                            />
                                                            <Button variant="ghost" size="icon" className="press text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl" title="Enddatum setzen">
                                                                <ArrowDown className="w-5 h-5 rotate-[-90deg]" />
                                                            </Button>
                                                        </div>
                                                    )}

                                                    <Button variant="ghost" size="icon" onClick={() => handleStartEditIncome(src)} className="press text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl">
                                                        <FileText className="w-5 h-5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteIncome(src.id)} className="press text-muted-foreground hover:text-[var(--chart-neg-heavy)] hover:bg-muted rounded-xl">
                                                        <Trash2 className="w-5 h-5" />
                                                    </Button>
                                                </div>
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
                            Diese Einnahmen bilden dein monatliches Grundbudget.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
