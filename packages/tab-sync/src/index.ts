import { createId, definePlugin, type Message, type PluginContext, type Route, type SessionSnapshot } from '@handsforbots/core'

/**
 * - `sync`: tabs share one conversation (default).
 * - `notify`: each tab keeps its own conversation but learns what the others did
 *   (actions, finished assistant turns, resets) through the `tabs.activity` event and,
 *   optionally, a context signal the assistant sees.
 * - `off`: tabs are isolated; nothing is broadcast.
 */
export type TabSyncMode = 'sync' | 'notify' | 'off'

export type TabActivity =
  | { kind: 'action'; name: string; origin: string; ok: boolean; error?: string }
  | { kind: 'turn'; phase: 'done' | 'error' | 'aborted'; route?: Route }
  | { kind: 'reset' }

export type TabSyncOptions = {
  /** Channel name; tabs with the same name talk to each other. Default 'default'. */
  channel?: string
  /** Default 'sync'. */
  mode?: TabSyncMode
  /** Minimum interval between broadcasts while text streams, in ms. Default 120. */
  throttleMs?: number
  /** `notify` mode: keep the last `limit` activities of other tabs as a context signal. Default `{ limit: 10 }`; false = event only. */
  context?: false | { limit?: number }
  /** For tests or non-browser runtimes. */
  createChannel?: (name: string) => ChannelLike
}

export type ChannelLike = {
  postMessage(data: unknown): void
  addEventListener(type: 'message', listener: (event: { data: any }) => void): void
  removeEventListener(type: 'message', listener: (event: { data: any }) => void): void
  close(): void
}

declare module '@handsforbots/core' {
  interface Events {
    /** `tab-sync` in `notify` mode: something happened in another tab. */
    'tabs.activity': TabActivity & { tab: string; at: number }
  }
}

type Envelope =
  | { type: 'h4b:snapshot'; from: string; snapshot: SessionSnapshot }
  | { type: 'h4b:activity'; from: string; activity: TabActivity; at: number }

/**
 * Connects tabs/windows of the same origin. In `sync` mode each tab runs its
 * own turns; histories of the same thread are merged by message id (ordered
 * by time), so nothing typed in one tab is lost in another. Snapshots that
 * arrive while a turn is running are merged when it ends. A different thread
 * (e.g. a reset in another tab) replaces the local one.
 */
export const tabSync = definePlugin<TabSyncOptions | undefined>({
  name: 'tab-sync',
  apply(ctx, options = {}) {
    const mode = options.mode ?? 'sync'
    if (mode === 'off') return
    const create =
      options.createChannel ??
      (typeof BroadcastChannel !== 'undefined' ? (name: string) => new BroadcastChannel(name) as ChannelLike : undefined)
    if (!create) return
    const channel = create(`h4b:${options.channel ?? 'default'}`)
    const tabId = createId('tab')
    const post = (envelope: Envelope) => {
      try {
        channel.postMessage(envelope)
      } catch (error) {
        ctx.emit('error', { error, source: 'tab-sync' }) // e.g. Blobs that can't be cloned
      }
    }
    ctx.onDispose(() => channel.close())
    if (mode === 'notify') notify(ctx, options, channel, tabId, post)
    else sync(ctx, options, channel, tabId, post)
  },
})

type Post = (envelope: Envelope) => void

function sync(ctx: PluginContext, options: TabSyncOptions, channel: ChannelLike, tabId: string, post: Post) {
  const throttle = options.throttleMs ?? 120
  let applying = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastSent = 0

  const send = () => {
    timer = undefined
    lastSent = Date.now()
    post({ type: 'h4b:snapshot', from: tabId, snapshot: ctx.app.conversation.snapshot() })
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
      incoming.threadId === local.threadId ? { ...incoming, messages: merge(local.messages, incoming.messages) } : incoming
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
    if (ctx.app.busy) deferred = data.snapshot
    else apply(data.snapshot)
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
  })
}

function notify(ctx: PluginContext, options: TabSyncOptions, channel: ChannelLike, tabId: string, post: Post) {
  const limit = options.context === false ? 0 : (options.context?.limit ?? 10)
  const recent: (TabActivity & { tab: string; at: number })[] = []
  const share = (activity: TabActivity) => post({ type: 'h4b:activity', from: tabId, activity, at: Date.now() })

  ctx.on('action.invoked', ({ name, origin, error }) =>
    share({ kind: 'action', name, origin, ok: !error, ...(error ? { error } : {}) }),
  )
  ctx.on('turn.status', ({ phase, route }) => {
    if (route === 'direct' || route === 'agent') return // reported as actions
    if (phase === 'done' || phase === 'error' || phase === 'aborted') share({ kind: 'turn', phase, route })
  })
  let threadId = ctx.app.conversation.threadId
  ctx.on('messages.changed', () => {
    if (ctx.app.conversation.threadId === threadId) return
    threadId = ctx.app.conversation.threadId
    share({ kind: 'reset' })
  })

  const onMessage = ({ data }: { data: any }) => {
    if (data?.type !== 'h4b:activity' || data.from === tabId) return
    const entry = { ...(data.activity as TabActivity), tab: data.from as string, at: data.at as number }
    ctx.emit('tabs.activity', entry)
    if (limit <= 0) return
    recent.push(entry)
    recent.splice(0, recent.length - limit)
    ctx.signal({
      kind: 'context',
      key: 'tab-sync.activity',
      modality: 'gui-event',
      source: 'tab-sync',
      parts: [{ type: 'data', name: 'other_tabs_activity', value: [...recent] }],
    })
  }
  channel.addEventListener('message', onMessage)
  ctx.onDispose(() => {
    channel.removeEventListener('message', onMessage)
    if (recent.length) ctx.app.removeContext('tab-sync.activity')
  })
}

/** Union by id (incoming wins for the same id), ordered by creation time. */
export function merge(local: Message[], incoming: Message[]): Message[] {
  const byId = new Map<string, Message>()
  for (const message of local) byId.set(message.id, message)
  for (const message of incoming) byId.set(message.id, message)
  const order = new Map<string, number>()
  ;[...local, ...incoming].forEach((m, i) => order.has(m.id) || order.set(m.id, i))
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt || order.get(a.id)! - order.get(b.id)!)
}
