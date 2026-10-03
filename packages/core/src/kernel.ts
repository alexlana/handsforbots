import { ActionError, ActionRegistry } from './actions.js'
import { Conversation } from './conversation.js'
import { EventBus } from './events.js'
import { createId } from './id.js'
import { API_VERSION, PluginContext, type Plugin } from './plugin.js'
import type { Events, Services, TurnPhase, TurnStatus } from './registry.js'
import { validate } from './standard-schema.js'
import type {
  ActionDefinition,
  AssistantMessage,
  CaptureHandler,
  Match,
  Matcher,
  Message,
  Route,
  Signal,
  SignalInput,
  Stimulus,
  ToolCall,
  ToolMessage,
  TurnRequest,
  UserMessage,
} from './types.js'

export type H4BOptions = {
  plugins?: Plugin<any>[]
  /** Actions registered by the host at start. */
  actions?: ActionDefinition<any, any>[]
  threadId?: string
  /** Minimum confidence for a direct-command match. Default 0.75. */
  matchThreshold?: number
  /** Max assistant ↔ client action round trips per turn. Default 5. */
  maxActionRoundtrips?: number
  onError?: (error: unknown, source: string) => void
}

export type H4BSnapshot = {
  threadId: string
  messages: Message[]
  state: unknown
  context: Signal[]
  busy: boolean
  turn?: TurnStatus
}

type RoundState = {
  route: Route
  lastAssistantId?: string
  pending: ToolCall[]
  resolved: Set<string>
  error?: string
}

export function createH4B(options: H4BOptions = {}): H4B {
  return new H4B(options)
}

export class H4B {
  readonly actions: ActionRegistry
  readonly conversation: Conversation

  private bus: EventBus<Events>
  private services = new Map<keyof Services, { service: unknown; by: string }>()
  private mounted = new Map<Plugin<any>, { ctx: PluginContext; inject: (keyof Services)[] }>()
  private matchers: Matcher[] = []
  private captures: CaptureHandler[] = []
  private contextSignals = new Map<string, Signal>()
  private queue: Signal[] = []
  private running = false
  private controller?: AbortController
  private turn?: TurnStatus
  private snapshotCache?: H4BSnapshot
  private subscribers = new Set<() => void>()
  private started = false
  private stopping = false

  constructor(private options: H4BOptions = {}) {
    const report = options.onError ?? ((error, source) => console.error(`[h4b] ${source}:`, error))
    this.bus = new EventBus<Events>((error, event) => report(error, `listener:${String(event)}`))
    this.bus.on('error', ({ error, source }) => report(error, source))
    this.actions = new ActionRegistry(() => this.get('confirm'))
    this.conversation = new Conversation(
      options.threadId,
      (messages) => {
        this.bus.emit('messages.changed', messages)
        this.invalidate()
      },
      (state) => {
        this.bus.emit('state.changed', state)
        this.invalidate()
      },
    )
  }

  /* ------------------------------------------------------------------------ */
  /* Lifecycle                                                                */
  /* ------------------------------------------------------------------------ */

  async start(): Promise<this> {
    if (this.started) return this
    this.started = true
    for (const action of this.options.actions ?? []) this.actions.register(action)

    let pending = [...(this.options.plugins ?? [])]
    while (pending.length > 0) {
      const ready = pending.filter((p) => this.missing(p).length === 0)
      if (ready.length === 0) {
        const detail = pending
          .map((p) => `${p.definition.name} (needs ${this.missing(p).join(', ')})`)
          .join('; ')
        throw new Error(`[h4b] unresolved plugin dependencies: ${detail}`)
      }
      for (const plugin of ready) await this.mount(plugin)
      pending = pending.filter((p) => !ready.includes(p))
    }

    const storage = this.get('storage')
    if (storage) {
      try {
        const snapshot = await storage.load()
        if (snapshot) this.conversation.restore(snapshot)
      } catch (error) {
        this.emit('error', { error, source: 'storage' })
      }
    }
    return this
  }

  async stop(): Promise<void> {
    this.stopping = true
    this.abort({ clearQueue: true })
    for (const plugin of [...this.mounted.keys()].reverse()) await this.unmount(plugin)
    this.stopping = false
    this.started = false
  }

  /** Mounts a plugin at runtime. Resolves to a disposer. */
  async use(plugin: Plugin<any>): Promise<() => Promise<void>> {
    const missing = this.missing(plugin)
    if (missing.length > 0) {
      throw new Error(`[h4b] plugin "${plugin.definition.name}" needs ${missing.join(', ')}`)
    }
    await this.mount(plugin)
    return () => this.unmount(plugin)
  }

  private missing(plugin: Plugin<any>): (keyof Services)[] {
    return (plugin.definition.inject ?? []).filter((key) => !this.services.has(key))
  }

  private async mount(plugin: Plugin<any>) {
    const { definition } = plugin
    if (this.mounted.has(plugin)) return
    const apiVersion = definition.apiVersion ?? API_VERSION
    if (apiVersion !== API_VERSION) {
      throw new Error(
        `[h4b] plugin "${definition.name}" targets API ${apiVersion}, kernel provides ${API_VERSION}`,
      )
    }
    let config = plugin.config
    if (definition.config) {
      try {
        config = await validate(definition.config, plugin.config ?? {})
      } catch (error) {
        throw new Error(`[h4b] invalid config for plugin "${definition.name}": ${(error as Error).message}`)
      }
    }
    const ctx = new PluginContext(this, definition.name)
    this.mounted.set(plugin, { ctx, inject: definition.inject ?? [] })
    try {
      await definition.apply(ctx, config)
    } catch (error) {
      this.mounted.delete(plugin)
      await ctx.dispose()
      throw new Error(`[h4b] plugin "${definition.name}" failed to mount: ${(error as Error).message}`, {
        cause: error,
      })
    }
    for (const key of definition.provides ?? []) {
      if (this.services.get(key)?.by !== definition.name) {
        console.warn(`[h4b] plugin "${definition.name}" declares "${String(key)}" but did not provide it`)
      }
    }
    this.emit('plugin.mounted', { name: definition.name })
  }

  private async unmount(plugin: Plugin<any>) {
    const entry = this.mounted.get(plugin)
    if (!entry) return
    this.mounted.delete(plugin)
    await entry.ctx.dispose()
    this.emit('plugin.disposed', { name: plugin.definition.name })
  }

  /* ------------------------------------------------------------------------ */
  /* Services and events                                                      */
  /* ------------------------------------------------------------------------ */

  provide<K extends keyof Services>(key: K, service: Services[K], by = 'host'): () => void {
    const current = this.services.get(key)
    if (current) {
      throw new Error(`[h4b] service "${String(key)}" is already provided by "${current.by}"`)
    }
    const entry = { service, by }
    this.services.set(key, entry)
    this.emit('service.provided', { key, by })
    return () => {
      if (this.services.get(key) !== entry) return
      this.services.delete(key)
      this.emit('service.removed', { key, by })
      if (this.stopping) return
      // Plugins that injected this service can't keep running without it.
      for (const [plugin, mounted] of this.mounted) {
        if (mounted.inject.includes(key)) void this.unmount(plugin)
      }
    }
  }

  get<K extends keyof Services>(key: K): Services[K] | undefined {
    return this.services.get(key)?.service as Services[K] | undefined
  }

  on<K extends keyof Events>(event: K, listener: (payload: Events[K]) => void): () => void {
    return this.bus.on(event, listener)
  }

  once<K extends keyof Events>(event: K, listener: (payload: Events[K]) => void): () => void {
    return this.bus.once(event, listener)
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.bus.emit(event, payload)
  }

  /* ------------------------------------------------------------------------ */
  /* Store (for UI bindings)                                                  */
  /* ------------------------------------------------------------------------ */

  subscribe(listener: () => void): () => void {
    this.subscribers.add(listener)
    return () => this.subscribers.delete(listener)
  }

  getSnapshot(): H4BSnapshot {
    this.snapshotCache ??= {
      threadId: this.conversation.threadId,
      messages: this.conversation.messages,
      state: this.conversation.state,
      context: [...this.contextSignals.values()],
      busy: this.running,
      turn: this.turn,
    }
    return this.snapshotCache
  }

  get messages(): Message[] {
    return this.conversation.messages
  }

  get state(): unknown {
    return this.conversation.state
  }

  get busy(): boolean {
    return this.running
  }

  private invalidate() {
    this.snapshotCache = undefined
    for (const listener of this.subscribers) listener()
  }

  /* ------------------------------------------------------------------------ */
  /* Signals                                                                  */
  /* ------------------------------------------------------------------------ */

  signal(input: SignalInput): Signal {
    const signal: Signal = {
      ...input,
      id: input.id ?? createId('sig'),
      kind: input.kind ?? 'trigger',
      timestamp: input.timestamp ?? Date.now(),
    }
    this.emit('signal', signal)
    if (signal.kind === 'context') {
      this.contextSignals.set(signal.key ?? signal.source, signal)
      this.contextChanged()
    } else {
      this.queue.push(signal)
      void this.drain()
    }
    return signal
  }

  /** Shortcut for a text trigger. */
  send(text: string, source = 'host'): Signal {
    return this.signal({ modality: 'text', parts: [{ type: 'text', text }], source })
  }

  removeContext(key: string) {
    if (this.contextSignals.delete(key)) this.contextChanged()
  }

  get context(): Signal[] {
    return [...this.contextSignals.values()]
  }

  private contextChanged() {
    this.emit('context.changed', this.context)
    this.invalidate()
  }

  /* ------------------------------------------------------------------------ */
  /* Router                                                                   */
  /* ------------------------------------------------------------------------ */

  addMatcher(matcher: Matcher): () => void {
    this.matchers = [...this.matchers, matcher].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
    return () => {
      this.matchers = this.matchers.filter((m) => m !== matcher)
    }
  }

  capture(handler: CaptureHandler): () => void {
    this.captures = [...this.captures, handler]
    return () => {
      this.captures = this.captures.filter((h) => h !== handler)
    }
  }

  /** Cancels the running turn (e.g. barge-in). */
  abort(options: { clearQueue?: boolean } = {}) {
    if (options.clearQueue) this.queue = []
    this.controller?.abort()
  }

  /** Starts a new thread and clears stored history. */
  async reset(threadId?: string) {
    this.abort({ clearQueue: true })
    this.conversation.reset(threadId)
    await this.get('storage')?.clear()
  }

  /* ------------------------------------------------------------------------ */
  /* Turns                                                                    */
  /* ------------------------------------------------------------------------ */

  private async drain() {
    if (this.running) return
    this.running = true
    this.invalidate()
    try {
      while (this.queue.length > 0) await this.runTurn(this.queue.shift()!)
    } finally {
      this.running = false
      this.invalidate()
    }
  }

  private setStatus(signal: Signal, turnId: string, phase: TurnPhase, route?: Route, error?: string) {
    this.turn = { turnId, phase, route, signal, error, at: Date.now() }
    this.emit('turn.status', this.turn)
    this.invalidate()
  }

  private async runTurn(signal: Signal) {
    const turnId = createId('turn')
    const controller = new AbortController()
    this.controller = controller
    let route: Route | undefined
    this.setStatus(signal, turnId, 'received')

    try {
      const capture = this.captures[this.captures.length - 1]
      const match = capture ? undefined : await this.findMatch(signal)
      route = capture ? 'capture' : match ? 'direct' : 'transport'
      this.appendUser(signal, route)
      this.setStatus(signal, turnId, 'acting', route)

      if (capture) await capture(signal)
      else if (match) await this.runDirect(turnId, match, controller.signal)
      else await this.runTransport(turnId, controller.signal)

      if (controller.signal.aborted) this.setStatus(signal, turnId, 'aborted', route)
      else this.setStatus(signal, turnId, 'done', route)
    } catch (error) {
      if (controller.signal.aborted) {
        this.setStatus(signal, turnId, 'aborted', route)
      } else {
        const message = (error as Error)?.message ?? String(error)
        this.emit('error', { error, source: `turn:${route ?? 'unknown'}` })
        this.emit('stimulus', { turnId, stimulus: { type: 'error', message } })
        this.setStatus(signal, turnId, 'error', route, message)
      }
    } finally {
      if (this.controller === controller) this.controller = undefined
      await this.persist()
    }
  }

  private async findMatch(signal: Signal): Promise<Match | undefined> {
    const threshold = this.options.matchThreshold ?? 0.75
    for (const matcher of this.matchers) {
      try {
        const match = await matcher.match(signal)
        if (!match || (match.confidence ?? 1) < threshold) continue
        const action = this.actions.get(match.action)
        if (action && (!action.exposeTo || action.exposeTo.includes('user'))) return match
      } catch (error) {
        this.emit('error', { error, source: `matcher:${matcher.name}` })
      }
    }
    return undefined
  }

  private appendUser(signal: Signal, route: Route) {
    this.conversation.append<UserMessage>({
      id: createId('msg'),
      role: 'user',
      parts: signal.parts,
      modality: signal.modality,
      source: signal.source,
      route,
      createdAt: signal.timestamp,
    })
  }

  /** Direct command: run the action without a transport, recorded as a synthetic tool call. */
  private async runDirect(turnId: string, match: Match, abortSignal: AbortSignal) {
    const round: RoundState = { route: 'direct', pending: [], resolved: new Set() }
    const callId = createId('call')
    const args = match.args ?? {}
    this.applyStimulus(turnId, { type: 'action.call', callId, name: match.action, args }, round)

    const outcome = await this.invokeAction(turnId, { id: callId, name: match.action, args }, 'user', abortSignal, round)
    const action = this.actions.get(match.action)
    const reply = outcome.error
      ? outcome.error
      : (match.reply?.(outcome.result) ?? action?.describeResult?.(outcome.result, args))
    if (reply) {
      const messageId = createId('msg')
      this.applyStimulus(turnId, { type: 'message.start', messageId }, round)
      this.applyStimulus(turnId, { type: 'message.delta', messageId, delta: reply }, round)
      this.applyStimulus(turnId, { type: 'message.end', messageId }, round)
    }
    this.closeStreaming(round)
    if (outcome.error) throw new ActionError(outcome.error, 'failed')
  }

  private async runTransport(turnId: string, abortSignal: AbortSignal) {
    const transport = this.get('transport')
    if (!transport) throw new Error('No transport configured')
    const maxRoundtrips = this.options.maxActionRoundtrips ?? 5

    for (let roundIndex = 0; roundIndex <= maxRoundtrips; roundIndex++) {
      const round: RoundState = { route: 'transport', pending: [], resolved: new Set() }
      const request: TurnRequest = {
        threadId: this.conversation.threadId,
        turnId,
        messages: this.conversation.messages,
        context: this.context,
        actions: this.actions.describe('assistant'),
        state: this.conversation.state,
      }
      for await (const stimulus of transport.run(request, abortSignal)) {
        if (abortSignal.aborted) break
        this.applyStimulus(turnId, stimulus, round)
      }
      this.closeStreaming(round)
      if (abortSignal.aborted) return
      if (round.error) throw new Error(round.error)

      const unresolved = round.pending.filter((call) => !round.resolved.has(call.id))
      if (unresolved.length === 0) return
      if (roundIndex === maxRoundtrips) {
        throw new Error(`Stopped after ${maxRoundtrips} action round trips`)
      }
      for (const call of unresolved) {
        if (abortSignal.aborted) return
        await this.invokeAction(turnId, call, 'assistant', abortSignal, round)
      }
    }
  }

  private async invokeAction(
    turnId: string,
    call: ToolCall,
    origin: 'user' | 'assistant',
    abortSignal: AbortSignal,
    round: RoundState,
  ): Promise<{ result?: unknown; error?: string }> {
    let outcome: { result?: unknown; error?: string }
    try {
      const result = await this.actions.invoke(call.name, call.args, { origin, callId: call.id, signal: abortSignal })
      outcome = { result }
    } catch (error) {
      outcome = { error: (error as Error)?.message ?? String(error) }
    }
    this.emit('action.invoked', { name: call.name, origin, callId: call.id, ...outcome })
    this.conversation.append<ToolMessage>({
      id: createId('msg'),
      role: 'tool',
      toolCallId: call.id,
      name: call.name,
      ...outcome,
      route: round.route,
      createdAt: Date.now(),
    })
    round.resolved.add(call.id)
    this.emit('stimulus', {
      turnId,
      stimulus: { type: 'action.result', callId: call.id, name: call.name, result: outcome.error ? { error: outcome.error } : outcome.result },
    })
    return outcome
  }

  private ensureAssistant(round: RoundState, messageId?: string): string {
    const id = messageId ?? round.lastAssistantId ?? createId('msg')
    if (!this.conversation.find(id)) {
      this.conversation.append<AssistantMessage>({
        id,
        role: 'assistant',
        parts: [],
        route: round.route,
        streaming: true,
        createdAt: Date.now(),
      })
    }
    round.lastAssistantId = id
    return id
  }

  private applyStimulus(turnId: string, stimulus: Stimulus, round: RoundState) {
    const conversation = this.conversation
    switch (stimulus.type) {
      case 'message.start':
        this.ensureAssistant(round, stimulus.messageId)
        break
      case 'message.delta':
        conversation.appendText(this.ensureAssistant(round, stimulus.messageId), stimulus.delta)
        break
      case 'message.part': {
        const id = this.ensureAssistant(round, stimulus.messageId)
        conversation.update<AssistantMessage>(id, (m) => ({ ...m, parts: [...m.parts, stimulus.part] }))
        break
      }
      case 'message.end':
        conversation.update<AssistantMessage>(stimulus.messageId, (m) => ({ ...m, streaming: false }))
        break
      case 'action.call': {
        const id = this.ensureAssistant(round, stimulus.messageId)
        const call: ToolCall = { id: stimulus.callId, name: stimulus.name, args: stimulus.args }
        conversation.update<AssistantMessage>(id, (m) => ({ ...m, toolCalls: [...(m.toolCalls ?? []), call] }))
        round.pending.push(call)
        break
      }
      case 'action.result':
        if (!round.resolved.has(stimulus.callId)) {
          round.resolved.add(stimulus.callId)
          conversation.append<ToolMessage>({
            id: createId('msg'),
            role: 'tool',
            toolCallId: stimulus.callId,
            name: stimulus.name ?? round.pending.find((c) => c.id === stimulus.callId)?.name ?? 'unknown',
            result: stimulus.result,
            route: round.route,
            createdAt: Date.now(),
          })
        }
        break
      case 'state.snapshot':
        conversation.setState(stimulus.state)
        break
      case 'state.patch':
        try {
          conversation.patchState(stimulus.patch)
        } catch (error) {
          this.emit('error', { error, source: 'state.patch' })
        }
        break
      case 'error':
        round.error = stimulus.message
        return // the turn error path emits the error stimulus
    }
    this.emit('stimulus', { turnId, stimulus })
  }

  private closeStreaming(round: RoundState) {
    for (const message of this.conversation.messages) {
      if (message.role === 'assistant' && message.streaming && message.route === round.route) {
        this.conversation.update<AssistantMessage>(message.id, (m) => ({ ...m, streaming: false }))
      }
    }
  }

  private async persist() {
    const storage = this.get('storage')
    if (!storage) return
    try {
      await storage.save(this.conversation.snapshot())
    } catch (error) {
      this.emit('error', { error, source: 'storage' })
    }
  }
}
