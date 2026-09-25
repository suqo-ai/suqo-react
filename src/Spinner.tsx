import { useEffect, useState, type ReactElement } from 'react'

/**
 * The loading indicator, as SVG rather than CSS.
 *
 * Every style in this package is inline: the chrome renders on an arbitrary merchant page,
 * where a class name can collide and their stylesheet can restyle it, and shipping a CSS file
 * would cost `"sideEffects": false` and put an `import '…/styles.css'` line in every
 * consumer's setup. Inline styles have no `@keyframes`, so the rotation is declared with SVG's
 * own `<animateTransform>` — nothing to inject, no timer to leak, and it stops on unmount by
 * definition.
 */
export function Spinner(): ReactElement {
  const [animated, setAnimated] = useState(true)

  // Read in an effect rather than during render: `matchMedia` does not exist on a server, and
  // branching on it during render would be a hydration mismatch.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setAnimated(!query.matches)
  }, [])

  return (
    <div
      role="status"
      aria-label="Loading payment options"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
      }}
    >
      <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="17" cy="17" r="15" fill="none" stroke="#e9e9e9" strokeWidth="3" />
        <path
          d="M17 2a15 15 0 0 1 15 15"
          fill="none"
          stroke="#635bff"
          strokeWidth="3"
          strokeLinecap="round"
        >
          {animated ? (
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 17 17"
              to="360 17 17"
              dur="0.9s"
              repeatCount="indefinite"
            />
          ) : null}
        </path>
      </svg>
    </div>
  )
}
