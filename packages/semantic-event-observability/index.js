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
export { createMetricsRegistry, SEVO_METRICS, SEO_METRICS } from './core/MetricsRegistry.js'
export { createPhaseTracker } from './core/PhaseTracker.js'
export { createTurnMetricsCollector } from './core/TurnMetricsCollector.js'
export { createTraceMapper } from './core/TraceMapper.js'
export { definePhaseModel } from './core/definePhaseModel.js'
export { defineTurnModel, default as TurnModel } from './core/TurnModel.js'
export { createTraceContextBridge } from './core/TraceContextBridge.js'
export { createEventInstrumentation } from './core/eventInstrumentation.js'
export { createSessionTracker } from './core/SessionTracker.js'
export { buildTurnRootSpan, normalizeTurnRootSpanConfig } from './core/turnSpanNaming.js'
export { bucketEventName } from './core/bucketEventName.js'
export { isErrorEvent } from './core/isErrorEvent.js'

export { instrumentEventBus, createInstrumentedBus } from './adapters/genericEventBus.js'
export { instrumentChannel } from './adapters/instrumentChannel.js'
export {
	attachHandsForBotsObservability,
	getHandsForBotsState,
	HFB_TURN_START_EVENTS,
	HFB_TURN_END_EVENTS,
	HFB_PHASE_MODEL,
	HFB_SEMANTIC_EVENTS,
} from './adapters/handsforbots.js'

export { BUILTIN_EXPORTERS, createExporters, initExporters } from './exporters/index.js'
