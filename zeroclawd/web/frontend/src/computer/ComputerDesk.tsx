import { useCallback, useEffect, useMemo, useState } from 'react'
import { mapE2BComputer, type E2BComputerView } from '../api/mappers'

const PRESETS = ['help', 'skills', 'inspect', 'skills-dir', 'oneshot', 'bins'] as const

async function readJSON<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T | null; raw: string }> {
  try {
    const r = await fetch(path, init)
    const raw = await r.text()
    let data: T | null = null
    try {
      data = raw ? (JSON.parse(raw) as T) : null
    } catch {
      data = null
    }
    return { ok: r.ok, status: r.status, data, raw }
  } catch (e) {
    return { ok: false, status: 0, data: null, raw: e instanceof Error ? e.message : String(e) }
  }
}

export default function ComputerDesk({
  variant = 'full',
  initial,
  onBack,
}: {
  variant?: 'full' | 'panel'
  initial?: unknown
  onBack?: () => void
}) {
  const [raw, setRaw] = useState<unknown>(initial ?? null)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState('')
  const [log, setLog] = useState('idle · waiting for a spawn')
  const [error, setError] = useState('')

  const view = useMemo(() => mapE2BComputer(raw), [raw])

  useEffect(() => {
    if (initial != null) setRaw(initial)
  }, [initial])

  const refresh = useCallback(async () => {
    const res = await readJSON<unknown>('/api/e2b/computer')
    if (res.data) {
      setRaw(res.data)
      const next = mapE2BComputer(res.data)
      if (next.sandboxes[0] && !selected) setSelected(next.sandboxes[0].sandboxId)
    }
  }, [selected])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => {
      void refresh()
    }, 8000)
    return () => clearInterval(id)
  }, [refresh])

  const spawn = async () => {
    setBusy(true)
    setError('')
    setLog('spawning clawdbot-computer…')
    const res = await readJSON<Record<string, string>>('/api/e2b/computer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeout: 900 }),
    })
    setBusy(false)
    if (!res.ok) {
      const msg = (res.data as { error?: string } | null)?.error || res.raw || `spawn failed (${res.status})`
      setError(msg)
      setLog(msg)
      return
    }
    const id = res.data?.sandboxId || ''
    setSelected(id)
    setLog(`powered on ${id}\ndesk ${res.data?.computerUrl || ''}`)
    void refresh()
  }

  const kill = async (id: string) => {
    setBusy(true)
    const res = await readJSON(`/api/e2b/computer/${encodeURIComponent(id)}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) {
      setError((res.data as { error?: string } | null)?.error || 'kill failed')
      return
    }
    setLog(`killed ${id}`)
    if (selected === id) setSelected('')
    void refresh()
  }

  const execPreset = async (preset: string) => {
    if (!selected) {
      setError('spawn a desk first')
      return
    }
    setBusy(true)
    setError('')
    setLog(`$ npx clawdbot-go ${preset}`)
    const res = await readJSON<{ stdout?: string; stderr?: string; error?: string; ok?: boolean }>(
      `/api/e2b/computer/${encodeURIComponent(selected)}/exec`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset }),
      },
    )
    setBusy(false)
    if (res.status === 409) {
      setError('token lost — respawn the desk')
      setLog('computer token not in this process — respawn the desk')
      return
    }
    if (!res.ok) {
      const msg = res.data?.error || res.raw || `exec failed (${res.status})`
      setError(msg)
      setLog(msg)
      return
    }
    const out = [res.data?.stdout, res.data?.stderr].filter(Boolean).join('\n')
    setLog(out || '(no output)')
  }

  const inner = (
    <>
      <div className="desk-bezel">
        <div className="desk-bezel__title">
          <span className="desk-mark">E2B · CLAWD BOT COMPUTER</span>
          <span className={`desk-lamp ${view.keySet ? 'on' : 'off'}`}>{view.keySet ? 'KEY SET' : 'NO KEY'}</span>
        </div>
        <h2 className="desk-h">oneshot desk</h2>
        <p className="desk-sub">
          Bakes <code>npx clawdbot-go</code> into an E2B sandbox. Skills-first. No Go compiler on the box.
        </p>
        <div className="desk-stats">
          {view.metrics.map((m) => (
            <div key={m.label} className={`desk-stat ${m.tone ?? ''}`}>
              <b>{m.value}</b>
              <span>{m.label}</span>
            </div>
          ))}
        </div>
        {!view.keySet && (
          <div className="desk-banner warn">
            Save <code>E2B_API_KEY</code> in API Keys, then spawn. Template bake:{' '}
            <code>python e2b/clawdbot-computer/build.py</code>
          </div>
        )}
        {error && <div className="desk-banner err">{error}</div>}
        <div className="desk-actions">
          <button className="desk-power" type="button" disabled={busy || !view.keySet} onClick={() => void spawn()}>
            {busy ? '…' : 'Power on'}
          </button>
          <a className="desk-link" href={view.hosted} target="_blank" rel="noreferrer">
            hosted Cheshire computer
          </a>
          <a className="desk-link" href="/api/e2b/install.sh">
            install.sh
          </a>
        </div>
        <div className="desk-presets" role="group" aria-label="Allowlisted presets">
          {PRESETS.map((p) => (
            <button key={p} type="button" disabled={busy || !selected} onClick={() => void execPreset(p)}>
              {p}
            </button>
          ))}
        </div>
        <div className="desk-boxes">
          <div className="desk-list">
            <div className="desk-list__head">sandboxes</div>
            {view.sandboxes.length === 0 ? (
              <div className="desk-empty">No running desks. Power on to spawn `clawdbot-computer`.</div>
            ) : (
              view.sandboxes.map((s) => (
                <button
                  key={s.sandboxId}
                  type="button"
                  className={`desk-row ${selected === s.sandboxId ? 'active' : ''}`}
                  onClick={() => setSelected(s.sandboxId)}
                >
                  <span className="desk-row__id">{s.sandboxId}</span>
                  <span className="desk-row__state">{s.state}</span>
                  {s.computerUrl && (
                    <a href={s.computerUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                      open
                    </a>
                  )}
                  <span
                    role="button"
                    tabIndex={0}
                    className="desk-kill"
                    onClick={(e) => {
                      e.stopPropagation()
                      void kill(s.sandboxId)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void kill(s.sandboxId)
                    }}
                  >
                    kill
                  </span>
                </button>
              ))
            )}
          </div>
          <pre className="desk-term" aria-label="Preset output">
            {log}
          </pre>
        </div>
      </div>
    </>
  )

  if (variant === 'panel') {
    return (
      <section className="panel wide" id="panel-e2bComputer">
        <div className="panel-head">
          <h3>E2B Computer</h3>
          <button className="btn-action" type="button" onClick={() => { window.location.hash = '#/computer' }}>
            Open desk
          </button>
        </div>
        {inner}
      </section>
    )
  }

  return (
    <div className="desk-page">
      <header className="desk-page__bar">
        <button className="pill" type="button" onClick={onBack}>
          ← console
        </button>
        <span className="desk-mark">CLAWD BOT COMPUTER</span>
        <span className={`pill ${view.keySet ? 'ok' : 'err'}`}>
          <span className="dot pulse" />
          {view.keySet ? 'e2b ready' : 'needs key'}
        </span>
      </header>
      <div className="desk-page__body">{inner}</div>
    </div>
  )
}

export type { E2BComputerView }
