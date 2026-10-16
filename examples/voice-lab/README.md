# Voice lab (v2)

A test bench for speech synthesis: pick an engine, where its files come from and when they download, then shape the voice with effects and see the same chain as JSON, SSML and an FFmpeg command.

## Run

From the repository root:

```bash
pnpm install
pnpm --filter @handsforbots/example-voice-lab dev   # http://localhost:5192
```

## What to try

| Section | Options |
|---|---|
| Engine | Piper (any voice id from [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices)), Kokoro 82M (file size and voice), your backend (`httpTTS`, posts `{ text, language, voice, prosody }` and expects audio back), `speechSynthesis` |
| Model files | Hugging Face (with a revision), or a folder you serve laid out as `<folder>/<repo>/<file>`. Set the default folder with `VITE_MODELS_URL` (`VITE_MODELS_URL=/models pnpm … dev`, files in `public/models`). Cache Storage on or off; "Erase cached models" clears it |
| Loading | `load.start` (`first-use`, `eager`, `idle`, `manual`) and `load.whileLoading` (`fallback`, `wait`, `silent`); `speechSynthesis` as fallback or not. "Download model now" calls `loadSpeech()`; the status shows each provider's state and progress |
| Speak | Speaks the text with the current settings; download what the model said as WAV, raw or rendered through the effects |
| Effects | Presets, an editor generated from the effect definitions (add, bypass, remove, sliders), prosody, the chain as editable JSON, and its SSML and FFmpeg translations |

Open the console: `h4b`, `fx` and `clips()` are on `window`.

## Notes

- The phonemizer is espeak-ng through [`@diffusionstudio/piper-wasm`](https://github.com/diffusion-studio/piper-wasm) (espeak-ng is GPL-3.0). It is this example's choice: the H4B packages do not include it.
- `onnxruntime-web` runs on one thread here (no cross-origin isolation, so files from Hugging Face load). Kokoro is slower than real time on one thread; Piper is not. See [Performance](../../docs/en-us/speech.md#performance).
- `speechSynthesis` only gets the prosody: its audio never reaches the page, so the other effects cannot apply.
