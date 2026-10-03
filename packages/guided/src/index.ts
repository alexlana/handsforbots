import { definePlugin, textOf, type ActionDefinition, type PluginContext, type Signal } from '@handsforbots/core'
import { fuzzyBest, type FuzzyEntry } from '@handsforbots/menu'

export type GuideStep = {
  title?: string
  text: string
  /** CSS selector of the element to point at (searched inside open shadow roots too). No target: a centered modal. */
  target?: string
  next?: string
  previous?: string
  close?: string
}

export type GuidedOptions = {
  /** Named tours the assistant or the host can start. */
  tours?: Record<string, GuideStep[]>
  /** Start this tour when the conversation is empty. */
  autoStart?: string
  language?: string
  /** Speak step texts when the user is using voice. Default true. */
  narrate?: boolean
  /** Extra navigation phrases (merged with the defaults). */
  vocabulary?: { next?: string[]; previous?: string[]; close?: string[] }
  /**
   * `show_section` action (successor of v1 ShowRelevantContent): elements
   * carrying this attribute (e.g. 'data-section') can be scrolled to and
   * highlighted by the assistant, the menu or agents.
   */
  sectionsAttribute?: string
  /**
   * `image_gallery` action (successor of v1 ImageGallery): shows the page's
   * images marked with data-image-gallery-id (and texts marked with
   * data-image-gallery-text-for) in the conversation. Default false.
   */
  gallery?: boolean
}

export type GuidedState = { active: boolean; tour?: string; step: number; total: number }

export type GuidedService = {
  getState(): GuidedState
  subscribe(listener: () => void): () => void
  start(tour: string | GuideStep[]): void
  highlight(target: string, text?: string, title?: string): boolean
  next(): void
  previous(): void
  close(): void
}

declare module '@handsforbots/core' {
  interface Services {
    guided: GuidedService
  }
}

const LABELS: Record<string, { next: string; previous: string; close: string; finish: string; tour: string }> = {
  en: { next: 'Next', previous: 'Previous', close: 'Close', finish: 'Got it', tour: 'Guided tour' },
  pt: { next: 'Próximo', previous: 'Anterior', close: 'Fechar', finish: 'Entendi', tour: 'Tour guiado' },
}

/** Navigation vocabulary from v1 GUIDed (1 = next, -1 = previous, 0 = close). */
const VOCABULARY: Record<string, Record<'next' | 'previous' | 'close', string[]>> = {
  en: {
    next: ['next', 'forward', 'go on', 'continue', 'start', "let's start", 'ok', 'okay', 'got it', 'understood', 'thanks', "what's next", 'more', 'cool', 'great'],
    previous: ['previous', 'back', 'go back', 'before'],
    close: ['skip', 'skip tour', 'cancel', 'close', 'stop', 'enough', 'exit'],
  },
  pt: {
    next: ['próximo', 'avançar', 'seguir', 'segue', 'bora seguir', 'iniciar', 'começar', 'vamos começar', 'entendi', 'ok', 'tá bem', 'obrigado', 'o que mais', 'mais', 'legal', 'ótimo'],
    previous: ['anterior', 'voltar', 'volta'],
    close: ['pular', 'pular guia', 'pular este guia', 'cancelar', 'chega', 'fechar', 'sair', 'parar'],
  },
}

const languageKey = (language?: string) => ((language ?? 'en').toLowerCase().startsWith('pt') ? 'pt' : 'en')

/** querySelector that also looks inside open shadow roots (e.g. the <h4b-chat> widget). */
export function queryDeep(selector: string, root: Document | ShadowRoot = document): Element | null {
  const direct = root.querySelector(selector)
  if (direct) return direct
  for (const element of root.querySelectorAll('*')) {
    if (element.shadowRoot) {
      const found = queryDeep(selector, element.shadowRoot)
      if (found) return found
    }
  }
  return null
}

const stepSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    text: { type: 'string' },
    target: { type: 'string', description: 'CSS selector of the element to point at; omit for a centered message' },
  },
  required: ['text'],
}

export const guided = definePlugin<GuidedOptions | undefined>({
  name: 'guided',
  provides: ['guided'],
  apply(ctx, options = {}) {
    if (typeof document === 'undefined') return
    const service = createGuided(ctx, options)
    ctx.provide('guided', service)

    const tourNames = Object.keys(options.tours ?? {})
    ctx.registerAction({
      name: 'guided_tour',
      description:
        'Shows the user around the screen with a step-by-step guided tour.' +
        (tourNames.length ? ` Named tours: ${tourNames.join(', ')}.` : '') +
        ' Pass `name` for a named tour or `steps` for a custom one.',
      parameters: {
        type: 'object',
        properties: {
          name: tourNames.length ? { type: 'string', enum: tourNames } : { type: 'string' },
          steps: { type: 'array', items: stepSchema },
        },
      },
      readOnly: true,
      handler: ({ name, steps }: { name?: string; steps?: GuideStep[] }) => {
        if (steps?.length) service.start(steps)
        else if (name && options.tours?.[name]) service.start(name)
        else throw new Error(name ? `Unknown tour "${name}"` : 'Give a tour name or steps')
        return { started: true, steps: service.getState().total }
      },
      describeResult: () => undefined,
    })
    ctx.registerAction({
      name: 'guided_highlight',
      description: 'Points at an element on the screen with a short explanation (e.g. "where do I export?").',
      parameters: {
        type: 'object',
        properties: { target: { type: 'string', description: 'CSS selector' }, text: { type: 'string' }, title: { type: 'string' } },
        required: ['target'],
      },
      readOnly: true,
      handler: ({ target, text, title }: { target: string; text?: string; title?: string }) => {
        if (!service.highlight(target, text, title)) throw new Error(`Nothing on screen matches "${target}"`)
        return { shown: true }
      },
    })
    ctx.registerAction({
      name: 'guided_close',
      description: 'Closes the guided tour or highlight.',
      readOnly: true,
      handler: () => {
        service.close()
        return { closed: true }
      },
    })

    if (options.sectionsAttribute) registerSections(ctx, service, options.sectionsAttribute)
    if (options.gallery) registerGallery(ctx)

    if (options.autoStart && options.tours?.[options.autoStart]) {
      const start = () => ctx.app.messages.length === 0 && service.start(options.autoStart!)
      // Wait for history to be restored before deciding.
      setTimeout(start, 0)
    }
  },
})

/**
 * Registers an action whose enum follows what is on the page: re-registered
 * when matching elements appear or disappear.
 */
function dynamicAction(ctx: PluginContext, selector: string, build: (values: string[]) => ActionDefinition<any, any> | undefined) {
  let unregister: (() => void) | undefined
  let current = ''
  const sync = () => {
    const values = [...new Set([...document.querySelectorAll(selector)].map((el) => valueOf(el, selector)).filter(Boolean))] as string[]
    const key = values.join('\u0000')
    if (key === current) return
    current = key
    unregister?.()
    const action = values.length ? build(values) : undefined
    unregister = action ? ctx.registerAction(action) : undefined
  }
  sync()
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => sync())
    observer.observe(document.body, { subtree: true, childList: true, attributes: true })
    ctx.onDispose(() => observer.disconnect())
  }
}

const valueOf = (el: Element, selector: string) => el.getAttribute(selector.slice(1, -1)) ?? ''

/** CSS.escape with a fallback for older engines. */
const cssEscape = (value: string) =>
  typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&')

function registerSections(ctx: PluginContext, service: GuidedService, attribute: string) {
  dynamicAction(ctx, `[${attribute}]`, (sections) => ({
    name: 'show_section',
    description: `Scrolls to a section of the page and highlights it. Use it when the user asks about a part of the page. Sections: ${sections.join(', ')}.`,
    parameters: {
      type: 'object',
      properties: {
        section: { type: 'string', enum: sections },
        text: { type: 'string', description: 'Optional short explanation shown next to it' },
      },
      required: ['section'],
    },
    readOnly: true,
    exposeTo: ['assistant', 'user', 'agent'],
    handler: ({ section, text }: { section: string; text?: string }) => {
      const selector = `[${attribute}="${cssEscape(section)}"]`
      const element = document.querySelector(selector)
      if (!element) throw new Error(`Section "${section}" is not on this page`)
      element.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      if (text) service.highlight(selector, text)
      else {
        element.animate?.([{ outline: '3px solid #6b3fd4', outlineOffset: '4px' }, { outline: '3px solid transparent', outlineOffset: '4px' }], {
          duration: 1600,
          iterations: 2,
        })
      }
      return { shown: section }
    },
  }))
}

function registerGallery(ctx: PluginContext) {
  dynamicAction(ctx, '[data-image-gallery-id]', (topics) => ({
    name: 'image_gallery',
    description: `Shows images and texts from the page about a topic in the conversation. Topics: ${topics.join(', ')}.`,
    parameters: {
      type: 'object',
      properties: {
        topics: { type: 'array', items: { type: 'string', enum: topics }, description: 'One or more topics' },
        title: { type: 'string', description: 'Short title for the gallery' },
      },
      required: ['topics'],
    },
    readOnly: true,
    exposeTo: ['assistant', 'user', 'agent'],
    handler: ({ topics: chosen, title }: { topics: string[] | string; title?: string }, call) => {
      const list = Array.isArray(chosen) ? chosen : String(chosen).split(',').map((t) => t.trim())
      const images = list.flatMap((topic) =>
        [...document.querySelectorAll<HTMLImageElement>(`[data-image-gallery-id="${cssEscape(topic)}"]`)].map((img) => ({
          src: img.currentSrc || img.src || img.getAttribute('data-src') || '',
          alt: img.alt,
        })),
      )
      const texts = list.flatMap((topic) =>
        [...document.querySelectorAll(`[data-image-gallery-text-for~="${cssEscape(topic)}"]`)].map((el) => el.textContent?.trim() ?? ''),
      )
      if (!images.length) throw new Error(`No images for ${list.join(', ')}`)
      call.render?.('gallery', { title: title ?? list.join(', '), images, texts: texts.filter(Boolean) })
      return { images: images.length, texts: texts.length }
    },
  }))
}

function createGuided(ctx: PluginContext, options: GuidedOptions): GuidedService {
  const lang = languageKey(options.language ?? document.documentElement.lang)
  const labels = LABELS[lang]!
  const vocabulary: FuzzyEntry<number>[] = (['next', 'previous', 'close'] as const).flatMap((kind) =>
    [...VOCABULARY[lang]![kind], ...(options.vocabulary?.[kind] ?? [])].map((phrase) => ({
      phrase,
      value: kind === 'next' ? 1 : kind === 'previous' ? -1 : 0,
    })),
  )

  let steps: GuideStep[] = []
  let index = 0
  let tourName: string | undefined
  let releaseCapture: (() => void) | undefined
  let overlay: GuideOverlay | undefined
  const listeners = new Set<() => void>()
  let state: GuidedState = { active: false, step: 0, total: 0 }
  const set = (next: GuidedState) => {
    state = next
    for (const listener of listeners) listener()
  }

  const navigation = (signal: Signal) => {
    if (signal.modality !== 'text' && signal.modality !== 'transcript') return undefined
    return fuzzyBest(textOf(signal.parts), vocabulary, { threshold: 0.8, maxWords: 4 })?.value
  }

  const narrate = (step: GuideStep) => {
    if (options.narrate === false) return
    const voice = ctx.get('voice' as never) as
      | { getState(): { output: string; lastInput: string }; speak(text: string): Promise<void>; cancelSpeech(): void }
      | undefined
    if (!voice) return
    const { output, lastInput } = voice.getState()
    if (output === 'voice' || (output === 'auto' && lastInput === 'voice')) {
      voice.cancelSpeech()
      void voice.speak([step.title, step.text].filter(Boolean).join('. '))
    }
  }

  const show = () => {
    const step = steps[index]
    if (!step) return service.close()
    overlay ??= new GuideOverlay(labels, {
      next: () => service.next(),
      previous: () => service.previous(),
      close: () => service.close(),
    })
    overlay.show(step, index, steps.length)
    set({ active: true, tour: tourName, step: index, total: steps.length })
    narrate(step)
  }

  const service: GuidedService = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start(tour) {
      const list = typeof tour === 'string' ? options.tours?.[tour] : tour
      if (!list?.length) throw new Error(typeof tour === 'string' ? `Unknown tour "${tour}"` : 'A tour needs steps')
      steps = list
      tourName = typeof tour === 'string' ? tour : undefined
      index = 0
      releaseCapture?.()
      // While the tour is open, "next", "voltar", "pular"… navigate it; anything else
      // (a real question) still goes to the assistant.
      releaseCapture = ctx.capture(
        (signal) => {
          const direction = navigation(signal)
          if (direction === 1) service.next()
          else if (direction === -1) service.previous()
          else service.close()
        },
        { accepts: (signal) => navigation(signal) !== undefined },
      )
      show()
    },
    highlight(target, text, title) {
      if (!queryDeep(target)) return false
      service.start([{ target, text: text ?? '', title, close: labels.close }])
      return true
    },
    next() {
      if (!state.active) return
      index++
      if (index >= steps.length) service.close()
      else show()
    },
    previous() {
      if (!state.active || index === 0) return
      index--
      show()
    },
    close() {
      releaseCapture?.()
      releaseCapture = undefined
      overlay?.hide()
      steps = []
      index = 0
      tourName = undefined
      if (state.active) set({ active: false, step: 0, total: 0 })
    },
  }

  ctx.onDispose(() => {
    service.close()
    overlay?.destroy()
    listeners.clear()
  })
  return service
}

/* -------------------------------------------------------------------------- */
/* Overlay                                                                    */
/* -------------------------------------------------------------------------- */

const OVERLAY_CSS = /* css */ `
:host { all: initial; }
.backdrop { position: fixed; inset: 0; z-index: 2147483100; background: rgba(15, 14, 25, .45); }
.backdrop.spot { background: transparent; }
.ring {
  position: fixed; z-index: 2147483101; border-radius: 10px; pointer-events: none;
  box-shadow: 0 0 0 3px var(--h4b-guide-accent, #6b3fd4), 0 0 0 9999px rgba(15, 14, 25, .45);
  transition: all .25s ease;
}
.card {
  position: fixed; z-index: 2147483102; max-width: min(340px, calc(100vw - 24px));
  background: var(--h4b-guide-bg, #fff); color: var(--h4b-guide-text, #1d1b29);
  border-radius: 14px; padding: 16px 18px; box-shadow: 0 16px 50px rgba(0,0,0,.25);
  font: 15px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif;
}
.card.modal { left: 50%; top: 50%; transform: translate(-50%, -50%); }
.card h2 { font-size: 16px; margin: 0 0 6px; }
.card p { margin: 0; white-space: pre-line; }
.card footer { display: flex; gap: 8px; justify-content: flex-end; align-items: center; margin-top: 14px; }
.card footer .count { margin-right: auto; font-size: 12px; opacity: .6; }
.card button { font: inherit; font-size: 14px; border-radius: 99px; padding: 6px 14px; cursor: pointer; border: 1px solid var(--h4b-guide-accent, #6b3fd4); background: transparent; color: var(--h4b-guide-accent, #6b3fd4); }
.card button.primary { background: var(--h4b-guide-accent, #6b3fd4); color: white; }
@media (prefers-color-scheme: dark) { .card { background: var(--h4b-guide-bg, #1d1c27); color: var(--h4b-guide-text, #ecebf3); } }
@media (prefers-reduced-motion: reduce) { .ring { transition: none; } }
`

type Labels = (typeof LABELS)[string]

class GuideOverlay {
  private host: HTMLElement
  private root: ShadowRoot
  private backdrop: HTMLElement
  private ring: HTMLElement
  private card: HTMLElement
  private target?: Element
  private reposition = () => this.place()
  private onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') this.actions.close()
    else if (event.key === 'ArrowRight') this.actions.next()
    else if (event.key === 'ArrowLeft') this.actions.previous()
  }

  constructor(
    private labels: Labels,
    private actions: { next(): void; previous(): void; close(): void },
  ) {
    this.host = document.createElement('h4b-guide')
    this.root = this.host.attachShadow({ mode: 'open' })
    this.root.innerHTML = `<style>${OVERLAY_CSS}</style><div class="backdrop"></div><div class="ring" hidden></div><section class="card" role="dialog" aria-modal="true"></section>`
    this.backdrop = this.root.querySelector('.backdrop')!
    this.ring = this.root.querySelector('.ring')!
    this.card = this.root.querySelector('.card')!
    this.backdrop.addEventListener('click', () => this.actions.close())
  }

  show(step: GuideStep, index: number, total: number) {
    if (!this.host.isConnected) {
      document.body.append(this.host)
      window.addEventListener('resize', this.reposition)
      window.addEventListener('scroll', this.reposition, true)
      document.addEventListener('keydown', this.onKey)
    }
    this.target = step.target ? (queryDeep(step.target) ?? undefined) : undefined
    const last = index === total - 1
    this.card.className = `card${this.target ? '' : ' modal'}`
    this.card.setAttribute('aria-label', step.title ?? this.labels.tour)
    this.card.replaceChildren()
    if (step.title) this.card.append(el('h2', step.title))
    if (step.text) this.card.append(el('p', step.text))
    const footer = el('footer')
    if (total > 1) footer.append(el('span', `${index + 1}/${total}`, 'count'))
    if (index > 0) footer.append(button(step.previous ?? `‹ ${this.labels.previous}`, () => this.actions.previous()))
    if (!last) footer.append(button(step.close ?? this.labels.close, () => this.actions.close()))
    const primary = button(last ? (step.close ?? this.labels.finish) : (step.next ?? `${this.labels.next} ›`), () =>
      last ? this.actions.close() : this.actions.next(),
    )
    primary.classList.add('primary')
    footer.append(primary)
    this.card.append(footer)

    this.backdrop.classList.toggle('spot', !!this.target)
    this.ring.hidden = !this.target
    this.target?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    this.place()
    primary.focus()
  }

  private place() {
    if (!this.target) return
    const rect = this.target.getBoundingClientRect()
    const pad = 6
    Object.assign(this.ring.style, {
      left: `${rect.left - pad}px`,
      top: `${rect.top - pad}px`,
      width: `${rect.width + pad * 2}px`,
      height: `${rect.height + pad * 2}px`,
    })
    const card = this.card.getBoundingClientRect()
    const below = rect.bottom + 14
    const fitsBelow = below + card.height < window.innerHeight
    const top = fitsBelow ? below : Math.max(12, rect.top - card.height - 14)
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - card.width / 2), window.innerWidth - card.width - 12)
    Object.assign(this.card.style, { top: `${top}px`, left: `${Math.max(12, left)}px` })
  }

  hide() {
    window.removeEventListener('resize', this.reposition)
    window.removeEventListener('scroll', this.reposition, true)
    document.removeEventListener('keydown', this.onKey)
    this.host.remove()
  }

  destroy() {
    this.hide()
  }
}

function el(tag: string, text?: string, className?: string) {
  const element = document.createElement(tag)
  if (text !== undefined) element.textContent = text
  if (className) element.className = className
  return element
}

function button(label: string, onClick: () => void) {
  const element = el('button', label) as HTMLButtonElement
  element.type = 'button'
  element.addEventListener('click', onClick)
  return element
}
