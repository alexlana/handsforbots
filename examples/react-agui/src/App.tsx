import { textOf, type Message, type TurnStatus } from '@handsforbots/core'
import {
  useAction,
  useBusy,
  useContextSignal,
  useH4B,
  useMessages,
  useStimulus,
  useStore,
  useTurn,
} from '@handsforbots/react'
import { mountMcpApp, type McpAppProps } from '@handsforbots/mcp-apps'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ORDERS, STATUS_LABEL, type Order, type OrderStatus } from './orders'

/** The in-app assistant, direct commands and browser agents (WebMCP) share the same actions. */
const EVERYONE = ['assistant', 'user', 'agent'] as const

type Filter = OrderStatus | 'all'
type Target = 'export' | 'filter' | 'table'

export function App() {
  return (
    <div className="layout">
      <header className="topbar">
        <strong>[•_•] Hands for Bots v2</strong>
        <span>React + AG-UI · exemplo</span>
        <WebMCPBadge />
      </header>
      <OrdersPanel />
      <AssistantPanel />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* The GUI: the assistant works here through registered actions               */
/* -------------------------------------------------------------------------- */

function OrdersPanel() {
  const [orders, setOrders] = useState(ORDERS)
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string>()
  const [pulse, setPulse] = useState<Target>()
  const visible = orders.filter((o) => filter === 'all' || o.status === filter)

  const highlight = (target: Target) => {
    setPulse(undefined)
    requestAnimationFrame(() => setPulse(target))
    setTimeout(() => setPulse((p) => (p === target ? undefined : p)), 2400)
  }

  useAction({
    name: 'filter_orders',
    description: 'Filtra a lista de pedidos por status',
    parameters: {
      type: 'object',
      properties: { status: { type: 'string', enum: ['all', 'open', 'late', 'closed', 'cancelled'] } },
      required: ['status'],
    },
    handler: ({ status }: { status: Filter }) => {
      if (!(status in STATUS_LABEL)) throw new Error(`Status desconhecido: ${status}`)
      setFilter(status)
      highlight('table')
      return { status, count: orders.filter((o) => status === 'all' || o.status === status).length }
    },
    describeResult: (r) => `${r.count} pedido(s) — ${STATUS_LABEL[r.status].toLowerCase()}.`,
    exposeTo: [...EVERYONE],
  })

  useAction({
    name: 'open_order',
    description: 'Abre os detalhes de um pedido pelo número',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: ({ id }: { id: string }) => {
      const order = orders.find((o) => o.id === id)
      if (!order) return { found: false, id }
      setFilter('all')
      setSelected(id)
      return { found: true, id, customer: order.customer }
    },
    describeResult: (r) => (r.found ? `Pedido ${r.id} aberto.` : `Pedido ${r.id} não encontrado.`),
    exposeTo: [...EVERYONE],
  })

  useAction({
    name: 'cancel_order',
    description: 'Cancela um pedido (irreversível)',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    destructive: true, // confirmation for every origin
    exposeTo: [...EVERYONE],
    handler: ({ id }: { id: string }) => {
      if (!orders.some((o) => o.id === id)) throw new Error(`Pedido ${id} não existe`)
      setOrders((list) => list.map((o) => (o.id === id ? { ...o, status: 'cancelled' } : o)))
      return { id }
    },
  })

  useAction({
    name: 'highlight',
    description: 'Destaca uma área da tela para orientar o usuário',
    parameters: { type: 'object', properties: { target: { type: 'string', enum: ['export', 'filter', 'table'] } }, required: ['target'] },
    handler: ({ target }: { target: Target }) => {
      highlight(target)
      return { ok: true }
    },
    readOnly: true,
    exposeTo: [...EVERYONE],
  })

  // Backends can also drive the GUI with ui.effect stimuli (AG-UI CUSTOM "h4b.ui.effect").
  useStimulus(({ stimulus }) => {
    if (stimulus.type === 'ui.effect' && stimulus.name === 'highlight') highlight(stimulus.value as Target)
  })

  // What the assistant "sees" on every turn.
  useContextSignal('orders.view', { filter, selected, visible: visible.map((o) => o.id) })

  const selectedOrder = orders.find((o) => o.id === selected)

  return (
    <main className="orders">
      <div className="toolbar">
        <label className={pulse === 'filter' ? 'pulse' : ''}>
          Status{' '}
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className={pulse === 'export' ? 'pulse' : ''} onClick={() => alert('Exportado (exemplo).')}>
          Exportar planilha
        </button>
      </div>
      <table className={pulse === 'table' ? 'pulse' : ''}>
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Cliente</th>
            <th>Total</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((order) => (
            <OrderRow key={order.id} order={order} selected={order.id === selected} onSelect={() => setSelected(order.id)} />
          ))}
        </tbody>
      </table>
      {selectedOrder && (
        <aside className="details">
          <h3>Pedido {selectedOrder.id}</h3>
          <p>
            {selectedOrder.customer} · R$ {selectedOrder.total.toFixed(2)} · {STATUS_LABEL[selectedOrder.status]}
          </p>
        </aside>
      )}
    </main>
  )
}

function OrderRow({ order, selected, onSelect }: { order: Order; selected: boolean; onSelect: () => void }) {
  return (
    <tr className={selected ? 'selected' : ''} onClick={onSelect}>
      <td>{order.id}</td>
      <td>{order.customer}</td>
      <td>R$ {order.total.toFixed(2)}</td>
      <td>
        <span className={`badge ${order.status}`}>{STATUS_LABEL[order.status]}</span>
      </td>
    </tr>
  )
}

/* -------------------------------------------------------------------------- */
/* Conversation surface built with host components                            */
/* -------------------------------------------------------------------------- */

function AssistantPanel() {
  const h4b = useH4B()
  const messages = useMessages()
  const busy = useBusy()
  const status = useSettledStatus(useTurn())
  const [draft, setDraft] = useState('')
  const menu = h4b.get('menu')
  const suggestions = useMemo(() => (draft ? (menu?.suggest(draft, 3) ?? []) : []), [draft, menu])
  const quick = useMemo(() => menu?.list().filter((c) => !c.patterns) ?? [], [menu])
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [messages])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!draft.trim()) return
    h4b.send(draft.trim(), 'keyboard')
    setDraft('')
  }

  return (
    <section className="assistant" aria-label="Assistente">
      <div className="thread" aria-live="polite">
        {messages.length === 0 && (
          <p className="hint">
            Converse ou use comandos diretos (<code>/atrasados</code>, “abrir pedido 1042”). Comandos rodam na hora, sem
            LLM, e entram no histórico.
          </p>
        )}
        {messages.map((m) => (
          <MessageView key={m.id} message={m} />
        ))}
        <div ref={end} />
      </div>
      <div className={`status ${status?.phase ?? 'idle'}`}>{statusLabel(status)}</div>
      <div className="chips">
        {quick.map((c) => (
          <button key={c.label} onClick={() => h4b.signal(menu!.commandSignal(c.action, c.args, c.label))}>
            ⚡ {c.label}
          </button>
        ))}
      </div>
      <VoiceControls />
      <form onSubmit={submit} className="composer">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={busy ? 'Aguarde…' : 'Pergunte ou comande…'}
          aria-label="Mensagem"
          list="menu-suggestions"
        />
        <datalist id="menu-suggestions">
          {suggestions.map((s) => (
            <option key={s.label} value={s.label} />
          ))}
        </datalist>
        <button type="submit">Enviar</button>
      </form>
    </section>
  )
}

const ROUTE_LABEL: Record<string, string> = {
  direct: '⚡ ação direta',
  transport: '🤖 assistente executou',
  agent: '🌐 agente externo executou',
}

function WebMCPBadge() {
  const state = useStore(useH4B().get('webmcp'))
  if (!state) return null
  return (
    <span className="webmcp" title="Ações expostas a agentes do navegador via WebMCP">
      WebMCP: {state.supported ? `${state.tools.length} ferramentas` : 'indisponível neste navegador'}
    </span>
  )
}

/** Microphone and speech: push-to-talk (hold), hands-free (toggle), output preference. */
function VoiceControls() {
  const voice = useH4B().get('voice')
  const state = useStore(voice)
  if (!voice || !state) return null
  if (!state.supported.stt && !state.supported.tts) {
    return <div className="voice muted">Voz indisponível neste navegador — use o teclado.</div>
  }
  const pushToTalk = state.mode === 'push-to-talk'
  const micProps = pushToTalk
    ? {
        onPointerDown: () => void voice.listen(),
        onPointerUp: () => voice.stop(),
        onPointerLeave: () => state.listening && voice.stop(),
      }
    : { onClick: () => void voice.toggle() }

  return (
    <div className="voice">
      {state.supported.stt && (
        <button
          type="button"
          className={`mic ${state.listening ? 'on' : ''}`}
          aria-pressed={state.listening}
          title={pushToTalk ? 'Segure para falar (ou Alt+M)' : 'Ligar/desligar microfone (ou Alt+M)'}
          {...micProps}
        >
          {state.listening ? '🎙️ ouvindo' : pushToTalk ? '🎤 segure para falar' : '🎤 mãos-livres'}
        </button>
      )}
      <select
        aria-label="Modo de voz"
        value={state.mode}
        onChange={(e) => voice.setMode(e.target.value as typeof state.mode)}
      >
        <option value="push-to-talk">Apertar para falar</option>
        <option value="hands-free">Mãos-livres</option>
      </select>
      <select
        aria-label="Saída"
        value={state.output}
        onChange={(e) => voice.setOutput(e.target.value as typeof state.output)}
      >
        <option value="auto">Responder como perguntei</option>
        <option value="voice">Sempre falar</option>
        <option value="text">Só texto</option>
      </select>
      {state.speaking && (
        <button type="button" onClick={() => voice.cancelSpeech()}>
          🔊 parar fala (Esc)
        </button>
      )}
      {state.partial && <div className="partial">“{state.partial}”</div>}
      {state.error && state.error.code !== 'aborted' && <div className="voice-error">Voz: {state.error.message}</div>}
    </div>
  )
}

function MessageView({ message }: { message: Message }) {
  if (message.role === 'tool') {
    return (
      <div className={`action-card ${message.error ? 'failed' : ''}`}>
        {ROUTE_LABEL[message.route ?? 'transport'] ?? '🤖 assistente executou'} <code>{message.name}</code>
        {message.error ? ` — ${message.error}` : ''}
      </div>
    )
  }
  const text = textOf(message)
  const apps = message.parts.flatMap((p) =>
    p.type === 'data' && p.name === 'ui' && (p.value as any)?.component === 'mcp-app' ? [(p.value as any).props as McpAppProps] : [],
  )
  if (!text && !apps.length) return null
  const spoken = message.role === 'user' && message.modality === 'transcript'
  return (
    <div className={`bubble ${message.role}${apps.length ? ' wide' : ''}`}>
      {spoken ? `🎤 ${text}` : text}
      {apps.map((props, i) => (
        <McpApp key={i} {...props} />
      ))}
    </div>
  )
}

/** MCP App (ui:// resource) in a sandboxed iframe; it may call filter_orders. */
function McpApp(props: McpAppProps) {
  const h4b = useH4B()
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const iframe = mountMcpApp(h4b, props, { allowTools: ['filter_orders'] })
    host.current?.append(iframe)
    return () => iframe.remove()
  }, [h4b, props.html])
  return <div className="mcp-app" ref={host} />
}

/**
 * Same visual grammar for direct and LLM routes: received → acting → done.
 * States stay visible for a minimum time so instant commands don't flicker.
 */
function useSettledStatus(turn: TurnStatus | undefined, minimum = 350) {
  const [shown, setShown] = useState(turn)
  const since = useRef(Date.now())
  useEffect(() => {
    const wait = Math.max(0, minimum - (Date.now() - since.current))
    const timer = setTimeout(() => {
      since.current = Date.now()
      setShown(turn)
    }, wait)
    return () => clearTimeout(timer)
  }, [turn, minimum])
  return shown
}

function statusLabel(turn?: TurnStatus) {
  if (!turn) return 'Pronto para ajudar'
  const route = turn.route === 'direct' ? ' ⚡' : ''
  switch (turn.phase) {
    case 'received':
      return 'Recebido…'
    case 'acting':
      return `Agindo${route}…`
    case 'done':
      return `Pronto${route}`
    case 'aborted':
      return 'Cancelado'
    case 'error':
      return `Erro: ${turn.error}`
  }
}
