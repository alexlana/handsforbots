import { createH4B } from '@handsforbots/core'
import { keyboard } from '@handsforbots/keyboard'
import { observability } from '@handsforbots/observability'
import { storageLocal } from '@handsforbots/storage-local'
import { tabSync } from '@handsforbots/tab-sync'
import { rasa } from '@handsforbots/transport-rasa'
import { voice, webSpeechSTT, webSpeechTTS } from '@handsforbots/voice'
import { widget } from '@handsforbots/widget'
import { maybeInitObservabilityStack } from './observability-stack.js'

const stack = await maybeInitObservabilityStack()
const stackEnabled = Boolean(stack)

const h4b = createH4B({
  plugins: [
    // Rasa REST channel behind nginx (see ../nginx). The H4B thread id is the Rasa sender.
    rasa({ url: 'http://localhost/rasa/webhooks/rest/webhook' }),

    widget({
      layout: 'floating',
      startOpen: true,
      language: 'pt-br',
      color: 'blue',
      botName: 'GUI Assistant',
      botJob: 'Assistant',
      avatar: './img/bot.png',
      title: 'Talk to me!',
    }),

    // Browser speech; swap or chain cloud providers (httpSTT, websocketSTT, voskSTT) here.
    voice({ stt: webSpeechSTT(), tts: webSpeechTTS({ voice: 'Luciana' }), language: 'pt-BR' }),
    keyboard(), // hold Alt+M to talk, Esc to interrupt

    storageLocal({ ttlMinutes: 30 }), // conversation survives navigation, as in v1
    tabSync(), // and stays in sync across tabs

    observability({
      environment: stackEnabled ? 'development-lgtm' : 'development',
      sampleRate: 1,
      exporters: stackEnabled
        ? ['memory', 'console', 'devPanel', 'faro', 'otel', 'webVitals']
        : ['memory', 'console', 'devPanel'],
      exporterConfig: {
        console: { level: 'debug' },
        devPanel: { enabled: false },
        faro: stack?.faro ? { client: stack.faro } : {},
        otel: stack ? { getTracer: stack.getTracer, getMeter: stack.getMeter, traceApi: stack.traceApi } : {},
        webVitals: stackEnabled ? { vitals: stack?.webVitals, labels: { environment: 'development-lgtm' } } : {},
      },
    }),
  ],
})

await h4b.start()

// Poke (v1): the page can start turns or add context at any time, e.g.
//   h4b.signal({ modality: 'gui-event', source: 'page', parts: [{ type: 'text', text: '/greet' }] })
if (import.meta.env.DEV) window.h4b = h4b
