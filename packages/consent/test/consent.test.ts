// @vitest-environment jsdom
import { createH4B, definePlugin, type Message, type SessionSnapshot, type Transport } from '@handsforbots/core'
import { describe, expect, it } from 'vitest'
import {
  ccpa,
  gdpr,
  lgpd,
  loadConsentRules,
  optIn,
  presets,
  redact,
  redactMessages,
  redactText,
  regionFromMeta,
  regionFromUrl,
} from '../src/index.js'

const echo: Transport = {
  name: 'echo',
  async *run() {
    yield { type: 'message.delta', messageId: `m${Math.random()}`, delta: 'ok' }
  },
}

const file = async (name: string) => (await import(`../rules/${name}.json`)).default

describe('presets', () => {
  it('ship as JSON files identical to the exported rule sets', async () => {
    expect(await file('lgpd')).toEqual(lgpd)
    expect(await file('gdpr')).toEqual(gdpr)
    expect(await file('ccpa')).toEqual(ccpa)
    expect(await file('opt-in')).toEqual(optIn)
  })

  it('switch by region: opt-in in Brazil and Europe, opt-out in California, opt-in elsewhere', async () => {
    const states = async (region: string) => {
      const h4b = createH4B({ consent: { rules: presets, region, channel: false } })
      await h4b.start()
      return [h4b.consent.rules?.id, h4b.consent.state('persistence')]
    }
    expect(await states('BR')).toEqual(['lgpd', 'pending'])
    expect(await states('DE')).toEqual(['gdpr', 'pending'])
    expect(await states('US-CA')).toEqual(['ccpa', 'granted'])
    expect(await states('JP')).toEqual(['opt-in', 'pending'])
  })
})

describe('loading rules', () => {
  const serve = (body: string, status = 200) =>
    (async () => new Response(body, { status })) as unknown as typeof globalThis.fetch

  it('loads and validates JSON, one set or a list', async () => {
    expect(await loadConsentRules('/r.json', { fetch: serve(JSON.stringify(lgpd)) })).toEqual([lgpd])
    expect(await loadConsentRules('/r.json', { fetch: serve(JSON.stringify([lgpd, optIn])) })).toHaveLength(2)
    await expect(loadConsentRules('/r.json', { fetch: serve('{"id":"x"}') })).rejects.toThrow(/purposes/)
    await expect(loadConsentRules('/r.json', { fetch: serve('', 404) })).rejects.toThrow(/404/)
  })

  it('takes any parser, e.g. for YAML', async () => {
    const yaml = 'id: mine\npurposes:\n  persistence:\n    default: granted\n'
    // A stand-in for YAML.parse from the `yaml` package.
    const parse = (text: string) => {
      expect(text).toBe(yaml)
      return { id: 'mine', purposes: { persistence: { default: 'granted' } } }
    }
    const [rules] = await loadConsentRules('/r.yml', { fetch: serve(yaml), parse })
    expect(rules!.id).toBe('mine')
  })
})

describe('region', () => {
  it('reads a meta tag written by the server', () => {
    document.head.innerHTML = '<meta name="h4b-region" content=" BR ">'
    expect(regionFromMeta()).toBe('BR')
    expect(regionFromMeta('other')).toBeUndefined()
  })

  it('asks an endpoint, as text or JSON, and gives up quietly', async () => {
    const answer = (body: string, status = 200) =>
      (async () => new Response(body, { status })) as unknown as typeof globalThis.fetch
    expect(await regionFromUrl('/geo', { fetch: answer('US-CA\n') })()).toBe('US-CA')
    expect(await regionFromUrl('/geo', { fetch: answer('{"region":"BR"}') })()).toBe('BR')
    expect(await regionFromUrl('/geo', { fetch: answer('', 500) })()).toBeUndefined()
    const broken = (async () => {
      throw new Error('offline')
    }) as unknown as typeof globalThis.fetch
    expect(await regionFromUrl('/geo', { fetch: broken })()).toBeUndefined()
  })
})

describe('redaction', () => {
  it('replaces contacts and documents', () => {
    const text =
      'Meu email é ana.souza@exemplo.com.br, fone +55 (11) 98765-4321, CPF 123.456.789-09, CNPJ 12.345.678/0001-90 e cartão 4111 1111 1111 1111.'
    expect(redactText(text)).toBe('Meu email é [email], fone [phone], CPF [cpf], CNPJ [cnpj] e cartão [card].')
    expect(redactText('ligue 3333-4444 ou 12345678901')).toBe('ligue [phone] ou [cpf]')
    expect(redactText('pedido 2024 de 3 itens às 10:30')).toBe('pedido 2024 de 3 itens às 10:30')
    expect(redactText('a@b.co', { replace: () => '•••' })).toBe('•••')
    expect(redactText('matrícula AB-1234', { patterns: [], custom: { id: /AB-\d{4}/g } })).toBe('matrícula [id]')
  })

  it('anonymizes text, data, action arguments and results, and media, without touching the originals', () => {
    const messages: Message[] = [
      {
        id: 'u',
        role: 'user',
        modality: 'text',
        source: 'widget',
        createdAt: 1,
        parts: [
          { type: 'text', text: 'sou ana@x.com' },
          { type: 'file', mimeType: 'application/pdf', name: 'rg.pdf', source: { kind: 'url', url: 'https://x/rg.pdf' } },
        ],
      },
      { id: 'a', role: 'assistant', createdAt: 2, parts: [], toolCalls: [{ id: 'c', name: 'find', args: { email: 'ana@x.com' } }] },
      { id: 't', role: 'tool', createdAt: 3, toolCallId: 'c', name: 'find', result: { phone: '(11) 3333-4444' } },
    ]
    const copy = structuredClone(messages)
    const out = redactMessages(messages)
    expect(messages).toEqual(copy)
    expect(out[0]).toMatchObject({
      parts: [
        { type: 'text', text: 'sou [email]' },
        { type: 'data', name: 'redacted_media', value: { type: 'file', mimeType: 'application/pdf', name: 'rg.pdf' } },
      ],
    })
    expect(out[1]).toMatchObject({ toolCalls: [{ args: { email: '[email]' } }] })
    expect(out[2]).toMatchObject({ result: { phone: '[phone]' } })
    expect(redactMessages(messages, { media: 'keep' })[0]).toMatchObject({ parts: [{}, { type: 'file' }] })
  })

  it('as a plugin, anonymizes what is stored while the purpose is granted, never what is on screen', async () => {
    const saved: SessionSnapshot[] = []
    const store = definePlugin({
      name: 'store',
      provides: ['storage'],
      apply(ctx) {
        ctx.provide('storage', { load: () => null, save: (s) => void saved.push(s), clear() {} })
      },
    })
    const h4b = createH4B({
      consent: { channel: false, initial: { persistence: true, review: false } },
      plugins: [store(), redact({ when: 'review' })],
    })
    h4b.provide('transport', echo)
    await h4b.start()
    await h4b.ask('meu email é ana@x.com')
    await h4b.persist()
    expect(JSON.stringify(saved.at(-1))).toContain('ana@x.com')
    await h4b.consent.set({ review: true })
    await h4b.persist()
    expect(JSON.stringify(saved.at(-1))).not.toContain('ana@x.com')
    expect(JSON.stringify(saved.at(-1))).toContain('[email]')
    expect(JSON.stringify(h4b.messages)).toContain('ana@x.com')
  })
})
