export { createH4B, H4B, type H4BOptions, type H4BSnapshot } from './kernel.js'
export {
  definePlugin,
  PluginContext,
  API_VERSION,
  type Plugin,
  type PluginDefinition,
  type PluginFactory,
  withConsent,
} from './plugin.js'
export {
  consentText,
  parseConsentRules,
  selectConsentRules,
  type ConsentControl,
  type ConsentDecision,
  type ConsentOptions,
  type ConsentPurposeRule,
  type ConsentRules,
  type ConsentSnapshot,
  type ConsentState,
  type ConsentText,
} from './consent.js'
export { ActionRegistry, ActionError } from './actions.js'
export { Conversation } from './conversation.js'
export { EventBus, type Listener } from './events.js'
export { createId } from './id.js'
export { applyPatch } from './patch.js'
export { toJsonSchema, validate, ValidationError, type StandardSchemaV1 } from './standard-schema.js'
export type {
  ActionInvocation,
  Events,
  Hooks,
  Interceptor,
  Services,
  TurnPhase,
  TurnResult,
  TurnStatus,
} from './registry.js'
export * from './types.js'
export { sameRetention, storableSnapshot, textOf } from './util.js'
