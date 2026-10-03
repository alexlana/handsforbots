import { definePlugin } from '@handsforbots/core'
// Type-only: brings the optional `voice` service into `Services`.
import type {} from '@handsforbots/voice'

export type Shortcut = string | false

export type KeyboardOptions = {
  /**
   * Hold to talk (push-to-talk) or toggle listening (hands-free). Needs the
   * voice plugin. Default 'Alt+KeyM'. Combos use KeyboardEvent.code or .key;
   * `Mod` is Cmd on Apple platforms and Ctrl elsewhere.
   */
  talk?: Shortcut
  /** Stop speech and cancel the running turn. Default 'Escape'. */
  interrupt?: Shortcut
  /** Asks the host to open its command palette (`keyboard.palette` event). Default 'Mod+KeyK'. */
  palette?: Shortcut
  /** Where to listen. Default: window. */
  target?: EventTarget
}

declare module '@handsforbots/core' {
  interface Events {
    'keyboard.palette': { source: 'shortcut' }
    'keyboard.interrupt': { source: 'shortcut' }
  }
}

type Combo = { key: string; alt: boolean; ctrl: boolean; meta: boolean; shift: boolean }

const isApple = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

export function parseCombo(combo: string): Combo {
  const parts = combo.split('+').map((p) => p.trim())
  const key = parts.pop() ?? ''
  const has = (name: string) => parts.some((p) => p.toLowerCase() === name)
  const mod = has('mod')
  return {
    key,
    alt: has('alt') || has('option'),
    shift: has('shift'),
    ctrl: has('ctrl') || has('control') || (mod && !isApple()),
    meta: has('meta') || has('cmd') || (mod && isApple()),
  }
}

export function matches(event: KeyboardEvent, combo: Combo, { ignoreModifiers = false } = {}): boolean {
  const keyMatches = event.code === combo.key || event.key.toLowerCase() === combo.key.toLowerCase()
  if (!keyMatches) return false
  if (ignoreModifiers) return true
  return (
    event.altKey === combo.alt && event.ctrlKey === combo.ctrl && event.metaKey === combo.meta && event.shiftKey === combo.shift
  )
}

export const keyboard = definePlugin<KeyboardOptions | undefined>({
  name: 'keyboard',
  apply(ctx, options = {}) {
    const target = options.target ?? (typeof window !== 'undefined' ? window : undefined)
    if (!target) return
    const talk = options.talk === false ? undefined : parseCombo(options.talk ?? 'Alt+KeyM')
    const interrupt = options.interrupt === false ? undefined : parseCombo(options.interrupt ?? 'Escape')
    const palette = options.palette === false ? undefined : parseCombo(options.palette ?? 'Mod+KeyK')
    let holding = false

    const onKeyDown = (raw: Event) => {
      const event = raw as KeyboardEvent
      const voice = ctx.get('voice')
      if (talk && voice && matches(event, talk)) {
        event.preventDefault()
        if (event.repeat || holding) return
        if (voice.getState().mode === 'hands-free') {
          void voice.toggle()
        } else {
          holding = true
          void voice.listen()
        }
        return
      }
      if (interrupt && matches(event, interrupt)) {
        const busy = ctx.app.busy
        const speaking = voice?.getState().speaking
        if (!busy && !speaking) return // let Escape do its usual job
        voice?.cancelSpeech()
        if (busy) ctx.app.abort()
        ctx.emit('keyboard.interrupt', { source: 'shortcut' })
        return
      }
      if (palette && matches(event, palette)) {
        event.preventDefault()
        ctx.emit('keyboard.palette', { source: 'shortcut' })
      }
    }

    // Releasing the key (even with modifiers already up) ends push-to-talk.
    const onKeyUp = (raw: Event) => {
      const event = raw as KeyboardEvent
      if (!holding || !talk || !matches(event, talk, { ignoreModifiers: true })) return
      holding = false
      ctx.get('voice')?.stop()
    }
    const onBlur = () => {
      if (!holding) return
      holding = false
      ctx.get('voice')?.stop()
    }

    target.addEventListener('keydown', onKeyDown)
    target.addEventListener('keyup', onKeyUp)
    target.addEventListener('blur', onBlur)
    ctx.onDispose(() => {
      target.removeEventListener('keydown', onKeyDown)
      target.removeEventListener('keyup', onKeyUp)
      target.removeEventListener('blur', onBlur)
    })
  },
})
