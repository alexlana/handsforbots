import { ActionError, ActionRegistry } from './actions.js'
import { Conversation } from './conversation.js'
import { EventBus } from './events.js'
import { createId } from './id.js'
import { API_VERSION, PluginContext, type Plugin } from './plugin.js'
import type {
  ActionInvocation,
  Events,
  Hooks,
  Interceptor,
  Services,
  TurnPhase,
  TurnResult,
  TurnStatus,
} from './registry.js'
import { validate } from './standard-schema.js'
import type {
  ActionDefinition,
  AssistantMessage,
  Origin,
  CaptureHandler,
  CaptureOptions,
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
  /** Actions registered by the host. */
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

/** Work processed one at a time, in arrival order. */
type ActionOutcome = { result?: unknown; error?: string }

type Job =
  | { kind: 'signal'; signal: Signal }
  | { kind: 'push'; stimuli: Iterable<Stimulus> | AsyncIterable<Stimulus>; done: () => void }
  | { kind: 'action'; name: string; args: unknown; origin: Origin; done: (outcome: ActionOutcome) => void }

const FINAL_PHASES: TurnPhase[] = ['done', 'error', 'aborted']

export function createH4B(options: H4BOptions = {}): H4B {
  return new H4B(options)
}

export class H4B {
  readonly actions: ActionRegistry
  readonly conversation: Conversation

  private bus: EventBus<Events>
  private services = new Map<keyof Services, { service: unknown; by: string }>()
  private mounted = new Map<Plugin<any>, { ctx: PluginContext; inject: (keyof Services)[] }>()
  private interceptors = new Map<keyof Hooks, { fn: Interceptor<any>; priority: number }[]>()
  private matchers: Matcher[] = []
  private captures: { handler: CaptureHandler; accepts?: CaptureOptions['accepts'] }[] = []
  private contextSignals = new Map<string, Signal>()
  private queue: Job[] = []
  private running = false
  private controller?: AbortController
  private turn?: TurnStatus
  private snapshotCache?: H4BSnapshot
  private subscribers = new Set<() => void>()
  private disconnectTransport?: () => void
  private started = false
  private stopping = false

  constructor(private options: H4BOptions = {}) {
    const report = options.onError ?? ((error, source) => console.error(`[h4b] ${source}:`, error))
    this.bus = new EventBus<Events>((error, event) => report(error, `listener:${String(event)}`))
    this.bus.on('error', ({ error, source }) => report(error, source))
    this.actions = new ActionRegistry(
      () => this.get('confirm'),
      (invocation) => this.runHooks('action.before', invocation),
    )
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
    for (const action of options.actions ?? []) this.actions.register(action)
  }

  /* ------------------------------------------------------------------------ */
  /* Lifecycle                                                                */
  /* ------------------------------------------------------------------------ */

  async start(): Promise<this> {
    if (this.started) return this
    this.started = true

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
  /* Services, events and interceptors                                        */
  /* ------------------------------------------------------------------------ */

  provide<K extends keyof Services>(key: K, service: Services[K], by = 'host'): () => void {
    const current = this.services.get(key)
    if (current) {
      throw new Error(`[h4b] service "${String(key)}" is already provided by "${current.by}"`)
    }
    const entry = { service, by }
    this.services.set(key, entry)
    if (key === 'transport') this.connectTransport(service as Services['transport'])
    this.emit('service.provided', { key, by })
    return () => {
      if (this.services.get(key) !== entry) return
      this.services.delete(key)
      if (key === 'transport') this.disconnectTransport?.()
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

  /** Notification listener: never blocks the flow; may be sync or async. */
  on<K extends keyof Events>(event: K, listener: (payload: Events[K]) => unknown): () => void {
    return this.bus.on(event, listener)
  }

  once<K extends keyof Events>(event: K, listener: (payload: Events[K]) => unknown): () => void {
    return this.bus.once(event, listener)
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.bus.emit(event, payload)
  }

  /** Resolves with the next event payload that satisfies `predicate`. */
  when<K extends keyof Events>(
    event: K,
    predicate: (payload: Events[K]) => boolean = () => true,
    options: { signal?: AbortSignal; timeout?: number } = {},
  ): Promise<Events[K]> {
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const cleanup = () => {
        off()
        if (timer) clearTimeout(timer)
        options.signal?.removeEventListener('abort', onAbort)
      }
      const off = this.bus.on(event, (payload) => {
        if (!predicate(payload)) return
        cleanup()
        resolve(payload)
      })
      const onAbort = () => {
        cleanup()
        reject(options.signal?.reason ?? new Error('Aborted'))
      }
      options.signal?.addEventListener('abort', onAbort, { once: true })
      if (options.timeout !== undefined) {
        timer = setTimeout(() => {
          cleanup()
          reject(new Error(`Timed out waiting for "${String(event)}"`))
        }, options.timeout)
      }
    })
  }

  /**
   * Registers an interceptor. Interceptors are awaited in priority order (lower
   * first) and may be sync or async.
   */
  intercept<K extends keyof Hooks>(hook: K, interceptor: Interceptor<Hooks[K]>, priority = 0): () => void {
    const entry = { fn: interceptor, priority }
    const list = [...(this.interceptors.get(hook) ?? []), entry].sort((a, b) => a.priority - b.priority)
    this.interceptors.set(hook, list)
    return () => {
      this.interceptors.set(hook, (this.interceptors.get(hook) ?? []).filter((e) => e !== entry))
    }
  }

  private hasInterceptors(hook: keyof Hooks): boolean {
    return (this.interceptors.get(hook)?.length ?? 0) > 0
  }

  private async runHooks<K extends keyof Hooks>(hook: K, value: Hooks[K]): Promise<Hooks[K] | null> {
    let current = value
    for (const { fn } of this.interceptors.get(hook) ?? []) {
      const next = await fn(current)
      if (next === null) return null
      if (next !== undefined) current = next as Hooks[K]
    }
    return current
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

  /**
   * Fire-and-forget entry point for any input. Triggers are queued and run as
   * turns; context signals are kept for the next turns. Use `ask` to await the
   * outcome.
   */
  signal(input: SignalInput): Signal {
    const signal: Signal = {
      ...input,
      id: input.id ?? createId('sig'),
      kind: input.kind ?? 'trigger',
      timestamp: input.timestamp ?? Date.now(),
    }
    this.emit('signal', signal)
    if (signal.kind === 'context') {
      if (this.hasInterceptors('signal.before')) {
        void this.runHooks('signal.before', signal).then(
          (accepted) => accepted && this.storeContext(accepted),
          (error) => this.emit('error', { error, source: 'hook:signal.before' }),
        )
      } else {
        this.storeContext(signal)
      }
    } else {
      this.enqueue({ kind: 'signal', signal })
    }
    return signal
  }

  /** Shortcut for a text trigger. */
  send(text: string, source = 'host'): Signal {
    return this.signal({ modality: 'text', parts: [{ type: 'text', text }], source })
  }

  /** Sends a trigger and resolves when its turn finishes. */
  async ask(input: string | SignalInput, options: { signal?: AbortSignal; timeout?: number } = {}): Promise<TurnResult> {
    const signalInput: SignalInput =
      typeof input === 'string' ? { modality: 'text', parts: [{ type: 'text', text: input }], source: 'host' } : input
    const id = signalInput.id ?? createId('sig')
    const finished = this.when(
      'turn.status',
      (status) => status.signal?.id === id && FINAL_PHASES.includes(status.phase),
      options,
    )
    this.signal({ ...signalInput, id, kind: 'trigger' })
    const status = await finished
    const start = this.messages.findIndex((m) => m.role === 'user' && m.signalId === id)
    return { status, messages: start >= 0 ? this.messages.slice(start) : [] }
  }

  /**
   * Delivers stimuli that arrive outside a request/response turn (server push,
   * long-running jobs, proactive messages). They are queued with the turns, so
   * ordering is preserved. Resolves when they have been applied.
   */
  push(stimuli: Iterable<Stimulus> | AsyncIterable<Stimulus>): Promise<void> {
    return new Promise((resolve) => this.enqueue({ kind: 'push', stimuli, done: resolve }))
  }

  /**
   * Runs an action through the queue and records it in history, like a turn
   * without a transport: for external agents (route `agent`) or host UI that
   * wants a visible trace (route `direct`). Never throws: resolves the outcome.
   */
  runAction(name: string, args: unknown = {}, options: { origin?: Origin } = {}): Promise<ActionOutcome> {
    return new Promise((done) => this.enqueue({ kind: 'action', name, args, origin: options.origin ?? 'user', done }))
  }

  removeContext(key: string) {
    if (this.contextSignals.delete(key)) this.contextChanged()
  }

  get context(): Signal[] {
    return [...this.contextSignals.values()]
  }

  private storeContext(signal: Signal) {
    this.contextSignals.set(signal.key ?? signal.source, signal)
    this.contextChanged()
  }

  private contextChanged() {
    this.emit('context.changed', this.context)
    this.invalidate()
  }

  private connectTransport(transport: Services['transport']) {
    if (!transport.connect) return
    this.disconnectTransport = transport.connect((stimuli) => void this.push(stimuli))
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

  /**
   * Routes trigger signals to `handler` (bypassing menu and transport) until
   * released. The most recent capture wins; `accepts` lets it take only some.
   */
  capture(handler: CaptureHandler, options: CaptureOptions = {}): () => void {
    const entry = { handler, accepts: options.accepts }
    this.captures = [...this.captures, entry]
    return () => {
      this.captures = this.captures.filter((c) => c !== entry)
    }
  }

  private async findCapture(signal: Signal): Promise<CaptureHandler | undefined> {
    for (const entry of [...this.captures].reverse()) {
      try {
        if (!entry.accepts || (await entry.accepts(signal))) return entry.handler
      } catch (error) {
        this.emit('error', { error, source: 'capture.accepts' })
      }
    }
    return undefined
  }

  /** Cancels the running turn (e.g. barge-in). */
  abort(options: { clearQueue?: boolean } = {}) {
    if (options.clearQueue) {
      for (const job of this.queue) if (job.kind === 'push') job.done()
      this.queue = []
    }
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

  private enqueue(job: Job) {
    this.queue.push(job)
    void this.drain()
  }

  private async drain() {
    if (this.running) return
    this.running = true
    this.invalidate()
    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift()!
        if (job.kind === 'signal') await this.runTurn(job.signal)
        else if (job.kind === 'push') await this.runPush(job)
        else await this.runActionJob(job)
      }
    } finally {
      this.running = false
      this.invalidate()
    }
  }

  private setStatus(turnId: string, phase: TurnPhase, route?: Route, signal?: Signal, error?: string) {
    this.turn = { turnId, phase, route, signal, error, at: Date.now() }
    this.emit('turn.status', this.turn)
    this.invalidate()
  }

  private async runTurn(incoming: Signal) {
    const turnId = createId('turn')
    const controller = new AbortController()
    this.controller = controller
    let route: Route | undefined
    let signal = incoming
    this.setStatus(turnId, 'received', undefined, signal)

    try {
      const accepted = await this.runHooks('signal.before', signal)
      if (!accepted) {
        this.setStatus(turnId, 'aborted', undefined, signal, 'Dropped by signal.before interceptor')
        return
      }
      signal = { ...accepted, id: incoming.id }

      const capture = await this.findCapture(signal)
      const match = capture ? undefined : await this.findMatch(signal)
      route = capture ? 'capture' : match ? 'direct' : 'transport'
      this.appendUser(signal, route)
      this.setStatus(turnId, 'acting', route, signal)

      if (capture) await capture(signal)
      else if (match) await this.runDirect(turnId, match, controller.signal)
      else await this.runTransport(turnId, controller.signal)

      this.setStatus(turnId, controller.signal.aborted ? 'aborted' : 'done', route, signal)
    } catch (error) {
      if (controller.signal.aborted) {
        this.setStatus(turnId, 'aborted', route, signal)
      } else {
        const message = (error as Error)?.message ?? String(error)
        this.emit('error', { error, source: `turn:${route ?? 'unknown'}` })
        this.emit('stimulus', { turnId, stimulus: { type: 'error', message } })
        this.setStatus(turnId, 'error', route, signal, message)
      }
    } finally {
      if (this.controller === controller) this.controller = undefined
      await this.persist()
    }
  }

  private async runPush(job: Extract<Job, { kind: 'push' }>) {
    const turnId = createId('turn')
    const controller = new AbortController()
    this.controller = controller
    const round: RoundState = { route: 'push', pending: [], resolved: new Set() }
    this.setStatus(turnId, 'acting', 'push')
    try {
      for await (const stimulus of job.stimuli) {
        if (controller.signal.aborted) break
        await this.deliver(turnId, stimulus, round)
      }
      this.closeStreaming(round)
      // Pushed action calls run like assistant calls; results are recorded but no turn continues.
      for (const call of round.pending.filter((c) => !round.resolved.has(c.id))) {
        await this.invokeAction(turnId, call, 'assistant', controller.signal, round)
      }
      this.setStatus(turnId, controller.signal.aborted ? 'aborted' : 'done', 'push')
    } catch (error) {
      const message = (error as Error)?.message ?? String(error)
      this.emit('error', { error, source: 'turn:push' })
      this.setStatus(turnId, 'error', 'push', undefined, message)
    } finally {
      if (this.controller === controller) this.controller = undefined
      await this.persist()
      job.done()
    }
  }

  private async runActionJob(job: Extract<Job, { kind: 'action' }>) {
    const turnId = createId('turn')
    const controller = new AbortController()
    this.controller = controller
    const route: Route = job.origin === 'agent' ? 'agent' : 'direct'
    const round: RoundState = { route, pending: [], resolved: new Set() }
    const call: ToolCall = { id: createId('call'), name: job.name, args: job.args }
    let outcome: ActionOutcome = {}
    this.setStatus(turnId, 'acting', route)
    try {
      await this.deliver(turnId, { type: 'action.call', callId: call.id, name: call.name, args: call.args }, round)
      this.closeStreaming(round)
      outcome = await this.invokeAction(turnId, call, job.origin, controller.signal, round)
      this.setStatus(turnId, outcome.error ? 'error' : 'done', route, undefined, outcome.error)
    } catch (error) {
      outcome = { error: (error as Error)?.message ?? String(error) }
      this.setStatus(turnId, 'error', route, undefined, outcome.error)
    } finally {
      if (this.controller === controller) this.controller = undefined
      await this.persist()
      job.done(outcome)
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
      signalId: signal.id,
      route,
      createdAt: signal.timestamp,
    })
  }

  /** Direct command: run the action without a transport, recorded as a synthetic tool call. */
  private async runDirect(turnId: string, match: Match, abortSignal: AbortSignal) {
    const round: RoundState = { route: 'direct', pending: [], resolved: new Set() }
    const callId = createId('call')
    const args = match.args ?? {}
    await this.deliver(turnId, { type: 'action.call', callId, name: match.action, args }, round)

    const outcome = await this.invokeAction(turnId, { id: callId, name: match.action, args }, 'user', abortSignal, round)
    const action = this.actions.get(match.action)
    const reply = outcome.error
      ? outcome.error
      : (match.reply?.(outcome.result) ?? action?.describeResult?.(outcome.result, args))
    if (reply) {
      const messageId = createId('msg')
      await this.deliver(turnId, { type: 'message.start', messageId }, round)
      await this.deliver(turnId, { type: 'message.delta', messageId, delta: reply }, round)
      await this.deliver(turnId, { type: 'message.end', messageId }, round)
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
      const request = await this.runHooks('request.before', {
        threadId: this.conversation.threadId,
        turnId,
        messages: this.conversation.messages,
        context: this.context,
        actions: this.actions.describe('assistant'),
        state: this.conversation.state,
      } satisfies TurnRequest)
      if (!request) throw new Error('Request cancelled by request.before interceptor')

      for await (const stimulus of transport.run(request, abortSignal)) {
        if (abortSignal.aborted) break
        await this.deliver(turnId, stimulus, round)
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
    origin: Origin,
    abortSignal: AbortSignal,
    round: RoundState,
  ): Promise<ActionOutcome> {
    let outcome: ActionOutcome
    try {
      const result = await this.actions.invoke(call.name, call.args, {
        origin,
        callId: call.id,
        signal: abortSignal,
        render: (component, props) => this.applyStimulus(turnId, { type: 'ui.render', component, props }, round),
      })
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
      stimulus: {
        type: 'action.result',
        callId: call.id,
        name: call.name,
        result: outcome.error ? { error: outcome.error } : outcome.result,
      },
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

  /** Runs `stimulus.before` interceptors, then applies the stimulus. */
  private async deliver(turnId: string, stimulus: Stimulus, round: RoundState) {
    const accepted = this.hasInterceptors('stimulus.before') ? await this.runHooks('stimulus.before', stimulus) : stimulus
    if (accepted) this.applyStimulus(turnId, accepted, round)
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
      case 'ui.render':
        if (!stimulus.slot || stimulus.slot === 'message') {
          const id = this.ensureAssistant(round, stimulus.messageId)
          const part = { type: 'data' as const, name: 'ui', value: { component: stimulus.component, props: stimulus.props } }
          conversation.update<AssistantMessage>(id, (m) => ({ ...m, parts: [...m.parts, part] }))
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

