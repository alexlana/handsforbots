import { createH4B } from '@handsforbots/core'
import { webmcp } from '@handsforbots/expose-webmcp'
import { keyboard } from '@handsforbots/keyboard'
import { menu } from '@handsforbots/menu'
import { H4BProvider } from '@handsforbots/react'
import { agui } from '@handsforbots/transport-agui'
import { voice, webSpeechSTT, webSpeechTTS } from '@handsforbots/voice'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { commands } from './commands'
import './styles.css'

const h4b = createH4B({
  plugins: [
    agui({ url: '/api/agent' }),
    menu({ commands, language: 'pt-br' }),
    // Browser speech here; swap or chain cloud providers (httpSTT, websocketSTT, voskSTT) without touching the UI.
    voice({ stt: webSpeechSTT(), tts: webSpeechTTS(), language: 'pt-BR' }),
    keyboard(), // hold Alt+M to talk, Esc to interrupt
    webmcp(), // browser agents (Chrome WebMCP) get the actions marked exposeTo: ['agent']
  ],
})

// Destructive actions ask the user, whoever requested them (assistant, menu or external agent).
h4b.provide('confirm', async ({ description, args, origin }) =>
  window.confirm(`${description}\n${JSON.stringify(args)}\n\nSolicitado por: ${origin}. Confirmar?`),
)

await h4b.start()
if (import.meta.env.DEV) Object.assign(window, { h4b })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <H4BProvider value={h4b}>
      <App />
    </H4BProvider>
  </StrictMode>,
)
