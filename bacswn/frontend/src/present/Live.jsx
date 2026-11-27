/**
 * Audience companion app for the Paris talk (/live): explore the demos on a phone.
 *
 * What: the three self-guided demos from the talk (the credit journey, checking a claim,
 * the Dorian replay), one per tab.
 * Why: the QR code on the closing slide leads to one interactive page tied to the
 * presentation; it must work instantly on any phone, with no account.
 * How: everything comes from paris-deck.json (`companion`) and runs in the browser;
 * the page makes no requests of its own.
 */
import { useState } from 'react'
import { CircleCheckBig, CloudLightning, Route } from 'lucide-react'
import deck from './paris-deck.json'
import { ClaimCheck, DorianReplay, Journey, NOTE } from './Companion'
import '@fontsource-variable/inter'
import './present.css'

/** Tabs of the companion app, each with a titled Lucide icon. */
const TABS = [
  { id: 'journey', label: 'Journey', icon: Route },
  { id: 'check', label: 'Check', icon: CircleCheckBig },
  { id: 'dorian', label: 'Dorian', icon: CloudLightning },
]

/** The companion app. */
export default function Live() {
  const [tab, setTab] = useState('journey')
  return (
    <main className="lv">
      <h1>{deck.title}</h1>
      <p className="dim">{deck.speaker}</p>
      <nav className="lv-tabs" aria-label="Companion sections">
        {TABS.map(t => (
          <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
            <t.icon aria-hidden="true" focusable="false"><title>{t.label}</title></t.icon>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      {tab === 'journey' && <Journey />}
      {tab === 'check' && <ClaimCheck />}
      {tab === 'dorian' && <DorianReplay />}
      <p className="lv-foot">{NOTE}</p>
    </main>
  )
}
