/**
 * Deterministic AG-UI agent for the example. It speaks the real protocol
 * (SSE via @ag-ui/encoder), so it can be swapped for any AG-UI server
 * (CopilotKit runtime, LangGraph, Mastra, PydanticAI…) by changing the URL.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { EventType, type BaseEvent, type Message, type RunAgentInput } from '@ag-ui/core'
import { EventEncoder } from '@ag-ui/encoder'

type Step = { tool: string; args: Record<string, unknown> } | { text: string }

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
  if ('tool' in step) {
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
