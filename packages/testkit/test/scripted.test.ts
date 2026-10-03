import type { Transport } from '@handsforbots/core'
import { reply, transportConformance } from '../src/index.js'

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
