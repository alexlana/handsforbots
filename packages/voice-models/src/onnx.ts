/** The parts of `onnxruntime-web` the engines use (structural: any compatible build works). */
export type OnnxTensor = { data: unknown; dims?: readonly number[] }

export type OnnxSession = {
  readonly inputNames: readonly string[]
  readonly outputNames: readonly string[]
  run(feeds: Record<string, OnnxTensor>): Promise<Record<string, OnnxTensor>>
  release?(): Promise<void>
}

export type OnnxRuntime = {
  InferenceSession: { create(model: Uint8Array, options?: Record<string, unknown>): Promise<OnnxSession> }
  Tensor: new (type: string, data: unknown, dims?: readonly number[]) => OnnxTensor
}

/**
 * The runtime, or a function that loads it: `() => import('onnxruntime-web')`.
 * Passing a function keeps the runtime (several MB of WebAssembly) out of the
 * page until a model loads. Set `ort.env.wasm.proxy = true` in it to run
 * inference in a worker, so long sentences do not freeze the page.
 */
export type RuntimeSource = OnnxRuntime | (() => OnnxRuntime | Promise<OnnxRuntime>)

export const loadRuntime = async (runtime: RuntimeSource): Promise<OnnxRuntime> =>
  typeof runtime === 'function' ? await runtime() : runtime

export const int64 = (ort: OnnxRuntime, values: readonly number[], dims: readonly number[] = [values.length]) =>
  new ort.Tensor('int64', BigInt64Array.from(values, (value) => BigInt(value)), dims)

export const float32 = (ort: OnnxRuntime, values: ArrayLike<number>, dims: readonly number[] = [values.length]) =>
  new ort.Tensor('float32', Float32Array.from(values), dims)

export function concatAudio(parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, part) => n + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** Splits text into sentence groups of at most `max` characters (models degrade on long inputs). */
export function chunkText(text: string, max = 300): string[] {
  const parts = text.trim().match(/[^.!?…\n]+[.!?…]*\s*/g) ?? [text]
  const out: string[] = []
  let current = ''
  for (const part of parts) {
    if ((current + part).length > max && current) {
      out.push(current.trim())
      current = ''
    }
    current += part
  }
  if (current.trim()) out.push(current.trim())
  return out
}
