import { createId, definePlugin, type Message, type SessionSnapshot } from '@handsforbots/core'

export type TabSyncOptions = {
  /** Channel name; tabs with the same name share the conversation. Default 'h4b'. */
  channel?: string
  /** Minimum interval between broadcasts while text streams, in ms. Default 120. */
  throttleMs?: number
  /** For tests or non-browser runtimes. */
  createChannel?: (name: string) => ChannelLike
}

export type ChannelLike = {
  postMessage(data: unknown): void
  addEventListener(type: 'message', listener: (event: { data: any }) => void): void
  removeEventListener(type: 'message', listener: (event: { data: any }) => void): void
  close(): void
}

type Envelope = { type: 'h4b:snapshot'; from: string; snapshot: SessionSnapshot }

/**
 * Mirrors the conversation across tabs/windows. Each tab runs its own turns;
 * histories of the same thread are merged by message id (ordered by time), so
 * nothing typed in one tab is lost in another. Snapshots that arrive while a
 * turn is running are merged when it ends. A different thread (e.g. a reset
 * in another tab) replaces the local one.
 */
export const tabSync = definePlugin<TabSyncOptions | undefined>({
  name: 'tab-sync',
  apply(ctx, options = {}) {
    const create =
      options.createChannel ??
      (typeof BroadcastChannel !== 'undefined' ? (name: string) => new BroadcastChannel(name) as ChannelLike : undefined)
    if (!create) return
    const channel = create(`h4b:${options.channel ?? 'default'}`)
    const tabId = createId('tab')
    const throttle = options.throttleMs ?? 120
    let applying = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let lastSent = 0

    const send = () => {
      timer = undefined
      lastSent = Date.now()
      const envelope: Envelope = { type: 'h4b:snapshot', from: tabId, snapshot: ctx.app.conversation.snapshot() }
      try {
        channel.postMessage(envelope)
      } catch (error) {
        ctx.emit('error', { error, source: 'tab-sync' }) // e.g. Blobs that can't be cloned
      }
    }

    ctx.on('messages.changed', () => {
      if (applying || timer) return
      const wait = Math.max(0, throttle - (Date.now() - lastSent))
      timer = setTimeout(send, wait)
    })

    let deferred: SessionSnapshot | undefined

    const apply = (incoming: SessionSnapshot) => {
      const local = ctx.app.conversation.snapshot()
      const next =
        incoming.threadId === local.threadId
          ? { ...incoming, messages: merge(local.messages, incoming.messages) }
          : incoming
      applying = true
      try {
        ctx.app.conversation.restore(next)
      } finally {
        applying = false
      }
      // Tell the others if they are missing something we had.
      if (next.messages.length > incoming.messages.length) send()
    }

    const onMessage = ({ data }: { data: any }) => {
      if (data?.type !== 'h4b:snapshot' || data.from === tabId) return
      if (ctx.app.busy) deferred = (data as Envelope).snapshot
      else apply((data as Envelope).snapshot)
    }

    ctx.on('turn.status', (status) => {
      if (!deferred || (status.phase !== 'done' && status.phase !== 'error' && status.phase !== 'aborted')) return
      const snapshot = deferred
      deferred = undefined
      // Let the kernel finish its bookkeeping for the turn first.
      setTimeout(() => !ctx.isDisposed && apply(snapshot), 0)
    })
    channel.addEventListener('message', onMessage)
    ctx.onDispose(() => {
      clearTimeout(timer)
      channel.removeEventListener('message', onMessage)
      channel.close()
    })
  },
})

/** Union by id (incoming wins for the same id), ordered by creation time. */
export function merge(local: Message[], incoming: Message[]): Message[] {
  const byId = new Map<string, Message>()
  for (const message of local) byId.set(message.id, message)
  for (const message of incoming) byId.set(message.id, message)
  const order = new Map<string, number>()
  ;[...local, ...incoming].forEach((m, i) => order.has(m.id) || order.set(m.id, i))
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt || order.get(a.id)! - order.get(b.id)!)
}
