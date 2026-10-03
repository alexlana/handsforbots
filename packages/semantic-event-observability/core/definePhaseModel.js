/**
 * Normalize phase configuration for TurnMetricsCollector and trace exporters.
 *
 * @param {Array<{ id: string, startEvent: string, endEvent: string }>} phases
 */
export function definePhaseModel(phases = []) {
	return phases
		.filter((phase) => phase?.id && phase?.startEvent && phase?.endEvent)
		.map((phase) => ({
			id: String(phase.id),
			startEvent: String(phase.startEvent),
			endEvent: String(phase.endEvent),
		}))
}
