import type { H4B } from '@handsforbots/core'

/** What a backend (acting as MCP client) sends in `ui.render` with component 'mcp-app'. */
export type McpAppProps = {
  /** HTML of the `ui://` resource (mimeType text/html;profile=mcp-app). */
  html: string
  /** Tool that produced it, its arguments and result (sent to the app after it initializes). */
  toolName?: string
  input?: Record<string, unknown>
  result?: { content?: unknown[]; structuredContent?: unknown; isError?: boolean } | unknown
  /** From the resource `_meta.ui.csp`. */
  csp?: { connectDomains?: string[]; resourceDomains?: string[]; frameDomains?: string[] }
  title?: string
}

export type McpAppOptions = {
  /** H4B actions the app may call with tools/call (origin 'agent'). Default: none. */
  allowTools?: string[]
  /** Let the app add messages to the conversation (ui/message). Default true. */
  allowMessages?: boolean
  maxHeight?: number
  initialHeight?: number
}

export const PROTOCOL_VERSION = '2026-01-26'

type JsonRpc = { jsonrpc: '2.0'; id?: string | number; method?: string; params?: any; result?: unknown; error?: unknown }

/** Builds the CSP for the app document (MCP Apps default when no domains are declared). */
export function buildCsp(csp: McpAppProps['csp'] = {}): string {
  const list = (domains?: string[]) => (domains?.length ? ` ${domains.join(' ')}` : '')
  const resources = list(csp.resourceDomains)
  return [
    `default-src 'none'`,
    `script-src 'unsafe-inline'${resources}`,
    `style-src 'unsafe-inline'${resources}`,
    `img-src data: blob:${resources}`,
    `font-src data:${resources}`,
    `media-src data: blob:${resources}`,
    `connect-src${list(csp.connectDomains) || " 'none'"}`,
    `frame-src${list(csp.frameDomains) || " 'none'"}`,
    `base-uri 'none'`,
  ].join('; ')
}

/** Injects the CSP as the first element of <head>. */
export function withCsp(html: string, policy: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy.replace(/"/g, '&quot;')}">`
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (head) => `${head}${meta}`)
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (tag) => `${tag}<head>${meta}</head>`)
  return `<!doctype html><html><head>${meta}</head><body>${html}</body></html>`
}

/**
 * Mounts an MCP App in a sandboxed iframe and acts as its host. Returns the
 * element; the bridge is torn down when it is removed from the document.
 */
export function mountMcpApp(h4b: H4B, props: McpAppProps, options: McpAppOptions = {}): HTMLElement {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('sandbox', 'allow-scripts allow-forms')
  iframe.setAttribute('title', props.title ?? props.toolName ?? 'App')
  iframe.setAttribute('referrerpolicy', 'no-referrer')
  iframe.style.cssText = `width:100%;border:0;display:block;height:${options.initialHeight ?? 200}px;border-radius:10px;background:transparent`
  iframe.srcdoc = withCsp(props.html, buildCsp(props.csp))

  const maxHeight = options.maxHeight ?? 600
  const allowTools = new Set(options.allowTools ?? [])
  let initialized = false
  let delivered = false

  const post = (message: Omit<JsonRpc, 'jsonrpc'>) => iframe.contentWindow?.postMessage({ jsonrpc: '2.0', ...message }, '*')
  const respond = (id: JsonRpc['id'], result: unknown) => post({ id, result })
  const fail = (id: JsonRpc['id'], code: number, message: string) => post({ id, error: { code, message } })

  const deliverToolData = () => {
    if (delivered || !initialized) return
    delivered = true
    post({ method: 'ui/notifications/tool-input', params: { arguments: props.input ?? {} } })
    if (props.result !== undefined) post({ method: 'ui/notifications/tool-result', params: toCallToolResult(props.result) })
  }

  const hostContext = () => ({
    theme: typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    displayMode: 'inline',
    availableDisplayModes: ['inline'],
    containerDimensions: { width: iframe.clientWidth || undefined, maxHeight },
    locale: typeof navigator !== 'undefined' ? navigator.language : 'en',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    platform: 'web',
  })

  const onMessage = async (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow) return
    const message = event.data as JsonRpc
    if (message?.jsonrpc !== '2.0' || !message.method) return
    const { id, method, params } = message
    try {
      switch (method) {
        case 'ui/initialize':
          return respond(id, {
            protocolVersion: PROTOCOL_VERSION,
            hostCapabilities: { openLinks: {}, serverTools: allowTools.size ? {} : undefined, logging: {} },
            hostInfo: { name: 'handsforbots', version: '2' },
            hostContext: hostContext(),
          })
        case 'ui/notifications/initialized':
          initialized = true
          return deliverToolData()
        case 'ui/notifications/size-changed':
          if (typeof params?.height === 'number') iframe.style.height = `${Math.min(Math.max(params.height, 40), maxHeight)}px`
          return
        case 'tools/call': {
          const name = String(params?.name ?? '')
          if (!allowTools.has(name)) return fail(id, -32601, `Tool "${name}" is not available to this app`)
          const outcome = await h4b.runAction(name, params?.arguments ?? {}, { origin: 'agent' })
          return respond(id, outcome.error ? toCallToolResult({ error: outcome.error }, true) : toCallToolResult(outcome.result))
        }
        case 'ui/message': {
          if (options.allowMessages === false) return fail(id, -32601, 'Messages are disabled')
          const text = params?.content?.type === 'text' ? String(params.content.text ?? '') : ''
          if (text) h4b.signal({ modality: 'text', source: 'mcp-app', parts: [{ type: 'text', text }], meta: { tool: props.toolName } })
          return respond(id, {})
        }
        case 'ui/open-link': {
          const url = String(params?.url ?? '')
          if (!/^https?:\/\//i.test(url)) return fail(id, -32602, 'Only http(s) links can be opened')
          window.open(url, '_blank', 'noopener,noreferrer')
          return respond(id, {})
        }
        case 'ui/update-model-context':
          h4b.signal({
            kind: 'context',
            key: `mcp-app.${props.toolName ?? 'app'}`,
            modality: 'gui-event',
            source: 'mcp-app',
            parts: [{ type: 'data', name: props.toolName ?? 'app', value: params?.structuredContent ?? params?.content ?? params }],
          })
          return respond(id, {})
        case 'ui/request-display-mode':
          return respond(id, { mode: 'inline' })
        case 'notifications/message':
        case 'ui/notifications/log':
          return
        default:
          if (id !== undefined) fail(id, -32601, `Method not found: ${method}`)
      }
    } catch (error) {
      if (id !== undefined) fail(id, -32603, (error as Error)?.message ?? 'Internal error')
    }
  }

  window.addEventListener('message', onMessage)
  // Tear down when the element leaves the document (message re-render, thread reset).
  const observer = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => {
    if (!iframe.isConnected && observer) {
      window.removeEventListener('message', onMessage)
      observer.disconnect()
    }
  }) : undefined
  queueMicrotask(() => observer?.observe(document.body, { childList: true, subtree: true }))
  return iframe
}

function toCallToolResult(result: unknown, isError = false) {
  if (result && typeof result === 'object' && Array.isArray((result as any).content)) return result
  return {
    content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result ?? null) }],
    ...(result !== null && typeof result === 'object' ? { structuredContent: result } : {}),
    ...(isError ? { isError: true } : {}),
  }
}

/** Renderer for the widget: `widget({ renderers: { 'mcp-app': mcpAppRenderer({ allowTools: [...] }) } })`. */
export function mcpAppRenderer(options: McpAppOptions = {}) {
  return (props: McpAppProps, context: { h4b: H4B }) => mountMcpApp(context.h4b, props, options)
}
