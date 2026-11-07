import { describe, expect, it } from 'vitest'
import {
  citationSegments,
  citedSources,
  createH4B,
  inlineCitations,
  safeSourceUrl,
  sourcesOf,
  sourceView,
  stripInlineCitations,
  textOf,
  utf8OffsetToIndex,
  type AssistantMessage,
  type SourcePart,
  type Stimulus,
  type TextPart,
  type Transport,
} from '../src/index.js'

const transportOf = (stimuli: Stimulus[]): Transport => ({
  name: 'scripted',
  async *run() {
    yield* stimuli
  },
})

async function answer(stimuli: Stimulus[]) {
  const errors: Array<{ source: string }> = []
  const h4b = createH4B({ onError: () => {} })
  h4b.on('error', (e) => errors.push(e))
  await h4b.start()
  h4b.provide('transport', transportOf(stimuli))
  const result = await h4b.ask('hi')
  const message = result.messages.find((m) => m.role === 'assistant') as AssistantMessage
  return { message, errors, h4b }
}

const source = (id: string, extra: Partial<SourcePart> = {}): SourcePart => ({ type: 'source', id, title: `Title ${id}`, ...extra })

describe('sources in the kernel', () => {
  it('keeps sources that arrive before the text without splitting it', async () => {
    const { message } = await answer([
      { type: 'message.start', messageId: 'm' },
      { type: 'message.part', messageId: 'm', part: source('c1') },
      { type: 'message.delta', messageId: 'm', delta: 'Autotrac ' },
      { type: 'message.part', messageId: 'm', part: source('c2') },
      { type: 'message.delta', messageId: 'm', delta: 'tracks trucks.' },
      { type: 'message.end', messageId: 'm' },
    ])
    expect(message.parts.map((p) => p.type)).toEqual(['source', 'text', 'source'])
    expect(textOf(message)).toBe('Autotrac tracks trucks.')
    expect(sourcesOf(message).map((s) => s.id)).toEqual(['c1', 'c2'])
  })

  it('replaces a source with the same id in place', async () => {
    const { message } = await answer([
      { type: 'message.part', messageId: 'm', part: source('c1') },
      { type: 'message.part', messageId: 'm', part: source('c2') },
      { type: 'message.part', messageId: 'm', part: source('c1', { title: 'Updated', url: 'https://example.com/a#b' }) },
      { type: 'message.delta', messageId: 'm', delta: 'Text.' },
    ])
    expect(sourcesOf(message)).toEqual([source('c1', { title: 'Updated', url: 'https://example.com/a#b' }), source('c2')])
  })

  it('attaches citations to the last text part, also after the text ended', async () => {
    const { message } = await answer([
      { type: 'message.part', messageId: 'm', part: source('c1') },
      { type: 'message.delta', messageId: 'm', delta: 'Autotrac tracks trucks.' },
      { type: 'message.end', messageId: 'm' },
      { type: 'message.citations', messageId: 'm', citations: [{ start: 0, end: 22, sourceIds: ['c1'] }] },
    ])
    const text = message.parts.find((p) => p.type === 'text') as TextPart
    expect(text.citations).toEqual([{ start: 0, end: 22, sourceIds: ['c1'] }])
    expect(citedSources(message)).toEqual(new Map([['c1', 1]]))
  })

  it('drops malformed citations and reports them', async () => {
    const { message, errors } = await answer([
      { type: 'message.delta', messageId: 'm', delta: 'Text.' },
      {
        type: 'message.citations',
        messageId: 'm',
        citations: [
          { start: 3, end: 1, sourceIds: ['c1'] },
          { start: 0, end: 4, sourceIds: [] },
          { start: 0, end: 4, sourceIds: ['c1'] },
        ],
      },
    ])
    expect((message.parts[0] as TextPart).citations).toEqual([{ start: 0, end: 4, sourceIds: ['c1'] }])
    expect(errors.map((e) => e.source)).toContain('message.citations')
  })

  it('reports citations that have no text to point into', async () => {
    const { message, errors } = await answer([
      { type: 'message.part', messageId: 'm', part: source('c1') },
      { type: 'message.citations', messageId: 'm', citations: [{ start: 0, end: 0, sourceIds: ['c1'] }] },
    ])
    expect(message.parts).toEqual([source('c1')])
    expect(errors.map((e) => e.source)).toEqual(['message.citations'])
  })

  it('cuts citations past the point kept by an interruption', async () => {
    const h4b = createH4B({ onError: () => {} })
    await h4b.start()
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    h4b.provide('transport', {
      name: 'slow',
      async *run() {
        yield { type: 'message.part', messageId: 'm', part: source('c1') }
        yield { type: 'message.part', messageId: 'm', part: source('c2') }
        yield { type: 'message.delta', messageId: 'm', delta: 'First part. Second part.' }
        yield {
          type: 'message.citations',
          messageId: 'm',
          citations: [
            { start: 0, end: 11, sourceIds: ['c1'] },
            { start: 12, end: 24, sourceIds: ['c2'] },
          ],
        }
        await gate
      },
    })
    h4b.intercept('interrupt.before', (point) => (point ? { ...point, keep: 11 } : point))
    const pending = h4b.ask('hi')
    while (!h4b.messages.some((m) => m.role === 'assistant' && textOf(m).length === 24)) await new Promise((r) => setTimeout(r, 2))
    while (!h4b.messages.some((m) => m.role === 'assistant' && (m.parts.find((p) => p.type === 'text') as TextPart | undefined)?.citations)) {
      await new Promise((r) => setTimeout(r, 2))
    }
    await h4b.interrupt()
    release()
    await pending
    const message = h4b.messages.find((m) => m.role === 'assistant') as AssistantMessage
    expect(textOf(message)).toBe('First part.')
    expect((message.parts.find((p) => p.type === 'text') as TextPart).citations).toEqual([{ start: 0, end: 11, sourceIds: ['c1'] }])
    expect(sourcesOf(message)).toHaveLength(2)
  })
})

describe('citationSegments', () => {
  const part = (text: string, citations: TextPart['citations']): TextPart => ({ type: 'text', text, citations })

  it('places a reference where each citation ends and marks the covered text', () => {
    expect(citationSegments(part('Autotrac tracks trucks. More.', [{ start: 0, end: 23, sourceIds: ['c1'] }]))).toEqual([
      { kind: 'text', text: 'Autotrac tracks trucks.', sourceIds: ['c1'] },
      { kind: 'ref', sourceIds: ['c1'] },
      { kind: 'text', text: ' More.', sourceIds: [] },
    ])
  })

  it('joins references that end at the same point and keeps point citations', () => {
    expect(
      citationSegments(
        part('A. B.', [
          { start: 2, end: 2, sourceIds: ['c1'] },
          { start: 0, end: 2, sourceIds: ['c2'] },
          { start: 5, end: 5, sourceIds: ['c3'] },
        ]),
      ),
    ).toEqual([
      { kind: 'text', text: 'A.', sourceIds: ['c2'] },
      { kind: 'ref', sourceIds: ['c2', 'c1'] },
      { kind: 'text', text: ' B.', sourceIds: [] },
      { kind: 'ref', sourceIds: ['c3'] },
    ])
  })

  it('ignores unknown ids and citations outside the text', () => {
    expect(
      citationSegments(
        part('Short.', [
          { start: 0, end: 6, sourceIds: ['ghost'] },
          { start: 0, end: 60, sourceIds: ['c1'] },
          { start: 0, end: 6, sourceIds: ['c1', 'ghost'] },
        ]),
        ['c1'],
      ),
    ).toEqual([
      { kind: 'text', text: 'Short.', sourceIds: ['c1'] },
      { kind: 'ref', sourceIds: ['c1'] },
    ])
  })

  it('numbers cited sources by where they are first cited', () => {
    const parts = [
      source('a'),
      source('b'),
      source('c'),
      part('One. Two.', [
        { start: 5, end: 9, sourceIds: ['b', 'ghost'] },
        { start: 0, end: 4, sourceIds: ['c'] },
        { start: 5, end: 9, sourceIds: ['c'] },
      ]),
    ]
    expect([...citedSources(parts)]).toEqual([
      ['c', 1],
      ['b', 2],
    ])
  })
})

describe('sourceView', () => {
  it('splits a message into text with references, cited and consulted sources', () => {
    const view = sourceView([
      source('a'),
      source('b'),
      { type: 'text', text: 'One.', citations: [{ start: 0, end: 4, sourceIds: ['b'] }] },
      { type: 'data', name: 'ui', value: {} },
      { type: 'text', text: ' Two.' },
    ])
    expect(view).toEqual({
      segments: [
        { kind: 'text', text: 'One.', sourceIds: ['b'] },
        { kind: 'ref', sourceIds: ['b'] },
        { kind: 'text', text: ' Two.', sourceIds: [] },
      ],
      cited: [{ ...source('b'), number: 1 }],
      consulted: [source('a')],
    })
  })
})

describe('safeSourceUrl', () => {
  it('accepts absolute http(s) URLs and anchors', () => {
    expect(safeSourceUrl('https://example.com/cases/autotrac#cap-1')).toBe('https://example.com/cases/autotrac#cap-1')
    expect(safeSourceUrl(' http://example.com ')).toBe('http://example.com/')
    expect(safeSourceUrl('#cap-1')).toBe('#cap-1')
  })

  it('refuses relative paths, other schemes and credentials', () => {
    for (const url of [
      '/cases/autotrac',
      './a',
      'cases/a',
      '//evil.com/a',
      'javascript:alert(1)',
      'data:text/html,x',
      'mailto:a@b.c',
      'https://user:pass@example.com/',
      '#',
      '# a',
      '',
      undefined,
    ]) {
      expect(safeSourceUrl(url), String(url)).toBeUndefined()
    }
  })

  it('limits hosts when asked', () => {
    const hosts = ['example.com', '*.docs.example.com']
    expect(safeSourceUrl('https://example.com/a', { hosts })).toBe('https://example.com/a')
    expect(safeSourceUrl('https://a.docs.example.com/a', { hosts })).toBe('https://a.docs.example.com/a')
    expect(safeSourceUrl('https://docs.example.com/a', { hosts })).toBeUndefined()
    expect(safeSourceUrl('https://example.com.evil.net/a', { hosts })).toBeUndefined()
    expect(safeSourceUrl('#anchor', { hosts })).toBe('#anchor')
  })
})

describe('inline markers', () => {
  it('removes markers and the space before them', () => {
    expect(stripInlineCitations('Autotrac tracks trucks [c3]. It also [c1][c2] routes.')).toEqual({
      text: 'Autotrac tracks trucks. It also routes.',
      citations: [
        { start: 22, end: 22, sourceIds: ['c3'] },
        { start: 31, end: 31, sourceIds: ['c1', 'c2'] },
      ],
    })
  })

  it('leaves Markdown links, unknown ids and plain brackets as text', () => {
    const text = 'See [the docs](https://example.com) [x] and [c9], not [c1].'
    expect(stripInlineCitations(text, { known: ['c1'] })).toEqual({
      text: 'See [the docs](https://example.com) [x] and [c9], not.',
      citations: [{ start: 53, end: 53, sourceIds: ['c1'] }],
    })
  })

  it('holds a marker split across deltas until it closes', () => {
    const stream = inlineCitations({ known: ['c3'] })
    const chunks = ['Autotrac tracks', ' trucks [', 'c', '3] and more [', 'nope] end']
    const out = chunks.map((d) => stream.push(d))
    out.push(stream.end())
    const text = out.map((o) => o.text).join('')
    expect(text).toBe('Autotrac tracks trucks and more [nope] end')
    expect(out.flatMap((o) => o.citations)).toEqual([{ start: 22, end: 22, sourceIds: ['c3'] }])
    expect(out[1]!.text).toBe(' trucks')
  })

  it('flushes an unclosed marker as text at the end', () => {
    const stream = inlineCitations()
    expect(stream.push('Open [c1').text).toBe('Open')
    expect(stream.end()).toEqual({ text: ' [c1', citations: [] })
  })

  it('accepts other delimiters', () => {
    expect(stripInlineCitations('Fact【c1】.', { delimiters: ['【', '】'] })).toEqual({
      text: 'Fact.',
      citations: [{ start: 4, end: 4, sourceIds: ['c1'] }],
    })
  })
})

describe('utf8OffsetToIndex', () => {
  it('converts byte offsets to string indexes', () => {
    const text = 'Ação 🐙 ok'
    expect(utf8OffsetToIndex(text, 0)).toBe(0)
    expect(utf8OffsetToIndex(text, 3)).toBe(2) // 'A' + 'ç' (2 bytes)
    expect(utf8OffsetToIndex(text, 6)).toBe(4) // 'Ação'
    expect(utf8OffsetToIndex(text, 11)).toBe(7) // 'Ação 🐙' (emoji: 4 bytes, 2 code units)
    expect(utf8OffsetToIndex(text, 9)).toBe(5) // inside the emoji: rounds down
    expect(utf8OffsetToIndex(text, 999)).toBe(text.length)
  })
})
