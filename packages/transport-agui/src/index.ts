import type {
  BaseEvent,
  ContentPart,
  Context as AguiContext,
  Message as AguiMessage,
  RunAgentInput,
} from '@ag-ui/core'
import {
  createId,
  definePlugin,
  textOf,
  type Message,
  type Part,
  type Signal,
  type Stimulus,
  type Transport,
  type TurnRequest,
} from '@handsforbots/core'

/** Anything that turns a RunAgentInput into a stream of AG-UI events (HttpAgent, in-process agents…). */
export type AguiRunner = {
  run(input: RunAgentInput): {
    subscribe(observer: {
      next: (event: BaseEvent) => void
      error: (error: unknown) => void
      complete: () => void
    }): { unsubscribe(): void }
  }
}

export type AguiTransportOptions = {
  /** AG-UI endpoint (HTTP POST + SSE). Ignored when `agent` is given. */
  url?: string
  /** Static headers or a function (e.g. to refresh an auth token per run). */
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>)
  /** Any AG-UI agent, e.g. `new HttpAgent(...)` from @ag-ui/client or an in-process agent. */
  agent?: AguiRunner | (() => AguiRunner)
  forwardedProps?: unknown
  fetch?: typeof fetch
}

/**
 * CUSTOM event names that map to H4B stimuli, so any AG-UI backend can drive
 * GUI effects and host-rendered components.
 */
export const CUSTOM_EVENTS = {
  uiEffect: 'h4b.ui.effect',
  uiRender: 'h4b.ui.render',
} as const

export const agui = definePlugin<AguiTransportOptions>({
  name: 'transport-agui',
  provides: ['transport'],
  apply(ctx, options) {
    ctx.provide('transport', createAguiTransport(options))
  },
})

export function createAguiTransport(options: AguiTransportOptions): Transport {
  if (!options.agent && !options.url) throw new Error('[h4b] transport-agui needs `url` or `agent`')

  return {
    name: 'agui',
    capabilities: { streaming: true, tools: true, media: ['image/*', 'audio/*', 'video/*', 'application/pdf'] },
    async *run(request, signal) {
      const input = await toAguiInput(request, options.forwardedProps)
      const mapper = createEventMapper()
      let events: AsyncIterable<BaseEvent>
      if (options.agent) {
        const agent: AguiRunner & { abortRun?: () => void } =
          typeof options.agent === 'function' ? options.agent() : options.agent
        events = iterate(agent.run(input), signal, () => agent.abortRun?.())
      } else {
        const headers = typeof options.headers === 'function' ? await options.headers() : options.headers
        events = postSSE(options.url!, input, headers ?? {}, signal, options.fetch ?? globalThis.fetch)
      }
      for await (const event of events) yield* mapper(event)
    },
  }
}

/** POSTs a RunAgentInput and yields the AG-UI events of the SSE response. */
export async function* postSSE(
  url: string,
  input: RunAgentInput,
  headers: Record<string, string>,
  signal: AbortSignal,
  fetchFn: typeof fetch = globalThis.fetch,
): AsyncGenerator<BaseEvent> {
  const response = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...headers },
    body: JSON.stringify(input),
    signal,
  })
  if (!response.ok || !response.body) {
    throw new Error(`AG-UI endpoint responded ${response.status} ${response.statusText}`.trim())
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      let boundary: number
      while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, '')
        const event = parseSSEBlock(block)
        if (event) yield event
      }
    }
    const event = parseSSEBlock(buffer)
    if (event) yield event
  } finally {
    reader.releaseLock()
  }
}

function parseSSEBlock(block: string): BaseEvent | undefined {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''))
    .join('\n')
  return data ? (JSON.parse(data) as BaseEvent) : undefined
}

/* -------------------------------------------------------------------------- */
/* H4B → AG-UI                                                                */
/* -------------------------------------------------------------------------- */

export async function toAguiInput(request: TurnRequest, forwardedProps?: unknown): Promise<RunAgentInput> {
  return {
    threadId: request.threadId,
    runId: createId('run'),
    protocolVersion: '1.0',
    state: request.state ?? {},
    messages: await toAguiMessages(request.messages),
    tools: request.actions.map((action) => ({
      name: action.name,
      description: action.description,
      parameters: action.parameters,
    })),
    context: request.context.map(toAguiContext),
    forwardedProps: forwardedProps ?? {},
  }
}

export async function toAguiMessages(messages: Message[]): Promise<AguiMessage[]> {
  const result: AguiMessage[] = []
  for (const message of messages) {
    if (message.role === 'user') {
      const onlyText = message.parts.every((p) => p.type === 'text' || p.type === 'data')
      result.push({
        id: message.id,
        role: 'user',
        content: onlyText ? partsToText(message.parts) : await toContentParts(message.parts),
      })
    } else if (message.role === 'assistant') {
      const content = textOf(message)
      if (!content && !message.toolCalls?.length) continue
      result.push({
        id: message.id,
        role: 'assistant',
        ...(content ? { content } : {}),
        ...(message.toolCalls?.length
          ? {
              toolCalls: message.toolCalls.map((call) => ({
                id: call.id,
                type: 'function' as const,
                function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
              })),
            }
          : {}),
      })
    } else {
      result.push({
        id: message.id,
        role: 'tool',
        toolCallId: message.toolCallId,
        content: message.error ? JSON.stringify({ error: message.error }) : JSON.stringify(message.result ?? null),
        ...(message.error ? { error: message.error } : {}),
      })
    }
  }
  return result
}

function toAguiContext(signal: Signal): AguiContext {
  return {
    description: `${signal.modality} from ${signal.key ?? signal.source}`,
    value: partsToText(signal.parts),
  }
}

/** Text and data parts as plain text; data parts become `name: json`. */
function partsToText(parts: Part[]): string {
  return parts
    .map((part) => {
      if (part.type === 'text') return part.text
      if (part.type === 'data') return `${part.name}: ${JSON.stringify(part.value)}`
      return `[${part.type}${part.name ? ` ${part.name}` : ''}]`
    })
    .join('\n')
}

async function toContentParts(parts: Part[]): Promise<ContentPart[]> {
  const result: ContentPart[] = []
  for (const part of parts) {
    if (part.type === 'text') result.push({ type: 'text', text: part.text })
    else if (part.type === 'data') result.push({ type: 'text', text: `${part.name}: ${JSON.stringify(part.value)}` })
    else {
      const source =
        part.source.kind === 'url'
          ? { type: 'url' as const, value: part.source.url, mimeType: part.mimeType }
          : {
              type: 'data' as const,
              value: part.source.kind === 'base64' ? part.source.data : await blobToBase64(part.source.blob),
              mimeType: part.mimeType,
            }
      const type = part.type === 'file' ? 'document' : part.type
      result.push({ type, source } as ContentPart)
    }
  }
  return result
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/* -------------------------------------------------------------------------- */
/* AG-UI → H4B                                                                */
/* -------------------------------------------------------------------------- */

type PendingCall = { name: string; args: string; parentMessageId?: string }

/** Stateful mapper for one run: AG-UI events in, H4B stimuli out. */
export function createEventMapper(): (event: BaseEvent) => Stimulus[] {
  const calls = new Map<string, PendingCall>()
  const openMessages = new Set<string>()
  let lastChunkMessage: string | undefined
  let lastChunkCall: string | undefined

  const finishCall = (id: string): Stimulus[] => {
    const call = calls.get(id)
    if (!call) return []
    calls.delete(id)
    let args: unknown = {}
    try {
      args = call.args ? JSON.parse(call.args) : {}
    } catch {
      args = { _raw: call.args }
    }
    return [{ type: 'action.call', callId: id, name: call.name, args, messageId: call.parentMessageId }]
  }

  return (raw) => {
    const event = raw as any
    switch (raw.type as string) {
      case 'TEXT_MESSAGE_START':
        openMessages.add(event.messageId)
        return [{ type: 'message.start', messageId: event.messageId }]
      case 'TEXT_MESSAGE_CONTENT':
        return [{ type: 'message.delta', messageId: event.messageId, delta: event.delta }]
      case 'TEXT_MESSAGE_END':
        openMessages.delete(event.messageId)
        return [{ type: 'message.end', messageId: event.messageId }]
      case 'TEXT_MESSAGE_CHUNK': {
        const messageId: string = event.messageId ?? lastChunkMessage ?? createId('msg')
        const out: Stimulus[] = []
        if (!openMessages.has(messageId)) {
          openMessages.add(messageId)
          out.push({ type: 'message.start', messageId })
        }
        lastChunkMessage = messageId
        if (event.delta) out.push({ type: 'message.delta', messageId, delta: event.delta })
        return out
      }
      case 'TOOL_CALL_START':
        calls.set(event.toolCallId, { name: event.toolCallName, args: '', parentMessageId: event.parentMessageId })
        return []
      case 'TOOL_CALL_ARGS': {
        const call = calls.get(event.toolCallId)
        if (call) call.args += event.delta
        return []
      }
      case 'TOOL_CALL_END':
        return finishCall(event.toolCallId)
      case 'TOOL_CALL_CHUNK': {
        const id: string = event.toolCallId ?? lastChunkCall
        if (!id) return []
        const out: Stimulus[] = []
        if (event.toolCallId && event.toolCallId !== lastChunkCall && lastChunkCall) out.push(...finishCall(lastChunkCall))
        if (!calls.has(id)) calls.set(id, { name: event.toolCallName ?? '', args: '', parentMessageId: event.parentMessageId })
        const call = calls.get(id)!
        if (event.toolCallName) call.name = event.toolCallName
        if (event.delta) call.args += event.delta
        lastChunkCall = id
        return out
      }
      case 'TOOL_CALL_RESULT': {
        let result: unknown = event.content
        if (typeof result === 'string') {
          try {
            result = JSON.parse(result)
          } catch {
            /* keep as text */
          }
        }
        return [{ type: 'action.result', callId: event.toolCallId, result }]
      }
      case 'STATE_SNAPSHOT':
        return [{ type: 'state.snapshot', state: event.snapshot }]
      case 'STATE_DELTA':
        return [{ type: 'state.patch', patch: event.delta }]
      case 'CUSTOM':
        if (event.name === CUSTOM_EVENTS.uiEffect) {
          return [{ type: 'ui.effect', name: event.value?.name, value: event.value?.value }]
        }
        if (event.name === CUSTOM_EVENTS.uiRender) {
          return [{ type: 'ui.render', component: event.value?.component, props: event.value?.props, slot: event.value?.slot }]
        }
        return [{ type: 'custom', name: event.name, value: event.value }]
      case 'RUN_ERROR':
        return [{ type: 'error', message: event.message, code: event.code }]
      case 'RUN_FINISHED': {
        // Flush chunked calls/messages that never got an explicit end.
        const out: Stimulus[] = []
        for (const id of [...calls.keys()]) out.push(...finishCall(id))
        for (const id of openMessages) out.push({ type: 'message.end', messageId: id })
        openMessages.clear()
        return out
      }
      case 'RUN_STARTED':
        return []
      default:
        return [{ type: 'custom', name: `agui.${raw.type}`, value: raw }]
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Observable → AsyncIterable                                                 */
/* -------------------------------------------------------------------------- */

async function* iterate(
  observable: ReturnType<AguiRunner['run']>,
  signal: AbortSignal,
  onAbort: () => void,
): AsyncGenerator<BaseEvent> {
  const buffer: BaseEvent[] = []
  let done = false
  let failure: unknown
  let wake: (() => void) | undefined
  const notify = () => {
    wake?.()
    wake = undefined
  }

  const subscription = observable.subscribe({
    next: (event) => {
      buffer.push(event)
      notify()
    },
    error: (error) => {
      failure = error
      done = true
      notify()
    },
    complete: () => {
      done = true
      notify()
    },
  })
  const abort = () => {
    onAbort()
    subscription.unsubscribe()
    done = true
    notify()
  }
  signal.addEventListener('abort', abort, { once: true })

  try {
    while (true) {
      if (buffer.length > 0) {
        yield buffer.shift()!
        continue
      }
      if (done) break
      await new Promise<void>((resolve) => (wake = resolve))
    }
    if (failure && !signal.aborted) throw failure
  } finally {
    signal.removeEventListener('abort', abort)
    subscription.unsubscribe()
  }
}
