import { createH4B, type Stimulus } from '@handsforbots/core'
import { eventually, reply, scriptedTransport, waitForIdle } from '@handsforbots/testkit'
import { voice, type TextToSpeech } from '@handsforbots/voice'
import { describe, expect, it, vi } from 'vitest'
import { cues, type CuesOptions } from '../src/index.js'

const tone = { values: ['neutro', 'contente', 'confuso'], default: 'neutro' }
const effect = (value: unknown): Stimulus => ({ type: 'ui.effect', name: 'cues', value })

/** Speaks nothing until `finish()`; every chunk queues behind the one playing. */
function gatedSpeaker() {
  const spoken: string[] = []
  const finishers: (() => void)[] = []
  const provider: TextToSpeech = {
    name: 'gated',
    isSupported: () => true,
    speak(text, options) {
      spoken.push(text)
      return new Promise((resolve) => {
        finishers.push(resolve)
        options.signal?.addEventListener('abort', () => resolve(), { once: true })
      })
    },
    cancel: vi.fn(),
  }
  return { provider, spoken, finish: () => finishers.splice(0).forEach((f) => f()) }
}

const second: Stimulus[] = [effect({ tone: 'confuso' }), ...reply('Segunda.', 'm2')]

async function setup(output: 'voice' | 'text', options: Partial<CuesOptions> = {}) {
  const speaker = gatedSpeaker()
  const transport = scriptedTransport([[effect({ tone: 'contente' }), ...reply('Primeira.', 'm1')], reply('Terceira.', 'm3')])
  const h4b = await createH4B({
    memory: false,
    plugins: [voice({ language: 'pt-BR', output, tts: speaker.provider }), cues({ channels: { tone }, ...options })],
  }).start()
  h4b.provide('transport', transport)
  const seen: string[] = []
  h4b.on('cue.changed', (e) => seen.push(e.value))
  const tone$ = () => h4b.get('cues')!.getState().tone!
  return { h4b, speaker, transport, seen, tone$ }
}

describe('cues synced with speech', () => {
  it('shows a spoken reply\u2019s cues when its first chunk starts, not when it arrives', async () => {
    const { h4b, speaker, seen, tone$ } = await setup('voice')
    await h4b.ask('um')
    await eventually(() => expect(speaker.spoken).toEqual(['Primeira.']))
    await eventually(() => expect(tone$().value).toBe('contente'))

    // A reply pushed while the first one is still playing.
    await h4b.push(second)
    await waitForIdle(h4b)
    const m2 = h4b.messages.find((m) => m.id === 'm2')!
    const stored = m2.role === 'assistant' ? m2.parts.find((p) => p.type === 'data' && p.name === 'cues') : undefined
    expect(stored).toMatchObject({ value: { tone: { value: 'confuso' } } })
    expect(tone$().value).toBe('contente')
    expect(seen).not.toContain('confuso')

    speaker.finish()
    await eventually(() => expect(speaker.spoken).toEqual(['Primeira.', 'Segunda.']))
    await eventually(() => expect(tone$()).toMatchObject({ value: 'confuso', messageId: 'm2' }))
  })

  it('reports what was decided to the backend even before it is spoken', async () => {
    const { h4b, transport, tone$ } = await setup('voice', { report: true })
    await h4b.ask('um')
    await h4b.push(second)
    await waitForIdle(h4b)
    expect(tone$().value).toBe('contente')
    await h4b.ask('dois')
    const sent = transport.requests[1]!.context.find((s) => s.key === 'cues.state')!
    expect(sent.parts[0]).toMatchObject({ value: { tone: { value: 'confuso' } } })
  })

  it('shows cues on arrival when replies are not spoken', async () => {
    const { h4b, tone$ } = await setup('text')
    await h4b.ask('um')
    await h4b.push(second)
    expect(tone$().value).toBe('confuso')
  })

  it("shows cues on arrival with sync: 'arrival'", async () => {
    const { h4b, speaker, tone$ } = await setup('voice', { sync: 'arrival' })
    await h4b.ask('um')
    await h4b.push(second)
    await waitForIdle(h4b)
    expect(speaker.spoken).toEqual(['Primeira.'])
    expect(tone$().value).toBe('confuso')
  })

  it('releases held cues when speech is interrupted', async () => {
    const { h4b, tone$ } = await setup('voice')
    await h4b.ask('um')
    await h4b.push(second)
    await waitForIdle(h4b)
    expect(tone$().value).toBe('contente')
    await h4b.interrupt()
    await eventually(() => expect(tone$().value).toBe('confuso'))
  })
})
