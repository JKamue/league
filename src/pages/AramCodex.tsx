import { splash } from '../lol'
import { Crest } from '../components/ui'

type Clause = { id: string; text: string; sub?: { id: string; text: string }[] }

// The sacred law of the closing ARAM. Changes need a unanimous vote of the herd.
const CODEX: Clause[] = [
  { id: '§1', text: 'Das Abschluss-Aram ist beendet, wenn eine Runde gewonnen wurde.' },
  {
    id: '§2', text: 'Die Mindestanzahl an gespielten Spielen beträgt zwei.',
    sub: [{ id: '§2.1', text: 'Das gilt auch, wenn das erste Spiel gewonnen wurde.' }],
  },
  {
    id: '§3', text: 'Keiner darf die Party frühzeitig verlassen.',
    sub: [
      { id: '§3.1', text: 'Die einzige Ausnahme ist, wenn das Offline-Gehen vor Beginn der Runde angekündigt wird.' },
      { id: '§3.2', text: 'Die Ausnahme gilt erst ab der dritten Aram-Runde.' },
    ],
  },
  {
    id: '§4', text: 'Ein Spiel gilt trotz Victory-Screen NICHT als gewonnen, wenn …',
    sub: [
      { id: '§4.1', text: 'ein Spieler den finalen Schaden am Nexus macht.' },
      { id: '§4.2', text: 'das gegnerische Team aufgibt.' },
      { id: '§4.3', text: 'das Spiel unter 20 Minuten gedauert hat.' },
    ],
  },
]

export function AramCodex() {
  return (
    <div className="codex-page" style={{ '--backdrop': `url(${splash('Braum', 0)})` } as React.CSSProperties}>
      <article className="codex">
        <header className="codex-head">
          <Crest size={96} />
          <p className="eyebrow">Das Gesetz des Heulenden Abgrunds</p>
          <h1 className="codex-title">Abschluss-Aram-Regeln</h1>
          <div className="codex-rule" aria-hidden="true"><span>◆</span></div>
        </header>
        <ol className="codex-clauses">
          {CODEX.map((clause) => (
            <li key={clause.id} className="codex-clause">
              <span className="codex-mark">{clause.id}</span>
              <div>
                <p className="codex-text">{clause.text}</p>
                {clause.sub && (
                  <ol className="codex-sub">
                    {clause.sub.map((sub) => (
                      <li key={sub.id}><span className="codex-submark">{sub.id}</span><span>{sub.text}</span></li>
                    ))}
                  </ol>
                )}
              </div>
            </li>
          ))}
        </ol>
        <footer className="codex-foot">
          <div className="codex-rule" aria-hidden="true"><span>◆</span></div>
          <p>Gegeben zu Abgrund, im Namen der Cowbuilders. Verstöße werden vom Rat der Kühe geahndet. 🐄</p>
        </footer>
      </article>
    </div>
  )
}
