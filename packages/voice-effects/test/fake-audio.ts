/** A tiny stand-in for BaseAudioContext that records nodes and connections. */
export class FakeParam {
  value: number
  inputs: FakeNode[] = []
  constructor(value = 0) {
    this.value = value
  }
}

export class FakeNode {
  outputs: (FakeNode | FakeParam)[] = []
  started = false
  stopped = false
  /** AudioParams and properties set by the effects (gain, frequency, type…). */
  props: Record<string, unknown> = {}
  constructor(readonly kind: string) {}
  connect<T extends FakeNode | FakeParam>(target: T): T {
    this.outputs.push(target)
    if (target instanceof FakeParam) target.inputs.push(this)
    return target
  }
  disconnect() {
    this.outputs = []
  }
  start() {
    this.started = true
  }
  stop() {
    this.stopped = true
  }
}

const node = (kind: string, params: Record<string, number>) => {
  const n = new FakeNode(kind)
  for (const [key, value] of Object.entries(params)) (n as any)[key] = new FakeParam(value)
  return n
}

export function fakeContext(sampleRate = 24000) {
  const created: FakeNode[] = []
  const track = <T extends FakeNode>(n: T) => (created.push(n), n)
  const context = {
    sampleRate,
    destination: track(new FakeNode('destination')),
    createGain: () => track(node('gain', { gain: 1 })),
    createBiquadFilter: () => track(Object.assign(node('biquad', { frequency: 350, Q: 1, gain: 0 }), { type: 'lowpass' })),
    createDelay: () => track(node('delay', { delayTime: 0 })),
    createOscillator: () => track(node('oscillator', { frequency: 440 })),
    createDynamicsCompressor: () =>
      track(node('compressor', { threshold: -24, knee: 30, ratio: 12, attack: 0.003, release: 0.25 })),
    createWaveShaper: () => track(Object.assign(new FakeNode('waveshaper'), { curve: null, oversample: 'none' })),
    createConvolver: () => track(Object.assign(new FakeNode('convolver'), { buffer: null })),
    createBuffer: (channels: number, length: number) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length))
      return { length, numberOfChannels: channels, getChannelData: (c: number) => data[c]! }
    },
    createBufferSource: () => track(node('source', { playbackRate: 1 })),
  }
  return { context: context as unknown as BaseAudioContext, created }
}

/** Kinds of the nodes reachable from `start`, in order of first visit. */
export function path(start: FakeNode): string[] {
  const seen = new Set<FakeNode>()
  const kinds: string[] = []
  const visit = (n: FakeNode) => {
    if (seen.has(n)) return
    seen.add(n)
    kinds.push(n.kind === 'biquad' ? `biquad:${String((n as any).type)}` : n.kind)
    for (const out of n.outputs) if (out instanceof FakeNode) visit(out)
  }
  visit(start)
  return kinds
}
