import { definePlugin, type Hooks, type Message, type Part, type Signal } from '@handsforbots/core'

/** Built-in detectors. Best effort: anonymize again on your server before people read the conversation. */
export const PATTERNS = {
  email: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu,
  /** Brazilian company id (CNPJ), with or without punctuation. */
  cnpj: /(?<![\d.])\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?![\d])/g,
  /** Brazilian personal id (CPF), with or without punctuation. */
  cpf: /(?<![\d.])\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?![\d])/g,
  /** Payment card numbers: 13 to 19 digits, optionally grouped. */
  card: /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g,
  /** Phone numbers with 8+ digits, optional country and area codes. */
  phone: /(?<![\w@])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?|\d{2,4}[\s.-])?\d{4,5}[\s.-]?\d{4}(?!\w)/g,
} satisfies Record<string, RegExp>

export type PatternName = keyof typeof PATTERNS

export type RedactOptions = {
  /** Built-in detectors to use. Default: all (`email`, `cnpj`, `cpf`, `card`, `phone`). */
  patterns?: PatternName[]
  /** Your own detectors (e.g. an id format), applied after the built-in ones. Use the `g` flag. */
  custom?: Record<string, RegExp>
  /** Replacement text. Default `[kind]`, e.g. `[email]`. */
  replace?: (kind: string, match: string) => string
  /**
   * What to do with media parts (photos, documents sent as files). `omit`
   * (default) keeps only the type and name, as a `redacted_media` data part;
   * `keep` leaves them untouched.
   */
  media?: 'omit' | 'keep'
}

/** Replaces contacts and documents found in `text`. */
export function redactText(text: string, options: RedactOptions = {}): string {
  const replace = options.replace ?? ((kind) => `[${kind}]`)
  const detectors: [string, RegExp][] = [
    ...(options.patterns ?? (Object.keys(PATTERNS) as PatternName[])).map((name) => [name, PATTERNS[name]] as [string, RegExp]),
    ...Object.entries(options.custom ?? {}),
  ]
  let out = text
  for (const [kind, pattern] of detectors) out = out.replace(pattern, (match) => replace(kind, match))
  return out
}

/** Deep copy of `value` with every string redacted. */
function redactValue(value: unknown, options: RedactOptions): unknown {
  if (typeof value === 'string') return redactText(value, options)
  if (Array.isArray(value)) return value.map((v) => redactValue(v, options))
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactValue(v, options)]))
  }
  return value
}

function redactParts(parts: Part[], options: RedactOptions): Part[] {
  return parts.map((part): Part => {
    if (part.type === 'text') return { type: 'text', text: redactText(part.text, options) }
    if (part.type === 'data') return { ...part, value: redactValue(part.value, options) }
    if (options.media === 'keep') return part
    return {
      type: 'data',
      name: 'redacted_media',
      value: { type: part.type, mimeType: part.mimeType, name: part.name === undefined ? undefined : redactText(part.name, options) },
    }
  })
}

/** Anonymized copies of `messages`; the originals are not touched. */
export function redactMessages(messages: Message[], options: RedactOptions = {}): Message[] {
  return messages.map((message): Message => {
    if (message.role === 'tool') {
      return {
        ...message,
        ...(message.result === undefined ? {} : { result: redactValue(message.result, options) }),
        ...(message.error === undefined ? {} : { error: redactText(message.error, options) }),
      }
    }
    if (message.role === 'assistant') {
      return {
        ...message,
        parts: redactParts(message.parts, options),
        ...(message.toolCalls
          ? { toolCalls: message.toolCalls.map((call) => ({ ...call, args: redactValue(call.args, options) })) }
          : {}),
      }
    }
    return { ...message, parts: redactParts(message.parts, options) }
  })
}

/**
 * An interceptor for `storage.before` (what is saved) or `request.before`
 * (what goes to the assistant) that anonymizes messages and context signals.
 */
export function redactor<T extends { messages: Message[]; context?: Signal[] }>(options: RedactOptions = {}) {
  return (value: T): T => ({
    ...value,
    messages: redactMessages(value.messages, options),
    ...(value.context ? { context: value.context.map((s) => ({ ...s, parts: redactParts(s.parts, options) })) } : {}),
  })
}

export type RedactPluginOptions = RedactOptions & {
  /**
   * Where to anonymize. Default `['storage.before']`: what is stored (and,
   * with `storage-backend`, what your reviewers read), never what is on screen.
   * Add `request.before` to also hide it from the assistant.
   */
  hooks?: ('storage.before' | 'request.before')[]
  /** Only while this consent purpose is granted (e.g. `review`). Default: always. */
  when?: string
}

/**
 * Anonymizes contacts and documents before the conversation is stored:
 *
 *   createH4B({ plugins: [storageBackend({ url }), redact({ when: 'review' })] })
 */
export const redact = definePlugin<RedactPluginOptions | undefined>({
  name: 'redact',
  apply(ctx, options = {}) {
    const run = redactor(options)
    for (const hook of options.hooks ?? ['storage.before']) {
      ctx.intercept(
        hook,
        (value: Hooks[typeof hook]) => (options.when && !ctx.app.consent.granted(options.when) ? value : run(value)) as never,
        // Late, after other interceptors had their say.
        100,
      )
    }
  },
})
