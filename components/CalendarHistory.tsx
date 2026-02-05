'use client'

import { useState } from 'react'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns'
import { de } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Expense } from '@/app/types'

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
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
                <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-full">
                    <ChevronLeft className="w-8 h-8" />
                </button>
                <h2 className="text-2xl font-bold">
                    {format(currentMonth, 'MMMM yyyy', { locale: de })}
                </h2>
                <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-full">
                    <ChevronRight className="w-8 h-8" />
                </button>
            </div>

            {/* Weekday Headers */}
            <div className="grid grid-cols-7 mb-2 text-center text-gray-500 font-bold">
                {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(day => (
                    <div key={day}>{day}</div>
                ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1 flex-1">
                {calendarDays.map((day, idx) => {
                    const dailyTotal = getDailyTotal(day)
                    const isOverBudget = dailyTotal > dailyBudget
                    const hasExpenses = dailyTotal > 0
                    const isCurrentMonth = isSameMonth(day, currentMonth)

                    const boxStyle = hasExpenses
                        ? (isOverBudget ? { backgroundColor: '#dc2626' } : { backgroundColor: '#16a34a' })
                        : {}

                    return (
                        <div
                            key={idx}
                            onClick={() => onDayClick(day)}
                            className={`
                                relative p-2 border rounded-lg flex flex-col items-center justify-start h-24 hover:scale-105 transition-transform cursor-pointer
                                ${!isCurrentMonth ? 'bg-gray-50 text-gray-400' : 'bg-white'}
                                ${isSameDay(day, new Date()) ? 'border-blue-500 border-4' : 'border-gray-200'}
                            `}
                            style={hasExpenses ? boxStyle : {}}
                        >
                            <span className={`text-sm font-bold mb-1 ${hasExpenses ? 'text-white' : ''}`}>
                                {format(day, 'd')}
                            </span>

                            {hasExpenses && (
                                <div className="flex flex-col items-center w-full mt-auto mb-auto">
                                    <span
                                        className="text-lg font-black text-black"
                                        style={{ textShadow: '0px 0px 5px rgba(255,255,255,0.7)' }}
                                    >
                                        €{dailyTotal.toFixed(0)}
                                    </span>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            <div className="mt-4 text-center text-sm text-gray-500">
                Tagesbudget: €{dailyBudget.toFixed(2)}
            </div>
        </div>
    )
}
