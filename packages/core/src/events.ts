export type Listener<T> = (payload: T) => unknown

/**
 * Minimal typed event bus for notifications. `emit` never waits: listeners
 * may be sync or async, and a failing one (throw or rejection) never breaks
 * the others — the error goes to `onError`. Use interceptors (hooks) when a
 * plugin must transform or veto something and the flow has to wait for it.
 */
export class EventBus<Events extends object> {
  private listeners = new Map<keyof Events, Set<Listener<any>>>()

  constructor(private onError: (error: unknown, event: PropertyKey) => void = defaultOnError) {}

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(listener)
    return () => set.delete(listener)
  }

  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    const off = this.on(event, (payload) => {
      off()
      listener(payload)
    })
    return off
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const listener of [...set]) {
      try {
        const result = listener(payload)
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          ;(result as Promise<unknown>).then(undefined, (error) => this.onError(error, event))
        }
      } catch (error) {
        this.onError(error, event)
      }
    }
  }

  clear(): void {
    this.listeners.clear()
  }
}

function defaultOnError(error: unknown, event: PropertyKey) {
  console.error(`[h4b] listener for "${String(event)}" failed`, error)
}
