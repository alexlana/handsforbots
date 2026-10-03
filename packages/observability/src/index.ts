import { definePlugin, type H4B, type Route } from '@handsforbots/core'
import {
  createObservability,
  type CreateObservabilityOptions,
  type Observability,
} from '@handsforbots/semantic-event-observability'

export type ObservabilityOptions = CreateObservabilityOptions & {
  /** Record message text and action arguments. Default false (privacy). */
  includeContent?: boolean
}

declare module '@handsforbots/core' {
  interface Services {
    observability: Observability
  }
}

const ROUTES: Route[] = ['transport', 'direct', 'capture', 'agent', 'push']

/** Turn and phase model of the v2 kernel: one turn per trigger, one phase per route. */
export const H4B_TURN_START_EVENTS = ['turn.started']
export const H4B_TURN_END_EVENTS = ['turn.done', 'turn.error', 'turn.aborted']
export const H4B_PHASES = ROUTES.map((route) => ({
  id: route,
  startEvent: `route.${route}.start`,
  endEvent: `route.${route}.end`,
}))

export const observability = definePlugin<ObservabilityOptions | undefined>({
  name: 'observability',
  provides: ['observability'],
  apply(ctx, options = {}) {
    const { includeContent = false, ...config } = options
    const obs = createObservability({
      environment: 'production',
      exporters: ['memory'],
      turnStartEvents: H4B_TURN_START_EVENTS,
      turnEndEvents: H4B_TURN_END_EVENTS,
      phases: H4B_PHASES,
      ...config,
    })
    ctx.provide('observability', obs)
    void obs.init().catch((error) => ctx.emit('error', { error, source: 'observability' }))
    const trigger = attach(ctx.app, obs, includeContent, ctx.on.bind(ctx))
    ctx.onDispose(() => {
      trigger.dispose()
      obs.endSession('dispose')
      obs.destroy()
    })
  },
})

/** Feeds kernel events into the observability pipeline through a minimal instrumented bus. */
function attach(
  h4b: H4B,
  obs: Observability,
  includeContent: boolean,
  on: H4B['on'],
): { dispose(): void } {
  const bus = { on: () => {}, trigger: (_name: string, _args?: unknown): unknown => undefined }
  obs.instrument(bus, {
    stateProvider: () => ({ busy: h4b.busy, contextSignals: h4b.context.length, messages: h4b.messages.length }),
  })
  const record = (name: string, payload: Record<string, unknown> = {}) => bus.trigger(name, [payload])
  const openTurns = new Map<string, Route | undefined>()
  // Perceived latency: from the user's input to the first thing they can see, per route.
  const timing = new Map<string, { start: number; route?: Route; firstSeen?: boolean }>()
  const offs: (() => void)[] = []
  const VISIBLE = new Set(['message.delta', 'message.part', 'ui.render', 'ui.effect', 'action.call', 'action.result', 'audio'])

  offs.push(
    on('turn.status', (status) => {
      const labels = { turnId: status.turnId, route: status.route ?? 'pending' }
      if (!timing.has(status.turnId)) timing.set(status.turnId, { start: status.signal?.timestamp ?? status.at })
      if (status.route) timing.get(status.turnId)!.route = status.route
      if (!openTurns.has(status.turnId)) {
        openTurns.set(status.turnId, undefined)
        record('turn.started', { ...labels, modality: status.signal?.modality, source: status.signal?.source })
      }
      if (status.phase === 'acting' && status.route && !openTurns.get(status.turnId)) {
        openTurns.set(status.turnId, status.route)
        record(`route.${status.route}.start`, labels)
      }
      if (status.phase === 'done' || status.phase === 'error' || status.phase === 'aborted') {
        const route = openTurns.get(status.turnId)
        if (route) record(`route.${route}.end`, labels)
        openTurns.delete(status.turnId)
        record(`turn.${status.phase}`, { ...labels, ...(status.error ? { error: status.error } : {}) })
        const t = timing.get(status.turnId)
        timing.delete(status.turnId)
        if (t) obs.recordMetric('h4b_turn_duration_ms', status.at - t.start, { route: status.route ?? 'none', phase: status.phase })
      }
    }),
    on('signal', (signal) =>
      record(`signal.${signal.modality}`, {
        kind: signal.kind,
        source: signal.source,
        ...(includeContent ? { parts: signal.parts.map((p) => (p.type === 'text' ? p.text : p.type)) } : {}),
      }),
    ),
    on('action.invoked', (event) =>
      record(event.error ? 'action.failed' : 'action.invoked', {
        action: event.name,
        origin: event.origin,
        ...(event.error ? { error: event.error } : {}),
      }),
    ),
    on('stimulus', ({ turnId, stimulus }) => {
      const t = timing.get(turnId)
      if (t && !t.firstSeen && VISIBLE.has(stimulus.type)) {
        t.firstSeen = true
        const ms = Date.now() - t.start
        obs.recordMetric('h4b_first_response_ms', ms, { route: t.route ?? 'none' })
        record('turn.first_response', { turnId, route: t.route ?? 'none', ms })
      }
      // Token deltas are too chatty; everything else is a meaningful event.
      if (stimulus.type === 'message.delta' || stimulus.type === 'message.start') return
      record(`stimulus.${stimulus.type}`, {
        turnId,
        ...('name' in stimulus && typeof stimulus.name === 'string' ? { name: stimulus.name } : {}),
        ...(stimulus.type === 'error' ? { error: stimulus.message } : {}),
      })
    }),
    on('error', ({ error, source }) => record('kernel.error', { source, error: (error as Error)?.message ?? String(error) })),
  )
  return { dispose: () => offs.forEach((off) => off()) }
}
