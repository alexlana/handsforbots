import { createId, definePlugin, textOf, type Message, type Part, type Stimulus, type Transport, type TurnRequest } from '@handsforbots/core'

/** The subset of the AI SDK UIMessage shape this transport sends. */
export type UIMessagePart =
  | { type: 'text'; text: string }
  | { type: 'file'; mediaType: string; url: string; filename?: string }
  | {
      type: 'dynamic-tool'
      toolName: string
      toolCallId: string
      state: 'input-available' | 'output-available' | 'output-error'
      input: unknown
      output?: unknown
      errorText?: string
    }
  | { type: `data-${string}`; data: unknown }

export type UIMessage = { id: string; role: 'user' | 'assistant' | 'system'; parts: UIMessagePart[] }

export type AiSdkTransportOptions = {
  /** Route that returns `streamText(...).toUIMessageStreamResponse()`, e.g. /api/chat. */
  url: string
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>)
  /** Extra fields for the request body (model, settings…). */
  body?: Record<string, unknown> | ((request: TurnRequest) => Record<string, unknown>)
  fetch?: typeof fetch
}

export const aiSdk = definePlugin<AiSdkTransportOptions>({
  name: 'transport-ai-sdk',
  provides: ['transport'],
  apply(ctx, options) {
    ctx.provide('transport', createAiSdkTransport(options))
  },
})

/**
 * Talks to an AI SDK chat route (UI message stream protocol). The request
 * mirrors `DefaultChatTransport` (`id`, `messages`, `trigger`) and adds `tools`
 * (the actions the assistant may call) and `context` (H4B context signals), so
 * the route can declare them as client-side tools:
 *
 *   const { messages, tools, context } = await req.json()
 *   return streamText({
 *     model,
 *     system: `Screen: ${JSON.stringify(context)}`,
 *     messages: await convertToModelMessages(messages),
 *     tools: Object.fromEntries(tools.map((t) => [t.name, tool({ description: t.description, inputSchema: jsonSchema(t.parameters) })])),
 *   }).toUIMessageStreamResponse()
 */
export function createAiSdkTransport(options: AiSdkTransportOptions): Transport {
  return {
    name: 'ai-sdk',
    capabilities: { streaming: true, tools: true, media: ['image/*', 'application/pdf'] },
    async *run(request, signal) {
      const last = request.messages.at(-1)
      if (!last || last.role === 'assistant') return
      const headers = typeof options.headers === 'function' ? await options.headers() : options.headers
      const extra = typeof options.body === 'function' ? options.body(request) : options.body
      const response = await (options.fetch ?? fetch)(options.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          ...extra,
          id: request.threadId,
          messages: await toUIMessages(request.messages),
          trigger: 'submit-message',
          tools: request.actions,
          context: Object.fromEntries(
            request.context.map((s) => [s.key ?? s.source, s.parts.map((p) => (p.type === 'text' ? p.text : p.type === 'data' ? p.value : p.type))]),
          ),
        }),
        signal,
      })
      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => '')
        throw new Error(`AI SDK route responded ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`)
      }
      const mapper = createChunkMapper()
      for await (const chunk of readUIMessageStream(response.body)) yield* mapper(chunk)
      yield* mapper({ type: '__end' })
    },
  }
}

/* -------------------------------------------------------------------------- */
/* H4B → UIMessage                                                            */
/* -------------------------------------------------------------------------- */

export async function toUIMessages(messages: Message[]): Promise<UIMessage[]> {
  const result: UIMessage[] = []
  const toolParts = new Map<string, Extract<UIMessagePart, { type: 'dynamic-tool' }>>()
  for (const message of messages) {
    if (message.role === 'user') {
      result.push({ id: message.id, role: 'user', parts: await Promise.all(message.parts.map(toUIPart)) })
    } else if (message.role === 'assistant') {
      const parts: UIMessagePart[] = []
      const text = textOf(message)
      if (text) parts.push({ type: 'text', text })
      for (const call of message.toolCalls ?? []) {
        const part = { type: 'dynamic-tool' as const, toolName: call.name, toolCallId: call.id, state: 'input-available' as const, input: call.args ?? {} }
        toolParts.set(call.id, part as never)
        parts.push(part)
      }
      if (parts.length) result.push({ id: message.id, role: 'assistant', parts })
    } else {
      const part = toolParts.get(message.toolCallId)
      if (!part) continue
      if (message.error) Object.assign(part, { state: 'output-error', errorText: message.error })
      else Object.assign(part, { state: 'output-available', output: message.result ?? null })
    }
  }
  return result
}

async function toUIPart(part: Part): Promise<UIMessagePart> {
  if (part.type === 'text') return { type: 'text', text: part.text }
  if (part.type === 'data') return { type: 'text', text: `${part.name}: ${JSON.stringify(part.value)}` }
  const url =
    part.source.kind === 'url'
      ? part.source.url
      : `data:${part.mimeType};base64,${part.source.kind === 'base64' ? part.source.data : await blobToBase64(part.source.blob)}`
  return { type: 'file', mediaType: part.mimeType, url, ...(part.name ? { filename: part.name } : {}) }
}

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/* -------------------------------------------------------------------------- */
/* UI message stream → stimuli                                                */
/* -------------------------------------------------------------------------- */

export async function* readUIMessageStream(body: ReadableStream<Uint8Array>): AsyncGenerator<any> {
  const reader = body.pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>).getReader()
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
        const data = block
          .split(/\r?\n/)
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim())
          .join('\n')
        if (!data) continue
        if (data === '[DONE]') return
        yield JSON.parse(data)
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/** Stateful mapper for one response: UI message chunks in, stimuli out. */
export function createChunkMapper(): (chunk: any) => Stimulus[] {
  let messageId = createId('msg')
  let open = false
  const providerExecuted = new Set<string>()

  const ensureOpen = (): Stimulus[] => {
    if (open) return []
    open = true
    return [{ type: 'message.start', messageId }]
  }
  const close = (): Stimulus[] => {
    if (!open) return []
    open = false
    return [{ type: 'message.end', messageId }]
  }

  return (chunk) => {
    switch (chunk.type) {
      case 'start':
        if (chunk.messageId) messageId = chunk.messageId
        return []
      case 'text-start':
        return ensureOpen()
      case 'text-delta':
        return [...ensureOpen(), { type: 'message.delta', messageId, delta: chunk.delta }]
      case 'file':
        return [
          ...ensureOpen(),
          {
            type: 'message.part',
            messageId,
            part: { type: chunk.mediaType?.startsWith('image/') ? 'image' : 'file', mimeType: chunk.mediaType, source: { kind: 'url', url: chunk.url } },
          },
        ]
      case 'tool-input-available':
        if (chunk.providerExecuted) providerExecuted.add(chunk.toolCallId)
        return [{ type: 'action.call', callId: chunk.toolCallId, name: chunk.toolName, args: chunk.input ?? {}, messageId }]
      case 'tool-output-available':
        return [{ type: 'action.result', callId: chunk.toolCallId, result: chunk.output }]
      case 'tool-output-error':
        return [{ type: 'action.result', callId: chunk.toolCallId, result: { error: chunk.errorText } }]
      case 'error':
        return [{ type: 'error', message: chunk.errorText ?? 'AI SDK stream error' }]
      case 'finish':
      case 'abort':
      case '__end':
        return close()
      default:
        if (typeof chunk.type === 'string' && chunk.type.startsWith('data-')) {
          const name = chunk.type.slice(5)
          if (name === 'ui-effect') return [{ type: 'ui.effect', name: chunk.data?.name, value: chunk.data?.value }]
          if (name === 'ui-render') return [{ type: 'ui.render', component: chunk.data?.component, props: chunk.data?.props, slot: chunk.data?.slot }]
          if (name === 'state') return [{ type: 'state.snapshot', state: chunk.data }]
          return [{ type: 'custom', name: `ai-sdk.data.${name}`, value: chunk.data }]
        }
        return [] // text-end, reasoning-*, step markers, sources, metadata
    }
  }
}
