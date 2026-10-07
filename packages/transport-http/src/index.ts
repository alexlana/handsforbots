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

type Headers = Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>)

export type SessionOptions = {
  /** Endpoint that opens a session (e.g. POST /sessions or GET /session). */
  url: string
  method?: 'GET' | 'POST'
  body?: (request: TurnRequest) => unknown
  /** Reads the session id from the JSON response. Default: session_id | sessionId | id. */
  extract?: (json: any) => string | undefined
  /** If the session endpoint fails, fall back to the H4B thread id. Default true. */
  fallbackToThread?: boolean
}

export type HttpTransportOptions = {
  url: string | ((request: TurnRequest, session?: string) => string)
  method?: string
  headers?: Headers | ((request: TurnRequest, session?: string) => Record<string, string> | Promise<Record<string, string>>)
  /** Opens a backend session once per thread (bootstrap/initialize style APIs). */
  session?: SessionOptions
  /** Request body. Default: `defaultBody` (message, history, context, tools). */
  body?: (request: TurnRequest, session?: string) => unknown
  /** JSON response → stimuli. Default: `parseResponse` (text, arrays of messages, chat completions, tool calls). */
  parse?: (json: any) => Stimulus[]
  /** SSE chunk → stimuli/tool deltas. Used when the response is text/event-stream. */
  parseChunk?: ChunkParser
  /** After client actions run, call the backend again with their results. Default true. */
  sendToolResults?: boolean
  name?: string
  fetch?: typeof fetch
}

export type ChunkResult = {
  text?: string
  toolCalls?: { index?: number; id?: string; name?: string; arguments?: string }[]
  stimuli?: Stimulus[]
  done?: boolean
}
export type ChunkParser = (data: any) => ChunkResult | undefined

export const http = definePlugin<HttpTransportOptions>({
  name: 'transport-http',
  provides: ['transport'],
  apply(ctx, options) {
    ctx.provide('transport', createHttpTransport(options))
  },
})

export function createHttpTransport(options: HttpTransportOptions): Transport {
  const sessions = new Map<string, Promise<string>>()
  const fetchFn = () => options.fetch ?? fetch

  const sessionFor = (request: TurnRequest): Promise<string> | undefined => {
    const session = options.session
    if (!session) return undefined
    let pending = sessions.get(request.threadId)
    if (!pending) {
      pending = (async () => {
        try {
          const response = await fetchFn()(session.url, {
            method: session.method ?? 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            ...(session.method === 'GET' ? {} : { body: JSON.stringify(session.body?.(request) ?? { thread_id: request.threadId }) }),
          })
          if (!response.ok) throw new Error(`session endpoint responded ${response.status}`)
          const json = await response.json()
          const id = (session.extract ?? ((j) => j.session_id ?? j.sessionId ?? j.id))(json)
          if (!id) throw new Error('session endpoint returned no id')
          return String(id)
        } catch (error) {
          if (session.fallbackToThread === false) {
            sessions.delete(request.threadId)
            throw error
          }
          return request.threadId
        }
      })()
      sessions.set(request.threadId, pending)
    }
    return pending
  }

  return {
    name: options.name ?? 'http',
    capabilities: { streaming: true, tools: true },
    async *run(request, signal) {
      const last = request.messages.at(-1)
      if (!last || (last.role === 'tool' && options.sendToolResults === false)) return
      if (last.role === 'assistant') return

      const session = await sessionFor(request)
      const url = typeof options.url === 'function' ? options.url(request, session) : options.url
      const headers =
        typeof options.headers === 'function' ? await options.headers(request as never, session) : (options.headers ?? {})
      const response = await fetchFn()(url, {
        method: options.method ?? 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...(session ? { 'X-Session-ID': session } : {}),
          ...headers,
        },
        body: JSON.stringify((options.body ?? defaultBody)(request, session)),
        signal,
      })
      if (!response.ok) {
        let detail = ''
        try {
          detail = (await response.text()).slice(0, 200)
        } catch {
          /* ignore */
        }
        throw new Error(`Backend responded ${response.status}${detail ? `: ${detail}` : ''}`)
      }
      if (response.headers.get('content-type')?.includes('text/event-stream') && response.body) {
        yield* streamStimuli(response.body, options.parseChunk ?? parseChunk)
      } else {
        const textBody = await response.text()
        let json: unknown = textBody
        try {
          json = JSON.parse(textBody)
        } catch {
          /* plain text */
        }
        yield* (options.parse ?? parseResponse)(json)
      }
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Request bodies                                                             */
/* -------------------------------------------------------------------------- */

export type ChatMessage = {
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string | null
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
  name?: string
}

/** H4B history → OpenAI-style chat messages (the lingua franca of LLM backends). */
export function toChatMessages(messages: Message[], window?: number): ChatMessage[] {
  const chat: ChatMessage[] = []
  for (const message of messages) {
    if (message.role === 'user') {
      chat.push({ role: 'user', content: partsText(message.parts) })
    } else if (message.role === 'assistant') {
      const content = textOf(message)
      if (!content && !message.toolCalls?.length) continue
      chat.push({
        role: 'assistant',
        content: content || null,
        ...(message.toolCalls?.length
          ? {
              tool_calls: message.toolCalls.map((c) => ({
                id: c.id,
                type: 'function' as const,
                function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) },
              })),
            }
          : {}),
      })
    } else {
      chat.push({
        role: 'tool',
        tool_call_id: message.toolCallId,
        name: message.name,
        content: JSON.stringify(message.error ? { error: message.error } : (message.result ?? null)),
      })
    }
  }
  if (!window) return chat
  // Keep the last `window` messages, without starting on an orphan tool result.
  let start = Math.max(0, chat.length - window)
  while (start > 0 && chat[start]?.role === 'tool') start--
  return chat.slice(start)
}

function partsText(parts: Part[]): string {
  return parts
    .map((p) => (p.type === 'text' ? p.text : p.type === 'data' ? `${p.name}: ${JSON.stringify(p.value)}` : `[${p.type}]`))
    .join('\n')
}

export function contextObject(context: Signal[]): Record<string, unknown> {
  return Object.fromEntries(
    context.map((s) => [
      s.key ?? s.source,
      s.parts.map((p) => (p.type === 'text' ? p.text : p.type === 'data' ? p.value : `[${p.type}]`)),
    ]),
  )
}

export const toolsOf = (request: TurnRequest) =>
  request.actions.map((a) => ({ type: 'function' as const, function: { name: a.name, description: a.description, parameters: a.parameters } }))

/** Generic body: the new input, the history the `memory` plugin lets through, screen context and available tools. */
export function defaultBody(request: TurnRequest, session?: string) {
  const last = request.messages.at(-1)
  return {
    thread_id: request.threadId,
    session_id: session,
    turn_id: request.turnId,
    message: last?.role === 'user' ? partsText(last.parts) : undefined,
    messages: toChatMessages(request.messages),
    context: contextObject(request.context),
    tools: toolsOf(request),
    state: request.state,
  }
}

/* -------------------------------------------------------------------------- */
/* Responses                                                                  */
/* -------------------------------------------------------------------------- */

const textMessage = (text: string): Stimulus[] => {
  const messageId = createId('msg')
  return [
    { type: 'message.start', messageId },
    { type: 'message.delta', messageId, delta: text },
    { type: 'message.end', messageId },
  ]
}

const toolCallStimulus = (call: any): Stimulus | undefined => {
  const fn = call.function ?? call
  if (!fn?.name) return undefined
  let args: unknown = fn.arguments ?? fn.args ?? fn.parameters ?? {}
  if (typeof args === 'string') {
    try {
      args = args ? JSON.parse(args) : {}
    } catch {
      args = { _raw: args }
    }
  }
  return { type: 'action.call', callId: call.id ?? createId('call'), name: fn.name, args }
}

/**
 * Understands common response shapes: plain text; `{ response | content | text
 * | message }`; arrays of messages (`{ text, image, buttons }`, Rasa-like);
 * OpenAI chat completions (`choices[0].message`, tool calls); and top-level
 * `tool_calls`. `error`/`status >= 400` become errors.
 */
export function parseResponse(json: any): Stimulus[] {
  if (json == null) return []
  if (typeof json === 'string') return json.trim() ? textMessage(json) : []
  if (Array.isArray(json)) return json.flatMap((item) => (typeof item === 'string' ? textMessage(item) : messageItem(item)))
  if (json.error) {
    const message = typeof json.error === 'string' ? json.error : (json.error.message ?? JSON.stringify(json.error))
    return [{ type: 'error', message }]
  }
  if (Array.isArray(json.choices)) {
    const message = json.choices[0]?.message ?? {}
    return [
      ...(message.content ? textMessage(message.content) : []),
      ...((message.tool_calls ?? []).map(toolCallStimulus).filter(Boolean) as Stimulus[]),
    ]
  }
  if (Array.isArray(json.messages)) return parseResponse(json.messages)
  return messageItem(json)
}

function messageItem(item: any): Stimulus[] {
  const text = item.response ?? item.content ?? item.text ?? item.message ?? item.output
  const out: Stimulus[] = []
  const replies = item.buttons ?? item.quick_replies
  if (typeof text === 'string' || item.image || replies?.length) {
    const messageId = createId('msg')
    out.push({ type: 'message.start', messageId })
    if (typeof text === 'string' && text) out.push({ type: 'message.delta', messageId, delta: text })
    if (item.image) {
      out.push({ type: 'message.part', messageId, part: { type: 'image', mimeType: 'image/*', source: { kind: 'url', url: item.image } } })
    }
    if (replies?.length) {
      out.push({
        type: 'message.part',
        messageId,
        part: { type: 'data', name: 'quick_replies', value: replies.map((b: any) => ({ label: b.title ?? b.label, payload: b.payload })) },
      })
    }
    out.push({ type: 'message.end', messageId })
  }
  for (const call of item.tool_calls ?? item.toolCalls ?? []) {
    const stimulus = toolCallStimulus(call)
    if (stimulus) out.push(stimulus)
  }
  if (item.state !== undefined) out.push({ type: 'state.snapshot', state: item.state })
  return out
}

/** Default SSE chunk parser: OpenAI-style `choices[0].delta` or `{ delta | content | response | text }`. */
export const parseChunk: ChunkParser = (data) => {
  if (data === '[DONE]') return { done: true }
  if (typeof data === 'string') return { text: data }
  if (data?.error) return { stimuli: [{ type: 'error', message: data.error.message ?? String(data.error) }] }
  const delta = data?.choices?.[0]?.delta
  if (delta) {
    return {
      text: delta.content ?? undefined,
      toolCalls: delta.tool_calls?.map((c: any) => ({ index: c.index, id: c.id, name: c.function?.name, arguments: c.function?.arguments })),
    }
  }
  const text = data?.delta ?? data?.content ?? data?.response ?? data?.text
  return typeof text === 'string' ? { text } : { stimuli: parseResponse(data) }
}

async function* streamStimuli(body: ReadableStream<Uint8Array>, parse: ChunkParser): AsyncGenerator<Stimulus> {
  const reader = body.pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>).getReader()
  const messageId = createId('msg')
  let started = false
  const calls = new Map<number | string, { id?: string; name?: string; arguments: string }>()
  let buffer = ''
  try {
    outer: while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      let boundary: number
      while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, '')
        const raw = block
          .split(/\r?\n/)
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).replace(/^ /, ''))
          .join('\n')
        if (!raw) continue
        let data: any = raw
        try {
          data = JSON.parse(raw)
        } catch {
          /* text chunk or [DONE] */
        }
        const chunk = parse(data)
        if (!chunk) continue
        if (chunk.text) {
          if (!started) {
            started = true
            yield { type: 'message.start', messageId }
          }
          yield { type: 'message.delta', messageId, delta: chunk.text }
        }
        for (const call of chunk.toolCalls ?? []) {
          const key = call.index ?? call.id ?? calls.size
          const entry = calls.get(key) ?? { arguments: '' }
          if (call.id) entry.id = call.id
          if (call.name) entry.name = call.name
          if (call.arguments) entry.arguments += call.arguments
          calls.set(key, entry)
        }
        for (const stimulus of chunk.stimuli ?? []) yield stimulus
        if (chunk.done) break outer
      }
    }
  } finally {
    reader.releaseLock()
  }
  if (started) yield { type: 'message.end', messageId }
  for (const call of calls.values()) {
    const stimulus = toolCallStimulus({ id: call.id, function: { name: call.name, arguments: call.arguments } })
    if (stimulus) yield { ...stimulus, messageId: started ? messageId : undefined } as Stimulus
  }
}

/* -------------------------------------------------------------------------- */
/* Presets                                                                    */
/* -------------------------------------------------------------------------- */

export type UniversalLLMOptions = {
  /** Your backend endpoint (it holds the provider keys). */
  url: string
  provider?: string
  model?: string
  systemPrompt?: string
  /** Extra cap on history messages sent along. Default: none (the `memory` plugin decides which turns are sent). */
  contextWindow?: number
  parameters?: Record<string, unknown>
  stream?: boolean
  headers?: Headers
  /** Open a backend session at `${url}/session` (v1 behavior). Default true. */
  backendSession?: boolean
  fetch?: typeof fetch
}

/** The v1 UniversalLLM request format, now with tools, context and optional streaming. */
export const universalLLM = definePlugin<UniversalLLMOptions>({
  name: 'transport-universal-llm',
  provides: ['transport'],
  apply(ctx, options) {
    ctx.provide('transport', createUniversalLLMTransport(options))
  },
})

export function createUniversalLLMTransport(options: UniversalLLMOptions): Transport {
  return createHttpTransport({
    name: 'universal-llm',
    url: options.url,
    headers: options.headers as never,
    fetch: options.fetch,
    session: options.backendSession === false ? undefined : { url: `${options.url.replace(/\/$/, '')}/session`, method: 'GET' },
    body: (request, session) => {
      const history = toChatMessages(request.messages, options.contextWindow === undefined ? undefined : options.contextWindow + 1)
      const current = history.at(-1)!
      const now = new Date().toISOString()
      return {
        request_id: createId('req'),
        session_id: session,
        timestamp: now,
        provider: options.provider ?? 'auto',
        model: options.model ?? 'auto',
        messages: [{ ...current, timestamp: now }],
        parameters: { max_tokens: 1024, temperature: 0.7, top_p: 0.9, ...options.parameters, stream: !!options.stream },
        context: {
          system_prompt: options.systemPrompt ?? null,
          conversation_history: history.slice(0, -1),
          tools: toolsOf(request),
          h4b_context: contextObject(request.context),
        },
        options: { include_usage: true, include_metadata: true, response_format: 'text' },
      }
    },
  })
}

export type OpenAICompatibleOptions = {
  /** Base URL, e.g. http://localhost:11434/v1 (Ollama) or your proxy. */
  baseUrl: string
  model: string
  systemPrompt?: string
  /**
   * Only for local development: a key in the browser is public. In production
   * point `baseUrl` at your own backend proxy instead.
   */
  apiKey?: string
  stream?: boolean
  temperature?: number
  /** Extra cap on history messages sent along. Default: none (the `memory` plugin decides which turns are sent). */
  contextWindow?: number
  fetch?: typeof fetch
}

/** Any OpenAI-compatible chat completions API (OpenAI, Ollama, vLLM, LM Studio, LiteLLM…), with native tools. */
export const openAICompatible = definePlugin<OpenAICompatibleOptions>({
  name: 'transport-openai-compatible',
  provides: ['transport'],
  apply(ctx, options) {
    if (options.apiKey && typeof location !== 'undefined' && !/^(localhost|127\.|\[::1\])/.test(location.hostname)) {
      console.warn('[h4b] transport-openai-compatible: an API key in the browser is visible to every visitor. Use a backend proxy.')
    }
    ctx.provide('transport', createOpenAICompatibleTransport(options))
  },
})

export function createOpenAICompatibleTransport(options: OpenAICompatibleOptions): Transport {
  return createHttpTransport({
    name: 'openai-compatible',
    url: `${options.baseUrl.replace(/\/$/, '')}/chat/completions`,
    headers: options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {},
    fetch: options.fetch,
    body: (request) => {
      const context = contextObject(request.context)
      const system = [options.systemPrompt, Object.keys(context).length ? `Screen context: ${JSON.stringify(context)}` : '']
        .filter(Boolean)
        .join('\n\n')
      const tools = toolsOf(request)
      return {
        model: options.model,
        stream: !!options.stream,
        temperature: options.temperature ?? 0.7,
        messages: [...(system ? [{ role: 'system', content: system }] : []), ...toChatMessages(request.messages, options.contextWindow)],
        ...(tools.length ? { tools } : {}),
      }
    },
  })
}
