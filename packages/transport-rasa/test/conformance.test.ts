import { transportConformance } from '@handsforbots/testkit'
import { createRasaTransport } from '../src/index.js'

function rasaServer(scenario: string) {
  return (async (_url: string, init: RequestInit = {}) => {
    if (scenario === 'error') return new Response('boom', { status: 500 })
    if (scenario === 'hang') {
      return new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))
    }
    const { message } = JSON.parse(String(init.body))
    if (message.startsWith('/echo_result')) return Response.json([{ text: `echo returned ${message.slice('/echo_result'.length)}` }])
    if (scenario === 'tool') return Response.json([{ custom: { h4b: { action: { name: 'conformance_echo', args: { value: 'ping' } } } } }])
    return Response.json([{ text: 'hello' }])
  }) as typeof fetch
}

transportConformance('rasa', {
  create: (scenario) =>
    createRasaTransport({
      url: '/webhook',
      fetch: rasaServer(scenario),
      reportActionResults: (results) => `/echo_result${JSON.stringify(results[0]!.result)}`,
    }),
})
