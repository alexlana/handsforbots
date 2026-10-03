import { definePlugin, type Part } from '@handsforbots/core'

export type GuiOptions = {
  /** Keep the current route (path + title) as context. Default true. */
  route?: boolean
  /** Keep the user's text selection as context ("explain this"). Default true. */
  selection?: boolean
  /**
   * Declarative hooks in the page (default true):
   *   <button data-h4b-say="Quero falar com um atendente">  → sends that text
   *   <button data-h4b-command="open_order" data-h4b-args='{"id":"1042"}'> → runs a direct action
   *   <section data-h4b-context="checkout" data-h4b-value='{"step":2}'> → context while present
   */
  declarative?: boolean
  /** Re-engage after inactivity (v1 Poke): sends `signal` text after `minutes` without input. */
  idle?: { minutes: number; text: string; once?: boolean }
  root?: Document
}

/** GUI events as signals: the successor of v1 Poke. */
export const gui = definePlugin<GuiOptions | undefined>({
  name: 'input-gui',
  apply(ctx, options = {}) {
    if (typeof document === 'undefined') return
    const doc = options.root ?? document
    const win = doc.defaultView ?? window

    const context = (key: string, parts: Part[] | undefined) =>
      parts ? ctx.signal({ kind: 'context', key, modality: 'gui-event', source: 'gui', parts }) : ctx.app.removeContext(key)

    if (options.route !== false) {
      const update = () =>
        context('gui.route', [{ type: 'data', name: 'route', value: { path: win.location.pathname + win.location.search + win.location.hash, title: doc.title } }])
      update()
      // SPAs change routes through the History API without events: wrap it while mounted.
      const history = win.history
      const original = { push: history.pushState, replace: history.replaceState }
      history.pushState = function (...args) {
        original.push.apply(this, args)
        update()
      }
      history.replaceState = function (...args) {
        original.replace.apply(this, args)
        update()
      }
      win.addEventListener('popstate', update)
      win.addEventListener('hashchange', update)
      ctx.onDispose(() => {
        history.pushState = original.push
        history.replaceState = original.replace
        win.removeEventListener('popstate', update)
        win.removeEventListener('hashchange', update)
        ctx.app.removeContext('gui.route')
      })
    }

    if (options.selection !== false) {
      let timer: ReturnType<typeof setTimeout> | undefined
      const onSelection = () => {
        clearTimeout(timer)
        timer = setTimeout(() => {
          const text = doc.getSelection()?.toString().trim().slice(0, 1000)
          context('gui.selection', text ? [{ type: 'text', text }] : undefined)
        }, 300)
      }
      doc.addEventListener('selectionchange', onSelection)
      ctx.onDispose(() => {
        clearTimeout(timer)
        doc.removeEventListener('selectionchange', onSelection)
      })
    }

    if (options.declarative !== false) {
      const onClick = (event: Event) => {
        const target = (event.target as Element | null)?.closest?.('[data-h4b-say],[data-h4b-command]') as HTMLElement | null
        if (!target) return
        const say = target.dataset.h4bSay
        if (say) {
          ctx.signal({ modality: 'gui-event', source: 'gui', parts: [{ type: 'text', text: say }], meta: { element: describe(target) } })
          return
        }
        const action = target.dataset.h4bCommand!
        let args: unknown = {}
        try {
          args = target.dataset.h4bArgs ? JSON.parse(target.dataset.h4bArgs) : {}
        } catch {
          ctx.emit('error', { error: new Error(`Invalid data-h4b-args on ${describe(target)}`), source: 'input-gui' })
          return
        }
        void ctx.app.runAction(action, args, { origin: 'user' })
      }
      doc.addEventListener('click', onClick)

      const sync = () => {
        const seen = new Set<string>()
        for (const element of doc.querySelectorAll<HTMLElement>('[data-h4b-context]')) {
          const key = `gui.${element.dataset.h4bContext}`
          seen.add(key)
          let value: unknown = element.dataset.h4bValue ?? element.textContent?.trim().slice(0, 500)
          try {
            value = element.dataset.h4bValue ? JSON.parse(element.dataset.h4bValue) : value
          } catch {
            /* keep as text */
          }
          const current = ctx.app.context.find((s) => s.key === key)
          const part = current?.parts[0]
          if (part?.type !== 'data' || JSON.stringify(part.value) !== JSON.stringify(value)) {
            context(key, [{ type: 'data', name: element.dataset.h4bContext!, value }])
          }
        }
        for (const signal of ctx.app.context) {
          if (signal.source === 'gui' && signal.key?.startsWith('gui.') && !['gui.route', 'gui.selection'].includes(signal.key) && !seen.has(signal.key)) {
            ctx.app.removeContext(signal.key)
          }
        }
      }
      sync()
      const observer = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => sync()) : undefined
      observer?.observe(doc.body ?? doc.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-h4b-context', 'data-h4b-value'],
      })
      ctx.onDispose(() => {
        doc.removeEventListener('click', onClick)
        observer?.disconnect()
      })
    }

    if (options.idle) {
      const { minutes, text, once = true } = options.idle
      let timer: ReturnType<typeof setTimeout> | undefined
      let fired = false
      const arm = () => {
        clearTimeout(timer)
        if (once && fired) return
        timer = setTimeout(() => {
          fired = true
          ctx.signal({ modality: 'gui-event', source: 'gui', parts: [{ type: 'text', text }], meta: { reason: 'idle' } })
        }, minutes * 60_000)
      }
      const offSignal = ctx.on('signal', (signal) => signal.kind === 'trigger' && signal.meta?.reason !== 'idle' && arm())
      const activity = () => arm()
      for (const type of ['pointerdown', 'keydown']) doc.addEventListener(type, activity, { passive: true })
      arm()
      ctx.onDispose(() => {
        clearTimeout(timer)
        offSignal()
        for (const type of ['pointerdown', 'keydown']) doc.removeEventListener(type, activity)
      })
    }
  },
})

function describe(element: HTMLElement) {
  return element.id ? `#${element.id}` : `${element.tagName.toLowerCase()}${element.className ? `.${String(element.className).split(' ')[0]}` : ''}`
}
