'use client'

import { useState } from 'react'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns'
import { de } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Expense } from '@/app/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
    expenses: Expense[]
    weeklyBudget: number
    onDayClick: (date: Date) => void
}

export default function CalendarHistory({ expenses, weeklyBudget, onDayClick }: Props) {
    const [currentMonth, setCurrentMonth] = useState(new Date())
    const dailyBudget = weeklyBudget / 7

    const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1))
    const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1))

    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 })
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 })

    const calendarDays = eachDayOfInterval({ start: startDate, end: endDate })

    const getDailyTotal = (date: Date) => {
        return expenses
            .filter(e => isSameDay(new Date(e.expense_date || e.created_at), date))
            .reduce((acc, curr) => acc + Number(curr.amount), 0)
    }

    return (
        <div className="flex flex-col h-full w-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-6 px-1">
                <Button variant="ghost" size="icon" onClick={prevMonth} className="rounded-full hover:bg-muted/80 w-10 h-10 active:scale-95 transition-transform">
                    <ChevronLeft className="w-5 h-5 text-muted-foreground" />
                </Button>
                <h2 className="text-[22px] font-semibold tracking-tight text-foreground">
                    {format(currentMonth, 'MMMM yyyy', { locale: de })}
                </h2>
                <Button variant="ghost" size="icon" onClick={nextMonth} className="rounded-full hover:bg-muted/80 w-10 h-10 active:scale-95 transition-transform">
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </Button>
            </div>

            {/* Weekday Headers */}
            <div className="grid grid-cols-7 mb-3 text-center text-[11px] text-muted-foreground/60 font-semibold uppercase tracking-wider">
                {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(day => (
                    <div key={day}>{day}</div>
                ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-2 flex-1 auto-rows-[1fr]">
                {calendarDays.map((day, idx) => {
                    const dailyTotal = getDailyTotal(day)
                    const isOverBudget = dailyTotal > dailyBudget
                    const hasExpenses = dailyTotal > 0
                    const isCurrentMonth = isSameMonth(day, currentMonth)
                    const isToday = isSameDay(day, new Date())

                    return (
                        <div
                            key={idx}
                            onClick={() => onDayClick(day)}
                            className={cn(
                                "relative rounded-2xl flex flex-col items-center justify-between p-1.5 h-24 sm:h-28 hover:scale-[1.02] transition-all cursor-pointer overflow-hidden",
                                isCurrentMonth ? "bg-white/60 dark:bg-black/20 backdrop-blur-xl shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-white/40 dark:border-white/10" : "bg-transparent opacity-30",
                                hasExpenses && isOverBudget && isCurrentMonth ? "bg-red-50/50 dark:bg-red-950/20 border-red-100 dark:border-red-900/30" : ""
                            )}
                        >
                            {/* Date Number Top Left */}
                            <div className="w-full flex justify-start">
                                <span className={cn(
                                    "flex items-center justify-center text-[13px] font-medium w-6 h-6 rounded-full transition-colors",
                                    isToday ? "bg-primary text-primary-foreground font-bold shadow-md" : (isCurrentMonth ? "text-foreground" : "text-muted-foreground"),
                                    hasExpenses && isOverBudget && !isToday ? "text-red-600 dark:text-red-400" : ""
                                )}>
                                    {format(day, 'd')}
                                </span>
                            </div>

                            {/* Expenses Bottom */}
                            {hasExpenses && (
                                <div className="w-full flex justify-center mt-auto pb-1">
                                    <span
                                        className={cn(
                                            "text-[11px] sm:text-xs font-bold tracking-tight px-1.5 py-0.5 rounded-lg w-full text-center truncate",
                                            isOverBudget 
                                                ? "text-red-600 bg-red-100/50 dark:bg-red-900/30 dark:text-red-400" 
                                                : "text-foreground/80 bg-muted/50"
                                        )}
                                    >
                                        -€{dailyTotal.toFixed(0)}
                                    </span>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            <div className="mt-8 text-center pb-2">
                <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/50 bg-muted/40 px-4 py-2 rounded-full border border-border/30">
                    Tagesbudget: €{dailyBudget.toFixed(2)}
                </span>
            </div>
        </div>
    )
}
