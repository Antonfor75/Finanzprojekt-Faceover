
'use client'

import { X, TrendingUp, Calendar, PiggyBank, Divide, Upload, CheckCircle, AlertCircle } from 'lucide-react'

export default function HelpModal({ onClose }: { onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-[#1a1a1a] dark:text-gray-100 w-full max-w-2xl rounded-3xl shadow-2xl h-[85vh] flex flex-col font-['Patrick_Hand'] overflow-hidden relative">

                {/* Header */}
                <div className="p-6 border-b border-gray-100 dark:border-white/10 flex justify-between items-center bg-white dark:bg-[#1a1a1a] z-10">
                    <div>
                        <h2 className="text-2xl font-bold">Wie die App "denkt" 🧠</h2>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Die 4 Säulen deiner Finanz-Intelligenz</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-10">

                    {/* Intro */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-2xl flex gap-4 items-start">
                        <div className="bg-blue-100 dark:bg-blue-800 p-2 rounded-xl text-blue-600 dark:text-blue-200 mt-1">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg mb-1">Dein wahres Budget</h3>
                            <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-sm">
                                Diese App berechnet nicht nur Einnahmen minus Ausgaben. Sie glättet unregelmäßige Zahlungen, damit du genau weißt, was du <span className="font-bold underline">heute</span> wirklich ausgeben kannst.
                            </p>
                        </div>
                    </div>

                    {/* 1. Monthly Smoothing */}
                    <section className="space-y-3">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center font-bold">1</div>
                            <h3 className="text-xl font-bold">Monatliches Glätten (Einnahmen)</h3>
                        </div>
                        <div className="pl-10 space-y-2 text-gray-600 dark:text-gray-300">
                            <p>Jährliche Boni oder Dividenden verfälschen oft die Monatsstatistik. Wir machen es anders:</p>
                            <div className="bg-gray-50 dark:bg-white/5 p-3 rounded-xl border border-dashed border-gray-200 dark:border-white/10 flex items-center gap-4 text-sm">
                                <span className="font-mono bg-white dark:bg-black px-2 py-1 rounded border dark:border-white/10">1200€ Jährlich</span>
                                <Divide className="w-4 h-4 text-gray-400" />
                                <span className="font-mono bg-white dark:bg-black px-2 py-1 rounded border dark:border-white/10">12 Monate</span>
                                <span>=</span>
                                <span className="font-bold text-green-600 dark:text-green-400">100€ / Monat</span>
                            </div>
                            <p className="text-sm italic text-gray-400">Vorteil: Kein "falscher Reichtum" im Bonus-Monat, sondern konstante Planungssicherheit.</p>
                        </div>
                    </section>

                    {/* 2. Intelligent Fixed Costs */}
                    <section className="space-y-3">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center font-bold">2</div>
                            <h3 className="text-xl font-bold">Intelligente Fixkosten</h3>
                        </div>
                        <div className="pl-10 space-y-2 text-gray-600 dark:text-gray-300">
                            <p>Miete, Netflix, Versicherungen... Die App beachtet das <strong className="text-black dark:text-white">Enddatum</strong>.</p>
                            <div className="flex gap-2 items-center text-sm bg-red-50 dark:bg-red-900/10 p-2 rounded-lg inline-block">
                                <Calendar className="w-4 h-4 text-red-500" />
                                <span>Vertrag endet im Dezember? Ab Januar automatisch 0€!</span>
                            </div>
                        </div>
                    </section>

                    {/* 3. Special Accounts */}
                    <section className="space-y-3">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">3</div>
                            <h3 className="text-xl font-bold">Die Spezial-Konten ❤️</h3>
                        </div>
                        <div className="pl-10 space-y-4 text-gray-600 dark:text-gray-300">

                            <div className="border border-purple-100 dark:border-purple-800/30 rounded-xl p-3">
                                <h4 className="font-bold text-purple-600 dark:text-purple-300 flex items-center gap-2 mb-1">
                                    <PiggyBank className="w-4 h-4" /> A. Sparziel ("Ich will kaufen")
                                </h4>
                                <p className="text-sm mb-2">Du willst z.B. 12.000€ für ein Auto in 2 Jahren?</p>
                                <div className="text-xs font-mono bg-gray-50 dark:bg-black/50 p-2 rounded text-gray-500 dark:text-gray-400">
                                    Sparrate = (Ziel - Start) / Laufzeit
                                </div>
                                <p className="text-sm mt-2 text-purple-800 dark:text-purple-200">
                                    Diese Rate wird <strong>sofort vom Budget abgezogen</strong>. Du "bezahlst" deinen Traum zuerst!
                                </p>
                            </div>

                            <div className="border border-blue-100 dark:border-blue-800/30 rounded-xl p-3">
                                <h4 className="font-bold text-blue-600 dark:text-blue-300 flex items-center gap-2 mb-1">
                                    <Divide className="w-4 h-4" /> B. Aufteil-Konto ("Geld bekommen")
                                </h4>
                                <p className="text-sm">
                                    Steuerrückzahlung von 2.000€? Statt alles sofort auszugeben, lege es hier an (z.B. für 10 Monate).
                                    Du bekommst dann <strong>virtuell +200€ monatlich</strong> dazu.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* 4. Import Wizard */}
                    <section className="space-y-3">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center font-bold">4</div>
                            <h3 className="text-xl font-bold">Der Import-Wizard 🪄</h3>
                        </div>
                        <div className="pl-10 space-y-2 text-gray-600 dark:text-gray-300">
                            <p>Kopiere einfach alles in das Textfeld. Wir verstehen das Format:</p>
                            <pre className="bg-gray-800 text-gray-100 p-3 rounded-xl text-xs font-mono overflow-x-auto">
                                {`# Konten
Girokonto; 2500
Sparbuch; 10000; Savings

# Fixkosten
Miete; 950; 01.01.2024
Netflix; 17.99

# Einnahmen
Gehalt; 3200; monthly

# Ausgaben
05.02.2026 -12,99 EUR REWE
04.02.2026 -45,00 EUR Tankstelle`}
                            </pre>
                            <p className="text-xs text-gray-400">Tipp: Nutze im Import-Fenster den Button "Beispiel laden".</p>
                        </div>
                    </section>

                    {/* 5. Analysis & Girokonto */}
                    <div className="grid md:grid-cols-2 gap-4">
                        <section className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl space-y-2">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 flex items-center justify-center font-bold">5</div>
                                <h3 className="font-bold">Die Analyse 📊</h3>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                Hier siehst du die "nackte Wahrheit":
                            </p>
                            <ul className="text-sm list-disc pl-4 space-y-1 text-gray-600 dark:text-gray-300">
                                <li><strong>Cashflow:</strong> Gibst du mehr aus als rein kommt?</li>
                                <li><strong>Struktur:</strong> Wofür geht dein Geld wirklich drauf?</li>
                                <li><strong>Trend:</strong> Wächst dein Vermögen oder schrumpft es?</li>
                            </ul>
                        </section>

                        <section className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-xl space-y-2">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 flex items-center justify-center font-bold">6</div>
                                <h3 className="font-bold">Der Giro-Wert 🏦</h3>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                Auf der Startseite steht dein <strong>theoretischer Kontostand</strong>.
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Er summiert alle Einnahmen & Ausgaben seit Tag 1.
                                Weicht er von der Realität ab? Dann hast du eine Ausgabe vergessen! 🧐
                            </p>
                        </section>
                    </div>

                    {/* Bottom Line */}
                    <div className="bg-gradient-to-r from-gray-100 to-gray-50 dark:from-white/5 dark:to-transparent p-4 rounded-xl text-center mt-6">
                        <h4 className="font-bold mb-2">Dein Ziel: Der grüne Bereich</h4>
                        <div className="flex justify-center gap-4 text-sm">
                            <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                <CheckCircle className="w-4 h-4" /> Einnahmen &gt; Ausgaben
                            </div>
                            <div className="flex items-center gap-1 text-red-500 dark:text-red-400">
                                <AlertCircle className="w-4 h-4" /> Ausgaben zu hoch
                            </div>
                        </div>
                    </div>

                </div>

                {/* Footer Action */}
                <div className="p-4 border-t border-gray-100 dark:border-white/10 bg-white dark:bg-[#1a1a1a]">
                    <button
                        onClick={onClose}
                        className="w-full py-3 bg-black dark:bg-white dark:text-black text-white rounded-xl font-bold text-lg hover:opacity-90 active:scale-95 transition-all"
                    >
                        Alles klar, verstanden! 🚀
                    </button>
                </div>
            </div>
        </div>
    )
}
