import type { HostInstance } from './instance'
import { closeGatewayWindow } from './gateway'
import { parseMessage } from './protocol'

/**
 * The page-wide half of the protocol: one `message` listener and one `pagehide` handler,
 * however many blocks are mounted.
 *
 * **Why a singleton rather than a listener per component.** `suqo:result` is the one message
 * that cannot be routed by `event.source` — it arrives from the *gateway window*, not from any
 * frame. With a listener per instance, two mounted blocks would both see it and both claim it.
 * Deciding which block a result belongs to is therefore a page-wide decision, and has to live
 * somewhere page-wide.
 *
 * It also gives `pagehide` the right semantics for free: one handler, firing only if some
 * instance has a gateway open, and surviving any individual component's unmount for as long as
 * another instance remains.
 */

const instances: HostInstance[] = []

/**
 * Whether a block was destroyed while it still had a payment in flight.
 *
 * The gateway window's result carries no session id, so a block has to be guessed at. Usually
 * the guess is free — see the fallback below — but not once an attempt has been orphaned: a
 * result arriving then most likely belongs to the block that just went away, and attributing
 * it to whatever replaced it means telling a merchant that *this* checkout was paid when a
 * different one was.
 */
let orphanedAttempt = false

/** The instance a result belongs to: the one with an attempt in flight. */
function instanceAwaitingResult(): HostInstance | null {
  for (const instance of instances) {
    if (instance.awaitingResult) return instance
  }

  // With exactly one block and nothing orphaned there is nothing to be ambiguous about, and
  // losing a real result to bookkeeping would be worse than this guess.
  if (orphanedAttempt) return null
  return instances.length === 1 ? (instances[0] ?? null) : null
}

function instanceForFrame(source: MessageEventSource | null): HostInstance | null {
  for (const instance of instances) {
    if (instance.ownsFrame(source)) return instance
  }
  return null
}

function onMessage(event: MessageEvent): void {
  const message = parseMessage(event.data)
  if (message === null) return

  const instance =
    message.type === 'suqo:result' ? instanceAwaitingResult() : instanceForFrame(event.source)
  if (instance === null) return
  if (event.origin !== instance.origin) return

  // A fresh attempt supersedes any orphan: from here the new block is the unambiguous owner
  // of whatever comes back, by `awaitingResult` rather than by the fallback.
  if (message.type === 'suqo:gateway') orphanedAttempt = false

  instance.handle(message)
}

function onPageHide(): void {
  // A payable window with nothing left to report back to is worse than no window: the buyer
  // can complete a payment that never reaches the merchant's page. Here the whole page is
  // going, so there will be nothing left at all.
  for (const instance of instances) {
    if (instance.gatewayOpened) {
      closeGatewayWindow()
      return
    }
  }
}

function attach(): void {
  window.addEventListener('message', onMessage)
  // `pagehide`, never `unload` — Permissions-Policy blocks `unload` in current Chrome, so it
  // would simply never fire.
  window.addEventListener('pagehide', onPageHide)
}

function detach(): void {
  window.removeEventListener('message', onMessage)
  window.removeEventListener('pagehide', onPageHide)
}

export function register(instance: HostInstance): void {
  if (instances.includes(instance)) return
  instances.push(instance)
  if (instances.length === 1) attach()
}

export function unregister(instance: HostInstance): void {
  const index = instances.indexOf(instance)
  if (index === -1) return
  if (instance.awaitingResult) orphanedAttempt = true
  instances.splice(index, 1)
  if (instances.length === 0) detach()
}

/** Test-only: how many blocks currently share the page listener. */
export function instanceCount(): number {
  return instances.length
}
