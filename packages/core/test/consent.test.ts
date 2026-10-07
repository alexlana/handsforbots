import { describe, expect, it } from 'vitest'
import {
  createH4B,
  definePlugin,
  parseConsentRules,
  selectConsentRules,
  withConsent,
  type ConsentOptions,
  type ConsentRules,
  type SessionSnapshot,
  type Transport,
} from '../src/index.js'

const echo: Transport = {
  name: 'echo',
  async *run() {
    yield { type: 'message.delta', messageId: `m${Math.random()}`, delta: 'ok' }
  },
}

/** An in-memory storage that survives across H4B instances, like a browser would. */
function memoryStore() {
  const store = {
    saved: null as SessionSnapshot | null,
    saves: 0,
    clears: 0,
    revoked: 0,
    plugin: definePlugin({
      name: 'fake-storage',
      provides: ['storage'],
      consent: 'persistence',
      apply(ctx) {
        ctx.provide('storage', {
          load: () => store.saved,
          save: (snapshot) => {
            store.saves++
            store.saved = snapshot
          },
          clear: () => {
            store.clears++
            store.saved = null
          },
        })
        ctx.onRevoke(() => {
          store.revoked++
        })
      },
    }),
  }
  return store
}

const rules = (purposes: ConsentRules['purposes'], regions?: string[], id = 'test'): ConsentRules => ({
  id,
  ...(regions ? { regions } : {}),
  purposes,
})

async function bot(store: ReturnType<typeof memoryStore>, consent?: ConsentOptions) {
  const h4b = createH4B({
    plugins: [store.plugin()],
    ...(consent ? { consent: { channel: false as const, ...consent } } : {}),
  })
  h4b.provide('transport', echo)
  return h4b.start()
}

async function eventually(check: () => boolean, timeout = 2000) {
  const deadline = Date.now() + timeout
  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition not met in time')
    await new Promise((r) => setTimeout(r, 5))
  }
}

const mounted = (h4b: ReturnType<typeof createH4B>) => h4b.get('storage') !== undefined

describe('consent', () => {
  it('changes nothing without the consent option', async () => {
    const store = memoryStore()
    const h4b = await bot(store)
    expect(h4b.consent.enabled).toBe(false)
    expect(h4b.consent.granted('persistence')).toBe(true)
    await h4b.ask('oi')
    expect(store.saved?.messages).toHaveLength(2)
  })

  it('keeps a gated storage unmounted while pending: the conversation lives only in memory', async () => {
    const store = memoryStore()
    const h4b = await bot(store, {})
    expect(h4b.consent.state('persistence')).toBe('pending')
    expect(mounted(h4b)).toBe(false)
    await h4b.ask('oi')
    expect(h4b.messages).toHaveLength(2)
    expect(store.saves).toBe(0)
  })

  it('mounts the storage when granted and saves what was already said', async () => {
    const store = memoryStore()
    const h4b = await bot(store, {})
    await h4b.ask('antes do consentimento')
    await h4b.consent.set({ persistence: true })
    expect(mounted(h4b)).toBe(true)
    expect(store.saved?.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    await h4b.ask('depois')
    expect(store.saved?.messages).toHaveLength(4)
  })

  it('restores a stored conversation when granted before anything was typed', async () => {
    const store = memoryStore()
    const first = await bot(store, { initial: { persistence: 'granted' } })
    await first.ask('guardada')
    const second = await bot(store, {})
    expect(second.messages).toHaveLength(0)
    await second.consent.set({ persistence: 'granted' })
    expect(second.conversation.threadId).toBe(first.conversation.threadId)
    expect(second.messages).toHaveLength(2)
  })

  it('on revoke, erases the storage but keeps the conversation in memory', async () => {
    const store = memoryStore()
    const h4b = await bot(store, { initial: { persistence: true } })
    await h4b.ask('oi')
    expect(store.saved).not.toBeNull()
    const events: string[] = []
    h4b.on('consent.changed', (s) => void events.push(s.states.persistence!))
    await h4b.consent.set({ persistence: false })
    expect(events).toEqual(['denied'])
    expect(mounted(h4b)).toBe(false)
    expect(store.saved).toBeNull()
    expect(store.revoked).toBe(1)
    expect(h4b.messages).toHaveLength(2)
    await h4b.ask('continua aqui')
    expect(h4b.messages).toHaveLength(4)
    expect(store.saved).toBeNull()
  })

  it('erases leftovers of an earlier visit when the purpose is denied', async () => {
    const store = memoryStore()
    const first = await bot(store, { initial: { persistence: true } })
    await first.ask('de outra visita')
    const second = await bot(store, { initial: { persistence: 'denied' } })
    expect(store.saved).toBeNull()
    expect(mounted(second)).toBe(false)
    expect(second.messages).toHaveLength(0)
  })

  it('keeps what was stored when the rules say eraseOnRevoke: false', async () => {
    const store = memoryStore()
    const h4b = await bot(store, {
      rules: rules({ persistence: { default: 'granted', eraseOnRevoke: false } }),
    })
    await h4b.ask('oi')
    await h4b.consent.set({ persistence: false })
    expect(mounted(h4b)).toBe(false)
    expect(store.saved?.messages).toHaveLength(2)
    expect(store.revoked).toBe(0)
  })

  it('takes defaults from the rule set for the region, and decisions win', async () => {
    const store = memoryStore()
    const optOut = rules({ persistence: { default: 'granted' } }, ['US-CA'], 'opt-out')
    const optIn = rules({ persistence: { default: 'pending' } }, ['*'], 'opt-in')
    const h4b = await bot(store, { rules: [optIn, optOut], region: 'us-ca' })
    expect(h4b.consent.rules?.id).toBe('opt-out')
    expect(mounted(h4b)).toBe(true)
    await h4b.consent.setRegion('BR')
    expect(h4b.consent.rules?.id).toBe('opt-in')
    expect(mounted(h4b)).toBe(false)
    await h4b.consent.set({ persistence: true })
    await h4b.consent.setRegion('US-NY')
    expect(h4b.consent.state('persistence')).toBe('granted')
    expect(h4b.consent.snapshot()).toEqual({
      enabled: true,
      region: 'US-NY',
      rules: 'opt-in',
      states: { persistence: 'granted' },
    })
  })

  it('stays pending until an async region resolves', async () => {
    const store = memoryStore()
    let resolve!: (region: string) => void
    const region = new Promise<string>((r) => (resolve = r))
    const h4b = await bot(store, { rules: rules({ persistence: { default: 'granted' } }, ['US']), region: () => region })
    expect(h4b.consent.state('persistence')).toBe('pending')
    expect(mounted(h4b)).toBe(false)
    resolve('US-CA')
    await h4b.consent.ready()
    expect(h4b.consent.region).toBe('US-CA')
    expect(mounted(h4b)).toBe(true)
  })

  it('treats a failing region lookup as unknown: only * rule sets apply', async () => {
    const store = memoryStore()
    const h4b = await bot(store, {
      rules: [rules({ persistence: { default: 'granted' } }, ['BR'])],
      region: () => Promise.reject(new Error('offline')),
    })
    await h4b.consent.ready()
    expect(h4b.consent.rules).toBeUndefined()
    expect(h4b.consent.state('persistence')).toBe('pending')
  })

  it('lets hosts gate any plugin, or ungate one, with withConsent', async () => {
    const mountedNames: string[] = []
    const probe = definePlugin({ name: 'probe', apply: () => void mountedNames.push('probe') })
    const store = memoryStore()
    const h4b = createH4B({
      consent: { channel: false },
      plugins: [withConsent(probe(), 'analytics'), withConsent(store.plugin(), false)],
    })
    h4b.provide('transport', echo)
    await h4b.start()
    expect(mountedNames).toEqual([])
    expect(mounted(h4b)).toBe(true)
    await h4b.consent.set({ analytics: 'granted' })
    expect(mountedNames).toEqual(['probe'])
  })

  it('gates plugins added at runtime with use()', async () => {
    const store = memoryStore()
    const h4b = createH4B({ consent: { channel: false } })
    h4b.provide('transport', echo)
    await h4b.start()
    const dispose = await h4b.use(store.plugin())
    expect(mounted(h4b)).toBe(false)
    await h4b.consent.set({ persistence: true })
    expect(mounted(h4b)).toBe(true)
    await dispose()
    expect(mounted(h4b)).toBe(false)
    await h4b.consent.set({ persistence: false })
    await h4b.consent.set({ persistence: true })
    expect(mounted(h4b)).toBe(false)
  })

  it('carries decisions to the other tabs', async () => {
    const channel = `test-${Math.random()}`
    const storeA = memoryStore()
    const storeB = memoryStore()
    const a = createH4B({ consent: { channel }, plugins: [storeA.plugin()] })
    const b = createH4B({ consent: { channel }, plugins: [storeB.plugin()] })
    await Promise.all([a.start(), b.start()])
    await a.consent.set({ persistence: true })
    await eventually(() => b.consent.granted('persistence') && mounted(b))
    await b.consent.set({ persistence: false })
    await eventually(() => !mounted(a))
    await Promise.all([a.stop(), b.stop()])
  })
})

describe('storage.before', () => {
  it('changes what is saved, not what is on screen, and null skips the save', async () => {
    const store = memoryStore()
    const h4b = await bot(store)
    let skip = false
    h4b.intercept('storage.before', (snapshot) =>
      skip ? null : { ...snapshot, messages: snapshot.messages.filter((m) => m.role !== 'user') },
    )
    await h4b.ask('meu segredo')
    await h4b.persist() // saves run one at a time: this waits for the turn's own save
    expect(store.saved?.messages.map((m) => m.role)).toEqual(['assistant'])
    expect(h4b.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    skip = true
    const saves = store.saves
    await h4b.ask('de novo')
    await h4b.persist()
    expect(store.saves).toBe(saves)
  })
})

describe('consent rules', () => {
  it('validates rule sets read from JSON or YAML', () => {
    const ok = { id: 'x', regions: ['BR'], purposes: { persistence: { default: 'pending', label: { en: 'Keep' } } } }
    expect(parseConsentRules(ok)).toBe(ok)
    expect(() => parseConsentRules({ purposes: {} })).toThrow(/id/)
    expect(() => parseConsentRules({ id: 'x', purposes: { p: { default: 'yes' } } })).toThrow(/purposes\.p\.default/)
    expect(() => parseConsentRules({ id: 'x', regions: 'BR', purposes: {} })).toThrow(/regions/)
    expect(() => parseConsentRules({ id: 'x', purposes: { p: { default: 'granted', label: 3 } } })).toThrow(/label/)
    expect(() => createH4B({ consent: { rules: { id: 'x' } as never } })).toThrow(/purposes/)
  })

  it('picks the most specific rule set for a region', () => {
    const any = rules({}, ['*'], 'any')
    const us = rules({}, ['US'], 'us')
    const ca = rules({}, ['US-CA'], 'ca')
    const all = [any, us, ca]
    expect(selectConsentRules(all, 'US-CA')?.id).toBe('ca')
    expect(selectConsentRules(all, 'US-TX')?.id).toBe('us')
    expect(selectConsentRules(all, 'BR')?.id).toBe('any')
    expect(selectConsentRules(all, undefined)?.id).toBe('any')
    expect(selectConsentRules([us], 'BR')).toBeUndefined()
  })
})
