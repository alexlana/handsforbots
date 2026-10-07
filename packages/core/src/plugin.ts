import type { H4B } from './kernel.js'
import type { StandardSchemaV1 } from './standard-schema.js'
import type { Events, Hooks, Interceptor, Services } from './registry.js'
import type { ActionDefinition, CaptureHandler, CaptureOptions, Matcher, Signal, SignalInput } from './types.js'

export const API_VERSION = 2

export type PluginDefinition<C> = {
  name: string
  /** Kernel API this plugin targets. Defaults to the current one. */
  apiVersion?: number
  /** Services this plugin provides (informative; checked after apply). */
  provides?: (keyof Services)[]
  /** Services required before `apply` runs. */
  inject?: (keyof Services)[]
  /** Validates and normalizes the config given to the factory. */
  config?: StandardSchemaV1<unknown, C>
  /**
   * Consent purpose this plugin needs by default (e.g. `persistence` for
   * storages). With `createH4B({ consent })`, it is mounted only while the
   * purpose is granted. Hosts override it with `withConsent()`.
   */
  consent?: string
  apply(ctx: PluginContext, config: C): void | Promise<void>
}

export type Plugin<C = unknown> = {
  readonly definition: PluginDefinition<C>
  readonly config: unknown
  /** Overrides `definition.consent`; false = never gated. */
  readonly requires?: string | false
}

export type PluginFactory<C> = undefined extends C
  ? (config?: C) => Plugin<C>
  : (config: C) => Plugin<C>

/**
 * Declares a plugin and returns its factory:
 *
 *   export const voice = definePlugin({ name: 'voice', apply(ctx, config) { … } })
 *   createH4B({ plugins: [voice({ … })] })
 */
export function definePlugin<C = undefined>(definition: PluginDefinition<C>): PluginFactory<C> {
  return ((config?: C) => ({ definition, config })) as PluginFactory<C>
}

/**
 * Mounts `plugin` only while `purpose` is granted (see `createH4B({ consent })`),
 * or never gates it with `false`:
 *
 *   withConsent(observability({ … }), 'analytics')
 *   withConsent(storageLocal(), false) // e.g. a storage your legal basis doesn't tie to consent
 */
export function withConsent<C>(plugin: Plugin<C>, purpose: string | false): Plugin<C> {
  return { ...plugin, requires: purpose }
}

/** The consent purpose that gates `plugin`, if any. */
export function purposeOf(plugin: Plugin<any>): string | undefined {
  const purpose = plugin.requires ?? plugin.definition.consent
  return purpose || undefined
}

type Disposer = () => void | Promise<void>

/**
 * What a plugin sees. Everything registered through it (listeners, services,
 * actions, matchers, effects) is undone when the plugin is disposed.
 */
export class PluginContext {
  private disposers: Disposer[] = []
  private revokers: Disposer[] = []
  private disposed = false

  constructor(
    readonly app: H4B,
    readonly name: string,
  ) {}

  /** Notification listener (sync or async); never blocks the flow. */
  on<K extends keyof Events>(event: K, listener: (payload: Events[K]) => unknown): () => void {
    return this.track(this.app.on(event, listener))
  }

  /** Awaited interception point (sync or async) that can transform or veto. */
  intercept<K extends keyof Hooks>(hook: K, interceptor: Interceptor<Hooks[K]>, priority?: number): () => void {
    return this.track(this.app.intercept(hook, interceptor, priority))
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.app.emit(event, payload)
  }

  provide<K extends keyof Services>(key: K, service: Services[K]): void {
    this.track(this.app.provide(key, service, this.name))
  }

  get<K extends keyof Services>(key: K): Services[K] | undefined {
    return this.app.get(key)
  }

  require<K extends keyof Services>(key: K): Services[K] {
    const service = this.app.get(key)
    if (service === undefined) throw new Error(`[h4b] plugin "${this.name}" requires service "${String(key)}"`)
    return service
  }

  registerAction<I, O>(action: ActionDefinition<I, O>): () => void {
    return this.track(this.app.actions.register(action))
  }

  addMatcher(matcher: Matcher): () => void {
    return this.track(this.app.addMatcher(matcher))
  }

  /** Routes every trigger signal to `handler` (bypassing menu and transport) until released. */
  capture(handler: CaptureHandler, options?: CaptureOptions): () => void {
    return this.track(this.app.capture(handler, options))
  }

  signal(input: SignalInput): Signal {
    return this.app.signal({ ...input, source: input.source ?? this.name })
  }

  /** Runs `setup` now; the returned cleanup runs when the plugin is disposed. */
  effect(setup: () => Disposer | void): void {
    const cleanup = setup()
    if (cleanup) this.track(cleanup)
  }

  /** Registers an arbitrary cleanup. */
  onDispose(disposer: Disposer): void {
    this.track(disposer)
  }

  /**
   * Runs after the plugin was unmounted because the consent it requires was
   * withdrawn (and the rules erase on revoke): delete what it kept, besides
   * the `storage` service it provided, which the kernel already clears.
   * Never runs on `stop()` or a plain unmount.
   */
  onRevoke(handler: Disposer): void {
    this.revokers.push(handler)
  }

  /** @internal */
  get revokeHandlers(): Disposer[] {
    return [...this.revokers]
  }

  get isDisposed(): boolean {
    return this.disposed
  }

  /** @internal */
  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    const disposers = this.disposers.reverse()
    this.disposers = []
    for (const dispose of disposers) {
      try {
        await dispose()
      } catch (error) {
        this.app.emit('error', { error, source: this.name })
      }
    }
  }

  private track<T extends Disposer>(disposer: T): T {
    if (this.disposed) {
      void disposer()
      return disposer
    }
    let done = false
    const once = (() => {
      if (done) return
      done = true
      this.disposers = this.disposers.filter((d) => d !== once)
      return disposer()
    }) as T
    this.disposers.push(once)
    return once
  }
}
