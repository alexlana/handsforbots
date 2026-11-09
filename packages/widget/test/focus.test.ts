// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindTextFocus } from '../src/focus.js'

function click(target: EventTarget) {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
}

const stops: (() => void)[] = []

afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  document.body.innerHTML = ''
  window.getSelection()?.removeAllRanges()
})

function field(extra = '') {
  document.body.innerHTML = `
    <input id="composer" data-h4b-text>
    <div id="box"><p id="inside">dentro</p><button id="inside-button" type="button">Ok</button></div>
    <p id="outside">fora</p>
    <button id="outside-button" type="button">Salvar</button>
    ${extra}`
  return document.querySelector('#composer') as HTMLInputElement
}

describe('bindTextFocus', () => {
  it('focuses the marked field on load and leaves it when the switch is off', () => {
    const input = field()
    stops.push(bindTextFocus({ onLoad: false, onClick: false }))
    expect(document.activeElement).not.toBe(input)
    stops.push(bindTextFocus({ onLoad: true }))
    expect(document.activeElement).toBe(input)
  })

  it('finds the field by selector or by the element itself', () => {
    field('<input id="other">')
    const other = document.querySelector('#other') as HTMLInputElement
    stops.push(bindTextFocus({ input: '#other', onLoad: true }))
    expect(document.activeElement).toBe(other)
    const composer = document.querySelector('#composer') as HTMLInputElement
    composer.blur()
    stops.push(bindTextFocus({ input: composer, onLoad: true }))
    expect(document.activeElement).toBe(composer)
  })

  it('focuses on a click anywhere, and skips controls, selections and the area outside within', () => {
    const input = field()
    const focus = vi.spyOn(input, 'focus')
    stops.push(bindTextFocus({ onClick: true, within: '#box' }))
    click(document.querySelector('#outside')!)
    expect(focus).not.toHaveBeenCalled()
    click(document.querySelector('#inside-button')!)
    expect(focus).not.toHaveBeenCalled()

    const inside = document.querySelector('#inside')!
    const range = document.createRange()
    range.selectNodeContents(inside)
    const selection = document.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    click(inside)
    expect(focus).not.toHaveBeenCalled()

    selection.removeAllRanges()
    click(inside)
    expect(focus).toHaveBeenCalled()
  })

  it('stops listening when the returned function runs', () => {
    const input = field()
    const focus = vi.spyOn(input, 'focus')
    const stop = bindTextFocus({ input: '#composer', onClick: true })
    stop()
    click(document.querySelector('#outside')!)
    expect(focus).not.toHaveBeenCalled()
  })

  it('skips a hidden or disabled field', () => {
    const input = field('<div hidden><input id="hidden-field"></div>')
    const hidden = document.querySelector('#hidden-field') as HTMLInputElement
    stops.push(bindTextFocus({ input: hidden, onLoad: true }))
    expect(document.activeElement).not.toBe(hidden)
    input.disabled = true
    stops.push(bindTextFocus({ input, onLoad: true }))
    expect(document.activeElement).not.toBe(input)
  })

  it('reads the field from a getter when the click happens', () => {
    field()
    let current: HTMLInputElement | null = null
    stops.push(bindTextFocus({ input: () => current, onClick: true }))
    click(document.querySelector('#outside')!)
    current = document.querySelector('#composer')
    const focus = vi.spyOn(current!, 'focus')
    click(document.querySelector('#outside')!)
    expect(focus).toHaveBeenCalled()
  })
})
