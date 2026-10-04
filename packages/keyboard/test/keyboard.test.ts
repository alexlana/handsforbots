// @vitest-environment jsdom
import { createH4B, type Transport } from '@handsforbots/core'
import type { VoiceService, VoiceState } from '@handsforbots/voice'
import { describe, expect, it, vi } from 'vitest'
import { keyboard, parseCombo } from '../src/index.js'

function fakeVoice(mode: VoiceState['mode'] = 'push-to-talk', speaking = false) {
  return {
    getState: () => ({ mode, speaking }) as VoiceState,
    subscribe: () => () => {},
    listen: vi.fn(async (_options?: { until?: 'silence' | 'stop' }) => {}),
    stop: vi.fn(),
    cancel: vi.fn(),
    toggle: vi.fn(async () => {}),
    setMode: vi.fn(),
    setOutput: vi.fn(),
    speak: vi.fn(async () => {}),
    cancelSpeech: vi.fn(),
  } satisfies VoiceService
}

const press = (type: 'keydown' | 'keyup', init: KeyboardEventInit) =>
  window.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }))

async function setup(voice?: VoiceService, options = {}) {
  const h4b = createH4B({ plugins: [keyboard(options)] })
  if (voice) h4b.provide('voice', voice)
  await h4b.start()
  return h4b
}

describe('keyboard', () => {
  it('parses combos with Mod as Ctrl or Cmd', () => {
    expect(parseCombo('Alt+KeyM')).toMatchObject({ key: 'KeyM', alt: true, ctrl: false, meta: false })
    const mod = parseCombo('Mod+KeyK')
    expect(mod.ctrl || mod.meta).toBe(true)
  })

  it('holds to talk in push-to-talk mode', async () => {
    const voice = fakeVoice()
    const h4b = await setup(voice)
    press('keydown', { code: 'KeyM', key: 'µ', altKey: true })
    press('keydown', { code: 'KeyM', key: 'µ', altKey: true, repeat: true })
    expect(voice.listen).toHaveBeenCalledOnce()
    expect(voice.listen).toHaveBeenCalledWith({ until: 'stop' })
    press('keyup', { code: 'KeyM', key: 'm' }) // Alt already released
    expect(voice.stop).toHaveBeenCalledOnce()
    await h4b.stop()
  })

  it('toggles listening in hands-free mode', async () => {
    const voice = fakeVoice('hands-free')
    const h4b = await setup(voice)
    press('keydown', { code: 'KeyM', key: 'm', altKey: true })
    press('keyup', { code: 'KeyM', key: 'm' })
    expect(voice.toggle).toHaveBeenCalledOnce()
    expect(voice.stop).not.toHaveBeenCalled()
    await h4b.stop()
  })

  it('Escape interrupts speech and the running turn, and is ignored otherwise', async () => {
    const voice = fakeVoice('push-to-talk', true)
    const transport: Transport = {
      name: 'hang',
      async *run(_r, signal) {
        await new Promise((resolve) => signal.addEventListener('abort', resolve))
      },
    }
    const h4b = await setup(voice)
    h4b.provide('transport', transport)
    const turn = h4b.ask('demora')
    await new Promise((r) => setTimeout(r, 5))
    const interrupted = vi.fn()
    h4b.on('keyboard.interrupt', interrupted)
    press('keydown', { key: 'Escape', code: 'Escape' })
    expect((await turn).status.phase).toBe('aborted')
    expect(voice.cancelSpeech).toHaveBeenCalled()
    expect(interrupted).toHaveBeenCalledOnce()
    await h4b.stop()
  })

  it('emits a palette request and can disable shortcuts', async () => {
    const h4b = await setup(undefined, { talk: false })
    const palette = vi.fn()
    h4b.on('keyboard.palette', palette)
    press('keydown', { code: 'KeyK', key: 'k', ctrlKey: true })
    press('keydown', { code: 'KeyK', key: 'k', metaKey: true })
    expect(palette).toHaveBeenCalledOnce()
    await h4b.stop()
    press('keydown', { code: 'KeyK', key: 'k', ctrlKey: true, metaKey: true })
    expect(palette).toHaveBeenCalledOnce()
  })
})
