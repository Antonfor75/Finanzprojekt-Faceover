'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Calculator } from 'lucide-react'

export default function CalculationsPage() {
    const router = useRouter()
    const mermaidRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const script = document.createElement('script')
        script.src = 'https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js'
        script.async = true
        script.onload = () => {
            // @ts-ignore
            window.mermaid.initialize({ startOnLoad: true, theme: 'neutral', flowchart: { curve: 'basis' } })
            // @ts-ignore
            window.mermaid.contentLoaded()
        }
        document.body.appendChild(script)

        return () => {
            document.body.removeChild(script)
        }
    }, [])

    const diagram = `
    flowchart TD
        subgraph Inputs [Eingaben & Datenbank]
            I[Einkommensquellen]:::input
            F[Fixkosten]:::input
            S[Monatsbudget Einstellung]:::input
        end

        subgraph CoreLogic [Kern-Logik]
            Calc1("Einnahmen - Fixkosten - Monatsbudget = Sparbetrag"):::logic
            Calc2("Monatsbudget / 4.33 = Wochenbudget"):::logic
            Calc3("Wochenbudget - Ausgaben = Restbetrag"):::logic
        end

        subgraph Outputs [Ergebnisse]
            R1[Wöchentliches Budget]:::result
            R2[Monatliches Sparziel]:::result
            R3[Daily Spendable]:::result
        end

        I --> Calc1
        F --> Calc1
        S --> Calc1
        S --> Calc2
        
        Calc1 --> R2
        Calc2 --> R1
        
        R1 --> Calc3
        Calc3 --> R3

        classDef input fill:#e1f5fe,stroke:#01579b,stroke-width:2px;
        classDef logic fill:#fff9c4,stroke:#fbc02d,stroke-width:2px,rx:10,ry:10;
        classDef result fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px;
    `

    return (
        <div className="h-dvh w-full bg-[#f8f5e6] p-4 md:p-8 font-['Patrick_Hand'] text-[#333] overflow-y-auto">
            <div className="max-w-6xl mx-auto pb-20">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.back()}
                            className="p-2 bg-white rounded-full border-2 border-[#333] hover:bg-gray-50 transition-colors shadow-sm"
                        >
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                        <h1 className="text-3xl font-bold flex items-center gap-2">
                            <Calculator className="w-8 h-8 text-green-600" />
                            Berechnungs-Logik
                        </h1>
                    </div>
                </div>

                {/* Explanation Cards */}
                <div className="grid md:grid-cols-2 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-[20px] border border-gray-100 shadow-sm">
                        <h3 className="text-xl font-bold mb-2">Der Faktor 4.33</h3>
                        <p className="text-gray-600">
                            Ein Jahr hat 52 Wochen. Ein Jahr hat 12 Monate.<br />
                            <code>52 / 12 = 4.333...</code>
                        </p>
                        <p className="mt-2 text-gray-600">
                            Deshalb teilen wir das Monatsbudget durch <strong>4.33</strong>, um ein realistisches Wochenlimit zu erhalten, das auch Monate mit 5 Wochenenden abdeckt.
                        </p>
                    </div>

                    <div className="bg-white p-6 rounded-[20px] border border-gray-100 shadow-sm">
                        <h3 className="text-xl font-bold mb-2">Sparquote</h3>
                        <p className="text-gray-600">
                            Alles, was nicht für Fixkosten oder das variable Wochenbudget (Essen, Freizeit) verplant ist, wandert automatisch in den "Topf" für das Sparziel.
                        </p>
                    </div>
                </div>

                {/* Diagram Card */}
                <div className="bg-white rounded-[20px] p-8 shadow-sm border border-gray-100 overflow-x-auto text-center">
                    <h2 className="text-2xl font-bold mb-6">Visuelle Formeln</h2>
                    <div className="mermaid flex justify-center min-w-[600px]" ref={mermaidRef}>
                        {diagram}
                    </div>
                </div>
            </div>
        </div>
    )
}
