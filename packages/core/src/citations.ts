import type { Citation, Message, Part, SourcePart, TextPart } from './types.js'

/* -------------------------------------------------------------------------- */
/* Reading sources and citations                                              */
/* -------------------------------------------------------------------------- */

const partsOf = (source: Message | Part[]): Part[] => (Array.isArray(source) ? source : 'parts' in source ? source.parts : [])

/** The `source` parts of a message, in arrival order. */
export function sourcesOf(source: Message | Part[]): SourcePart[] {
  return partsOf(source).filter((p): p is SourcePart => p.type === 'source')
}

/**
 * The cited sources of a message, numbered by where they are first cited
 * (1, 2, …). Citations to ids that are not sources of the message are ignored.
 */
export function citedSources(source: Message | Part[]): Map<string, number> {
  const parts = partsOf(source)
  const known = new Set(sourcesOf(parts).map((s) => s.id))
  const firsts: Array<{ id: string; at: number }> = []
  const seen = new Set<string>()
  let offset = 0
  for (const part of parts) {
    if (part.type !== 'text') continue
    for (const citation of validCitations(part)) {
      for (const id of citation.sourceIds) {
        if (!known.has(id) || seen.has(id)) continue
        seen.add(id)
        firsts.push({ id, at: offset + citation.end })
      }
    }
    offset += part.text.length
  }
  firsts.sort((a, b) => a.at - b.at)
  return new Map(firsts.map((f, i) => [f.id, i + 1]))
}

/** Citations of a text part that fit its text, sorted by `end`, then `start`. */
export function validCitations(part: TextPart): Citation[] {
  const length = part.text.length
  return (part.citations ?? [])
    .filter((c) => isCitation(c) && c.end <= length)
    .slice()
    .sort((a, b) => a.end - b.end || a.start - b.start)
}

/** Whether a value is a well-formed citation (integer positions, `start <= end`, at least one id). */
export function isCitation(value: unknown): value is Citation {
  if (!value || typeof value !== 'object') return false
  const c = value as Citation
  return (
    Number.isInteger(c.start) &&
    Number.isInteger(c.end) &&
    c.start >= 0 &&
    c.start <= c.end &&
    Array.isArray(c.sourceIds) &&
    c.sourceIds.length > 0 &&
    c.sourceIds.every((id) => typeof id === 'string' && id !== '')
  )
}

/** A piece of a text part, for renderers: plain text, or the reference placed where a citation ends. */
export type CitationSegment =
  | { kind: 'text'; text: string; /** Ids of the sources whose citations cover this text. */ sourceIds: string[] }
  | { kind: 'ref'; sourceIds: string[] }

/**
 * Splits a text part into text and references, for renderers. Each citation
 * becomes a `ref` where it ends; text covered by citations carries their ids.
 * With `known`, ids outside it are dropped, and a citation left without ids
 * is ignored: a client never draws a link to a source it does not have.
 */
export function citationSegments(part: TextPart, known?: Iterable<string>): CitationSegment[] {
  const allowed = known ? new Set(known) : undefined
  const citations = validCitations(part)
    .map((c) => ({ ...c, sourceIds: allowed ? c.sourceIds.filter((id) => allowed.has(id)) : c.sourceIds }))
    .filter((c) => c.sourceIds.length > 0)
  const text = part.text
  const cuts = new Set<number>([0, text.length])
  for (const c of citations) cuts.add(c.start).add(c.end)
  const points = [...cuts].sort((a, b) => a - b)
  const segments: CitationSegment[] = []
  for (let i = 0; i < points.length; i++) {
    const at = points[i]!
    const ending = citations.filter((c) => c.end === at)
    if (ending.length) segments.push({ kind: 'ref', sourceIds: unique(ending.flatMap((c) => c.sourceIds)) })
    const next = points[i + 1]
    if (next === undefined || next === at) continue
    const covering = citations.filter((c) => c.start <= at && c.end >= next)
    const last = segments.at(-1)
    const ids = unique(covering.flatMap((c) => c.sourceIds))
    if (last?.kind === 'text' && sameIds(last.sourceIds, ids)) last.text += text.slice(at, next)
    else segments.push({ kind: 'text', text: text.slice(at, next), sourceIds: ids })
  }
  return segments
}

/** A message's sources split from its text, ready to render (ADR 0014). */
export type SourceView = {
  /** The message's text parts, in order, as text and references. Only references to the message's sources. */
  segments: CitationSegment[]
  /** Cited sources, in the order of their numbers. */
  cited: Array<SourcePart & { number: number }>
  /** Sources consulted but not cited, in arrival order. */
  consulted: SourcePart[]
}

/** Splits a message into text with references and its cited and consulted sources. For renderers and bindings. */
export function sourceView(source: Message | Part[]): SourceView {
  const parts = partsOf(source)
  const sources = sourcesOf(parts)
  const known = sources.map((s) => s.id)
  const numbers = citedSources(parts)
  return {
    segments: parts.flatMap((p) => (p.type === 'text' ? citationSegments(p, known) : [])),
    cited: sources
      .filter((s) => numbers.has(s.id))
      .map((s) => ({ ...s, number: numbers.get(s.id)! }))
      .sort((a, b) => a.number - b.number),
    consulted: sources.filter((s) => !numbers.has(s.id)),
  }
}

/** One row of an article from `sourceGroups`. The client draws it and joins `section`. */
export type SourceGroupLine = {
  /** Citation numbers on this row, ascending. Empty when the row was only consulted. */
  numbers: number[]
  /**
   * Sources on this row: cited ones first, by number, then consulted ones in
   * arrival order. A reference finds its row by id. A section's id stays on
   * the section row, including when the article row also shows that number.
   */
  ids: string[]
  /** Trail below the title. Empty when the row is the article itself. */
  section: string[]
  /**
   * Unfiltered link. The article row is the page, without the hash. A section
   * row keeps its url, anchor included, or falls back to the page when the
   * copies disagree. Render it through `safeSourceUrl`.
   */
  url?: string
  /** First excerpt on the row, in the same order as `ids`. */
  excerpt?: string
}

/**
 * One article in the source list: the same title on the same page.
 * `consulted` means nothing in it was cited, so the client dims the whole
 * article, sections included. `lines` is a single row when the article is one
 * place, or the article row plus one row per section.
 */
export type SourceGroup = {
  title: string
  /** The page, which is the url without the hash. Absent when the sources have no page. */
  url?: string
  /** Nothing in the article was cited. */
  consulted: boolean
  lines: SourceGroupLine[]
}

type GroupedSource = {
  id: string
  number?: number
  section: string[]
  url?: string
  excerpt?: string
  consultedAt?: number
}

type Article = {
  title: string
  page?: string
  firstNumber?: number
  consultedAt?: number
  sources: GroupedSource[]
}

/**
 * Groups the sources `sourceView` returned, by article, for a client that
 * draws its own list (ADR 0014). There is no DOM: the label that introduces
 * the sections, the separator and the styles stay in the client, and urls are
 * not filtered.
 *
 * An article is the title plus the page (the url without `#`). A source with
 * no url, or whose url is only a `#anchor`, has no page and groups by title.
 * The same title on two pages stays two articles. The url is not normalized,
 * so a trailing slash keeps two pages apart.
 *
 * The section is the trail after the title. A trail that starts with the
 * title drops that item. An empty trail, or a trail that is only the title,
 * means the source is the article.
 *
 * One place — the article, or the same section repeated — is one row, with
 * its citation numbers together. Several places: the article row carries
 * every cited number, and each section row carries its own. Rows follow the
 * first citation. Articles where nothing was cited follow them, in arrival
 * order. Numbers on a row are sorted. A consulted source joins its article
 * with no number; a section that was also cited stays on that cited row.
 */
export function sourceGroups(view: SourceView): SourceGroup[] {
  const groups: Article[] = []
  const byKey = new Map<string, Article>()

  const add = (part: SourcePart, number: number | undefined, consultedAt: number | undefined) => {
    const page = pageOf(part.url)
    const key = JSON.stringify([part.title, page ?? null])
    let group = byKey.get(key)
    if (!group) {
      group = { title: part.title, ...(page !== undefined ? { page } : {}), sources: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    if (number !== undefined) group.firstNumber = group.firstNumber === undefined ? number : Math.min(group.firstNumber, number)
    else if (group.consultedAt === undefined) group.consultedAt = consultedAt
    group.sources.push({
      id: part.id,
      ...(number !== undefined ? { number } : {}),
      section: sectionOf(part.title, part.trail),
      ...(part.url !== undefined ? { url: part.url } : {}),
      ...(part.excerpt !== undefined ? { excerpt: part.excerpt } : {}),
      ...(consultedAt !== undefined ? { consultedAt } : {}),
    })
  }

  for (const source of view.cited) add(source, source.number, undefined)
  for (const [index, source] of view.consulted.entries()) add(source, undefined, index)

  return groups
    .sort((a, b) => {
      if (a.firstNumber !== undefined && b.firstNumber !== undefined) return a.firstNumber - b.firstNumber
      if (a.firstNumber !== undefined) return -1
      if (b.firstNumber !== undefined) return 1
      return (a.consultedAt ?? 0) - (b.consultedAt ?? 0)
    })
    .map((group) => toGroup(group.sources, group.title, group.page))
}

/** The page a source belongs to: its url without the hash. A bare `#anchor` is not a page. */
function pageOf(url: string | undefined): string | undefined {
  if (!url || url.startsWith('#')) return undefined
  const hash = url.indexOf('#')
  return hash === -1 ? url : url.slice(0, hash)
}

/** Trail below the title. The title is dropped only when it is the first item. */
function sectionOf(title: string, trail: string[] | undefined): string[] {
  if (!trail?.length) return []
  if (trail[0] === title) return trail.slice(1)
  return trail.slice()
}

const samePath = (a: string[], b: string[]) => a.length === b.length && a.every((item, index) => item === b[index])

function orderSources(sources: GroupedSource[]): GroupedSource[] {
  const cited = sources.filter((s) => s.number !== undefined).sort((a, b) => a.number! - b.number!)
  const consulted = sources.filter((s) => s.number === undefined).sort((a, b) => a.consultedAt! - b.consultedAt!)
  return [...cited, ...consulted]
}

function numbersOf(sources: GroupedSource[]): number[] {
  return sources.flatMap((s) => (s.number === undefined ? [] : [s.number])).sort((a, b) => a - b)
}

/** The section link: the shared url, or the page when the copies disagree. */
function sectionLink(sources: GroupedSource[], page: string | undefined): string | undefined {
  const urls: string[] = []
  for (const source of sources) {
    if (source.url !== undefined && !urls.includes(source.url)) urls.push(source.url)
  }
  const only = urls[0]
  if (urls.length === 1 && only !== undefined) return only
  if (urls.length > 1) return page
  return undefined
}

function line(sources: GroupedSource[], section: string[], url: string | undefined, numbers: number[]): SourceGroupLine {
  const excerpt = sources.find((s) => s.excerpt !== undefined)?.excerpt
  return {
    numbers,
    ids: sources.map((s) => s.id),
    section,
    ...(url !== undefined ? { url } : {}),
    ...(excerpt !== undefined ? { excerpt } : {}),
  }
}

function toGroup(sources: GroupedSource[], title: string, page: string | undefined): SourceGroup {
  const ordered = orderSources(sources)
  const places: string[][] = []
  for (const source of ordered) {
    if (!places.some((place) => samePath(place, source.section))) places.push(source.section)
  }
  const place = places.length === 1 ? places[0]! : undefined
  const lines = place
    ? [line(ordered, place, place.length === 0 ? page : sectionLink(ordered, page), numbersOf(ordered))]
    : [
        line(
          ordered.filter((s) => s.section.length === 0),
          [],
          page,
          numbersOf(ordered),
        ),
        ...places
          .filter((section) => section.length > 0)
          .map((section) => {
            const onSection = ordered.filter((s) => samePath(s.section, section))
            return line(onSection, section, sectionLink(onSection, page), numbersOf(onSection))
          }),
      ]
  return {
    title,
    ...(page !== undefined ? { url: page } : {}),
    consulted: sources.every((s) => s.number === undefined),
    lines,
  }
}

const unique = (ids: string[]) => [...new Set(ids)]
const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i])

/**
 * Reads a source that came over the wire: keeps only the fields of
 * `SourcePart` with the right types; `undefined` without `id` or `title`.
 * For transports.
 */
export function toSourcePart(value: unknown): SourcePart | undefined {
  if (!value || typeof value !== 'object') return undefined
  const v = value as Record<string, unknown>
  if (typeof v.id !== 'string' || !v.id || typeof v.title !== 'string') return undefined
  const trail = Array.isArray(v.trail) ? v.trail.filter((t): t is string => typeof t === 'string') : undefined
  return {
    type: 'source',
    id: v.id,
    title: v.title,
    ...(trail?.length ? { trail } : {}),
    ...(typeof v.url === 'string' ? { url: v.url } : {}),
    ...(typeof v.excerpt === 'string' ? { excerpt: v.excerpt } : {}),
  }
}

/* -------------------------------------------------------------------------- */
/* URLs                                                                       */
/* -------------------------------------------------------------------------- */

export type SafeSourceUrlOptions = {
  /**
   * Hosts that absolute URLs may point to. `example.com` matches only that
   * host; `*.example.com` matches its subdomains. Anchors are always allowed.
   */
  hosts?: string[]
}

/**
 * The URL of a source if it is safe to put in a page: an absolute `http:` or
 * `https:` URL without credentials (and on an allowed host, if `hosts` is
 * given) or a same-page anchor (`#section`). Anything else, relative paths
 * included, gives `undefined`.
 */
export function safeSourceUrl(url: string | undefined, options: SafeSourceUrlOptions = {}): string | undefined {
  if (typeof url !== 'string') return undefined
  const value = url.trim()
  if (/^#[^\s#]+$/.test(value)) return value
  if (!/^https?:\/\//i.test(value)) return undefined
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return undefined
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
  if (parsed.username || parsed.password || !parsed.hostname) return undefined
  if (options.hosts && !options.hosts.some((h) => hostMatches(parsed.hostname, h))) return undefined
  return parsed.href
}

function hostMatches(host: string, pattern: string): boolean {
  const p = pattern.toLowerCase()
  const h = host.toLowerCase()
  return p.startsWith('*.') ? h.endsWith(p.slice(1)) && h.length > p.length - 1 : h === p
}

/* -------------------------------------------------------------------------- */
/* Inline markers (for backends and transports)                               */
/* -------------------------------------------------------------------------- */

export type InlineCitationsOptions = {
  /**
   * Source ids that may be cited. A marker with another id stays in the text.
   * Without it, every marker is taken as a citation.
   */
  known?: Iterable<string> | ((id: string) => boolean)
  /** Opening and closing of a marker. Default `['[', ']']`, as in `[c3]`. */
  delimiters?: [open: string, close: string]
  /** Characters an id may have. Default letters, digits, `_`, `-`, `.`, `:`. */
  id?: RegExp
  /** Longest id. Default 64. */
  maxIdLength?: number
}

export type InlineCitationsChunk = { text: string; citations: Citation[] }

/**
 * Removes citation markers such as `[c3]` from streamed text and turns them
 * into point citations (ADR 0014). For backends and transports whose model
 * writes markers in the text: the client then receives clean text, so
 * Markdown, voice and renderers never see the markers.
 *
 * `push(delta)` returns the text that is safe to send now (a marker split
 * across deltas is held until it closes; trailing spaces are held so the
 * space before a marker can be removed) and the citations for it, with
 * positions counted from the start of the whole text. `end()` flushes.
 * Adjacent markers (`[c1][c2]`) in one chunk become one citation with both
 * ids; renderers join citations that end at the same point anyway.
 */
export function inlineCitations(options: InlineCitationsOptions = {}) {
  const [open, close] = options.delimiters ?? ['[', ']']
  const idChar = options.id ?? /[A-Za-z0-9_.:-]/
  const maxId = options.maxIdLength ?? 64
  const known = options.known
  const accepts =
    typeof known === 'function' ? known : known ? ((ids) => (id: string) => ids.has(id))(new Set(known)) : () => true
  let pending = ''
  let emitted = 0

  /** Index in `s` where a marker starting at `i` ends (exclusive), or -1, or -2 if `s` ends inside a possible marker. */
  const markerAt = (s: string, i: number): { end: number; id: string } | -1 | -2 => {
    if (!s.startsWith(open, i)) {
      return open.startsWith(s.slice(i)) && s.length - i < open.length ? -2 : -1
    }
    let j = i + open.length
    while (j < s.length && j - i - open.length < maxId && idChar.test(s[j]!)) j++
    const id = s.slice(i + open.length, j)
    if (s.startsWith(close, j)) return id && accepts(id) ? { end: j + close.length, id } : -1
    if (j === s.length || (close.startsWith(s.slice(j)) && s.length - j < close.length)) {
      return j - i - open.length < maxId ? -2 : -1
    }
    return -1
  }

  const run = (final: boolean): InlineCitationsChunk => {
    let out = ''
    const citations: Citation[] = []
    let last: Citation | undefined
    let i = 0
    const s = pending
    while (i < s.length) {
      const found = s[i] === open[0] ? markerAt(s, i) : -1
      if (found === -2 && !final) break
      if (typeof found === 'object') {
        // Drop the spaces right before the marker ("word [c3]." → "word.").
        const trimmed = out.replace(/[ \t]+$/, '')
        out = trimmed
        const at = emitted + out.length
        if (last && last.end === at) {
          if (!last.sourceIds.includes(found.id)) last.sourceIds.push(found.id)
        } else {
          last = { start: at, end: at, sourceIds: [found.id] }
          citations.push(last)
        }
        i = found.end
        continue
      }
      out += s[i]
      i++
    }
    pending = s.slice(i)
    if (!final) {
      // Hold trailing spaces: a marker may follow and remove them.
      const held = /[ \t]+$/.exec(out)?.[0] ?? ''
      if (held) {
        out = out.slice(0, out.length - held.length)
        pending = held + pending
      }
    }
    emitted += out.length
    return { text: out, citations }
  }

  return {
    push(delta: string): InlineCitationsChunk {
      pending += delta
      return run(false)
    },
    end(): InlineCitationsChunk {
      return run(true)
    },
  }
}

/** `inlineCitations` over a whole text at once. */
export function stripInlineCitations(text: string, options?: InlineCitationsOptions): InlineCitationsChunk {
  const stream = inlineCitations(options)
  const a = stream.push(text)
  const b = stream.end()
  return { text: a.text + b.text, citations: [...a.citations, ...b.citations] }
}

/* -------------------------------------------------------------------------- */
/* Units                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Converts a UTF-8 byte offset into `text` to a UTF-16 index (JavaScript
 * string index), for transports whose provider counts bytes (such as
 * Gemini's grounding segments). An offset inside a character rounds down to
 * its start; past the end gives `text.length`.
 */
export function utf8OffsetToIndex(text: string, byteOffset: number): number {
  let bytes = 0
  let index = 0
  for (const char of text) {
    const code = char.codePointAt(0)!
    const size = code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
    if (bytes + size > byteOffset) return index
    bytes += size
    index += char.length
  }
  return index
}
