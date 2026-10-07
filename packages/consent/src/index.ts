import { parseConsentRules, type ConsentRules } from '@handsforbots/core'

export { ccpa, gdpr, lgpd, optIn, presets } from './presets.js'
export {
  PATTERNS,
  redact,
  redactMessages,
  redactor,
  redactText,
  type PatternName,
  type RedactOptions,
  type RedactPluginOptions,
} from './redact.js'
export { parseConsentRules, selectConsentRules, type ConsentRules } from '@handsforbots/core'

export type LoadRulesOptions = {
  /** Turns the file's text into data. Default `JSON.parse`; pass e.g. `YAML.parse` (from the `yaml` package) for `.yml` files. */
  parse?: (text: string) => unknown
  fetch?: typeof fetch
}

/**
 * Fetches rule sets from a file you host (one set or a list), validates them
 * and returns a list for `createH4B({ consent: { rules } })`.
 *
 *   rules: await loadConsentRules('/consent/rules.yml', { parse: YAML.parse })
 */
export async function loadConsentRules(url: string, options: LoadRulesOptions = {}): Promise<ConsentRules[]> {
  const response = await (options.fetch ?? globalThis.fetch)(url, { headers: { accept: 'application/json, application/yaml, text/plain' } })
  if (!response.ok) throw new Error(`[h4b] consent: ${response.status} loading rules from ${url}`)
  const data = (options.parse ?? JSON.parse)(await response.text())
  return (Array.isArray(data) ? data : [data]).map(parseConsentRules)
}

/**
 * The region your server wrote into the page, e.g.
 * `<meta name="h4b-region" content="BR">` from a CDN geo header
 * (`CF-IPCountry`, `CloudFront-Viewer-Country`, `X-Vercel-IP-Country`…).
 */
export function regionFromMeta(name = 'h4b-region'): string | undefined {
  if (typeof document === 'undefined') return undefined
  const content = document.querySelector(`meta[name="${name.replace(/["\\]/g, '\\$&')}"]`)?.getAttribute('content')?.trim()
  return content || undefined
}

/**
 * Asks your server for the region: the endpoint answers with the code as text
 * (`BR`, `US-CA`) or as JSON `{ "region": "BR" }`. Failures resolve to
 * undefined, so only rule sets for `*` apply.
 */
export function regionFromUrl(url: string, options: { fetch?: typeof fetch } = {}): () => Promise<string | undefined> {
  return async () => {
    try {
      const response = await (options.fetch ?? globalThis.fetch)(url, { credentials: 'same-origin' })
      if (!response.ok) return undefined
      const text = (await response.text()).trim()
      if (text.startsWith('{')) return (JSON.parse(text) as { region?: string }).region?.trim() || undefined
      return text || undefined
    } catch {
      return undefined
    }
  }
}
