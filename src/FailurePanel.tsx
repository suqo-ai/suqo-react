import type { ReactElement } from 'react'

/**
 * What the buyer sees when the frame never arrived.
 *
 * The link is the point of this component. Whatever stopped the frame — a CSP block, an
 * extension, a cold origin — the buyer still has a session they can pay, and the hosted
 * checkout is a page with none of the framing requirements that just failed.
 *
 * It points at `<origin>/checkout/<id>`, **not** at the frame URL. The frame URL opened
 * standalone renders a fully payable block whose result posts to nobody, and whose return page
 * skips the seller's `return_url` because it looks like a gateway window by name — so a buyer
 * taking that escape hatch can pay and have nothing reported anywhere. The hosted page is the
 * supported standalone surface for exactly this.
 */
export interface FailurePanelProps {
  message: string
  href: string
}

export function FailurePanel({ message, href }: FailurePanelProps): ReactElement {
  return (
    <div
      role="alert"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: '32px 28px',
        textAlign: 'center',
        font: '400 15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
        color: '#425466',
        zIndex: 2,
      }}
    >
      <div style={{ font: '600 17px/1.3 inherit', color: '#0d062d' }}>
        The payment form didn&apos;t load
      </div>
      <div style={{ maxWidth: 340 }}>{message}</div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-block',
          marginTop: 4,
          padding: '11px 20px',
          borderRadius: 10,
          background: '#635bff',
          color: '#ffffff',
          font: '600 15px/1 inherit',
          textDecoration: 'none',
        }}
      >
        Open the payment page in a new tab
      </a>
    </div>
  )
}
