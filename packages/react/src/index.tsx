import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type {
  ActionDefinition,
  Events,
  H4B,
  H4BSnapshot,
  Message,
  Modality,
  TurnStatus,
} from '@handsforbots/core'

const H4BContext = createContext<H4B | null>(null)

/**
 * Makes an H4B instance available to hooks. Create and start the instance
 * outside React (it owns plugins, devices and connections):
 *
 *   const h4b = createH4B({ plugins: [...] })
 *   await h4b.start()
 *   root.render(<H4BProvider value={h4b}><App /></H4BProvider>)
 */
export function H4BProvider({ value, children }: { value: H4B; children?: ReactNode }) {
  return <H4BContext.Provider value={value}>{children}</H4BContext.Provider>
}

export function useH4B(): H4B {
  const h4b = useContext(H4BContext)
  if (!h4b) throw new Error('[h4b] useH4B must be used inside <H4BProvider>')
  return h4b
}

/**
 * Subscribes to the kernel store. Select fields of the snapshot (they keep
 * their identity until they change) rather than building new objects.
 */
export function useH4BState<T = H4BSnapshot>(selector: (snapshot: H4BSnapshot) => T = (s) => s as T): T {
  const h4b = useH4B()
  return useSyncExternalStore(
    (onChange) => h4b.subscribe(onChange),
    () => selector(h4b.getSnapshot()),
    () => selector(h4b.getSnapshot()),
  )
}

export const useMessages = (): Message[] => useH4BState((s) => s.messages)
export const useTurn = (): TurnStatus | undefined => useH4BState((s) => s.turn)
export const useBusy = (): boolean => useH4BState((s) => s.busy)
export const useSharedState = <T = unknown,>(): T => useH4BState((s) => s.state as T)

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

function useLatest<T>(value: T) {
  const ref = useRef(value)
  useIsomorphicLayoutEffect(() => {
    ref.current = value
  })
  return ref
}

/**
 * Registers an action while the component is mounted. The latest handler is
 * always used, so it can close over component state without re-registering.
 */
export function useAction<I, O>(action: ActionDefinition<I, O>): void {
  const h4b = useH4B()
  const latest = useLatest(action)
  const { name } = action
  useEffect(() => {
    return h4b.actions.register<I, O>({
      ...latest.current,
      handler: (args, call) => latest.current.handler(args, call),
      describeResult: (result, args) => latest.current.describeResult?.(result, args),
    })
  }, [h4b, name])
}

/**
 * Keeps a context signal in sync with a value (current page, selection,
 * filters…). `undefined` removes it.
 */
export function useContextSignal(
  key: string,
  value: unknown,
  options: { modality?: Modality; source?: string } = {},
): void {
  const h4b = useH4B()
  const serialized = value === undefined ? undefined : JSON.stringify(value)
  useEffect(() => {
    if (serialized === undefined) {
      h4b.removeContext(key)
      return
    }
    h4b.signal({
      kind: 'context',
      key,
      modality: options.modality ?? 'gui-event',
      source: options.source ?? 'react',
      parts: [{ type: 'data', name: key, value: JSON.parse(serialized) }],
    })
  }, [h4b, key, serialized, options.modality, options.source])
  useEffect(() => () => h4b.removeContext(key), [h4b, key])
}

/** Listens to a kernel notification for the component's lifetime. */
export function useH4BEvent<K extends keyof Events>(event: K, listener: (payload: Events[K]) => unknown): void {
  const h4b = useH4B()
  const latest = useLatest(listener)
  useEffect(() => h4b.on(event, (payload) => latest.current(payload)), [h4b, event])
}

/** Any store-like plugin service (e.g. `voice`): `getState()` + `subscribe()`. */
export type ExternalStore<S> = { getState(): S; subscribe(listener: () => void): () => void }

/**
 * Subscribes to a plugin service with state, e.g.
 * `const voice = useStore(useH4B().get('voice'))`. Returns undefined when the
 * service is not installed.
 */
export function useStore<S>(store: ExternalStore<S> | undefined): S | undefined {
  const subscribe = useCallback((onChange: () => void) => store?.subscribe(onChange) ?? (() => {}), [store])
  return useSyncExternalStore(subscribe, () => store?.getState(), () => store?.getState())
}

/** Every stimulus as it arrives (UI effects, renders, deltas…). */
export function useStimulus(listener: (payload: Events['stimulus']) => unknown): void {
  useH4BEvent('stimulus', listener)
}
