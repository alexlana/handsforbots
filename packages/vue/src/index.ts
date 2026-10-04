import {
  inject,
  onScopeDispose,
  provide,
  shallowReadonly,
  shallowRef,
  toValue,
  watch,
  type App,
  type InjectionKey,
  type MaybeRefOrGetter,
  type Plugin,
  type ShallowRef,
} from 'vue'
import type {
  ActionDefinition,
  Events,
  H4B,
  H4BSnapshot,
  Message,
  Modality,
  Services,
  TurnStatus,
} from '@handsforbots/core'

export const H4BKey: InjectionKey<H4B> = Symbol('h4b')

/**
 * Vue plugin that makes an H4B instance available to composables. Create and
 * start the instance outside components (it owns plugins, devices and
 * connections):
 *
 *   const h4b = createH4B({ plugins: [...] })
 *   await h4b.start()
 *   createApp(App).use(h4bVue(h4b)).mount('#app')
 */
export function h4bVue(h4b: H4B): Plugin {
  return {
    install(app: App) {
      app.provide(H4BKey, h4b)
    },
  }
}

/** Provides an H4B instance to a component subtree (alternative to `h4bVue`). */
export function provideH4B(h4b: H4B): void {
  provide(H4BKey, h4b)
}

export function useH4B(): H4B {
  const h4b = inject(H4BKey, null)
  if (!h4b) throw new Error('[h4b] useH4B needs app.use(h4bVue(h4b)) or provideH4B(h4b) in an ancestor')
  return h4b
}

/**
 * Subscribes to the kernel store. Select fields of the snapshot (they keep
 * their identity until they change) rather than building new objects; the
 * ref only triggers when the selected value changes.
 */
export function useH4BState<T = H4BSnapshot>(
  selector: (snapshot: H4BSnapshot) => T = (s) => s as T,
): Readonly<ShallowRef<T>> {
  const h4b = useH4B()
  const state = shallowRef(selector(h4b.getSnapshot()))
  const unsubscribe = h4b.subscribe(() => {
    state.value = selector(h4b.getSnapshot())
  })
  onScopeDispose(unsubscribe)
  return shallowReadonly(state)
}

export const useMessages = (): Readonly<ShallowRef<Message[]>> => useH4BState((s) => s.messages)
export const useTurn = (): Readonly<ShallowRef<TurnStatus | undefined>> => useH4BState((s) => s.turn)
export const useBusy = (): Readonly<ShallowRef<boolean>> => useH4BState((s) => s.busy)
export const useSharedState = <T = unknown>(): Readonly<ShallowRef<T>> => useH4BState((s) => s.state as T)

/** Listens to a kernel notification for the component's (or scope's) lifetime. */
export function useH4BEvent<K extends keyof Events>(event: K, listener: (payload: Events[K]) => unknown): void {
  onScopeDispose(useH4B().on(event, listener))
}

/** Every stimulus as it arrives (UI effects, renders, deltas…). */
export function useStimulus(listener: (payload: Events['stimulus']) => unknown): void {
  useH4BEvent('stimulus', listener)
}

/**
 * A plugin service (e.g. `voice`), kept up to date when it is provided or
 * removed after the component mounted. `undefined` while it is not installed.
 */
export function useService<K extends keyof Services>(key: K): Readonly<ShallowRef<Services[K] | undefined>> {
  const h4b = useH4B()
  const service = shallowRef(h4b.get(key))
  const refresh = (payload: { key: keyof Services }) => {
    if (payload.key === key) service.value = h4b.get(key)
  }
  onScopeDispose(h4b.on('service.provided', refresh))
  onScopeDispose(h4b.on('service.removed', refresh))
  return shallowReadonly(service)
}

/** Any store-like plugin service (e.g. `voice`): `getState()` + `subscribe()`. */
export type ExternalStore<S> = { getState(): S; subscribe(listener: () => void): () => void }

/**
 * Subscribes to a plugin service with state, e.g.
 * `const voiceState = useStore(useService('voice'))`. The source may be a
 * ref or getter; the subscription follows it. `undefined` while there is no
 * store.
 */
export function useStore<S>(
  source: MaybeRefOrGetter<ExternalStore<S> | undefined>,
): Readonly<ShallowRef<S | undefined>> {
  const state = shallowRef<S | undefined>()
  watch(
    () => toValue(source),
    (store, _previous, onCleanup) => {
      state.value = store?.getState()
      if (!store) return
      onCleanup(store.subscribe(() => (state.value = store.getState())))
    },
    { immediate: true, flush: 'sync' },
  )
  return shallowReadonly(state)
}

/**
 * Registers an action for the component's (or scope's) lifetime. The handler
 * runs in the component's closure, so it always sees current refs.
 */
export function useAction<I, O>(action: ActionDefinition<I, O>): void {
  onScopeDispose(useH4B().actions.register<I, O>(action))
}

/**
 * Keeps a context signal in sync with a value (current page, selection,
 * filters…). Pass a ref or getter to follow changes; `undefined` removes it.
 */
export function useContextSignal(
  key: string,
  value: MaybeRefOrGetter<unknown>,
  options: { modality?: Modality; source?: string } = {},
): void {
  const h4b = useH4B()
  watch(
    () => {
      const current = toValue(value)
      return current === undefined ? undefined : JSON.stringify(current)
    },
    (serialized) => {
      if (serialized === undefined) {
        h4b.removeContext(key)
        return
      }
      h4b.signal({
        kind: 'context',
        key,
        modality: options.modality ?? 'gui-event',
        source: options.source ?? 'vue',
        parts: [{ type: 'data', name: key, value: JSON.parse(serialized) }],
      })
    },
    { immediate: true },
  )
  onScopeDispose(() => h4b.removeContext(key))
}
