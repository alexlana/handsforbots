/**
 * Focus a text field on load and when the user clicks elsewhere.
 * The widget composer uses this; a page with its own field calls
 * `bindTextFocus` and points at the element.
 */

export type AutofocusOptions = {
  /**
   * Focus when the call runs (the field is already on the page), or, for the
   * widget, when its window opens.
   */
  onLoad?: boolean
  /**
   * Focus when the user clicks somewhere that is not a control and not a
   * text selection. Default area: the document.
   */
  onClick?: boolean
}

/** An element, a CSS selector, or a getter for a field that may appear later. */
export type TextFocusTarget = HTMLElement | string | (() => HTMLElement | null | undefined)

export type TextFocusOptions = AutofocusOptions & {
  /**
   * The text field. Omit it to use the first `[data-h4b-text]` under `root`.
   */
  input?: TextFocusTarget
  /**
   * Where a click counts as "anywhere". An element, a selector, a getter,
   * or the document. `null` matches nothing. Default: the document.
   */
  within?: TextFocusTarget | Document | null
  /** Query selectors from here. Default: document. */
  root?: ParentNode
}

const INTERACTIVE =
  'button, a, input, textarea, select, label, summary, option, audio, video, [contenteditable]:not([contenteditable="false"])'

const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'checkbox',
  'radio',
  'switch',
  'tab',
  'menuitem',
  'option',
  'slider',
  'combobox',
  'listbox',
])

export function autofocusFlags(value: boolean | AutofocusOptions | null | undefined): { onLoad: boolean; onClick: boolean } {
  if (value === true) return { onLoad: true, onClick: false }
  if (!value || typeof value !== 'object') return { onLoad: false, onClick: false }
  return { onLoad: value.onLoad === true, onClick: value.onClick === true }
}

/** The field is in the document, enabled, and not inside a `hidden` ancestor. */
export function canFocus(element: HTMLElement): boolean {
  if (!element.isConnected) return false
  if ('disabled' in element && (element as HTMLInputElement).disabled) return false
  let current: Element | null = element
  while (current) {
    if (current instanceof HTMLElement && current.hidden) return false
    const parent: Element | null = current.parentElement
    if (parent) {
      current = parent
      continue
    }
    const root = current.getRootNode()
    current = root instanceof ShadowRoot ? root.host : null
  }
  return true
}

/**
 * Starts focusing `input`. Returns a function that removes the click listener.
 * With neither switch on, it does nothing.
 */
export function bindTextFocus(options: TextFocusOptions = {}): () => void {
  if (typeof document === 'undefined') return () => {}
  const root = options.root ?? document
  const doc = documentOf(root)
  const flags = autofocusFlags(options)
  const field = () => resolveField(options, root)

  if (flags.onLoad) focusIfReady(field())
  if (!flags.onClick) return () => {}

  const controller = new AbortController()
  const shadows = new Set<ShadowRoot>()
  // Clicks inside a shadow root are retargeted to the host on `document`.
  // Listen on the shadow root itself so the real control (a button, a
  // selection) is visible, and ignore that same click on `document`.
  const listenShadow = (shadow: ShadowRoot) => {
    if (shadows.has(shadow)) return
    shadows.add(shadow)
    shadow.addEventListener('click', onClick, { signal: controller.signal })
  }
  const watchShadow = (input: HTMLElement | null) => {
    const shadow = input?.getRootNode()
    if (shadow instanceof ShadowRoot) listenShadow(shadow)
  }

  function onClick(event: Event) {
    const input = field()
    if (!input || !canFocus(input) || alreadyFocused(input)) return
    watchShadow(input)
    const shadow = input.getRootNode()
    if (shadow instanceof ShadowRoot && event.currentTarget === doc && event.composedPath().includes(shadow.host)) return
    const area = currentArea(options, root, doc)
    if (!area || !shouldFocusFrom(event, input, area)) return
    input.focus()
  }

  watchShadow(field())
  doc.addEventListener('click', onClick, { signal: controller.signal })
  return () => controller.abort()
}

function focusIfReady(element: HTMLElement | null) {
  if (!element || !canFocus(element) || alreadyFocused(element)) return
  element.focus()
}

function alreadyFocused(element: HTMLElement): boolean {
  const root = element.getRootNode()
  if (root instanceof ShadowRoot) return root.activeElement === element
  return element.ownerDocument?.activeElement === element
}

function documentOf(root: ParentNode): Document {
  if (root instanceof Document) return root
  return (root as Node).ownerDocument ?? document
}

function resolveField(options: TextFocusOptions, root: ParentNode): HTMLElement | null {
  if (options.input !== undefined) return asElement(resolveTarget(options.input, root))
  const marked = root.querySelector('[data-h4b-text]')
  return marked instanceof HTMLElement ? marked : null
}

function resolveTarget(target: TextFocusTarget | Document, root: ParentNode): HTMLElement | Document | null {
  if (typeof target === 'function') {
    const value = target()
    return value ?? null
  }
  if (typeof target === 'string') {
    if (!target) return null
    const found = root.querySelector(target)
    return found instanceof HTMLElement ? found : null
  }
  return target
}

function asElement(value: HTMLElement | Document | null): HTMLElement | null {
  return value instanceof HTMLElement ? value : null
}

function currentArea(options: TextFocusOptions, root: ParentNode, doc: Document): HTMLElement | Document | null {
  if (options.within === undefined) return doc
  if (options.within === null) return null
  const resolved = resolveTarget(options.within, root)
  if (resolved instanceof HTMLElement || resolved instanceof Document) return resolved
  return null
}

function shouldFocusFrom(event: Event, field: HTMLElement, area: HTMLElement | Document): boolean {
  if (event.defaultPrevented) return false
  if (event instanceof MouseEvent && (event.button !== 0 || event.shiftKey)) return false
  const node = originalTarget(event)
  if (!node || !containsNode(area, node) || containsNode(field, node)) return false
  if (isInteractive(node) || isTextSelection(node)) return false
  return true
}

function originalTarget(event: Event): Node | null {
  for (const entry of event.composedPath()) {
    if (entry instanceof Node) return entry
  }
  return event.target instanceof Node ? event.target : null
}

function containsNode(area: Node, node: Node | null): boolean {
  let current: Node | null = node
  while (current) {
    if (current === area || area.contains(current)) return true
    const root = current.getRootNode()
    if (root instanceof ShadowRoot && root.host !== current) {
      current = root.host
      continue
    }
    return false
  }
  return false
}

function isInteractive(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement
  if (!element) return false
  if (element.closest(INTERACTIVE)) return true
  const role = element.closest('[role]')?.getAttribute('role')
  return role != null && INTERACTIVE_ROLES.has(role)
}

function isTextSelection(node: Node): boolean {
  const selection = (node.ownerDocument ?? document).getSelection()
  if (!selection || selection.isCollapsed || selection.toString() === '') return false
  const anchor = selection.anchorNode
  if (!anchor) return false
  const element = node instanceof Element ? node : node.parentElement
  if (!element) return false
  return element.contains(anchor) || (anchor instanceof Element && anchor.contains(element))
}
