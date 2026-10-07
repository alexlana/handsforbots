import type { ConsentPurposeRule, ConsentRules, ConsentState } from '@handsforbots/core'

/*
 * Starting points, not legal advice: review them with whoever answers for
 * privacy where you operate. The same rule sets are in `rules/*.json`, to copy
 * and edit (as JSON or YAML) and load with `loadConsentRules`.
 */

const purposes = (state: ConsentState): Record<string, ConsentPurposeRule> => ({
  persistence: {
    default: state,
    label: { en: 'Keep this conversation', 'pt-BR': 'Guardar esta conversa' },
    description: {
      en: 'Keep the conversation so it survives reloads and later visits.',
      'pt-BR': 'Guardar a conversa para que ela continue depois de recarregar a página ou voltar ao site.',
    },
  },
  review: {
    default: state,
    label: { en: 'Human review', 'pt-BR': 'Revisão por pessoas' },
    description: {
      en: 'Keep the conversation, with contacts and documents anonymized, so our team can review it to improve the service.',
      'pt-BR': 'Guardar a conversa, com contatos e documentos anonimizados, para que a nossa equipe a revise e melhore o atendimento.',
    },
  },
  analytics: {
    default: state,
    label: { en: 'Usage metrics', 'pt-BR': 'Métricas de uso' },
    description: { en: 'Measure how the assistant is used.', 'pt-BR': 'Medir como o assistente é usado.' },
  },
})

/** Brazil (LGPD): opt-in for every purpose. */
export const lgpd: ConsentRules = {
  id: 'lgpd',
  label: { en: 'LGPD (Brazil)', 'pt-BR': 'LGPD (Brasil)' },
  regions: ['BR'],
  purposes: purposes('pending'),
}

/** European Economic Area, Switzerland and the United Kingdom (GDPR / ePrivacy): opt-in for every purpose. */
export const gdpr: ConsentRules = {
  id: 'gdpr',
  label: 'GDPR',
  // EU 27 + Iceland, Liechtenstein, Norway + Switzerland and the UK.
  regions: [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU',
    'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'CH', 'GB',
  ],
  purposes: purposes('pending'),
}

/** California (CCPA/CPRA): allowed until the person opts out. */
export const ccpa: ConsentRules = {
  id: 'ccpa',
  label: 'CCPA (California)',
  regions: ['US-CA'],
  purposes: purposes('granted'),
}

/** Anywhere else: opt-in for every purpose. Put it last as the fallback. */
export const optIn: ConsentRules = {
  id: 'opt-in',
  label: { en: 'Ask first', 'pt-BR': 'Perguntar antes' },
  regions: ['*'],
  purposes: purposes('pending'),
}

/** LGPD, GDPR, CCPA and the opt-in fallback, in the order `selectConsentRules` expects. */
export const presets: ConsentRules[] = [lgpd, gdpr, ccpa, optIn]
