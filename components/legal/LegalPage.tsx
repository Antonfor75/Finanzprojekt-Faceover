import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

/**
 * Gemeinsamer Rahmen für Impressum und Datenschutz: öffentlich, ohne Login,
 * scrollbar und im selben Look wie Login- und Reset-Seite.
 */
export default function LegalPage({
    eyebrow,
    title,
    children,
}: {
    eyebrow: string
    title: string
    children: React.ReactNode
}) {
    return (
        <div className="h-[100dvh] w-full overflow-y-auto bg-background relative">
            <div className="ambient-bg" />
            <main className="relative z-10 mx-auto w-full max-w-2xl px-4 sm:px-6 py-10 view-enter">
                <Link
                    href="/"
                    className="flex items-center gap-1.5 eyebrow mb-3 hover:text-foreground transition-colors duration-200 w-fit"
                >
                    <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} />
                    Zurück zur App
                </Link>
                <p className="eyebrow mb-2">{eyebrow}</p>
                <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-foreground mb-8 break-words hyphens-auto">
                    {title}
                </h1>
                <div className="surface p-6 sm:p-8 flex flex-col gap-7 text-sm leading-relaxed text-muted-foreground [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-3 [&_h3]:mb-1 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1 [&_strong]:text-foreground [&_strong]:font-semibold">
                    {children}
                </div>
                <nav className="mt-8 flex justify-center gap-4 text-xs text-muted-foreground">
                    <Link href="/impressum" className="hover:text-foreground transition-colors">Impressum</Link>
                    <span aria-hidden>·</span>
                    <Link href="/datenschutz" className="hover:text-foreground transition-colors">Datenschutz</Link>
                </nav>
            </main>
        </div>
    )
}
