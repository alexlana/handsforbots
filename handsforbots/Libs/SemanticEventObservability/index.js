export {
	PACKAGE_SLUG,
	PACKAGE_DISPLAY_NAME,
	PACKAGE_NAME,
	PACKAGE_SCOPE,
	PACKAGE_VERSION,
	getPackageIdentity,
} from './packageIdentity.js'

export { createObservability } from './core/createObservability.js'
export { default as CorrelationContext } from './core/CorrelationContext.js'
export { default as Policy } from './core/Policy.js'
export { default as EventBuffer } from './core/EventBuffer.js'
export { createMetricsRegistry, SEO_METRICS } from './core/MetricsRegistry.js'
export { createTurnMetricsCollector } from './core/TurnMetricsCollector.js'
export { definePhaseModel } from './core/definePhaseModel.js'
export { isErrorEvent } from './core/isErrorEvent.js'

export { instrumentEventBus, createInstrumentedBus } from './adapters/genericEventBus.js'
export {
	attachHandsForBotsObservability,
	getHandsForBotsState,
	HFB_TURN_START_EVENTS,
	HFB_TURN_END_EVENTS,
	HFB_PHASE_MODEL,
	HFB_SEMANTIC_EVENTS,
} from './adapters/handsforbots.js'

export { BUILTIN_EXPORTERS, createExporters, initExporters } from './exporters/index.js'
