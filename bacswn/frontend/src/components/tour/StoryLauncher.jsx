/**
 * StoryLauncher: the "Guided stories" card on the Station & Model Guide page.
 *
 * Why: presenters pick a story by its summary and length, or send a link that
 * starts it directly.
 * How: "Play story" dispatches the story event the app Layout listens for;
 * "Copy link" copies `/mesh?story=<id>`, which Layout reads on load.
 */
import { useState } from 'react'
import { STORIES, playStory } from '../../tour/stories'

/**
 * Guided stories, as cards: play one, or copy a link that opens the app and
 * starts it (…/mesh?story=<id>).
 * @param {{headingId?: string}} props id for the section heading (focus target)
 */
export default function StoryLauncher({ headingId = 'mg-stories' }) {
  const [msg, setMsg] = useState('')
  /** Copy a link that starts story `s`; if the clipboard is blocked, show the link instead. */
  const copy = async (s) => {
    const url = `${window.location.origin}/mesh?story=${s.id}`
    try { await navigator.clipboard.writeText(url); setMsg(`Link to "${s.title}" copied`) }
    catch { setMsg(`Link: ${url}`) }
  }
  return (
    <section className="card mg-section stories" aria-labelledby={headingId}>
      <h3 id={headingId} tabIndex={-1}>Guided stories</h3>
      <p className="mg-intro">
        Short walk-throughs that drive the live mesh for you, one step at a time, with a caption for each step.
        The mesh is held still at every step, so you can talk for as long as you like. Finishing or exiting a story
        resets the mesh.
      </p>
      <ul className="story-grid">
        {STORIES.filter(s => s.mesh !== false).map(s => (
          <li key={s.id} className="story-card">
            <b className="story-title">{s.title}</b>
            <span className="story-summary">{s.summary}</span>
            <span className="story-meta">{s.steps.length} steps · about {s.minutes} minutes</span>
            <span className="story-actions">
              <button type="button" className="btn btn-sm btn-primary" onClick={() => playStory(s.id)}
                aria-label={`Play story: ${s.title}`}><span aria-hidden="true">▶ </span>Play story</button>
              <button type="button" className="toggle-btn" onClick={() => copy(s)}
                aria-label={`Copy a link that starts the story: ${s.title}`}><span aria-hidden="true">🔗</span> Copy link</button>
            </span>
          </li>
        ))}
      </ul>
      <p className="story-msg" role="status" aria-live="polite">{msg}</p>
    </section>
  )
}

