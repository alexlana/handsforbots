import { createPhaseTracker } from './PhaseTracker.js'

/**
 * @deprecated Use createPhaseTracker — kept for backwards compatibility.
 */
export function createTurnMetricsCollector(options = {}) {
	return createPhaseTracker({
		phases: options.phases,
		isError: options.isError,
		onPhaseStart: () => {},
		onPhaseEnd: ({ phase, durationMs, labels }) => {
			options.onPhaseDuration?.(phase, durationMs, labels)
		},
		onRenderDuration: options.onRenderDuration,
		onTurnStatus: options.onTurnStatus,
	})
}

export { createPhaseTracker }
