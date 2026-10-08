import type { Metadata } from 'next'
import LegalPage from '@/components/legal/LegalPage'
import { OPERATOR } from '@/lib/legal/operator'

export const metadata: Metadata = {
    title: 'Impressum · Mein Cashflow',
}

export default function ImpressumPage() {
    return (
        <LegalPage eyebrow="Rechtliches" title="Impressum">
            <section>
                <h2>Angaben zum Anbieter</h2>
                <p>
                    {OPERATOR.name}<br />
                    {OPERATOR.street}<br />
                    {OPERATOR.city}<br />
                    {OPERATOR.country}
                </p>
            </section>

            <section>
                <h2>Kontakt</h2>
                <p>
                    E-Mail: <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>
                </p>
            </section>

            <section>
                <h2>Verantwortlich für den Inhalt</h2>
                <p>{OPERATOR.name}, Anschrift wie oben.</p>
            </section>

            <section>
                <h2>Art des Angebots</h2>
                <p>
                    „Mein Cashflow“ ist ein privates, nicht kommerzielles Projekt. Die App ist kostenlos,
                    enthält keine Werbung und ist nur mit persönlichem Einladungscode nutzbar.
                </p>
            </section>

            <section>
                <h2>Keine Finanz- oder Steuerberatung</h2>
                <p>
                    Die App ist ein Werkzeug zur persönlichen Haushaltsplanung. Alle Berechnungen, Prognosen
                    und Auswertungen beruhen auf deinen eigenen Eingaben und erfolgen ohne Gewähr für
                    Richtigkeit oder Vollständigkeit. Sie stellen keine Finanz-, Anlage- oder Steuerberatung dar.
                </p>
            </section>

            <section>
                <h2>Haftung für Links</h2>
                <p>
                    Für Inhalte externer Seiten, auf die verlinkt wird, sind ausschließlich deren Betreiber
                    verantwortlich. Bei Bekanntwerden von Rechtsverstößen werden entsprechende Links umgehend entfernt.
                </p>
            </section>
        </LegalPage>
    )
}
