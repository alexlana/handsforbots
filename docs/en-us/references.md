# References

Libraries, services, papers and products that informed Hands for Bots decisions, grouped by topic. Each section says which decision or page it supports and when the sources were accessed. Figures (latency, size, price, accuracy) are the vendors' or authors' own and were **not measured by us** unless stated. Third-party code bundled or adapted in the project is credited in [NOTICE](../../NOTICE.md).

When a decision relies on outside sources, add them here (both languages) in the same commit.

## Interruption, end of turn and barge-in

Supports [ADR 0011](../adr/0011-interrupcao-e-fim-de-turno.md) and [Interruption and voice conversation](./conversation.md). Accessed 2026-10-10 and 2026-10-11.

### End-of-turn detection

| Source | What it is | Notes |
|---|---|---|
| [LiveKit turn detector](https://docs.livekit.io/agents/logic/turns/turn-detector) · [blog: improved end-of-turn model](https://livekit.com/blog/improved-end-of-turn-model-cuts-voice-ai-interruptions-39) | Open-weights text model: reads the transcript of the last turns and predicts the probability of the end-of-turn token; works alongside VAD, with per-language thresholds | Multilingual model: ~400 MB RAM, ~25 ms per inference, built for Python servers. Plugin code Apache-2.0, model under the LiveKit Model License. Fits `httpEndOfTurn` behind your server |
| [Pipecat Smart Turn](https://github.com/pipecat-ai/smart-turn) · [docs](https://docs.pipecat.ai/server/utilities/turn-detection/smart-turn-overview) · [model card](https://huggingface.co/pipecat-ai/smart-turn-v3) · [ONNX build](https://huggingface.co/soniqo/Smart-Turn-v3.2-ONNX) · [v3.2 post](https://www.daily.co/blog/smart-turn-v3-2-handling-noisy-environments-and-short-responses/) | Audio model (Whisper Tiny encoder + linear classifier, ~8M parameters) over the last seconds of the waveform, run at each pause after a VAD | BSD-2, weights, data and training code released, 23 languages. Sizes differ by source: 8 MB int8 ONNX (Pipecat), 11 MB quantized (soniqo build). ~10–36 ms on fast CPUs per the vendors; slower CPUs take much longer. The only option we would consider in the browser (`onnxruntime-web`); not verified |
| [FireRedChat (arXiv 2509.06502)](https://arxiv.org/pdf/2509.06502) | Paper; trains a BERT end-of-turn classifier on ~830k partial vs complete utterances | Reference for text classifiers that can run locally or on a server |
| [AssemblyAI turn detection](https://www.assemblyai.com/docs/streaming/turn-detection) | Streaming STT with semantic end of turn plus a silence fallback | Defaults cited: confidence 0.4, 400 ms minimum silence. Our `turn.threshold` / `turn.minSilence` follow the same idea. Fits `capabilities.endOfTurn` |
| [Soniox endpoint detection](https://soniox.com/docs/stt/rt/endpoint-detection) | Streaming STT whose speech model emits an end token from intonation, pauses and context | Fits `capabilities.endOfTurn` |
| [OpenAI Realtime VAD](https://developers.openai.com/api/docs/guides/realtime-vad) | `server_vad` (silence) and `semantic_vad` (the model judges whether the utterance is complete), with `eagerness` | Shows the same split we adopted: silence alone vs a semantic channel |
| [Jev 1.13 on OpenRouter](https://openrouter.ai/models/typesafe/jev-1.13) | Hosted typed-decision model (returns a choice, not free text) through OpenRouter's Decisions API | Vendor figures: p50 ~0.13 s, US$ 0.042 per million input tokens. Beta, one provider, closed weights; Portuguese not documented. Key must stay on the server (`httpEndOfTurn`) |

### Browser APIs and libraries

| Source | Use in H4B |
|---|---|
| [Web Speech API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) | `webSpeechSTT` / `webSpeechTTS`. Recognition is not offline in most browsers and gives no access to audio or microphone constraints |
| [`MediaTrackConstraints` (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints) | `echoCancellation`, `noiseSuppression`, `autoGainControl` in `openMicrophone` |
| [ONNX Runtime Web](https://www.npmjs.com/package/onnxruntime-web) | Candidate runtime for local end-of-turn models (Smart Turn) in a separate package; not a dependency |
| [vosk-browser](https://www.npmjs.com/package/vosk-browser) | Offline recognition in `voskBrowserSTT`; exposes audio, so it can feed audio end-of-turn models |

### Products and behavior

| Source | Notes |
|---|---|
| ChatGPT voice mode, Gemini Live | Open microphone, speech cuts the reply: the basis for `interrupt` as the default |
| ChatGPT text chat | Lets you type during a reply but requires stopping before sending; no native queue found. A third-party userscript adds one ([ChatGPT Message Queue](https://greasyfork.org/en/scripts/561517-chatgpt-message-queue)), a sign that people want it |

Also cited in the discussion that led to the ADR, without a specific page checked by us: Hamming, Picovoice, Coval, Dograh and WorkAdventure (voice agent evaluation and turn-taking write-ups).

## Speech synthesis and effects

Supports [ADR 0013](../adr/0013-sintese-de-voz-e-efeitos.md) and [Speech synthesis and voice effects](./speech.md). Accessed 2026-10-16. Sizes and timings measured by us are marked; the others are the authors'.

### Standards behind the effects format

| Source | Use in H4B |
|---|---|
| [Web Audio API (W3C)](https://www.w3.org/TR/webaudio/) | Effect vocabulary: node types and parameter names (`BiquadFilterNode`, `DynamicsCompressorNode`, `DelayNode`, `ConvolverNode`, `WaveShaperNode`); Q in dB for low/high-pass. The player and the effects are built on it |
| [Web Audio Modules 2.0](https://www.webaudiomodules.com/docs/intro) · [API](https://github.com/webaudiomodules/api) | Parameter descriptors (`label`, `type`, `defaultValue`, `minValue`, `maxValue`, `discreteStep`, `exponent`, `choices`, `units`) so editors are generated. Hosting WAM plugins is not supported yet |
| [SSML 1.1 (W3C)](https://www.w3.org/TR/speech-synthesis11/) | Prosody units (`rate` as a percentage, `pitch` in semitones, `volume` in dB) and the `toSSML` export |
| [Amazon Polly `<prosody>`](https://docs.aws.amazon.com/polly/latest/dg/prosody-tag.html) · [Azure SSML voice and prosody](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice) · [Google Cloud TTS SSML](https://cloud.google.com/text-to-speech/docs/ssml) | What cloud engines accept: Polly takes pitch as a percentage, hence `toSSML({ pitch: '%' })` |
| [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html) | `toFFmpeg`: `highpass`, `equalizer`, `acompressor`, `alimiter`, `vibrato`, `tremolo`, `chorus`, `aecho`, `asoftclip`, `atempo`, `asetrate`, `aresample`. Every preset is checked against FFmpeg 7.1 in the tests |
| [JSON Schema 2020-12](https://json-schema.org/draft/2020-12) | `chainSchema()` |

### Engines and models

| Source | What it is | Notes |
|---|---|---|
| [Piper](https://github.com/rhasspy/piper) (archived; continued at [OHF-Voice/piper1-gpl](https://github.com/OHF-Voice/piper1-gpl)) · [voices](https://huggingface.co/rhasspy/piper-voices) | Fast VITS voices exported to ONNX, one language per voice, a `.onnx.json` with the phoneme map and inference settings | `piperTTS`, `piperVoice`. The original repository was MIT; the continuation is GPL. Voice licenses vary per `MODEL_CARD`. Measured by us: `pt_BR-faber-medium` + espeak data = 82 MB |
| [Kokoro 82M](https://huggingface.co/hexgrad/Kokoro-82M) · [ONNX build](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) | StyleTTS 2 based, 82M parameters, 24 kHz, several languages, Apache-2.0 | `kokoroTTS`, `kokoroModel`. ONNX files from 92 MB (q8) to 326 MB (fp32). Measured by us on one CPU thread: 8.2 s for 5.2 s of audio |
| [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/) | Runs ONNX models in the browser (WebAssembly, WebGPU) | The runtime for Piper and Kokoro; passed by the app, not a dependency. Threads need cross-origin isolation; `env.wasm.proxy` moves only inference to a worker; `workerTTS` moves the whole provider |
| [transformers.js](https://huggingface.co/docs/transformers.js) | Hugging Face pipelines in the browser, including `text-to-speech` | `transformersTTS` adapts any of its TTS pipelines |
| [espeak-ng](https://github.com/espeak-ng/espeak-ng) · [piper-phonemize](https://github.com/rhasspy/piper-phonemize) · [@diffusionstudio/piper-wasm](https://github.com/diffusion-studio/piper-wasm) | Text to IPA phonemes; piper-phonemize wraps it as Piper expects; piper-wasm is a WebAssembly build | `espeakPhonemizer`. espeak-ng is GPL-3.0, so H4B does not ship it. The data file of that build is 17 MB |

### Browser APIs

| Source | Use in H4B |
|---|---|
| [`SpeechSynthesisUtterance` (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance) | `webSpeechTTS` prosody (`rate`, `pitch`, `volume`). Its audio cannot be routed into Web Audio, so effects do not apply |
| [Autoplay guide (MDN)](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay) | Why the player unlocks audio on the first gesture and `unlockAudio()` exists |
| [`CacheStorage` (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage) | Where downloaded models are kept (`h4b-voice-models`) |
| [`Worker()` with `type: 'module'` (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker) | `workerTTS`: the worker file imports the runtime on demand, so it must be a module worker (Chromium 80+, Firefox 114+, Safari 15+) |
| [Transferable objects (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) | The synthesized samples come back from the worker by transferring their buffer, without a copy |
| [Vite: `worker.format`](https://vite.dev/config/worker-options) | `'es'` is needed for workers that import modules on demand; the default `iife` cannot |
