'use client'

import { ArrowLeft, Trash2, FileText } from 'lucide-react'
import { FixedCost } from '@/app/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { DatePicker } from '@/components/ui/date-picker'
import type { FixedCostEditorState } from './useFixedCostEditor'

// Aus SettingsOverlay.tsx herausgelöst (Markup unverändert).
export default function FixedCostsView({ editor, onBack, fixedCosts, totalFixed }: { editor: FixedCostEditorState; onBack: () => void; fixedCosts: FixedCost[]; totalFixed: number }) {
    const { newCostTitle, setNewCostTitle, newCostAmount, setNewCostAmount, newCostValidFrom, setNewCostValidFrom, newCostValidTo, setNewCostValidTo, handleAddCost, editingCostId, setEditingCostId, editCostTitle, setEditCostTitle, editCostAmount, setEditCostAmount, editCostValidFrom, setEditCostValidFrom, editCostValidTo, setEditCostValidTo, handleStartEditCost, handleSaveEditCost, handleDeleteCost } = editor
    return (
        <div className="fixed inset-0 z-50 h-dvh w-screen bg-background animate-in fade-in slide-in-from-right-8 duration-300 ease-[var(--ease-out-strong)] flex justify-center pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overflow-y-auto overflow-x-hidden overscroll-none">
            <div className="w-full h-full md:max-w-2xl flex flex-col mx-auto">
                <div className="p-4 md:p-8 flex items-center justify-between shrink-0 bg-background/90 backdrop-blur-sm sticky top-0 z-20">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon" onClick={() => onBack()} className="press rounded-full w-10 h-10 text-muted-foreground hover:text-foreground hover:bg-muted">
                            <ArrowLeft className="w-5 h-5" strokeWidth={1.75} />
                        </Button>
                        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Fixkosten</h1>
                    </div>
                </div>

                <div className="p-4 md:p-8 space-y-8 flex-1 pb-20 max-w-[600px] mx-auto w-full">
                    {/* Add New Fixed Cost */}
                    <Card className="rounded-2xl border-border bg-card shadow-none">
                        <CardHeader className="pb-4">
                            <CardTitle className="font-display text-lg font-semibold tracking-tight">Neue Fixkosten hinzufügen</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <FieldGroup className="space-y-4">
                                <div className="flex gap-2">
                                    <Field className="flex-[2]">
                                        <Input
                                            placeholder="Titel"
                                            value={newCostTitle}
                                            onChange={(e) => setNewCostTitle(e.target.value)}
                                            className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary"
                                        />
                                    </Field>
                                    <Field className="flex-1">
                                        <Input
                                            type="number"
                                            placeholder="€ / Monat"
                                            value={newCostAmount}
                                            onChange={(e) => setNewCostAmount(e.target.value)}
                                            className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary"
                                        />
                                    </Field>
                                </div>
                                {/* Date Range */}
                                <div className="flex gap-2">
                                    <Field className="flex-1">
                                        <FieldLabel className="text-xs text-muted-foreground ml-2">Gültig ab</FieldLabel>
                                        <DatePicker
                                            date={newCostValidFrom}
                                            setDate={setNewCostValidFrom}
                                            className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary text-sm"
                                        />
                                    </Field>
                                    <Field className="flex-1">
                                        <FieldLabel className="text-xs text-muted-foreground ml-2">Gültig bis (Optional)</FieldLabel>
                                        <DatePicker
                                            date={newCostValidTo}
                                            setDate={setNewCostValidTo}
                                            placeholder="Optional"
                                            className="h-12 rounded-xl bg-muted/60 border-transparent shadow-none focus-visible:ring-primary text-sm"
                                        />
                                    </Field>
                                </div>

                                <Button
                                    onClick={handleAddCost}
                                    disabled={!newCostTitle || !newCostAmount}
                                    className="press w-full h-12 rounded-xl bg-primary hover:bg-[color-mix(in_srgb,var(--color-primary)_92%,black)] text-primary-foreground font-semibold shadow-none transition-colors duration-200"
                                >
                                    Hinzufügen
                                </Button>
                            </FieldGroup>
                        </CardContent>
                    </Card>

                    {/* Fixed Costs List */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-display text-lg font-semibold tracking-tight text-foreground">Deine Fixkosten</h3>
                            <Badge variant="secondary" className="amount text-xs font-semibold text-foreground bg-muted px-3 py-1 rounded-full">
                                Summe: €{totalFixed.toFixed(2)}
                            </Badge>
                        </div>

                        {fixedCosts.length === 0 ? (
                            <p className="text-muted-foreground text-center py-8">Noch keine Fixkosten.</p>
                        ) : (
                            <div className="space-y-3">
                                {fixedCosts.sort((a, b) => {
                                    const now = new Date()
                                    const aTo = a.valid_to ? new Date(a.valid_to) : null
                                    const bTo = b.valid_to ? new Date(b.valid_to) : null
                                    const aExpired = aTo && aTo < now
                                    const bExpired = bTo && bTo < now

                                    // 1. Active first, Expired last
                                    if (aExpired && !bExpired) return 1
                                    if (!aExpired && bExpired) return -1

                                    // 2. Sort by amount desc
                                    return b.amount - a.amount
                                }).map(cost => {
                                    const now = new Date()
                                    const to = cost.valid_to ? new Date(cost.valid_to) : null
                                    const isExpired = to && to < now
                                    const isSavings = !!cost.linked_account_id
                                    const isEditing = editingCostId === cost.id

                                    if (isEditing) {
                                        return (
                                            <Card key={cost.id} className="rounded-2xl border-2 border-primary/60 shadow-md bg-card">
                                                <CardContent className="p-4 space-y-3">
                                                    <div className="flex gap-2">
                                                        <Input
                                                            value={editCostTitle}
                                                            onChange={e => setEditCostTitle(e.target.value)}
                                                            className="flex-[2] rounded-xl bg-muted border-transparent focus-visible:ring-primary"
                                                            placeholder="Titel"
                                                        />
                                                        <Input
                                                            type="number"
                                                            value={editCostAmount}
                                                            onChange={e => setEditCostAmount(e.target.value)}
                                                            className="flex-1 rounded-xl bg-muted border-transparent focus-visible:ring-primary"
                                                            placeholder="Betrag"
                                                        />
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <div className="flex-1">
                                                            <FieldLabel className="text-[10px] text-muted-foreground ml-1">Von</FieldLabel>
                                                            <DatePicker
                                                                date={editCostValidFrom}
                                                                setDate={setEditCostValidFrom}
                                                                className="rounded-xl bg-muted border-transparent focus-visible:ring-primary text-xs"
                                                            />
                                                        </div>
                                                        <div className="flex-1">
                                                            <FieldLabel className="text-[10px] text-muted-foreground ml-1">Bis</FieldLabel>
                                                            <DatePicker
                                                                date={editCostValidTo}
                                                                setDate={setEditCostValidTo}
                                                                placeholder="Optional"
                                                                className="rounded-xl bg-muted border-transparent focus-visible:ring-primary text-xs"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-end gap-2 pt-2">
                                                        <Button variant="ghost" size="sm" onClick={() => setEditingCostId(null)} className="rounded-xl">Abbrechen</Button>
                                                        <Button size="sm" onClick={handleSaveEditCost} className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground">Speichern</Button>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )
                                    }

                                    return (
                                        <div key={cost.id} className={`flex items-center justify-between p-4 rounded-xl border group ${isExpired ? 'bg-muted/40 border-border opacity-60' : 'bg-card border-border'} transition-colors duration-200`}>
                                            <div className="min-w-0 flex-1 mr-4">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <p className={`font-bold truncate text-lg ${isExpired ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{cost.title}</p>
                                                    {isSavings && (
                                                        <Badge variant="secondary" className="text-[10px] bg-[var(--chart-pos)]/10 text-[var(--chart-pos)] px-2 py-0 rounded-full font-semibold">
                                                            SPAREN
                                                        </Badge>
                                                    )}
                                                    {isExpired && (
                                                        <Badge variant="secondary" className="text-[10px] bg-muted text-muted-foreground px-2 py-0 rounded-full font-bold">
                                                            ABGELAUFEN
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className={`amount text-sm ${isExpired ? 'text-muted-foreground' : 'text-foreground'}`}>−€{cost.amount.toFixed(2)}</p>
                                                <div className="text-[10px] text-muted-foreground mt-1">
                                                    {cost.valid_from && `Ab: ${new Date(cost.valid_from).toLocaleDateString()} `}
                                                    {cost.valid_to && `- Bis: ${new Date(cost.valid_to).toLocaleDateString()}`}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Button variant="ghost" size="icon" onClick={() => handleStartEditCost(cost)} className="press text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl">
                                                    <FileText className="w-5 h-5" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => handleDeleteCost(cost.id)} className="press text-muted-foreground hover:text-[var(--chart-neg-heavy)] hover:bg-muted rounded-xl">
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
                            Diese Kosten werden automatisch von deinem monatlichen Budget abgezogen.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
