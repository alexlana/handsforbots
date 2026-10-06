export type Strings = {
  title: string
  botName: string
  placeholder: string
  send: string
  open: string
  close: string
  received: string
  acting: string
  done: string
  error: string
  aborted: string
  directAction: string
  assistantAction: string
  agentAction: string
  holdToTalk: string
  listening: string
  handsFree: string
  stopSpeaking: string
  voiceOn: string
  voiceOff: string
  disclaimer: string
  attach: string
  camera: string
  capture: string
  cancel: string
  privacy: string
  storedInBrowser: string
  storedEncrypted: string
  storedOnServer: string
  /** `{minutes}` is replaced. */
  retentionKey: string
  retentionKeyBrowser: string
  retentionServer: string
  /** `{minutes}` is replaced. */
  retentionTtl: string
  retentionTab: string
  deleteConversation: string
}

const pt: Strings = {
  title: 'Fale com a gente!',
  botName: 'O robô',
  placeholder: 'Digite aqui sua mensagem',
  send: 'Enviar',
  open: 'Abrir conversa',
  close: 'Fechar',
  received: 'Recebido…',
  acting: 'Trabalhando…',
  done: 'Pronto',
  error: 'Algo deu errado',
  aborted: 'Cancelado',
  directAction: '⚡ ação direta',
  assistantAction: '🤖 executou',
  agentAction: '🌐 agente externo executou',
  holdToTalk: 'Segure para falar',
  listening: 'Ouvindo…',
  handsFree: 'Microfone mãos-livres',
  stopSpeaking: 'Parar fala',
  voiceOn: 'Respostas faladas',
  voiceOff: 'Respostas só em texto',
  disclaimer: 'Isenção de responsabilidade',
  attach: 'Anexar arquivo',
  camera: 'Câmera',
  capture: 'Capturar',
  cancel: 'Cancelar',
  privacy: 'Privacidade da conversa',
  storedInBrowser: 'A conversa fica guardada neste navegador.',
  storedEncrypted: 'A conversa fica guardada neste navegador, criptografada.',
  storedOnServer: 'A conversa fica guardada no servidor do site.',
  retentionKey: 'Até {minutes} min sem uso',
  retentionKeyBrowser: 'Até fechar o navegador',
  retentionServer: 'Pelo prazo definido pelo site',
  retentionTtl: 'Apagar após {minutes} min sem uso',
  retentionTab: 'Apagar ao fechar esta aba',
  deleteConversation: 'Apagar a conversa agora',
}

export const STRINGS: Record<string, Strings> = {
  en: {
    title: 'Come and chat!',
    botName: 'The bot',
    placeholder: 'Type your message here',
    send: 'Send',
    open: 'Open chat',
    close: 'Close',
    received: 'Received…',
    acting: 'Working…',
    done: 'Done',
    error: 'Something went wrong',
    aborted: 'Cancelled',
    directAction: '⚡ direct action',
    assistantAction: '🤖 ran',
    agentAction: '🌐 external agent ran',
    holdToTalk: 'Hold to talk',
    listening: 'Listening…',
    handsFree: 'Hands-free microphone',
    stopSpeaking: 'Stop speaking',
    voiceOn: 'Spoken answers',
    voiceOff: 'Text-only answers',
    disclaimer: 'Disclaimer',
    attach: 'Attach file',
    camera: 'Camera',
    capture: 'Capture',
    cancel: 'Cancel',
    privacy: 'Conversation privacy',
    storedInBrowser: 'The conversation is kept in this browser.',
    storedEncrypted: 'The conversation is kept in this browser, encrypted.',
    storedOnServer: "The conversation is kept on the site's server.",
    retentionKey: 'Until {minutes} min without use',
    retentionKeyBrowser: 'Until the browser closes',
    retentionServer: 'For as long as the site decides',
    retentionTtl: 'Delete after {minutes} min without use',
    retentionTab: 'Delete when this tab closes',
    deleteConversation: 'Delete the conversation now',
  },
  pt,
  'pt-br': pt,
  'pt-pt': { ...pt, placeholder: 'Escreva aqui a sua mensagem' },
}

export function stringsFor(language: string | undefined, overrides: Partial<Strings> = {}): Strings {
  const lang = (language ?? 'en').toLowerCase()
  return { ...(STRINGS[lang] ?? STRINGS[lang.split('-')[0]!] ?? STRINGS.en!), ...overrides }
}
