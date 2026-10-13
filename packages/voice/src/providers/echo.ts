import type { EchoFilter, EchoInput } from '../types.js'

export type TextEchoFilterOptions = {
  /** Share of the heard words that must repeat what the bot said for the text to count as echo. Default 0.6. */
  threshold?: number
  /** Consecutive words that must match the bot's speech, in order, before they count. Default 2. */
  minRun?: number
  /** How long after a sentence ends its words can still come back from the recognizer (ms). Default 2000. */
  tail?: number
  name?: string
}

/** Lowercase, without accents and punctuation: "Você," and "voce" are the same word. */
const wordKey = (word: string) =>
  word
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']/gu, '')

const wordsOf = (text: string) => text.split(/\s+/).map(wordKey).filter(Boolean)

/** Same word, allowing one wrong letter in longer words (recognizers mishear echo). */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.min(a.length, b.length) < 4 || Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++
      j++
      continue
    }
    if (++edits > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else {
      i++
      j++
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

/**
 * Share of `heard` covered by runs of at least `minRun` consecutive words that
 * also appear, in the same order, in `spoken`.
 */
export function echoCoverage(heard: string[], spoken: string[], minRun: number): number {
  if (heard.length === 0 || spoken.length === 0) return 0
  const covered = new Array<boolean>(heard.length).fill(false)
  // run[j]: length of the matching run ending at heard[i] and spoken[j].
  let previous = new Array<number>(spoken.length + 1).fill(0)
  for (let i = 0; i < heard.length; i++) {
    const current = new Array<number>(spoken.length + 1).fill(0)
    for (let j = 0; j < spoken.length; j++) {
      if (!sameWord(heard[i]!, spoken[j]!)) continue
      const run = previous[j]! + 1
      current[j + 1] = run
      if (run >= minRun) for (let k = i - run + 1; k <= i; k++) covered[k] = true
    }
    previous = current
  }
  return covered.filter(Boolean).length / heard.length
}

/**
 * Drops what the recognizer heard when it repeats the bot's own speech (the
 * speaker leaking into the microphone), so the bot does not interrupt or
 * answer itself. It compares words, not audio, so it works with any
 * recognizer, Web Speech included. The decision is all or nothing: a text
 * that is mostly the bot's words is dropped; anything else is kept whole, so
 * a user who quotes the bot while talking over it is never cut short.
 */
export function textEchoFilter(options: TextEchoFilterOptions = {}): EchoFilter {
  const threshold = options.threshold ?? 0.6
  const minRun = Math.max(1, options.minRun ?? 2)
  return {
    name: options.name ?? 'text-echo',
    tail: options.tail ?? 2000,
    filter(input: EchoInput) {
      const heard = wordsOf(input.text)
      // One word cannot be told apart from a user saying the same word.
      if (heard.length < minRun) return input.text
      const spoken = wordsOf(input.speech.map((s) => s.text).join(' '))
      return echoCoverage(heard, spoken, minRun) >= threshold ? '' : input.text
    },
  }
}
