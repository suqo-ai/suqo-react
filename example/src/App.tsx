import { StrictMode, useMemo, useState } from 'react'

import { type CheckoutMode, normaliseOrigin, SUQOCheckout } from 'react-suqo-checkout'

/**
 * A harness, not a demo.
 *
 * There is one control per hazard the package is built around — StrictMode, two blocks on one
 * page, unmounting mid-payment, changing the session id — because those are the paths that
 * only misbehave against a real frame, and jsdom cannot tell you about any of them.
 */

type LogLine = { at: string; text: string; label: string }

export function App() {
  const [id, setId] = useState('')
  const [mode, setMode] = useState<CheckoutMode>('sandbox')
  const [originOverride, setOriginOverride] = useState('')
  const [mounted, setMounted] = useState(false)
  const [strict, setStrict] = useState(false)
  const [twin, setTwin] = useState(false)
  const [lines, setLines] = useState<LogLine[]>([])

  const origin = originOverride.trim() === '' ? undefined : originOverride
  const resolvedOrigin = useMemo(() => normaliseOrigin(origin, mode), [origin, mode])

  const log = (label: string, text: string) =>
    setLines((previous) => [
      { at: new Date().toLocaleTimeString(), label, text },
      ...previous.slice(0, 99),
    ])

  const block = (label: string) => (
    <SUQOCheckout
      id={id}
      mode={mode}
      origin={origin}
      onReady={() => log(label, 'onReady')}
      onSuccess={(params, message) =>
        log(label, `onSuccess ${JSON.stringify(params)} ${message ?? ''}`)
      }
      onFailure={(status, params, message) =>
        log(label, `onFailure ${status} ${JSON.stringify(params)} ${message ?? ''}`)
      }
      onUnavailable={(reason) => log(label, `onUnavailable ${reason}`)}
      onLoadError={(error) => log(label, `onLoadError ${error.stage} ${error.detail}`)}
    />
  )

  const blocks = (
    <div className="blocks">
      <div className="block-slot">
        <span className="slot-tag">BLOCK A</span>
        {block('A')}
      </div>
      {twin ? (
        <div className="block-slot">
          <span className="slot-tag">BLOCK B</span>
          {block('B')}
        </div>
      ) : null}
    </div>
  )

  return (
    <div className="harness">
      <div className="harness-inner">
        <header className="header">
          <h1>
            react-suqo-<span>checkout</span>
          </h1>
          <span className="tag">test harness</span>
        </header>

        {mode === 'live' ? (
          <div className="live-banner">
            <span className="dot is-danger" />
            LIVE mode — this points at app.suqo.ai and can move real money.
          </div>
        ) : null}

        <section className="panel">
          <div className="panel-label">Session</div>

          <div className="field-row">
            <label htmlFor="session-id">Session id</label>
            <input
              id="session-id"
              value={id}
              onChange={(event) => setId(event.target.value)}
              placeholder="cks_…"
            />
          </div>

          <div className="field-row">
            <label>Mode</label>
            <div className="mode-switch">
              <button
                type="button"
                className={mode === 'sandbox' ? 'is-sandbox-active' : ''}
                onClick={() => setMode('sandbox')}
              >
                Sandbox
              </button>
              <button
                type="button"
                className={mode === 'live' ? 'is-live-active' : ''}
                onClick={() => setMode('live')}
              >
                Live
              </button>
            </div>
          </div>

          <div className="field-row">
            <label htmlFor="origin-override">Origin override</label>
            <input
              id="origin-override"
              value={originOverride}
              onChange={(event) => setOriginOverride(event.target.value)}
              placeholder={`defaults to ${mode} origin`}
            />
          </div>

          <div className="origin-readout">
            <span className={`dot ${mode === 'live' ? 'is-danger' : 'is-safe'}`} />
            resolved origin: {resolvedOrigin}
          </div>
        </section>

        <section className="panel">
          <div className="panel-label">Controls</div>
          <div className="controls">
            <button
              type="button"
              className={`btn is-primary ${mounted ? 'is-mounted' : ''}`}
              onClick={() => setMounted((value) => !value)}
              disabled={id === ''}
            >
              {mounted ? 'Unmount' : 'Mount'}
            </button>
            <button
              type="button"
              className={`btn ${strict ? 'is-on' : ''}`}
              onClick={() => setStrict((value) => !value)}
            >
              StrictMode: {strict ? 'on' : 'off'}
            </button>
            <button
              type="button"
              className={`btn ${twin ? 'is-on' : ''}`}
              onClick={() => setTwin((value) => !value)}
            >
              Second block: {twin ? 'on' : 'off'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setId((value) => `${value}-x`)}
              disabled={id === ''}
            >
              Change the id
            </button>
            <button type="button" className="btn" onClick={() => setLines([])}>
              Clear log
            </button>
          </div>
        </section>

        {mounted ? strict ? <StrictMode>{blocks}</StrictMode> : blocks : null}

        <section className="panel" style={{ marginTop: 20 }}>
          <div className="log-head">
            <div className="panel-label">Events</div>
          </div>
          <div className="log">
            {lines.length === 0 ? (
              <span className="empty">(nothing yet)</span>
            ) : (
              lines.map((line, index) => (
                <div key={index} className={`log-line tag-${line.label.toLowerCase()}`}>
                  <span className="at">{line.at}</span>
                  <span className="label">{line.label}</span> {line.text}
                </div>
              ))
            )}
            <span className="cursor" />
          </div>
        </section>
      </div>
    </div>
  )
}
