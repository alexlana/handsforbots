---
name: handsforbots-conversation
description: Build conversation behavior on Hands for Bots v2 (H4B) - what happens when the user types or speaks while the assistant is answering (interrupt, merge or queue; h4b.setInput, h4b.interrupt, the interrupt.before hook), stop buttons, and continuous voice conversation with @handsforbots/voice (hands-free open microphone, end-of-turn detection with silence or a model such as httpEndOfTurn, LiveKit turn-detector, Smart Turn or an LLM, barge-in, backchannels, sentence-by-sentence speech, phase/endOfTurnAt state for the UI). Use when code calls h4b.interrupt, setInput, whileBusy, voice({ mode: 'hands-free' }), endTurn, discardTurn, setEndOfTurn or listens to voice.decision, when building a voice assistant UI or a stop/send/trash button on top of H4B, or when a backend must handle interrupted replies.
---

# Hands for Bots v2 — interruption and voice conversation

Full guide: `docs/en-us/conversation.md` (`docs/pt-br/conversation.md`) in https://github.com/alexlana/handsforbots. Decision: `docs/adr/0011-interrupcao-e-fim-de-turno.md`. Sources and vendor figures: `docs/en-us/references.md`. When the code in the project disagrees with this file, trust the code (`packages/core/src/kernel.ts`, `packages/voice/src/voice.ts`).

## Input while the assistant is busy

Default (`whileBusy: 'interrupt'`): a typed or spoken message sent during a reply **cuts the reply** (it keeps only what was shown, `interrupted: true`) and becomes the next turn. If nothing came out of the running turn yet, the turn is **resumed**: aborted, its user message removed, and run again with both inputs as one message. Quick consecutive messages are joined the same way (one backend call).

| Need | Do |
|---|---|
| Market-style default (stop and send in one step) | nothing; or `createH4B({ input: { whileBusy: 'interrupt' } })` |
| Join extra messages without cutting the reply | `whileBusy: 'merge'` |
| Old behavior: every message waits its turn | `whileBusy: 'queue'` |
| Per modality / per rule | `{ whileBusy: { text: 'merge', transcript: 'interrupt' } }` or a function of the signal |
| Let the user or the app change it at runtime | `h4b.setInput({ whileBusy })`; read it from `getSnapshot().input` |
| One signal with its own rule | `h4b.signal({ ..., whileBusy: 'queue' })` |
| Stop button / Escape / barge-in | `h4b.interrupt()` (the `keyboard` plugin's Escape already does) |
| Cancel without touching the history | `h4b.abort()` |

Facts to rely on:

- Only `text`, `transcript` and `audio` triggers follow the policy. GUI events, commands, `runAction` and `push` always queue. Direct commands (menu) and captures are never joined.
- `ask()` queues unless you pass `whileBusy`, so awaited results are never merged into user input.
- `h4b.interrupt()` aborts, marks the assistant message of the running turn `interrupted: true`, cuts its text where `interrupt.before` interceptors say (default: everything shown), removes it if empty, emits `turn.interrupted`. Idle: it cuts the last reply only if an interceptor reduces `keep` (the voice plugin does, to what was spoken).
- Events: `signal.merged` `{ signal, from, resumed }`, `turn.interrupted` `{ turnId, messageId?, kept?, removed? }`. `getSnapshot().queued` shows merged text.
- The widget marks interrupted replies (class `interrupted`, trailing "…", tooltip `strings.interrupted`).

Backend checklist (tell the user if their server misses any): stop the LLM call when the request is aborted (otherwise interrupting saves no tokens); use the history received on each run, never a server-side copy; accept assistant messages that end mid-text. Bundled transports do not send the `interrupted` flag: map it in `request.before` if the model must know (return new objects, never mutate).

## Continuous voice conversation

```ts
voice({
  stt: webSpeechSTT(),            // or websocketSTT / voskSTT / voskBrowserSTT / httpSTT
  tts: webSpeechTTS(),
  mode: 'hands-free',              // open microphone
  endOfTurn: httpEndOfTurn({ url: '/api/end-of-turn' }), // optional
  turn: { silence: 800, minSilence: 300, maxSilence: 2000, threshold: 0.5, timeout: 600 },
  bargeIn: { minWords: 2, ignore: [...] },               // or false
  echo: textEchoFilter({ threshold: 0.6, tail: 2000 }),   // the default; false turns it off
})
await h4b.get('voice').listen()
```

- Finals pile up into **one pending turn**, sent when the turn ends: after `silence` ms without a provider; with one, asked after `minSilence`, sent if probability ≥ `threshold`, else at `maxSilence`; a slow (`timeout`) or failing provider falls back to `silence`. Speaking again keeps the turn open.
- A recognizer that detects turns itself decides alone and the provider is not called: `websocketSTT({ ..., endOfTurn: true, parse })` with `parse` returning `{ final, endOfTurn }` (services such as AssemblyAI or Soniox, behind your server's token endpoint), or any provider with `capabilities.endOfTurn` that passes `{ endOfTurn }` to `onFinal`.
- Buttons: "send now" `voice.endTurn()`, "trash" `voice.discardTurn()` (keeps listening), mic off and send `voice.stop()`, mic off and discard `voice.cancel()`.
- Runtime: `voice.setEndOfTurn(provider | null)`, `voice.setEcho(filter | null)`, `voice.configure({ turn, bargeIn })`.
- Draw from `getState()`: `phase` (`idle | listening | userSpeaking | waitingEndOfTurn | botSpeaking`), `partial` (whole pending turn), `endOfTurnAt` (epoch ms; animate a countdown from it), `interrupted`, `endOfTurn`, `error`.
- Debug with `h4b.on('voice.decision', d => …)`: `interrupt`, `ignore` (`reason: backchannel | echo`), `end-of-turn` (`reason: stt | model | silence | max-silence | manual`), `end-of-turn-unavailable`.

### End-of-turn providers

Contract: `{ name, input: 'text' | 'audio', historyTurns?, remote?, consent?, isSupported(), load?(), predict({ partial, history, language, audio? }, signal) → probability 0..1 }`.

- **Remote** (LiveKit turn-detector, a BERT classifier, a typed-decision model like Jev, or the app's LLM): `httpEndOfTurn({ url, headers?, parse?, historyTurns?, consent? })` POSTs `{ partial, history, language }` and reads `{ probability }` or `{ done }`. Put the model and its key on the server; never call a paid API from the browser.
- **Local** (Smart Turn in ONNX via `onnxruntime-web`, a small text model): implement the contract; use `load()` to download on demand.
- Audio providers need a recognizer with `capabilities.audio` (`websocketSTT`, `voskSTT`, `voskBrowserSTT`). **Web Speech exposes no audio**: with `webSpeechSTT`, use a text provider.
- Each remote call costs latency and money per pause; recommend it on by default in hands-free only if the app can afford it, and measure in the app's language (vendor numbers are not ours).

### Barge-in and speech

- Speech over the bot (speaking, or a reply streaming on screen) calls `h4b.interrupt()` before stopping the speech, so the reply keeps the sentences already spoken. Live transcripts need `minWords`; finals always count; backchannels ("aham", "tá", "ok", "uh-huh", "mhm"…, per language) are dropped. Pressing to talk while the bot answers interrupts too.
- While the bot is still thinking (nothing shown), speech does not interrupt: the kernel resumes the turn with both messages when the new turn ends.
- `bargeIn: false` pauses recognition while the bot speaks instead.
- **Echo filter** (on by default): with speakers the recognizer hears the bot, and browser echo cancellation often misses it (`speechSynthesis` plays outside the browser's audio path), so the bot would interrupt or answer itself. `textEchoFilter()` drops texts whose words mostly (`threshold` 0.6, runs of `minRun` 2) repeat the sentences spoken in the last `tail` ms (2000); all or nothing, single words pass. Replace it with any `EchoFilter` `{ name, tail?, filter({ text, final, speech, language }) → text | '' }` (synchronous: it runs on every partial), or `echo: false` for headphone-only apps. If users report the bot cutting itself off, check `voice.decision` for `reason: 'echo'` before raising `minWords`.
- Replies are spoken sentence by sentence as they stream (output follows input with `output: 'auto'`).
- Which voice speaks (browser, backend, models in the page), model downloads and voice effects: the `handsforbots-speech` skill.

## Privacy

Providers declare `remote` (text or audio leaves the page; `webSpeechSTT` is remote: Chrome sends audio to its service, continuously in hands-free) and may take a `consent` purpose; while not granted, the plugin skips them (next recognizer, or silence). The app shows the notice and stores the decision (see the `handsforbots-consent` skill). Microphone recognizers use echo cancellation; Web Speech does not let you set it. Recommend testing on real phones, with and without headphones, and long sessions on iOS Safari.

## Pitfalls

- Don't build your own silence timer or "is the bot talking" flag on top of the plugin: use `phase` and `endOfTurnAt`.
- Don't call `voice.cancelSpeech()` before `h4b.interrupt()` in custom barge-in code: interrupt first, so the voice plugin can report how much was spoken.
- Don't send `partial` to the backend yourself; the plugin sends the turn.
- `bargeInChars` no longer exists; use `bargeIn: { minWords }`.
