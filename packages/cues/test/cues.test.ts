import { createH4B, type H4B, type Stimulus } from '@handsforbots/core'
import { citedReply, eventually, reply, scriptedTransport, waitForIdle } from '@handsforbots/testkit'
import { describe, expect, it } from 'vitest'
import { cues, type CuesOptions, type StoredCues } from '../src/index.js'

const tone = {
  values: ['neutro', 'curioso', 'contente', 'empolgado', 'confuso', 'serio', 'ofendido'],
  default: 'neutro',
  repeat: {
    confuso: { levels: [2, 4] },
    ofendido: { max: 1, by: 'count' as const, then: 'serio' },
  },
}

const effect = (value: unknown): Stimulus => ({ type: 'ui.effect', name: 'cues', value })

async function setup(
  script: Stimulus[][] | ((round: number) => Stimulus[]),
  options: Partial<CuesOptions> = {},
): Promise<{ h4b: H4B; transport: ReturnType<typeof scriptedTransport>; errors: string[]; say(text: string): Promise<void> }> {
  const transport = scriptedTransport(typeof script === 'function' ? (_r, round) => script(round) : script)
  const h4b = await createH4B({ memory: false, plugins: [cues({ channels: { tone }, ...options })] }).start()
  h4b.provide('transport', transport)
  const errors: string[] = []
  h4b.on('error', ({ error, source }) => source === 'cues' && errors.push(String((error as Error).message ?? error)))
  return {
    h4b,
    transport,
    errors,
    async say(text) {
      await h4b.send(text)
      await waitForIdle(h4b)
    },
  }
}

const stored = (h4b: H4B): StoredCues[] =>
  h4b.messages.flatMap((m) =>
    m.role === 'assistant' ? m.parts.flatMap((p) => (p.type === 'data' && p.name === 'cues' ? [p.value as StoredCues] : [])) : [],
  )

const tones = (h4b: H4B) => stored(h4b).map((s) => s.tone!.value)

describe('cues', () => {
  it('starts at the default and stores the default when nobody decides', async () => {
    const { h4b, say } = await setup([reply('oi')])
    expect(h4b.get('cues')!.getState().tone).toMatchObject({ value: 'neutro', streak: 0, count: 0, level: 1, from: 'default' })
    await say('olá')
    expect(stored(h4b)).toEqual([{ tone: { value: 'neutro', level: 1, from: 'default' } }])
    expect(h4b.get('cues')!.getState().tone).toMatchObject({ value: 'neutro', streak: 1, count: 1 })
  })

  it('applies a backend ui.effect to the reply and emits cue.changed while it arrives', async () => {
    let seenWhileStreaming: string | undefined
    const { h4b, say } = await setup([[effect({ tone: 'curioso' }), ...reply('hum?')]])
    h4b.on('cue.changed', (e) => {
      if (e.pending) seenWhileStreaming = e.value
    })
    await say('o que é isso')
    expect(seenWhileStreaming).toBe('curioso')
    expect(tones(h4b)).toEqual(['curioso'])
    expect(h4b.get('cues')!.getState().tone).toMatchObject({ value: 'curioso', from: 'backend' })
    expect(h4b.get('cues')!.getState().tone!.pending).toBeUndefined()
  })

  it('turns an invalid value into the default and reports it', async () => {
    const { h4b, errors, say } = await setup([[effect({ tone: 'furioso', mood: 'x' }), ...reply('ok')]])
    await say('a')
    expect(tones(h4b)).toEqual(['neutro'])
    expect(errors.some((e) => e.includes('furioso'))).toBe(true)
    expect(errors.some((e) => e.includes('mood'))).toBe(true)
  })

  it('raises the level as the same value repeats in a row and resets it on change', async () => {
    const script = ['confuso', 'confuso', 'confuso', 'confuso', 'curioso', 'confuso']
    const levels: number[] = []
    const { h4b, say } = await setup((round) => [effect({ tone: script[round] }), ...reply(`r${round}`)])
    h4b.on('cue.repeat', (e) => levels.push(e.level))
    for (let i = 0; i < script.length; i++) await say(`p${i}`)
    expect(stored(h4b).map((s) => s.tone!.level)).toEqual([1, 2, 2, 3, 1, 1])
    expect(levels).toEqual([2, 3])
    expect(h4b.get('cues')!.getState().tone).toMatchObject({ value: 'confuso', streak: 1, count: 5, previous: 'curioso' })
  })

  it('limits a value by count and replaces it, keeping what was asked', async () => {
    const replaced: unknown[] = []
    const { h4b, say } = await setup(() => [effect({ tone: 'ofendido' }), ...reply('...')])
    h4b.on('cue.repeat', (e) => replaced.push(e.replaced))
    await say('a')
    await say('b')
    await say('c')
    expect(tones(h4b)).toEqual(['ofendido', 'serio', 'serio'])
    expect(stored(h4b)[1]!.tone).toEqual({ value: 'serio', level: 1, from: 'repeat', requested: 'ofendido' })
    expect(replaced).toEqual(['ofendido', 'ofendido'])
  })

  it('limits by streak, allowing the value again after a break', async () => {
    const script = ['contente', 'contente', 'contente', 'curioso', 'contente']
    const { h4b, say } = await setup((round) => [effect({ tone: script[round] }), ...reply('x')], {
      channels: { tone: { ...tone, repeat: { contente: { max: 2 } } } },
    })
    for (let i = 0; i < script.length; i++) await say(`p${i}`)
    expect(tones(h4b)).toEqual(['contente', 'contente', 'neutro', 'curioso', 'contente'])
  })

  it('lets the backend set the level within the declared range', async () => {
    const { h4b, say } = await setup([
      [effect({ tone: { value: 'confuso', level: 9 } }), ...reply('a')],
      [effect({ tone: { value: 'curioso', level: 3 } }), ...reply('b')],
    ])
    await say('1')
    await say('2')
    expect(stored(h4b).map((s) => s.tone!.level)).toEqual([3, 1])
  })

  it('uses rules tied to sources, taxonomies, actions and errors, with priority', async () => {
    const { h4b, say } = await setup(
      [
        citedReply('Os projetos [s1]', [{ id: 's1', title: 'Projetos', url: 'https://alex.example/projetos/polvo' }]),
        citedReply('Sobre mim [s1]', [{ id: 's1', title: 'Bio', url: 'https://alex.example/bio', trail: ['Como fui feito'] }]),
        reply('não sei'),
      ],
      {
        classify: (s) => (s.url?.includes('/projetos/') ? ['projetos'] : []),
        rules: [
          { when: { taxonomy: 'projetos' }, set: { tone: 'empolgado' } },
          { when: { source: { trail: 'Como fui feito' } }, set: { tone: 'contente' } },
          { when: { source: { trail: 'Como fui feito' } }, set: { tone: 'curioso' }, priority: -1 },
          { when: { text: /não sei/ }, set: { tone: 'confuso' } },
        ],
      },
    )
    await say('projetos?')
    await say('quem é você?')
    await say('e isso?')
    expect(tones(h4b)).toEqual(['empolgado', 'contente', 'confuso'])
    expect(stored(h4b).map((s) => s.tone!.from)).toEqual(['rule', 'rule', 'rule'])
  })

  it('gives the backend precedence over rules', async () => {
    const { h4b, say } = await setup([[effect({ tone: 'serio' }), ...reply('não sei')]], {
      rules: [{ when: { text: /não sei/ }, set: { tone: 'confuso' } }],
    })
    await say('x')
    expect(stored(h4b)[0]!.tone).toMatchObject({ value: 'serio', from: 'backend' })
  })

  it('sees actions run in the turn and failed ones', async () => {
    const { h4b, say } = await setup(
      [
        [{ type: 'action.call', callId: 'c1', name: 'boom', args: {} }],
        reply('deu ruim'),
      ],
      { rules: [{ when: { event: 'action.failed' }, set: { tone: 'confuso' } }] },
    )
    h4b.actions.register({
      name: 'boom',
      description: 'fails',
      handler: () => {
        throw new Error('nope')
      },
    })
    await say('faz')
    expect(tones(h4b)).toEqual(['confuso'])
  })

  it('keeps a sticky channel and resets a message channel', async () => {
    const { h4b, say } = await setup(
      [
        [effect({ tone: 'curioso', scene: 'noite' }), ...reply('a')],
        reply('b'),
      ],
      { channels: { tone, scene: { values: ['dia', 'noite'], default: 'dia', persist: 'sticky' } } },
    )
    await say('1')
    await say('2')
    expect(stored(h4b)[1]).toEqual({
      tone: { value: 'neutro', level: 1, from: 'default' },
      scene: { value: 'noite', level: 1, from: 'sticky' },
    })
  })

  it('registers set_cues with an enum schema and applies it to the reply', async () => {
    const { h4b, transport, say } = await setup([
      [{ type: 'action.call', callId: 'c1', name: 'set_cues', args: { tone: 'empolgado' } }],
      reply('legal!'),
    ])
    await say('conta')
    expect(tones(h4b)).toEqual(['empolgado'])
    const descriptor = transport.requests[0]!.actions.find((a) => a.name === 'set_cues')!
    expect(descriptor.parameters).toMatchObject({ properties: { tone: { enum: tone.values } } })
    const result = h4b.messages.find((m) => m.role === 'tool')
    expect(result).toMatchObject({ result: { tone: { value: 'empolgado' } } })
  })

  it('reports the state to the backend as a context signal when asked', async () => {
    const { transport, say } = await setup(() => [effect({ tone: 'ofendido' }), ...reply('...')], { report: true })
    await say('a')
    await say('b')
    const signal = transport.requests[1]!.context.find((s) => s.key === 'cues.state')!
    expect(signal.parts[0]).toMatchObject({ type: 'data', value: { tone: { value: 'ofendido', count: 1, streak: 1 } } })
  })

  it('rebuilds counts from history on restore and clears them on reset', async () => {
    const script = ['confuso', 'confuso']
    const { h4b, say } = await setup((round) => [effect({ tone: script[round] ?? 'confuso' }), ...reply('x')])
    await say('1')
    await say('2')
    const snapshot = structuredClone(h4b.conversation.snapshot())

    const other = await createH4B({ memory: false, plugins: [cues({ channels: { tone } })] }).start()
    other.conversation.restore(snapshot)
    await eventually(() => expect(other.get('cues')!.getState().tone).toMatchObject({ value: 'confuso', streak: 2, level: 2 }))

    await h4b.reset()
    expect(h4b.get('cues')!.getState().tone).toMatchObject({ value: 'neutro', streak: 0, count: 0 })
    await say('3')
    expect(stored(h4b).map((s) => s.tone!.level)).toEqual([1])
  })

  it('decides again a stored message the backend names later, keeping the other channels', async () => {
    const { h4b, say } = await setup(
      [[...reply('feito', 'm1'), effect({ messageId: 'm1', tone: 'contente' })]],
      { channels: { tone, scene: { values: ['dia', 'noite'], default: 'dia' } } },
    )
    await say('x')
    expect(stored(h4b)).toEqual([
      { tone: { value: 'contente', level: 1, from: 'backend' }, scene: { value: 'dia', level: 1, from: 'default' } },
    ])
    expect(h4b.get('cues')!.getState().tone).toMatchObject({ value: 'contente', messageId: 'm1', count: 1 })
  })

  it('forgets the cues of an interrupted reply that was removed', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const h4b = await createH4B({ memory: false, plugins: [cues({ channels: { tone } })] }).start()
    h4b.provide('transport', {
      name: 'slow',
      async *run() {
        yield effect({ tone: 'empolgado' })
        await gate
      },
    })
    void h4b.send('a')
    await eventually(() => expect(h4b.get('cues')!.getState().tone).toMatchObject({ value: 'empolgado', pending: true }))
    await h4b.interrupt()
    release()
    await waitForIdle(h4b)
    expect(h4b.get('cues')!.getState().tone).toMatchObject({ value: 'neutro', streak: 0 })
  })

  it('does not store cues on replies without text', async () => {
    const { h4b, say } = await setup([[{ type: 'action.call', callId: 'c1', name: 'noop', args: {} }], reply('pronto')])
    h4b.actions.register({ name: 'noop', description: 'noop', handler: () => 'ok' })
    await say('vai')
    const assistants = h4b.messages.filter((m) => m.role === 'assistant')
    expect(stored(h4b)).toHaveLength(1)
    expect(assistants.at(-1)!.parts.some((p) => p.type === 'data' && p.name === 'cues')).toBe(true)
  })

  it('rejects invalid channel declarations', async () => {
    const mount = async (channels: CuesOptions['channels']) => {
      const errors: unknown[] = []
      const h4b = createH4B({ memory: false })
      h4b.on('error', ({ error }) => errors.push(error))
      await h4b.start()
      await h4b.use(cues({ channels })).catch((error) => errors.push(error))
      return String(errors.map((e) => (e as Error).message))
    }
    expect(await mount({ Tone: tone })).toMatch(/lowercase/)
    expect(await mount({ tone: { values: ['a'], default: 'b' } })).toMatch(/default/)
    expect(await mount({ tone: { values: ['a', 'b'], default: 'a', repeat: { a: { levels: [3, 2] } } } })).toMatch(/ascending/)
    expect(await mount({ tone: { values: ['a b'], default: 'a b' } })).toMatch(/code/)
  })
})
