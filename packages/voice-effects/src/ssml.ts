import type { Prosody } from '@handsforbots/voice'

export type SsmlOptions = {
  /** `xml:lang` of `<speak>`, e.g. 'pt-BR'. */
  language?: string
  /** Wraps the text in `<voice name="…">`. */
  voice?: string
  /**
   * Unit for the pitch. `st` (default): semitones, as in SSML 1.1 (Azure,
   * Google). `%`: a relative change, for services without semitones (Amazon Polly).
   */
  pitch?: 'st' | '%'
  /** Only the `<prosody>` element, without `<speak>` (to embed in your own document). Default false. */
  fragment?: boolean
}

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

const signed = (value: number, unit: string) => `${value >= 0 ? '+' : ''}${Number(value.toFixed(2))}${unit}`

/** The `<prosody>` attributes (W3C SSML 1.1, section 3.2.4) for the prosody. */
export function prosodyAttributes(prosody: Prosody = {}, unit: 'st' | '%' = 'st'): Record<string, string> {
  const attributes: Record<string, string> = {}
  if (prosody.rate !== undefined && prosody.rate !== 1) attributes.rate = `${Math.round(prosody.rate * 100)}%`
  if (prosody.pitch) {
    attributes.pitch = unit === 'st' ? signed(prosody.pitch, 'st') : signed((2 ** (prosody.pitch / 12) - 1) * 100, '%')
  }
  if (prosody.volume) attributes.volume = signed(prosody.volume, 'dB')
  return attributes
}

/** SSML for `text` with the prosody, for TTS services behind your backend. */
export function toSSML(text: string, prosody: Prosody = {}, options: SsmlOptions = {}): string {
  const attributes = Object.entries(prosodyAttributes(prosody, options.pitch))
    .map(([key, value]) => ` ${key}="${value}"`)
    .join('')
  let body = escape(text)
  if (attributes) body = `<prosody${attributes}>${body}</prosody>`
  if (options.voice) body = `<voice name="${escape(options.voice)}">${body}</voice>`
  if (options.fragment) return body
  const lang = options.language ? ` xml:lang="${escape(options.language)}"` : ''
  return `<speak version="1.1" xmlns="http://www.w3.org/2001/10/synthesis"${lang}>${body}</speak>`
}
