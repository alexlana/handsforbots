import { useEffect, useLayoutEffect, type RefObject } from 'react'
import {
  bindTextFocus,
  type AutofocusOptions,
  type TextFocusTarget,
} from '@handsforbots/widget/focus'

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export type UseTextFocusOptions = AutofocusOptions & {
  /**
   * Where a click counts as "anywhere". A ref is read when the listener
   * starts. Default: the document.
   */
  within?: TextFocusTarget | Document | RefObject<HTMLElement | Document | null> | null
}

/**
 * Focus a text field. Pass the ref of that field.
 *
 * `onLoad` focuses after mount (the same moment as React's `autoFocus` prop)
 * and again if the switch is turned on later. `onClick` focuses when the
 * user clicks somewhere that is not a control or a text selection.
 * Turning a switch off leaves the caret where it is.
 */
export function useTextFocus<T extends HTMLElement>(input: RefObject<T | null>, options: UseTextFocusOptions = {}): void {
  const onLoad = options.onLoad === true
  const onClick = options.onClick === true
  const within = options.within
  useIsomorphicLayoutEffect(() => {
    if (!onLoad) return
    return bindTextFocus({ input: () => input.current, onLoad: true })
  }, [input, onLoad])
  useEffect(() => {
    if (!onClick) return
    const area = areaOf(within)
    return bindTextFocus({
      input: () => input.current,
      onClick: true,
      ...(area === undefined ? {} : { within: area }),
    })
  }, [input, onClick, within])
}

function areaOf(within: UseTextFocusOptions['within']): TextFocusTarget | Document | null | undefined {
  if (within === undefined) return undefined
  if (within === null) return null
  if (typeof within === 'string' || typeof within === 'function') return within
  if (within instanceof HTMLElement || within instanceof Document) return within
  return within.current
}
