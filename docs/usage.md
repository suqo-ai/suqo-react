# Using `react-suqo-checkout`

A guide for React apps collecting a SUQO payment inline, in the page, where you put the
component. For the wire protocol this package implements against the SUQO web app, see
`js-checkout/docs/protocol.md` in the `js-checkout` repo — §3 (messages), §5 (the invariants,
each of which was a bug first) and §8 (supported surfaces) cover the host side specifically.

## What it is

Your backend creates a **checkout session** through SUQO's API and hands your page its id. This
component mounts an iframe pointing at SUQO's own payment block for that id, keeps it the right
height, and delivers exactly one outcome per attempt.

```bash
npm install react-suqo-checkout
```

No runtime dependencies, ESM and CJS, `react >= 18` as a peer (`react-dom` is an optional
peer). One file in, one component out.

It is the **host** half of an embedded checkout, and it **makes no SUQO API call of its own and
holds no credential**. The buyer's Pay button lives inside the iframe, on SUQO's origin — so
this component never opens the gateway window, never calls a payment API, and never sees a card
number. The gateway list, the payment call, the hand-off to eSewa / Khalti / ConnectIPS / NPS
and the verification all belong to the page inside the frame. The session id is the only thing
this package knows: single-use, short-lived, carrying no buyer details of its own, so nothing
sensitive and nothing long-lived ever sits in your client bundle.

**The session must already have a customer assigned when you create it.** There is no
buyer-detail prop anywhere on this component, because there is no way for it to attach one. A
session created without a customer mounts the frame, shows the page's own "can't be paid"
explanation, and reports `onUnavailable('no-customer')` rather than ever reaching a payable
state. Assign the customer on your backend, through the checkout-session API, before the id
reaches the browser.

## Quick start

```tsx
'use client'

import { SUQOCheckout } from 'react-suqo-checkout'
import { useRouter } from 'next/navigation'

export function Checkout({ sessionId }: { sessionId: string }) {
  const router = useRouter()

  return (
    <SUQOCheckout
      id={sessionId}
      mode="sandbox"
      onReady={() => console.log('the block is on screen')}
      onSuccess={() => router.push('/thank-you')}
      onFailure={(status, params, message) => {
        if (status === 'cancelled') return // they backed out; offer the basket again
        showError(message ?? 'The payment did not go through.')
      }}
      onIntent={(url) => {
        location.href = url // a bank/wallet deeplink — your page's call, not ours
      }}
    />
  )
}
```

That is the whole integration. `'use client'` is declared inside the package too, so the
directive above is only needed because _your_ file uses hooks — the component itself is already
marked.

## There is nothing about the buyer here

Look at the props: an id, an environment, some callbacks. No name, no email, no phone, no
amount. The session carries all of it server-side, which is what keeps buyer details off your
page entirely — there is no field here to put them in and no request from here that could carry
them.

## Choosing the environment

```tsx
<SUQOCheckout id={sessionId} mode="live" />        // app.suqo.ai
<SUQOCheckout id={sessionId} mode="sandbox" />     // test.suqo.ai — the default
<SUQOCheckout id={sessionId} origin="http://localhost:3000" />  // anywhere else
```

`mode` defaults to `"sandbox"`, so an integration that names neither environment cannot
accidentally take a live payment. An explicit `origin` always wins over `mode`; it is how you
point at a staging mirror, a proxy or a local dev server. Whitespace and trailing slashes are
trimmed off it, because these values arrive from JSX props and env vars where a stray space
survives into the URL string.

The session and the origin must agree. A session created against `test.suqo.ai` and opened
against `app.suqo.ai` is simply not found there, and you get `onUnavailable('not-found')`.

> `DEFAULT_ORIGIN` is still exported and still equals `SANDBOX_ORIGIN`, but it is deprecated —
> prefer `mode`.

## How a payment settles

The frame speaks and this package listens; the protocol is one-directional and there is no
message this side sends back. In order:

1. The component mounts the iframe **without a `src`**, registers the page-level `message`
   listener, and only then assigns `src`. Assigning it earlier leaves a window in which the
   frame can report itself alive before anything is listening, and the handshake is lost.
2. The frame posts `suqo:alive` as soon as its script runs, then `suqo:ready` once the block is
   mounted. `onReady` fires there and the spinner clears — payable or not.
3. `suqo:resize` arrives on every content change and is written straight to the iframe's
   `style.height`, imperatively. It never goes through React state: the frame's
   `ResizeObserver` fires constantly, and a `setState` per tick would re-render your subtree
   for a CSS pixel.
4. The buyer picks a gateway. The frame opens the gateway window itself, synchronously in its
   own click handler — a popup opened from out here would be blocked, because by the time the
   `suqo:gateway` message arrives the user gesture is spent. This package only ever _closes_
   that window, never opens one.
5. The gateway returns, and `suqo:result` arrives. `onSuccess` or `onFailure` fires exactly
   once.

The component's internal phase drives what renders around the frame:

| Phase         | What you see                                          |
| ------------- | ----------------------------------------------------- |
| `loading`     | spinner over a 320px-min container, `aria-busy` on it |
| `ready`       | the frame, at whatever height it reported             |
| `failed`      | the failure panel, over the frame                     |
| `redirecting` | the frame, briefly, while the page navigates away     |

### Exactly once, however many times it arrives

The result travels more than one path on purpose — a same-origin channel from the return page,
plus a post to the opener and to the opener's parent — because any one of them can be severed.
Arriving twice is expected and normal. Delivering twice is how a merchant fulfils an order two
times, so the first delivery latches and the rest are dropped. A fresh `suqo:gateway` unlatches
it: that is a new attempt, and its result is a new result.

### `cancelled` is not `failed`

`onFailure` receives a status, and the two are not interchangeable. A buyer who backed out of
the gateway wants their basket offered again; a payment the gateway rejected wants looking
into. Collapsing them throws away the only signal that tells them apart.

A gateway window the buyer simply closed is **not** an outcome and reports nothing at all — the
block stays exactly as it was, still payable.

### `params` is the gateway's, verbatim

Nothing is renamed and nothing is filtered. Every gateway names its transaction id differently
— `data`, `pidx`, `TXNID`, `MerchantTxnId` — and you reconcile against whatever your own
backend recorded; normalising here would throw away the only field you can match on. The one
thing dropped is a non-string value, because reconciling against `"[object Object]"` is worse
than reconciling against a missing field.

`message` is what SUQO's backend said about the payment, and it is a **separate argument** for
that reason: `params` belongs to the gateway, and mixing our keys into it would break exactly
that reconciliation. It is `undefined` when the backend said nothing, so it is never copy this
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

| Prop            | Type                                 | Notes                                                                             |
| --------------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| `id`            | `string`                             | **Required.** The checkout session id, e.g. `cks_9f2c41a8`                        |
| `mode`          | `'live' \| 'sandbox'`                | `'live'` → `app.suqo.ai`, `'sandbox'` → `test.suqo.ai`. Defaults to sandbox       |
| `origin`        | `string`                             | Where the checkout is served from. **Overrides `mode`** when set                  |
| `title`         | `string`                             | The iframe's accessible name. Defaults to `'SUQO — Secure payment'`               |
| `className`     | `string`                             | On the container                                                                  |
| `style`         | `CSSProperties`                      | On the container, merged **last**, so you can override anything we set            |
| `onReady`       | `() => void`                         | The block is on screen, payable or not                                            |
| `onSuccess`     | `(params, message?) => void`         | Exactly once per attempt                                                          |
| `onFailure`     | `(status, params, message?) => void` | Exactly once per attempt. `'cancelled' \| 'failed'`                               |
| `onUnavailable` | `(reason) => void`                   | The session cannot be paid at all. **Not** a payment outcome                      |
| `onLoadError`   | `(error) => void`                    | A load deadline expired. The failure panel renders regardless — this is telemetry |
| `onIntent`      | `(url) => void`                      | A bank/wallet deeplink. **We never navigate on it**                               |

Callbacks are read at the moment a message arrives, never captured. Writing them inline as
arrow functions is safe: the props change identity every render, the frame does not remount,
and the callback that fires is the latest one.

### `onUnavailable` is not a failure

It fires when the session itself cannot be paid. No payment was attempted, so `onFailure` does
not also fire — reporting one would tell you an attempt was made and rejected.

| Reason        | Means                                                   |
| ------------- | ------------------------------------------------------- |
| `not-found`   | no such session at this origin (often the wrong `mode`) |
| `expired`     | the session's window has passed                         |
| `spent`       | it has already been paid                                |
| `no-customer` | it was created without a customer assigned              |
| `no-methods`  | the seller has no payment method the buyer can use      |
| `load-failed` | the block could not load its own data                   |

These are finer-grained than what the buyer is shown, on purpose: `spent` and `expired` read
the same to them and are opposite facts to you. An unrecognised reason is dropped rather than
passed through, so your `switch` over the union stays exhaustive.

### `onIntent` — a bank-app deeplink, handed to you verbatim

Some gateways hand off to a bank or wallet app through a non-`http(s)` deeplink (`intent://…`,
`fonepayApp://…`). The frame cannot navigate your page to one itself — it is sandboxed without
`allow-top-navigation-by-user-activation`, so it cannot move your top-level page at all — so it
only asks. `onIntent(url)` fires with the raw deeplink and **this component never navigates
anywhere on it.** What you do next — typically `location.href = url`, in your own page — is
your own code's call.

`javascript:`, `data:`, `file:` and `blob:` are refused before they would ever reach your
handler, as is anything that does not parse as an absolute URL. That is not a judgement about
whether the frame can be trusted; it is about what `location.href = url` does structurally for
each of those, whoever asked. It is the same blocklist `js-checkout`'s loader and
`@suqo/react-native` use, so a scheme behaves identically across every SUQO SDK.

No `onIntent` configured? Nothing breaks — the console gets a `[SuqoCheckout]` warning naming
the URL, and the buyer is left exactly where they would be without the feature rather than
stuck on a dead spinner.

### When there is no popup, your page is navigated away

In an in-app browser the frame cannot open a gateway window at all. It sends `suqo:redirect`,
and this component moves your top-level page to SUQO's hosted checkout for the same session —
the only thing it ever navigates.

The URL is validated before that happens: it must parse, it must be `http(s)`, and **its origin
must equal the frame's**. `event.origin` does not replace that last check — it proves the
checkout origin _asked_, not that what it asked for is safe. Without it, any reflected value
inside the checkout app would become an open redirect on every page embedding this package.

No callback fires on this path. Your document is about to be destroyed, and `onFailure` would
report a failure that did not happen. The buyer comes back through the session's `return_url`,
and the payment reaches you through the webhook. Note that the navigation uses `href`, not
`replace`, so Back returns the buyer to your shop rather than stranding them.

## Changing `id` starts a different payment

The frame is replaced and the previous session is torn down synchronously, before the new one
exists. Do not swap `id` while a buyer is paying — the in-flight attempt is abandoned, and its
result is deliberately **not** attributed to the new session. You would otherwise be told
_this_ checkout was paid when a different one was.

Unmounting mid-payment deliberately leaves the gateway window open. Closing it would interrupt
a payment in flight — the buyer may be mid-OTP — to protect a callback whose tree has already
gone. Left alone they finish, see the success card, and the webhook fires: the UI signal is
lost, the money signal is not. The window _is_ closed if the whole page goes away, since by
then there is nothing left to report to at all.

## Rendering more than one

Supported. Each block keeps its own state, its own height and its own callbacks.

The `message` listener, though, is page-wide — one listener however many blocks are mounted —
because `suqo:result` is the one message that cannot be routed by `event.source`. It arrives
from the _gateway window_, not from any frame, so deciding which block a result belongs to is a
page-wide decision: it goes to the block with an attempt in flight, falling back to the only
block on the page when there is exactly one and nothing has been orphaned.

One caveat: do **not** also load the vanilla `suqo-checkout.js` on the same page. Both are
hosts for the same protocol and the gateway's result carries no session id, so with both
mounted either can claim a result belonging to the other.

## Styling

Everything this component draws — the spinner and the failure panel — is styled inline, with no
stylesheet and no `<style>` injection. The chrome renders inside your page, where a class name
could collide with yours and your CSS could restyle it, and shipping a CSS file would cost
`"sideEffects": false` and put an `import '…/styles.css'` line in every consumer's setup. There
is no `styles.css` to import.

Size the block with `className` or `style` on the container; `style` is merged last, so
anything the component sets there can be overridden. The iframe's own height is managed for you
and reported by the frame itself — do not fight it.

The container carries a `data-suqo-react-checkout` attribute if you need to find it.

## Server rendering

`'use client'` is declared, and nothing touches `window` at module scope or during render. The
component renders identical markup on the server and the client, so there is no hydration
mismatch to configure around. `prefers-reduced-motion` is read in an effect for the same
reason: branching on it during render would be a mismatch.

React StrictMode's double-mount is handled — the teardown between the two setups cancels
itself, so the frame is not remounted and no handshake is lost.

## What the buyer sees

A spinner, then the payment block, inline, where you put the component. No modal, no overlay,
no page takeover. The spinner is SVG with its own `<animateTransform>` rather than CSS
`@keyframes` (inline styles have none), and it stops rotating when the buyer prefers reduced
motion.

If the frame never arrives they get the failure panel instead: a heading, one sentence, and a
button that opens `<origin>/checkout/<id>` in a new tab. That link is the point of the panel —
whatever stopped the frame, the buyer still has a session they can pay, and the hosted page has
none of the framing requirements that just failed.

The link points at the hosted checkout, never at the frame URL. The frame URL opened standalone
renders a fully payable block whose result posts to nobody and whose return page skips the
seller's `return_url`, so a buyer taking _that_ escape hatch could pay and have nothing reported
anywhere.

## Exports

```ts
import {
  SUQOCheckout,
  DEFAULT_ORIGIN,
  LIVE_ORIGIN,
  SANDBOX_ORIGIN,
  normaliseOrigin,
  VERSION,
  type SUQOCheckoutProps,
  type CheckoutMode,
  type FailureStatus,
  type ResultStatus,
  type ResultParams,
  type UnavailableReason,
  type LoadError,
} from 'react-suqo-checkout'
```

`LIVE_ORIGIN` / `SANDBOX_ORIGIN` are the two origins `mode` picks between; `normaliseOrigin` is
the same resolution the component runs internally (`origin`, else `mode`, defaulting to
sandbox), exported for anywhere else in your app that needs to build a SUQO URL consistently.

## Troubleshooting

Every message this package prints is prefixed `[SuqoCheckout]`, so a support conversation can
start with searching your console for it.

**The failure panel renders instead of the payment block.**
One of three deadlines expired. Each is armed by a real signal rather than by a guess about how
long the previous stage should take, and `onLoadError` tells you which in `error.stage`:

| Stage   | Deadline | Armed                          | Means                                                              |
| ------- | -------- | ------------------------------ | ------------------------------------------------------------------ |
| `load`  | 20s      | at mount, disarmed by `load`   | nothing came back from the origin at all                           |
| `alive` | 8s       | once the iframe's `load` fired | a document arrived but never ran the checkout script               |
| `ready` | 25s      | once `suqo:alive` arrived      | the script ran but the block never mounted — slowness, not a block |

`load` is deliberately long: a cold serverless start legitimately takes several seconds, and an
earlier version of the vanilla loader failed a 4.8s compile as "blocked".

On the `alive` stage only, a `no-cors` probe of the same URL runs before the panel renders and
fills in `error.diagnosis`. `'unreachable'` means the fetch itself rejected — the origin is
down or the host is wrong. `'blocked'` means the request succeeded and something stopped the
_framing_: a CSP `frame-ancestors` header, a browser extension, or someone else's page at that
URL. Those need opposite fixes, which is the entire reason the probe exists.

**`onUnavailable('not-found')` on a session you just created.**
Check `mode`. A sandbox session does not exist on `app.suqo.ai`, and the reverse.

**The block loads but nothing ever comes back.**
The frame is not recognising your page as its host. Confirm the checkout app serves
`/c/<sessionId>` as a chrome-less block that posts `suqo:alive`, `suqo:ready`, `suqo:resize`,
`suqo:gateway`, `suqo:redirect`, `suqo:unavailable` and `suqo:result`, and `/checkout/<sessionId>`
as the hosted standalone equivalent. A change to one half of the protocol that is not mirrored
in the other fails silently. See
[Requirements on the SUQO web app](../README.md#requirements-on-the-suqo-web-app).

**The callbacks fired twice.**
They should not; the result is latched per attempt. Check you are not also loading the vanilla
`suqo-checkout.js` on the same page, and that you have not remounted the component with a new
`id` while the previous attempt was in flight.

**The block has a scrollbar inside it, or is cut off.**
A host stylesheet is putting a border on the iframe — with `!important` it beats the inline
`border: 0` this package sets. The reported height is the frame's _content_, and the element's
own chrome is added back on top, so this should self-correct; if it does not, check for a
stylesheet setting a fixed `height` on the iframe and overriding the managed one.

**Nothing renders at all in Next.js.**
The component is a client component. If a server component imports it, that is fine — the
`'use client'` boundary is inside the package — but a callback prop passed from a server
component is not serialisable and will throw. Pass callbacks from a client component.
