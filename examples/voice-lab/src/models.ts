import createPiperPhonemize from '@diffusionstudio/piper-wasm/build/piper_phonemize.js'
import phonemizeData from '@diffusionstudio/piper-wasm/build/piper_phonemize.data?url'
import phonemizeWasm from '@diffusionstudio/piper-wasm/build/piper_phonemize.wasm?url'
import type { TextToSpeech } from '@handsforbots/voice'
import {
  espeakPhonemizer,
  kokoroTTS,
  piperTTS,
  type ModelSource,
  type OnnxRuntime,
  type PiperPhonemizeFactory,
  type RuntimeSource,
} from '@handsforbots/voice-models'

/** Plain data, so the same model can be built in the page or in voice.worker.ts. */
export type ModelConfig =
  | { kind: 'piper'; model: ModelSource; config: ModelSource; cache: boolean }
  | { kind: 'kokoro'; model: ModelSource; tokenizer: ModelSource; voices: Record<string, ModelSource>; cache: boolean }

// onnxruntime-web stays out of the bundle until a model loads.
const runtime: RuntimeSource = async () => {
  const ort = await import('onnxruntime-web/wasm')
  ort.env.wasm.numThreads = 1
  return ort as unknown as OnnxRuntime
}

// espeak-ng (GPL-3.0) through piper-phonemize: the example's choice, not part of H4B.
const phonemizer = espeakPhonemizer({
  module: async () => createPiperPhonemize as unknown as PiperPhonemizeFactory,
  wasm: phonemizeWasm,
  data: phonemizeData,
})

export function buildModel(config: ModelConfig): TextToSpeech {
  const cache = config.cache ? undefined : false
  if (config.kind === 'piper') return piperTTS({ model: config.model, config: config.config, phonemizer, runtime, cache })
  return kokoroTTS({ model: config.model, tokenizer: config.tokenizer, voices: config.voices, phonemizer, runtime, cache })
}
