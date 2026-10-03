import { createH4B, textOf, type H4B, type H4BOptions, type Stimulus, type Transport, type TurnRequest } from '@handsforbots/core'
import { describe, expect, it } from 'vitest'

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Transport that replays scripted stimuli (per round, or computed) and records requests. */
export function scriptedTransport(
  script: Stimulus[][] | ((request: TurnRequest, round: number) => Stimulus[] | Promise<Stimulus[]>),
): Transport & { requests: TurnRequest[] } {
  const requests: TurnRequest[] = []
  return {
    name: 'scripted',
    requests,
    async *run(request) {
      requests.push(structuredClone(request))
      const round = requests.length - 1
      const stimuli = typeof script === 'function' ? await script(request, round) : (script[round] ?? [])
      yield* stimuli
    },
  }
}

/** Text reply as stimuli. */
export function reply(text: string, messageId = `m-${Math.random().toString(36).slice(2)}`): Stimulus[] {
  return [
    { type: 'message.start', messageId },
    { type: 'message.delta', messageId, delta: text },
    { type: 'message.end', messageId },
  ]
}

/** Polls until `check` stops throwing (or rethrows after the deadline). */
export async function eventually<T>(check: () => T | Promise<T>, timeout = 3000, interval = 10): Promise<T> {
  const deadline = Date.now() + timeout
  for (;;) {
    try {
      return await check()
    } catch (error) {
      if (Date.now() > deadline) throw error
      await new Promise((r) => setTimeout(r, interval))
    }
  }
}

/** Resolves when the kernel has no running or queued work. */
export async function waitForIdle(h4b: H4B, timeout = 5000): Promise<void> {
  await new Promise((r) => setTimeout(r, 0))
  await eventually(() => {
    if (h4b.busy) throw new Error('H4B is still busy')
  }, timeout, 2)
}

/* -------------------------------------------------------------------------- */
/* Transport conformance                                                      */
/* -------------------------------------------------------------------------- */

/**
 * What the fake backend behind the transport must do in each scenario:
 * - `text`: answer "hello".
 * - `tool`: ask the client to run `conformance_echo` with `{ "value": "ping" }`; when it
 *   receives the result, answer with a text that contains the result value ("pong").
 * - `error`: fail (HTTP 500, RUN_ERROR…).
 * - `hang`: never answer until the request is aborted.
 */
export type ConformanceScenario = 'text' | 'tool' | 'error' | 'hang'

export type ConformanceOptions = {
  /** Builds a transport wired to a fake backend that behaves as `scenario` says. */
  create: (scenario: ConformanceScenario) => Transport | Promise<Transport>
  /** Scenarios the transport cannot express (e.g. a backend without client tools). */
  skip?: ConformanceScenario[]
  h4bOptions?: Omit<H4BOptions, 'plugins'>
}

/** Registers a vitest suite every transport should pass. */
export function transportConformance(name: string, options: ConformanceOptions) {
  const skip = new Set(options.skip ?? [])
  const run = (scenario: ConformanceScenario) => (skip.has(scenario) ? it.skip : it)

  const setup = async (scenario: ConformanceScenario) => {
    const echoes: unknown[] = []
    const h4b = await createH4B({
      onError: () => {},
      ...options.h4bOptions,
      actions: [
        {
          name: 'conformance_echo',
          description: 'Echoes a value back (conformance test)',
          parameters: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] },
          handler: ({ value }: { value: string }) => {
            echoes.push(value)
            return value === 'ping' ? 'pong' : value
          },
        },
      ],
    }).start()
    h4b.provide('transport', await options.create(scenario))
    return { h4b, echoes }
  }

  describe(`transport conformance: ${name}`, () => {
    run('text')('streams a text answer into one assistant message', async () => {
      const { h4b } = await setup('text')
      const result = await h4b.ask('hi')
      expect(result.status).toMatchObject({ phase: 'done', route: 'transport' })
      const texts = result.messages.filter((m) => m.role === 'assistant').map((m) => textOf(m))
      expect(texts.join(' ')).toContain('hello')
      expect(result.messages.every((m) => m.role !== 'assistant' || !m.streaming)).toBe(true)
    })

    run('tool')('runs a client action once and gives the backend its result', async () => {
      const { h4b, echoes } = await setup('tool')
      const result = await h4b.ask('please echo')
      expect(echoes).toEqual(['ping'])
      expect(result.status.phase).toBe('done')
      const tool = result.messages.find((m) => m.role === 'tool')
      expect(tool).toMatchObject({ name: 'conformance_echo', result: 'pong' })
      expect(textOf(result.messages.at(-1)!)).toContain('pong')
    })

    run('error')('turns backend failures into an error turn (never throws)', async () => {
      const { h4b } = await setup('error')
      const result = await h4b.ask('hi')
      expect(result.status.phase).toBe('error')
      expect(result.status.error).toBeTruthy()
    })

    run('hang')('stops when the turn is aborted', async () => {
      const { h4b } = await setup('hang')
      const pending = h4b.ask('hi')
      await new Promise((r) => setTimeout(r, 30))
      h4b.abort()
      const result = await pending
      expect(result.status.phase).toBe('aborted')
    })
  })
}
