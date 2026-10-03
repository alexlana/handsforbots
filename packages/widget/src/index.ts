import { definePlugin, textOf, type H4B, type MediaPart, type Message, type TurnStatus } from '@handsforbots/core'
import { stringsFor, type Strings } from './i18n.js'
import { escapeHtml, renderMarkdown } from './markdown.js'
import { PALETTES, STYLES } from './styles.js'

export { renderMarkdown, escapeHtml } from './markdown.js'
export { stringsFor, STRINGS, type Strings } from './i18n.js'
export { PALETTES } from './styles.js'

export type QuickReply = { label: string; payload?: string }

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
  /** Shown (and recorded) when the conversation is empty. */
  greeting?: string | string[]
  disclaimer?: string
  /** Delay between bot messages that arrive together, in ms. Default 350. */
  pace?: number
  /** Show cards for actions run by the assistant, the menu or agents. Default true. */
  showActions?: boolean
  autofocus?: boolean
}

const TAG = 'h4b-chat'
const OPEN_KEY = 'h4b-widget-open'

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
  }
  private rendered = new Map<string, { message: Message; element: HTMLElement }>()
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
    this.strings = stringsFor(options.language ?? document.documentElement.lang, options.strings)
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
    this.cleanups.push(
      () => unsubscribeVoice?.(),
      h4b.on('service.provided', ({ key }) => key === ('voice' as never) && watchVoice()),
      h4b.on('service.removed', ({ key }) => key === ('voice' as never) && watchVoice()),
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
          <button class="close" type="button" aria-label="${escapeHtml(s.close)}">✕</button>
        </header>
        <div class="log" part="log" role="log" aria-live="polite" aria-relevant="additions text">
          ${o.disclaimer ? `<details class="disclaimer"><summary>${escapeHtml(s.disclaimer)}</summary>${renderMarkdown(o.disclaimer)}</details>` : ''}
          <div class="typing" aria-hidden="true" hidden>•••</div>
        </div>
        <div class="status" part="status" aria-live="polite"></div>
        <div class="chips" part="chips"></div>
        <div class="partial" part="partial" aria-live="polite"></div>
        <form part="composer">
          <label class="sr-only" for="chat_input">${escapeHtml(s.placeholder)}</label>
          <input id="chat_input" autocomplete="off" placeholder="${escapeHtml(s.placeholder)}">
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
    }
    const { launcher, form, input } = this.els
    const close = $<HTMLButtonElement>('.close')
    if (this.dataset.alwaysOpen !== undefined) {
      close.hidden = true
      launcher.dataset.hidden = ''
      launcher.hidden = true
    }

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
      if (this.options.autofocus) this.els.input.focus()
    }
  }

  private greet() {
    const greeting = this.options.greeting
    if (!greeting || !this.h4b || this.h4b.messages.length > 0) return
    const lines = Array.isArray(greeting) ? greeting : [greeting]
    void this.h4b.push(
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
    this.initialRender = false
    this.renderStatus(snapshot.turn)
    this.renderChips()
    this.scrollToEnd()
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
    if (!text && images.length === 0) {
      element.hidden = true // e.g. assistant message that only carries tool calls
      return
    }
    element.hidden = false
    if (message.role === 'user') {
      element.textContent = `${message.modality === 'transcript' ? '🎤 ' : ''}${text}`
    } else {
      element.innerHTML = renderMarkdown(text)
      element.classList.toggle('streaming', !!message.streaming)
    }
    for (const image of images) {
      const img = document.createElement('img')
      img.alt = image.name ?? ''
      img.src =
        image.source.kind === 'url'
          ? image.source.url
          : image.source.kind === 'base64'
            ? `data:${image.mimeType};base64,${image.source.data}`
            : URL.createObjectURL(image.source.blob)
      element.append(img)
    }
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
  /* Voice                                                                  */
  /* ---------------------------------------------------------------------- */

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
      void voice.listen()
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
    partial.textContent = state.listening && state.partial ? `“${state.partial}”` : state.listening ? s.listening : ''
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
  }
  subscribe(listener: () => void): () => void
  listen(): Promise<void>
  stop(): void
  toggle(): Promise<void>
  setOutput(output: 'auto' | 'voice' | 'text'): void
  cancelSpeech(): void
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
