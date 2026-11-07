import { citationSegments, citedSources, safeSourceUrl, sourcesOf, type Message, type SourcePart } from '@handsforbots/core'
import { escapeHtml, renderMarkdown } from './markdown.js'

export type SourcesOptions = {
  /** Hosts that source links may point to (`example.com`, `*.example.com`). Default: any http(s) host. */
  hosts?: string[]
  /**
   * Registered action to run when a source or a reference is clicked, instead
   * of following its link. It receives `{ id, title, url?, trail?, messageId }`.
   */
  action?: string
  /** Also list sources that were consulted but not cited. Default true. */
  consulted?: boolean
}

// Private-use characters mark where references go while Markdown is rendered.
const OPEN = ''
const CLOSE = ''
const SENTINELS = /[]/g

/**
 * Markdown HTML of a message's text with numbered references where its
 * citations end (ADR 0014). Only citations to sources of the message become
 * references; everything from the backend is escaped.
 */
export function renderCitedText(message: Message, options: SourcesOptions = {}): string {
  if (message.role === 'tool') return ''
  const known = sourcesOf(message).map((s) => s.id)
  const numbers = citedSources(message)
  const refs: string[][] = []
  let raw = ''
  for (const part of message.parts) {
    if (part.type !== 'text') continue
    for (const segment of citationSegments({ ...part, text: part.text.replace(SENTINELS, '') }, known)) {
      if (segment.kind === 'text') raw += segment.text
      else {
        raw += `${OPEN}${refs.length}${CLOSE}`
        refs.push(segment.sourceIds)
      }
    }
  }
  if (!raw) return ''
  const sources = new Map(sourcesOf(message).map((s) => [s.id, s]))
  return renderMarkdown(raw).replace(/(\d+)/g, (_, index: string) =>
    (refs[Number(index)] ?? [])
      .map((id) => referenceHtml(sources.get(id)!, numbers.get(id) ?? 0, message.id, options))
      .join(''),
  )
}

function referenceHtml(source: SourcePart, number: number, messageId: string, options: SourcesOptions): string {
  const url = options.action ? undefined : safeSourceUrl(source.url, { hosts: options.hosts })
  const attrs = `data-source="${escapeHtml(source.id)}" data-message="${escapeHtml(messageId)}" title="${escapeHtml(source.title)}" aria-label="${escapeHtml(source.title)}"`
  const inner = url
    ? `<a href="${escapeHtml(url)}"${url.startsWith('#') ? '' : ' target="_blank" rel="noopener noreferrer"'} ${attrs}>${number}</a>`
    : `<button type="button" ${attrs}>${number}</button>`
  return `<sup class="cite" part="citation">${inner}</sup>`
}

/** The list of sources shown under a message: cited ones numbered, then the consulted ones. */
export function sourceList(
  message: Message,
  heading: string,
  consultedHeading: string,
  options: SourcesOptions = {},
): HTMLElement | undefined {
  const all = sourcesOf(message)
  const numbers = citedSources(message)
  const cited = all.filter((s) => numbers.has(s.id)).sort((a, b) => numbers.get(a.id)! - numbers.get(b.id)!)
  const consulted = options.consulted === false ? [] : all.filter((s) => !numbers.has(s.id))
  if (!cited.length && !consulted.length) return undefined
  const element = document.createElement('div')
  element.className = 'source-list'
  element.setAttribute('part', 'sources')
  if (cited.length) {
    element.append(title(heading))
    element.append(list('ol', cited, message.id, options))
  }
  if (consulted.length) {
    element.append(title(cited.length ? consultedHeading : heading))
    const ul = list('ul', consulted, message.id, options)
    ul.classList.add('consulted')
    element.append(ul)
  }
  return element
}

function title(text: string) {
  const el = document.createElement('div')
  el.className = 'sources-title'
  el.textContent = text
  return el
}

function list(tag: 'ol' | 'ul', sources: SourcePart[], messageId: string, options: SourcesOptions) {
  const el = document.createElement(tag)
  for (const source of sources) {
    const li = document.createElement('li')
    li.id = `src-${messageId}-${source.id}`
    const url = options.action ? undefined : safeSourceUrl(source.url, { hosts: options.hosts })
    const link = document.createElement(url ? 'a' : options.action ? 'button' : 'span')
    link.textContent = source.title
    link.dataset.source = source.id
    link.dataset.message = messageId
    if (link instanceof HTMLAnchorElement && url) {
      link.href = url
      if (!url.startsWith('#')) {
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
      }
    }
    if (link instanceof HTMLButtonElement) link.type = 'button'
    if (source.excerpt) li.title = source.excerpt
    li.append(link)
    if (source.trail?.length) {
      const trail = document.createElement('span')
      trail.className = 'trail'
      trail.textContent = source.trail.join(' › ')
      li.append(trail)
    }
    el.append(li)
  }
  return el
}
