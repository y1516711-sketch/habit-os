import React from 'react'

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-bg" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="row spread"><h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn small" onClick={onClose} aria-label="Close">✕</button></div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  )
}
export function ProgressRing({ pct, size = 128, label }: { pct: number; size?: number; label?: string }) {
  const r = (size - 16) / 2, c = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg2)" strokeWidth="11" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth="11" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * Math.min(100, Math.max(0, pct))) / 100} style={{ transition: 'stroke-dashoffset .5s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div><div style={{ fontSize: size / 4.2, fontWeight: 900 }}>{Math.round(pct)}%</div>
          {label && <div className="muted small">{label}</div>}</div>
      </div>
    </div>
  )
}
export function Empty({ icon = '🌱', title, children }: { icon?: string; title: string; children?: React.ReactNode }) {
  return <div className="empty"><div style={{ fontSize: 30 }}>{icon}</div><h3 style={{ color: 'var(--text)' }}>{title}</h3><div className="small">{children}</div></div>
}
export function Stat({ kicker, value, sub }: { kicker: string; value: React.ReactNode; sub?: string }) {
  return <div className="card stat"><div className="kicker">{kicker}</div><div className="big">{value}</div>{sub && <div className="muted small">{sub}</div>}</div>
}
export function download(filename: string, content: string, type = 'application/json') {
  const blob = new Blob([content], { type })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}
export const toCSV = (rows: string[][]): string =>
  rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
