# Speech synthesis and voice effects

How the assistant speaks: the browser's voice, a voice from your backend, or a neural model that runs in the page, plus a chain of effects on top. Three packages share the work:

| Package | What it brings |
|---|---|
| [`@handsforbots/voice`](./plugins.md#voice) | The `voice` plugin: speaks replies sentence by sentence, picks the provider, decides when models download and who speaks meanwhile, plays audio through Web Audio. Providers `webSpeechTTS` and `httpTTS` |
| [`@handsforbots/voice-models`](./plugins.md#voice-models) | Models in the page: `piperTTS`, `kokoroTTS`, `transformersTTS`. Files from Hugging Face, any URL, a folder you serve or bytes the app already has, downloaded with progress and cached |
| [`@handsforbots/voice-effects`](./plugins.md#voice-effects) | Effects as JSON: filters, dynamics, modulation, echo, reverb, distortion; presets; offline rendering; export to SSML and FFmpeg |

Try everything in the lab: `pnpm --filter @handsforbots/example-voice-lab dev` ([examples/voice-lab](../../examples/voice-lab/README.md)).

## Quick start

```ts
import * as ort from 'onnxruntime-web/wasm'
import { createH4B } from '@handsforbots/core'
import { voice, webSpeechSTT, webSpeechTTS } from '@handsforbots/voice'
import { espeakPhonemizer, piperTTS, piperVoice } from '@handsforbots/voice-models'
import { voiceEffects } from '@handsforbots/voice-effects'

const piper = piperTTS({
  ...piperVoice('en_US-lessac-medium'), // rhasspy/piper-voices on Hugging Face
  phonemizer: espeakPhonemizer({ module: () => import('./vendor/piper_phonemize.js'), wasm: '/vendor/piper_phonemize.wasm', data: '/vendor/piper_phonemize.data' }),
  runtime: ort,
})

const h4b = createH4B({
  plugins: [
    voice({
      stt: webSpeechSTT(),
      tts: [piper, webSpeechTTS()], // the model, and the browser voice while it downloads
      load: { start: 'idle', whileLoading: 'fallback' },
      effects: voiceEffects('radio'),
    }),
  ],
})
await h4b.start()
```

Nothing else changes: the widget, barge-in, the echo filter and `tracks` work the same with any provider.

## Choosing where the voice comes from

| Provider | Where it runs | Download | Quality | Effects | Notes |
|---|---|---|---|---|---|
| `webSpeechTTS()` | The browser / OS | none | varies by OS; robotic on many Androids | prosody only | Free, instant, offline on most systems. Its audio never passes through the page |
| `httpTTS({ url })` | Your backend (OpenAI, Azure, Google, Polly, ElevenLabs, your own Piper…) | none | the best available | all | Keys stay on the server. Network latency per sentence. Text leaves the page (`remote: true`) |
| `piperTTS(...)` | The page (ONNX, WebAssembly) | 15–115 MB per voice + phonemizer | good, clear | all | Fast on CPU, one language per voice, dozens of languages. Voice licenses vary |
| `kokoroTTS(...)` | The page (ONNX) | 92–326 MB + phonemizer | very natural | all | Several languages, 24 kHz, heavy: slower than real time on one CPU thread (see [Performance](#performance)) |
| `transformersTTS(...)` | The page ([transformers.js](https://huggingface.co/docs/transformers.js)) | depends on the model | depends | all | Any `text-to-speech` pipeline (MMS, SpeechT5, VITS…); transformers.js downloads and caches by itself |

A rule of thumb: start with `webSpeechTTS` (zero cost), add `httpTTS` when quality matters and a server is fine, add a model in the page when audio must not leave the device, or to have a consistent voice everywhere without paying per character.

Providers are a list: the first one usable speaks; the next ones are fallbacks (unsupported, still downloading, or failed). `setTTS(list)` swaps the list at runtime (the user picked another voice).

## Model files: where they come from

Every model file is a `ModelSource`:

```ts
import { huggingFace } from '@handsforbots/voice-models'

huggingFace('rhasspy/piper-voices', 'en/en_US/lessac/medium/en_US-lessac-medium.onnx', { revision: 'a1b2c3…' }) // the Hub
'/models/en_US-lessac-medium.onnx'          // a folder your server or CDN serves
'https://cdn.example.com/voices/x.onnx'     // any URL (CORS must allow your origin)
fileInput.files[0]                          // a Blob the user picked, or one you kept in OPFS
new Uint8Array(bytes)                       // bytes you already have
async () => fetch('/api/voice', { headers }) // anything: a signed URL, an authenticated route…
```

- Helpers build the Hub paths: `piperVoice('pt_BR-faber-medium')` → `{ model, config }`, `kokoroModel({ dtype: 'q8', voices: ['af_heart'] })` → `{ model, tokenizer, voices }`.
- **Pin a revision** (a commit hash) in production. `main` can change under you.
- **A folder you serve**: mirror the files and point the sources at it. Same-origin files avoid CORS and third-party availability. A mirror of the whole Hub works through `huggingFace(repo, file, { endpoint })`.
- **Cache**: downloads are kept in Cache Storage (`h4b-voice-models`) and served from there next time. `cache: false` turns it off, `cache: myCache` replaces it (`{ match, put }`), `clearModelCache()` erases it (a "free space" button).
- **Progress**: `fetchModel` reads the stream and reports `{ loaded, total, file }`. A compressed transfer (`Content-Encoding`) makes the total unknown; set the provider's `size` to show a percentage anyway.

## When the download starts and who speaks meanwhile

```ts
voice({
  tts: [kokoro, webSpeechTTS()],
  load: { start: 'first-use', whileLoading: 'fallback' }, // the default
})
```

`load.start`:

| Value | The model starts downloading… | Good for |
|---|---|---|
| `'first-use'` (default) | the first time the bot speaks | sites where few visitors talk to the bot |
| `'eager'` | when the plugin mounts | apps where speech is the main thing |
| `'idle'` | when the page is idle (`requestIdleCallback`, at most 5 s later) | downloading early without competing with the page load |
| `'manual'` | only when you call `voice.loadSpeech()` | asking first ("Download a better voice, 82 MB?"), Wi-Fi only, after consent |

`load.whileLoading`:

| Value | While the model is not ready… |
|---|---|
| `'fallback'` (default) | the next ready provider in the list speaks (usually `webSpeechTTS`), then the model takes over sentence by sentence once it is ready |
| `'wait'` | speech waits for a download in progress (the reply is still shown). With nothing downloading (`manual` before `loadSpeech()`), nothing is said |
| `'silent'` | the bot does not speak until the model is ready |

State and control:

```ts
const speech = h4b.get('voice')
speech.getState().ttsStatus
// { kokoro: { state: 'loading', loaded: 31_000_000, total: 111_000_000 }, webspeech: { state: 'ready' } }
await speech.loadSpeech()          // true when ready, false if it failed (the error is in ttsStatus and on the `error` event)
speech.getState().synthesizing     // a sentence is being synthesized (show "…" before the voice starts)
```

- `state` is `unloaded`, `loading`, `ready` or `failed`. Calling `loadSpeech()` again after a failure retries.
- A provider that fails to load reports the error (`source: 'voice:tts:<name>'`) and, when the download was wanted, the next model in the list starts.
- Providers declare `size` (bytes), so you can ask before a `manual` download.
- A sentence whose synthesis fails is spoken by the next ready provider.

## Playback

Providers either play by themselves (`speak`: the browser voice, `httpTTS({ playback: 'element' })`) or return audio (`synthesize` → `{ samples, sampleRate }`) for the voice plugin to play through Web Audio. The second kind gets effects, exact timing for barge-in, and synthesis of the next sentence while the current one plays.

- **Autoplay.** Safari and Firefox only start audio after a user gesture. The plugin unlocks audio on the first pointer, key or touch in the page, and when listening starts. If speech may start long after any gesture (an answer that takes minutes), call `speech.unlockAudio()` inside a click. If the browser still blocks it, the sentence is not spoken and `getState().error.code` is `not-allowed`: show a "tap to hear" button that calls `unlockAudio()`.
- `webAudioPlayer({ context?, output? })` is the default player: pass your own `AudioContext` (to share it with the app) or `output: (ctx) => node` (to route speech into your mixer). Implement `AudioPlayer` for anything else.
- `encodeWav(audio)` turns synthesized audio into a WAV `Blob` (download, upload, cache fixed phrases).

## Prosody: rate, pitch, volume

Prosody is part of an effects chain (`prosody: { rate?: 1, pitch?: 0, volume?: 0 }`; pitch in semitones, volume in dB) and every provider gets what it can apply:

| Provider | Rate | Pitch | Volume |
|---|---|---|---|
| `webSpeechTTS` | `utterance.rate` | `utterance.pitch` (±12 st maps to 0.5–2) | `utterance.volume` (cut at 0 dB) |
| `piperTTS` | `length_scale` (the model speaks slower or faster, same voice) | player (playback rate, with the model compensating the tempo) | player gain |
| `kokoroTTS` | `speed` input | player | player gain |
| `httpTTS({ prosody: true })` | your backend (sent in the body; see [SSML](#ssml)) | your backend | your backend |
| any other `synthesize` provider | player | player | player gain |

When the player shifts the pitch, it changes the playback rate (pitch and tempo move together, like a tape) and asks the model for the opposite tempo, so only the pitch changes. Rate is never faked through the playback rate: without a model that supports it, it is left alone rather than shifting the pitch.

## Effects

An effects chain is plain JSON. Effect types and parameter names follow the Web Audio API (`BiquadFilterNode`'s `frequency`, `Q`, `gain`; `DynamicsCompressorNode`'s `threshold`, `knee`, `ratio`, `attack`, `release`; `DelayNode`'s `delayTime`), so the vocabulary is the one audio developers already know:

```json
{
  "version": 1,
  "name": "walkie-talkie",
  "prosody": { "rate": 1.05 },
  "effects": [
    { "type": "highpass", "frequency": 500, "Q": 0 },
    { "type": "lowpass", "frequency": 2800, "Q": 0 },
    { "type": "distortion", "amount": 0.3 },
    { "type": "compressor", "threshold": -30, "ratio": 8, "id": "comp" },
    { "type": "limiter" }
  ]
}
```

- Effects run in order. Omitted parameters take their defaults; values out of range are rejected by `validateChain` (`set` throws with every problem listed).
- `bypass: true` keeps an effect in the chain but silent; `id` lets you address it.
- Change the chain while the bot talks: `fx.set(chain | 'preset')`, `fx.update('comp', { ratio: 4 })`, `fx.update(0, { bypass: true })`, `fx.setProsody({ pitch: -3 })`. The next sentence uses it.
- `fx.definitions()` describes every effect type and parameter (label, range, default, units, slider skew), so an editor can be generated instead of written. The lab does exactly that.
- `chainSchema()` returns a JSON Schema (2020-12) for chains, to validate them in a CMS, an API or an LLM's structured output.

### Effects

| Type | Parameters (default) | Notes |
|---|---|---|
| `highpass`, `lowpass` | `frequency` (100 / 4000 Hz), `Q` (1 dB) | `Q` is resonance in dB, as in Web Audio: 0 is flat, negative is softer |
| `bandpass`, `notch`, `allpass` | `frequency` (1000 Hz), `Q` (1) | |
| `peaking` | `frequency` (1500 Hz), `Q` (1), `gain` (0 dB) | |
| `lowshelf`, `highshelf` | `frequency` (200 / 4000 Hz), `gain` (0 dB) | |
| `gain` | `gain` (0 dB) | |
| `compressor` | `threshold` (-24 dB), `knee` (30 dB), `ratio` (12), `attack` (0.003 s), `release` (0.25 s) | `DynamicsCompressorNode` |
| `limiter` | `threshold` (-2 dB), `release` (0.15 s), `output` (-2 dB) | A compressor at ratio 20; end chains that add gain with it |
| `gate` | `threshold` (-40 dB), `reduction` (30 dB) | Sample-level: quiets the pauses (the hiss of quantized models) |
| `varispeed` | `rate` (1) | Tape speed: pitch and tempo together |
| `vibrato` | `rate` (5 Hz), `depth` (0.0025 s) | Pitch wobble (modulated delay) |
| `tremolo` | `rate` (5 Hz), `depth` (0.6) | Volume wobble |
| `chorus` | `depth` (0.004 s), `mix` (0.5) | Two voices modulated at fixed rates |
| `delay` | `delayTime` (0.25 s), `feedback` (0.35), `mix` (0.4) | Echo |
| `reverb` | `time` (1.2 s), `mix` (0.3), `seed` (1) | Convolution with a generated room (deterministic per `seed`) |
| `distortion` | `amount` (0.2) | Soft clipping (`tanh`) |
| `ringmod` | `frequency` (40 Hz), `mix` (0.8) | The classic robot |
| `dispersion` | `stages` (88), `frequency` (1750 Hz), `Q` (0.6), `feedback` (0.7), `mix` (0.85) | A cascade of all-pass filters: the "pew" of a stone thrown on ice, or a spring reverb |

### Presets

`clean`, `denoise` (for quantized models that hiss), `radio`, `telephone`, `megaphone`, `robot`, `underwater`, `cave`, `ice`, `chipmunk` and `giant` (prosody only for `chipmunk`, which therefore also works with the browser voice). They are plain chains in `presets`: copy one and change it.

### Your own effects

```ts
import { defineEffect, voiceEffects } from '@handsforbots/voice-effects'

const bitcrusher = defineEffect({
  type: 'bitcrusher',
  label: 'Bitcrusher',
  params: { bits: { label: 'Bits', type: 'int', defaultValue: 6, minValue: 1, maxValue: 16 } },
  process(audio, p) {
    const steps = 2 ** (p.bits! - 1)
    return { ...audio, samples: audio.samples.map((s) => Math.round(s * steps) / steps) }
  },
  ffmpeg: (p) => `acrusher=bits=${p.bits}`,
})

const fx = voiceEffects({ version: 1, effects: [{ type: 'bitcrusher', bits: 4 }] }, { effects: [bitcrusher] })
```

An effect has `process` (samples in, samples out, before playback), `build` (Web Audio nodes: return `{ input, output, dispose? }`; may change `source.playbackRate`), or both. `tail(params)` says how long it rings after the voice ends (echo, reverb), `speed(params)` how it changes the duration, `ffmpeg(params)` its FFmpeg equivalent.

### Offline rendering

`fx.render(audio)` runs the chain in an `OfflineAudioContext`, tails included: pre-render fixed lines ("Hello! How can I help?"), let users download what the bot said (`encodeWav`), or test a chain without playing it.

### The browser voice and effects

`speechSynthesis` plays inside the browser or the OS: its audio never reaches the page, so no filter, reverb or distortion can touch it. It only gets the chain's prosody. If effects matter, use a model or a backend. The lab shows both side by side.

## Standards: why this format, and the bridges

There is no single market standard for "an effect chain for a voice". The format reuses the pieces that are standard:

- **Web Audio API** (W3C) for the effect vocabulary: node types and parameter names, units and meanings (Q in dB for low/high-pass, for instance). A chain reads as the graph a Web Audio developer would build.
- **Web Audio Modules 2.0** for parameter descriptors: every parameter has `label`, `type`, `defaultValue`, `minValue`, `maxValue`, `discreteStep`, `exponent`, `choices`, `units`, the fields WAM plugins publish so hosts can build controls. Hosting third-party WAM plugins (WebAssembly effects from the WAM ecosystem) is not supported yet.
- **SSML 1.1** (W3C) for prosody: `rate` as a factor (100% = 1), `pitch` in semitones, `volume` in dB, the units of `<prosody>`.

Two exports reach the tools that already exist:

### SSML

```ts
import { toSSML } from '@handsforbots/voice-effects'

toSSML('Hello there.', fx.get().prosody, { language: 'en-US' })
// <speak version="1.1" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><prosody rate="110%" pitch="+2st">Hello there.</prosody></speak>
```

For cloud engines behind `httpTTS({ prosody: true, body })`: Azure, Google and Polly accept `<prosody>`. Polly does not take semitones: `{ pitch: '%' }` writes percentages. `fragment: true` returns only the `<prosody>` element to put in your own `<speak>`. Text is escaped. The other effects have no SSML equivalent; apply them in the page (the default) or on the server with FFmpeg.

### FFmpeg

```ts
import { toFFmpeg } from '@handsforbots/voice-effects'

const { filter, command, warnings } = toFFmpeg(fx.get(), { sampleRate: 22050 })
command('in.wav', 'out.wav') // ffmpeg -i "in.wav" -af "highpass=f=500:t=q:w=1,…" "out.wav"
```

The same chain on a server: pre-render audio, process files produced by a backend engine, or check a chain with the tools sound engineers use. Every built-in effect maps to FFmpeg filters (`highpass`, `equalizer`, `acompressor`, `alimiter`, `vibrato`, `tremolo`, `chorus`, `aecho`, `asoftclip`…); pitch uses `asetrate` + `aresample`, rate uses `atempo`. Where FFmpeg only approximates the Web Audio result (its compressor detects levels differently, the reverb becomes a set of echoes), `warnings` says so; `ringmod` has no FFmpeg filter and is skipped with a warning. The test suite runs every preset through a real FFmpeg.

## Phonemizers and licenses

Piper and Kokoro read phonemes, not letters. `espeakPhonemizer` runs espeak-ng (compiled to WebAssembly through piper-phonemize), the phonemizer Piper voices were trained with.

- **espeak-ng is GPL-3.0.** H4B does not ship it: you pass the build (`module`, `wasm`, `data`). Shipping it in a web page is distributing it; check what that means for your product. [`@diffusionstudio/piper-wasm`](https://github.com/diffusion-studio/piper-wasm) is one build (its wrapper is MIT, espeak-ng inside is GPL).
- The data file (about 17 MB, every espeak language) is the largest piece. A build with only your languages is much smaller.
- `Phonemizer` is a small contract (`phonemize(text, language) → string[]`): plug in another phonemizer (a lexicon, a server endpoint, a language-specific library) to avoid espeak, at the cost of pronunciation matching the voice's training.
- Model licenses are separate: Kokoro is Apache-2.0; Piper voices each have a `MODEL_CARD` with the license of their dataset (some are non-commercial).

## Performance

- **Threads.** `onnxruntime-web` runs on one thread unless the page is cross-origin isolated (`Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`), which also requires every cross-origin file (Hugging Face included) to allow it. One thread is the safe default.
- **Worker.** Inference blocks the thread it runs on. `ort.env.wasm.proxy = true` moves it to a worker, so long sentences do not freeze the page.
- **Sentence pipeline.** The plugin synthesizes the next sentence while the current one plays, so after the first sentence the wait is hidden when the model is faster than real time.
- **Measured in the lab** (one Apple Silicon Mac, Chrome, one thread, files from Hugging Face; your numbers will differ): Piper `pt_BR-faber-medium` downloaded 82 MB (voice + espeak data) in 11 s and spoke 4.4 s of audio with no noticeable wait; Kokoro q8 downloaded 112 MB in 11 s and took 8.2 s to produce 5.2 s of audio. Kokoro on one thread is slower than real time: use it with `whileLoading: 'fallback'`, short sentences, or a backend.
- **Quantized models hiss** in the pauses more than fp32 ones. The `denoise` preset (a gate and a high-pass) hides most of it.

## Writing a provider

```ts
import type { TextToSpeech } from '@handsforbots/voice'

const myTTS: TextToSpeech = {
  name: 'my-engine',
  remote: false,              // does text leave the page?
  size: 40_000_000,           // bytes to download, if any
  prosody: { rate: true },    // what it applies itself; the player does the rest
  isSupported: () => typeof WebAssembly === 'object',
  async load(onProgress, signal) { /* download, report { loaded, total }, honor signal */ },
  async synthesize(text, { language, voice, prosody, signal }) {
    return { samples: new Float32Array(/* mono */), sampleRate: 24000 }
  },
}
```

Implement `speak(text, options)` instead of `synthesize` for engines that play by themselves (they get no effects). `cancel()` stops them. ONNX engines can reuse `fetchModel`, `loadRuntime` and `chunkText` from `@handsforbots/voice-models`.

Sources: [References → Speech synthesis](./references.md#speech-synthesis-and-effects). Decision: [ADR 0013](../adr/0013-sintese-de-voz-e-efeitos.md).
