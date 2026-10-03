import { createH4B } from '@handsforbots/core'
import { guided } from '@handsforbots/guided'
import { keyboard } from '@handsforbots/keyboard'
import { rasa } from '@handsforbots/transport-rasa'
import { voice, webSpeechSTT, webSpeechTTS } from '@handsforbots/voice'
import { widget } from '@handsforbots/widget'

/**
 * Guided tour demo. The tour is an action: the user can start it from the chat
 * ("show me around"), Rasa can call it (utter_please_explain sends
 * custom.h4b.action guided_tour), and so can any assistant or browser agent.
 */
const tours = {
  intro: [
    { title: 'Welcome to the guided tutorial', text: 'This is the app interface. We want you to know all you can do here!', next: "Let's start!" },
    { title: 'Save your work', text: 'This button is to save your work, but it is fake. Do not forget to save!', target: '#save_button' },
    { title: 'Open old work', text: 'And this button is a fake button to open your old or in progress work that not exists.', target: '#open_button' },
    { title: 'Ask me', text: 'If you have questions, ask me for more information.', target: '#chat_input' },
    { title: 'Ask me', text: 'You can ask using your own voice too.', target: '#speech_button' },
    { title: "That's all!", text: "Ok! That's all, folks!", close: 'Understood!' },
  ],
}

const h4b = createH4B({
  plugins: [
    rasa({ url: 'http://localhost/rasa/webhooks/rest/webhook' }),
    widget({
      layout: 'floating',
      startOpen: true,
      language: 'en-US',
      color: 'blue',
      botName: 'GUI Assistant',
      botJob: 'Assistant',
      avatar: './img/bot.png',
      title: 'Talk to me!',
      greeting:
        'Hi! I can guide you through this screen. Ask me to **explain the app**, or say "show me around".',
    }),
    voice({ stt: webSpeechSTT(), tts: webSpeechTTS({ voice: 'Zarvox' }), language: 'en-US' }),
    keyboard(),
    guided({ tours, language: 'en-US' }),
  ],
})

await h4b.start()

// Buttons in the page can start the tour too (a direct action, recorded in history).
document.querySelector('#tour_button')?.addEventListener('click', () => h4b.runAction('guided_tour', { name: 'intro' }))

if (import.meta.env.DEV) window.h4b = h4b
