import { citedSources, createH4B, sourcesOf, textOf, type Transport } from '@handsforbots/core'
import { describe, expect, it } from 'vitest'
import { citedReply, reply, scriptedTransport, transportConformance } from '../src/index.js'

/** The reference implementation: an in-memory transport following the scenarios. */
function reference(scenario: string): Transport {
  return {
    name: 'reference',
    async *run(request, signal) {
      if (scenario === 'error') throw new Error('backend down')
      if (scenario === 'hang') {
        await new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
      }
      const last = request.messages.at(-1)!
      if (scenario === 'tool' && last.role === 'user') {
        yield { type: 'action.call', callId: 'c1', name: 'conformance_echo', args: { value: 'ping' } }
        return
      }
      if (last.role === 'tool') return yield* reply(`echo returned ${JSON.stringify(last.result)}`)
      yield* reply('hello')
    },
  }
}

transportConformance('reference', { create: reference })

describe('citedReply', () => {
  it('sends sources, clean text and citations the way a RAG backend does', async () => {
    const h4b = await createH4B({ onError: () => {} }).start()
    const sources = [{ id: 'c1', title: 'Autotrac', url: 'https://example.com/autotrac#cap-1' }]
    h4b.provide('transport', scriptedTransport([citedReply('Autotrac rastreia caminhões [c1]. Sem [c9].', sources, 'm')]))
    const result = await h4b.ask('o que é a Autotrac?')
    const message = result.messages.find((m) => m.role === 'assistant')!
    expect(textOf(message)).toBe('Autotrac rastreia caminhões. Sem [c9].')
    expect(sourcesOf(message)).toEqual([{ type: 'source', ...sources[0] }])
    expect(citedSources(message)).toEqual(new Map([['c1', 1]]))
  })
})
