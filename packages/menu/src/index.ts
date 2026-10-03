import { definePlugin, textOf, type Match, type Signal } from '@handsforbots/core'
import { fuzzyBest, normalize, similarity, type FuzzyEntry } from './fuzzy.js'

export { distance, fuzzyBest, normalize, similarity, type FuzzyEntry, type FuzzyOptions, type FuzzyResult } from './fuzzy.js'

export type CommandArgs = unknown | ((captured: Record<string, string>) => unknown)

export type Command = {
  /** Registered action this command runs. */
  action: string
  /** Label for palettes and suggestions. */
  label?: string
  /** `/name` triggers; the rest of the line is captured as `rest`. */
  slash?: string | string[]
  /**
   * Full-sentence patterns. Strings use `{name}` placeholders
   * ("mostrar pedidos {status}"); RegExps use named groups.
   */
  patterns?: (string | RegExp)[]
  /** Short phrases matched with typo tolerance, optionally per language. */
  phrases?: string[] | Record<string, string[]>
  /** Static args, or built from captured placeholders / `rest`. */
  args?: CommandArgs
  /** Confirmation shown (and spoken) after the action runs. */
  reply?: (result: unknown, args: unknown) => string | undefined
}

export type MenuOptions = {
  commands?: Command[]
  /** Picks per-language phrases, e.g. 'pt-br' (falls back to 'pt', then all). */
  language?: string
  /** Minimum fuzzy similarity. Default 0.8. */
  fuzzyThreshold?: number
  /** Longer inputs skip fuzzy matching. Default 6 words. */
  maxFuzzyWords?: number
}

export type Suggestion = { command: Command; label: string; score: number }

export type MenuService = {
  add(command: Command): () => void
  list(): Command[]
  /** Ranked commands for what the user is typing or saying (palettes, autocomplete). */
  suggest(text: string, limit?: number): Suggestion[]
  /** Builds a signal that runs a command explicitly (buttons, palette, quick replies). */
  commandSignal(action: string, args?: unknown): Omit<Signal, 'id' | 'timestamp'>
}

declare module '@handsforbots/core' {
  interface Services {
    menu: MenuService
  }
}

export const menu = definePlugin<MenuOptions | undefined>({
  name: 'menu',
  provides: ['menu'],
  apply(ctx, options = {}) {
    const service = createMenu(options)
    ctx.provide('menu', service.api)
    ctx.addMatcher({ name: 'menu.explicit', priority: -30, match: service.matchExplicit })
    ctx.addMatcher({ name: 'menu.pattern', priority: -20, match: service.matchPattern })
    ctx.addMatcher({ name: 'menu.fuzzy', priority: -10, match: service.matchFuzzy })
  },
})

export function createMenu(options: MenuOptions = {}) {
  let commands: Command[] = [...(options.commands ?? [])]

  const phrasesOf = (command: Command): string[] => {
    if (!command.phrases) return []
    if (Array.isArray(command.phrases)) return command.phrases
    const language = options.language?.toLowerCase()
    const byLanguage = command.phrases
    if (language && byLanguage[language]) return byLanguage[language]!
    const base = language?.split('-')[0]
    if (base && byLanguage[base]) return byLanguage[base]!
    return Object.values(byLanguage).flat()
  }

  const slashesOf = (command: Command) =>
    (Array.isArray(command.slash) ? command.slash : command.slash ? [command.slash] : []).map((s) =>
      normalize(s.replace(/^\//, '')),
    )

  const resolveArgs = (command: Command, captured: Record<string, string>) =>
    typeof command.args === 'function' ? (command.args as (c: Record<string, string>) => unknown)(captured) : (command.args ?? captured)

  const toMatch = (command: Command, captured: Record<string, string>, confidence: number): Match => {
    const args = resolveArgs(command, captured)
    return {
      action: command.action,
      args,
      confidence,
      reply: command.reply ? (result) => command.reply!(result, args) : undefined,
    }
  }

  const textInput = (signal: Signal): string | undefined =>
    signal.modality === 'text' || signal.modality === 'transcript' ? textOf(signal.parts).trim() : undefined

  const matchExplicit = (signal: Signal): Match | null => {
    if (signal.modality === 'command') {
      const data = signal.parts.find((p) => p.type === 'data' && p.name === 'command')
      if (data?.type !== 'data') return null
      const { action, args } = data.value as { action: string; args?: unknown }
      const command = commands.find((c) => c.action === action)
      return { action, args: args ?? {}, confidence: 1, reply: command?.reply && ((r) => command.reply!(r, args)) }
    }
    const text = textInput(signal)
    if (!text?.startsWith('/')) return null
    const [head = '', ...rest] = text.slice(1).split(/\s+/)
    const name = normalize(head)
    const command = commands.find((c) => slashesOf(c).includes(name))
    return command ? toMatch(command, { rest: rest.join(' ') }, 1) : null
  }

  type Compiled = { regexp: RegExp; template: boolean }
  const compiled = new WeakMap<Command, Compiled[]>()
  const patternsOf = (command: Command): Compiled[] => {
    let list = compiled.get(command)
    if (!list) {
      list = (command.patterns ?? []).map((p) =>
        typeof p === 'string' ? { regexp: templateToRegExp(p), template: true } : { regexp: p, template: false },
      )
      compiled.set(command, list)
    }
    return list
  }

  const matchPattern = (signal: Signal): Match | null => {
    const text = textInput(signal)
    if (!text) return null
    const normalized = normalize(text)
    for (const command of commands) {
      for (const { regexp, template } of patternsOf(command)) {
        // Templates match normalized text (case/accent-insensitive, so captures are normalized too).
        const found = template ? regexp.exec(normalized) : (regexp.exec(text) ?? regexp.exec(normalized))
        if (found) return toMatch(command, { ...found.groups }, 1)
      }
    }
    return null
  }

  const matchFuzzy = (signal: Signal): Match | null => {
    const text = textInput(signal)
    if (!text || text.startsWith('/')) return null
    const entries: FuzzyEntry<Command>[] = commands.flatMap((command) =>
      phrasesOf(command).map((phrase) => ({ phrase, value: command })),
    )
    const best = fuzzyBest(text, entries, { threshold: options.fuzzyThreshold, maxWords: options.maxFuzzyWords })
    return best ? toMatch(best.value, {}, best.score) : null
  }

  const api: MenuService = {
    add(command) {
      commands = [...commands, command]
      return () => {
        commands = commands.filter((c) => c !== command)
      }
    },
    list: () => commands,
    suggest(input, limit = 5) {
      const text = normalize(input.replace(/^\//, ''))
      const scored: Suggestion[] = []
      for (const command of commands) {
        const candidates = [...slashesOf(command), ...phrasesOf(command).map(normalize), normalize(command.label ?? '')].filter(Boolean)
        let score = 0
        for (const candidate of candidates) {
          if (!text) score = Math.max(score, 0.1)
          else if (candidate.startsWith(text)) score = Math.max(score, 0.9 + text.length / candidate.length / 10)
          else if (candidate.includes(text)) score = Math.max(score, 0.7)
          else score = Math.max(score, similarity(text, candidate.slice(0, Math.max(text.length, 1))) * 0.8)
        }
        if (score >= 0.5 || !text) {
          scored.push({ command, label: command.label ?? phrasesOf(command)[0] ?? `/${slashesOf(command)[0] ?? command.action}`, score })
        }
      }
      return scored.sort((a, b) => b.score - a.score).slice(0, limit)
    },
    commandSignal: (action, args) => ({
      kind: 'trigger',
      modality: 'command',
      source: 'menu',
      parts: [{ type: 'data', name: 'command', value: { action, args } }],
    }),
  }

  return { api, matchExplicit, matchPattern, matchFuzzy }
}

/** "mostrar pedidos {status}" → /^mostrar pedidos (?<status>.+?)$/ over normalized text. */
function templateToRegExp(template: string): RegExp {
  const names: string[] = []
  const marked = template.replace(/\{(\w+)\}/g, (_, name: string) => ` h4bslot${names.push(name) - 1} `)
  const source = normalize(marked)
    .split(' ')
    .map((token) => {
      const slot = /^h4bslot(\d+)$/.exec(token)
      return slot ? `(?<${names[Number(slot[1])]}>.+?)` : token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join(' ')
  return new RegExp(`^${source}$`, 'u')
}
