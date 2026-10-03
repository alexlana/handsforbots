/**
 * Deterministic AG-UI agent for the example. It speaks the real protocol
 * (SSE via @ag-ui/encoder), so it can be swapped for any AG-UI server
 * (CopilotKit runtime, LangGraph, Mastra, PydanticAI…) by changing the URL.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { EventType, type BaseEvent, type Message, type RunAgentInput } from '@ag-ui/core'
import { EventEncoder } from '@ag-ui/encoder'

type Step = { tool: string; args: Record<string, unknown> } | { text: string } | { app: true }

export async function handleAgentRequest(req: IncomingMessage, res: ServerResponse) {
  let body = ''
  for await (const chunk of req) body += chunk
  const input = JSON.parse(body) as RunAgentInput
  const encoder = new EventEncoder({ accept: req.headers.accept })
  res.writeHead(200, { 'Content-Type': encoder.getContentType(), 'Cache-Control': 'no-cache' })
  const send = (event: Record<string, unknown>) => res.write(encoder.encode(event as BaseEvent))
  const id = () => Math.random().toString(36).slice(2)

  send({ type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId })
  const step = decide(input)
  if ('app' in step) {
    // An MCP App (ui:// resource) the page renders in a sandboxed iframe.
    const messageId = id()
    send({ type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' })
    send({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: 'Aqui está um resumo interativo:' })
    send({
      type: EventType.CUSTOM,
      name: 'h4b.ui.render',
      value: { component: 'mcp-app', props: { html: SUMMARY_APP, toolName: 'orders_summary', input: {}, result: { open: 2, late: 3, closed: 2 } } },
    })
    send({ type: EventType.TEXT_MESSAGE_END, messageId })
  } else if ('tool' in step) {
    const toolCallId = id()
    send({ type: EventType.TOOL_CALL_START, toolCallId, toolCallName: step.tool })
    send({ type: EventType.TOOL_CALL_ARGS, toolCallId, delta: JSON.stringify(step.args) })
    send({ type: EventType.TOOL_CALL_END, toolCallId })
  } else {
    const messageId = id()
    send({ type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' })
    for (const word of step.text.split(/(?<= )/)) {
      send({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: word })
      await new Promise((r) => setTimeout(r, 25))
    }
    send({ type: EventType.TEXT_MESSAGE_END, messageId })
  }
  send({ type: EventType.RUN_FINISHED, threadId: input.threadId, runId: input.runId })
  res.end()
}

function decide(input: RunAgentInput): Step {
  const last = input.messages.at(-1)
  const tools = new Set(input.tools.map((t) => t.name))
  if (last?.role === 'tool') return { text: summarize(input.messages, last) }

  const text = contentOf(last).toLowerCase()
  const view = input.context.find((c) => c.description.includes('orders.view'))?.value ?? ''

  if (/resumo|gr[aá]fico|summary|chart/.test(text)) return { app: true }
  if (/atrasad|late/.test(text) && tools.has('filter_orders')) return { tool: 'filter_orders', args: { status: 'late' } }
  if (/abert|open/.test(text) && /pedido|order/.test(text) && tools.has('filter_orders')) {
    return { tool: 'filter_orders', args: { status: 'open' } }
  }
  const orderId = /\b(\d{4})\b/.exec(text)?.[1]
  if (orderId && /cancel/.test(text) && tools.has('cancel_order')) return { tool: 'cancel_order', args: { id: orderId } }
  if (orderId && tools.has('open_order')) return { tool: 'open_order', args: { id: orderId } }
  if (/export|baixar|planilha/.test(text) && tools.has('highlight')) return { tool: 'highlight', args: { target: 'export' } }
  if (/onde|where|filtro|filter/.test(text) && tools.has('highlight')) return { tool: 'highlight', args: { target: 'filter' } }

  return {
    text:
      `Sou um agente de exemplo (mock), sem LLM. Posso agir na tela usando as ações que ela me oferece: ` +
      `${[...tools].join(', ')}. Tente "mostre os pedidos atrasados", "abra o pedido 1042", ` +
      `"onde eu exporto?" ou "cancele o pedido 1043". ${view ? `Estou vendo: ${view}.` : ''}`,
  }
}

function summarize(messages: Message[], tool: Extract<Message, { role: 'tool' }>): string {
  const call = messages
    .flatMap((m) => (m.role === 'assistant' ? (m.toolCalls ?? []) : []))
    .find((c) => c.id === tool.toolCallId)
  if (tool.error) return `Não consegui: ${tool.error}`
  const result = safeParse(tool.content)
  switch (call?.function.name) {
    case 'filter_orders':
      return `Pronto, filtrei a lista: ${result?.count ?? 0} pedido(s) ${label(result?.status)}.`
    case 'open_order':
      return result?.found ? `Abri o pedido ${result.id} de ${result.customer}.` : `Não encontrei esse pedido.`
    case 'cancel_order':
      return `Pedido ${result?.id} cancelado.`
    case 'highlight':
      return `Destaquei na tela para você.`
    default:
      return 'Feito.'
  }
}

const label = (status?: string) =>
  ({ late: 'atrasados', open: 'em aberto', closed: 'fechados', all: 'no total' })[status ?? 'all'] ?? ''

function contentOf(message?: Message): string {
  if (!message || !('content' in message) || !message.content) return ''
  return typeof message.content === 'string'
    ? message.content
    : message.content.map((p: any) => (p.type === 'text' ? p.text : '')).join(' ')
}

function safeParse(content: unknown): any {
  if (typeof content !== 'string') return content
  try {
    return JSON.parse(content)
  } catch {
    return content
  }
}

/** Minimal MCP App: speaks the MCP Apps JSON-RPC protocol over postMessage. */
const SUMMARY_APP = `<!doctype html><html><head><style>
  body { font: 14px system-ui, sans-serif; margin: 0; padding: 12px; color: #1d1b29; }
  .bars { display: grid; gap: 6px; }
  .bar { display: flex; align-items: center; gap: 8px; }
  .bar span:first-child { width: 80px; }
  .fill { height: 14px; background: #6b3fd4; border-radius: 4px; }
  button { margin-top: 10px; border: 0; border-radius: 99px; padding: 6px 12px; background: #6b3fd4; color: white; cursor: pointer; }
  @media (prefers-color-scheme: dark) { body { color: #ecebf3; } }
</style></head><body>
  <strong>Pedidos por status</strong>
  <div class="bars" id="bars">carregando…</div>
  <button id="late">Filtrar atrasados na tela</button>
  <p id="out"></p>
  <script>
    let next = 1; const pending = {};
    const call = (method, params) => new Promise((resolve) => { const id = next++; pending[id] = resolve; parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*') });
    const notify = (method, params) => parent.postMessage({ jsonrpc: '2.0', method, params }, '*');
    window.addEventListener('message', (e) => {
      const m = e.data; if (!m || m.jsonrpc !== '2.0') return;
      if (m.id && pending[m.id]) { pending[m.id](m.result ?? m.error); delete pending[m.id]; return; }
      if (m.method === 'ui/notifications/tool-result') {
        const data = m.params.structuredContent; const max = Math.max(...Object.values(data));
        document.getElementById('bars').innerHTML = Object.entries(data).map(([k, v]) =>
          '<div class="bar"><span>' + k + '</span><div class="fill" style="width:' + (v / max * 160) + 'px"></div><span>' + v + '</span></div>').join('');
        notify('ui/notifications/size-changed', { width: document.body.scrollWidth, height: document.body.scrollHeight + 4 });
      }
    });
    document.getElementById('late').onclick = async () => {
      const result = await call('tools/call', { name: 'filter_orders', arguments: { status: 'late' } });
      document.getElementById('out').textContent = 'Filtrado: ' + (result.structuredContent?.count ?? '?') + ' pedidos';
    };
    call('ui/initialize', { protocolVersion: '2026-01-26', appCapabilities: {}, clientInfo: { name: 'orders-summary', version: '1' } })
      .then(() => notify('ui/notifications/initialized'));
  </script>
</body></html>`
