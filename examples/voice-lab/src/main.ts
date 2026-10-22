import { createH4B, type H4B } from '@handsforbots/core'
import {
  encodeWav,
  httpTTS,
  voice,
  webSpeechTTS,
  type SpeechAudio,
  type SpeechLoadStart,
  type SpeechWhileLoading,
  type TextToSpeech,
  type VoiceService,
} from '@handsforbots/voice'
import {
  paramsOf,
  presets,
  toFFmpeg,
  toSSML,
  voiceEffects,
  type EffectDefinition,
  type ParamInfo,
  type PresetName,
} from '@handsforbots/voice-effects'
import {
  clearModelCache,
  kokoroModel,
  piperVoice,
  workerTTS,
  type HuggingFaceFile,
  type KokoroDtype,
  type ModelSource,
  type WorkerTextToSpeech,
} from '@handsforbots/voice-models'
import { buildModel, type ModelConfig } from './models.ts'
import './styles.css'

const $ = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T
const value = (id: string) => $(id).value.trim()

const log = (message: string) => {
  const line = `${new Date().toLocaleTimeString()}  ${message}\n`
  $('log').textContent = line + ($('log').textContent ?? '').slice(0, 4000)
}

/** Hugging Face, or the same layout under a folder the app serves. */
function relocate(source: ModelSource): ModelSource {
  const file = source as HuggingFaceFile
  if (value('source') === 'hf') return { ...file, revision: value('revision') || 'main' }
  const folder = (value('folder') || import.meta.env.VITE_MODELS_URL || '/models').replace(/\/$/, '')
  return `${folder}/${file.huggingFace}/${file.file}`
}

let clips: SpeechAudio[] = []
const recorded = (tts: TextToSpeech): TextToSpeech =>
  tts.synthesize
    ? {
        ...tts,
        synthesize: async (text, options) => {
          const audio = await tts.synthesize!(text, options)
          clips.push(audio)
          $<HTMLButtonElement>('wav').disabled = $<HTMLButtonElement>('wav-fx').disabled = false
          return audio
        },
      }
    : tts

function modelConfig(kind: 'piper' | 'kokoro'): ModelConfig {
  const cache = $('cache').checked
  if (kind === 'piper') {
    const files = piperVoice(value('piper-voice'))
    return { kind, model: relocate(files.model), config: relocate(files.config), cache }
  }
  const voiceId = value('kokoro-voice') || 'pf_dora'
  const files = kokoroModel({ dtype: value('kokoro-dtype') as KokoroDtype, voices: [voiceId] })
  return {
    kind,
    model: relocate(files.model),
    tokenizer: relocate(files.tokenizer),
    voices: { [voiceId]: relocate(files.voices[voiceId]!) },
    cache,
  }
}

let worker: WorkerTextToSpeech | undefined

function engine(): TextToSpeech {
  const kind = value('engine')
  switch (kind) {
    case 'piper':
    case 'kokoro':
      if (!$('worker').checked) return buildModel(modelConfig(kind))
      // The model runs in voice.worker.ts; the page only gets the audio.
      worker = workerTTS({
        worker: () => new Worker(new URL('./voice.worker.ts', import.meta.url), { type: 'module' }),
        config: modelConfig(kind),
        name: `${kind} (worker)`,
        prosody: { rate: true },
      })
      return worker
    case 'http':
      return httpTTS({ url: value('http-url'), prosody: true })
    case 'webspeech':
      return webSpeechTTS()
    default:
      throw new Error(`Unknown engine ${kind}`)
  }
}

const fx = voiceEffects('clean')
let h4b: H4B | undefined
let speech: VoiceService | undefined

async function apply() {
  await h4b?.stop()
  worker?.terminate()
  worker = undefined
  const providers = [recorded(engine())]
  if ($('fallback').checked && value('engine') !== 'webspeech') providers.push(webSpeechTTS())
  h4b = createH4B({
    plugins: [
      voice({
        tts: providers,
        language: value('language'),
        output: 'voice',
        effects: fx,
        load: { start: value('start') as SpeechLoadStart, whileLoading: value('while') as SpeechWhileLoading },
      }),
    ],
  })
  h4b.on('error', ({ error, source }) => log(`error from ${source}: ${error instanceof Error ? error.message : String(error)}`))
  await h4b.start()
  speech = h4b.get('voice') as VoiceService
  speech.subscribe(renderStatus)
  renderStatus()
  log(`applied: ${providers.map((p) => p.name).join(' → ')}, start ${value('start')}, while loading ${value('while')}`)
  Object.assign(window, { h4b, fx, clips: () => clips })
}

const megabytes = (bytes?: number) => (bytes === undefined ? '?' : `${(bytes / 1e6).toFixed(1)} MB`)

function renderStatus() {
  if (!speech) return
  const state = speech.getState()
  const rows = Object.entries(state.ttsStatus).map(([name, s]) => {
    const share = s.total ? Math.round(((s.loaded ?? 0) / s.total) * 100) : undefined
    const bar = s.state === 'loading' ? `<progress max="100" ${share === undefined ? '' : `value="${share}"`}></progress>` : ''
    const size = s.state === 'loading' ? `${megabytes(s.loaded)} / ${megabytes(s.total)}` : ''
    return `<div><b>${name}</b> <span class="tag ${s.state}">${s.state}</span> ${bar} ${size} ${s.error ? `<span class="error">${String(s.error)}</span>` : ''}</div>`
  })
  const flags = [state.synthesizing && 'synthesizing', state.speaking && 'speaking'].filter(Boolean).join(', ')
  $('status').innerHTML = `${rows.join('')}<div class="hint">speaking with: ${state.tts ?? 'none'} ${flags ? `· ${flags}` : ''}</div>`
}

// Effects editor: generated from the definitions, so custom effects get controls too.
const definitions = new Map(fx.definitions().map((d) => [d.type, d]))

const toSlider = (info: ParamInfo, v: number) => ((v - info.minValue) / (info.maxValue - info.minValue)) ** (1 / (info.exponent ?? 1))
const fromSlider = (info: ParamInfo, t: number) => {
  const v = info.minValue + (info.maxValue - info.minValue) * t ** (info.exponent ?? 1)
  return info.type === 'int' ? Math.round(v) : Number(v.toPrecision(4))
}

function control(info: ParamInfo, current: number, onChange: (v: number) => void): HTMLElement {
  const label = document.createElement('label')
  const out = document.createElement('output')
  const show = (v: number) => (out.textContent = `${info.choices?.[v] ?? v}${info.units ? ` ${info.units}` : ''}`)
  label.textContent = info.label
  if (info.type === 'boolean') {
    const box = Object.assign(document.createElement('input'), { type: 'checkbox', checked: current === 1 })
    box.onchange = () => onChange(box.checked ? 1 : 0)
    label.prepend(box)
    return label
  }
  const input = Object.assign(document.createElement('input'), { type: 'range', min: '0', max: '1', step: '0.001' })
  input.value = String(toSlider(info, current))
  input.oninput = () => {
    const v = fromSlider(info, Number(input.value))
    show(v)
    onChange(v)
  }
  show(current)
  label.append(input, out)
  return label
}

const prosodyInfo: Record<'rate' | 'pitch' | 'volume', ParamInfo> = {
  rate: { label: 'Rate', defaultValue: 1, minValue: 0.5, maxValue: 2, units: '×' },
  pitch: { label: 'Pitch', defaultValue: 0, minValue: -12, maxValue: 12, units: 'st' },
  volume: { label: 'Volume', defaultValue: 0, minValue: -24, maxValue: 6, units: 'dB' },
}

function renderEffects() {
  const chain = fx.get()
  const prosody = $('prosody')
  prosody.replaceChildren(
    ...(Object.keys(prosodyInfo) as (keyof typeof prosodyInfo)[]).map((key) =>
      control(prosodyInfo[key], chain.prosody?.[key] ?? prosodyInfo[key].defaultValue, (v) =>
        fx.setProsody({ ...fx.get().prosody, [key]: v }),
      ),
    ),
  )
  $('chain').replaceChildren(
    ...chain.effects.map((spec, index) => {
      const definition = definitions.get(spec.type) as EffectDefinition
      const box = document.createElement('fieldset')
      const legend = document.createElement('legend')
      const bypass = Object.assign(document.createElement('input'), { type: 'checkbox', checked: !spec.bypass, title: 'on' })
      bypass.onchange = () => fx.update(index, { bypass: !bypass.checked })
      const remove = Object.assign(document.createElement('button'), { textContent: '×', className: 'quiet', title: 'remove' })
      remove.onclick = () => fx.set({ ...fx.get(), effects: fx.get().effects.filter((_, i) => i !== index) })
      legend.append(bypass, ` ${definition.label} `, remove)
      const params = document.createElement('div')
      params.className = 'params'
      const current = paramsOf(spec, definition)
      for (const [key, info] of Object.entries(definition.params)) {
        params.append(control(info, current[key]!, (v) => fx.update(index, { [key]: v })))
      }
      box.append(legend, params)
      return box
    }),
  )
  renderExports()
}

function renderExports() {
  const chain = fx.get()
  if (document.activeElement !== $('json')) $<HTMLTextAreaElement>('json').value = JSON.stringify(chain, null, 2)
  $('ssml').textContent = toSSML(value('text'), chain.prosody, { language: value('language') })
  const ffmpeg = toFFmpeg(chain)
  $('ffmpeg').textContent = [ffmpeg.command('speech.wav', 'speech-fx.wav'), ...ffmpeg.warnings.map((w) => `# ${w}`)].join('\n')
}

const presetSelect = $<HTMLSelectElement>('preset')
presetSelect.append(...Object.keys(presets).map((name) => new Option(name, name)))
presetSelect.onchange = () => {
  fx.set(presetSelect.value as PresetName)
  renderEffects()
}
const addSelect = $<HTMLSelectElement>('add')
addSelect.append(...[...definitions.values()].map((d) => new Option(d.label, d.type)))
addSelect.onchange = () => {
  if (!addSelect.value) return
  fx.set({ ...fx.get(), effects: [...fx.get().effects, { type: addSelect.value }] })
  addSelect.value = ''
  renderEffects()
}
fx.subscribe(renderExports)
for (const id of ['text', 'language']) $(id).addEventListener('input', renderExports)

$('json-apply').onclick = () => {
  try {
    fx.set(JSON.parse($<HTMLTextAreaElement>('json').value))
    $('json-error').textContent = ''
    renderEffects()
  } catch (error) {
    $('json-error').textContent = error instanceof Error ? error.message : String(error)
  }
}

const joined = (): SpeechAudio => {
  const sampleRate = clips[0]!.sampleRate
  const samples = new Float32Array(clips.reduce((n, c) => n + c.samples.length, 0))
  let offset = 0
  for (const clip of clips) {
    samples.set(clip.samples, offset)
    offset += clip.samples.length
  }
  return { samples, sampleRate }
}
const download = (audio: SpeechAudio, name: string) => {
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(encodeWav(audio)), download: name })
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

$('wav').onclick = () => download(joined(), 'speech.wav')
$('wav-fx').onclick = async () => download(await fx.render(joined()), 'speech-fx.wav')

// Turned by the main thread (a CSS animation would keep spinning while the page is frozen).
const spinner = document.querySelector<HTMLElement>('.spinner')!
const spin = (now: number) => {
  spinner.style.transform = `rotate(${(now / 2) % 360}deg)`
  requestAnimationFrame(spin)
}
requestAnimationFrame(spin)

/** The longest gap between frames while `job` runs: how long the page was frozen. */
async function longestFrame<T>(job: () => Promise<T>): Promise<number> {
  let longest = 0
  let last = performance.now()
  let running = true
  const tick = (now: number) => {
    longest = Math.max(longest, now - last)
    last = now
    if (running) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  try {
    await job()
  } finally {
    running = false
  }
  return Math.round(Math.max(longest, performance.now() - last))
}

$('speak').onclick = async () => {
  if (!speech) await apply()
  clips = []
  speech!.unlockAudio()
  const started = performance.now()
  const frozen = await longestFrame(() => speech!.speak(value('text')))
  log(`spoke in ${Math.round(performance.now() - started)} ms with ${speech!.getState().tts}; longest frame ${frozen} ms`)
}
$('stop').onclick = () => speech?.cancelSpeech()
$('apply').onclick = () => void apply()
$('load').onclick = async () => {
  if (!speech) await apply()
  const started = performance.now()
  const ok = await speech!.loadSpeech()
  log(ok ? `model ready in ${Math.round(performance.now() - started)} ms` : 'model failed to load')
}
$('clear').onclick = async () => log((await clearModelCache()) ? 'cached models erased' : 'nothing cached')

const showEngineFields = () => {
  const kind = value('engine')
  const model = kind === 'piper' || kind === 'kokoro'
  for (const el of document.querySelectorAll<HTMLElement>('[data-engine]'))
    el.hidden = el.dataset.engine !== kind && !(el.dataset.engine === 'model' && model)
}
$('engine').addEventListener('change', showEngineFields)
showEngineFields()
$('folder').placeholder = import.meta.env.VITE_MODELS_URL ?? '/models'

renderEffects()
await apply()
