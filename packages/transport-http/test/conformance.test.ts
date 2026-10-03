import { transportConformance } from '@handsforbots/testkit'
import { createHttpTransport, createOpenAICompatibleTransport, createUniversalLLMTransport } from '../src/index.js'

/** Fake backend speaking a simple JSON dialect, following the conformance scenarios. */
function backend(scenario: string, dialect: 'generic' | 'openai') {
  return (async (_url: string, init: RequestInit = {}) => {
    if (String(_url).endsWith('/session')) return Response.json({ session_id: 's' })
    if (scenario === 'error') return new Response('boom', { status: 500 })
    if (scenario === 'hang') {
      return new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))
    }
    const body = JSON.parse(String(init.body))
    const messages = body.messages ?? body.context?.conversation_history ?? []
    const last = (body.messages ?? []).at(-1)
    const toolResult = last?.role === 'tool' ? last.content : undefined
    const wantsTool = scenario === 'tool' && !toolResult
    if (dialect === 'openai') {
      return Response.json({
        choices: [
          {
            message: wantsTool
              ? { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'conformance_echo', arguments: '{"value":"ping"}' } }] }
              : { content: toolResult ? `echo returned ${toolResult}` : 'hello' },
          },
        ],
      })
    }
    void messages
    return Response.json(
      wantsTool ? { tool_calls: [{ id: 'c1', name: 'conformance_echo', arguments: { value: 'ping' } }] } : { response: toolResult ? `echo returned ${toolResult}` : 'hello' },
    )
  }) as typeof fetch
}

transportConformance('http (generic)', { create: (s) => createHttpTransport({ url: '/api', fetch: backend(s, 'generic') }) })
transportConformance('universalLLM', { create: (s) => createUniversalLLMTransport({ url: '/api/llm', fetch: backend(s, 'generic') }) })
transportConformance('openAICompatible', { create: (s) => createOpenAICompatibleTransport({ baseUrl: '/v1', model: 'm', fetch: backend(s, 'openai') }) })
