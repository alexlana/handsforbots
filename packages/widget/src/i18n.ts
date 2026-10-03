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
  },
  pt,
  'pt-br': pt,
  'pt-pt': { ...pt, placeholder: 'Escreva aqui a sua mensagem' },
}

export function stringsFor(language: string | undefined, overrides: Partial<Strings> = {}): Strings {
  const lang = (language ?? 'en').toLowerCase()
  return { ...(STRINGS[lang] ?? STRINGS[lang.split('-')[0]!] ?? STRINGS.en!), ...overrides }
}
