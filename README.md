# react-suqo-checkout

Collect a SUQO payment in a React app. The block renders inline, where you put it — no modal,
no overlay, no page takeover.

```bash
npm install react-suqo-checkout
```

One file, no runtime dependencies, ESM and CJS, works in the Next.js App Router.

## Usage

Create a checkout session on your own backend with your API key, then hand the component its
id:

```tsx
import { SUQOCheckout } from 'react-suqo-checkout'

export function Checkout({ sessionId }: { sessionId: string }) {
  return (
    <SUQOCheckout
      id={sessionId}
      onReady={() => console.log('the block is on screen')}
      onSuccess={(params, message) => router.push('/thank-you')}
      onFailure={(status, params, message) => {
        if (status === 'cancelled') return // they backed out; offer the basket again
        showError(message)
      }}
    />
  )
}
```

That is the whole integration. `id` is the checkout session — nothing about the buyer appears
on your page at all, because the session already carries them.

### What this component does, and what it does not

It is the **host** half of an embedded checkout. The buyer's Pay button lives inside an iframe
on SUQO's origin, so this component never opens the gateway window, never calls a payment API,
and never sees a card number. What it does is mount the frame, keep it the right height, and
deliver exactly one outcome per attempt.

Everything the buyer decides — which gateway, which bank, consent — happens inside the frame.
Everything they already decided is yours to display around it.

### `cancelled` is not `failed`

`onFailure` receives a status, and the two are not interchangeable. A buyer who backed out of
the gateway wants their basket offered again; a payment the gateway rejected wants looking
into. Collapsing them throws away the only signal that tells them apart.

### `params` is the gateway's, verbatim

Nothing is renamed or filtered. Every gateway names its transaction id differently — `data`,
`pidx`, `TXNID`, `MerchantTxnId` — and you reconcile against whatever your own backend
recorded. Normalising here would throw away the only field you can match on.

`message` is what SUQO's backend said about the payment, and it is a separate argument for that
reason: `params` belongs to the gateway, and mixing our keys into it would break exactly that
reconciliation. It is `undefined` when the backend said nothing, so it is never copy this
package invented.

## The outcome is a signal to navigate, not proof of fulfilment

**Fulfil from the webhook.** `onSuccess` tells you where to send the buyer next; it does not
tell you the money moved, and on some surfaces it cannot fire at all:

| Surface                                     | What happens                                                                 | You hear about it via           |
| ------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------- |
| Desktop or mobile browser                   | iframe + popup                                                               | `onSuccess` / `onFailure`       |
| WebView with multiple windows               | iframe + popup                                                               | `onSuccess` / `onFailure`       |
| In-app browsers (Instagram, Facebook, LINE) | no popup is possible, so the frame hands your page to SUQO's hosted checkout | **`return_url` + webhook only** |
| The buyer navigates away mid-payment        | your component unmounts; their popup stays open and they finish              | **webhook only**                |

On the last two your page is gone before the payment settles, and nothing can call back into
it. You cannot tell in advance which row a given buyer lands on — the same buyer gets a
different one from Instagram than from their desktop.

> **If your page might ever be opened inside an app, the session you create must carry a
> `return_url`.** It is the only way the buyer gets back to you.

## Props

| Prop                  | Type                                 | Notes                                                                         |
| --------------------- | ------------------------------------ | ----------------------------------------------------------------------------- |
| `id`                  | `string`                             | **Required.** The checkout session id, e.g. `cks_9f2c41a8`                    |
| `origin`              | `string`                             | Where the checkout is served from. Defaults to `DEFAULT_ORIGIN`               |
| `title`               | `string`                             | The iframe's accessible name                                                  |
| `className` / `style` | —                                    | On the container. `style` is merged last, so you can override anything we set |
| `onReady`             | `() => void`                         | The block is on screen, payable or not                                        |
| `onSuccess`           | `(params, message?) => void`         | Exactly once per attempt                                                      |
| `onFailure`           | `(status, params, message?) => void` | Exactly once per attempt. `'cancelled' \| 'failed'`                           |
| `onUnavailable`       | `(reason) => void`                   | The session cannot be paid at all. **Not** a payment outcome                  |
| `onLoadError`         | `(error) => void`                    | A load deadline expired. The failure panel renders regardless                 |
| `onIntent`            | `(url) => void`                      | A bank/wallet deeplink — see below. **We never navigate on it**               |

### `onIntent` — a bank-app deeplink, handed to you verbatim

Some gateways hand off to a bank or wallet app through a non-`http(s)` deeplink
(`intent://…`, `fonepayApp://…`). The frame can't navigate your page to one itself — it's
sandboxed so it can't move your top-level page at all — so it only asks: `onIntent(url)`
fires with the raw deeplink, and **this component never navigates anywhere on it
itself.** What you do next — typically `location.href = url`, in your own page — is your
own code's call.

`javascript:`, `data:`, `file:` and `blob:` are refused before they'd ever reach your
handler. Everything else passes through exactly as the gateway sent it, same as `params`
does.

No `onIntent` configured? Nothing breaks — the console gets a warning and the buyer is
left exactly where they'd be without this feature, not stuck on a dead spinner.

### `onUnavailable` is not a failure

It fires when the session itself cannot be paid — expired, already spent, created without a
customer. No payment was attempted, so `onFailure` does not also fire; reporting one would tell
you an attempt was made and rejected.

The reasons are `'not-found' | 'expired' | 'spent' | 'no-customer' | 'no-methods' |
'load-failed'`, and they are finer-grained than what the buyer is shown on purpose: `spent` and
`expired` read the same to them and are opposite facts to you.

### Changing `id` starts a different payment

The frame is replaced and the previous session is torn down. Do not swap `id` while a buyer is
paying — the in-flight attempt is abandoned, and its result is deliberately **not** attributed
to the new session.

## Rendering more than one

Supported. Each block keeps its own state, its own height and its own callbacks. The page-level
`message` listener is shared and routes each message to the block it belongs to.

One caveat: do **not** also load the vanilla `suqo-checkout.js` on the same page. Both are hosts
for the same protocol, and the gateway's result carries no session id — so with both mounted,
either can claim a result belonging to the other.

## Styling

Everything this component draws — the spinner and the failure panel — is styled inline, with no
stylesheet and no `<style>` injection. The chrome renders inside your page, where a class name
could collide with yours and your CSS could restyle it. There is no `styles.css` to import.

Size the block with `className` or `style` on the container; the iframe's height is managed for
you and reported by the frame itself.

## Server rendering

`'use client'` is declared, and nothing touches `window` at module scope or during render. The
component renders identical markup on the server and the client, so there is no hydration
mismatch to configure around.

## Requirements on the SUQO web app

This package is one half of a protocol documented in the `js-checkout` project's
`docs/protocol.md`.
It expects the app to serve `/c/<sessionId>` as a chrome-less payment block that posts
`suqo:alive`, `suqo:ready`, `suqo:resize`, `suqo:gateway`, `suqo:redirect`, `suqo:unavailable`
and `suqo:result`, and `/checkout/<sessionId>` as the hosted standalone equivalent. A change to
one half that is not mirrored in the other fails silently.

## Development

```bash
npm install
npm run typecheck      # src and test, both tsconfigs
npm test
npm run lint
npm run build
npm run check:dist     # asserts 'use client' survived, no bundled React, no CSS

cd example && npm install && npm run dev
```

## License

Apache-2.0
