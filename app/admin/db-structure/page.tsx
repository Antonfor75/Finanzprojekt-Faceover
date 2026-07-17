'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Database, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { getSchemaDiagram } from '@/app/actions/admin'

export default function DBStructurePage() {
    const router = useRouter()
    const mermaidRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const [diagramCode, setDiagramCode] = useState<string>('')
    const [scale, setScale] = useState(1)
    const [position, setPosition] = useState({ x: 0, y: 0 })
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

    useEffect(() => {
        // Fetch dynamic schema
        getSchemaDiagram().then(res => {
            if (res.success && res.diagram) {
                setDiagramCode(res.diagram)
            } else {
                setDiagramCode('graph TD; Error[Fehler beim Laden] --> CheckConsole')
                console.error(res.error)
            }
        })
    }, [])

    useEffect(() => {
        if (!diagramCode) return

        // Load mermaid
        const script = document.createElement('script')
        script.src = 'https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js'
        script.async = true
        script.onload = () => {
            // @ts-ignore
            window.mermaid.initialize({ startOnLoad: true, theme: 'neutral', securityLevel: 'loose' })
            // @ts-ignore
            window.mermaid.run({
                nodes: [mermaidRef.current]
            })
        }
        document.body.appendChild(script)
        return () => { document.body.removeChild(script) }
    }, [diagramCode])

    // Zoom Handlers
    const handleZoomIn = () => setScale(s => Math.min(s + 0.2, 3))
    const handleZoomOut = () => setScale(s => Math.max(s - 0.2, 0.5))
    const handleReset = () => { setScale(1); setPosition({ x: 0, y: 0 }) }

    // Drag/Pan Handlers — Pointer Events decken Maus und Touch gemeinsam ab
    const handlePointerDown = (e: React.PointerEvent) => {
        setIsDragging(true)
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
        // Pointer einfangen, damit das Ziehen auch außerhalb des Containers weiterläuft
        e.currentTarget.setPointerCapture(e.pointerId)
    }
    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return
        setPosition({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        })
    }
    const handlePointerUp = (e: React.PointerEvent) => {
        setIsDragging(false)
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId)
        }
    }


    return (
        <div className="h-dvh bg-[#f8f5e6] p-4 md:p-8 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] font-['Patrick_Hand'] text-[#333] overflow-hidden">
            <div className="max-w-7xl mx-auto h-full flex flex-col">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4 flex-shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <button
                            onClick={() => router.back()}
                            aria-label="Zurück"
                            className="p-2 bg-white rounded-full border-2 border-[#333] hover:bg-gray-50 transition-colors shadow-sm shrink-0"
                        >
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                        <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-2 min-w-0">
                            <Database className="w-6 h-6 sm:w-8 sm:h-8 text-purple-600 shrink-0" />
                            <span className="truncate">Live DB Struktur</span>
                        </h1>
                    </div>

                    {/* Controls */}
                    <div className="flex gap-2 bg-white p-2 rounded-xl border border-gray-200 shadow-sm z-10 shrink-0">
                        <button onClick={handleZoomOut} className="p-2 hover:bg-gray-100 rounded-lg" title="Zoom Out"><ZoomOut className="w-5 h-5" /></button>
                        <button onClick={handleReset} className="p-2 hover:bg-gray-100 rounded-lg" title="Reset View"><RotateCcw className="w-5 h-5" /></button>
                        <button onClick={handleZoomIn} className="p-2 hover:bg-gray-100 rounded-lg" title="Zoom In"><ZoomIn className="w-5 h-5" /></button>
                    </div>
                </div>

                {/* Diagram Viewport */}
                <div
                    ref={containerRef}
                    className="flex-1 bg-white rounded-[20px] shadow-sm border border-gray-100 overflow-hidden relative cursor-move touch-none"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                >
                    <p className="absolute top-4 left-4 text-gray-400 text-xs font-mono z-10 pointer-events-none">
                        * Generiert live aus src/db/schema.ts<br />
                        * Drag & Drop zum Verschieben, Controls zum Zoomen
                    </p>

                    <div
                        className="mermaid origin-center absolute top-1/2 left-1/2 transition-transform duration-75 ease-linear"
                        ref={mermaidRef}
                        style={{
                            transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px) scale(${scale})`,
                        }}
                    >
                        {diagramCode}
                    </div>
                </div>
            </div>
        </div>
    )
}
