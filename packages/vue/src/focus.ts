import { toValue, watch, type MaybeRefOrGetter, type ObjectDirective } from 'vue'
import { autofocusFlags, bindTextFocus, type AutofocusOptions, type TextFocusOptions, type TextFocusTarget } from '@handsforbots/widget/focus'

export type TextFocusBinding = boolean | (AutofocusOptions & { within?: TextFocusOptions['within'] }) | null | undefined

/**
 * Focus a text field. Pass a template ref (or a getter) for that field.
 * `onLoad` focuses when the field is available and again if the switch turns
 * on later. `onClick` focuses on a click that is not a control or a text
 * selection. In a template, `v-text-focus` names the element for you.
 */
export function useTextFocus(
  input: MaybeRefOrGetter<HTMLElement | null | undefined>,
  options: MaybeRefOrGetter<AutofocusOptions & { within?: TextFocusOptions['within'] }> = {},
): void {
  watch(
    [
      () => toValue(input) ?? null,
      () => toValue(options)?.onLoad === true,
      () => toValue(options)?.onClick === true,
      () => toValue(options)?.within,
    ],
    ([element, onLoad, onClick, within], previous, onCleanup) => {
      const hadField = previous?.[0] instanceof HTMLElement
      const loadedAlready = previous?.[1] === true && hadField
      onCleanup(
        bindTextFocus({
          input: () => toValue(input) ?? element,
          onLoad: onLoad && !loadedAlready,
          onClick,
          ...(within === undefined ? {} : { within }),
        }),
      )
    },
    { immediate: true },
  )
}

type Memory = { stop: () => void; onLoad: boolean; onClick: boolean; within: TextFocusOptions['within'] }

const memory = new WeakMap<HTMLElement, Memory>()

/**
 * Vue directive: the element it sits on is the text field.
 * `v-text-focus="true"` is the load switch. `v-text-focus="{ onLoad, onClick }"`
 * sets each switch. `h4bVue` registers it; import `vTextFocus` to use it locally.
 * The browser's `autofocus` attribute is the load switch alone, applied once.
 */
export const vTextFocus: ObjectDirective<HTMLElement, TextFocusBinding> = {
  mounted(element, binding) {
    sync(element, binding.value)
  },
  updated(element, binding) {
    sync(element, binding.value)
  },
  unmounted(element) {
    memory.get(element)?.stop()
    memory.delete(element)
  },
}

function sync(element: HTMLElement, value: TextFocusBinding) {
  const flags = autofocusFlags(value)
  const within = value && typeof value === 'object' ? value.within : undefined
  const previous = memory.get(element)
  if (previous && previous.onLoad === flags.onLoad && previous.onClick === flags.onClick && previous.within === within) return
  previous?.stop()
  const stop = bindTextFocus({
    input: element,
    onLoad: flags.onLoad && !previous?.onLoad,
    onClick: flags.onClick,
    ...(within === undefined ? {} : { within }),
  })
  memory.set(element, { stop, onLoad: flags.onLoad, onClick: flags.onClick, within })
}

export type { AutofocusOptions, TextFocusTarget }
