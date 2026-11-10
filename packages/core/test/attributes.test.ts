import { describe, expect, it } from 'vitest'
import {
  createH4B,
  definePlugin,
  mergeAttributes,
  pickVariant,
  type SessionSnapshot,
} from '../src/index.js'

/** In-memory storage that outlives an H4B instance, like a browser would. */
function memoryStorage() {
  const box: { saved: SessionSnapshot | null; saves: number } = { saved: null, saves: 0 }
  const plugin = definePlugin({
    name: 'memory-storage',
    provides: ['storage'],
    apply(ctx) {
      ctx.provide('storage', {
        load: () => (box.saved ? structuredClone(box.saved) : null),
        save: (snapshot) => {
          box.saves++
          box.saved = structuredClone(snapshot)
        },
        clear: () => {
          box.saved = null
        },
      })
    },
  })
  return { box, plugin: plugin() }
}

describe('mergeAttributes', () => {
  it('merges, removes with null and leaves out invalid keys and values', () => {
    const { attributes, rejected } = mergeAttributes(
      { 'greeting.kind': 'open', old: 1 },
      {
        'greeting.kind': 'directed',
        'greeting.index': 3,
        ok: true,
        old: null,
        'Bad Key': 'x',
        sentence: 'hello there',
        long: 'x'.repeat(65),
        nan: Number.NaN,
        object: {} as never,
      },
    )
    expect(attributes).toEqual({ 'greeting.kind': 'directed', 'greeting.index': 3, ok: true })
    expect(rejected.sort()).toEqual(['Bad Key', 'long', 'nan', 'object', 'sentence'])
    expect(Object.isFrozen(attributes)).toBe(true)
  })

  it('caps the number of attributes at 16', () => {
    const many = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, i]))
    const { attributes, rejected } = mergeAttributes({}, many)
    expect(Object.keys(attributes)).toHaveLength(16)
    expect(rejected).toEqual(['k16', 'k17', 'k18', 'k19'])
    // Replacing an existing key still works when full.
    expect(mergeAttributes(attributes, { k0: 'x' }).attributes.k0).toBe('x')
  })
})

describe('pickVariant', () => {
  it('draws an index and avoids the previous one when there is another', () => {
    expect(pickVariant([], 0)).toBeUndefined()
    expect(pickVariant(['a'], 0)).toEqual({ variant: 'a', index: 0 })
    expect(pickVariant(['a', 'b', 'c'], undefined, () => 0.99)).toEqual({ variant: 'c', index: 2 })
    // Previous 0: draws among 1 and 2.
    expect(pickVariant(['a', 'b', 'c'], 0, () => 0)).toEqual({ variant: 'b', index: 1 })
    expect(pickVariant(['a', 'b', 'c'], 1, () => 0.6)).toEqual({ variant: 'c', index: 2 })
    // An out-of-range previous is ignored.
    expect(pickVariant(['a', 'b'], 7, () => 0)).toEqual({ variant: 'a', index: 0 })
  })
})

describe('conversation attributes', () => {
  it('sets, emits, saves and comes back with a restored conversation', async () => {
    const { box, plugin } = memoryStorage()
    const h4b = await createH4B({ plugins: [plugin] }).start()
    const events: unknown[] = []
    h4b.on('conversation.attributes', (event) => events.push(event))
    h4b.setConversationAttributes({ 'greeting.kind': 'directed', 'greeting.index': 3 })
    expect(h4b.conversation.attributes).toEqual({ 'greeting.kind': 'directed', 'greeting.index': 3 })
    expect(events).toEqual([{ attributes: { 'greeting.kind': 'directed', 'greeting.index': 3 }, reason: 'set' }])
    await h4b.persist()
    expect(box.saved?.attributes).toEqual({ 'greeting.kind': 'directed', 'greeting.index': 3 })

    // A second instance reading what the first saved.
    const restored: unknown[] = []
    const second = await createH4B({ plugins: [definePlugin({ name: 's', provides: ['storage'], apply: (ctx) => ctx.provide('storage', { load: () => box.saved, save: () => {}, clear: () => {} }) })()] })
    second.on('conversation.attributes', (event) => restored.push(event))
    await second.start()
    expect(second.conversation.attributes).toEqual({ 'greeting.kind': 'directed', 'greeting.index': 3 })
    expect(restored).toEqual([{ attributes: { 'greeting.kind': 'directed', 'greeting.index': 3 }, reason: 'restored' }])
  })

  it('a new conversation clears them', async () => {
    const h4b = await createH4B().start()
    h4b.setConversationAttributes({ 'greeting.index': 1 })
    const events: unknown[] = []
    h4b.on('conversation.attributes', (event) => events.push(event))
    await h4b.reset()
    expect(h4b.conversation.attributes).toEqual({})
    expect(h4b.conversation.snapshot().attributes).toBeUndefined()
    expect(events).toEqual([{ attributes: {}, reason: 'reset' }])
  })

  it('reports invalid attributes as an error and keeps the valid ones', async () => {
    const errors: { source: string }[] = []
    const h4b = await createH4B({ onError: () => {} }).start()
    h4b.on('error', (e) => errors.push(e))
    h4b.setConversationAttributes({ ok: 'yes', text: 'what the visitor typed' })
    expect(h4b.conversation.attributes).toEqual({ ok: 'yes' })
    expect(errors.map((e) => e.source)).toEqual(['conversation.attributes'])
  })

  it('does not emit or save when nothing changed', async () => {
    const { box, plugin } = memoryStorage()
    const h4b = await createH4B({ plugins: [plugin] }).start()
    h4b.setConversationAttributes({ a: 1 })
    await h4b.persist()
    const saves = box.saves
    let events = 0
    h4b.on('conversation.attributes', () => events++)
    h4b.setConversationAttributes({ a: 1 })
    await h4b.persist()
    expect(events).toBe(0)
    expect(box.saves).toBe(saves + 1) // only the explicit persist
  })

  it('drops invalid attributes found in storage', async () => {
    const stored: SessionSnapshot = { threadId: 't', messages: [], attributes: { ok: 1, bad: 'two words' } as never }
    const h4b = await createH4B({
      plugins: [definePlugin({ name: 's', provides: ['storage'], apply: (ctx) => ctx.provide('storage', { load: () => stored, save: () => {}, clear: () => {} }) })()],
    }).start()
    expect(h4b.conversation.attributes).toEqual({ ok: 1 })
  })
})

describe('exposures', () => {
  it('keeps exposures in memory for the conversation on screen and emits them', async () => {
    const { box, plugin } = memoryStorage()
    const h4b = await createH4B({ plugins: [plugin] }).start()
    const seen: unknown[] = []
    h4b.on('experiment.exposed', (exposure) => seen.push(exposure))
    h4b.setConversationAttributes({ 'greeting.kind': 'open' })
    const exposure = h4b.expose('greeting')
    expect(exposure).toMatchObject({ experiment: 'greeting', attributes: { 'greeting.kind': 'open' }, threadId: h4b.conversation.threadId })
    expect(h4b.exposures).toEqual([exposure])
    expect(seen).toEqual([exposure])
    await h4b.persist()
    expect(JSON.stringify(box.saved)).not.toContain('experiment')

    // Explicit attributes win over the conversation's.
    expect(h4b.expose('nudge', { 'nudge.variant': 'b' })?.attributes).toEqual({ 'nudge.variant': 'b' })
    await h4b.reset()
    expect(h4b.exposures).toEqual([])
  })

  it('a restored conversation has no exposures', async () => {
    const stored: SessionSnapshot = { threadId: 't', messages: [], attributes: { a: 1 } }
    const h4b = await createH4B({
      plugins: [definePlugin({ name: 's', provides: ['storage'], apply: (ctx) => ctx.provide('storage', { load: () => stored, save: () => {}, clear: () => {} }) })()],
    }).start()
    expect(h4b.exposures).toEqual([])
  })

  it('rejects an invalid experiment name', async () => {
    const errors: string[] = []
    const h4b = await createH4B({ onError: () => {} }).start()
    h4b.on('error', (e) => errors.push(e.source))
    expect(h4b.expose('Not valid')).toBeUndefined()
    expect(h4b.exposures).toEqual([])
    expect(errors).toEqual(['experiment'])
  })
})
