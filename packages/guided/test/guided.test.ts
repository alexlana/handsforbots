// @vitest-environment jsdom
import { createH4B, type Transport, type TurnRequest } from '@handsforbots/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { guided, queryDeep, type GuideStep } from '../src/index.js'

const steps: GuideStep[] = [
  { title: 'Bem-vindo', text: 'Esta é a interface.' },
  { title: 'Salvar', text: 'Salve aqui.', target: '#save_button' },
  { title: 'Fim', text: 'Pronto!', close: 'Entendi!' },
]

const card = () => document.querySelector('h4b-guide')?.shadowRoot?.querySelector('.card') as HTMLElement | null
const buttons = () => [...(card()?.querySelectorAll('button') ?? [])] as HTMLButtonElement[]

async function setup(options = {}) {
  const requests: TurnRequest[] = []
  const transport: Transport = { name: 't', async *run(r) { requests.push(r) } }
  const h4b = createH4B({ plugins: [guided({ language: 'pt-BR', tours: { intro: steps }, ...options })] })
  h4b.provide('transport', transport)
  await h4b.start()
  return { h4b, requests, service: h4b.get('guided')! }
}

beforeEach(() => {
  document.body.innerHTML = '<nav><button id="save_button">💾</button></nav>'
})
afterEach(() => {
  document.body.innerHTML = ''
})

describe('guided', () => {
  it('runs a named tour with modal and balloon steps', async () => {
    const { service } = await setup()
    service.start('intro')
    expect(card()!.classList.contains('modal')).toBe(true)
    expect(card()!.textContent).toContain('Bem-vindo')
    buttons().at(-1)!.click()
    expect(card()!.classList.contains('modal')).toBe(false)
    expect(card()!.textContent).toContain('Salvar')
    expect(service.getState()).toMatchObject({ active: true, tour: 'intro', step: 1, total: 3 })
    buttons().at(-1)!.click()
    expect(buttons().at(-1)!.textContent).toBe('Entendi!')
    buttons().at(-1)!.click()
    expect(document.querySelector('h4b-guide')).toBeNull()
    expect(service.getState().active).toBe(false)
  })

  it('is an action the assistant (or Rasa) can call with custom steps', async () => {
    const { h4b } = await setup()
    const outcome = await h4b.runAction('guided_tour', { steps: [{ text: 'Olhe aqui', target: '#save_button' }] }, { origin: 'assistant' })
    expect(outcome).toEqual({ result: { started: true, steps: 1 } })
    expect(card()!.textContent).toContain('Olhe aqui')
    expect((await h4b.runAction('guided_tour', { name: 'nope' })).error).toContain('Unknown tour')
  })

  it('highlights elements, including inside shadow roots', async () => {
    const host = document.createElement('div')
    host.attachShadow({ mode: 'open' }).innerHTML = '<input id="chat_input">'
    document.body.append(host)
    expect(queryDeep('#chat_input')).not.toBeNull()
    const { h4b } = await setup()
    expect((await h4b.runAction('guided_highlight', { target: '#chat_input', text: 'Digite aqui' })).result).toEqual({ shown: true })
    expect((await h4b.runAction('guided_highlight', { target: '#missing' })).error).toContain('Nothing on screen')
  })

  it('navigates by voice or text while open, and lets real questions reach the assistant', async () => {
    const { h4b, requests, service } = await setup()
    service.start('intro')
    const next = await h4b.ask({ modality: 'transcript', source: 'voice', parts: [{ type: 'text', text: 'porximo' }] })
    expect(next.status.route).toBe('capture')
    expect(service.getState().step).toBe(1)
    await h4b.ask('voltar')
    expect(service.getState().step).toBe(0)
    const question = await h4b.ask('para que serve o botão salvar?')
    expect(question.status.route).toBe('transport')
    expect(requests).toHaveLength(1)
    await h4b.ask('pular')
    expect(service.getState().active).toBe(false)
    expect((await h4b.ask('próximo')).status.route).toBe('transport') // no tour: no capture
  })

  it('closes with Escape and narrates steps for voice users', async () => {
    const { h4b, service } = await setup()
    const speak = vi.fn(async () => {})
    h4b.provide('voice' as never, { getState: () => ({ output: 'auto', lastInput: 'voice' }), speak, cancelSpeech: vi.fn() } as never)
    service.start('intro')
    expect(speak).toHaveBeenCalledWith('Bem-vindo. Esta é a interface.')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(service.getState().active).toBe(false)
  })

  it('auto-starts a tour on an empty conversation', async () => {
    const { service } = await setup({ autoStart: 'intro' })
    await new Promise((r) => setTimeout(r, 5))
    expect(service.getState()).toMatchObject({ active: true, tour: 'intro' })
  })
})

describe('page tools (v1 ShowRelevantContent and ImageGallery successors)', () => {
  it('show_section follows the sections on the page', async () => {
    document.body.innerHTML += '<section data-section="precos">Preços</section><section data-section="faq">FAQ</section>'
    const { h4b, service } = await setup({ sectionsAttribute: 'data-section' })
    expect(h4b.actions.describe('assistant').find((a) => a.name === 'show_section')!.parameters).toMatchObject({
      properties: { section: { enum: ['precos', 'faq'] } },
    })
    expect((await h4b.runAction('show_section', { section: 'faq', text: 'Dúvidas aqui' })).result).toEqual({ shown: 'faq' })
    expect(service.getState().active).toBe(true)
    expect((await h4b.runAction('show_section', { section: 'nada' })).error).toBeDefined()
    document.querySelector('[data-section="faq"]')!.remove()
    await new Promise((r) => setTimeout(r, 0))
    expect((h4b.actions.get('show_section')!.parameters as any).properties.section.enum).toEqual(['precos'])
  })

  it('image_gallery renders page images into the reply', async () => {
    document.body.innerHTML += `
      <img data-image-gallery-id="cozinha" src="https://x.test/c1.jpg" alt="Cozinha 1">
      <img data-image-gallery-id="cozinha" src="https://x.test/c2.jpg">
      <p data-image-gallery-text-for="cozinha sala">Projeto integrado.</p>`
    const { h4b } = await setup({ gallery: true })
    const outcome = await h4b.runAction('image_gallery', { topics: ['cozinha'], title: 'Cozinhas' }, { origin: 'assistant' })
    expect(outcome.result).toEqual({ images: 2, texts: 1 })
    const ui = h4b.messages.flatMap((m: any) => m.parts ?? []).find((p: any) => p.name === 'ui')
    expect(ui.value).toEqual({
      component: 'gallery',
      props: { title: 'Cozinhas', images: [{ src: 'https://x.test/c1.jpg', alt: 'Cozinha 1' }, { src: 'https://x.test/c2.jpg', alt: '' }], texts: ['Projeto integrado.'] },
    })
  })
})
