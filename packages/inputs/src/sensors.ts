import { definePlugin } from '@handsforbots/core'
import { createState } from './store.js'

export type SensorName = 'geolocation' | 'orientation' | 'network'

export type SensorsOptions = {
  /** Start these right away (they still ask for permission when the platform requires it). */
  enable?: SensorName[]
  /** Minimum time between context updates per sensor. Default 5000 ms. */
  throttleMs?: number
}

export type SensorsState = { active: SensorName[]; errors: Partial<Record<SensorName, string>> }

export type SensorsService = {
  getState(): SensorsState
  subscribe(listener: () => void): () => void
  enable(name: SensorName): Promise<void>
  disable(name: SensorName): void
}

declare module '@handsforbots/core' {
  interface Services {
    sensors: SensorsService
  }
}

/** Sensor readings as context signals (`sensor.<name>`), opt-in and throttled. */
export const sensors = definePlugin<SensorsOptions | undefined>({
  name: 'input-sensors',
  provides: ['sensors'],
  apply(ctx, options = {}) {
    const store = createState<SensorsState>({ active: [], errors: {} })
    const stops = new Map<SensorName, () => void>()
    const throttle = options.throttleMs ?? 5000
    const last = new Map<SensorName, number>()

    const publish = (name: SensorName, value: unknown, force = false) => {
      const now = Date.now()
      if (!force && now - (last.get(name) ?? 0) < throttle) return
      last.set(name, now)
      ctx.signal({ kind: 'context', key: `sensor.${name}`, modality: 'sensor', source: 'sensors', parts: [{ type: 'data', name, value }] })
    }
    const fail = (name: SensorName, message: string) => store.set({ errors: { ...store.getState().errors, [name]: message } })

    const starters: Record<SensorName, () => Promise<() => void>> = {
      async geolocation() {
        if (!navigator.geolocation) throw new Error('Geolocation is not available')
        const id = navigator.geolocation.watchPosition(
          (p) =>
            publish('geolocation', {
              latitude: Number(p.coords.latitude.toFixed(5)),
              longitude: Number(p.coords.longitude.toFixed(5)),
              accuracy: Math.round(p.coords.accuracy),
            }),
          (error) => fail('geolocation', error.message),
          { enableHighAccuracy: false, maximumAge: 60_000 },
        )
        return () => navigator.geolocation.clearWatch(id)
      },
      async orientation() {
        const DOE = (globalThis as any).DeviceOrientationEvent
        if (!DOE) throw new Error('Device orientation is not available')
        // iOS asks for permission (needs a user gesture).
        if (typeof DOE.requestPermission === 'function' && (await DOE.requestPermission()) !== 'granted') {
          throw new Error('Orientation permission denied')
        }
        const onOrientation = (e: DeviceOrientationEvent) =>
          publish('orientation', { alpha: round(e.alpha), beta: round(e.beta), gamma: round(e.gamma) })
        window.addEventListener('deviceorientation', onOrientation)
        return () => window.removeEventListener('deviceorientation', onOrientation)
      },
      async network() {
        const update = () => {
          const connection = (navigator as any).connection
          publish('network', { online: navigator.onLine, effectiveType: connection?.effectiveType, saveData: connection?.saveData }, true)
        }
        update()
        window.addEventListener('online', update)
        window.addEventListener('offline', update)
        return () => {
          window.removeEventListener('online', update)
          window.removeEventListener('offline', update)
        }
      },
    }

    const service: SensorsService = {
      getState: store.getState,
      subscribe: store.subscribe,
      async enable(name) {
        if (stops.has(name)) return
        try {
          stops.set(name, await starters[name]())
          const { [name]: _, ...errors } = store.getState().errors
          store.set({ active: [...store.getState().active, name], errors })
        } catch (error) {
          fail(name, (error as Error).message)
          throw error
        }
      },
      disable(name) {
        stops.get(name)?.()
        stops.delete(name)
        ctx.app.removeContext(`sensor.${name}`)
        store.set({ active: store.getState().active.filter((n) => n !== name) })
      },
    }
    ctx.provide('sensors', service)
    for (const name of options.enable ?? []) void service.enable(name).catch(() => {})
    ctx.onDispose(() => {
      for (const name of [...stops.keys()]) service.disable(name)
      store.clear()
    })
  },
})

const round = (n: number | null) => (n == null ? null : Math.round(n))
