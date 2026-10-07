/**
 * Consent: which purposes (e.g. `persistence`, `review`) the person allowed.
 * The kernel mounts plugins that require a purpose only while it is granted
 * and, when it is withdrawn, unmounts them and erases what they stored. The
 * conversation in memory is never touched.
 */

/** `pending`: nobody decided yet (or the region is still unknown). */
export type ConsentState = 'granted' | 'denied' | 'pending'

/** A decision for one purpose: `true`/`false` are short for `granted`/`denied`. */
export type ConsentDecision = boolean | ConsentState

/** Text for UIs: one string, or one per language (`en`, `pt-BR`…; matched like the widget's `language`). */
export type ConsentText = string | Record<string, string>

export type ConsentPurposeRule = {
  /** State before the person decides: `pending` = opt-in, `granted` = opt-out. */
  default: ConsentState
  /** Erase what plugins stored for this purpose when it stops being granted. Default true. */
  eraseOnRevoke?: boolean
  label?: ConsentText
  description?: ConsentText
}

/**
 * A declarative rule set, usually one per legislation. Plain JSON, so it can
 * be kept in a `.json` or `.yml` file and loaded with `parseConsentRules`.
 */
export type ConsentRules = {
  id: string
  label?: ConsentText
  /**
   * Where it applies: ISO 3166 country (`BR`) or subdivision (`US-CA`) codes,
   * or `*` for anywhere. A country also matches its subdivisions; the most
   * specific match wins. Absent = `*`.
   */
  regions?: string[]
  purposes: Record<string, ConsentPurposeRule>
}

export type ConsentOptions = {
  /** Rule sets. With more than one, `region` picks among them. Without any, every purpose starts `pending`. */
  rules?: ConsentRules | ConsentRules[]
  /**
   * The visitor's region (e.g. from a geo header your server echoes into the
   * page). A function may be async: until it resolves, every purpose without
   * a decision is `pending`.
   */
  region?: string | (() => string | undefined | Promise<string | undefined>)
  /** Decisions already known when the page loads (e.g. read from your consent tool's cookie). */
  initial?: Record<string, ConsentDecision>
  /** Opens your consent tool; UIs show a "manage" button instead of their own toggles when set. */
  manage?: () => void
  /** Name of the BroadcastChannel that carries decisions to the other tabs, or false. Default 'default'. */
  channel?: string | false
}

export type ConsentSnapshot = {
  enabled: boolean
  region?: string
  /** Id of the rule set in force, if any. */
  rules?: string
  states: Record<string, ConsentState>
}

/** `h4b.consent`. */
export type ConsentControl = {
  /** False when `createH4B` got no `consent` option: then every purpose counts as granted. */
  readonly enabled: boolean
  readonly region: string | undefined
  /** The rule set in force for the region, if any. */
  readonly rules: ConsentRules | undefined
  /** Purposes known from the rules in force and from decisions. */
  readonly purposes: string[]
  readonly manage: (() => void) | undefined
  state(purpose: string): ConsentState
  granted(purpose: string): boolean
  /** Records decisions (merged with earlier ones). Resolves when plugins were mounted or unmounted. */
  set(decisions: Record<string, ConsentDecision>): Promise<void>
  /** Changes the region and so, possibly, the rule set and every default. */
  setRegion(region: string | undefined): Promise<void>
  /** Resolves when the region (if async) is known and plugins reflect the current states. */
  ready(): Promise<void>
  snapshot(): ConsentSnapshot
  subscribe(listener: () => void): () => void
}

const STATES: ConsentState[] = ['granted', 'denied', 'pending']

/**
 * Checks a rule set read from JSON or YAML and returns it typed. Throws an
 * error naming the offending field.
 */
export function parseConsentRules(input: unknown): ConsentRules {
  const fail = (path: string, problem: string): never => {
    throw new Error(`[h4b] consent rules: ${path} ${problem}`)
  }
  const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
  const checkText = (v: unknown, path: string) => {
    if (v === undefined || typeof v === 'string') return
    if (!isObject(v) || Object.values(v).some((t) => typeof t !== 'string')) {
      fail(path, 'must be a string or an object of strings by language')
    }
  }
  if (!isObject(input)) return fail('', 'must be an object')
  if (typeof input.id !== 'string' || !input.id) fail('id', 'must be a non-empty string')
  checkText(input.label, 'label')
  if (input.regions !== undefined) {
    if (!Array.isArray(input.regions) || input.regions.some((r) => typeof r !== 'string' || !r)) {
      fail('regions', 'must be a list of region codes')
    }
  }
  if (!isObject(input.purposes)) return fail('purposes', 'must be an object')
  for (const [name, rule] of Object.entries(input.purposes)) {
    const path = `purposes.${name}`
    if (!isObject(rule)) fail(path, 'must be an object')
    const r = rule as Record<string, unknown>
    if (!STATES.includes(r.default as ConsentState)) fail(`${path}.default`, `must be one of ${STATES.join(', ')}`)
    if (r.eraseOnRevoke !== undefined && typeof r.eraseOnRevoke !== 'boolean') fail(`${path}.eraseOnRevoke`, 'must be a boolean')
    checkText(r.label, `${path}.label`)
    checkText(r.description, `${path}.description`)
  }
  return input as ConsentRules
}

/** The rule set for `region`: the most specific match, then the first declared. Unknown region → only `*` sets match. */
export function selectConsentRules(rules: readonly ConsentRules[], region: string | undefined): ConsentRules | undefined {
  const target = region?.trim().toUpperCase()
  let best: { rules: ConsentRules; score: number } | undefined
  for (const set of rules) {
    for (const code of set.regions ?? ['*']) {
      const c = code.toUpperCase()
      const score =
        c === '*' ? 1 : !target ? 0 : c === target ? 3 : target.startsWith(`${c}-`) ? 2 : 0
      if (score > (best?.score ?? 0)) best = { rules: set, score }
    }
  }
  return best?.rules
}

/** Picks the text for `language` (exact, then base language, then English, then the first). */
export function consentText(text: ConsentText | undefined, language = 'en'): string | undefined {
  if (text === undefined || typeof text === 'string') return text
  const entries = Object.entries(text)
  const lang = language.toLowerCase()
  const find = (l: string) => entries.find(([k]) => k.toLowerCase() === l)?.[1]
  return find(lang) ?? find(lang.split('-')[0]!) ?? find('en') ?? entries[0]?.[1]
}

const normalize = (decision: ConsentDecision): ConsentState =>
  decision === true ? 'granted' : decision === false ? 'denied' : decision

type ChannelLike = {
  postMessage(data: unknown): void
  addEventListener(type: 'message', listener: (event: { data: any }) => void): void
  close(): void
}

/** @internal The kernel's implementation of `h4b.consent`. */
export class ConsentManager implements ConsentControl {
  readonly enabled: boolean
  readonly manage: (() => void) | undefined
  private all: ConsentRules[]
  private decisions = new Map<string, ConsentState>()
  private _region: string | undefined
  private regionKnown: boolean
  private regionLoading?: Promise<void>
  private listeners = new Set<() => void>()
  private channel?: ChannelLike
  private channelName: string | false
  /** Changes are applied one at a time so mounts and unmounts never interleave. */
  private settled: Promise<void> = Promise.resolve()

  constructor(
    options: ConsentOptions | undefined,
    /** Called after every change; resolves when plugins follow. Never rejects. */
    private onChange: () => Promise<void>,
  ) {
    this.enabled = options !== undefined
    this.manage = options?.manage
    const list = options?.rules === undefined ? [] : Array.isArray(options.rules) ? options.rules : [options.rules]
    this.all = list.map(parseConsentRules)
    for (const [purpose, decision] of Object.entries(options?.initial ?? {})) {
      this.decisions.set(purpose, normalize(decision))
    }
    const region = options?.region
    if (typeof region === 'function') {
      this.regionKnown = false
      this.regionLoading = Promise.resolve()
        .then(region)
        .then(
          (r) => this.applyRegion(r),
          () => this.applyRegion(undefined), // unknown region: only `*` rules apply
        )
    } else {
      this._region = region
      this.regionKnown = true
    }
    this.channelName = options?.channel ?? 'default'
  }

  /** @internal Starts listening to the other tabs (the kernel calls it on start). */
  open() {
    if (!this.enabled || this.channel || this.channelName === false || typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(`h4b-consent:${this.channelName}`)
    ;(channel as { unref?: () => void }).unref?.() // never keeps a Node process alive
    channel.addEventListener('message', ({ data }) => {
      if (data?.type === 'h4b:consent' && data.decisions) void this.record(data.decisions, false)
    })
    this.channel = channel as unknown as ChannelLike
  }

  get region() {
    return this._region
  }

  get rules(): ConsentRules | undefined {
    return this.regionKnown ? selectConsentRules(this.all, this._region) : undefined
  }

  get purposes(): string[] {
    return [...new Set([...Object.keys(this.rules?.purposes ?? {}), ...this.decisions.keys()])]
  }

  state(purpose: string): ConsentState {
    if (!this.enabled) return 'granted'
    const decided = this.decisions.get(purpose)
    if (decided) return decided
    if (!this.regionKnown) return 'pending'
    return this.rules?.purposes[purpose]?.default ?? 'pending'
  }

  granted(purpose: string): boolean {
    return this.state(purpose) === 'granted'
  }

  /** Whether withdrawing `purpose` erases what was stored for it. */
  erases(purpose: string): boolean {
    return this.rules?.purposes[purpose]?.eraseOnRevoke ?? true
  }

  set(decisions: Record<string, ConsentDecision>): Promise<void> {
    return this.record(decisions, true)
  }

  async setRegion(region: string | undefined): Promise<void> {
    await this.regionLoading
    await this.applyRegion(region)
  }

  async ready(): Promise<void> {
    await this.regionLoading
    await this.settled
  }

  snapshot(): ConsentSnapshot {
    return {
      enabled: this.enabled,
      region: this._region,
      rules: this.rules?.id,
      states: Object.fromEntries(this.purposes.map((p) => [p, this.state(p)])),
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  /** @internal */
  close() {
    this.channel?.close()
    this.channel = undefined
  }

  private async record(decisions: Record<string, ConsentDecision>, broadcast: boolean) {
    if (!this.enabled) return
    const normalized = Object.fromEntries(Object.entries(decisions).map(([p, d]) => [p, normalize(d)]))
    if (broadcast) this.channel?.postMessage({ type: 'h4b:consent', decisions: normalized })
    await this.change(() => {
      for (const [purpose, state] of Object.entries(normalized)) this.decisions.set(purpose, state)
    })
  }

  private applyRegion(region: string | undefined) {
    return this.change(() => {
      this._region = region
      this.regionKnown = true
    })
  }

  private change(mutate: () => void): Promise<void> {
    const run = async () => {
      mutate()
      for (const listener of this.listeners) {
        try {
          listener()
        } catch {
          /* a broken listener must not stop the others */
        }
      }
      await this.onChange()
    }
    this.settled = this.settled.then(run, run)
    return this.settled
  }
}
