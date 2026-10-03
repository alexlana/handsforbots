// @vitest-environment jsdom
import { createH4B } from '@handsforbots/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { findModelContext, webmcp, type ModelContext, type ModelContextTool } from '../src/index.js'

/** In-memory stand-in for document.modelContext. */
function fakeModelContext() {
  const tools = new Map<string, ModelContextTool>()
  const mc: ModelContext & { tools: typeof tools; call(name: string, input: object): Promise<string> } = {
    tools,
    registerTool(tool, options) {
      if (tools.has(tool.name)) throw new Error(`duplicate ${tool.name}`)
      tools.set(tool.name, tool)
      options?.signal?.addEventListener('abort', () => tools.delete(tool.name))
    },
    call: (name, input) => tools.get(name)!.execute(input as Record<string, unknown>, {}),
  }
  return mc
}

afterEach(() => {
  delete (document as any).modelContext
  delete (navigator as any).modelContext
})

describe('WebMCP exposure', () => {
  it('exposes only actions meant for agents, with schema and annotations', async () => {
    const mc = fakeModelContext()
    const h4b = await createH4B({
      plugins: [webmcp({ modelContext: mc, prefix: 'shop.' })],
      actions: [
        {
          name: 'search',
          description: 'Search products',
          parameters: { type: 'object', properties: { q: { type: 'string' } } },
          readOnly: true,
          exposeTo: ['assistant', 'agent'],
          handler: ({ q }: { q: string }) => [`${q} 1`],
        },
        { name: 'internal', description: 'Not for agents', handler: () => 1 },
      ],
    }).start()

    expect([...mc.tools.keys()]).toEqual(['shop.search'])
    expect(mc.tools.get('shop.search')).toMatchObject({
      description: 'Search products',
      inputSchema: { properties: { q: { type: 'string' } } },
      annotations: { readOnlyHint: true },
    })
    expect(h4b.get('webmcp')!.getState()).toEqual({ supported: true, tools: ['shop.search'] })
  })

  it("runs agent calls through the kernel and shows them in history as the agent's", async () => {
    const mc = fakeModelContext()
    const h4b = await createH4B({
      plugins: [webmcp({ modelContext: mc })],
      actions: [{ name: 'add_to_cart', description: 'Add', exposeTo: ['agent'], handler: ({ sku }: { sku: string }) => ({ ok: true, sku }) }],
    }).start()

    expect(await mc.call('add_to_cart', { sku: 'A1' })).toBe('{"ok":true,"sku":"A1"}')
    expect(h4b.messages.map((m) => `${m.role}:${m.route}`)).toEqual(['assistant:agent', 'tool:agent'])
    expect(h4b.messages[1]).toMatchObject({ role: 'tool', name: 'add_to_cart', result: { ok: true, sku: 'A1' } })
  })

  it('asks the user before destructive agent actions and reports refusals to the agent', async () => {
    const mc = fakeModelContext()
    const confirm = vi.fn(async () => false)
    const handler = vi.fn()
    const h4b = await createH4B({
      plugins: [webmcp({ modelContext: mc })],
      actions: [{ name: 'delete_account', description: 'Delete', destructive: true, exposeTo: ['agent'], handler }],
    }).start()
    h4b.provide('confirm', confirm)

    await expect(mc.call('delete_account', {})).rejects.toThrow('not confirmed')
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ origin: 'agent', action: 'delete_account' }))
    expect(handler).not.toHaveBeenCalled()
  })

  it('follows actions registered and removed at runtime, and cleans up on dispose', async () => {
    const mc = fakeModelContext()
    const h4b = createH4B()
    const dispose = await h4b.use(webmcp({ modelContext: mc, include: 'all' }))
    const remove = h4b.actions.register({ name: 'later', description: 'Later', handler: () => 1 })
    h4b.actions.register({ name: 'hidden', description: 'Hidden', exposeTo: ['user'], handler: () => 1 })
    expect([...mc.tools.keys()]).toEqual(['later'])
    remove()
    expect(mc.tools.size).toBe(0)
    h4b.actions.register({ name: 'again', description: 'Again', handler: () => 1 })
    await dispose()
    expect(mc.tools.size).toBe(0)
  })

  it('finds the API on document first, then on navigator (deprecated), and is a no-op without it', async () => {
    expect(findModelContext()).toBeUndefined()
    const legacy = fakeModelContext()
    ;(navigator as any).modelContext = legacy
    expect(findModelContext()).toBe(legacy)
    const current = fakeModelContext()
    ;(document as any).modelContext = current
    expect(findModelContext()).toBe(current)

    delete (document as any).modelContext
    delete (navigator as any).modelContext
    const h4b = await createH4B({ plugins: [webmcp()] }).start()
    expect(h4b.get('webmcp')!.getState()).toEqual({ supported: false, tools: [] })
  })
})
