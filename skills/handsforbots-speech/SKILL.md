---
name: handsforbots-speech
description: Make a Hands for Bots v2 (H4B) assistant speak with the right voice - the browser's speechSynthesis, a backend TTS through httpTTS, or a neural model in the page with @handsforbots/voice-models (Piper, Kokoro, transformers.js; files from Hugging Face, a URL, a folder or a Blob, downloaded with progress and cached) - decide when models download and who speaks meanwhile (load.start, load.whileLoading, loadSpeech, ttsStatus), and shape the voice with @handsforbots/voice-effects (JSON effect chains in Web Audio terms, presets such as radio, robot or telephone, prosody, custom effects, offline render, SSML and FFmpeg export). Use when code calls voice({ tts }), piperTTS, kokoroTTS, transformersTTS, workerTTS, serveTTS, espeakPhonemizer, voiceEffects, toSSML or toFFmpeg, when the user wants a better, offline, cheaper or stylized bot voice, a download progress bar for a voice model, a page that freezes while the bot speaks, or voice effects.
---

# Hands for Bots v2 — speech synthesis and voice effects

Full guide: `docs/en-us/speech.md` (`docs/pt-br/speech.md`) in https://github.com/alexlana/handsforbots. Decision: `docs/adr/0013-sintese-de-voz-e-efeitos.md`. Sources and measured numbers: `docs/en-us/references.md#speech-synthesis-and-effects`. When the project's code disagrees with this file, trust the code (`packages/voice/src/voice.ts`, `packages/voice-models/src`, `packages/voice-effects/src`). Interruption, barge-in and the echo filter are in the `handsforbots-conversation` skill.

## Pick the engine

| The user wants | Use |
|---|---|
| Free, zero download, any voice is fine | `webSpeechTTS()` |
| The best quality, a server is fine | `httpTTS({ url: '/api/tts', prosody: true })`; the server calls OpenAI / Azure / Google / Polly / ElevenLabs and returns audio. Keys stay on the server |
| Audio must not leave the device, or the same voice on every OS | `piperTTS` (light, fast) or `kokoroTTS` (more natural, heavy) from `@handsforbots/voice-models` |
| A model already wrapped by transformers.js | `transformersTTS({ name, pipeline })` |

Always keep `webSpeechTTS()` last in the list as the fallback while a model downloads: `tts: [model, webSpeechTTS()]`.

```ts
import { espeakPhonemizer, piperTTS, piperVoice } from '@handsforbots/voice-models'

const phonemizer = espeakPhonemizer({ module: () => import('./vendor/piper_phonemize.js'), wasm: '/vendor/piper_phonemize.wasm', data: '/vendor/piper_phonemize.data' })
const piper = piperTTS({ ...piperVoice('en_US-lessac-medium'), phonemizer, runtime: () => import('onnxruntime-web/wasm') })
voice({ tts: [piper, webSpeechTTS()], load: { start: 'idle', whileLoading: 'fallback' } })
```

Facts to rely on:

- The app passes the ONNX runtime (`runtime`: the module or a loader) and the phonemizer build. The packages do not depend on `onnxruntime-web` and **do not ship espeak-ng (GPL-3.0)**. Tell the user about the GPL before they ship `espeakPhonemizer`; `@diffusionstudio/piper-wasm` is one build (17 MB data file with every language). Any `Phonemizer` (`phonemize(text, language) → string[]`) can replace it.
- `piperVoice(id)` and `kokoroModel({ dtype, voices })` build Hugging Face sources. Suggest pinning `revision` to a commit in production. Kokoro voice ids start with the language letter (`a` en-US, `b` en-GB, `e` es, `f` fr, `h` hi, `i` it, `p` pt-BR).
- `ModelSource` is a URL (same-origin folder avoids CORS), `huggingFace(repo, file, { revision, endpoint })`, a `Blob`, bytes, or an async function. Files go to Cache Storage `h4b-voice-models` (`cache: false` off; `clearModelCache()` erases).
- Sizes: Piper 15–115 MB per voice; Kokoro 92 MB (q8) to 326 MB (fp32); plus 17 MB of espeak data. Measured once (one Mac, Chrome, one thread): Kokoro q8 took 8.2 s for 5.2 s of audio, Piper had no noticeable wait. Recommend Kokoro only with `whileLoading: 'fallback'`, a worker (`workerTTS`), or a backend.

## Run the model in a Worker

Synthesis blocks the thread it runs on (phonemizer + model). In the lab, Piper on the page froze it for ~950 ms per sentence; in a Worker the longest frame was ~33 ms. Recommend a Worker whenever the page animates (3D, canvas, CSS driven by JS) or the user types while the bot speaks.

```ts
// voice.worker.ts — the app writes it: functions (phonemizer, runtime) cannot cross to a worker
import { espeakPhonemizer, piperTTS, piperVoice, serveTTS } from '@handsforbots/voice-models'
const phonemizer = espeakPhonemizer({ module: () => import('./vendor/piper_phonemize.js'), wasm: '/vendor/piper_phonemize.wasm', data: '/vendor/piper_phonemize.data' })
serveTTS((config: { voice: string }) => piperTTS({ ...piperVoice(config.voice), phonemizer, runtime: () => import('onnxruntime-web/wasm') }))

// page
const piper = workerTTS({
  worker: () => new Worker(new URL('./voice.worker.ts', import.meta.url), { type: 'module' }),
  config: { voice: 'pt_BR-faber-medium' }, // structured-clone data only
  name: 'piper', size: 82_000_000, prosody: { rate: true },
})
voice({ tts: [piper, webSpeechTTS()] })
```

- The `new Worker(new URL(...), { type: 'module' })` line must be in the app so the bundler builds the file. Vite needs `worker: { format: 'es' }`.
- The worker starts on the first `load`/`synthesize`; `load.start` still decides when. `name` is fixed on the page (default `'worker'`). Signals are forwarded; audio is transferred without a copy.
- A worker that cannot start (no module workers: Firefox < 114, Safari < 15; missing file) makes `load` reject, so the next provider speaks. Keep `webSpeechTTS()` last.
- `piper.terminate()` stops the worker (voice turned off). Don't set `ort.env.wasm.proxy` inside the worker.

## When models download and who speaks meanwhile

| `load.start` | Downloads | `load.whileLoading` | Meanwhile |
|---|---|---|---|
| `first-use` (default) | on the first sentence | `fallback` (default) | next ready provider speaks; the model takes over when ready |
| `eager` | on mount | `wait` | speech waits for a download in progress; none in progress → silent |
| `idle` | when the page is idle (≤ 5 s) | `silent` | nothing is spoken until ready |
| `manual` | on `voice.loadSpeech(name?)` | | |

- `getState().ttsStatus[name]` = `{ state: 'unloaded' | 'loading' | 'ready' | 'failed', loaded?, total?, error? }`; progress updates at most every 100 ms. `provider.size` is known before the download (ask "download 82 MB?" with `manual`).
- `loadSpeech()` resolves `true`/`false` and never throws; calling it again retries. Load errors go to the `error` event with `source: 'voice:tts:<name>'`, and the next model in the list starts.
- `getState().synthesizing` is true while a sentence is being synthesized: show a "…" indicator.
- Swap providers at runtime with `voice.setTTS(list)`.

## Playback

- `synthesize` providers (models, `httpTTS` by default) play through Web Audio: effects apply, and the next sentence is synthesized while the current one plays. `speak` providers (`webSpeechTTS`, `httpTTS({ playback: 'element' })`) play by themselves, without effects.
- Audio unlocks on the first pointer/key/touch in the page and on `listen()`. If speech can start long after any gesture, call `voice.unlockAudio()` in a click. Still blocked → `error.code === 'not-allowed'` and that sentence is not spoken.
- `webAudioPlayer({ context, output })` shares the app's `AudioContext` or routes speech into a node (an `AnalyserNode` for lip sync). `encodeWav(audio)` makes a WAV Blob.

## Effects

```ts
import { voiceEffects } from '@handsforbots/voice-effects'
const fx = voiceEffects('radio')     // or a chain object
voice({ tts, effects: fx })
fx.update(0, { frequency: 400 })      // by index or id; next sentence uses it
fx.setProsody({ pitch: -3, rate: 0.95 })
fx.set({ version: 1, effects: [{ type: 'lowpass', frequency: 900 }, { type: 'reverb', time: 2, mix: 0.4 }, { type: 'limiter' }] })
```

- Chain: `{ version: 1, name?, description?, prosody?: { rate?, pitch? (semitones), volume? (dB) }, effects: [{ type, id?, bypass?, ...params }] }`. Parameter names are Web Audio's (`frequency`, `Q`, `gain`, `threshold`, `ratio`, `delayTime`…). Low/high-pass `Q` is in **dB** (0 = flat).
- Types: `highpass lowpass bandpass peaking lowshelf highshelf notch allpass gain compressor limiter gate varispeed vibrato tremolo chorus delay reverb distortion ringmod dispersion`. Presets: `clean denoise radio telephone megaphone robot underwater cave ice chipmunk giant`.
- `set`/`update` throw on invalid chains with every problem listed (`validateChain` returns them). `chainSchema()` gives the JSON Schema: use it for LLM structured output or a CMS.
- `fx.definitions()` has labels, ranges, defaults, units and slider `exponent` (WAM-style descriptors): generate the editor UI from it.
- Custom: `defineEffect({ type, label, params, process?(audio, p), build?(ctx, p, source) → { input, output, dispose? }, tail?, speed?, ffmpeg? })`, passed as `voiceEffects(chain, { effects: [mine] })`.
- End chains that add gain (distortion, EQ boosts) with `limiter`. Suggest `denoise` for quantized models that hiss.
- **The browser voice only gets prosody** (rate, pitch, volume): its audio never reaches the page. If the user wants radio/robot/reverb with `webSpeechTTS`, explain this and offer a model or a backend.
- Prosody split: providers apply what they declare (`prosody: { rate: true }` for Piper via `length_scale`, Kokoro via `speed`); the player does pitch (playback rate with the opposite tempo asked from the model) and volume. Rate is never faked with the playback rate.

## Bridges

- `toSSML(text, prosody, { language?, voice?, pitch: 'st' | '%', fragment? })` for cloud engines; use `pitch: '%'` for Polly. With `httpTTS({ prosody: true, body: (text, o) => ({ ssml: toSSML(text, o.prosody) }) })` the server receives SSML. Only prosody exists in SSML.
- `toFFmpeg(chain | preset, { sampleRate })` → `{ filter, warnings, command(input, output) }` to apply the same chain on a server or in a build script. Read `warnings`: some effects are approximations, `ringmod` is skipped.
- `fx.render(audio)` renders offline (tails included) for pre-generated lines or downloads.

## Verify

- `pnpm --filter @handsforbots/example-voice-lab dev` (port 5192) exercises every option against real models; `h4b`, `fx` and `clips()` are on `window`.
- In tests, fake providers with `synthesize` and a fake `AudioPlayer` (`player` option); never wait fixed delays.

## Pitfalls

- Don't call the ONNX runtime or fetch models at import time: pass loaders, let `load.start` decide.
- Don't put cloud TTS keys in the page; use `httpTTS` to your server.
- Don't expect `state.tts` to mean "ready": check `ttsStatus`.
- Cross-origin isolation (COOP/COEP) enables threads but blocks Hugging Face files unless they send CORP; one thread is the safe default.
