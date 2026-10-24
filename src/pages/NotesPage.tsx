import { useState } from 'react'
import { Empty } from '../components/ui'
import { prettyLong, todayKey, uid } from '../lib/date'
import { useOS } from '../lib/store'
import type { JournalNote } from '../lib/types'

const MOODS = ['😀 Great', '🙂 Good', '😐 Okay', '😓 Tough', '🔥 Fired up']
export default function NotesPage() {
  const { state, update, setToast } = useOS()
  const today = todayKey()
  const [editing, setEditing] = useState<JournalNote | null>(null)
  const [q, setQ] = useState('')
  const blank = (): JournalNote => ({ id: uid(), date: today, title: '', body: '', mood: MOODS[1], updatedAt: new Date().toISOString() })
  const save = () => {
    if (!editing) return
    if (!editing.title.trim() && !editing.body.trim()) return setToast('Write a title or some text first.')
    const n = { ...editing, title: editing.title.trim() || 'Untitled', updatedAt: new Date().toISOString() }
    update(s => ({ ...s, notes: s.notes.some(x => x.id === n.id) ? s.notes.map(x => x.id === n.id ? n : x) : [n, ...s.notes] }))
    setEditing(null); setToast('Note saved 📝')
  }
  const list = [...state.notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .filter(n => (n.title + n.body).toLowerCase().includes(q.toLowerCase()))
  if (editing) return (
    <div className="grid" style={{ gap: 14 }}>
      <h1>📓 {state.notes.some(n => n.id === editing.id) ? 'Edit note' : 'New note'}</h1>
      <div className="card">
        <label>Title</label><input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="Today I learned…" autoFocus />
        <div className="grid g2">
          <div><label>Date</label><input type="date" value={editing.date} onChange={e => setEditing({ ...editing, date: e.target.value })} /></div>
          <div><label>Mood</label><select value={editing.mood} onChange={e => setEditing({ ...editing, mood: e.target.value })}>{MOODS.map(m => <option key={m}>{m}</option>)}</select></div>
        </div>
        <label>Journal</label>
        <textarea rows={10} value={editing.body} onChange={e => setEditing({ ...editing, body: e.target.value })} placeholder="Wins, lessons, blockers, tomorrow's plan…" />
        <div className="row" style={{ marginTop: 14 }}><button className="btn primary" onClick={save}>Save note</button><button className="btn" onClick={() => setEditing(null)}>Cancel</button></div>
      </div>
    </div>
  )
  return (
    <div className="grid" style={{ gap: 16 }}>
      <header className="row spread">
        <div><h1>📓 Notes / Journal</h1><div className="muted">Daily reflections, saved on this device.</div></div>
        <button className="btn primary" onClick={() => setEditing(blank())}>＋ New note</button>
      </header>
      <input placeholder="🔍 Search notes…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search notes" />
      {list.length === 0
        ? <Empty icon="📓" title="No notes yet">Write today's reflection — future you will thank present you.</Empty>
        : <div className="grid g2">{list.map(n => (
            <article key={n.id} className="card">
              <div className="row spread"><b>{n.title}</b><span className="chip">{n.mood}</span></div>
              <div className="muted small">{prettyLong(n.date)}</div>
              <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{n.body.slice(0, 240)}{n.body.length > 240 ? '…' : ''}</p>
              <div className="row">
                <button className="btn small" onClick={() => setEditing(n)}>✏️ Edit</button>
                <button className="btn small danger" onClick={() => { if (confirm(`Delete "${n.title}"?`)) update(s => ({ ...s, notes: s.notes.filter(x => x.id !== n.id) })) }}>Delete</button>
              </div>
            </article>))}
          </div>}
    </div>
  )
}
