export type Listener<T> = (payload: T) => void

/**
 * Minimal typed event bus. A failing listener never breaks the others: the
 * error is reported through `onError` instead.
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
        listener(payload)
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
