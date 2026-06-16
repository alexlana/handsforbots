export type PackageIdentity = {
	slug: string
	displayName: string
	packageName: string
	version: string
	globalKey: string
	debugStorageKey: string
	sessionStorageKey: string
	otelServiceName: string
	grafanaDashboardUid: string
}

export type TurnModelConfig = {
	startEvents?: string[]
	endEvents?: string[]
	start?: string[]
	end?: string[]
}

export type PhaseDefinition = {
	id: string
	startEvent: string
	endEvent: string
}

export type PhaseModel = PhaseDefinition[]

export type SemanticEvent = {
	id?: string
	type: string
	name: string
	timestamp?: string
	environment?: string
	sessionId?: string
	turnId?: string | null
	traceId?: string | null
	phase?: string
	source?: string
	durationMs?: number
	payload?: unknown
	payloadSummary?: unknown
	state?: Record<string, unknown>
	turnMetadata?: Record<string, unknown>
}

export type MetricRecord = {
	name: string
	type: 'histogram' | 'counter' | 'gauge'
	value: number
	labels?: Record<string, string | number | boolean>
	timestamp?: string
}

export type ExporterContext = {
	identity: PackageIdentity
	buffer: unknown
	phases: PhaseModel
	metricsRegistry: MetricsRegistry
	isError: (event: SemanticEvent) => boolean
	traceContextBridge?: TraceContextBridge
	getTimeline: (limit?: number) => SemanticEvent[]
	getMetrics: (limit?: number) => MetricRecord[]
	getPolicyStats: () => PolicyStats
}

export type Exporter = {
	id: string
	available?: boolean
	description?: string
	init?: (context: ExporterContext) => void | Promise<void>
	onEvent?: (event: SemanticEvent) => void
	onMetric?: (metric: MetricRecord) => void
	onPhaseEnd?: (event: SemanticEvent) => void
	destroy?: () => void
}

export type ExporterStatus = {
	id: string
	available: boolean
	description?: string
	error?: string
}

export type PolicyStats = {
	emitted: number
	dropped: number
	dropsByReason: Record<string, number>
}

export type TraceContextBridge = {
	setHeaderInjector: (fn: (() => Record<string, string>) | null) => void
	getTraceHeaders: () => Record<string, string>
	withTraceContext: (input: string | Request, init?: RequestInit) => RequestInit | Request
	withFetch: (input: string | Request, init?: RequestInit) => Promise<Response>
}

export type MetricsRegistry = {
	SEVO_METRICS: typeof SEVO_METRICS
	subscribe: (listener: (metric: MetricRecord) => void) => () => void
	recordTurnDuration: (durationMs: number, labels?: Record<string, string>) => MetricRecord | void
	recordPhaseDuration: (phase: string, durationMs: number, labels?: Record<string, string>) => MetricRecord | void
	recordTurnStatus: (status: string, labels?: Record<string, string>) => MetricRecord | void
	recordEventDropped: (reason: string) => MetricRecord | void
	recordStateGauge: (key: string, value: number, labels?: Record<string, string>) => MetricRecord | void
	recordEventEmitted: (eventType: string, labels?: Record<string, string>) => MetricRecord | void
	recordExporterError: (exporterId: string) => MetricRecord | void
	recordActiveTurns: (count: number) => MetricRecord | void
	recordSessionTurnsRollup: (
		counts: { completed?: number; abandoned?: number },
		labels?: Record<string, string>,
	) => MetricRecord[] | void
	recordWebVital: (name: string, value: number, labels?: Record<string, string>) => MetricRecord | void
}

export const SEVO_METRICS: {
	readonly TURN_DURATION: 'sevo_turn_duration_ms'
	readonly PHASE_DURATION: 'sevo_phase_duration_ms'
	readonly TURNS_TOTAL: 'sevo_turns_total'
	readonly EVENTS_DROPPED: 'sevo_events_dropped_total'
	readonly STATE_GAUGE: 'sevo_state_gauge'
	readonly EVENTS_EMITTED: 'sevo_events_emitted_total'
	readonly EXPORTER_ERRORS: 'sevo_exporter_errors_total'
	readonly ACTIVE_TURNS: 'sevo_active_turns'
	readonly SESSION_TURNS_TOTAL: 'sevo_session_turns_total'
	readonly WEB_VITAL: 'sevo_web_vital'
}

/** @deprecated Use SEVO_METRICS */
export const SEO_METRICS: typeof SEVO_METRICS

export type TurnRootSpanConfig =
	| 'semantic'
	| 'invoke_agent'
	| boolean
	| {
		mode?: 'semantic' | 'invoke_agent'
		agentName?: string | ((event: SemanticEvent) => string | undefined)
		providerName?: string
		kind?: 'internal' | 'client' | 'server' | number
	}

export type CreateObservabilityOptions = {
	enabled?: boolean
	environment?: string
	sampleRate?: number
	maxEventsPerMinute?: number
	maxPayloadBytes?: number
	denylist?: string[]
	sessionId?: string
	turn?: TurnModelConfig
	turnStartEvents?: string[]
	turnEndEvents?: string[]
	phases?: PhaseModel | PhaseDefinition[]
	isError?: (event: SemanticEvent) => boolean
	eventFilter?: (eventName: string) => boolean
	eventAllowlist?: string[]
	exporters?: string[]
	customExporters?: Exporter[]
	exporterConfig?: Record<string, unknown>
	turnRootSpan?: TurnRootSpanConfig
	sessionEndEvents?: string[]
	bufferSize?: number
	identity?: Partial<PackageIdentity>
}

export type Observability = {
	identity: PackageIdentity
	policy: unknown
	correlation: unknown
	buffer: unknown
	metricsRegistry: MetricsRegistry
	phases: PhaseModel
	isError: (event: SemanticEvent) => boolean
	eventInstrumentation: { shouldRecord: (eventName: string) => boolean }
	traceContext: TraceContextBridge
	phaseTracker: unknown
	exporters: Exporter[]
	stateProvider?: () => Record<string, unknown>
	init: () => Promise<ExporterStatus[]>
	instrument: (bus: EventBus, options?: InstrumentOptions) => EventBus
	record: (name: string, payload?: unknown, meta?: { type?: string }) => void
	recordMetric: (name: string, value: number, labels?: Record<string, string>) => void
	startPhase: (phaseId: string, labels?: Record<string, string>) => boolean
	endPhase: (phaseId: string, labels?: Record<string, string>) => boolean
	getTraceHeaders: () => Record<string, string>
	withTraceContext: TraceContextBridge['withTraceContext']
	withFetch: TraceContextBridge['withFetch']
	registerExporter: (exporter: Exporter) => Promise<ExporterStatus>
	endSession: (reason?: string) => { completed: number; abandoned: number }
	getTimeline: (limit?: number) => SemanticEvent[]
	getMetrics: (limit?: number) => MetricRecord[]
	getPolicyStats: () => PolicyStats
	getExporterStatus: () => ExporterStatus[]
	destroy: () => void
}

export type EventBus = {
	on: (name: string | string[], callback: (...args: unknown[]) => void) => void
	trigger: (name: string, args?: unknown) => unknown
}

export type InstrumentOptions = {
	stateProvider?: () => Record<string, unknown>
	wrapListeners?: boolean
}

export const PACKAGE_SLUG: 'semantic-event-observability'
export const PACKAGE_DISPLAY_NAME: 'Semantic Event Observability'
export const PACKAGE_SCOPE: '@handsforbots'
export const PACKAGE_NAME: '@handsforbots/semantic-event-observability'
export const PACKAGE_VERSION: string

export function getPackageIdentity(overrides?: Partial<PackageIdentity>): PackageIdentity
export function createObservability(options?: CreateObservabilityOptions): Observability
export function defineTurnModel(model?: TurnModelConfig): TurnModelConfig
export function definePhaseModel(phases?: PhaseDefinition[]): PhaseModel
export function isErrorEvent(event: SemanticEvent): boolean
export function createMetricsRegistry(options?: { environment?: string }): MetricsRegistry
export function createPhaseTracker(options?: Record<string, unknown>): unknown
export function createTurnMetricsCollector(options?: Record<string, unknown>): unknown
export function createTraceMapper(options?: Record<string, unknown>): unknown
export function createTraceContextBridge(options?: {
	getContext?: () => { traceId?: string | null }
}): TraceContextBridge
export function buildTurnRootSpan(
	event: SemanticEvent,
	config?: TurnRootSpanConfig,
): { name: string; attributes: Record<string, unknown>; kind?: string | number }
export function normalizeTurnRootSpanConfig(config?: TurnRootSpanConfig): {
	mode: 'semantic' | 'invoke_agent'
	agentName?: string | ((event: SemanticEvent) => string | undefined)
	providerName?: string
	kind?: string | number
}
export function createSessionTracker(): {
	recordTurn: (status: string) => void
	getCounts: () => { completed: number; abandoned: number }
	reset: () => void
}
export function createEventInstrumentation(options?: {
	eventFilter?: (eventName: string) => boolean
	eventAllowlist?: string[]
}): { shouldRecord: (eventName: string) => boolean }
export function instrumentEventBus(
	observability: Observability,
	bus: EventBus,
	options?: InstrumentOptions,
): EventBus
export function createInstrumentedBus(
	bus: EventBus,
	options: {
		createObservability: typeof createObservability
		observability?: CreateObservabilityOptions
		instrument?: InstrumentOptions
	},
): { observability: Observability; bus: EventBus }
export function instrumentChannel(
	observability: Observability,
	channel: { postMessage: (data: unknown, transfer?: unknown[]) => void },
	options?: { eventName?: string; type?: string },
): typeof channel
export function attachHandsForBotsObservability(
	bot: {
		eventEmitter: EventBus
		observability?: Observability
		bc?: unknown
		options?: { environment?: string }
		orchestrator?: unknown
		redirectInput?: unknown
	},
	options?: Record<string, unknown>,
): Observability | null
export function getHandsForBotsState(bot: unknown): Record<string, unknown>
export const HFB_TURN_START_EVENTS: string[]
export const HFB_TURN_END_EVENTS: string[]
export const HFB_PHASE_MODEL: PhaseModel
export const HFB_SEMANTIC_EVENTS: string[]
export const BUILTIN_EXPORTERS: Record<string, (config?: Record<string, unknown>) => Exporter>
export function createExporters(
	requested?: string[],
	config?: Record<string, Record<string, unknown>>,
): Promise<Exporter[]>
export function initExporters(
	exporters: Exporter[],
	context: ExporterContext,
): Promise<ExporterStatus[]>

export { default as CorrelationContext } from './core/CorrelationContext.js'
export { default as Policy } from './core/Policy.js'
export { default as EventBuffer } from './core/EventBuffer.js'
export { default as TurnModel } from './core/TurnModel.js'
export { sevoAttributes, sevoMetricLabelAttributes } from './core/telemetryAttributes.js'
