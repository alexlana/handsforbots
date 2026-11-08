import { describe, expect, it } from 'vitest'
import {
  citationSegments,
  citedSources,
  createH4B,
  inlineCitations,
  safeSourceUrl,
  sourcesOf,
  sourceGroups,
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

describe('sourceGroups', () => {
  const page = 'https://example.com/artigo'
  const numbered = (id: string, number: number, extra: Partial<SourcePart> = {}): SourcePart & { number: number } => ({
    ...source(id, extra),
    number,
  })
  const grouped = (cited: Array<SourcePart & { number: number }>, consulted: SourcePart[] = []) =>
    sourceGroups({ segments: [], cited, consulted })

  it('gives several sections one article row and a row each, in citation order', () => {
    const groups = grouped([
      numbered('c5', 5, { title: 'Artigo', trail: ['Artigo', 'Capítulo 2'], url: `${page}#cap-2` }),
      numbered('c1', 1, { title: 'Artigo', trail: ['Artigo', 'Capítulo 1'], url: `${page}#cap-1`, excerpt: 'Um' }),
      numbered('c4', 4, { title: 'Artigo', trail: ['Artigo', 'Capítulo 3', 'Módulo'], url: `${page}#mod`, excerpt: 'Quatro' }),
    ])
    expect(groups).toEqual([
      {
        title: 'Artigo',
        url: page,
        consulted: false,
        lines: [
          { numbers: [1, 4, 5], ids: [], section: [], url: page },
          { numbers: [1], ids: ['c1'], section: ['Capítulo 1'], url: `${page}#cap-1`, excerpt: 'Um' },
          { numbers: [4], ids: ['c4'], section: ['Capítulo 3', 'Módulo'], url: `${page}#mod`, excerpt: 'Quatro' },
          { numbers: [5], ids: ['c5'], section: ['Capítulo 2'], url: `${page}#cap-2` },
        ],
      },
    ])
    const section = groups[0]!.lines.find((line) => line.ids.includes('c4'))
    expect(section?.section).toEqual(['Capítulo 3', 'Módulo'])
    expect(section?.numbers).toEqual([4])
  })

  it('collapses one repeated section into a single row', () => {
    expect(
      grouped([
        numbered('c4', 4, { title: 'Artigo', trail: ['Capítulo 1'], url: `${page}#cap-1`, excerpt: 'Depois' }),
        numbered('c1', 1, { title: 'Artigo', trail: ['Artigo', 'Capítulo 1'], url: `${page}#cap-1`, excerpt: 'Antes' }),
      ]),
    ).toEqual([
      {
        title: 'Artigo',
        url: page,
        consulted: false,
        lines: [{ numbers: [1, 4], ids: ['c1', 'c4'], section: ['Capítulo 1'], url: `${page}#cap-1`, excerpt: 'Antes' }],
      },
    ])
  })

  it('collapses the article itself and links the page, without the hash', () => {
    expect(
      grouped([
        numbered('c1', 1, { title: 'Artigo', url: `${page}#top`, excerpt: 'A' }),
        numbered('c4', 4, { title: 'Artigo', trail: ['Artigo'], url: `${page}#other`, excerpt: 'B' }),
      ]),
    ).toEqual([
      {
        title: 'Artigo',
        url: page,
        consulted: false,
        lines: [{ numbers: [1, 4], ids: ['c1', 'c4'], section: [], url: page, excerpt: 'A' }],
      },
    ])
  })

  it('keeps the article and a section as two rows, and the reference finds the section', () => {
    const groups = grouped([
      numbered('c4', 4, { title: 'Artigo', trail: ['Artigo', 'Capítulo 1'], url: `${page}#cap-1`, excerpt: 'A seção' }),
      numbered('c1', 1, { title: 'Artigo', url: page, excerpt: 'O artigo' }),
    ])
    expect(groups[0]!.lines).toEqual([
      { numbers: [1, 4], ids: ['c1'], section: [], url: page, excerpt: 'O artigo' },
      { numbers: [4], ids: ['c4'], section: ['Capítulo 1'], url: `${page}#cap-1`, excerpt: 'A seção' },
    ])
  })

  it('keeps the same title on two pages apart, slash included', () => {
    const groups = grouped([
      numbered('b', 2, { title: 'Artigo', url: 'https://example.com/a/#2' }),
      numbered('a', 1, { title: 'Artigo', url: 'https://example.com/a#1' }),
    ])
    expect(groups.map((group) => group.url)).toEqual(['https://example.com/a', 'https://example.com/a/'])
    expect(groups.map((group) => group.lines[0]!.numbers)).toEqual([[1], [2]])
  })

  it('groups a source with no url, or only an anchor, by title', () => {
    const groups = grouped([
      numbered('bare', 2, { title: 'Artigo' }),
      numbered('anchor', 1, { title: 'Artigo', trail: ['Artigo', 'Capítulo 1'], url: '#cap-1' }),
    ])
    expect(groups).toEqual([
      {
        title: 'Artigo',
        consulted: false,
        lines: [
          { numbers: [1, 2], ids: ['bare'], section: [] },
          { numbers: [1], ids: ['anchor'], section: ['Capítulo 1'], url: '#cap-1' },
        ],
      },
    ])
  })

  it('keeps an agreed section url and falls back to the page when copies disagree', () => {
    const agreed = grouped([
      numbered('a', 1, { title: 'Artigo', trail: ['Capítulo 1'], url: '#cap-1' }),
      numbered('b', 2, { title: 'Artigo', trail: ['Capítulo 1'] }),
    ])
    expect(agreed[0]!.lines[0]!.url).toBe('#cap-1')

    const disagreed = grouped([
      numbered('a', 1, { title: 'Artigo', trail: ['Artigo', 'Capítulo 1'], url: `${page}#a` }),
      numbered('b', 2, { title: 'Artigo', trail: ['Artigo', 'Capítulo 1'], url: page }),
    ])
    expect(disagreed[0]!.lines[0]!.url).toBe(page)

    const anchors = grouped([
      numbered('a', 1, { title: 'Artigo', trail: ['Capítulo 1'], url: '#a' }),
      numbered('b', 2, { title: 'Artigo', trail: ['Capítulo 1'], url: '#b' }),
    ])
    expect(anchors[0]!.url).toBeUndefined()
    expect(anchors[0]!.lines[0]!.url).toBeUndefined()
  })

  it('drops only a leading title from the trail', () => {
    expect(
      grouped([numbered('a', 1, { title: 'Artigo', trail: ['Outra', 'Parte'], url: page })])[0]!.lines[0]!.section,
    ).toEqual(['Outra', 'Parte'])
    expect(grouped([numbered('b', 1, { title: 'Artigo', trail: ['Artigo', 'Artigo'], url: page })])[0]!.lines[0]!.section).toEqual([
      'Artigo',
    ])
  })

  it('joins consulted sources into the article, and dims an article nothing cited', () => {
    const groups = grouped(
      [numbered('c1', 1, { title: 'Artigo', trail: ['Artigo', 'Capítulo 1'], url: `${page}#cap-1` })],
      [
        source('antes', { title: 'Antes' }),
        source('again', { title: 'Artigo', trail: ['Artigo', 'Capítulo 1'], url: `${page}#outra`, excerpt: 'De novo' }),
        source('extra', { title: 'Artigo', trail: ['Artigo', 'Capítulo 2'], url: `${page}#cap-2` }),
        source('depois', { title: 'Depois', trail: ['Depois', 'Um'], url: 'https://example.com/depois#um' }),
        source('depois2', { title: 'Depois', trail: ['Depois', 'Dois'], url: 'https://example.com/depois#dois' }),
      ],
    )
    expect(groups.map((group) => [group.title, group.consulted])).toEqual([
      ['Artigo', false],
      ['Antes', true],
      ['Depois', true],
    ])
    expect(groups[0]!.lines).toEqual([
      { numbers: [1], ids: [], section: [], url: page },
      { numbers: [1], ids: ['c1', 'again'], section: ['Capítulo 1'], url: page, excerpt: 'De novo' },
      { numbers: [], ids: ['extra'], section: ['Capítulo 2'], url: `${page}#cap-2` },
    ])
    expect(groups[2]).toEqual({
      title: 'Depois',
      url: 'https://example.com/depois',
      consulted: true,
      lines: [
        { numbers: [], ids: [], section: [], url: 'https://example.com/depois' },
        { numbers: [], ids: ['depois'], section: ['Um'], url: 'https://example.com/depois#um' },
        { numbers: [], ids: ['depois2'], section: ['Dois'], url: 'https://example.com/depois#dois' },
      ],
    })
  })

  it('leaves the url unfiltered for the renderer', () => {
    const groups = grouped([numbered('c1', 1, { title: 'Artigo', url: 'javascript:alert(1)#x' })])
    expect(groups[0]!.url).toBe('javascript:alert(1)')
    expect(groups[0]!.lines[0]!.url).toBe('javascript:alert(1)')
    expect(safeSourceUrl(groups[0]!.url)).toBeUndefined()
  })

  it('groups what sourceView numbered, without renumbering', () => {
    const view = sourceView([
      source('c1', { title: 'Artigo', trail: ['Artigo', 'Capítulo 1'], url: `${page}#cap-1` }),
      source('other', { title: 'Outro', url: 'https://example.com/outro' }),
      source('mid', { title: 'Meio', url: 'https://example.com/meio' }),
      source('c4', { title: 'Artigo', trail: ['Artigo', 'Capítulo 3', 'Módulo'], url: `${page}#mod` }),
      source('c5', { title: 'Artigo', trail: ['Artigo', 'Capítulo 2'], url: `${page}#cap-2` }),
      source('idle', { title: 'Artigo', trail: ['Artigo', 'Apêndice'], url: `${page}#ap` }),
      {
        type: 'text',
        text: 'abcdefghij',
        citations: [
          { start: 0, end: 1, sourceIds: ['c1'] },
          { start: 1, end: 3, sourceIds: ['other'] },
          { start: 3, end: 5, sourceIds: ['mid'] },
          { start: 5, end: 7, sourceIds: ['c4'] },
          { start: 7, end: 9, sourceIds: ['c5'] },
        ],
      },
    ])
    expect(sourceGroups(view).map((group) => ({ title: group.title, lines: group.lines.map((line) => line.numbers) }))).toEqual([
      { title: 'Artigo', lines: [[1, 4, 5], [1], [4], [5], []] },
      { title: 'Outro', lines: [[2]] },
      { title: 'Meio', lines: [[3]] },
    ])
  })

  it('returns nothing for a message without sources', () => {
    expect(sourceGroups({ segments: [], cited: [], consulted: [] })).toEqual([])
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
