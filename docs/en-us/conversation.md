# Interruption and voice conversation

How Hands for Bots handles a message that arrives while the assistant is still answering, and how the voice plugin runs a continuous conversation: open microphone, end-of-turn detection and barge-in. Decision record: [ADR 0011](../adr/0011-interrupcao-e-fim-de-turno.md) (Portuguese). Sources: [References](./references.md).

## Input while busy

Turns run one at a time. What a typed or spoken message does when it arrives while a turn runs is the **input policy**, `whileBusy`:

| Policy | The new message… | The reply in progress… |
|---|---|---|
| `interrupt` (default) | becomes the next turn | stops; keeps what was shown, marked `interrupted: true` |
| `merge` | joins a message not answered yet, or waits | continues |
| `queue` | waits for everything before it | continues |

With `interrupt` and `merge`, a turn that has **produced nothing yet** is resumed instead: it is aborted, its user message leaves the history and it runs again with both inputs as one message. Messages sent in a quick sequence are joined the same way, so the backend gets one call instead of several. Typed messages are joined with a line break, speech with a space.

```ts
const h4b = createH4B({ plugins, input: { whileBusy: 'interrupt' } })

h4b.setInput({ whileBusy: 'queue' })                                   // at runtime, e.g. from a settings screen
h4b.setInput({ whileBusy: { text: 'merge', transcript: 'interrupt' } }) // per modality; missing ones use 'interrupt'
h4b.setInput({ whileBusy: (signal) => (signal.source === 'widget' ? 'merge' : 'interrupt') })
h4b.signal({ modality: 'text', parts, source: 'my-input', whileBusy: 'queue' }) // one signal

h4b.getSnapshot().input // the policy in force
```

Rules:

- Only `text`, `transcript` and `audio` triggers follow the policy. GUI events, commands, `runAction` and `push` always queue.
- Direct commands (menu) and captures are never joined: while a trigger is still being routed, new input only queues, and it is joined only if the route turns out to be the transport.
- `ask()` queues unless you pass `whileBusy`, because its result is awaited.
- A queued trigger with `queue` never absorbs others, and a running turn whose trigger has `queue` is never cut by the policy.

Events: `signal.merged` (`{ signal, from, resumed }`) and `turn.interrupted` (`{ turnId, messageId?, kept?, removed? }`). `getSnapshot().queued` shows the joined text, so the widget's dimmed pending message updates in place.

### Interrupting on demand

`h4b.interrupt()` is the stop button, Escape (the `keyboard` plugin uses it) and barge-in:

1. aborts the running job (transports and actions get the `AbortSignal`);
2. marks the assistant message of that turn `interrupted: true` and cuts its text where the `interrupt.before` interceptors say the user stopped getting it: by default, everything shown;
3. removes the message if nothing is left and it carries no tool calls;
4. emits `turn.interrupted` (with `by`, who cut it) and saves;
5. tells the backend on the next turn (see below).

When nothing is running, it only cuts the last reply if an interceptor says part of it was not delivered (the voice plugin reports what was spoken). `interrupt({ clearQueue: true })` also drops the queue; `interrupt({ by: 'stop-button' })` says who cut it (default `api`; typed input gives its modality, the voice plugin `voice`). `abort()` still exists and cancels without touching the history.

```ts
// A plugin that knows how much of a reply the user saw (e.g. a paced reveal):
ctx.intercept('interrupt.before', (point) => ({ ...point, keep: Math.min(point.keep, revealed(point.messageId)) }))
```

Deltas that arrive after the cut are ignored. The widget shows interrupted replies with a trailing "…" and a tooltip (`strings.interrupted`).

### What your backend must do

- **Stop generating when the request is aborted.** The kernel closes the stream (AG-UI SSE, HTTP), but only the server can stop the LLM call. Otherwise an interruption saves no tokens.
- **Use the history it receives.** Transports send the whole history on each run. A backend that keeps its own copy will diverge: it will not see joined messages, removed turns or cut replies.
- **Accept truncated assistant messages.** An interrupted reply ends mid-text.
- **Read what happened while it answered** ([ADR 0015](../adr/0015-retorno-da-interrupcao.md)). The next request carries one-turn context signals (`once: true`, removed after that request):
  - `conversation.interrupted`: `{ messageId, kept, total, by }`, after an interruption that cut a reply. `kept` is how many characters stayed (what was spoken or shown), `total` how long the reply was when cut, `by` who cut it. Off with `createH4B({ input: { reportInterruptions: false } })`.
  - `voice.reactions`: `{ messageId, reactions: [{ at, text }] }`, the backchannels heard while the bot spoke (see [Barge-in](#barge-in)). Treat them as a hint: browser recognition often misses or mishears short sounds.

  On the wire they look like any context signal: `context['conversation.interrupted'] = [{ … }]` in `http` and `aiSdk`; in `agui`, a `context` item with `description: 'gui-event from conversation.interrupted'` and `value: 'interrupted: {…}'` (`'transcript from voice.reactions'`, `'reactions: {…}'`). Tell the model in your system prompt what they mean, for example: "If the user interrupted you, do not repeat the part they did not hear unless asked." 

## Voice: continuous conversation

`mode: 'hands-free'` keeps the microphone open. Final results of the recognizer pile up in **one pending turn** and go out as one message when the turn ends.

```ts
import { voice, webSpeechSTT, webSpeechTTS, httpEndOfTurn } from '@handsforbots/voice'

voice({
  stt: webSpeechSTT(),
  tts: webSpeechTTS(),
  mode: 'hands-free',
  endOfTurn: httpEndOfTurn({ url: '/api/end-of-turn' }), // optional; silence alone without it
  turn: { silence: 800, minSilence: 300, maxSilence: 2000, threshold: 0.5, timeout: 600 },
  bargeIn: { minWords: 2 },
})
```

### When the turn ends

After each final result the plugin waits. Every pause counts from the **last words heard**, live transcripts included, not from when the recognizer delivers its final result (Chrome delivers it half a second or more after the user stops). If the final arrives after the wait is already over, the turn goes out at once:

- **No end-of-turn provider** (or it is loading, failed, slow or lacks consent): sends after `silence` ms of quiet.
- **With a provider:** asks it after `minSilence` ms. A probability ≥ `threshold` sends at once; anything lower waits up to `maxSilence` ms. If the answer takes longer than `timeout` ms, or fails, silence decides.
- **Recognizer that detects turns itself** (`capabilities.endOfTurn`, results marked `{ endOfTurn: true | false }`): sends on `endOfTurn: true`, at the latest after `maxSilence`; the provider is not called.

Speaking again before that keeps the turn open. If the recognizer shows words but never finalizes them, they are sent after `maxSilence`. If the turn already went out and the reply has not started, the kernel joins the continuation to it (input policy above).

| Control | Call |
|---|---|
| Send now (skip the wait) | `voice.endTurn()`; words still being recognized go too |
| Trash, keep listening | `voice.discardTurn()` |
| Send and close the microphone | `voice.stop()` |
| Discard and close the microphone | `voice.cancel()` |
| Model on/off at runtime | `voice.setEndOfTurn(provider \| null)` |
| Timings and barge-in at runtime | `voice.configure({ turn, bargeIn })` |
| Replace or turn off the echo filter at runtime | `voice.setEcho(filter \| null)` |

### End-of-turn providers

A provider answers one question: did the user finish, or only pause? It returns a probability; turning it into a wait is the plugin's job, so any provider can be swapped without changing behavior.

```ts
type EndOfTurn = {
  name: string
  input: 'text' | 'audio'
  historyTurns?: number          // recent turns passed to predict; default 6
  remote?: boolean               // the text or audio leaves the page
  consent?: string               // consent purpose; skipped while not granted
  isSupported(): boolean | Promise<boolean>
  load?(): Promise<void>         // download a model on demand; silence decides until it resolves
  predict(input: { partial; history; language; audio? }, signal: AbortSignal): number | Promise<number>
}
```

Options, from the [References](./references.md#end-of-turn-detection):

| Kind | Examples | Input | Where | Cost |
|---|---|---|---|---|
| Text classifier | LiveKit turn-detector, BERT-style classifiers (FireRedChat) | transcript + recent turns | your server (`httpEndOfTurn`) or the browser | a request per pause, or none if local |
| Audio classifier | Pipecat Smart Turn (ONNX) | last seconds of audio | the browser (`onnxruntime-web`) or your server | none if local |
| Typed-decision or general LLM | a decision model, your backend's LLM | transcript + recent turns | your server (`httpEndOfTurn`) | tokens per pause |
| Recognizer with endpointing | AssemblyAI, Soniox, OpenAI Realtime (`semantic_vad`) | inside the STT | the provider | included in STT |

`httpEndOfTurn({ url, headers?, parse?, historyTurns?, consent?, fetch?, name? })` POSTs `{ partial, history, language }` and reads `{ probability }` or `{ done: boolean }` (change it with `parse`). Keys stay on your server:

```ts
// Server side (any framework): answer with the probability that the user finished.
app.post('/api/end-of-turn', async (req, res) => {
  const { partial, history, language } = req.body
  const probability = await myClassifier(partial, history, language) // your model or service
  res.json({ probability })
})
```

A local provider:

```ts
const smartTurn: EndOfTurn = {
  name: 'smart-turn',
  input: 'audio',
  isSupported: () => typeof WebAssembly === 'object',
  load: async () => { session = await loadSmartTurn() },   // e.g. onnxruntime-web
  predict: async ({ audio }) => runSmartTurn(session, audio!.samples, audio!.sampleRate),
}
```

Audio providers get the last `turn.audioSeconds` seconds (default 8) of the same microphone, only from recognizers with `capabilities.audio`: `websocketSTT`, `voskSTT` and `voskBrowserSTT`. Web Speech does not expose audio, so with `webSpeechSTT` use a text provider. Measure latency and accuracy in your language before choosing: the numbers vendors publish are theirs.

### Barge-in

Speech over the bot interrupts it when the bot is speaking or streaming a reply on screen. The plugin calls `h4b.interrupt()` before stopping the speech, so the reply keeps only the sentences already spoken:

- a live transcript needs `minWords` words (default 2); a final result always counts;
- backchannels never interrupt: "aham", "uhum", "tá", "ok", "uh-huh", "mhm"… (a list for pt, en and es; replace it with `bargeIn: { ignore: [...] }`). They are not lost: each goes to `voice.decision` (`reason: 'backchannel'`, with the `messageId` being spoken and `at`, how many of its characters had been spoken) and to the backend on the next turn as `voice.reactions`, so it knows which part caught the user's attention. `reactions: false` keeps them out of the backend. H4B does not guess what they mean ("hum." and "hum?" are the same text);
- pressing to talk while the bot answers also interrupts;
- while the bot is still thinking (nothing shown yet), speech does not interrupt: when the turn ends, the kernel resumes the turn with both messages.

`bargeIn: false` turns this off and pauses recognition while the bot speaks, so the microphone does not hear it.

### Echo filter

With speakers, the bot's voice comes back through the microphone, and the recognizer transcribes it as if the user had spoken: the bot interrupts or answers itself. Browser echo cancellation does not always help, because it only removes sound it knows was played: speech from `speechSynthesis` comes out of the operating system, outside the browser's audio path. This happens even on good hardware (a laptop's speakers sit a few centimeters from its microphone).

So the voice plugin passes everything heard while the bot speaks, and for a moment after (`tail`), through an **echo filter** before barge-in and the turn see it. The default, `textEchoFilter()`, compares words, not audio, so it works with any recognizer, Web Speech included:

- a text is echo when at least `threshold` (default 0.6) of its words repeat what the bot said, in runs of at least `minRun` (default 2) consecutive words in the same order; case, accents and punctuation are ignored, and words of 4 letters or more may have one wrong letter;
- the decision is all or nothing: echo is dropped (`voice.decision` `{ kind: 'ignore', reason: 'echo' }`), anything else is kept whole, so a user who quotes the bot while talking over it is never cut short;
- a single word always passes: it cannot be told apart from the user saying the same word;
- the bot's sentences count while spoken and for `tail` ms after (default 2000), because recognizers deliver results late; after that the user may repeat the bot freely.

It is a replaceable piece, like the end-of-turn provider:

```ts
import { voice, textEchoFilter, type EchoFilter } from '@handsforbots/voice'

voice({ stt, tts, mode: 'hands-free' })                                    // textEchoFilter() by default
voice({ stt, tts, mode: 'hands-free', echo: textEchoFilter({ threshold: 0.5, tail: 1500 }) })
voice({ stt, tts, mode: 'hands-free', echo: false })                       // off (e.g. headphones only)

const mine: EchoFilter = {
  name: 'mine',
  tail: 2000,
  // speech: the sentences being spoken and those that ended within `tail`, oldest first
  filter: ({ text, final, speech, language }) => (looksLikeTheBot(text, speech) ? '' : text),
}
h4b.get('voice').setEcho(mine) // or null to turn it off
```

`filter` returns what the user said: the text itself, a shorter text, or `''` when it was all echo. It runs on every live transcript, so it must be synchronous and fast; if it throws, the error goes to `h4b.on('error')` (`source: 'voice:echo:<name>'`) and the text is kept. `getState().echo` names the filter in use.

### Speech output

Replies are spoken **sentence by sentence as they stream**, so the bot starts talking before the reply ends, and an interruption knows which sentences were heard. Output follows input (`output: 'auto'`): spoken replies after speech, text after typing.

### State for your UI

`voice.getState()` (subscribe with `voice.subscribe()`):

| Field | Meaning |
|---|---|
| `phase` | `idle`, `listening`, `userSpeaking`, `waitingEndOfTurn`, `botSpeaking` |
| `partial` | in hands-free, the whole pending turn plus the words being recognized |
| `pauseSince` | when the last words of the pending turn were heard (epoch ms); the pause starts here |
| `endOfTurnAt` | the latest moment the pending turn will be sent if the user stays quiet (epoch ms) |
| `endOfTurnCheckAt` | when the end-of-turn provider is asked (epoch ms); present only while it may still send the turn **before** `endOfTurnAt` |
| `interrupted` | the user cut the last reply; cleared when the next reply starts |
| `endOfTurn` | name of the end-of-turn provider in use |
| `listening`, `speaking`, `error`, `stt`, `tts`, `lastInput`, `output`, `mode` | as before |

The three times are timestamps, not time left, so your UI renders when they change, not on every tick. To draw the pause, start a CSS animation when `pauseSince` changes, lasting `endOfTurnAt - pauseSince` ms, with a negative delay of `pauseSince - Date.now()` ms: the pause usually began before the state arrived, so the line starts partly gone. Hide it when `endOfTurnAt` is `undefined` (the user talks again or the turn is sent). `endOfTurnAt` can move:

- **No provider**, or a recognizer that decides: it does not move; the turn goes out at `endOfTurnAt`.
- **With a provider**, while `endOfTurnCheckAt` is set: nobody knows yet what the provider will answer, and the turn may go out at any moment from `endOfTurnCheckAt` on. Show that the wait may end early (a quicker or dashed line, say) instead of promising the whole countdown.
- The provider answers "not finished": `endOfTurnCheckAt` is cleared and `endOfTurnAt` is now exact.
- The provider is slow or fails: `endOfTurnCheckAt` is cleared and `endOfTurnAt` moves earlier, to `pauseSince + silence`. Keep the start, change the duration.

Every interruption, ignored backchannel or echo and end of turn is reported on `h4b.on('voice.decision', d => …)`: `{ kind: 'interrupt' | 'ignore' | 'end-of-turn' | 'end-of-turn-unavailable', … }`. Log it while tuning.

### Privacy and echo

- Providers declare whether audio or text leaves the page (`remote`). `webSpeechSTT` counts as remote: browsers such as Chrome send the audio to their speech service, and in hands-free that is continuous. Remote end-of-turn providers send the transcript to your server and from there to whoever runs the model.
- Give a provider a `consent` purpose and it is used only while the purpose is granted ([Consent](./consent.md)); the plugin falls back to the next recognizer, or to silence. Showing the notice and storing the decision is your app's job.
- Recognizers that open the microphone (`httpSTT`, `websocketSTT`, `voskSTT`, `voskBrowserSTT`) use echo cancellation, noise suppression and automatic gain. Web Speech manages its own microphone; how well it ignores the bot's own voice depends on the device. The [echo filter](#echo-filter) covers what gets through. Test with and without headphones.
- Safari on iOS ends recognition sessions on its own; hands-free restarts them, but test long sessions on real devices.

### Tuning

| Symptom | Try |
|---|---|
| Cuts people mid-sentence | raise `silence`, or add an end-of-turn provider and raise `threshold` |
| Feels slow to answer | lower `silence`; with a provider, lower `minSilence` and check its latency |
| Bot interrupts itself | check that `voice.decision` shows `reason: 'echo'`; lower `echo.threshold` or raise `echo.tail`; headphones, a microphone recognizer with echo cancellation, a higher `minWords`, or `bargeIn: false` |
| User speech dropped as echo | raise `echo.threshold` or `minRun`, lower `tail`, or `echo: false` with headphones |
| "ok"/"yes" interrupt the bot | add them to `bargeIn.ignore` |
| Too many backend calls while thinking | keep `whileBusy` at `interrupt` or `merge` (resumption joins them) |
