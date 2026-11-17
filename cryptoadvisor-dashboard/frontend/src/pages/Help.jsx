import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'

// Help documents (docs/help/*.md), each also downloadable as PDF and Markdown.
// The Markdown is rendered to React elements by the small parser below: no HTML from the
// document is ever injected, so the page stays inside the content security policy.

const slugify = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function inline(text, keyBase = '') {
  const out = []
  // `code`, **bold**, bare URLs
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(https?:\/\/[^\s)]+[^\s).,;:])/g
  let last = 0, m, i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const k = `${keyBase}-${i++}`
    if (m[1]) out.push(<code key={k} className="help-code">{m[1].slice(1, -1)}</code>)
    else if (m[2]) out.push(<strong key={k}>{inline(m[2].slice(2, -2), k)}</strong>)
    else out.push(<a key={k} href={m[3]} target="_blank" rel="noopener noreferrer">{m[3]}</a>)
    last = re.lastIndex
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const LIST_RE = /^(\s*)([-*]|\d+\.) (.*)/
const isTableRow = (l) => l.trimStart().startsWith('|')
const isRule = (l) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l)
const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

function parseMarkdown(md) {
  const lines = md.split('\n')
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    if (line.startsWith('```')) {
      let j = i + 1
      while (j < lines.length && !lines[j].startsWith('```')) j++
      blocks.push({ type: 'code', text: lines.slice(i + 1, j).join('\n') })
      i = j + 1
      continue
    }
    const h = line.match(/^(#{1,3}) (.*)/)
    if (h) { blocks.push({ type: 'h', level: h[1].length, text: h[2], id: slugify(h[2]) }); i++; continue }
    if (isTableRow(line)) {
      const rows = []
      while (i < lines.length && isTableRow(lines[i])) { if (!isRule(lines[i])) rows.push(cells(lines[i])); i++ }
      blocks.push({ type: 'table', rows })
      continue
    }
    const li = line.match(LIST_RE)
    if (li) {
      const ordered = /\d/.test(li[2][0])
      const start = ordered ? parseInt(li[2], 10) : undefined
      const items = []
      while (i < lines.length) {
        const m = lines[i].match(LIST_RE)
        if (!m) break
        let text = m[3]
        i++
        while (i < lines.length && lines[i].startsWith('   ') && !LIST_RE.test(lines[i])) { text += ' ' + lines[i].trim(); i++ }
        items.push(text)
      }
      blocks.push({ type: 'list', ordered, start, items })
      continue
    }
    const para = [line.trim()]
    i++
    while (i < lines.length && lines[i].trim() && !/^(#|```|\s*\||\s*([-*]|\d+\.) )/.test(lines[i])) { para.push(lines[i].trim()); i++ }
    blocks.push({ type: 'p', text: para.join(' ') })
  }
  return blocks
}

function Block({ b, k }) {
  switch (b.type) {
    case 'h': {
      const Tag = `h${b.level + 1}` // the page title is the h1
      return <Tag id={b.id} className={`help-h${b.level}`}>{inline(b.text, k)}</Tag>
    }
    case 'code': return <pre className="help-pre"><code>{b.text}</code></pre>
    case 'table':
      return (
        <div className="help-table-wrap">
          <table className="help-table">
            <thead><tr>{b.rows[0].map((c, j) => <th key={j}>{inline(c, `${k}h${j}`)}</th>)}</tr></thead>
            <tbody>{b.rows.slice(1).map((r, ri) => (
              <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, `${k}r${ri}c${j}`)}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      )
    case 'list': {
      const items = b.items.map((t, j) => <li key={j}>{inline(t, `${k}i${j}`)}</li>)
      return b.ordered ? <ol start={b.start}>{items}</ol> : <ul>{items}</ul>
    }
    default: return <p>{inline(b.text, k)}</p>
  }
}

function Help() {
  const { slug } = useParams()
  const [docs, setDocs] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/help/').then(setDocs).catch((e) => setError(e.message))
  }, [])

  const current = slug || docs?.[0]?.slug
  return (
    <div className="help-page">
      <h1 style={{ marginTop: 0 }}>Help &amp; Docs</h1>
      <nav className="help-tabs" aria-label="Documents">
        {(docs || []).map((d) => (
          <Link key={d.slug} to={`/help/${d.slug}`} className={`help-tab ${d.slug === current ? 'active' : ''}`}
            aria-current={d.slug === current ? 'page' : undefined}>
            <span className="help-tab-title">{d.title}{d.admin_only && <span className="help-badge">Admins</span>}</span>
            <span className="help-tab-summary">{d.summary}</span>
          </Link>
        ))}
      </nav>
      {error && <p className="negative" role="alert">{error}</p>}
      {/* Keyed by document so search and loading state start fresh on every switch */}
      {current && <HelpDoc key={current} slug={current} hasFaq={!!docs?.some((d) => d.slug === 'faq')} />}
    </div>
  )
}

function HelpDoc({ slug, hasFaq }) {
  const navigate = useNavigate()
  const [doc, setDoc] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    api.get(`/api/help/${encodeURIComponent(slug)}`).then(setDoc).catch((e) => setError(e.message))
  }, [slug])

  const blocks = useMemo(() => (doc ? parseMarkdown(doc.markdown) : []), [doc])
  const sections = blocks.filter((b) => b.type === 'h' && b.level === 2 && b.id !== 'contents')

  // Search keeps each level-2 section whose text matches, with its heading
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const body = blocks.filter((b) => !(b.type === 'h' && b.level === 1))
    if (!q) return body
    const groups = []
    for (const b of body) {
      if ((b.type === 'h' && b.level === 2) || !groups.length) groups.push([])
      groups[groups.length - 1].push(b)
    }
    const text = (b) => (b.text || '') + (b.items || []).join(' ') + (b.rows || []).flat().join(' ')
    return groups.filter((g) => g.some((b) => text(b).toLowerCase().includes(q))).flat()
  }, [blocks, query])

  const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  if (error) return <p className="negative" role="alert">{error}</p>
  if (!doc) return <p className="muted">Loading…</p>
  return (
    <div className="help-layout">
      <aside className="help-toc">
        <div className="help-downloads">
          <a className="btn btn-sm" href={`/api/help/${doc.slug}.pdf`} download>Download PDF</a>
          <a className="btn btn-sm btn-ghost" href={`/api/help/${doc.slug}.md`} download>Markdown</a>
        </div>
        <label htmlFor="help-search" className="sr-only">Search this document</label>
        <input id="help-search" className="input" type="search" placeholder={`Search the ${doc.title}`}
          value={query} onChange={(e) => setQuery(e.target.value)} />
        {sections.length > 2 && !query && (
          <ul>
            {sections.map((s) => (
              <li key={s.id}><button type="button" className="help-toc-link" onClick={() => jump(s.id)}>{s.text}</button></li>
            ))}
          </ul>
        )}
      </aside>
      <article className="card help-article">
        <h1 className="help-title">{blocks.find((b) => b.type === 'h' && b.level === 1)?.text || doc.title}</h1>
        {shown.length ? shown.map((b, j) => <Block key={j} b={b} k={`b${j}`} />)
          : <p className="muted">Nothing in the {doc.title} matches “{query}”.</p>}
        {doc.slug !== 'faq' && hasFaq && (
          <p className="muted help-foot">Still stuck? Try the <button type="button" className="help-toc-link" onClick={() => navigate('/help/faq')}>FAQ</button>, or ask the assistant (chat button, bottom right).</p>
        )}
      </article>
    </div>
  )
}

export default Help
