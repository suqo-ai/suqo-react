# Changelog

All notable changes to this project are documented here.

The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `onIntent` prop and `suqo:intent` message: the frame can now ask this package to hand a
  bank/wallet deeplink (`intent://…`, `fonepayApp://…`) to your own code instead of
  attempting the navigation itself, which its sandbox never allowed. This package never
  navigates on it — only `javascript:`/`data:`/`file:`/`blob:` are refused, everything
  else passes through verbatim. Matches `js-checkout`'s `onIntent` (shipped the same way
  there) and `suqo-react-native`, which explicitly drops this message as a no-op since its
  WebView already handles deeplinks through navigation interception.

## [0.1.0]

### Added

- `<SUQOCheckout id="cks_…" />` — the embedded SUQO payment block as a React component, with
  `onReady`, `onSuccess`, `onFailure`, `onUnavailable` and `onLoadError`.
- `DEFAULT_ORIGIN`, and the `ResultParams`, `ResultStatus`, `FailureStatus`,
  `UnavailableReason` and `LoadError` types.

### Requires

This is one half of a protocol. The SUQO web app must serve:

- `/c/<sessionId>` — the chrome-less payment block, posting `suqo:alive` from the route layout
  (not the block, or two deadlines collapse into one), reporting height from the card rather
  than the document, and posting `suqo:ready` on every settled state including errors.
- `/checkout/<sessionId>` — the hosted standalone equivalent, which is where the failure panel
  and `suqo:redirect` both send a buyer.

`PROTOCOL.md` in the `js-checkout` project is the contract.

### Notes

- `DEFAULT_ORIGIN` is `https://test.suqo.ai`. It changes at the production cutover, and that
  will be a breaking change for anyone relying on the default rather than passing `origin`.
- `treeshake` is off in the tsup config on purpose: it routes the bundle through Rollup, which
  drops the `'use client'` banner, and Next.js App Router then refuses the package. `npm run
check:dist` asserts the directive survived.
- Unmounting while a buyer is mid-payment leaves their gateway window open. They finish and the
  webhook fires; only the callback is lost, because it belongs to a tree that no longer exists.

[Unreleased]: https://github.com/Code-Pros-AI/react-suqo-checkout/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Code-Pros-AI/react-suqo-checkout/releases/tag/v0.1.0
