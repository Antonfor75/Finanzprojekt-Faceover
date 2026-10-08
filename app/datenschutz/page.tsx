import type { Metadata } from 'next'
import LegalPage from '@/components/legal/LegalPage'
import { OPERATOR, PRIVACY_DATE } from '@/lib/legal/operator'

export const metadata: Metadata = {
    title: 'Datenschutz · Mein Cashflow',
}

export default function DatenschutzPage() {
    return (
        <LegalPage eyebrow="Rechtliches" title="Datenschutzerklärung">
            <section>
                <h2>1. Verantwortlicher</h2>
                <p>
                    Verantwortlich für die Datenverarbeitung im Sinne der DSGVO ist:<br />
                    {OPERATOR.name}, {OPERATOR.street}, {OPERATOR.city}<br />
                    E-Mail: <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>
                </p>
            </section>

            <section>
                <h2>2. Worum es geht</h2>
                <p>
                    „Mein Cashflow“ ist ein privates, kostenloses Budget-Werkzeug. Es werden nur die Daten
                    verarbeitet, die für den Betrieb der App nötig sind. Es gibt <strong>kein Tracking,
                    keine Werbung, keine Analyse-Tools und keine Weitergabe an Dritte</strong> zu eigenen Zwecken.
                </p>
            </section>

            <section>
                <h2>3. Welche Daten verarbeitet werden</h2>
                <h3>Benutzerkonto</h3>
                <p>
                    E-Mail-Adresse, Passwort (nur als verschlüsselter Hash gespeichert), Zeitpunkt der
                    Registrierung und der letzten Anmeldung sowie der verwendete Einladungscode.
                </p>
                <h3>Deine Finanzeinträge</h3>
                <p>
                    Was du selbst einträgst oder importierst: Ausgaben, Einnahmen, Fixkosten, Konten,
                    Spaßkonto-Gruppen, Einstellungen sowie — falls genutzt — Kassenbon-Artikel.
                    Diese Daten sind nur für dich sichtbar (technisch abgesichert über Row-Level-Security).
                </p>
                <h3>Optional: REWE-Bon-Import per E-Mail</h3>
                <p>
                    Wenn du den Import aktivierst, werden die Zugangsdaten zu deinem E-Mail-Postfach
                    verschlüsselt gespeichert. Die App liest damit ausschließlich E-Mails mit digitalen
                    REWE-Kassenbons und speichert Datum, Betrag, Bon-Text und Artikel. Du kannst die
                    Verbindung jederzeit in den Einstellungen trennen; die Zugangsdaten werden dann gelöscht.
                </p>
                <h3>Technische Daten beim Aufruf</h3>
                <p>
                    Beim Aufruf der Seite verarbeitet der Hosting-Anbieter technisch notwendige Daten
                    (IP-Adresse, Zeitpunkt, aufgerufene Adresse, Browser-Kennung) in Server-Logs, um die
                    Seite auszuliefern und gegen Missbrauch abzusichern.
                </p>
            </section>

            <section>
                <h2>4. Zwecke und Rechtsgrundlagen</h2>
                <ul>
                    <li>
                        Bereitstellung der App und deines Kontos: Art. 6 Abs. 1 lit. b DSGVO
                        (Nutzungsverhältnis).
                    </li>
                    <li>
                        Sicherer und stabiler Betrieb (Server-Logs, Sitzungsverwaltung): Art. 6 Abs. 1 lit. f
                        DSGVO — berechtigtes Interesse an einem funktionierenden, sicheren Dienst.
                    </li>
                    <li>
                        REWE-Bon-Import: Art. 6 Abs. 1 lit. b DSGVO, nur wenn du ihn selbst einschaltest.
                    </li>
                </ul>
            </section>

            <section>
                <h2>5. Dienstleister (Auftragsverarbeiter)</h2>
                <ul>
                    <li>
                        <strong>Supabase</strong> (Supabase Inc.) — Datenbank und Anmeldung. Die Daten liegen auf
                        Servern in <strong>Deutschland</strong> (EU). Grundlage ist ein Auftragsverarbeitungsvertrag
                        nach Art. 28 DSGVO.
                    </li>
                    <li>
                        <strong>Vercel</strong> (Vercel Inc., USA) — Hosting und Auslieferung der Web-App.
                        Eine Übermittlung in die USA ist möglich; sie stützt sich auf das EU-US Data Privacy
                        Framework bzw. EU-Standardvertragsklauseln (Art. 45, 46 DSGVO).
                    </li>
                </ul>
            </section>

            <section>
                <h2>6. Speicherung im Browser (Cookies &amp; Local Storage)</h2>
                <p>
                    Die App speichert nur, was für ihre Funktion zwingend nötig ist: ein Sitzungs-Cookie,
                    damit du angemeldet bleibst, dein gewähltes Farbschema und — im Demo-Modus — die
                    Beispieldaten und deine Demo-Eingaben. Diese Daten bleiben in deinem Browser, die Demo-Daten
                    werden nie an einen Server übertragen. Da ausschließlich technisch notwendige Speicherung
                    stattfindet, ist nach § 25 Abs. 2 TDDDG keine Einwilligung erforderlich.
                </p>
            </section>

            <section>
                <h2>7. Speicherdauer</h2>
                <p>
                    Deine Kontodaten und Einträge werden gespeichert, solange dein Konto besteht. Löschst du
                    dein Konto (Einstellungen → „Konto löschen“), werden alle zugehörigen Daten unverzüglich
                    entfernt. Server-Logs des Hosters werden nach kurzer Zeit automatisch gelöscht.
                </p>
            </section>

            <section>
                <h2>8. Deine Rechte</h2>
                <p>Du hast jederzeit das Recht auf:</p>
                <ul>
                    <li>Auskunft über deine gespeicherten Daten (Art. 15 DSGVO)</li>
                    <li>Berichtigung unrichtiger Daten (Art. 16 DSGVO)</li>
                    <li>Löschung (Art. 17 DSGVO) — direkt in der App über „Konto löschen“</li>
                    <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
                    <li>Datenübertragbarkeit (Art. 20 DSGVO) — über den Backup-Export in den Einstellungen</li>
                    <li>Widerspruch gegen Verarbeitungen auf Grundlage von Art. 6 Abs. 1 lit. f (Art. 21 DSGVO)</li>
                </ul>
                <p className="mt-2">
                    Schreib dazu einfach an <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>.
                    Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel
                    beim Landesbeauftragten für den Datenschutz und die Informationsfreiheit Baden-Württemberg.
                </p>
            </section>

            <section>
                <h2>9. Pflicht zur Bereitstellung, keine automatisierten Entscheidungen</h2>
                <p>
                    Ohne E-Mail-Adresse und Passwort lässt sich kein Konto anlegen. Alle weiteren Angaben sind
                    freiwillig. Es findet keine automatisierte Entscheidungsfindung oder Profilbildung statt.
                </p>
            </section>

            <p className="text-xs">Stand: {PRIVACY_DATE}</p>
        </LegalPage>
    )
}
