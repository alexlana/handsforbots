/** Tiny observable state used by the input services (works with `useStore` in React). */
export function createState<S>(initial: S) {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set(patch: Partial<S>) {
      state = { ...state, ...patch }
      for (const listener of listeners) listener()
    },
    clear: () => listeners.clear(),
  }
}
