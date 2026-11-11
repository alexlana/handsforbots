import {
  consentText,
  definePlugin,
  pickVariant,
  type AttributeValue,
  type ConversationAttributes,
  sameRetention,
  textOf,
  type H4B,
  sourcesOf,
  type MediaPart,
  type Message,
  type Retention,
  type Services,
  type Signal,
  type TurnStatus,
} from '@handsforbots/core'
import { autofocusFlags, bindTextFocus, canFocus, type AutofocusOptions } from './focus.js'
import { stringsFor, type Strings } from './i18n.js'
import { escapeHtml, renderMarkdown } from './markdown.js'
import { renderCitedText, sourceList, type SourcesOptions } from './sources.js'
import { PALETTES, STYLES } from './styles.js'

/** The part of the `cues` service (@handsforbots/cues) the widget reads, without importing the plugin. */
type CueStore = {
  getState(): Readonly<Record<string, { value: string; level: number }>>
  subscribe(listener: () => void): () => void
}

export { renderMarkdown, escapeHtml } from './markdown.js'
export { stringsFor, STRINGS, type Strings } from './i18n.js'
export { PALETTES } from './styles.js'
export { renderCitedText, type SourcesOptions } from './sources.js'
export { bindTextFocus, type AutofocusOptions, type TextFocusOptions, type TextFocusTarget } from './focus.js'

export type QuickReply = { label: string; payload?: string }

/** Renders rich content (`ui.render` / data part 'ui') inside a bot message. Return an element. */
export type Renderer = (props: any, context: { h4b: H4B }) => HTMLElement

export type GalleryProps = {
  title?: string
  images: (string | { src: string; alt?: string; caption?: string })[]
  texts?: string[]
}

/** Built-in renderers. Override or add with `widget({ renderers })`. */
export const RENDERERS: Record<string, Renderer> = {
  gallery(props: GalleryProps) {
    const root = document.createElement('figure')
    root.className = 'gallery'
    if (props.title) {
      const title = document.createElement('figcaption')
      title.textContent = props.title
      root.append(title)
    }
    const grid = document.createElement('div')
    grid.className = 'grid'
    for (const image of props.images ?? []) {
      const { src, alt, caption } = typeof image === 'string' ? { src: image, alt: '', caption: '' } : image
      if (!/^(https?:|data:image\/|blob:|\/|\.\/|[\w-]+\/)/i.test(src)) continue
      const link = document.createElement('a')
      link.href = src
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      const img = document.createElement('img')
      img.src = src
      img.alt = alt ?? caption ?? ''
      img.loading = 'lazy'
      link.append(img)
      grid.append(link)
    }
    root.append(grid)
    for (const text of props.texts ?? []) {
      const p = document.createElement('p')
      p.innerHTML = renderMarkdown(text)
      root.append(p)
    }
    return root
  },
}

export type WidgetOptions = {
  /** Where the element is appended. Default: document.body. */
  container?: string | HTMLElement
  /** floating (launcher + window), sidebar (full-height panel) or inline (fills the container). */
  layout?: 'floating' | 'sidebar' | 'inline'
  corner?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  startOpen?: boolean
  alwaysOpen?: boolean
  title?: string
  botName?: string
  botJob?: string
  avatar?: string
  language?: string
  strings?: Partial<Strings>
  theme?: 'auto' | 'light' | 'dark'
  /** Preset palette name (blue, purple, orange, green). */
  color?: string
  /** CSS overrides: primary, primaryHover, soft, bg, surface, text, muted, border, radius, width, height, font. */
  colors?: Record<string, string>
  /**
   * Shown (and recorded) when the conversation is empty. A string is one
   * message, an array is several messages in order, and `{ random }` draws one
   * option per new conversation (an option is a string or an array of
   * messages), avoiding the option shown last in this browser.
   *
   * An option can be `{ text, attributes }` for an A/B test (ADR 0017): the
   * drawn option's `attributes` (codes, such as `{ 'greeting.kind': 'directed' }`)
   * are set on the conversation and recorded as an exposure of `experiment`
   * (default `greeting`). With `consent`, the option shown last is only kept
   * in `localStorage` once `persistence` is granted; until then, in memory.
   */
  greeting?: Greeting
  disclaimer?: string
  /** Delay between bot messages that arrive together, in ms. Default 350. */
  pace?: number
  /** Show cards for actions run by the assistant, the menu or agents. Default true. */
  showActions?: boolean
  /** Components for rich content, by name (merged with the built-in `gallery`). */
  renderers?: Record<string, Renderer>
  /**
   * Focus the composer. `true` focuses it when the window opens, including a
   * page load that starts with the window open. An object turns each behavior
   * on or off: `onLoad` is that open focus, `onClick` focuses when the user
   * clicks anywhere that is not a control or a text selection.
   */
  autofocus?: boolean | AutofocusOptions
  /**
   * Let users see where the conversation is kept, pick a retention (when the
   * storage offers choices), see or change consent (when `createH4B` has
   * `consent`) and delete it. Default true.
   */
  showPrivacy?: boolean
  /**
   * Sources and citations of assistant messages (ADR 0014): numbered
   * references in the text and a list under the message. `false` hides them.
   */
  sources?: SourcesOptions | false
}

/** One option of a random greeting: text, several messages, or text with attributes for an A/B test. */
export type GreetingOption =
  | string
  | string[]
  | { text: string | string[]; attributes?: Readonly<Record<string, AttributeValue>> }

export type Greeting =
  | string
  | string[]
  | {
      random: GreetingOption[]
      /** Name of the experiment the exposure is recorded under. Default `greeting`. */
      experiment?: string
    }

const TAG = 'h4b-chat'
const OPEN_KEY = 'h4b-widget-open'
const GREETING_KEY = 'h4b-widget-greeting'
/** The option shown last, while it may not go to localStorage (consent). */
let lastGreeting: number | undefined

/**
 * The messages of a greeting. With `{ random }`, draws one option, skipping
 * the index stored as `previous` when there is another option, and returns it
 * with the option's `attributes`, if any. Setting them on the conversation is
 * up to the caller (the widget does it).
 */
export function pickGreeting(
  greeting: Greeting,
  previous?: number,
  random: () => number = Math.random,
): { lines: string[]; index?: number; attributes?: ConversationAttributes } {
  if (typeof greeting === 'string') return { lines: [greeting] }
  if (Array.isArray(greeting)) return { lines: greeting }
  const drawn = pickVariant(greeting.random, previous, random)
  if (!drawn) return { lines: [] }
  const { variant: option, index } = drawn
  if (typeof option === 'string') return { lines: [option], index }
  if (Array.isArray(option)) return { lines: option, index }
  const lines = Array.isArray(option.text) ? option.text : [option.text]
  return option.attributes ? { lines, index, attributes: option.attributes } : { lines, index }
}

export const widget = definePlugin<WidgetOptions | undefined>({
  name: 'widget',
  apply(ctx, options = {}) {
    if (typeof document === 'undefined') return
    defineWidgetElement()
    const element = document.createElement(TAG) as H4BChatElement
    const container =
      typeof options.container === 'string' ? document.querySelector(options.container) : options.container
    ;(container ?? document.body).append(element)
    element.connect(ctx.app, options)
    ctx.onDispose(() => element.remove())
  },
})

/** Registers <h4b-chat>. Safe to call more than once and on the server. */
export function defineWidgetElement() {
  if (typeof customElements === 'undefined' || customElements.get(TAG)) return
  customElements.define(TAG, H4BChatElement)
}

const BaseElement: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (class {} as unknown as typeof HTMLElement) : HTMLElement

export class H4BChatElement extends BaseElement {
  private h4b?: H4B
  private options: WidgetOptions = {}
  private strings: Strings = stringsFor('en')
  private language = 'en'
  private root!: ShadowRoot
  private els!: {
    launcher: HTMLButtonElement
    window: HTMLElement
    log: HTMLElement
    typing: HTMLElement
    status: HTMLElement
    chips: HTMLElement
    partial: HTMLElement
    form: HTMLFormElement
    input: HTMLInputElement
    mic: HTMLButtonElement
    speaker: HTMLButtonElement
    attach: HTMLButtonElement
    cam: HTMLButtonElement
    camera: HTMLElement
    privacyButton: HTMLButtonElement
    privacy: HTMLElement
  }
  private rendered = new Map<string, { message: Message; element: HTMLElement }>()
  private renderedParts = new WeakSet<object>()
  private revealQueue: HTMLElement[] = []
  private revealTimer?: ReturnType<typeof setTimeout>
  private lastReveal = 0
  private initialRender = true
  private shownTurn?: TurnStatus
  private statusTimer?: ReturnType<typeof setTimeout>
  private statusSince = 0
  private cleanups: (() => void)[] = []

  /** Binds the element to an H4B instance (the `widget` plugin does it for you). */
  connect(h4b: H4B, options: WidgetOptions = {}) {
    this.disconnect()
    this.h4b = h4b
    this.options = options
    this.language = options.language ?? (document.documentElement.lang || 'en')
    this.strings = stringsFor(this.language, options.strings)
    this.build()
    this.cleanups.push(h4b.subscribe(() => this.render()))
    // Voice may be installed after the widget (plugin order) or removed at runtime.
    let unsubscribeVoice: (() => void) | undefined
    const watchVoice = () => {
      unsubscribeVoice?.()
      unsubscribeVoice = this.voice()?.subscribe(() => this.renderVoice())
      this.renderVoice()
    }
    watchVoice()
    this.renderMedia()
    let unsubscribeRetention: (() => void) | undefined
    const watchRetention = () => {
      unsubscribeRetention?.()
      unsubscribeRetention = this.h4b?.get('retention')?.subscribe(() => this.renderPrivacy())
      this.renderPrivacy()
    }
    watchRetention()
    // Cues (ADR 0018): one data attribute per channel, for CSS. The widget only knows their shape.
    let unsubscribeCues: (() => void) | undefined
    const watchCues = () => {
      unsubscribeCues?.()
      const store = this.h4b?.get('cues' as keyof Services) as unknown as CueStore | undefined
      unsubscribeCues = store?.subscribe(() => this.renderCues(store))
      this.renderCues(store)
    }
    watchCues()
    const onService = ({ key }: { key: string }) => {
      if (key === 'cues') watchCues()
      if (key === 'voice') watchVoice()
      if (key === 'files' || key === 'camera') this.renderMedia()
      if (key === 'retention') watchRetention()
    }
    this.cleanups.push(
      () => unsubscribeVoice?.(),
      () => unsubscribeRetention?.(),
      () => {
        unsubscribeCues?.()
        this.renderCues(undefined)
      },
      h4b.consent.subscribe(() => this.renderPrivacy()),
      h4b.on('service.provided', onService as never),
      h4b.on('service.removed', onService as never),
    )
    this.render()
    this.greet()
  }

  disconnectedCallback() {
    this.disconnect()
  }

  private disconnect() {
    for (const cleanup of this.cleanups.splice(0)) cleanup()
    clearTimeout(this.revealTimer)
    clearTimeout(this.statusTimer)
    this.rendered.clear()
    this.revealQueue = []
    this.initialRender = true
  }

  /* ---------------------------------------------------------------------- */
  /* Structure                                                              */
  /* ---------------------------------------------------------------------- */

  /** Mirrors the cues as `data-cue-<channel>` and `data-cue-<channel>-level` on the element; removes them without the service. */
  private renderCues(store: CueStore | undefined) {
    const state = store?.getState() ?? {}
    for (const name of [...this.getAttributeNames()]) {
      const match = /^data-cue-(.+?)(-level)?$/.exec(name)
      if (match && !(match[1]! in state)) this.removeAttribute(name)
    }
    for (const [channel, cue] of Object.entries(state)) {
      if (!/^[a-z][a-z0-9-]{0,31}$/.test(channel)) continue
      this.setAttribute(`data-cue-${channel}`, cue.value)
      this.setAttribute(`data-cue-${channel}-level`, String(cue.level))
    }
  }

  private build() {
    const o = this.options
    const s = this.strings
    this.root ??= this.attachShadow({ mode: 'open' })
    this.dataset.layout = o.layout ?? 'floating'
    this.dataset.corner = o.corner ?? 'bottom-right'
    this.dataset.theme = o.theme ?? 'auto'
    if (o.alwaysOpen || o.layout === 'inline') this.dataset.alwaysOpen = ''
    const palette = { ...(PALETTES[o.color ?? ''] ?? {}), ...(o.colors ?? {}) }
    for (const [name, value] of Object.entries(palette)) {
      this.style.setProperty(`--h4b-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, value)
    }

    this.root.innerHTML = `
      <style>${STYLES}</style>
      <button class="launcher" part="launcher" aria-label="${escapeHtml(s.open)}" aria-expanded="false">💬</button>
      <section class="window" part="window" role="dialog" aria-label="${escapeHtml(o.title ?? s.title)}" hidden>
        <header part="header">
          ${o.avatar ? `<img src="${escapeHtml(o.avatar)}" alt="">` : ''}
          <div class="who"><strong>${escapeHtml(o.botName ?? s.botName)}</strong>${o.botJob ? `<small>${escapeHtml(o.botJob)}</small>` : `<small>${escapeHtml(o.title ?? s.title)}</small>`}</div>
          <button class="privacy-toggle" type="button" hidden aria-expanded="false" aria-label="${escapeHtml(s.privacy)}" title="${escapeHtml(s.privacy)}">🔒</button>
          <button class="close" type="button" aria-label="${escapeHtml(s.close)}">✕</button>
        </header>
        <div class="privacy" part="privacy" role="group" aria-label="${escapeHtml(s.privacy)}" hidden></div>
        <div class="log" part="log" role="log" aria-live="polite" aria-relevant="additions text">
          ${o.disclaimer ? `<details class="disclaimer"><summary>${escapeHtml(s.disclaimer)}</summary>${renderMarkdown(o.disclaimer)}</details>` : ''}
          <div class="typing" aria-hidden="true" hidden>•••</div>
        </div>
        <div class="status" part="status" aria-live="polite"></div>
        <div class="chips" part="chips"></div>
        <div class="partial" part="partial" aria-live="polite"></div>
        <div class="camera" part="camera" hidden>
          <video playsinline muted></video>
          <div><button type="button" class="cancel">${escapeHtml(s.cancel)}</button><button type="button" class="primary snap">${escapeHtml(s.capture)}</button></div>
        </div>
        <form part="composer">
          <label class="sr-only" for="chat_input">${escapeHtml(s.placeholder)}</label>
          <input id="chat_input" autocomplete="off" placeholder="${escapeHtml(s.placeholder)}">
          <button class="icon attach" type="button" hidden aria-label="${escapeHtml(s.attach)}" title="${escapeHtml(s.attach)}">📎</button>
          <button class="icon cam" type="button" hidden aria-label="${escapeHtml(s.camera)}" title="${escapeHtml(s.camera)}">📷</button>
          <button id="speech_button" class="icon mic" type="button" hidden>🎤</button>
          <button class="icon speaker" type="button" hidden>🔈</button>
          <button type="submit">${escapeHtml(s.send)}</button>
        </form>
      </section>`

    const $ = <T extends HTMLElement>(selector: string) => this.root.querySelector(selector) as T
    this.els = {
      launcher: $('.launcher'),
      window: $('.window'),
      log: $('.log'),
      typing: $('.typing'),
      status: $('.status'),
      chips: $('.chips'),
      partial: $('.partial'),
      form: $('form'),
      input: $('#chat_input'),
      mic: $('.mic'),
      speaker: $('.speaker'),
      attach: $('.attach'),
      cam: $('.cam'),
      camera: $('.camera'),
      privacyButton: $('.privacy-toggle'),
      privacy: $('.privacy'),
    }
    const { launcher, form, input } = this.els
    const close = $<HTMLButtonElement>('.close')
    if (this.dataset.alwaysOpen !== undefined) {
      close.hidden = true
      launcher.dataset.hidden = ''
      launcher.hidden = true
    }

    this.els.log.addEventListener('click', (event) => this.onSourceClick(event))
    launcher.addEventListener('click', () => this.setOpen(!this.isOpen))
    close.addEventListener('click', () => this.setOpen(false))
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      const text = input.value.trim()
      if (!text) return
      input.value = ''
      this.renderChips()
      this.h4b?.signal({ modality: 'text', parts: [{ type: 'text', text }], source: 'widget' })
    })
    input.addEventListener('input', () => this.renderChips())
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.dataset.alwaysOpen === undefined && !input.value) this.setOpen(false)
    })
    this.bindVoiceButtons()
    this.bindMediaButtons()
    this.els.privacyButton.addEventListener('click', () => {
      const open = this.els.privacy.hidden
      this.els.privacy.hidden = !open
      this.els.privacyButton.setAttribute('aria-expanded', String(open))
    })

    this.cleanups.push(
      bindTextFocus({
        input: this.els.input,
        onClick: autofocusFlags(this.options.autofocus).onClick,
      }),
    )
    let open = this.dataset.alwaysOpen !== undefined || !!this.options.startOpen
    try {
      const remembered = sessionStorage.getItem(OPEN_KEY)
      if (remembered !== null && this.dataset.alwaysOpen === undefined) open = remembered === '1'
    } catch {
      /* storage unavailable */
    }
    this.setOpen(open, false)
  }

  get isOpen(): boolean {
    return !this.els.window.hidden
  }

  /** Opens or closes the conversation window. */
  setOpen(open: boolean, remember = true) {
    if (this.dataset.alwaysOpen !== undefined) open = true
    this.els.window.hidden = !open
    this.els.launcher.setAttribute('aria-expanded', String(open))
    this.els.launcher.textContent = open ? '✕' : '💬'
    if (remember) {
      try {
        sessionStorage.setItem(OPEN_KEY, open ? '1' : '0')
      } catch {
        /* storage unavailable */
      }
    }
    if (open) {
      this.scrollToEnd(true)
      if (autofocusFlags(this.options.autofocus).onLoad && canFocus(this.els.input)) this.els.input.focus()
    }
  }

  private greet() {
    const greeting = this.options.greeting
    const h4b = this.h4b
    if (!greeting || !h4b || h4b.messages.length > 0) return
    // With consent rules, the browser keeps the last option only with `persistence`.
    const mayStore = !h4b.consent.enabled || h4b.consent.granted('persistence')
    let previous = lastGreeting
    if (mayStore) {
      try {
        const stored = localStorage.getItem(GREETING_KEY)
        if (stored !== null) previous = Number(stored)
      } catch {
        /* storage unavailable */
      }
    }
    const { lines, index, attributes } = pickGreeting(greeting, previous)
    if (index !== undefined) {
      lastGreeting = index
      if (mayStore) {
        try {
          localStorage.setItem(GREETING_KEY, String(index))
        } catch {
          /* storage unavailable */
        }
      }
    }
    if (lines.length === 0) return
    if (attributes) {
      h4b.setConversationAttributes(attributes)
      h4b.expose(typeof greeting === 'object' && !Array.isArray(greeting) ? (greeting.experiment ?? 'greeting') : 'greeting', attributes)
    }
    void h4b.push(
      lines.flatMap((text, i) => {
        const messageId = `greeting-${i}-${Date.now()}`
        return [
          { type: 'message.start' as const, messageId },
          { type: 'message.delta' as const, messageId, delta: text },
          { type: 'message.end' as const, messageId },
        ]
      }),
    )
  }

  /* ---------------------------------------------------------------------- */
  /* Rendering                                                              */
  /* ---------------------------------------------------------------------- */

  private render() {
    if (!this.h4b) return
    const snapshot = this.h4b.getSnapshot()
    const seen = new Set<string>()
    for (const message of snapshot.messages) {
      seen.add(message.id)
      const previous = this.rendered.get(message.id)
      if (previous?.message === message) continue
      const element = previous?.element ?? this.createMessageElement(message)
      if (!element) continue
      this.fillMessage(element, message)
      if (!previous) this.els.log.insertBefore(element, this.els.typing)
      // Pace bot messages from the moment they first have something to show.
      if (message.role === 'assistant' && !element.hidden && !element.dataset.revealed) {
        element.dataset.revealed = '1'
        if (!this.initialRender) this.queueReveal(element)
      }
      this.rendered.set(message.id, { message, element })
    }
    // Thread reset: drop elements of messages that no longer exist.
    for (const [id, entry] of this.rendered) {
      if (!seen.has(id)) {
        entry.element.remove()
        this.rendered.delete(id)
      }
    }
    this.renderQueued(snapshot.queued)
    this.initialRender = false
    this.renderStatus(snapshot.turn)
    this.renderChips()
    this.scrollToEnd()
  }

  /** Messages the user sent while a turn is running: shown at once, dimmed, until processed. */
  private renderQueued(queued: Signal[]) {
    const ids = new Set(queued.map((s) => s.id))
    for (const element of [...this.els.log.querySelectorAll<HTMLElement>('.msg.queued')]) {
      if (!ids.has(element.dataset.signal!)) element.remove()
    }
    for (const signal of queued) {
      if (this.els.log.querySelector(`.msg.queued[data-signal="${signal.id}"]`)) continue
      const text = textOf(signal.parts)
      if (!text) continue
      const element = document.createElement('div')
      element.className = 'msg user queued'
      element.dataset.signal = signal.id
      element.setAttribute('part', 'message user queued')
      element.textContent = `${signal.modality === 'transcript' ? '🎤 ' : ''}${text}`
      this.els.log.insertBefore(element, this.els.typing.nextSibling)
    }
  }

  private createMessageElement(message: Message): HTMLElement | undefined {
    if (message.role === 'tool') {
      if (this.options.showActions === false) return undefined
      const element = document.createElement('div')
      element.className = 'action'
      element.setAttribute('part', 'action')
      return element
    }
    const element = document.createElement('div')
    element.className = `msg ${message.role}`
    element.setAttribute('part', `message ${message.role}`)
    return element
  }

  private fillMessage(element: HTMLElement, message: Message) {
    const s = this.strings
    if (message.role === 'tool') {
      const label = message.route === 'direct' ? s.directAction : message.route === 'agent' ? s.agentAction : s.assistantAction
      element.classList.toggle('failed', !!message.error)
      element.textContent = `${label} ${message.name}${message.error ? ` — ${message.error}` : ''}`
      return
    }
    const text = textOf(message)
    const images = message.parts.filter((p): p is MediaPart => p.type === 'image')
    const rich = message.parts.filter((p) => p.type === 'data' && p.name === 'ui')
    const sources = this.options.sources === false || message.role !== 'assistant' ? [] : sourcesOf(message)
    if (!text && images.length === 0 && rich.length === 0 && sources.length === 0) {
      element.hidden = true // e.g. assistant message that only carries tool calls
      return
    }
    element.hidden = false
    if (message.role === 'user') {
      element.textContent = `${message.modality === 'transcript' ? '🎤 ' : ''}${text}`
      for (const image of images) element.append(this.imageElement(image))
      return
    }
    // Text is re-rendered on every update; rich parts (images, components such as
    // MCP App iframes) are created once, so they keep their state while text streams.
    const textElement = this.region(element, 'text')
    const sourceOptions = this.options.sources || {}
    textElement.innerHTML = !text ? '' : sources.length ? renderCitedText(message, sourceOptions) : renderMarkdown(text)
    textElement.hidden = !text
    const sourcesElement = this.region(element, 'sources')
    const list = sources.length ? sourceList(message, s.sources, s.consultedSources, sourceOptions) : undefined
    sourcesElement.replaceChildren(...(list ? [list] : []))
    sourcesElement.hidden = !list
    element.classList.toggle('streaming', !!message.streaming)
    element.classList.toggle('interrupted', !!message.interrupted)
    element.title = message.interrupted ? s.interrupted : ''
    element.classList.toggle('rich', rich.length > 0)
    const media = this.region(element, 'media')
    for (const part of message.parts) {
      if (this.renderedParts.has(part)) continue
      if (part.type === 'image') {
        this.renderedParts.add(part)
        media.append(this.imageElement(part as MediaPart))
      } else if (part.type === 'data' && part.name === 'ui') {
        this.renderedParts.add(part)
        const { component, props } = part.value as { component: string; props?: unknown }
        const renderer = this.options.renderers?.[component] ?? RENDERERS[component]
        if (!renderer || !this.h4b) continue
        try {
          media.append(renderer(props ?? {}, { h4b: this.h4b }))
        } catch (error) {
          this.h4b.emit('error', { error, source: `widget:renderer:${component}` })
        }
      }
    }
  }

  private region(element: HTMLElement, name: 'text' | 'sources' | 'media'): HTMLElement {
    const find = (n: string) => [...element.children].find((child) => child.classList.contains(n)) as HTMLElement | undefined
    let region = find(name)
    if (!region) {
      region = document.createElement('div')
      region.className = name
      if (name === 'text') element.prepend(region)
      else if (name === 'sources') {
        const text = find('text')
        if (text) text.after(region)
        else element.prepend(region)
      }
      else element.append(region)
    }
    return region
  }

  /** Clicks on references and sources: run the configured action, or show the source in the list. */
  private onSourceClick(event: Event) {
    const target = (event.target as Element | null)?.closest?.('[data-source]') as HTMLElement | null
    if (!target || !this.h4b) return
    const { source: id, message: messageId } = target.dataset
    const message = this.h4b.messages.find((m) => m.id === messageId)
    const source = message && sourcesOf(message).find((s) => s.id === id)
    if (!source) return
    const options = this.options.sources || {}
    if (options.action) {
      event.preventDefault()
      const { type: _, excerpt: __, ...args } = source
      void this.h4b.runAction(options.action, { ...args, messageId }, { origin: 'user' })
      return
    }
    if (target.tagName === 'BUTTON' && target.closest('.text')) {
      const item = this.root.getElementById(`src-${messageId}-${id}`)
      item?.scrollIntoView?.({ block: 'nearest' })
      item?.classList.add('flash')
      setTimeout(() => item?.classList.remove('flash'), 1200)
    }
  }

  private imageElement(image: MediaPart): HTMLImageElement {
    const img = document.createElement('img')
    img.alt = image.name ?? ''
    img.src =
      image.source.kind === 'url'
        ? image.source.url
        : image.source.kind === 'base64'
          ? `data:${image.mimeType};base64,${image.source.data}`
          : URL.createObjectURL(image.source.blob)
    return img
  }

  /**
   * Bot messages that arrive together (typical of non-streaming backends like
   * Rasa) are revealed one by one, `pace` ms apart, with a typing indicator.
   */
  private queueReveal(element: HTMLElement) {
    const pace = this.options.pace ?? 350
    if (pace <= 0) return
    element.classList.add('pending')
    this.revealQueue.push(element)
    if (!this.revealTimer) this.scheduleReveal()
  }

  private scheduleReveal() {
    const element = this.revealQueue[0]
    if (!element) {
      this.revealTimer = undefined
      this.els.typing.hidden = true
      return
    }
    const pace = this.options.pace ?? 350
    const wait = Math.max(0, pace - (Date.now() - this.lastReveal))
    this.els.typing.hidden = wait === 0
    this.revealTimer = setTimeout(() => {
      this.revealQueue.shift()
      element.classList.remove('pending')
      this.lastReveal = Date.now()
      this.scrollToEnd()
      this.scheduleReveal()
    }, wait)
  }

  /** Same states for every route, held briefly so instant commands don't flicker. */
  private renderStatus(turn: TurnStatus | undefined) {
    if (turn === this.shownTurn) return
    const wait = Math.max(0, 300 - (Date.now() - this.statusSince))
    clearTimeout(this.statusTimer)
    this.statusTimer = setTimeout(() => {
      this.shownTurn = turn
      this.statusSince = Date.now()
      const s = this.strings
      const el = this.els.status
      el.dataset.phase = turn?.phase ?? 'idle'
      const direct = turn?.route === 'direct' ? ' ⚡' : ''
      el.textContent = !turn
        ? ''
        : turn.phase === 'received'
          ? s.received
          : turn.phase === 'acting'
            ? s.acting + direct
            : turn.phase === 'done'
              ? s.done + direct
              : turn.phase === 'aborted'
                ? s.aborted
                : `${s.error}${turn.error ? `: ${turn.error}` : ''}`
    }, wait)
  }

  /** Menu suggestions while typing; otherwise the quick replies of the last bot message. */
  private renderChips() {
    if (!this.h4b) return
    const chips = this.els.chips
    chips.replaceChildren()
    const typed = this.els.input.value.trim()
    const menu = this.h4b.get('menu' as never) as MenuLike | undefined
    if (typed && menu) {
      for (const suggestion of menu.suggest(typed, 3)) {
        this.addChip(suggestion.label, () => {
          this.els.input.value = ''
          this.h4b?.signal(menu.commandSignal(suggestion.command.action, suggestion.command.args, suggestion.label) as any)
          this.renderChips()
        })
      }
      return
    }
    for (const reply of this.lastQuickReplies()) {
      this.addChip(reply.label, () =>
        this.h4b?.signal({
          modality: 'text',
          source: 'widget',
          parts: [
            { type: 'text', text: reply.label },
            ...(reply.payload ? [{ type: 'data' as const, name: 'reply_payload', value: reply.payload }] : []),
          ],
        }),
      )
    }
  }

  private lastQuickReplies(): QuickReply[] {
    const messages = this.h4b?.messages ?? []
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]!
      if (message.role === 'user') return []
      if (message.role !== 'assistant') continue
      const data = message.parts.find((p) => p.type === 'data' && p.name === 'quick_replies')
      if (data?.type === 'data' && Array.isArray(data.value)) return data.value as QuickReply[]
    }
    return []
  }

  private addChip(label: string, onClick: () => void) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.addEventListener('click', onClick)
    this.els.chips.append(button)
  }

  private scrollToEnd(force = false) {
    const log = this.els.log
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 120
    if (force || nearBottom) log.scrollTop = log.scrollHeight
  }

  /* ---------------------------------------------------------------------- */
  /* Files and camera                                                       */
  /* ---------------------------------------------------------------------- */

  private files(): FilesLike | undefined {
    return this.h4b?.get('files' as never) as FilesLike | undefined
  }

  private camera(): CameraLike | undefined {
    return this.h4b?.get('camera' as never) as CameraLike | undefined
  }

  private renderMedia() {
    this.els.attach.hidden = !this.files()
    this.els.cam.hidden = !this.camera()?.getState().supported
  }

  /** Text typed so far becomes the question about the image/file. */
  private takePrompt(): string | undefined {
    const text = this.els.input.value.trim()
    this.els.input.value = ''
    return text || undefined
  }

  private sendFiles(list: Iterable<File>) {
    try {
      this.files()?.attach(list, this.takePrompt())
    } catch (error) {
      this.showError((error as Error).message)
    }
  }

  private showError(message: string) {
    this.els.status.dataset.phase = 'error'
    this.els.status.textContent = message
  }

  private bindMediaButtons() {
    const { attach, cam, camera, input } = this.els
    attach.addEventListener('click', () => {
      const prompt = this.takePrompt()
      void this.files()
        ?.pick(prompt)
        .catch((error: Error) => this.showError(error.message))
    })
    input.addEventListener('paste', (event) => {
      const pasted = [...(event.clipboardData?.files ?? [])]
      if (!pasted.length || !this.files()) return
      event.preventDefault()
      this.sendFiles(pasted)
    })
    const win = this.els.window
    win.addEventListener('dragover', (event) => {
      if (!this.files() || !event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      win.classList.add('dragging')
    })
    win.addEventListener('dragleave', () => win.classList.remove('dragging'))
    win.addEventListener('drop', (event) => {
      win.classList.remove('dragging')
      const dropped = [...(event.dataTransfer?.files ?? [])]
      if (!dropped.length || !this.files()) return
      event.preventDefault()
      this.sendFiles(dropped)
    })

    const video = camera.querySelector('video')!
    const closeCamera = () => {
      camera.hidden = true
      this.camera()?.close()
    }
    cam.addEventListener('click', async () => {
      if (!camera.hidden) return closeCamera()
      camera.hidden = false
      try {
        await this.camera()?.open(video)
      } catch (error) {
        camera.hidden = true
        this.showError((error as Error).message)
      }
    })
    camera.querySelector('.cancel')!.addEventListener('click', closeCamera)
    camera.querySelector('.snap')!.addEventListener('click', async () => {
      try {
        await this.camera()?.capture(this.takePrompt())
      } catch (error) {
        this.showError((error as Error).message)
      }
      closeCamera()
    })
  }

  /* ---------------------------------------------------------------------- */
  /* Voice                                                                  */
  /* ---------------------------------------------------------------------- */

  /* ---------------------------------------------------------------------- */
  /* Privacy                                                                */
  /* ---------------------------------------------------------------------- */

  private renderPrivacy() {
    const { privacyButton, privacy } = this.els
    const retention = this.h4b?.get('retention')
    const consent = this.h4b?.consent
    privacyButton.hidden = (!retention && !consent?.enabled) || this.options.showPrivacy === false
    if (privacyButton.hidden) {
      privacy.hidden = true
      return
    }
    const s = this.strings
    privacy.replaceChildren()
    if (!retention) {
      const text = document.createElement('p')
      text.textContent = s.storedNowhere
      privacy.append(text)
      this.renderConsent(privacy)
      this.renderDelete(privacy)
      return
    }
    const where =
      retention.location === 'server' ? s.storedOnServer : retention.encrypted ? s.storedEncrypted : s.storedInBrowser
    const label = (r: Retention) => {
      if (r === 'key') {
        const minutes = retention!.keyTtlMinutes
        return minutes === 0 ? s.retentionKeyBrowser : minutes ? s.retentionKey.replace('{minutes}', String(minutes)) : s.retentionServer
      }
      if (r === 'server') return s.retentionServer
      if (r === 'tab') return s.retentionTab
      return s.retentionTtl.replace('{minutes}', String(r.ttlMinutes))
    }
    const text = document.createElement('p')
    text.textContent = where
    privacy.append(text)
    const choices = retention!.choices
    if (choices.length === 1) {
      const only = document.createElement('p')
      only.textContent = label(choices[0]!)
      privacy.append(only)
    } else {
      for (const [i, choice] of choices.entries()) {
        const option = document.createElement('label')
        const radio = document.createElement('input')
        radio.type = 'radio'
        radio.name = 'h4b-retention'
        radio.value = String(i)
        radio.checked = sameRetention(choice, retention!.current)
        radio.addEventListener('change', () => {
          retention!.set(choice).catch((error) => this.h4b?.emit('error', { error, source: 'widget' }))
        })
        option.append(radio, ` ${label(choice)}`)
        privacy.append(option)
      }
    }
    this.renderConsent(privacy)
    this.renderDelete(privacy)
  }

  /** One line per purpose: a checkbox, or its state and a button to your consent tool when `consent.manage` is set. */
  private renderConsent(privacy: HTMLElement) {
    const consent = this.h4b?.consent
    if (!consent?.enabled) return
    const s = this.strings
    const group = document.createElement('div')
    group.className = 'consent'
    group.setAttribute('part', 'consent')
    for (const purpose of consent.purposes) {
      const rule = consent.rules?.purposes[purpose]
      const name = consentText(rule?.label, this.language) ?? purpose
      const description = consentText(rule?.description, this.language)
      const state = consent.state(purpose)
      if (consent.manage) {
        const line = document.createElement('p')
        line.dataset.purpose = purpose
        line.textContent = `${name}: ${state === 'granted' ? s.consentGranted : state === 'denied' ? s.consentDenied : s.consentPending}`
        if (description) line.title = description
        group.append(line)
        continue
      }
      const option = document.createElement('label')
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.name = `h4b-consent-${purpose}`
      box.checked = state === 'granted'
      box.addEventListener('change', () => {
        consent.set({ [purpose]: box.checked }).catch((error) => this.h4b?.emit('error', { error, source: 'widget' }))
      })
      option.append(box, ` ${name}`)
      if (description) option.title = description
      group.append(option)
    }
    if (consent.manage) {
      const manage = document.createElement('button')
      manage.type = 'button'
      manage.className = 'manage-consent'
      manage.textContent = s.manageConsent
      manage.addEventListener('click', () => consent.manage?.())
      group.append(manage)
    }
    if (group.childElementCount > 0) privacy.append(group)
  }

  private renderDelete(privacy: HTMLElement) {
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'delete'
    remove.textContent = this.strings.deleteConversation
    remove.addEventListener('click', () => void this.h4b?.reset())
    privacy.append(remove)
  }

  private voice(): VoiceLike | undefined {
    return this.h4b?.get('voice' as never) as VoiceLike | undefined
  }

  private bindVoiceButtons() {
    const { mic, speaker } = this.els
    mic.addEventListener('pointerdown', (event) => {
      const voice = this.voice()
      if (!voice || voice.getState().mode !== 'push-to-talk') return
      event.preventDefault()
      mic.setPointerCapture?.(event.pointerId)
      void voice.listen({ until: 'stop' })
    })
    const release = () => {
      const voice = this.voice()
      if (voice?.getState().mode === 'push-to-talk' && voice.getState().listening) voice.stop()
    }
    mic.addEventListener('pointerup', release)
    mic.addEventListener('pointercancel', release)
    mic.addEventListener('click', () => {
      const voice = this.voice()
      if (voice?.getState().mode === 'hands-free') void voice.toggle()
    })
    speaker.addEventListener('click', () => {
      const voice = this.voice()
      if (!voice) return
      const state = voice.getState()
      if (state.speaking) voice.cancelSpeech()
      else voice.setOutput(state.output === 'text' ? 'auto' : 'text')
    })
  }

  private renderVoice() {
    const voice = this.voice()
    const { mic, speaker, partial } = this.els
    const state = voice?.getState()
    mic.hidden = !state?.supported.stt
    speaker.hidden = !state?.supported.tts
    if (!state) return
    const s = this.strings
    mic.setAttribute('aria-pressed', String(state.listening))
    mic.title = state.listening ? s.listening : state.mode === 'hands-free' ? s.handsFree : s.holdToTalk
    mic.setAttribute('aria-label', mic.title)
    speaker.textContent = state.speaking ? '⏹' : state.output === 'text' ? '🔇' : '🔈'
    speaker.title = state.speaking ? s.stopSpeaking : state.output === 'text' ? s.voiceOff : s.voiceOn
    speaker.setAttribute('aria-label', speaker.title)
    const failure = !state.listening && state.error ? this.voiceError(state.error) : ''
    partial.classList.toggle('failed', !!failure)
    partial.textContent = state.listening && state.partial ? `“${state.partial}”` : state.listening ? s.listening : failure
  }

  private voiceError({ code, stage }: { code: string; stage?: string }): string {
    const s = this.strings
    // Speaking failed: the reply is on screen, the microphone is not to blame.
    if (stage === 'speak') return code === 'output-blocked' ? s.voiceOutputBlocked : s.voiceSpeakFailed
    if (code === 'not-allowed') return s.micDenied
    if (code === 'service-not-allowed') return s.speechServiceOff
    if (code === 'audio-capture') return s.micMissing
    if (code === 'network') return s.voiceNetwork
    return s.voiceFailed
  }
}

/* Structural types so the widget doesn't depend on optional packages. */
type VoiceLike = {
  getState(): {
    supported: { stt: boolean; tts: boolean }
    mode: 'push-to-talk' | 'hands-free'
    listening: boolean
    speaking: boolean
    partial: string
    output: 'auto' | 'voice' | 'text'
    error?: { code: string; stage?: string }
  }
  subscribe(listener: () => void): () => void
  listen(options?: { until?: 'silence' | 'stop' }): Promise<void>
  stop(): void
  toggle(): Promise<void>
  setOutput(output: 'auto' | 'voice' | 'text'): void
  cancelSpeech(): void
}

type FilesLike = {
  pick(prompt?: string): Promise<unknown>
  attach(files: Iterable<File>, prompt?: string): unknown
}

type CameraLike = {
  getState(): { supported: boolean }
  open(video?: HTMLVideoElement): Promise<unknown>
  close(): void
  capture(prompt?: string): Promise<unknown>
}

type MenuLike = {
  suggest(text: string, limit?: number): { label: string; command: { action: string; args?: unknown } }[]
  commandSignal(action: string, args?: unknown, label?: string): unknown
}

declare global {
  interface HTMLElementTagNameMap {
    'h4b-chat': H4BChatElement
  }
}
