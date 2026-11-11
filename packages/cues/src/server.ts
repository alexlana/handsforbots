/**
 * For the backend (Node, Deno, edge): reads the `cues.state` context signal
 * the page sends with `cues({ report: true })` (ADR 0018), keeping only the
 * channels and values you allow and bounded integers. No dependency on the
 * browser or on `@handsforbots/core`.
 *
 * It comes from the browser, so anyone can forge it: use it as a hint for
 * wording the reply. A rule that must hold (such as "warn only once") needs a
 * count the backend keeps itself.
 */

export const CUES_STATE = 'cues.state'

/** Allowed values per channel: a list, or a channel declaration from `cues({ channels })`. */
export type AllowedCues = Readonly<Record<string, readonly string[] | DeclaredChannel>>

/** The parts of a `cues({ channels })` declaration the reader uses. */
export type DeclaredChannel = {
  readonly values: readonly string[]
  readonly repeat?: Readonly<Record<string, { readonly levels?: readonly number[]; readonly [key: string]: unknown }>>
}

export type ReadCuesOptions = {
  /** Highest `streak` and `count` kept. Default 10000. */
  maxCount?: number
  /** Highest `level` for channels given as a plain list. Default 16. A declaration allows 1 plus its `levels` for that value. */
  maxLevel?: number
}

export type ReportedCue = { value: string; streak: number; count: number; level: number; requested?: string }

/**
 * Where the state can come from:
 * - the AG-UI `context` array (`{ description, value: 'cues.state: {…}' }`, from `@handsforbots/transport-agui`);
 * - the context object of `@handsforbots/transport-http` (`{ 'cues.state': [{…}] }`);
 * - an array of H4B signals (a `data` part named `cues.state`);
 * - the value itself, as an object or a string (`'cues.state: {…}'` or JSON).
 */
export type CuesSource = unknown

/**
 *   const cues = readCuesState(input.context, { tone: ['neutro', 'curioso', 'ofendido'] })
 *   if (cues.tone?.value === 'ofendido') …
 *
 * Returns only allowed channels whose `value` (and `requested`, when present)
 * are allowed, with `streak`, `count` and `level` as integers in range.
 * Anything malformed is left out; it never throws.
 */
export function readCuesState(source: CuesSource, allow: AllowedCues, options: ReadCuesOptions = {}): Record<string, ReportedCue> {
  const raw = locate(source)
  const result: Record<string, ReportedCue> = {}
  if (!isRecord(raw)) return result
  const maxCount = options.maxCount ?? 10000
  for (const [channel, declaration] of Object.entries(allow)) {
    if (!Object.hasOwn(raw, channel)) continue
    const entry = raw[channel]
    if (!isRecord(entry)) continue
    const declared = Array.isArray(declaration) ? undefined : (declaration as DeclaredChannel)
    const values = declared ? declared.values : (declaration as readonly string[])
    const value = entry.value
    if (typeof value !== 'string' || !values.includes(value)) continue
    const streak = integer(entry.streak, 0, maxCount)
    const count = integer(entry.count, 0, maxCount)
    const maxLevel = declared ? (declared.repeat?.[value]?.levels?.length ?? 0) + 1 : (options.maxLevel ?? 16)
    const level = integer(entry.level, 1, maxLevel)
    if (streak === undefined || count === undefined || level === undefined) continue
    const cue: ReportedCue = { value, streak, count, level }
    if (typeof entry.requested === 'string' && values.includes(entry.requested)) cue.requested = entry.requested
    result[channel] = cue
  }
  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function integer(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined
}

function parse(text: string): unknown {
  const body = text.trim().startsWith(`${CUES_STATE}:`) ? text.trim().slice(CUES_STATE.length + 1) : text
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}

/** Finds the reported state in any of the shapes `CuesSource` lists. */
function locate(source: unknown): unknown {
  if (typeof source === 'string') return parse(source)
  if (Array.isArray(source)) {
    for (const item of source) {
      if (!isRecord(item)) continue
      // An H4B signal.
      if (Array.isArray(item.parts)) {
        const part = item.parts.find((p: unknown) => isRecord(p) && p.type === 'data' && p.name === CUES_STATE)
        if (isRecord(part)) return part.value
        continue
      }
      // An AG-UI context entry: the value starts with `cues.state: `.
      if (typeof item.value === 'string' && item.value.trim().startsWith(`${CUES_STATE}:`)) return parse(item.value)
    }
    return undefined
  }
  if (isRecord(source)) {
    // The HTTP transport's context object: `{ 'cues.state': [state] }`.
    if (Object.hasOwn(source, CUES_STATE)) {
      const value = source[CUES_STATE]
      return Array.isArray(value) ? value[0] : value
    }
    return source
  }
  return undefined
}
