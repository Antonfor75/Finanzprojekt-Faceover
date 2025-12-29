'use client'

import { useMemo } from 'react'
import { startOfWeek, endOfWeek, isWithinInterval, getDay, format, startOfToday, eachDayOfInterval, addDays } from 'date-fns'
import { de } from 'date-fns/locale'

import { Expense } from '@/app/types'

type Props = {
    expenses: Expense[]
}

export default function WeeklyBarChart({ expenses }: Props) {
    const { days, maxValue } = useMemo(() => {
        const now = new Date()
        // Ensure week starts on Monday (1)
        const start = startOfWeek(now, { weekStartsOn: 1 })
        const end = endOfWeek(now, { weekStartsOn: 1 })

        // 1. Filter current week expenses
        const currentWeekExpenses = expenses.filter(e => {
            const date = new Date(e.expense_date || e.created_at)
            return isWithinInterval(date, { start, end })
        })

        // 2. Initialize days array (0 = Mo, 6 = So)
        // Adjust getDay(): Sunday is 0, Monday is 1... we want Monday=0 index
        const dayTotals = new Array(7).fill(0)

        currentWeekExpenses.forEach(e => {
            const date = new Date(e.expense_date || e.created_at)
            // getDay returns 0 for Sunday, 1 for Monday.
            // visual index: Mon=0, Tue=1... Sun=6
            let dayIndex = getDay(date) // 0-6
            // Shift: 0(Sun) -> 6, 1(Mon) -> 0
            dayIndex = dayIndex === 0 ? 6 : dayIndex - 1

            if (dayIndex >= 0 && dayIndex < 7) {
                dayTotals[dayIndex] += e.amount
            }
        })

        // 3. Prepare visual data
        const weekDays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
        const daysData = dayTotals.map((total, index) => ({
            label: weekDays[index],
            value: total
        }))

        const max = Math.max(...dayTotals, 1) // Avoid div by zero

        return { days: daysData, maxValue: max }
    }, [expenses])

    return (
        <div className="bg-white rounded-2xl p-4 mb-6 shadow-sm border-2 border-gray-100">
            <h3 className="text-sm text-gray-500 mb-4 font-bold uppercase tracking-wider">Diese Woche</h3>

            <div className="flex justify-between items-end h-32 px-2 gap-2">
                {days.map((day, idx) => {
                    const heightPercent = Math.round((day.value / maxValue) * 100)
                    const isPositive = day.value > 0

                    return (
                        <div key={idx} className="flex flex-col items-center w-full group">
                            {/* Tooltip-ish value on hover (optional but nice) */}
                            <div className="opacity-0 group-hover:opacity-100 absolute -mt-6 bg-black text-white text-xs rounded px-1 transition-opacity">
                                €{day.value.toFixed(0)}
                            </div>

                            {/* Bar */}
                            <div
                                className={`w-full max-w-[20px] rounded-t-lg transition-all duration-500 ease-out ${isPositive ? 'bg-blue-500 shadow-md' : 'bg-gray-100'}`}
                                style={{ height: `${Math.max(heightPercent, 4)}%` }} // Min height for visibility
                            ></div>

                            {/* Label */}
                            <span className="text-xs text-gray-400 mt-2 font-medium">{day.label}</span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
