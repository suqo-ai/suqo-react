import { StrictMode, useState } from 'react'

import { DEFAULT_ORIGIN, SUQOCheckout } from 'react-suqo-checkout'

/**
 * A harness, not a demo.
 *
 * There is one control per hazard the package is built around — StrictMode, two blocks on one
 * page, unmounting mid-payment, changing the session id — because those are the paths that
 * only misbehave against a real frame, and jsdom cannot tell you about any of them.
 */

type LogLine = { at: string; text: string }

export function App() {
  const [id, setId] = useState('')
  const [origin, setOrigin] = useState(DEFAULT_ORIGIN)
  const [mounted, setMounted] = useState(false)
  const [strict, setStrict] = useState(false)
  const [twin, setTwin] = useState(false)
  const [lines, setLines] = useState<LogLine[]>([])

  const log = (text: string) =>
    setLines((previous) => [
      { at: new Date().toLocaleTimeString(), text },
      ...previous.slice(0, 99),
    ])

  const block = (label: string) => (
    <SUQOCheckout
      id={id}
      origin={origin}
      onReady={() => log(`${label} onReady`)}
      onSuccess={(params, message) =>
        log(`${label} onSuccess ${JSON.stringify(params)} ${message ?? ''}`)
      }
      onFailure={(status, params, message) =>
        log(`${label} onFailure ${status} ${JSON.stringify(params)} ${message ?? ''}`)
      }
      onUnavailable={(reason) => log(`${label} onUnavailable ${reason}`)}
      onLoadError={(error) => log(`${label} onLoadError ${error.stage} ${error.detail}`)}
    />
  )

  const blocks = (
    <div style={{ display: 'grid', gap: 24 }}>
      {block('A')}
      {twin ? block('B') : null}
    </div>
  )

  return (
    <main
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: 24,
        font: '400 15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
        color: '#425466',
      }}
    >
      <h1 style={{ color: '#0d062d' }}>react-suqo-checkout</h1>

      <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
        <label>
          Session id{' '}
          <input
            value={id}
            onChange={(event) => setId(event.target.value)}
            placeholder="cks_…"
            style={{ width: 260 }}
          />
        </label>
        <label>
          Origin{' '}
          <input
            value={origin}
            onChange={(event) => setOrigin(event.target.value)}
            style={{ width: 260 }}
          />
        </label>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        <button onClick={() => setMounted((value) => !value)} disabled={id === ''}>
          {mounted ? 'Unmount' : 'Mount'}
        </button>
        <button onClick={() => setStrict((value) => !value)}>
          StrictMode: {strict ? 'on' : 'off'}
        </button>
        <button onClick={() => setTwin((value) => !value)}>
          Second block: {twin ? 'on' : 'off'}
        </button>
        <button onClick={() => setId((value) => `${value}-x`)} disabled={id === ''}>
          Change the id
        </button>
        <button onClick={() => setLines([])}>Clear log</button>
      </div>

      {mounted ? strict ? <StrictMode>{blocks}</StrictMode> : blocks : null}

      <h2 style={{ color: '#0d062d', marginTop: 32 }}>Events</h2>
      <pre
        style={{
          background: '#f5f6fa',
          borderRadius: 8,
          padding: 12,
          fontSize: 13,
          maxHeight: 280,
          overflow: 'auto',
        }}
      >
        {lines.length === 0
          ? '(nothing yet)'
          : lines.map((line) => `${line.at}  ${line.text}`).join('\n')}
      </pre>
    </main>
  )
}
