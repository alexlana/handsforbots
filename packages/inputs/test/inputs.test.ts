// @vitest-environment jsdom
import { createH4B, textOf, type Transport, type TurnRequest } from '@handsforbots/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { camera, files, gui, sensors } from '../src/index.js'

function recorder() {
  const requests: TurnRequest[] = []
  const transport: Transport = { name: 'r', async *run(r) { requests.push(structuredClone(r)) } }
  return { requests, transport }
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  history.replaceState(null, '', '/')
})

describe('files', () => {
  it('sends accepted files with an optional question and rejects others', async () => {
    const { requests, transport } = recorder()
    const h4b = await createH4B({ plugins: [files({ maxSizeMB: 1 })] }).start()
    h4b.provide('transport', transport)
    const service = h4b.get('files')!
    const photo = new File(['x'], 'nota.png', { type: 'image/png' })
    service.attach([photo], 'o que diz esta nota?')
    await h4b.when('turn.status', (s) => s.phase === 'done')
    const user = requests[0]!.messages[0]!
    expect(user).toMatchObject({ role: 'user', modality: 'image', source: 'files' })
    expect((user as any).parts.map((p: any) => p.type)).toEqual(['text', 'image'])
    expect(() => service.attach([new File(['x'], 'a.exe', { type: 'application/x-msdownload' })])).toThrow('Not accepted: a.exe')
    expect(() => service.attach([new File([new Uint8Array(2 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' })])).toThrow('too large')
  })
})

describe('camera', () => {
  it('captures a downscaled photo as an image signal and samples frames as context', async () => {
    const stop = vi.fn()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop }] })) },
    })
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(4000)
    vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(3000)
    const sizes: number[][] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as any)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb, type) {
      sizes.push([this.width, this.height])
      cb(new Blob(['img'], { type }))
    })

    const { requests, transport } = recorder()
    const h4b = await createH4B({ plugins: [camera({ maxSide: 1000 })] }).start()
    h4b.provide('transport', transport)
    const cam = h4b.get('camera')!
    await cam.capture('que planta é essa?')
    await h4b.when('turn.status', (s) => s.phase === 'done')
    expect(sizes[0]).toEqual([1000, 750])
    expect((requests[0]!.messages[0] as any).parts[1]).toMatchObject({ type: 'image', mimeType: 'image/jpeg' })

    cam.startFrames(1000)
    await tick(10)
    expect(h4b.context.find((s) => s.key === 'camera.frame')).toMatchObject({ modality: 'video' })
    expect(sizes[1]).toEqual([768, 576])
    cam.close()
    expect(stop).toHaveBeenCalled()
    expect(h4b.context.find((s) => s.key === 'camera.frame')).toBeUndefined()
    expect(cam.getState()).toMatchObject({ open: false, streaming: false })
  })
})

describe('gui (Poke successor)', () => {
  it('keeps the route as context, including SPA navigation', async () => {
    const h4b = await createH4B({ plugins: [gui({ selection: false })] }).start()
    const route = () => (h4b.context.find((s) => s.key === 'gui.route')?.parts[0] as any)?.value.path
    expect(route()).toBe('/')
    history.pushState(null, '', '/pedidos?status=late')
    expect(route()).toBe('/pedidos?status=late')
  })

  it('supports declarative say, command and context attributes', async () => {
    const { requests, transport } = recorder()
    const run = vi.fn(() => 3)
    document.body.innerHTML = `
      <button id="help" data-h4b-say="Quero ajuda com o pagamento">Ajuda</button>
      <button id="late" data-h4b-command="filter" data-h4b-args='{"status":"late"}'>Atrasados</button>
      <section data-h4b-context="checkout" data-h4b-value='{"step":2}'></section>`
    const h4b = await createH4B({
      plugins: [gui({ route: false, selection: false })],
      actions: [{ name: 'filter', description: 'Filter', handler: run }],
    }).start()
    h4b.provide('transport', transport)
    expect(h4b.context.find((s) => s.key === 'gui.checkout')?.parts[0]).toEqual({ type: 'data', name: 'checkout', value: { step: 2 } })

    document.getElementById('help')!.click()
    await h4b.when('turn.status', (s) => s.phase === 'done')
    expect(textOf(requests[0]!.messages[0]!)).toBe('Quero ajuda com o pagamento')

    document.getElementById('late')!.click()
    await h4b.when('turn.status', (s) => s.phase === 'done' && s.route === 'direct')
    expect(run).toHaveBeenCalledWith({ status: 'late' }, expect.objectContaining({ origin: 'user' }))

    document.querySelector('section')!.remove()
    await tick()
    expect(h4b.context.find((s) => s.key === 'gui.checkout')).toBeUndefined()
  })

  it('re-engages after inactivity, once', async () => {
    vi.useFakeTimers()
    const { requests, transport } = recorder()
    const h4b = await createH4B({ plugins: [gui({ route: false, selection: false, declarative: false, idle: { minutes: 2, text: '/reengage' } })] }).start()
    h4b.provide('transport', transport)
    await vi.advanceTimersByTimeAsync(60_000)
    document.dispatchEvent(new Event('keydown'))
    await vi.advanceTimersByTimeAsync(90_000)
    expect(requests).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(40_000)
    expect(textOf(requests[0]!.messages[0]!)).toBe('/reengage')
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(requests).toHaveLength(1)
  })
})

describe('sensors', () => {
  it('publishes opt-in readings as context and stops cleanly', async () => {
    let watcher: ((p: any) => void) | undefined
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { watchPosition: (ok: any) => ((watcher = ok), 7), clearWatch: vi.fn() },
    })
    const h4b = await createH4B({ plugins: [sensors({ throttleMs: 0 })] }).start()
    const service = h4b.get('sensors')!
    await service.enable('geolocation')
    watcher!({ coords: { latitude: -23.5505199, longitude: -46.6333094, accuracy: 12.4 } })
    expect(h4b.context.find((s) => s.key === 'sensor.geolocation')?.parts[0]).toEqual({
      type: 'data',
      name: 'geolocation',
      value: { latitude: -23.55052, longitude: -46.63331, accuracy: 12 },
    })
    await service.enable('network')
    expect(service.getState().active).toEqual(['geolocation', 'network'])
    service.disable('geolocation')
    expect(h4b.context.find((s) => s.key === 'sensor.geolocation')).toBeUndefined()
    expect((navigator.geolocation as any).clearWatch).toHaveBeenCalledWith(7)
  })
})
