'use client'

import dynamic from 'next/dynamic'
import { ArrowLeft, Trash2, Pencil, Download, ChevronDown } from 'lucide-react'
import { endOfWeek, format } from 'date-fns'
import { de } from 'date-fns/locale'

import CalendarHistory from '../CalendarHistory'
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"

import { Expense, FixedCost, Account, IncomeSource, ReceiptItem, Product } from '@/app/types'

import { ViewLoading } from './ViewLoading'
import type { GirokontoTimelineResult } from '@/utils/girokonto'
import { isTransferExpense } from '@/utils/transfer'

const AnalysisView = dynamic(() => import('../AnalysisView'), { ssr: false, loading: ViewLoading })

// Historie (Kalender · Liste · Analyse) — aus MobileDashboard.tsx herausgelöst, Markup unverändert.
// Der Zustand (Modus, Ebene, Auswahl) bleibt im Dashboard, damit er beim Wechseln der Ansicht erhalten bleibt.
type HistoryViewProps = {
    historyMode: 'calendar' | 'list' | 'analysis'
    setHistoryMode: React.Dispatch<React.SetStateAction<'calendar' | 'list' | 'analysis'>>
    viewLevel: 'weeks' | 'days' | 'transactions'
    handleBackHistory: () => void
    handleCalendarDayClick: (date: Date) => void
    handleWeekClick: (start: Date) => void
    handleDayClick: (date: Date) => void
    getWeeklyGroups: () => { start: Date, total: number, count: number }[]
    getDailyGroups: () => { date: Date, total: number, count: number }[]
    getTransactions: () => Expense[]
    expandedExpenseId: number | null
    setExpandedExpenseId: (id: number | null) => void
    setEditingExpense: (expense: Expense | null) => void
    deleteExpenseLocal: (id: number) => Promise<void>
    itemsByExpense: Map<number, ReceiptItem[]>
    generatePDF: () => void
    expenses: Expense[]
    weeklyBudget: number
    currentGiroBalance: number
    girokontoTimeline: GirokontoTimelineResult
    initialFixedCosts: FixedCost[]
    initialAccounts: Account[]
    initialIncomeSources: IncomeSource[]
    receiptItems: ReceiptItem[]
    products: Product[]
    receiptsLoading: boolean
}

export default function HistoryView({ historyMode, setHistoryMode, viewLevel, handleBackHistory, handleCalendarDayClick, handleWeekClick, handleDayClick, getWeeklyGroups, getDailyGroups, getTransactions, expandedExpenseId, setExpandedExpenseId, setEditingExpense, deleteExpenseLocal, itemsByExpense, generatePDF, expenses, weeklyBudget, currentGiroBalance, girokontoTimeline, initialFixedCosts, initialAccounts, initialIncomeSources, receiptItems, products, receiptsLoading }: HistoryViewProps) {
    return (
        <div className="w-full h-full flex flex-col pt-[env(safe-area-inset-top)] px-4 pb-0 max-w-xl mx-auto view-enter">
            {/* Header & Tabs */}
            <div className="flex flex-col gap-2 mb-1 shrink-0 mt-3">
                <Tabs value={historyMode} onValueChange={(val: any) => setHistoryMode(val)} className="w-full">
                    <TabsList data-tour="history-tabs" className="flex w-full rounded-xl p-1 h-auto bg-muted/70">
                        <TabsTrigger value="calendar" className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 data-[state=active]:text-foreground data-[state=active]:bg-card data-[state=active]:shadow-sm">Kalender</TabsTrigger>
                        <TabsTrigger value="list" className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 data-[state=active]:text-foreground data-[state=active]:bg-card data-[state=active]:shadow-sm">Liste</TabsTrigger>
                        <TabsTrigger value="analysis" className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 data-[state=active]:text-foreground data-[state=active]:bg-card data-[state=active]:shadow-sm">Analyse</TabsTrigger>
                    </TabsList>
                </Tabs>

                {/* Back Button (Only if going deep) */}
                <div className={`flex items-center justify-start ${viewLevel === 'weeks' ? 'hidden' : 'block'}`}>
                    <button
                        onClick={() => viewLevel !== 'weeks' && handleBackHistory()}
                        className="press flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors duration-200 py-1"
                    >
                        <ArrowLeft className="w-4 h-4" strokeWidth={2} />
                        <span className="text-sm font-medium">Zurück</span>
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 p-4 pb-32 overflow-y-auto relative">
                {historyMode === 'list' && (
                    <button
                        onClick={generatePDF}
                        className="press absolute right-4 top-4 text-muted-foreground hover:text-foreground text-xs font-medium flex items-center gap-1.5 z-10 bg-card border border-border px-2.5 py-1.5 rounded-lg transition-colors duration-200"
                    >
                        <Download className="w-3.5 h-3.5" strokeWidth={1.75} /> PDF
                    </button>
                )}

                {historyMode === 'analysis' ? (
                    <AnalysisView
                        expenses={expenses}
                        budget={weeklyBudget}
                        fixedCosts={initialFixedCosts}
                        accounts={initialAccounts}
                        incomeSources={initialIncomeSources}
                        currentGiroBalance={currentGiroBalance}
                        girokontoTimeline={girokontoTimeline}
                        receiptItems={receiptItems}
                        products={products}
                        receiptsLoading={receiptsLoading}
                    />
                ) : historyMode === 'calendar' ? (
                    <CalendarHistory
                        expenses={expenses}
                        weeklyBudget={weeklyBudget}
                        onDayClick={handleCalendarDayClick}
                    />
                ) : (
                    <div className="stagger-children pt-8">
                        {viewLevel === 'weeks' && (
                            getWeeklyGroups().map((group, idx) => (
                                <button key={idx} onClick={() => handleWeekClick(group.start)} className="ledger-row w-full text-left cursor-pointer group">
                                    <div>
                                        <p className="text-base font-semibold text-foreground">KW {format(group.start, 'w', { locale: de })}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">{format(group.start, 'dd.MM.')} – {format(endOfWeek(group.start, { weekStartsOn: 1 }), 'dd.MM.yyyy')}</p>
                                    </div>
                                    <div className="amount text-base text-foreground group-hover:text-primary transition-colors duration-200">€{group.total.toFixed(2)}</div>
                                </button>
                            ))
                        )}
                        {viewLevel === 'days' && (
                            getDailyGroups().map((group, idx) => (
                                <button key={idx} onClick={() => handleDayClick(group.date)} className="ledger-row w-full text-left cursor-pointer group">
                                    <div className="flex items-baseline gap-3">
                                        <span className="amount text-sm text-muted-foreground">{format(group.date, 'dd.MM')}</span>
                                        <span className="text-base font-semibold text-foreground">{format(group.date, 'EEEE', { locale: de })}</span>
                                    </div>
                                    <div className="amount text-base text-foreground group-hover:text-primary transition-colors duration-200">€{group.total.toFixed(2)}</div>
                                </button>
                            ))
                        )}
                        {viewLevel === 'transactions' && (
                            getTransactions().map(expense => {
                                const items = itemsByExpense.get(expense.id)
                                const isExpanded = expandedExpenseId === expense.id
                                return (
                                    <div key={expense.id}>
                                        <div
                                            className={`ledger-row ${items ? 'cursor-pointer' : ''}`}
                                            onClick={() => { if (items) setExpandedExpenseId(isExpanded ? null : expense.id) }}
                                        >
                                            <div className="min-w-0 flex-1 mr-4">
                                                <div className="flex items-center gap-1.5">
                                                    <p className="font-medium text-foreground truncate">{expense.description}</p>
                                                    {items && (
                                                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} strokeWidth={2} />
                                                    )}
                                                </div>
                                                {expense.category && <span className="eyebrow">{expense.category}</span>}
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {isTransferExpense(expense) ? (
                                                    <span className="amount text-base text-muted-foreground" title="Umbuchung – keine Ausgabe">⇄ €{Math.abs(expense.amount).toFixed(2)}</span>
                                                ) : (
                                                    <span className="amount text-base text-foreground">{expense.amount < 0 ? '+' : '−'}€{Math.abs(expense.amount).toFixed(2)}</span>
                                                )}
                                                <div className="flex gap-1">
                                                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setEditingExpense(expense) }} className="press w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
                                                        <Pencil className="w-4 h-4" strokeWidth={1.75} />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={async (e) => { e.stopPropagation(); if (confirm('Löschen?')) await deleteExpenseLocal(expense.id) }} className="press w-8 h-8 rounded-lg text-muted-foreground hover:text-[var(--chart-neg-heavy)] hover:bg-muted">
                                                        <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                        {items && isExpanded && (
                                            <div className="pl-4 pr-2 pb-3 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                                {items.map(item => (
                                                    <div key={item.id} className="flex items-center justify-between text-sm">
                                                        <span className="text-muted-foreground truncate mr-3">
                                                            {item.name_raw}
                                                            {item.unit && (
                                                                <span className="text-xs ml-1.5 opacity-70">
                                                                    {Number(item.quantity)} {item.unit === 'kg' ? 'kg' : '×'}{item.unit_price ? ` à €${Number(item.unit_price).toFixed(2)}` : ''}
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span className={`amount text-xs shrink-0 ${Number(item.total_price) < 0 ? 'text-[var(--chart-pos)]' : 'text-muted-foreground'}`}>
                                                            €{Number(item.total_price).toFixed(2)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )
                            })
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
