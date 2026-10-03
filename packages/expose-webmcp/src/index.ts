import { definePlugin, toJsonSchema, type ActionDefinition } from '@handsforbots/core'

/** The subset of the WebMCP API (W3C CG draft, 2026) this plugin uses. */
export type ModelContextTool = {
  name: string
  description: string
  inputSchema?: Record<string, unknown>
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }
  execute(input: Record<string, unknown>, context?: { signal?: AbortSignal }): Promise<string>
}

export type ModelContext = {
  registerTool(tool: ModelContextTool, options?: { signal?: AbortSignal }): unknown
}

export type WebMCPOptions = {
  /**
   * Which actions agents can see. 'explicit' (default): only actions whose
   * `exposeTo` includes 'agent'. 'all': every action not hidden from agents.
   */
  include?: 'explicit' | 'all'
  /** Prefix tool names, e.g. 'shop.' (avoids clashes with other scripts). */
  prefix?: string
  /** Override API discovery (tests, polyfills). */
  modelContext?: ModelContext
}

export type WebMCPState = { supported: boolean; tools: string[] }

export type WebMCPService = {
  getState(): WebMCPState
  subscribe(listener: () => void): () => void
}

declare module '@handsforbots/core' {
  interface Services {
    webmcp: WebMCPService
  }
}

/** document.modelContext (current draft) or navigator.modelContext (deprecated location). */
export function findModelContext(): ModelContext | undefined {
  const fromDocument = typeof document !== 'undefined' ? (document as any).modelContext : undefined
  const fromNavigator = typeof navigator !== 'undefined' ? (navigator as any).modelContext : undefined
  const mc = fromDocument ?? fromNavigator
  return mc && typeof mc.registerTool === 'function' ? mc : undefined
}

export const webmcp = definePlugin<WebMCPOptions | undefined>({
  name: 'expose-webmcp',
  provides: ['webmcp'],
  apply(ctx, options = {}) {
    const modelContext = options.modelContext ?? findModelContext()
    const registered = new Map<string, { action: ActionDefinition; controller: AbortController }>()
    const listeners = new Set<() => void>()
    let state: WebMCPState = { supported: !!modelContext, tools: [] }
    const changed = () => {
      state = { ...state, tools: [...registered.keys()] }
      for (const listener of listeners) listener()
    }

    ctx.provide('webmcp', {
      getState: () => state,
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    })
    if (!modelContext) return

    const visible = (action: ActionDefinition) =>
      options.include === 'all' ? !action.exposeTo || action.exposeTo.includes('agent') : !!action.exposeTo?.includes('agent')

    const register = (action: ActionDefinition) => {
      const name = `${options.prefix ?? ''}${action.name}`
      const controller = new AbortController()
      registered.set(name, { action, controller })
      void Promise.resolve(
        modelContext.registerTool(
          {
            name,
            description: action.description,
            inputSchema: action.parameters ?? toJsonSchema(action.input) ?? { type: 'object', properties: {} },
            annotations: { readOnlyHint: action.readOnly ?? false },
            // Runs through the kernel queue: validation, `action.before`, confirmation
            // for the `agent` origin, and a visible trace in history.
            execute: async (input) => {
              const outcome = await ctx.app.runAction(action.name, input ?? {}, { origin: 'agent' })
              if (outcome.error) throw new Error(outcome.error)
              return typeof outcome.result === 'string' ? outcome.result : JSON.stringify(outcome.result ?? null)
            },
          },
          { signal: controller.signal },
        ),
      ).catch((error) => {
        registered.delete(name)
        ctx.emit('error', { error, source: `webmcp:${name}` })
        changed()
      })
    }

    const sync = () => {
      const wanted = new Map(ctx.app.actions.list('agent').filter(visible).map((a) => [`${options.prefix ?? ''}${a.name}`, a]))
      for (const [name, entry] of registered) {
        if (wanted.get(name) !== entry.action) {
          entry.controller.abort()
          registered.delete(name)
        }
      }
      for (const [name, action] of wanted) if (!registered.has(name)) register(action)
      changed()
    }

    sync()
    ctx.effect(() => ctx.app.actions.subscribe(sync))
    ctx.onDispose(() => {
      for (const entry of registered.values()) entry.controller.abort()
      registered.clear()
      listeners.clear()
    })
  },
})
