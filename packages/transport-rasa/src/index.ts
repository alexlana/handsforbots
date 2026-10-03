import {
  createId,
  definePlugin,
  textOf,
  type Message,
  type Signal,
  type Stimulus,
  type Transport,
  type TurnRequest,
} from '@handsforbots/core'

/** One item of Rasa's REST channel response. */
export type RasaMessage = {
  recipient_id?: string
  text?: string
  image?: string
  buttons?: { title: string; payload?: string }[]
  quick_replies?: { title: string; payload?: string }[]
  attachment?: unknown
  custom?: Record<string, any>
}

export type RasaTransportOptions = {
  /** e.g. http://localhost:5005/webhooks/rest/webhook */
  url: string
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>)
  /** Rasa conversation id. Default: the H4B thread id. */
  sender?: string | ((request: TurnRequest) => string)
  /** Sent as `metadata` (Rasa passes it to custom actions). Default: H4B context signals. */
  metadata?: (request: TurnRequest) => Record<string, unknown>
  /**
   * When the bot asked for GUI actions (custom.h4b.action), report the results
   * back as a message (e.g. an intent like `/action_done{"name":"x"}`).
   * Default: don't report (as in v1).
   */
  reportActionResults?: (results: { name: string; result?: unknown; error?: string }[]) => string | undefined
  fetch?: typeof fetch
}

export const rasa = definePlugin<RasaTransportOptions>({
  name: 'transport-rasa',
  provides: ['transport'],
  apply(ctx, options) {
    ctx.provide('transport', createRasaTransport(options))
  },
})

export function createRasaTransport(options: RasaTransportOptions): Transport {
  return {
    name: 'rasa',
    capabilities: { streaming: false, tools: true },
    async *run(request, signal) {
      const message = outgoingMessage(request, options)
      if (message === undefined) return

      const headers = typeof options.headers === 'function' ? await options.headers() : options.headers
      const sender =
        typeof options.sender === 'function' ? options.sender(request) : (options.sender ?? request.threadId)
      const response = await (options.fetch ?? fetch)(options.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
        body: JSON.stringify({
          sender,
          message,
          metadata: options.metadata ? options.metadata(request) : contextMetadata(request.context),
        }),
        signal,
      })
      if (!response.ok) throw new Error(`Rasa responded ${response.status} ${response.statusText}`.trim())
      const items = (await response.json()) as RasaMessage[]
      yield* toStimuli(Array.isArray(items) ? items : [])
    },
  }
}

/** What to send for this round: the user's text (or quick-reply payload), or action results. */
function outgoingMessage(request: TurnRequest, options: RasaTransportOptions): string | undefined {
  const last = request.messages.at(-1)
  if (!last) return undefined
  if (last.role === 'user') {
    const payload = last.parts.find((p) => p.type === 'data' && p.name === 'reply_payload')
    if (payload?.type === 'data' && typeof payload.value === 'string') return payload.value
    return textOf(last)
  }
  if (last.role === 'tool' && options.reportActionResults) {
    const results = trailingToolResults(request.messages)
    return options.reportActionResults(results) || undefined
  }
  return undefined
}

function trailingToolResults(messages: Message[]) {
  const results: { name: string; result?: unknown; error?: string }[] = []
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!
    if (message.role !== 'tool') break
    results.unshift({ name: message.name, result: message.result, error: message.error })
  }
  return results
}

function contextMetadata(context: Signal[]): Record<string, unknown> {
  if (!context.length) return {}
  return {
    h4b_context: Object.fromEntries(
      context.map((s) => [s.key ?? s.source, s.parts.map((p) => (p.type === 'text' ? p.text : p.type === 'data' ? p.value : p.type))]),
    ),
  }
}

/**
 * Rasa messages → stimuli. Each message becomes its own bubble; images and
 * buttons attach to it; `custom.h4b` can call GUI actions, effects or renders:
 *
 *   custom: { h4b: { action: { name: 'highlight', args: { target: '#save' } } } }
 *   custom: { h4b: { effect: { name: 'scroll', value: '#top' } } }
 */
export function toStimuli(items: RasaMessage[]): Stimulus[] {
  const stimuli: Stimulus[] = []
  for (const item of items) {
    const messageId = createId('msg')
    const replies = item.buttons ?? item.quick_replies
    const hasBubble = item.text || item.image || replies?.length
    if (hasBubble) {
      stimuli.push({ type: 'message.start', messageId })
      if (item.text) stimuli.push({ type: 'message.delta', messageId, delta: item.text })
      if (item.image) {
        stimuli.push({
          type: 'message.part',
          messageId,
          part: { type: 'image', mimeType: 'image/*', source: { kind: 'url', url: item.image } },
        })
      }
      if (replies?.length) {
        stimuli.push({
          type: 'message.part',
          messageId,
          part: {
            type: 'data',
            name: 'quick_replies',
            value: replies.map((b) => ({ label: b.title, payload: b.payload })),
          },
        })
      }
      stimuli.push({ type: 'message.end', messageId })
    }
    const h4b = item.custom?.h4b
    if (h4b?.action?.name) {
      stimuli.push({
        type: 'action.call',
        callId: createId('call'),
        name: h4b.action.name,
        args: h4b.action.args ?? {},
        ...(hasBubble ? { messageId } : {}),
      })
    }
    if (h4b?.effect?.name) stimuli.push({ type: 'ui.effect', name: h4b.effect.name, value: h4b.effect.value })
    if (h4b?.render?.component) {
      stimuli.push({ type: 'ui.render', component: h4b.render.component, props: h4b.render.props, slot: h4b.render.slot })
    }
    if (item.custom && !h4b) stimuli.push({ type: 'custom', name: 'rasa.custom', value: item.custom })
    if (item.attachment !== undefined) stimuli.push({ type: 'custom', name: 'rasa.attachment', value: item.attachment })
  }
  return stimuli
}
