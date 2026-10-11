import type { EndOfTurn, EndOfTurnInput } from '../types.js'

export type HttpEndOfTurnOptions = {
  /**
   * Your backend endpoint. It receives `{ partial, history, language }` and
   * answers with the probability that the user finished, from a classifier
   * (LiveKit turn-detector, a BERT model), a typed-decision model or the LLM.
   * Keys stay on the server.
   */
  url: string
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>)
  /** Reads the probability from the JSON response. Default: `probability`, or `done` as 1/0. */
  parse?: (json: any) => number
  /** Recent turns sent along. Default 6. */
  historyTurns?: number
  /** Consent purpose required to send the transcript to your backend (ADR 0010). */
  consent?: string
  fetch?: typeof fetch
  name?: string
}

const defaultParse = (json: any): number =>
  typeof json?.probability === 'number' ? json.probability : json?.done === true ? 1 : json?.done === false ? 0 : NaN

/** End-of-turn decided by your backend, over the transcript (ADR 0011). */
export function httpEndOfTurn(options: HttpEndOfTurnOptions): EndOfTurn {
  const parse = options.parse ?? defaultParse
  return {
    name: options.name ?? 'http-end-of-turn',
    input: 'text',
    historyTurns: options.historyTurns ?? 6,
    remote: true,
    consent: options.consent,
    isSupported: () => typeof (options.fetch ?? globalThis.fetch) === 'function',
    async predict(input: EndOfTurnInput, signal: AbortSignal) {
      const headers = typeof options.headers === 'function' ? await options.headers() : (options.headers ?? {})
      const response = await (options.fetch ?? globalThis.fetch)(options.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ partial: input.partial, history: input.history, language: input.language }),
        signal,
      })
      if (!response.ok) throw new Error(`End-of-turn service answered ${response.status}`)
      const probability = parse(await response.json())
      if (!Number.isFinite(probability)) throw new Error('End-of-turn service sent no probability')
      return Math.max(0, Math.min(1, probability))
    },
  }
}
